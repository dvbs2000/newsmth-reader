import { useLayoutEffect } from 'react';

export interface CachedView<T = unknown> {
  state: T;
  scrollY: number;
  savedAt: number;
}

const MAX_ENTRIES = 30;
const cache = new Map<string, CachedView<unknown>>();

export function getViewCache<T>(key: string): CachedView<T> | undefined {
  const entry = cache.get(key) as CachedView<T> | undefined;
  if (!entry) return undefined;
  // Refresh LRU order
  cache.delete(key);
  cache.set(key, entry);
  return entry;
}

export function setViewCache<T>(key: string, state: T, scrollY?: number): void {
  const prev = cache.get(key);
  cache.delete(key);
  cache.set(key, {
    state,
    scrollY: scrollY !== undefined ? scrollY : (prev?.scrollY ?? window.scrollY),
    savedAt: Date.now(),
  });
  if (cache.size > MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
}

export function saveViewScroll(key: string, scrollY = window.scrollY): void {
  const prev = cache.get(key);
  if (prev) {
    prev.scrollY = scrollY;
  }
}

export function clearViewCache(key: string): void {
  cache.delete(key);
}

/**
 * Tracks current scroll position into viewCache and restores saved scrollY
 * synchronously before paint when returning to a cached view via Back/Forward.
 */
export function useScrollMemory(key: string, shouldRestore: boolean, ready: boolean): void {
  // Restore synchronously before paint once cached content is mounted
  useLayoutEffect(() => {
    if (!shouldRestore || !ready) return;
    const entry = cache.get(key);
    if (!entry) return;
    const targetY = entry.scrollY;
    window.scrollTo({ top: targetY, behavior: 'instant' });
    // Safety frame in case fonts/layout finish settling right after mount
    const raf = requestAnimationFrame(() => {
      if (Math.abs(window.scrollY - targetY) > 4) {
        window.scrollTo({ top: targetY, behavior: 'instant' });
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [key, shouldRestore, ready]);

  // Continuously track scrollY while active, and capture final scrollY synchronously on unmount
  useLayoutEffect(() => {
    const onScroll = () => saveViewScroll(key, window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      saveViewScroll(key, window.scrollY);
      window.removeEventListener('scroll', onScroll);
    };
  }, [key]);
}
