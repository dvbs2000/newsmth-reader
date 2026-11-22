import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, RefreshCw, Search } from 'lucide-react';
import { api } from '../api/client';
import { LoadMoreSentinel } from '../components/LoadMoreSentinel';
import { useToast } from '../components/Toast';
import { TopicRow } from '../components/TopicRow';
import { useRouter } from '../state/router';
import { useSettings } from '../state/settings';
import {
  clearViewCache,
  getViewCache,
  saveViewScroll,
  setViewCache,
  useScrollMemory,
} from '../state/viewCache';
import type { BoardObj, SectionObj, TopicObj } from '../types/smth';

interface HomePageProps {
  onOpenCommand: () => void;
}

type HomeTab = 'ten' | 'global' | 'section' | 'boards';

interface HomeCache {
  tab: HomeTab;
  topics: TopicObj[];
  boards: BoardObj[];
  sections: SectionObj[];
  selectedSectionId: string;
  page: number;
  totalPages: number;
  fetchedAt: number;
  lastTopicId?: string;
}

const CACHE_KEY = 'home';
const STALE_CHECK_MS = 30_000;

export function HomePage({ onOpenCommand }: HomePageProps) {
  const { navigate, navigationType } = useRouter();
  const { localData, isBlocked, recordBoardHistory } = useSettings();
  const { showToast } = useToast();

  const initialCache = useRef(
    navigationType === 'pop' ? getViewCache<HomeCache>(CACHE_KEY) : undefined,
  );
  const restored = Boolean(initialCache.current);
  const skipFirstFetchRef = useRef(restored);

  const [tab, setTab] = useState<HomeTab>(() => initialCache.current?.state.tab ?? 'ten');
  const [topics, setTopics] = useState<TopicObj[]>(() => initialCache.current?.state.topics ?? []);
  const [boards, setBoards] = useState<BoardObj[]>(() => initialCache.current?.state.boards ?? []);
  const [sections, setSections] = useState<SectionObj[]>(
    () => initialCache.current?.state.sections ?? [],
  );
  const [selectedSectionId, setSelectedSectionId] = useState<string>(
    () => initialCache.current?.state.selectedSectionId ?? '',
  );
  const [page, setPage] = useState(() => initialCache.current?.state.page ?? 1);
  const [totalPages, setTotalPages] = useState(() => initialCache.current?.state.totalPages ?? 1);
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
  const loadingMoreRef = useRef(false);

  useScrollMemory(CACHE_KEY, restored, !loading);

  useEffect(() => {
    if (loading) return;
    setViewCache<HomeCache>(CACHE_KEY, {
      tab,
      topics,
      boards,
      sections,
      selectedSectionId,
      page,
      totalPages,
      fetchedAt,
      lastTopicId,
    });
  }, [
    loading,
    tab,
    topics,
    boards,
    sections,
    selectedSectionId,
    page,
    totalPages,
    fetchedAt,
    lastTopicId,
  ]);

  const loadSections = useCallback(async () => {
    if (sections.length > 0) return sections;
    const res = await api.getSections();
    const list = res.sections || [];
    setSections(list);
    if (list.length > 0 && !selectedSectionId) {
      setSelectedSectionId(list[0].id);
    }
    return list;
  }, [sections, selectedSectionId]);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNewPostCount(0);
    setFocusIdx(-1);
    setPage(1);
    loadingMoreRef.current = false;
    try {
      if (tab === 'ten') {
        const res = await api.getHotTen();
        setTopics(res.topics || []);
        setTotalPages(1);
      } else if (tab === 'global') {
        const res = await api.getHotGlobal(1, 20);
        setTopics(res.topics || []);
        setTotalPages(res.pager?.total || res.pager?.totalPages || 25);
      } else if (tab === 'section') {
        const list = await loadSections();
        const secId = selectedSectionId || list[0]?.id;
        if (secId) {
          const res = await api.getHotSection(secId, 1);
          setTopics(res.topics || []);
          setTotalPages(res.pager?.total || res.pager?.totalPages || 10);
        }
      } else if (tab === 'boards') {
        const list = await api.getPopularBoards();
        setBoards(Array.isArray(list) ? list : []);
      }
      setFetchedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [tab, selectedSectionId, loadSections]);

  // Silent background check when returning to a stale cached list (> 30s) — never disturbs scroll!
  useEffect(() => {
    if (!restored || tab === 'boards') return;
    if (Date.now() - fetchedAt < STALE_CHECK_MS) return;

    let cancelled = false;
    const probe = async () => {
      try {
        let fresh: TopicObj[] = [];
        if (tab === 'ten') {
          fresh = (await api.getHotTen()).topics || [];
        } else if (tab === 'global') {
          fresh = (await api.getHotGlobal(1, 20)).topics || [];
        } else if (tab === 'section' && selectedSectionId) {
          fresh = (await api.getHotSection(selectedSectionId, 1)).topics || [];
        }
        if (cancelled || fresh.length === 0) return;
        const currentIds = new Set(topics.map((t) => t.id));
        const unseen = fresh.filter((t) => !currentIds.has(t.id)).length;
        const headChanged = topics[0]?.id && fresh[0]?.id && topics[0].id !== fresh[0].id;
        if (unseen > 0) {
          setNewPostCount(unseen);
        } else if (headChanged) {
          setNewPostCount(1);
        }
      } catch {
        // silent background check
      }
    };
    void probe();
    return () => {
      cancelled = true;
    };
    // Run once on mount when returning via Back
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
    if (tab !== 'global' && tab !== 'section') return;

    const nextPage = page + 1;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const res =
        tab === 'global'
          ? await api.getHotGlobal(nextPage, 20)
          : await api.getHotSection(selectedSectionId, nextPage);
      const batch = res.topics || [];
      setTopics((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        return [...prev, ...batch.filter((t) => !seen.has(t.id))];
      });
      setPage(nextPage);
      if (batch.length === 0) {
        setTotalPages(nextPage);
      } else if (res.pager?.total || res.pager?.totalPages) {
        setTotalPages(res.pager.total || res.pager.totalPages || totalPages);
      }
    } catch {
      // ignore transient auto-load error
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [tab, loading, page, totalPages, selectedSectionId]);

  const visibleTopics = useMemo(
    () =>
      topics.filter((t) => {
        const author = t.article?.account?.name || t.firstAccount?.name;
        return !isBlocked(author, t.subject);
      }),
    [topics, isBlocked],
  );

  const openTopic = useCallback(
    (topic: TopicObj) => {
      const y = window.scrollY;
      setLastTopicId(topic.id);
      setViewCache<HomeCache>(
        CACHE_KEY,
        {
          tab,
          topics,
          boards,
          sections,
          selectedSectionId,
          page,
          totalPages,
          fetchedAt,
          lastTopicId: topic.id,
        },
        y,
      );
      navigate({
        name: 'topic',
        topicId: topic.id,
        boardName: topic.board?.name,
        subject: topic.subject,
      });
    },
    [navigate, tab, topics, boards, sections, selectedSectionId, page, totalPages, fetchedAt],
  );

  const handleManualRefresh = useCallback(() => {
    clearViewCache(CACHE_KEY);
    setNewPostCount(0);
    window.scrollTo({ top: 0, behavior: 'instant' });
    void loadInitial().then(() => showToast('已刷新最新列表'));
  }, [loadInitial, showToast]);

  const openBoard = useCallback(
    (id: string, name: string, title: string) => {
      saveViewScroll(CACHE_KEY, window.scrollY);
      recordBoardHistory({ id, name, title });
      navigate({ name: 'board', boardId: id, boardName: name, boardTitle: title });
    },
    [navigate, recordBoardHistory],
  );

  // J / K / Enter keyboard stream
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
        return;
      }
      if (tab === 'boards') return;

      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        setFocusIdx((i) => Math.min(visibleTopics.length - 1, i + 1));
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        setFocusIdx((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter' && focusIdx >= 0 && visibleTopics[focusIdx]) {
        e.preventDefault();
        openTopic(visibleTopics[focusIdx]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tab, visibleTopics, focusIdx, openTopic, handleManualRefresh]);

  return (
    <div>
      <button
        type="button"
        className="inline-search"
        style={{ width: '100%', textAlign: 'left' }}
        onClick={onOpenCommand}
      >
        <Search size={15} />
        <span style={{ flex: 1, fontSize: '0.88rem' }}>直达版面或搜索全站帖子...</span>
        <kbd className="kbd-hint">/</kbd>
      </button>

      {localData.boardSearchHistory.length > 0 ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '4px 0 4px' }}>
          {localData.boardSearchHistory.slice(0, 6).map((b) => (
            <button
              key={b.id || b.name}
              type="button"
              className="board-pill"
              onClick={() => openBoard(b.id, b.name, b.title)}
            >
              {b.title || b.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="subtabs">
        {(
          [
            ['ten', '今日十大'],
            ['global', '全站热帖'],
            ['section', '分区热点'],
            ['boards', '人气版面'],
          ] as Array<[HomeTab, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`subtab ${tab === key ? 'active' : ''}`}
            onClick={() => {
              if (tab === key) {
                handleManualRefresh();
              } else {
                setTab(key);
                window.scrollTo({ top: 0, behavior: 'instant' });
              }
            }}
          >
            {label}
          </button>
        ))}
        <div className="subtabs-spacer" />
        <button
          type="button"
          className="icon-btn"
          title="刷新最新 (U)"
          aria-label="刷新列表"
          onClick={handleManualRefresh}
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {newPostCount > 0 ? (
        <div className="new-posts-anchor">
          <button type="button" className="new-posts-pill" onClick={handleManualRefresh}>
            <ArrowUp size={13} />
            <span>有新动态（约 {newPostCount} 条）· 点击刷新</span>
          </button>
        </div>
      ) : null}

      {tab === 'section' && sections.length > 0 ? (
        <div className="subtabs" style={{ padding: '6px 0' }}>
          {sections.map((sec) => (
            <button
              key={sec.id}
              type="button"
              className={`subtab ${selectedSectionId === sec.id ? 'active' : ''}`}
              style={{ fontSize: '0.8rem', padding: '3px 9px' }}
              onClick={() => setSelectedSectionId(sec.id)}
            >
              {sec.name}
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="error-banner">
          <span>{error}</span>
          <button type="button" className="chip-btn" onClick={() => void loadInitial()}>
            重试
          </button>
        </div>
      ) : null}

      {loading ? (
        <div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton-row">
              <div className="skeleton-bar" style={{ width: `${65 + (i % 3) * 10}%` }} />
              <div className="skeleton-bar short" />
            </div>
          ))}
        </div>
      ) : tab === 'boards' ? (
        <div className="board-grid">
          {boards.map((b) => (
            <button
              key={b.id}
              type="button"
              className="board-card"
              onClick={() => openBoard(b.id, b.name, b.title || b.name)}
            >
              <span className="board-card-title">{b.title || b.name}</span>
              <span className="board-card-name">
                {b.name}
                {b.popularity ? ` · 热度 ${b.popularity}` : ''}
              </span>
            </button>
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
                rank={tab === 'ten' ? idx + 1 : undefined}
                read={Boolean(localData.readTopics[topic.id])}
                focused={idx === focusIdx || (focusIdx === -1 && topic.id === lastTopicId)}
                onOpenTopic={openTopic}
                onOpenBoard={openBoard}
              />
            ))}
          </ul>

          {tab === 'global' || tab === 'section' ? (
            <LoadMoreSentinel
              hasMore={page < totalPages}
              loading={loadingMore}
              onLoadMore={() => void loadMore()}
              summary={`第 ${page} / ${totalPages} 页`}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
