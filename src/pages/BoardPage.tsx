import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, ArrowUpDown, PenSquare, RefreshCw, Search, Star } from 'lucide-react';
import { api } from '../api/client';
import { ComposerDialog, type ComposerMode } from '../components/ComposerDialog';
import { LoadMoreSentinel } from '../components/LoadMoreSentinel';
import { TopicRow } from '../components/TopicRow';
import { useToast } from '../components/Toast';
import { useAuth } from '../state/auth';
import { useRouter } from '../state/router';
import { useSettings } from '../state/settings';
import {
  clearViewCache,
  getViewCache,
  setViewCache,
  useScrollMemory,
} from '../state/viewCache';
import type { BoardObj, TopicObj } from '../types/smth';

interface BoardPageProps {
  boardId: string;
  initialName?: string;
  initialTitle?: string;
  onUpdateHeader?: (title: string, subtitle?: string) => void;
}

type BoardTab = 'normal' | 'tops' | 'essence';

interface BoardCache {
  board: BoardObj | null;
  tab: BoardTab;
  order: 0 | 1;
  page: number;
  totalPages: number;
  topics: TopicObj[];
  cloudFav: boolean;
  fetchedAt: number;
  lastTopicId?: string;
}

const STALE_CHECK_MS = 30_000;

export function BoardPage({
  boardId,
  initialName,
  initialTitle,
  onUpdateHeader,
}: BoardPageProps) {
  const { navigate, navigationType } = useRouter();
  const { status, openLoginDialog } = useAuth();
  const { localData, isBlocked, toggleLocalFavBoard } = useSettings();
  const { showToast } = useToast();

  const cacheKey = `board:${boardId}`;
  const initialCache = useRef(
    navigationType === 'pop' ? getViewCache<BoardCache>(cacheKey) : undefined,
  );
  const restored = Boolean(initialCache.current);
  const skipFirstFetchRef = useRef(restored);

  const [board, setBoard] = useState<BoardObj | null>(
    () =>
      initialCache.current?.state.board ??
      (initialName
        ? { id: boardId, name: initialName, title: initialTitle || initialName }
        : null),
  );
  const [tab, setTab] = useState<BoardTab>(() => initialCache.current?.state.tab ?? 'normal');
  const [order, setOrder] = useState<0 | 1>(() => initialCache.current?.state.order ?? 1);
  const [page, setPage] = useState(() => initialCache.current?.state.page ?? 1);
  const [totalPages, setTotalPages] = useState(() => initialCache.current?.state.totalPages ?? 1);
  const [topics, setTopics] = useState<TopicObj[]>(() => initialCache.current?.state.topics ?? []);
  const [cloudFav, setCloudFav] = useState(() => initialCache.current?.state.cloudFav ?? false);
  const [fetchedAt, setFetchedAt] = useState(
    () => initialCache.current?.state.fetchedAt ?? Date.now(),
  );
  const [newPostCount, setNewPostCount] = useState(0);
  const [lastTopicId, setLastTopicId] = useState<string | undefined>(
    () => initialCache.current?.state.lastTopicId,
  );
  const [loading, setLoading] = useState(!restored);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusIdx, setFocusIdx] = useState(-1);
  const [composer, setComposer] = useState<ComposerMode | null>(null);
  const loadingMoreRef = useRef(false);

  useScrollMemory(cacheKey, restored, !loading);

  useEffect(() => {
    if (board) {
      onUpdateHeader?.(board.title || board.name, board.name);
    }
  }, [board, onUpdateHeader]);

  useEffect(() => {
    if (loading) return;
    setViewCache<BoardCache>(cacheKey, {
      board,
      tab,
      order,
      page,
      totalPages,
      topics,
      cloudFav,
      fetchedAt,
      lastTopicId,
    });
  }, [
    cacheKey,
    loading,
    board,
    tab,
    order,
    page,
    totalPages,
    topics,
    cloudFav,
    fetchedAt,
    lastTopicId,
  ]);

  const isLocalFav = useMemo(
    () => localData.localFavBoards.some((b) => b.id === boardId),
    [localData.localFavBoards, boardId],
  );

  const fetchBatch = useCallback(
    async (targetPage: number) => {
      if (tab === 'normal') {
        const res = await api.getBoardTopics(boardId, targetPage, order);
        return {
          items: res.topics || [],
          totalPages: res.pager?.total || res.pager?.totalPages || 1,
          board: res.board,
        };
      }
      if (tab === 'tops') {
        const res = await api.getBoardTops(boardId, (targetPage - 1) * 20, 20);
        return {
          items: res.tops || [],
          totalPages: Math.max(1, Math.ceil((res.pager?.total || 0) / 20)),
          board: undefined,
        };
      }
      const res = await api.getBoardEssence(boardId, (targetPage - 1) * 20, 20);
      const mapped: TopicObj[] = (res.articles || []).map((item) => ({
        ...item,
        article: item.article || item.articles?.[0],
      }));
      return {
        items: mapped,
        totalPages: Math.max(1, Math.ceil((res.pager?.total || 0) / 20)),
        board: undefined,
      };
    },
    [boardId, tab, order],
  );

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNewPostCount(0);
    setFocusIdx(-1);
    setPage(1);
    loadingMoreRef.current = false;
    try {
      const res = await fetchBatch(1);
      if (res.board) {
        setBoard(res.board);
        setCloudFav(Boolean(res.board.isFavorite));
        onUpdateHeader?.(res.board.title || res.board.name, res.board.name);
      }
      setTopics(res.items);
      setTotalPages(res.totalPages);
      setFetchedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : '版面加载失败');
    } finally {
      setLoading(false);
    }
  }, [fetchBatch, onUpdateHeader]);

  // Silent background new-post probe when returning to a cached board after > 30s
  useEffect(() => {
    if (!restored) return;
    if (Date.now() - fetchedAt < STALE_CHECK_MS) return;

    let cancelled = false;
    const probe = async () => {
      try {
        const res = await fetchBatch(1);
        if (cancelled || res.items.length === 0) return;
        const currentIds = new Set(topics.map((t) => t.id));
        const unseen = res.items.filter((t) => !currentIds.has(t.id)).length;
        const topId = topics[0]?.id;
        const topIdxInFresh = topId ? res.items.findIndex((t) => t.id === topId) : -1;
        const bumpedCount = topIdxInFresh > 0 ? topIdxInFresh : 0;
        const delta = Math.max(unseen, bumpedCount);
        if (delta > 0) setNewPostCount(delta);
      } catch {
        // silent background check
      }
    };
    void probe();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (skipFirstFetchRef.current) {
      skipFirstFetchRef.current = false;
      return;
    }
    void loadInitial();
  }, [loadInitial]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || loading || page >= totalPages) return;
    const nextPage = page + 1;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const res = await fetchBatch(nextPage);
      setTopics((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        return [...prev, ...res.items.filter((t) => !seen.has(t.id))];
      });
      setPage(nextPage);
      setTotalPages(res.items.length === 0 ? nextPage : res.totalPages);
    } catch {
      // ignore transient auto-load failure
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [fetchBatch, loading, page, totalPages]);

  const visibleTopics = useMemo(
    () =>
      topics.filter((t) => {
        const author = t.article?.account?.name || t.firstAccount?.name;
        return !isBlocked(author, t.subject);
      }),
    [topics, isBlocked],
  );

  const openTopic = useCallback(
    (t: TopicObj) => {
      const y = window.scrollY;
      setLastTopicId(t.id);
      setViewCache<BoardCache>(
        cacheKey,
        { board, tab, order, page, totalPages, topics, cloudFav, fetchedAt, lastTopicId: t.id },
        y,
      );
      navigate({
        name: 'topic',
        topicId: t.id,
        boardName: board?.name,
        subject: t.subject,
      });
    },
    [cacheKey, board, tab, order, page, totalPages, topics, cloudFav, fetchedAt, navigate],
  );

  const handleManualRefresh = useCallback(() => {
    clearViewCache(cacheKey);
    setNewPostCount(0);
    window.scrollTo({ top: 0, behavior: 'instant' });
    void loadInitial().then(() => showToast('已刷新版面最新帖子'));
  }, [cacheKey, loadInitial, showToast]);

  const openNewTopic = useCallback(() => {
    if (!status?.loggedIn) {
      openLoginDialog();
      showToast('发帖前请先登录水木账号');
      return;
    }
    setComposer({
      type: 'new-topic',
      boardId,
      boardTitle: board?.title || board?.name || initialTitle || '',
    });
  }, [status?.loggedIn, openLoginDialog, showToast, boardId, board, initialTitle]);

  const handleToggleFav = async () => {
    const info = {
      id: boardId,
      name: board?.name || initialName || boardId,
      title: board?.title || initialTitle || board?.name || boardId,
    };
    if (status?.loggedIn) {
      try {
        if (cloudFav) {
          await api.removeCloudFavBoard(boardId);
          setCloudFav(false);
          showToast('已取消云端版面收藏');
        } else {
          await api.addCloudFavBoard(boardId);
          setCloudFav(true);
          showToast('已加入云端版面收藏');
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : '收藏操作失败');
      }
    } else {
      await toggleLocalFavBoard(info);
      showToast(isLocalFav ? '已取消本机收藏' : '已收藏到本机');
    }
  };

  // J / K / Enter / N
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          document.querySelector('dialog[open]'))
      ) {
        return;
      }
      if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        handleManualRefresh();
      } else if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        setFocusIdx((i) => Math.min(visibleTopics.length - 1, i + 1));
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        setFocusIdx((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter' && focusIdx >= 0 && visibleTopics[focusIdx]) {
        e.preventDefault();
        openTopic(visibleTopics[focusIdx]);
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        openNewTopic();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visibleTopics, focusIdx, openTopic, openNewTopic, handleManualRefresh]);

  const starred = status?.loggedIn ? cloudFav : isLocalFav;

  return (
    <div>
      <div className="thread-controls" style={{ paddingTop: 12 }}>
        <button type="button" className="chip-btn primary" onClick={openNewTopic} title="发表新帖 (N)">
          <PenSquare size={14} />
          发新帖
        </button>

        <button
          type="button"
          className={`chip-btn ${starred ? 'active' : ''}`}
          onClick={() => void handleToggleFav()}
        >
          <Star size={14} fill={starred ? 'currentColor' : 'none'} />
          {starred ? '已收藏' : '收藏版面'}
        </button>

        <button
          type="button"
          className="chip-btn"
          onClick={() => setOrder((o) => (o === 1 ? 0 : 1))}
        >
          <ArrowUpDown size={13} />
          {order === 1 ? '按回复刷新' : '按发帖时间'}
        </button>

        {board?.name ? (
          <button
            type="button"
            className="chip-btn"
            onClick={() => navigate({ name: 'search', initialBoard: board.name })}
          >
            <Search size={13} />
            版内搜索
          </button>
        ) : null}

        <button
          type="button"
          className="icon-btn"
          style={{ marginLeft: 'auto' }}
          title="刷新最新 (U)"
          aria-label="刷新版面"
          onClick={handleManualRefresh}
        >
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="subtabs">
        {(
          [
            ['normal', '主题列表'],
            ['tops', '置顶'],
            ['essence', '精华'],
          ] as Array<[BoardTab, string]>
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={`subtab ${tab === k ? 'active' : ''}`}
            onClick={() => {
              if (tab === k) {
                handleManualRefresh();
              } else {
                setTab(k);
                window.scrollTo({ top: 0, behavior: 'instant' });
              }
            }}
          >
            {label}
          </button>
        ))}
        {board?.todayPostCount !== undefined ? (
          <span
            className="tabular"
            style={{ marginLeft: 'auto', fontSize: '0.76rem', color: 'var(--text-muted)' }}
          >
            今日 {board.todayPostCount} 帖
          </span>
        ) : null}
      </div>

      {newPostCount > 0 ? (
        <div className="new-posts-anchor">
          <button type="button" className="new-posts-pill" onClick={handleManualRefresh}>
            <ArrowUp size={13} />
            <span>有新帖（约 {newPostCount} 条）· 点击刷新</span>
          </button>
        </div>
      ) : null}

      {error ? <div className="error-banner">{error}</div> : null}

      {loading ? (
        <div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton-row">
              <div className="skeleton-bar" style={{ width: `${60 + (i % 4) * 9}%` }} />
              <div className="skeleton-bar short" />
            </div>
          ))}
        </div>
      ) : visibleTopics.length === 0 ? (
        <div className="empty-state">暂无帖子</div>
      ) : (
        <>
          <ul className="feed-list">
            {visibleTopics.map((topic, idx) => (
              <TopicRow
                key={topic.id}
                topic={topic}
                tag={tab === 'tops' ? '置顶' : tab === 'essence' ? '精华' : undefined}
                showBoard={false}
                read={Boolean(localData.readTopics[topic.id])}
                focused={idx === focusIdx || (focusIdx === -1 && topic.id === lastTopicId)}
                onOpenTopic={openTopic}
              />
            ))}
          </ul>

          <LoadMoreSentinel
            hasMore={page < totalPages}
            loading={loadingMore}
            onLoadMore={() => void loadMore()}
            summary={`第 ${page} / ${totalPages} 页`}
          />
        </>
      )}

      <ComposerDialog
        mode={composer}
        onClose={() => setComposer(null)}
        onSuccess={() => void loadInitial()}
      />
    </div>
  );
}
