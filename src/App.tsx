import { useCallback, useEffect, useState } from 'react';
import { CommandPalette } from './components/CommandPalette';
import { LeftDrawer } from './components/LeftDrawer';
import { LoginDialog } from './components/LoginDialog';
import { ShortcutsDialog } from './components/ShortcutsDialog';
import { ToastProvider, useToast } from './components/Toast';
import { TopBar } from './components/TopBar';
import { ZhihuZenControls } from './components/ZhihuZenControls';
import { useTapToPage } from './hooks/useTapToPage';
import { BoardPage } from './pages/BoardPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { HomePage } from './pages/HomePage';
import { MessagesPage } from './pages/MessagesPage';
import { SearchPage } from './pages/SearchPage';
import { SectionsPage } from './pages/SectionsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ThreadPage } from './pages/ThreadPage';
import { UserPage } from './pages/UserPage';
import { AuthProvider } from './state/auth';
import { RouterProvider, useRouter } from './state/router';
import { SettingsProvider, useSettings } from './state/settings';

const THEME_LABEL = {
  light: '日间柔灰',
  navy: '深海夜间',
  dark: '深灰夜间',
  oled: 'OLED 纯黑',
  system: '跟随系统',
};

const IMAGE_LABEL = {
  collapsed: '纯文占位（防社死）',
  stealth: '灰阶缩图',
  auto: '自动显示原图',
};

function AppShell() {
  const { route, canGoBack, goBack, goForward } = useRouter();
  const { prefs, cycleTheme, cycleImageMode } = useSettings();
  const { showToast } = useToast();

  const routeKey =
    route.name === 'topic'
      ? `topic:${route.topicId}`
      : route.name === 'board'
        ? `board:${route.boardId}`
        : route.name === 'user'
          ? `user:${route.username}`
          : route.name;

  useTapToPage({
    enabled: prefs.tapToPage && route.name !== 'settings',
    keyboardEnabled: route.name !== 'settings',
    zone: route.name === 'topic' ? 'full' : 'margin',
    fontSize: prefs.fontSize,
    routeKey,
    onReachBottom: () => window.dispatchEvent(new Event('xsmth:load-more')),
  });

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [dynamicHeader, setDynamicHeader] = useState<{ title: string; subtitle?: string } | null>(
    null,
  );

  useEffect(() => {
    setDynamicHeader(null);
  }, [route]);

  const handleUpdateHeader = useCallback((title: string, subtitle?: string) => {
    setDynamicHeader({ title, subtitle });
  }, []);

  // Global keyboard dispatcher
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inEditable = Boolean(
        target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable),
      );
      const hasOpenDialog = Boolean(document.querySelector('dialog[open]'));

      if (e.key === 'Escape') {
        if (hasOpenDialog) return;
        if (drawerOpen) {
          e.preventDefault();
          setDrawerOpen(false);
          return;
        }
        if (canGoBack && !inEditable) {
          e.preventDefault();
          goBack();
        }
        return;
      }

      if (inEditable || hasOpenDialog || drawerOpen || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'ArrowLeft' && !e.shiftKey) {
        e.preventDefault();
        goBack();
      } else if (e.key === 'ArrowRight' && !e.shiftKey) {
        e.preventDefault();
        goForward();
      } else if (e.key === '/') {
        e.preventDefault();
        setCommandOpen(true);
      } else if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        const next = cycleTheme();
        showToast(`主题：${THEME_LABEL[next]}`);
      } else if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        const next = cycleImageMode();
        showToast(`图片模式：${IMAGE_LABEL[next]}`);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen, canGoBack, goBack, goForward, cycleTheme, cycleImageMode, showToast]);

  let title = 'xsmth';
  let subtitle: string | undefined;

  switch (route.name) {
    case 'home':
      title = '水木热点';
      break;
    case 'favorites':
      title = '我的收藏';
      break;
    case 'sections':
      title = '全部分区';
      break;
    case 'board':
      title = dynamicHeader?.title || route.boardTitle || route.boardName || '版面';
      subtitle = dynamicHeader?.subtitle || route.boardName;
      break;
    case 'topic':
      title = dynamicHeader?.title || route.boardName || '帖子详情';
      subtitle = dynamicHeader?.subtitle;
      break;
    case 'messages':
      title = '消息中心';
      break;
    case 'search':
      title = '全站搜索';
      break;
    case 'user':
      title = route.username;
      subtitle = '用户主页';
      break;
    case 'settings':
      title = '偏好设置';
      break;
  }

  return (
    <div className="app-shell">
      <TopBar
        title={title}
        subtitle={subtitle}
        collapsible={route.name === 'topic'}
        showListStyleToggle={route.name === 'home' || route.name === 'board'}
        onOpenDrawer={() => setDrawerOpen(true)}
        onOpenCommand={() => setCommandOpen(true)}
      />

      <main className="main-col">
        {route.name === 'home' ? (
          <HomePage onOpenCommand={() => setCommandOpen(true)} />
        ) : route.name === 'board' ? (
          <BoardPage
            key={route.boardId}
            boardId={route.boardId}
            initialName={route.boardName}
            initialTitle={route.boardTitle}
            onUpdateHeader={handleUpdateHeader}
          />
        ) : route.name === 'topic' ? (
          <ThreadPage
            key={route.topicId}
            topicId={route.topicId}
            initialBoardName={route.boardName}
            initialSubject={route.subject}
            initialPage={route.initialPage}
            onUpdateHeader={handleUpdateHeader}
          />
        ) : (
          <div className="paper-sheet">
            {route.name === 'favorites' ? (
              <FavoritesPage />
            ) : route.name === 'sections' ? (
              <SectionsPage />
            ) : route.name === 'messages' ? (
              <MessagesPage />
            ) : route.name === 'search' ? (
              <SearchPage
                key={`${route.initialKeyword || ''}:${route.initialBoard || ''}`}
                initialKeyword={route.initialKeyword}
                initialBoard={route.initialBoard}
              />
            ) : route.name === 'user' ? (
              <UserPage key={route.username} username={route.username} />
            ) : (
              <SettingsPage />
            )}
          </div>
        )}
      </main>

      <ZhihuZenControls />

      <LeftDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <LoginDialog />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <SettingsProvider>
        <AuthProvider>
          <RouterProvider>
            <AppShell />
          </RouterProvider>
        </AuthProvider>
      </SettingsProvider>
    </ToastProvider>
  );
}
