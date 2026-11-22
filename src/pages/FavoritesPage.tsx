import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LogIn, Search, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { LoadMoreSentinel } from '../components/LoadMoreSentinel';
import { TopicRow } from '../components/TopicRow';
import { useToast } from '../components/Toast';
import { useAuth } from '../state/auth';
import { useRouter } from '../state/router';
import { useSettings } from '../state/settings';
import { getViewCache, setViewCache, useScrollMemory } from '../state/viewCache';
import type { TopicObj } from '../types/smth';
import { extractFavBoards, type CloudFavBoardEntry } from '../utils/favorites';

interface FavTopicRow {
  topicWrapper?: TopicObj;
  hasNewReply?: boolean;
}

interface FavCache {
  tab: 'boards' | 'topics';
  filterText: string;
  cloudBoards: CloudFavBoardEntry[];
  favTopics: FavTopicRow[];
  topicStart: number;
  topicTotal: number;
}

const FAV_CACHE_KEY = 'favorites';

export function FavoritesPage() {
  const { status, openLoginDialog } = useAuth();
  const { navigate, navigationType } = useRouter();
  const { localData, toggleLocalFavBoard, recordBoardHistory } = useSettings();
  const { showToast } = useToast();

  const initialCache = useRef(
    navigationType === 'pop' ? getViewCache<FavCache>(FAV_CACHE_KEY) : undefined,
  );
  const restored = Boolean(initialCache.current);
  const skipFirstFetchRef = useRef(restored);

  const [tab, setTab] = useState<'boards' | 'topics'>(
    () => initialCache.current?.state.tab ?? 'boards',
  );
  const [filterText, setFilterText] = useState(() => initialCache.current?.state.filterText ?? '');
  const [cloudBoards, setCloudBoards] = useState<CloudFavBoardEntry[]>(
    () => initialCache.current?.state.cloudBoards ?? [],
  );
  const [favTopics, setFavTopics] = useState<FavTopicRow[]>(
    () => initialCache.current?.state.favTopics ?? [],
  );
  const [topicStart, setTopicStart] = useState(() => initialCache.current?.state.topicStart ?? 0);
  const [topicTotal, setTopicTotal] = useState(() => initialCache.current?.state.topicTotal ?? 0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingMoreRef = useRef(false);

  useScrollMemory(FAV_CACHE_KEY, restored, !loading);

  useEffect(() => {
    if (loading) return;
    setViewCache<FavCache>(FAV_CACHE_KEY, {
      tab,
      filterText,
      cloudBoards,
      favTopics,
      topicStart,
      topicTotal,
    });
  }, [loading, tab, filterText, cloudBoards, favTopics, topicStart, topicTotal]);

  const loadCloud = useCallback(async () => {
    if (!status?.loggedIn) {
      setCloudBoards([]);
      setFavTopics([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (tab === 'boards') {
        const res = await api.getCloudFavBoards();
        setCloudBoards(extractFavBoards(res));
      } else {
        const res = await api.getCloudFavTopics(0, 20);
        const list = res.favTopic || [];
        setFavTopics(list);
        setTopicStart(list.length);
        setTopicTotal(res.pager?.totalItems || res.pager?.items || list.length);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载收藏失败');
    } finally {
      setLoading(false);
    }
  }, [status?.loggedIn, tab]);

  useEffect(() => {
    if (skipFirstFetchRef.current) {
      skipFirstFetchRef.current = false;
      return;
    }
    void loadCloud();
  }, [loadCloud]);

  const loadMoreTopics = useCallback(async () => {
    if (loadingMoreRef.current || topicStart >= topicTotal) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const res = await api.getCloudFavTopics(topicStart, 20);
      const batch = res.favTopic || [];
      setFavTopics((prev) => {
        const seen = new Set(prev.map((x) => x.topicWrapper?.id));
        return [...prev, ...batch.filter((x) => x.topicWrapper?.id && !seen.has(x.topicWrapper.id))];
      });
      setTopicStart((s) => s + batch.length);
      if (batch.length === 0) setTopicTotal(topicStart);
    } catch {
      // ignore transient error
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [topicStart, topicTotal]);

  const openBoard = (id: string, name: string, title: string) => {
    recordBoardHistory({ id, name, title });
    navigate({ name: 'board', boardId: id, boardName: name, boardTitle: title });
  };

  const filteredCloudBoards = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return cloudBoards;
    return cloudBoards.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.title || '').toLowerCase().includes(q) ||
        (b.folderName || '').toLowerCase().includes(q),
    );
  }, [cloudBoards, filterText]);

  return (
    <div>
      <div className="subtabs">
        <button
          type="button"
          className={`subtab ${tab === 'boards' ? 'active' : ''}`}
          onClick={() => setTab('boards')}
        >
          收藏版面{cloudBoards.length > 0 ? ` (${cloudBoards.length})` : ''}
        </button>
        <button
          type="button"
          className={`subtab ${tab === 'topics' ? 'active' : ''}`}
          onClick={() => setTab('topics')}
        >
          云端收藏帖
        </button>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      {tab === 'boards' ? (
        <div>
          {cloudBoards.length > 10 ? (
            <div className="inline-search" style={{ marginTop: 12 }}>
              <Search size={14} />
              <input
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="快速筛选我的收藏版面..."
              />
            </div>
          ) : null}

          {status?.loggedIn ? (
            <>
              <div className="section-heading">
                水木云端收藏 ({filteredCloudBoards.length}
                {filterText.trim() ? ` / ${cloudBoards.length}` : ''})
              </div>
              {loading ? (
                <div className="empty-state">加载云端收藏中...</div>
              ) : filteredCloudBoards.length === 0 ? (
                <div className="empty-state" style={{ padding: 24 }}>
                  {cloudBoards.length > 0
                    ? '未匹配到该版面'
                    : '云端暂无收藏版面，进入任意版面点击右上角星标即可收藏'}
                </div>
              ) : (
                <div className="board-grid">
                  {filteredCloudBoards.map((b) => (
                    <div key={b.id} className="board-card" style={{ position: 'relative' }}>
                      <button
                        type="button"
                        style={{ textAlign: 'left', paddingRight: 26, width: '100%' }}
                        onClick={() => openBoard(b.id, b.name, b.title || b.name)}
                      >
                        <div className="board-card-title">{b.title || b.name}</div>
                        <div className="board-card-name">
                          {b.name}
                          {b.todayPostCount ? ` · 今日 ${b.todayPostCount}` : ''}
                        </div>
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        style={{ position: 'absolute', top: 6, right: 4, minWidth: 28, height: 28 }}
                        title="取消云端收藏"
                        aria-label={`取消收藏 ${b.title || b.name}`}
                        onClick={async () => {
                          try {
                            await api.removeCloudFavBoard(b.id, b.dirId);
                            setCloudBoards((prev) => prev.filter((item) => item.id !== b.id));
                            showToast(`已取消云端收藏 ${b.title || b.name}`);
                          } catch (err) {
                            showToast(err instanceof Error ? err.message : '操作失败');
                          }
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="setting-row" style={{ marginTop: 10 }}>
              <div className="setting-info">
                <div className="setting-name">同步水木云端收藏夹</div>
                <div className="setting-desc">登录后自动同步你的水木账号收藏版面与帖子</div>
              </div>
              <button type="button" className="chip-btn primary" onClick={openLoginDialog}>
                <LogIn size={14} />
                登录
              </button>
            </div>
          )}

          <div className="section-heading">本机置顶版面 ({localData.localFavBoards.length})</div>
          {localData.localFavBoards.length === 0 ? (
            <div className="empty-state" style={{ padding: 24 }}>
              本机暂无收藏版面（即使未登录也可在任意版面点星标收藏到本机）
            </div>
          ) : (
            <div className="board-grid">
              {localData.localFavBoards.map((b) => (
                <div key={b.id} className="board-card" style={{ position: 'relative' }}>
                  <button
                    type="button"
                    style={{ textAlign: 'left', paddingRight: 26, width: '100%' }}
                    onClick={() => openBoard(b.id, b.name, b.title)}
                  >
                    <div className="board-card-title">{b.title}</div>
                    <div className="board-card-name">{b.name}</div>
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ position: 'absolute', top: 6, right: 4, minWidth: 28, height: 28 }}
                    title="移出本机收藏"
                    aria-label={`移出 ${b.title}`}
                    onClick={() => void toggleLocalFavBoard(b)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : !status?.loggedIn ? (
        <div className="empty-state">
          <p>云端帖子收藏需要登录水木账号</p>
          <button type="button" className="btn btn-primary" onClick={openLoginDialog}>
            <LogIn size={15} />
            立即登录
          </button>
        </div>
      ) : loading ? (
        <div className="empty-state">加载中...</div>
      ) : favTopics.length === 0 ? (
        <div className="empty-state">暂无云端收藏帖</div>
      ) : (
        <>
          <ul className="feed-list compact-sheet">
            {favTopics
              .filter((f) => Boolean(f.topicWrapper?.id))
              .map((item) => {
                const t = item.topicWrapper!;
                return (
                  <TopicRow
                    key={t.id}
                    topic={t}
                    tag={item.hasNewReply ? '新回' : undefined}
                    read={Boolean(localData.readTopics[t.id])}
                    listStyle="compact"
                    onOpenTopic={(topic) =>
                      navigate({
                        name: 'topic',
                        topicId: topic.id,
                        boardName: topic.board?.name,
                        subject: topic.subject,
                      })
                    }
                    onOpenBoard={openBoard}
                  />
                );
              })}
          </ul>
          <LoadMoreSentinel
            hasMore={topicStart < topicTotal}
            loading={loadingMore}
            onLoadMore={() => void loadMoreTopics()}
            summary={`已加载 ${favTopics.length} / ${topicTotal}`}
          />
        </>
      )}
    </div>
  );
}
