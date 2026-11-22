import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useRouter } from '../state/router';
import { useSettings } from '../state/settings';
import type { BoardObj, SectionObj } from '../types/smth';

export function SectionsPage() {
  const { navigate } = useRouter();
  const { recordBoardHistory } = useSettings();
  const [sections, setSections] = useState<SectionObj[]>([]);
  const [activeId, setActiveId] = useState('');
  const [boards, setBoards] = useState<BoardObj[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSections()
      .then((res) => {
        const list = res.sections || [];
        setSections(list);
        if (list.length > 0) setActiveId(list[0].id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : '加载分区失败'));
  }, []);

  useEffect(() => {
    if (!activeId) return;
    setLoading(true);
    setError(null);
    api
      .getSectionBoards(activeId)
      .then((res) => setBoards(res.boards || []))
      .catch((err) => setError(err instanceof Error ? err.message : '加载版面失败'))
      .finally(() => setLoading(false));
  }, [activeId]);

  return (
    <div>
      <div className="subtabs">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`subtab ${activeId === s.id ? 'active' : ''}`}
            onClick={() => setActiveId(s.id)}
          >
            {s.name}
          </button>
        ))}
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      {loading ? (
        <div className="empty-state">加载版面目录...</div>
      ) : boards.length === 0 ? (
        <div className="empty-state">该分区下暂无版面</div>
      ) : (
        <div className="board-grid">
          {boards.map((b) => (
            <button
              key={b.id}
              type="button"
              className="board-card"
              onClick={() => {
                recordBoardHistory({ id: b.id, name: b.name, title: b.title || b.name });
                navigate({
                  name: 'board',
                  boardId: b.id,
                  boardName: b.name,
                  boardTitle: b.title || b.name,
                });
              }}
            >
              <span className="board-card-title">{b.title || b.name}</span>
              <span className="board-card-name">
                {b.name}
                {b.todayPostCount !== undefined ? ` · 今日 ${b.todayPostCount}` : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
