import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronUp,
  Eye,
  EyeOff,
  Image as ImageIcon,
  LayoutList,
  Menu,
  Moon,
  Rows3,
  Search,
  Sun,
} from 'lucide-react';
import { useAuth } from '../state/auth';
import { useRouter } from '../state/router';
import { useSettings } from '../state/settings';
import { useToast } from './Toast';

interface TopBarProps {
  title: string;
  subtitle?: string;
  collapsible?: boolean;
  showListStyleToggle?: boolean;
  onOpenDrawer: () => void;
  onOpenCommand: () => void;
  rightSlot?: React.ReactNode;
}

const IMAGE_MODE_LABELS = {
  collapsed: '图控：折叠占位（点击切灰阶缩图）',
  stealth: '图控：灰阶缩图（点击切自动原图）',
  auto: '图控：自动显示（点击切折叠占位）',
};

const THEME_TOAST = {
  light: '日间柔灰',
  navy: '深海夜间',
  dark: '深灰夜间',
  oled: 'OLED 纯黑',
  system: '跟随系统',
};

const IMAGE_TOAST = {
  collapsed: '图片模式：纯文占位（防社死）',
  stealth: '图片模式：低饱和灰阶缩图',
  auto: '图片模式：自动加载原图',
};

export function TopBar({
  title,
  subtitle,
  collapsible = false,
  showListStyleToggle = false,
  onOpenDrawer,
  onOpenCommand,
  rightSlot,
}: TopBarProps) {
  const { route, canGoBack, goBack, navigate } = useRouter();
  const { unread } = useAuth();
  const { prefs, updatePrefs, cycleTheme, cycleImageMode } = useSettings();
  const { showToast } = useToast();

  const [expanded, setExpanded] = useState(false);
  const [scrolledPastBar, setScrolledPastBar] = useState(false);
  const openScrollY = useRef(0);

  // Reset overlay state whenever switching route
  useEffect(() => {
    setExpanded(false);
    setScrolledPastBar(window.scrollY > 56);
  }, [route]);

  // Show the subtle 6px micro-dot on list pages once the flowing topbar scrolls out of view
  useEffect(() => {
    if (collapsible) return;
    const onScroll = () => setScrolledPastBar(window.scrollY > 56);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [collapsible]);

  // Auto-collapse floating overlay bar once the reader resumes scrolling/paging
  useEffect(() => {
    if (!expanded) return;
    openScrollY.current = window.scrollY;
    const onScroll = () => {
      if (Math.abs(window.scrollY - openScrollY.current) > 40) {
        setExpanded(false);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [expanded]);

  const isDark =
    prefs.theme === 'navy' ||
    prefs.theme === 'dark' ||
    prefs.theme === 'oled' ||
    (prefs.theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  const renderBarContent = (isFloatingOverlay: boolean) => (
    <div className="topbar-inner">
      {canGoBack ? (
        <button
          type="button"
          className="icon-btn"
          onClick={goBack}
          aria-label="返回"
          title="返回 (← / Esc)"
        >
          <ArrowLeft size={18} strokeWidth={1.75} />
        </button>
      ) : (
        <button
          type="button"
          className="icon-btn"
          onClick={() => {
            if (isFloatingOverlay) setExpanded(false);
            onOpenDrawer();
          }}
          aria-label="打开导航抽屉"
          title="导航抽屉"
        >
          <Menu size={18} strokeWidth={1.75} />
          {unread.total > 0 ? <span className="dot-badge" aria-hidden="true" /> : null}
        </button>
      )}

      <div className="topbar-title-group">
        <h1 className="topbar-title">{title}</h1>
        {subtitle ? <span className="topbar-subtitle">{subtitle}</span> : null}
      </div>

      <nav className="zen-nav-links" aria-label="主导航">
        {(
          [
            ['home', '热点'],
            ['favorites', '收藏'],
            ['sections', '版面'],
            ['messages', unread.total > 0 ? `消息(${unread.total})` : '消息'],
          ] as Array<['home' | 'favorites' | 'sections' | 'messages', string]>
        ).map(([target, label]) => (
          <button
            key={target}
            type="button"
            className={`zen-nav-link ${route.name === target ? 'active' : ''}`}
            onClick={() => {
              if (isFloatingOverlay) setExpanded(false);
              navigate({ name: target });
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="topbar-actions">
        {rightSlot}
        {showListStyleToggle ? (
          <button
            type="button"
            className="icon-btn"
            onClick={() => {
              if (route.name === 'board') {
                const next = prefs.boardListStyle === 'compact' ? 'feed' : 'compact';
                updatePrefs({ boardListStyle: next });
                showToast(next === 'compact' ? '版面列表：紧凑纯标题' : '版面列表：摘要卡片');
              } else {
                const next = prefs.listStyle === 'feed' ? 'compact' : 'feed';
                updatePrefs({ listStyle: next });
                showToast(next === 'feed' ? '首页列表：摘要卡片流' : '首页列表：紧凑纯标题');
              }
            }}
            aria-label="切换摘要卡片或紧凑标题列表"
            title={
              (route.name === 'board' ? prefs.boardListStyle : prefs.listStyle) === 'feed'
                ? '当前：摘要卡片（点击切紧凑标题）'
                : '当前：紧凑标题（点击切摘要卡片）'
            }
          >
            {(route.name === 'board' ? prefs.boardListStyle : prefs.listStyle) === 'feed' ? (
              <LayoutList size={17} strokeWidth={1.75} />
            ) : (
              <Rows3 size={17} strokeWidth={1.75} />
            )}
          </button>
        ) : null}
        <button
          type="button"
          className="icon-btn"
          onClick={() => {
            if (isFloatingOverlay) setExpanded(false);
            onOpenCommand();
          }}
          aria-label="版面直达搜索"
          title="版面直达 (/)"
        >
          <Search size={17} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className={`icon-btn ${prefs.imageMode !== 'auto' ? 'active' : ''}`}
          onClick={() => {
            const next = cycleImageMode();
            showToast(IMAGE_TOAST[next]);
          }}
          aria-label="切换图片显示模式"
          title={`${IMAGE_MODE_LABELS[prefs.imageMode]} (I)`}
        >
          {prefs.imageMode === 'collapsed' ? (
            <EyeOff size={17} strokeWidth={1.75} />
          ) : prefs.imageMode === 'stealth' ? (
            <Eye size={17} strokeWidth={1.75} />
          ) : (
            <ImageIcon size={17} strokeWidth={1.75} />
          )}
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => {
            const next = cycleTheme();
            showToast(`主题：${THEME_TOAST[next]}`);
          }}
          aria-label="切换日间/夜间/OLED 主题"
          title="切换日间/深海夜/深灰/OLED (D)"
        >
          {isDark ? <Sun size={17} strokeWidth={1.75} /> : <Moon size={17} strokeWidth={1.75} />}
        </button>
        {isFloatingOverlay ? (
          <button
            type="button"
            className="icon-btn"
            onClick={() => setExpanded(false)}
            aria-label="收起顶栏为小点"
            title="收起顶栏"
          >
            <ChevronUp size={17} strokeWidth={1.75} />
          </button>
        ) : null}
      </div>
    </div>
  );

  // Thread reading page: fully collapsed to 6px micro-dot until clicked
  if (collapsible) {
    if (!expanded) {
      return (
        <button
          type="button"
          className="topbar-dot"
          onClick={() => setExpanded(true)}
          aria-label="展开顶栏菜单"
          title={`展开顶栏（${title} · 返回 · 搜索 · 图控 · 主题）`}
        >
          <span className="topbar-dot-core" aria-hidden="true" />
        </button>
      );
    }
    return <header className="topbar topbar-floating">{renderBarContent(true)}</header>;
  }

  // List & other pages: natural flowing topbar + 6px micro-dot appears once scrolled down
  return (
    <>
      <header className="topbar">{renderBarContent(false)}</header>
      {scrolledPastBar && !expanded ? (
        <button
          type="button"
          className="topbar-dot"
          onClick={() => setExpanded(true)}
          aria-label="展开顶栏菜单"
          title="展开导航与快捷栏"
        >
          <span className="topbar-dot-core" aria-hidden="true" />
        </button>
      ) : null}
      {scrolledPastBar && expanded ? (
        <header className="topbar topbar-floating">{renderBarContent(true)}</header>
      ) : null}
    </>
  );
}
