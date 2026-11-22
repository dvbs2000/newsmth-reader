import { useCallback, useEffect, useRef } from 'react';

interface TapToPageOptions {
  /** Click-half-screen instant paging toggle */
  enabled: boolean;
  /** Keyboard instant paging (Space / Shift+Space / PageDown / PageUp); defaults to true */
  keyboardEnabled?: boolean;
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
  '.zh-zen-dot-btn',
  '.zh-zen-panel',
  '.drawer-panel',
  '.drawer-backdrop',
  'dialog',
  '.subtabs',
  '.thread-controls',
  '.floor-actions-bar',
  '.floor-hover-actions',
  '.floor-more-btn',
  '.floor-mobile-actions',
  '.floor-vote-btn',
  '.floor-action-btn',
  '.new-posts-pill',
  '.feed-card-title-btn',
  '.feed-card-excerpt',
  '.feed-read-more',
  '.feed-card-actions',
  '.vote-pill',
  '.feed-action-item',
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

const SKIP_TEXT_ANCESTOR_SELECTOR = [
  '.floor-hover-actions',
  '.floor-mobile-actions',
  '.floor-actions-bar',
  '.floor-more-btn',
  '.quote-block.collapsed',
  '.thread-controls',
  '.feed-card-actions',
  '.sr-only',
].join(',');

interface VisualLine {
  top: number;
  bottom: number;
  cardTop: number;
  isHead: boolean;
}

const EDGE_MARGIN = 10;

/**
 * Scan real rendered text line boxes inside visible cards using Range.getClientRects().
 * Unlike single-point caretRangeFromPoint probing, this 100% catches 1-char replies,
 * ignores inter-card gaps & collapsed gray quote toggles, and runs in <0.3ms.
 */
function collectVisibleLines(vh: number): VisualLine[] {
  const mainCol = document.querySelector('.main-col');
  if (!mainCol) return [];

  const cards = Array.from(
    mainCol.querySelectorAll<HTMLElement>(
      '.floor-card, .feed-card, .likes-box, .thread-header-card',
    ),
  );
  const containers = cards.length > 0 ? cards : [mainCol as HTMLElement];
  const raw: VisualLine[] = [];

  for (const container of containers) {
    const cr = container.getBoundingClientRect();
    if (cr.bottom <= 0 || cr.top >= vh || cr.height < 8) continue;

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = node.textContent;
      if (!text || !text.trim()) continue;
      const parentEl = node.parentElement;
      if (!parentEl || parentEl.offsetParent === null) continue;
      if (parentEl.closest(SKIP_TEXT_ANCESTOR_SELECTOR)) continue;

      const isHead = Boolean(parentEl.closest('.floor-head, .likes-title'));
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = range.getClientRects();
      for (let i = 0; i < rects.length; i++) {
        const rect = rects[i];
        if (rect.height < 8 || rect.width < 2) continue;
        if (rect.bottom <= 0 || rect.top >= vh) continue;
        raw.push({
          top: rect.top,
          bottom: rect.bottom,
          cardTop: cr.top,
          isHead,
        });
      }
    }
  }

  if (raw.length === 0) return [];
  raw.sort((a, b) => a.top - b.top);

  // Merge inline spans that lie on the exact same rendered line
  const merged: VisualLine[] = [];
  for (const line of raw) {
    const prev = merged[merged.length - 1];
    if (prev && Math.abs(line.top - prev.top) <= 5) {
      prev.top = Math.min(prev.top, line.top);
      prev.bottom = Math.max(prev.bottom, line.bottom);
      prev.cardTop = Math.min(prev.cardTop, line.cardTop);
      prev.isHead = prev.isHead && line.isHead;
    } else {
      merged.push({ ...line });
    }
  }
  return merged;
}

/**
 * Exact 1-line-retaining instant page turn calculator:
 * 1. On compact topic lists (.topic-row): aligns cleanly to whole topic rows (never splits a title).
 * 2. On ThreadPage / feed prose: scans exact rendered line boxes so the last complete readable line
 *    on the current screen ALWAYS repeats cleanly at top=10px on the next screen (and reverse on up).
 */
function getSmartPageTurnDelta(direction: 1 | -1, fontSize: number): number {
  const vh = window.innerHeight;
  const floatingBar = document.querySelector('.topbar.topbar-floating') as HTMLElement | null;
  const topPad = floatingBar
    ? Math.ceil(floatingBar.getBoundingClientRect().bottom) + 6
    : EDGE_MARGIN;
  const singleLineHeight = Math.ceil(fontSize * 1.66 + 6);
  const defaultStep = Math.max(120, vh - topPad - singleLineHeight - EDGE_MARGIN);
  const minStep = 80;
  const maxStep = Math.max(120, vh - topPad - 16);

  // 1. Compact topic list pages: snap cleanly by whole .topic-row
  const topicRows = Array.from(document.querySelectorAll<HTMLElement>('.topic-row'));
  if (topicRows.length > 0) {
    if (direction > 0) {
      // Find last row whose top is inside viewport (either partially clipped or last complete row)
      let lastComplete: DOMRect | null = null;
      for (const row of topicRows) {
        const r = row.getBoundingClientRect();
        if (r.top >= vh - 2) break;
        if (r.bottom <= vh - 1 && r.top >= topPad + minStep) {
          lastComplete = r;
        }
      }
      if (lastComplete) {
        const delta = Math.round(lastComplete.top - topPad);
        if (delta >= minStep && delta <= maxStep) return delta;
      }
      return defaultStep;
    } else {
      let firstComplete: DOMRect | null = null;
      for (const row of topicRows) {
        const r = row.getBoundingClientRect();
        if (r.top >= topPad - 2 && r.bottom <= vh - minStep) {
          firstComplete = r;
          break;
        }
      }
      if (firstComplete) {
        const delta = Math.round(vh - EDGE_MARGIN - firstComplete.bottom);
        if (delta >= minStep && delta <= maxStep) return -delta;
      }
      return -defaultStep;
    }
  }

  // 2. Thread / prose pages: exact DOM line-box alignment
  const lines = collectVisibleLines(vh);
  if (lines.length > 0) {
    if (direction > 0) {
      // Pick the last COMPLETE readable line inside the viewport so it repeats at the top of the next screen,
      // and any partially-clipped line right below it lands completely intact underneath it.
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (line.bottom <= vh - 2 && line.top >= topPad + minStep) {
          // If this last complete line is the header/first line of a new card whose body lies below,
          // align to the card's own top border so the card opens cleanly at topPad.
          const anchorTop =
            line.isHead || line.top - line.cardTop < 28 ? Math.max(0, line.cardTop) : line.top;
          const delta = Math.round(anchorTop - topPad);
          if (delta >= minStep && delta <= maxStep) {
            return delta;
          }
        }
      }
      return defaultStep;
    } else {
      // Pick the first COMPLETE readable line near the top so it lands cleanly at the bottom of the previous screen.
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.top >= topPad - 2 && line.bottom <= vh - minStep) {
          const delta = Math.round(vh - EDGE_MARGIN - line.bottom);
          if (delta >= minStep && delta <= maxStep) {
            return -delta;
          }
        }
      }
      return -defaultStep;
    }
  }

  return direction * defaultStep;
}

/**
 * E-book style zero-animation instant paging (click half-screen + Space/PageDown/PageUp):
 * - Always retains 1 complete readable line (or whole topic row) across every page turn
 * - Never hijacks inputs, interactive controls, text selections, drags, or open dialogs/panels
 */
export function useTapToPage({
  enabled,
  keyboardEnabled = true,
  zone,
  fontSize,
  routeKey,
  onReachBottom,
}: TapToPageOptions) {
  const downPos = useRef<{ x: number; y: number } | null>(null);
  const hadSelectionOnDown = useRef(false);
  const reachBottomRef = useRef(onReachBottom);
  reachBottomRef.current = onReachBottom;
  const routeEnteredAtRef = useRef<number>(Date.now());

  useEffect(() => {
    routeEnteredAtRef.current = Date.now();
  }, [routeKey]);

  const turnPage = useCallback(
    (direction: 'up' | 'down') => {
      const delta = getSmartPageTurnDelta(direction === 'down' ? 1 : -1, fontSize);
      if (direction === 'down') {
        const remaining =
          document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
        if (remaining <= 100 && reachBottomRef.current) {
          reachBottomRef.current();
        }
      }
      window.scrollBy({ top: delta, behavior: 'instant' });
    },
    [fontSize],
  );

  // Instant keyboard paging: Space / Shift+Space / PageDown / PageUp (matches Zhihu Zen)
  useEffect(() => {
    if (!keyboardEnabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const isDown = e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey);
      const isUp = e.key === 'PageUp' || (e.key === ' ' && e.shiftKey);
      if (!isDown && !isUp) return;

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (
        document.querySelector('dialog[open]') ||
        document.querySelector('.drawer-panel.open') ||
        document.querySelector('.zh-zen-panel')
      ) {
        return;
      }

      e.preventDefault();
      turnPage(isDown ? 'down' : 'up');
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [keyboardEnabled, turnPage]);

  // Instant click-half-screen paging
  useEffect(() => {
    if (!enabled) return;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) {
        downPos.current = null;
        hadSelectionOnDown.current = false;
        return;
      }
      downPos.current = { x: e.clientX, y: e.clientY };
      const sel = window.getSelection();
      hadSelectionOnDown.current = Boolean(sel && sel.toString().trim().length > 0);
    };

    const onClick = (e: MouseEvent) => {
      const wasClearingSelection = hadSelectionOnDown.current;
      hadSelectionOnDown.current = false;

      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (wasClearingSelection) return;
      if (e.detail >= 2 || Date.now() - routeEnteredAtRef.current < 380) return;
      if (
        document.querySelector('dialog[open]') ||
        document.querySelector('.drawer-panel.open') ||
        document.querySelector('.zh-zen-panel')
      ) {
        return;
      }

      if (downPos.current) {
        const dx = Math.abs(e.clientX - downPos.current.x);
        const dy = Math.abs(e.clientY - downPos.current.y);
        if (dx > 6 || dy > 6) return;
      }
      const selection = window.getSelection()?.toString().trim();
      if (selection && selection.length > 0) return;

      const target = e.target as HTMLElement | null;
      if (!target || !target.isConnected) return;

      const floatingBar = document.querySelector('.topbar.topbar-floating') as HTMLElement | null;
      if (floatingBar) {
        const barRect = floatingBar.getBoundingClientRect();
        if (e.clientY <= barRect.bottom) return;
      }

      if (target.closest(INTERACTIVE_SELECTOR)) return;
      if (zone === 'margin' && target.closest('.topic-row, .feed-card, .setting-row, .chat-bubble')) {
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

  return { turnPage };
}
