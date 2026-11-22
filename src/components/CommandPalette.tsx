import { useEffect, useRef, useState } from 'react';
import { CornerDownLeft, Search, X } from 'lucide-react';
import { api } from '../api/client';
import { useRouter } from '../state/router';
import { useSettings } from '../state/settings';
import type { BoardObj } from '../types/smth';
import { ModalDialog } from './ModalDialog';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const { navigate } = useRouter();
  const { localData, recordBoardHistory } = useSettings();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BoardObj[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const kw = query.trim();
    if (!kw) {
      setResults([]);
      setActiveIdx(0);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const list = await api.searchBoards(kw);
        setResults(Array.isArray(list) ? list : []);
        setActiveIdx(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query, open]);

  const items = query.trim()
    ? results
    : localData.boardSearchHistory.map((h) => ({ id: h.id, name: h.name, title: h.title }));

  const selectBoard = (board: { id: string; name: string; title: string }) => {
    if (!board.id) return;
    recordBoardHistory(board);
    navigate({
      name: 'board',
      boardId: board.id,
      boardName: board.name,
      boardTitle: board.title,
    });
    onClose();
  };

  const jumpArticleSearch = () => {
    const kw = query.trim();
    if (!kw) return;
    navigate({ name: 'search', initialKeyword: kw });
    onClose();
  };

  return (
    <ModalDialog open={open} onClose={onClose} ariaLabel="版面直达与全站搜索">
      <div className="dialog-head" style={{ padding: '10px 14px', gap: 8 }}>
        <Search size={16} color="var(--text-muted)" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveIdx((i) => Math.min(items.length - 1, i + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIdx((i) => Math.max(0, i - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (items[activeIdx]) {
                selectBoard(items[activeIdx]);
              } else if (query.trim()) {
                jumpArticleSearch();
              }
            }
          }}
          placeholder="输入版面英文名或中文名直达（如 Apple / 汽车 / 房产）..."
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: '0.94rem',
          }}
        />
        <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
          <X size={16} />
        </button>
      </div>

      <div className="dialog-body" style={{ padding: '8px 10px' }}>
        {!query.trim() ? (
          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', padding: '4px 6px 6px' }}>
            {items.length > 0 ? '最近直达的版面' : '输入版面名快速直达，或直接回车搜索全站帖子'}
          </div>
        ) : null}

        {loading ? (
          <div className="empty-state" style={{ padding: 20 }}>
            检索中...
          </div>
        ) : items.length > 0 ? (
          <ul className="feed-list">
            {items.slice(0, 15).map((b, idx) => (
              <li
                key={`${b.id}-${b.name}`}
                className={`topic-row ${idx === activeIdx ? 'focused' : ''}`}
                style={{ padding: '9px 10px', flexDirection: 'row', alignItems: 'center' }}
                onClick={() => selectBoard(b)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.92rem', color: 'var(--text)' }}>{b.title || b.name}</div>
                  <div className="mono" style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                    {b.name}
                  </div>
                </div>
                <CornerDownLeft size={14} color="var(--text-muted)" />
              </li>
            ))}
          </ul>
        ) : query.trim() ? (
          <div className="empty-state" style={{ padding: 20 }}>
            未找到匹配版面
          </div>
        ) : null}

        {query.trim() ? (
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
            <button
              type="button"
              className="drawer-item"
              style={{ height: 36 }}
              onClick={jumpArticleSearch}
            >
              <Search size={15} />
              <span>全站搜索包含 “{query.trim()}” 的帖子</span>
            </button>
          </div>
        ) : null}
      </div>
    </ModalDialog>
  );
}
