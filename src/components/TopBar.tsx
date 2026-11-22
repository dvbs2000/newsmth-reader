import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronUp,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Menu,
  Moon,
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
  light: '日间灰阶',
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
  onOpenDrawer,
  onOpenCommand,
  rightSlot,
}: TopBarProps) {
  const { route, canGoBack, goBack } = useRouter();
  const { unread } = useAuth();
  const { prefs, cycleTheme, cycleImageMode } = useSettings();
  const { showToast } = useToast();

  const [expanded, setExpanded] = useState(false);
  const openScrollY = useRef(0);

  // Reset to collapsed dot whenever entering a thread or switching route
  useEffect(() => {
    setExpanded(false);
  }, [route]);

  // Auto-collapse floating bar back into the dot once the reader resumes scrolling/paging
  useEffect(() => {
    if (!collapsible || !expanded) return;
    openScrollY.current = window.scrollY;
    const onScroll = () => {
      if (Math.abs(window.scrollY - openScrollY.current) > 40) {
        setExpanded(false);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [collapsible, expanded]);

  const isDark =
    prefs.theme === 'dark' ||
    prefs.theme === 'oled' ||
    (prefs.theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  if (collapsible && !expanded) {
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

  return (
    <header className={`topbar ${collapsible ? 'topbar-floating' : ''}`}>
      <div className="topbar-inner">
        {canGoBack ? (
          <button
            type="button"
            className="icon-btn"
            onClick={goBack}
            aria-label="返回"
            title="返回 (Esc)"
          >
            <ArrowLeft size={18} strokeWidth={1.75} />
          </button>
        ) : (
          <button
            type="button"
            className="icon-btn"
            onClick={onOpenDrawer}
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

        <div className="topbar-actions">
          {rightSlot}
          <button
            type="button"
            className="icon-btn"
            onClick={() => {
              if (collapsible) setExpanded(false);
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
            title="切换日间/夜间/OLED (D)"
          >
            {isDark ? <Sun size={17} strokeWidth={1.75} /> : <Moon size={17} strokeWidth={1.75} />}
          </button>
          {collapsible ? (
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
    </header>
  );
}
