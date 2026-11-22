import { stripHtmlTags } from '../utils/content';
import { formatCount, formatRelativeTime } from '../utils/format';
import type { TopicObj } from '../types/smth';

interface TopicRowProps {
  topic: TopicObj;
  rank?: number;
  tag?: string;
  read?: boolean;
  focused?: boolean;
  showBoard?: boolean;
  onOpenTopic: (topic: TopicObj) => void;
  onOpenBoard?: (boardId: string, boardName: string, boardTitle: string) => void;
}

export function TopicRow({
  topic,
  rank,
  tag,
  read,
  focused,
  showBoard = true,
  onOpenTopic,
  onOpenBoard,
}: TopicRowProps) {
  const title = stripHtmlTags(topic.subject || topic.article?.subject || '(无标题)');
  const author =
    topic.article?.account?.name ||
    topic.firstAccount?.name ||
    '';
  const replies = Math.max(0, (topic.availables ?? 1) - 1);
  const likes = topic.likeAvailables ?? 0;
  const time = topic.lastPostTime || topic.flushTime || topic.article?.postTime;
  const board = topic.board;

  return (
    <li
      className={`topic-row ${read ? 'read' : ''} ${focused ? 'focused' : ''}`}
      onClick={() => onOpenTopic(topic)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onOpenTopic(topic);
        }
      }}
    >
      <div className="topic-row-head">
        {rank !== undefined ? (
          <span className="topic-rank">{String(rank).padStart(2, '0')}</span>
        ) : null}
        <h2 className="topic-title">
          {tag ? <span className="topic-tag">[{tag}]</span> : null}
          {title}
        </h2>
      </div>

      <div className={`topic-meta ${rank !== undefined ? 'indented' : ''}`}>
        {showBoard && board?.name ? (
          <button
            type="button"
            className="board-pill"
            onClick={(e) => {
              e.stopPropagation();
              onOpenBoard?.(board.id, board.name, board.title || board.name);
            }}
          >
            {board.title || board.name}
          </button>
        ) : null}
        {author ? <span>{author}</span> : null}
        <span>{formatCount(replies)} 回</span>
        {likes > 0 ? <span>{likes} 赞</span> : null}
        {time ? <span style={{ marginLeft: 'auto' }}>{formatRelativeTime(time)}</span> : null}
      </div>
    </li>
  );
}
