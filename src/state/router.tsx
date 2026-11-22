import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'favorites' }
  | { name: 'sections' }
  | { name: 'board'; boardId: string; boardName?: string; boardTitle?: string }
  | { name: 'topic'; topicId: string; boardName?: string; subject?: string; initialPage?: number }
  | { name: 'messages' }
  | { name: 'search'; initialKeyword?: string; initialBoard?: string }
  | { name: 'user'; username: string }
  | { name: 'settings' };

export type NavigationType = 'initial' | 'push' | 'pop';

function parseHash(rawHash: string): Route {
  const clean = rawHash.replace(/^#/, '') || '/';
  const [pathPart, queryPart] = clean.split('?');
  const params = new URLSearchParams(queryPart || '');
  const segs = pathPart.split('/').filter(Boolean);

  if (segs.length === 0) return { name: 'home' };
  const head = segs[0];
  if (head === 'favorites') return { name: 'favorites' };
  if (head === 'sections') return { name: 'sections' };
  if (head === 'messages') return { name: 'messages' };
  if (head === 'settings') return { name: 'settings' };
  if (head === 'search') {
    return {
      name: 'search',
      initialKeyword: params.get('q') || undefined,
      initialBoard: params.get('board') || undefined,
    };
  }
  if (head === 'board' && segs[1]) {
    return {
      name: 'board',
      boardId: decodeURIComponent(segs[1]),
      boardName: params.get('name') || undefined,
      boardTitle: params.get('title') || undefined,
    };
  }
  if (head === 'topic' && segs[1]) {
    const p = Number(params.get('page') || '1');
    return {
      name: 'topic',
      topicId: decodeURIComponent(segs[1]),
      boardName: params.get('board') || undefined,
      subject: params.get('subject') || undefined,
      initialPage: Number.isFinite(p) && p > 0 ? p : 1,
    };
  }
  if (head === 'user' && segs[1]) {
    return { name: 'user', username: decodeURIComponent(segs[1]) };
  }
  return { name: 'home' };
}

function serializeRoute(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'favorites':
      return '#/favorites';
    case 'sections':
      return '#/sections';
    case 'messages':
      return '#/messages';
    case 'settings':
      return '#/settings';
    case 'search': {
      const q = new URLSearchParams();
      if (route.initialKeyword) q.set('q', route.initialKeyword);
      if (route.initialBoard) q.set('board', route.initialBoard);
      const qs = q.toString();
      return `#/search${qs ? `?${qs}` : ''}`;
    }
    case 'board': {
      const q = new URLSearchParams();
      if (route.boardName) q.set('name', route.boardName);
      if (route.boardTitle) q.set('title', route.boardTitle);
      const qs = q.toString();
      return `#/board/${encodeURIComponent(route.boardId)}${qs ? `?${qs}` : ''}`;
    }
    case 'topic': {
      const q = new URLSearchParams();
      if (route.boardName) q.set('board', route.boardName);
      if (route.subject) q.set('subject', route.subject.slice(0, 60));
      if (route.initialPage && route.initialPage > 1) q.set('page', String(route.initialPage));
      const qs = q.toString();
      return `#/topic/${encodeURIComponent(route.topicId)}${qs ? `?${qs}` : ''}`;
    }
    case 'user':
      return `#/user/${encodeURIComponent(route.username)}`;
  }
}

interface RouterContextValue {
  route: Route;
  navigationType: NavigationType;
  canGoBack: boolean;
  canGoForward: boolean;
  navigate: (route: Route) => void;
  goBack: () => void;
  goForward: () => void;
}

const RouterContext = createContext<RouterContextValue | null>(null);

function readHistoryIdx(): number {
  const st = window.history.state as { xsmthIdx?: number } | null;
  return typeof st?.xsmthIdx === 'number' ? st.xsmthIdx : 0;
}

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ route: Route; navigationType: NavigationType }>(() => ({
    route: parseHash(window.location.hash),
    navigationType: 'initial',
  }));
  const currentIdxRef = useRef<number>(readHistoryIdx());
  const maxIdxRef = useRef<number>(currentIdxRef.current);
  const [canGoForward, setCanGoForward] = useState(false);

  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
    // Tag initial in-app history entry so ← never accidentally leaves the app
    const st = window.history.state as { xsmthIdx?: number } | null;
    if (typeof st?.xsmthIdx !== 'number') {
      window.history.replaceState({ xsmthIdx: 0 }, '', window.location.hash || '#/');
      currentIdxRef.current = 0;
      maxIdxRef.current = 0;
    }
  }, []);

  useEffect(() => {
    const syncFromHistory = () => {
      const idx = readHistoryIdx();
      currentIdxRef.current = idx;
      if (idx > maxIdxRef.current) maxIdxRef.current = idx;
      setCanGoForward(idx < maxIdxRef.current);
      setState({
        route: parseHash(window.location.hash),
        navigationType: 'pop',
      });
    };

    window.addEventListener('popstate', syncFromHistory);
    return () => window.removeEventListener('popstate', syncFromHistory);
  }, []);

  // Scroll to top ONLY on forward push navigation, AFTER old page has saved its scrollY
  useLayoutEffect(() => {
    if (state.navigationType === 'push') {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [state]);

  const navigate = useCallback((next: Route) => {
    const targetHash = serializeRoute(next);
    if ((window.location.hash || '#/') === targetHash) {
      setState({ route: next, navigationType: 'push' });
      window.scrollTo({ top: 0, behavior: 'instant' });
      return;
    }
    const nextIdx = currentIdxRef.current + 1;
    currentIdxRef.current = nextIdx;
    maxIdxRef.current = nextIdx;
    setCanGoForward(false);
    window.history.pushState({ xsmthIdx: nextIdx }, '', targetHash);
    setState({ route: next, navigationType: 'push' });
  }, []);

  const canGoBack =
    state.route.name === 'topic' || state.route.name === 'board' || state.route.name === 'user';

  const goBack = useCallback(() => {
    if (currentIdxRef.current > 0) {
      window.history.back();
    } else if (canGoBack) {
      navigate({ name: 'home' });
    }
  }, [canGoBack, navigate]);

  const goForward = useCallback(() => {
    if (currentIdxRef.current < maxIdxRef.current) {
      window.history.forward();
    }
  }, []);

  return (
    <RouterContext.Provider
      value={{
        route: state.route,
        navigationType: state.navigationType,
        canGoBack,
        canGoForward,
        navigate,
        goBack,
        goForward,
      }}
    >
      {children}
    </RouterContext.Provider>
  );
}

export function useRouter(): RouterContextValue {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter must be used inside RouterProvider');
  return ctx;
}
