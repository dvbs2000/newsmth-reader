import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  MessageSquarePlus,
  RefreshCw,
  ThumbsUp,
  UserCheck,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import { ComposerDialog, type ComposerMode } from '../components/ComposerDialog';
import { FloorCard } from '../components/FloorCard';
import { Lightbox } from '../components/Lightbox';
import { LoadMoreSentinel } from '../components/LoadMoreSentinel';
import { ModalDialog } from '../components/ModalDialog';
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
import type { ArticleObj, BoardObj, LikeObj, TopicObj } from '../types/smth';
import { buildQuotePrefix, normalizeRawBody, stripHtmlTags } from '../utils/content';
import { requestHumanGeetest, type GeetestCaptchaPayload } from '../utils/geetest';

interface ThreadPageProps {
  topicId: string;
  initialBoardName?: string;
  initialSubject?: string;
  initialPage?: number;
  onUpdateHeader?: (title: string, subtitle?: string) => void;
}

type ThreadMode = 0 | 1 | 2 | 3 | 6;

interface ThreadCache {
  mode: ThreadMode;
  filterArticleId?: string;
  filterAuthorName?: string;
  startPage: number;
  loadedPage: number;
  totalPages: number;
  totalItems: number;
  topic: TopicObj | null;
  mainArticle: ArticleObj | null;
  board: BoardObj | null;
  articles: ArticleObj[];
  likes: LikeObj[];
  myLike: LikeObj | null;
  favored: boolean;
}

export function ThreadPage({
  topicId,
  initialBoardName,
  initialSubject,
  initialPage = 1,
  onUpdateHeader,
}: ThreadPageProps) {
  const { navigate, navigationType } = useRouter();
  const { status, openLoginDialog } = useAuth();
  const { prefs, localData, isBlocked, markTopicRead, saveBlocklist } = useSettings();
  const { showToast } = useToast();

  const cacheKey = `topic:${topicId}`;
  const initialCache = useRef(
    navigationType === 'pop' ? getViewCache<ThreadCache>(cacheKey) : undefined,
  );
  const restored = Boolean(initialCache.current);
  const skipFirstFetchRef = useRef(restored);

  const [mode, setMode] = useState<ThreadMode>(() => initialCache.current?.state.mode ?? 1);
  const [filterArticleId, setFilterArticleId] = useState<string | undefined>(
    () => initialCache.current?.state.filterArticleId,
  );
  const [filterAuthorName, setFilterAuthorName] = useState<string | undefined>(
    () => initialCache.current?.state.filterAuthorName,
  );
  const [startPage, setStartPage] = useState(
    () => initialCache.current?.state.startPage ?? initialPage,
  );
  const [loadedPage, setLoadedPage] = useState(
    () => initialCache.current?.state.loadedPage ?? initialPage,
  );
  const [totalPages, setTotalPages] = useState(() => initialCache.current?.state.totalPages ?? 1);
  const [totalItems, setTotalItems] = useState(() => initialCache.current?.state.totalItems ?? 0);

  const [topic, setTopic] = useState<TopicObj | null>(() => initialCache.current?.state.topic ?? null);
  const [mainArticle, setMainArticle] = useState<ArticleObj | null>(
    () => initialCache.current?.state.mainArticle ?? null,
  );
  const [board, setBoard] = useState<BoardObj | null>(() => initialCache.current?.state.board ?? null);
  const [articles, setArticles] = useState<ArticleObj[]>(
    () => initialCache.current?.state.articles ?? [],
  );
  const [likes, setLikes] = useState<LikeObj[]>(() => initialCache.current?.state.likes ?? []);
  const [myLike, setMyLike] = useState<LikeObj | null>(() => initialCache.current?.state.myLike ?? null);
  const [favored, setFavored] = useState(() => initialCache.current?.state.favored ?? false);

  const [loading, setLoading] = useState(!restored);
  const [loadingMore, setLoadingMore] = useState(false);
  const [checkingNew, setCheckingNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusIdx, setFocusIdx] = useState(-1);
  const loadingMoreRef = useRef(false);
  const checkingNewRef = useRef(false);

  const didPinTopRef = useRef(restored);
  useScrollMemory(cacheKey, restored, !loading);

  // Guarantee a freshly clicked topic always opens cleanly at top (y = 0)
  useLayoutEffect(() => {
    if (didPinTopRef.current || loading) return;
    didPinTopRef.current = true;
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [loading]);

  useEffect(() => {
    if (board) {
      onUpdateHeader?.(board.title || board.name, board.name);
    }
  }, [board, onUpdateHeader]);

  useEffect(() => {
    if (loading) return;
    setViewCache<ThreadCache>(cacheKey, {
      mode,
      filterArticleId,
      filterAuthorName,
      startPage,
      loadedPage,
      totalPages,
      totalItems,
      topic,
      mainArticle,
      board,
      articles,
      likes,
      myLike,
      favored,
    });
  }, [
    cacheKey,
    loading,
    mode,
    filterArticleId,
    filterAuthorName,
    startPage,
    loadedPage,
    totalPages,
    totalItems,
    topic,
    mainArticle,
    board,
    articles,
    likes,
    myLike,
    favored,
  ]);

  const [composer, setComposer] = useState<ComposerMode | null>(null);
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number }>({
    images: [],
    index: -1,
  });
  const [likeDialogOpen, setLikeDialogOpen] = useState(false);
  const [likeCaptchaActive, setLikeCaptchaActive] = useState(false);
  const [likeBody, setLikeBody] = useState('');
  const [likeScore, setLikeScore] = useState(1);
  const [likeSubmitting, setLikeSubmitting] = useState(false);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    loadingMoreRef.current = false;
    try {
      const [detailRes, artRes, likeRes] = await Promise.all([
        api.getTopicDetail(topicId).catch(() => null),
        api.getTopicArticles(
          topicId,
          mode,
          startPage,
          20,
          mode === 3 ? filterArticleId : undefined,
        ),
        startPage === 1 && prefs.showLikes
          ? api.getTopicLikes(topicId).catch(() => null)
          : Promise.resolve(null),
      ]);

      const fetchedTopic = detailRes?.topic || artRes.topic || null;
      const fetchedMain = detailRes?.topic?.article || artRes.topic?.article || null;
      const fetchedBoard = artRes.board || fetchedTopic?.board || null;
      setTopic(fetchedTopic);
      if (fetchedMain) setMainArticle(fetchedMain);
      setBoard(fetchedBoard);
      setFavored(Boolean(fetchedTopic?.fav || detailRes?.favTopic));
      setArticles(artRes.articles || []);
      setLoadedPage(startPage);

      const pager = artRes.pager;
      setTotalPages(Math.max(1, pager?.totalPages || pager?.total || 1));
      setTotalItems(
        (pager?.totalItems || pager?.items || (artRes.articles?.length ?? 0)) +
          (fetchedMain ? 1 : 0),
      );

      const subject = stripHtmlTags(fetchedTopic?.subject || initialSubject || '帖子详情');
      const boardLabel = fetchedBoard?.title || fetchedBoard?.name || initialBoardName || '';
      onUpdateHeader?.(boardLabel || '帖子详情', fetchedBoard?.name);
      markTopicRead(topicId, startPage, subject);

      if (Array.isArray(likeRes)) {
        setMyLike(likeRes[0] || null);
        setLikes(Array.isArray(likeRes[1]) ? likeRes[1] : []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '帖子加载失败');
    } finally {
      setLoading(false);
    }
  }, [
    topicId,
    mode,
    startPage,
    filterArticleId,
    prefs.showLikes,
    initialSubject,
    initialBoardName,
    onUpdateHeader,
    markTopicRead,
  ]);

  useEffect(() => {
    if (skipFirstFetchRef.current) {
      skipFirstFetchRef.current = false;
      return;
    }
    void loadInitial();
  }, [loadInitial]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || loading || loadedPage >= totalPages) return;
    const nextPage = loadedPage + 1;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const artRes = await api.getTopicArticles(
        topicId,
        mode,
        nextPage,
        20,
        mode === 3 ? filterArticleId : undefined,
      );
      const batch = artRes.articles || [];
      setArticles((prev) => {
        const seen = new Set(prev.map((a) => a.id));
        return [...prev, ...batch.filter((a) => !seen.has(a.id))];
      });
      setLoadedPage(nextPage);
      const pager = artRes.pager;
      if (batch.length === 0) {
        setTotalPages(nextPage);
      } else if (pager?.totalPages || pager?.total) {
        setTotalPages(Math.max(nextPage, pager.totalPages || pager.total || totalPages));
      }
      const subject = stripHtmlTags(topic?.subject || initialSubject || '');
      markTopicRead(topicId, nextPage, subject);
    } catch {
      // ignore transient auto-load failure
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [
    loading,
    loadedPage,
    totalPages,
    topicId,
    mode,
    filterArticleId,
    topic?.subject,
    initialSubject,
    markTopicRead,
  ]);

  // Incremental check at end of thread: silently appends newly posted floors without jumping to top
  const checkNewReplies = useCallback(async () => {
    if (checkingNewRef.current || loading || loadingMoreRef.current) return;
    checkingNewRef.current = true;
    setCheckingNew(true);
    try {
      const currentRes = await api.getTopicArticles(
        topicId,
        mode,
        loadedPage,
        20,
        mode === 3 ? filterArticleId : undefined,
      );
      let incoming = currentRes.articles || [];
      const newTotalPages = Math.max(
        loadedPage,
        currentRes.pager?.totalPages || currentRes.pager?.total || totalPages,
      );
      let nextLoadedPage = loadedPage;

      // If replies spilled over onto the next page, fetch that page too
      if (newTotalPages > loadedPage) {
        const nextRes = await api.getTopicArticles(
          topicId,
          mode,
          loadedPage + 1,
          20,
          mode === 3 ? filterArticleId : undefined,
        );
        incoming = [...incoming, ...(nextRes.articles || [])];
        nextLoadedPage = loadedPage + 1;
      }

      const existingIds = new Set(articles.map((a) => a.id));
      if (mainArticle?.id) existingIds.add(mainArticle.id);
      const added = incoming.filter((a) => !existingIds.has(a.id));

      if (added.length > 0) {
        setArticles((prev) => {
          const seen = new Set(prev.map((a) => a.id));
          return [...prev, ...added.filter((a) => !seen.has(a.id))];
        });
        setLoadedPage(nextLoadedPage);
        setTotalPages(newTotalPages);
        if (currentRes.pager?.totalItems || currentRes.pager?.items) {
          setTotalItems(
            (currentRes.pager.totalItems || currentRes.pager.items || 0) + (mainArticle ? 1 : 0),
          );
        }
        showToast(`已追加 ${added.length} 条新回复`);
      } else {
        showToast('暂无新回复');
      }
    } catch {
      showToast('检查新回复失败');
    } finally {
      checkingNewRef.current = false;
      setCheckingNew(false);
    }
  }, [
    loading,
    topicId,
    mode,
    loadedPage,
    filterArticleId,
    totalPages,
    articles,
    mainArticle,
    showToast,
  ]);

  const visibleArticles = useMemo(
    () =>
      articles.filter((a) => {
        if (mainArticle && a.id === mainArticle.id) return false;
        const author = a.account?.name;
        return !isBlocked(author, a.body);
      }),
    [articles, mainArticle, isBlocked],
  );

  const showMainPost = Boolean(
    mainArticle &&
      startPage === 1 &&
      (mode !== 3 || !filterAuthorName || filterAuthorName === mainArticle.account?.name),
  );

  const opUsername =
    mainArticle?.account?.name ||
    topic?.article?.account?.name ||
    articles.find((a) => a.topicOrder === 1)?.account?.name;
  const currentUsername = status?.profile?.account?.name;
  const subjectText = stripHtmlTags(topic?.subject || initialSubject || '');
  const boardId =
    board?.id || topic?.boardId || mainArticle?.boardId || articles[0]?.boardId || '';
  const boardName = board?.name || initialBoardName || '';

  const openReply = useCallback(
    (target?: ArticleObj) => {
      if (!status?.loggedIn) {
        openLoginDialog();
        showToast('回复前请先登录水木账号');
        return;
      }
      const targetArt = target || mainArticle || topic?.article || articles[0];
      if (!targetArt?.id) {
        showToast('未获取到可回复的楼层 ID');
        return;
      }
      const isMain = !target || target.topicOrder === 1 || target.id === mainArticle?.id;
      const author = targetArt.account?.name || '楼主';
      setComposer({
        type: 'reply',
        boardId,
        articleId: targetArt.id,
        replyTargetLabel: isMain ? '主帖' : `${author} (#${(targetArt.topicOrder || 2) - 1}楼)`,
        initialQuote: isMain ? '' : buildQuotePrefix(author, targetArt.body || ''),
      });
    },
    [status?.loggedIn, openLoginDialog, showToast, mainArticle, topic?.article, articles, boardId],
  );

  const handleEdit = (article: ArticleObj) => {
    const clean = normalizeRawBody(article.body || '').text;
    setComposer({
      type: 'edit',
      boardId,
      articleId: article.id,
      initialSubject: stripHtmlTags(article.subject || subjectText),
      initialBody: clean,
    });
  };

  const handleDelete = async (article: ArticleObj) => {
    const isMain = article.topicOrder === 1;
    const confirmed = window.confirm(
      isMain ? '确认删除整个主题帖吗？此操作不可撤销。' : '确认删除这条回复吗？',
    );
    if (!confirmed) return;
    try {
      if (isMain) {
        await api.deleteTopic(topicId);
        showToast('主题已删除');
        navigate(
          boardId
            ? { name: 'board', boardId, boardName, boardTitle: board?.title }
            : { name: 'home' },
        );
      } else {
        await api.deleteArticle(article.id);
        showToast('回复已删除');
        void loadInitial();
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleToggleFavTopic = async () => {
    if (!status?.loggedIn) {
      openLoginDialog();
      showToast('收藏帖子需要先登录水木账号');
      return;
    }
    try {
      if (favored) {
        await api.removeCloudFavTopic(topicId);
        setFavored(false);
        showToast('已取消收藏此帖');
      } else {
        await api.addCloudFavTopic(topicId);
        setFavored(true);
        showToast('已加入云端收藏帖');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : '操作失败');
    }
  };

  const handleSubmitLike = async () => {
    if (!boardName || !likeBody.trim()) return;
    setLikeSubmitting(true);
    try {
      let captcha: GeetestCaptchaPayload | undefined;
      const check = await api.checkPublishCaptcha().catch(() => ({ needCaptcha: false }));
      if (check.needCaptcha) {
        setLikeCaptchaActive(true);
        try {
          const verified = await requestHumanGeetest('like');
          if (!verified) {
            setLikeCaptchaActive(false);
            setLikeSubmitting(false);
            return;
          }
          captcha = verified;
        } finally {
          setLikeCaptchaActive(false);
        }
      }
      await api.addLike(topicId, { boardName, body: likeBody.trim(), score: likeScore, captcha });
      showToast('已发送 Like');
      setLikeDialogOpen(false);
      setLikeBody('');
      void loadInitial();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Like 失败');
    } finally {
      setLikeCaptchaActive(false);
      setLikeSubmitting(false);
    }
  };

  const handleRemoveLike = async () => {
    if (!boardName) return;
    try {
      await api.removeLike(topicId, boardName);
      showToast('已撤回 Like');
      setLikeDialogOpen(false);
      void loadInitial();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '撤回失败');
    }
  };

  const handleBlockUser = async (username: string) => {
    if (!window.confirm(`确定在本地屏蔽用户 ${username} 的发言与主题吗？`)) return;
    await saveBlocklist([...localData.blockUsers, username], localData.blockKeywords);
    showToast(`已本地屏蔽 ${username}`);
  };

  // J / K / O / R keyboard shortcuts inside thread
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

      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        setFocusIdx((prev) => {
          const next = Math.min(visibleArticles.length - 1, prev + 1);
          const id = visibleArticles[next]?.id;
          if (id) {
            document
              .querySelector(`[data-article-id="${id}"]`)
              ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
          return next;
        });
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        setFocusIdx((prev) => {
          const next = Math.max(0, prev - 1);
          const id = visibleArticles[next]?.id;
          if (id) {
            document
              .querySelector(`[data-article-id="${id}"]`)
              ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
          return next;
        });
      } else if (e.key === 'o' || e.key === 'O') {
        e.preventDefault();
        setMode((m) => (m === 0 ? 1 : 0));
        setStartPage(1);
        showToast(mode === 0 ? '切换：全部楼层' : '切换：只看楼主');
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        openReply();
      } else if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        clearViewCache(cacheKey);
        window.scrollTo({ top: 0, behavior: 'instant' });
        void loadInitial().then(() => showToast('已刷新帖子'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visibleArticles, mode, openReply, showToast, cacheKey, loadInitial]);

  const pageRangeLabel =
    totalPages > 1
      ? startPage === loadedPage
        ? `第 ${loadedPage} / ${totalPages} 页`
        : `已加载第 ${startPage}–${loadedPage} / ${totalPages} 页`
      : undefined;

  return (
    <div>
      <div className="thread-header">
        <h1 className="thread-subject">{subjectText || '加载中...'}</h1>
        <div className="thread-meta-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {board?.id ? (
              <button
                type="button"
                className="board-pill"
                onClick={() =>
                  navigate({
                    name: 'board',
                    boardId: board.id,
                    boardName: board.name,
                    boardTitle: board.title || board.name,
                  })
                }
              >
                {board.title || board.name}
              </button>
            ) : null}
            {opUsername ? <span>楼主 {opUsername}</span> : null}
            <span className="tabular">共 {totalItems} 楼</span>
          </div>

          <button
            type="button"
            className="icon-btn"
            style={{ minWidth: 28, height: 28 }}
            title="刷新"
            aria-label="刷新帖子"
            onClick={() => {
              clearViewCache(cacheKey);
              void loadInitial();
            }}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="thread-controls">
        {(
          [
            [1, '正序'],
            [0, '只看楼主'],
            [2, '最新'],
            [6, '精华'],
          ] as Array<[ThreadMode, string]>
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            className={`chip-btn ${mode === m ? 'active' : ''}`}
            onClick={() => {
              setMode(m);
              setFilterArticleId(undefined);
              setFilterAuthorName(undefined);
              setStartPage(1);
            }}
          >
            {m === 0 ? <UserCheck size={13} /> : null}
            {label}
          </button>
        ))}

        {mode === 3 && filterAuthorName ? (
          <button
            type="button"
            className="chip-btn active"
            onClick={() => {
              setMode(1);
              setFilterArticleId(undefined);
              setFilterAuthorName(undefined);
              setStartPage(1);
            }}
          >
            只看 {filterAuthorName} <X size={12} />
          </button>
        ) : null}

        <div style={{ flex: 1 }} />

        <button
          type="button"
          className={`chip-btn ${favored ? 'active' : ''}`}
          onClick={() => void handleToggleFavTopic()}
          title="云端收藏本帖"
        >
          <Bookmark size={13} fill={favored ? 'currentColor' : 'none'} />
          {favored ? '已藏' : '收藏'}
        </button>

        <button
          type="button"
          className={`chip-btn ${myLike ? 'active' : ''}`}
          onClick={() => {
            if (!status?.loggedIn) {
              openLoginDialog();
              showToast('Like 打分前请先登录');
              return;
            }
            setLikeBody(myLike?.body || '');
            setLikeScore(myLike?.score ?? 1);
            setLikeDialogOpen(true);
          }}
        >
          <ThumbsUp size={13} />
          Like{likes.length > 0 ? ` (${likes.length})` : ''}
        </button>

        <button
          type="button"
          className="chip-btn primary"
          onClick={() => openReply()}
          title="回复主帖 (R)"
        >
          <MessageSquarePlus size={13} />
          回复
        </button>
      </div>

      {error ? (
        <div className="error-banner">
          <span>{error}</span>
          <button type="button" className="chip-btn" onClick={() => void loadInitial()}>
            重试
          </button>
        </div>
      ) : null}

      {showMainPost && mainArticle ? (
        <FloorCard
          article={{ ...mainArticle, topicOrder: 1 }}
          opUsername={opUsername}
          currentUsername={currentUsername}
          prefs={prefs}
          onReply={(a) => openReply(a)}
          onEdit={handleEdit}
          onDelete={(a) => void handleDelete(a)}
          onOpenUser={(username) => navigate({ name: 'user', username })}
          onBlockUser={(u) => void handleBlockUser(u)}
          onOpenLightbox={(images, index) => setLightbox({ images, index })}
        />
      ) : null}

      {startPage === 1 && prefs.showLikes && likes.length > 0 ? (
        <section className="likes-box" aria-label="亮评 Likes">
          <div className="likes-title">
            <span>亮评 · Likes ({likes.length})</span>
          </div>
          {likes.slice(0, 8).map((lk) => (
            <div key={lk.id} className="like-item">
              <span className="like-score">
                {lk.score > 0 ? `+${lk.score}` : lk.score === 0 ? '0' : lk.score}
              </span>
              <span className="like-author">{lk.accountName || lk.account?.name || ''}</span>
              <span className="like-msg">{lk.body}</span>
            </div>
          ))}
        </section>
      ) : null}

      {loading ? (
        <div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton-row" style={{ padding: '20px 4px' }}>
              <div className="skeleton-bar short" style={{ marginTop: 0, marginBottom: 12 }} />
              <div className="skeleton-bar" style={{ width: '92%' }} />
              <div className="skeleton-bar" style={{ width: '74%', marginTop: 8 }} />
            </div>
          ))}
        </div>
      ) : visibleArticles.length === 0 && !showMainPost ? (
        <div className="empty-state">暂无楼层内容</div>
      ) : visibleArticles.length === 0 ? (
        <div className="empty-state" style={{ padding: '28px 16px' }}>
          {mode === 0 ? '楼主暂无其他跟帖回复' : '暂无更多回复'}
        </div>
      ) : (
        <>
          <div>
            {visibleArticles.map((art, idx) => (
              <FloorCard
                key={art.id}
                article={art}
                opUsername={opUsername}
                currentUsername={currentUsername}
                prefs={prefs}
                focused={idx === focusIdx}
                onReply={(a) => openReply(a)}
                onEdit={handleEdit}
                onDelete={(a) => void handleDelete(a)}
                onFilterAuthor={(a) => {
                  setMode(3);
                  setFilterArticleId(a.id);
                  setFilterAuthorName(a.account?.name || '该作者');
                  setStartPage(1);
                }}
                onOpenUser={(username) => navigate({ name: 'user', username })}
                onBlockUser={(u) => void handleBlockUser(u)}
                onOpenLightbox={(images, index) => setLightbox({ images, index })}
              />
            ))}
          </div>

          <LoadMoreSentinel
            hasMore={loadedPage < totalPages}
            loading={loadingMore}
            onLoadMore={() => void loadMore()}
            onCheckNew={mode === 1 || mode === 0 ? () => void checkNewReplies() : undefined}
            checkingNew={checkingNew}
            summary={pageRangeLabel}
            doneText="— 全部楼层已加载完毕 —"
          />
        </>
      )}

      <ComposerDialog
        mode={composer}
        onClose={() => setComposer(null)}
        onSuccess={() => void loadInitial()}
      />

      <Lightbox
        images={lightbox.images}
        index={lightbox.index}
        onChangeIndex={(next) => setLightbox((prev) => ({ ...prev, index: next }))}
        onClose={() => setLightbox({ images: [], index: -1 })}
      />

      <ModalDialog
        open={likeDialogOpen && !likeCaptchaActive}
        onClose={() => setLikeDialogOpen(false)}
        ariaLabel="发表 Like 评语"
      >
        <div className="dialog-head">
          <h2 className="dialog-title">Like 亮评</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setLikeDialogOpen(false)}
            aria-label="关闭"
          >
            <X size={17} />
          </button>
        </div>
        <div className="dialog-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="field-label">分值（-5 ~ +5）</label>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {[-5, -3, -1, 0, 1, 3, 5].map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`chip-btn mono ${likeScore === s ? 'active' : ''}`}
                  onClick={() => setLikeScore(s)}
                >
                  {s > 0 ? `+${s}` : s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="field-label" htmlFor="like-body-input">
              评语（最多 30 字）
            </label>
            <input
              id="like-body-input"
              className="text-input"
              maxLength={30}
              placeholder="写一句简短精炼的评语..."
              value={likeBody}
              onChange={(e) => setLikeBody(e.target.value)}
            />
          </div>
        </div>
        <div className="dialog-foot">
          {myLike ? (
            <button
              type="button"
              className="btn btn-danger"
              style={{ marginRight: 'auto' }}
              onClick={() => void handleRemoveLike()}
            >
              撤回我的 Like
            </button>
          ) : null}
          <button type="button" className="btn" onClick={() => setLikeDialogOpen(false)}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={likeSubmitting || !likeBody.trim()}
            onClick={() => void handleSubmitLike()}
          >
            {likeSubmitting ? '发送中...' : '发送 Like'}
          </button>
        </div>
      </ModalDialog>
    </div>
  );
}
