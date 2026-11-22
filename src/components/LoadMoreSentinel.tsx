import { useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';

interface LoadMoreSentinelProps {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  /** Optional handler when already at end: tapping bottom or clicking button checks for newly posted replies */
  onCheckNew?: () => void;
  checkingNew?: boolean;
  summary?: string;
  doneText?: string;
}

export function LoadMoreSentinel({
  hasMore,
  loading,
  onLoadMore,
  onCheckNew,
  checkingNew = false,
  summary,
  doneText = '— 已经到底 —',
}: LoadMoreSentinelProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const cbRef = useRef(onLoadMore);
  cbRef.current = onLoadMore;
  const checkNewRef = useRef(onCheckNew);
  checkNewRef.current = onCheckNew;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          cbRef.current();
        }
      },
      { rootMargin: '420px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading]);

  // Tap lower half at bottom -> load next page if hasMore, or incrementally fetch new replies if at end!
  useEffect(() => {
    const onManualTrigger = () => {
      if (hasMore && !loading) {
        cbRef.current();
      } else if (!hasMore && !loading && !checkingNew && checkNewRef.current) {
        checkNewRef.current();
      }
    };
    window.addEventListener('xsmth:load-more', onManualTrigger);
    return () => window.removeEventListener('xsmth:load-more', onManualTrigger);
  }, [hasMore, loading, checkingNew]);

  return (
    <div ref={sentinelRef} className="pager" style={{ flexDirection: 'column', gap: 6 }}>
      {loading ? (
        <span style={{ color: 'var(--text-subtle)', fontSize: '0.78rem' }}>正在自动加载下一页...</span>
      ) : hasMore ? (
        <button
          type="button"
          className="chip-btn"
          onClick={() => cbRef.current()}
          style={{ fontSize: '0.76rem' }}
        >
          下滑自动加载更多{summary ? `（${summary}）` : ''}
        </button>
      ) : onCheckNew ? (
        <button
          type="button"
          className="chip-btn"
          disabled={checkingNew}
          onClick={() => checkNewRef.current?.()}
          style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}
        >
          <RefreshCw size={12} />
          {checkingNew
            ? '正在检查新回复...'
            : `${summary ? `${summary} · ` : ''}已到底部，点击检查新回复`}
        </button>
      ) : (
        <span style={{ color: 'var(--text-subtle)', fontSize: '0.76rem' }}>
          {summary ? `${summary} · ` : ''}
          {doneText}
        </span>
      )}
    </div>
  );
}
