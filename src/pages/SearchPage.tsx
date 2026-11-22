import { useCallback, useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '../api/client';
import { LoadMoreSentinel } from '../components/LoadMoreSentinel';
import { useRouter } from '../state/router';
import { useSettings } from '../state/settings';
import { getViewCache, setViewCache, useScrollMemory } from '../state/viewCache';
import type { ArticleObj, BoardObj } from '../types/smth';
import { stripHtmlTags } from '../utils/content';
import { formatRelativeTime } from '../utils/format';

interface SearchPageProps {
  initialKeyword?: string;
  initialBoard?: string;
}

interface SearchCache {
  tab: 'articles' | 'boards';
  keyword: string;
  boardFilter: string;
  originalOnly: boolean;
  essenceOnly: boolean;
  articles: ArticleObj[];
  boards: BoardObj[];
  total: number;
  nextStart: number;
  searched: boolean;
}

export function SearchPage({ initialKeyword = '', initialBoard = '' }: SearchPageProps) {
  const { navigate, navigationType } = useRouter();
  const { localData, recordBoardHistory } = useSettings();

  const cacheKey = `search:${initialKeyword}:${initialBoard}`;
  const initialCache = useRef(
    navigationType === 'pop' ? getViewCache<SearchCache>(cacheKey) : undefined,
  );
  const restored = Boolean(initialCache.current);
  const skipFirstFetchRef = useRef(restored);

  const [tab, setTab] = useState<'articles' | 'boards'>(
    () => initialCache.current?.state.tab ?? 'articles',
  );
  const [keyword, setKeyword] = useState(
    () => initialCache.current?.state.keyword ?? initialKeyword,
  );
  const [boardFilter, setBoardFilter] = useState(
    () => initialCache.current?.state.boardFilter ?? initialBoard,
  );
  const [originalOnly, setOriginalOnly] = useState(
    () => initialCache.current?.state.originalOnly ?? true,
  );
  const [essenceOnly, setEssenceOnly] = useState(
    () => initialCache.current?.state.essenceOnly ?? false,
  );

  const [articles, setArticles] = useState<ArticleObj[]>(
    () => initialCache.current?.state.articles ?? [],
  );
  const [boards, setBoards] = useState<BoardObj[]>(() => initialCache.current?.state.boards ?? []);
  const [total, setTotal] = useState(() => initialCache.current?.state.total ?? 0);
  const [nextStart, setNextStart] = useState(() => initialCache.current?.state.nextStart ?? 0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searched, setSearched] = useState(() => initialCache.current?.state.searched ?? false);
  const [error, setError] = useState<string | null>(null);
  const loadingMoreRef = useRef(false);

  useScrollMemory(cacheKey, restored, !loading);

  useEffect(() => {
    if (loading) return;
    setViewCache<SearchCache>(cacheKey, {
      tab,
      keyword,
      boardFilter,
      originalOnly,
      essenceOnly,
      articles,
      boards,
      total,
      nextStart,
      searched,
    });
  }, [
    cacheKey,
    loading,
    tab,
    keyword,
    boardFilter,
    originalOnly,
    essenceOnly,
    articles,
    boards,
    total,
    nextStart,
    searched,
  ]);

  const runSearch = useCallback(
    async (kwOverride?: string) => {
      const kw = (kwOverride ?? keyword).trim();
      if (!kw) return;
      setLoading(true);
      setError(null);
      setSearched(true);
      loadingMoreRef.current = false;
      try {
        if (tab === 'articles') {
          const res = await api.searchArticles({
            keyword: kw,
            start: 0,
            original: originalOnly,
            boards: boardFilter.trim(),
            status: essenceOnly ? 2 : 0,
          });
          const batch = res.articles || [];
          setArticles(batch);
          setTotal(res.total || batch.length);
          setNextStart(batch.length);
        } else {
          const list = await api.searchBoards(kw);
          setBoards(Array.isArray(list) ? list : []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '搜索失败');
      } finally {
        setLoading(false);
      }
    },
    [keyword, tab, originalOnly, boardFilter, essenceOnly],
  );

  const loadMore = useCallback(async () => {
    const kw = keyword.trim();
    if (!kw || tab !== 'articles' || loadingMoreRef.current || loading || nextStart >= total) {
      return;
    }
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const res = await api.searchArticles({
        keyword: kw,
        start: nextStart,
        original: originalOnly,
        boards: boardFilter.trim(),
        status: essenceOnly ? 2 : 0,
      });
      const batch = res.articles || [];
      setArticles((prev) => {
        const seen = new Set(prev.map((a) => a.id));
        return [...prev, ...batch.filter((a) => !seen.has(a.id))];
      });
      setNextStart((s) => s + batch.length);
      if (batch.length === 0) setTotal(nextStart);
    } catch {
      // ignore transient auto-load failure
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [keyword, tab, loading, nextStart, total, originalOnly, boardFilter, essenceOnly]);

  useEffect(() => {
    if (skipFirstFetchRef.current) {
      skipFirstFetchRef.current = false;
      return;
    }
    if (initialKeyword) {
      setKeyword(initialKeyword);
      void runSearch(initialKeyword);
    }
  }, [initialKeyword, runSearch]);

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch();
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 12 }}
      >
        <div className="inline-search" style={{ margin: 0 }}>
          <Search size={15} />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={
              tab === 'articles' ? '搜索水木全站或版内帖子...' : '搜索版面英文或中文名...'
            }
            autoFocus
          />
          <button type="submit" className="chip-btn primary" style={{ height: 28 }}>
            搜索
          </button>
        </div>

        {tab === 'articles' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input
              className="text-input"
              style={{ width: 170, padding: '5px 9px', fontSize: '0.82rem' }}
              placeholder="限定版面英文名（可选）"
              value={boardFilter}
              onChange={(e) => setBoardFilter(e.target.value)}
            />
            <button
              type="button"
              className={`chip-btn ${originalOnly ? 'active' : ''}`}
              onClick={() => setOriginalOnly((v) => !v)}
            >
              仅搜主题
            </button>
            <button
              type="button"
              className={`chip-btn ${essenceOnly ? 'active' : ''}`}
              onClick={() => setEssenceOnly((v) => !v)}
            >
              仅精华
            </button>
          </div>
        ) : null}
      </form>

      <div className="subtabs" style={{ marginTop: 6 }}>
        <button
          type="button"
          className={`subtab ${tab === 'articles' ? 'active' : ''}`}
          onClick={() => setTab('articles')}
        >
          搜帖子
        </button>
        <button
          type="button"
          className={`subtab ${tab === 'boards' ? 'active' : ''}`}
          onClick={() => setTab('boards')}
        >
          搜版面
        </button>
      </div>

      {!searched && localData.articleSearchHistory.length > 0 ? (
        <div style={{ paddingTop: 14 }}>
          <div className="section-heading" style={{ marginTop: 0 }}>
            最近搜索
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {localData.articleSearchHistory.map((h) => (
              <button
                key={h}
                type="button"
                className="chip-btn"
                onClick={() => {
                  setKeyword(h);
                  void runSearch(h);
                }}
              >
                {h}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {error ? <div className="error-banner">{error}</div> : null}

      {loading ? (
        <div className="empty-state">检索中...</div>
      ) : tab === 'boards' ? (
        boards.length > 0 ? (
          <div className="board-grid">
            {boards.map((b) => (
              <button
                key={b.id}
                type="button"
                className="board-card"
                onClick={() => {
                  recordBoardHistory({ id: b.id, name: b.name, title: b.title || b.name });
                  navigate({
                    name: 'board',
                    boardId: b.id,
                    boardName: b.name,
                    boardTitle: b.title || b.name,
                  });
                }}
              >
                <span className="board-card-title">{b.title || b.name}</span>
                <span className="board-card-name">{b.name}</span>
              </button>
            ))}
          </div>
        ) : searched ? (
          <div className="empty-state">未找到匹配版面</div>
        ) : null
      ) : articles.length > 0 ? (
        <>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', padding: '10px 4px 2px' }}>
            共匹配约 {total} 条结果
          </div>
          <ul className="feed-list">
            {articles.map((art) => {
              const subject = stripHtmlTags(art.subject || art.topic?.subject || '(无标题)');
              const tid = art.topicId || art.topic?.id;
              return (
                <li
                  key={art.id}
                  className="topic-row"
                  onClick={() => {
                    if (tid) {
                      navigate({
                        name: 'topic',
                        topicId: tid,
                        boardName: art.board?.name,
                        subject,
                      });
                    }
                  }}
                >
                  <h2 className="topic-title">{subject}</h2>
                  {art.body ? (
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      {stripHtmlTags(art.body).slice(0, 140)}
                    </div>
                  ) : null}
                  <div className="topic-meta">
                    {art.board?.name ? (
                      <span className="board-pill">{art.board.title || art.board.name}</span>
                    ) : null}
                    {art.account?.name ? <span>{art.account.name}</span> : null}
                    <span style={{ marginLeft: 'auto' }}>{formatRelativeTime(art.postTime)}</span>
                  </div>
                </li>
              );
            })}
          </ul>

          <LoadMoreSentinel
            hasMore={nextStart < total}
            loading={loadingMore}
            onLoadMore={() => void loadMore()}
            summary={`已加载 ${articles.length} / ${total}`}
          />
        </>
      ) : searched ? (
        <div className="empty-state">未找到匹配帖子</div>
      ) : null}
    </div>
  );
}
