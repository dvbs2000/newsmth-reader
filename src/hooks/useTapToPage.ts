import { useCallback, useEffect, useRef } from 'react';

interface TapToPageOptions {
  enabled: boolean;
  /** 'full' = anywhere non-interactive (ThreadPage); 'margin' = empty whitespace & side margins (list pages) */
  zone: 'full' | 'margin';
  fontSize: number;
  /** Changing this key starts a brief grace window so opening a page via click/double-click never triggers a page turn */
  routeKey: string;
  onReachBottom?: () => void;
}

const INTERACTIVE_SELECTOR = [
  'a',
  'button',
  'input',
  'textarea',
  'select',
  'label',
  'summary',
  '[role="button"]',
  '[contenteditable="true"]',
  '.topbar',
  '.topbar-dot',
  '.drawer-panel',
  '.drawer-backdrop',
  'dialog',
  '.subtabs',
  '.thread-controls',
  '.floor-actions',
  '.floor-hover-actions',
  '.floor-more-btn',
  '.floor-mobile-actions',
  '.new-posts-pill',
  '.quote-toggle',
  '.stealth-pill',
  '.stealth-thumb-btn',
  '.full-img-btn',
  '.floor-author',
  '.board-pill',
  '.board-card',
  '.inline-search',
  '.chip-btn',
  '.btn',
  '.icon-btn',
  '.segmented',
].join(',');

/**
 * E-book style instant tap-to-page:
 * - Click bottom half -> instant jump down keeping >= 1 full repeated line
 * - Click top half    -> instant jump up   keeping >= 1 full repeated line
 * Never hijacks interactive controls, text selections, drags, or open dialogs.
 */
export function useTapToPage({
  enabled,
  zone,
  fontSize,
  routeKey,
  onReachBottom,
}: TapToPageOptions) {
  const downPos = useRef<{ x: number; y: number } | null>(null);
  const reachBottomRef = useRef(onReachBottom);
  reachBottomRef.current = onReachBottom;
  const routeEnteredAtRef = useRef<number>(Date.now());

  useEffect(() => {
    routeEnteredAtRef.current = Date.now();
  }, [routeKey]);

  const turnPage = useCallback(
    (direction: 'up' | 'down') => {
      const topbarEl = document.querySelector('.topbar') as HTMLElement | null;
      const topbarH = topbarEl ? topbarEl.getBoundingClientRect().height : 0;
      // Guarantee >= 1 complete unclipped line repeats even when bottom line is half-cut (~2.4 line-heights)
      const lineOverlap = Math.max(64, Math.round(fontSize * 4.2));
      const step = Math.max(120, Math.round(window.innerHeight - topbarH - lineOverlap));

      if (direction === 'down') {
        const remaining =
          document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
        if (remaining <= 80 && reachBottomRef.current) {
          reachBottomRef.current();
        }
        window.scrollBy({ top: step, behavior: 'instant' });
      } else {
        window.scrollBy({ top: -step, behavior: 'instant' });
      }
    },
    [fontSize],
  );

  useEffect(() => {
    if (!enabled) return;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) {
        downPos.current = null;
        return;
      }
      downPos.current = { x: e.clientX, y: e.clientY };
    };

    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      // Ignore double-clicks and stray clicks right after navigating into a new page
      if (e.detail >= 2 || Date.now() - routeEnteredAtRef.current < 380) return;
      if (document.querySelector('dialog[open]') || document.querySelector('.drawer-panel.open')) {
        return;
      }

      // Ignore drag / text selection
      if (downPos.current) {
        const dx = Math.abs(e.clientX - downPos.current.x);
        const dy = Math.abs(e.clientY - downPos.current.y);
        if (dx > 6 || dy > 6) return;
      }
      const selection = window.getSelection()?.toString().trim();
      if (selection && selection.length > 0) return;

      const target = e.target as HTMLElement | null;
      // Ignore clicks whose target was already unmounted during navigation
      if (!target || !target.isConnected) return;

      // Ignore topbar zone when expanded; use 0 when collapsed into floating dot
      const topbarEl = document.querySelector('.topbar') as HTMLElement | null;
      const topbarH = topbarEl ? topbarEl.getBoundingClientRect().height : 0;
      if (topbarH > 0 && e.clientY <= topbarH) return;

      if (target.closest(INTERACTIVE_SELECTOR)) return;
      if (zone === 'margin' && target.closest('.topic-row, .setting-row, .chat-bubble')) {
        return;
      }

      turnPage(e.clientY >= window.innerHeight / 2 ? 'down' : 'up');
    };

    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('click', onClick);
    };
  }, [enabled, zone, turnPage]);
}
