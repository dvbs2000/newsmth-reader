import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, MessageCircle, ThumbsUp } from 'lucide-react';
import { api } from '../api/client';
import { useSettings } from '../state/settings';
import type { ArticleObj, TopicObj } from '../types/smth';
import { extractFeedExcerpt, parseArticleBody, splitLinks, stripHtmlTags } from '../utils/content';
import { formatCount, formatRelativeTime } from '../utils/format';
import { StealthImage } from './StealthImage';

interface TopicRowProps {
  topic: TopicObj;
  rank?: number;
  tag?: string;
  read?: boolean;
  focused?: boolean;
  showBoard?: boolean;
  listStyle?: 'feed' | 'compact';
  onOpenTopic: (topic: TopicObj) => void;
  onOpenBoard?: (boardId: string, boardName: string, boardTitle: string) => void;
  onOpenLightbox?: (urls: string[], index: number) => void;
}

export function TopicRow({
  topic,
  rank,
  tag,
  read,
  focused,
  showBoard = true,
  listStyle = 'feed',
  onOpenTopic,
  onOpenBoard,
  onOpenLightbox,
}: TopicRowProps) {
  const { prefs } = useSettings();
  const [expanded, setExpanded] = useState(false);
  const [loadingFull, setLoadingFull] = useState(false);
  const [fullArticle, setFullArticle] = useState<ArticleObj | null>(null);

  const title = stripHtmlTags(topic.subject || topic.article?.subject || '(无标题)');
  const author = topic.article?.account?.name || topic.firstAccount?.name || '';
  const replies = Math.max(0, (topic.availables ?? 1) - 1);
  const likes = topic.likeAvailables ?? 0;
  const time = topic.lastPostTime || topic.flushTime || topic.article?.postTime;
  const board = topic.board;

  const excerpt = useMemo(
    () => extractFeedExcerpt(topic.article?.body, 118),
    [topic.article?.body],
  );

  const expandedParsed = useMemo(() => {
    if (!expanded) return null;
    const raw = fullArticle?.body || topic.article?.body || '';
    return parseArticleBody(raw, prefs.stripSignature);
  }, [expanded, fullArticle?.body, topic.article?.body, prefs.stripSignature]);

  const expandedImages = useMemo(() => {
    if (!expanded) return [];
    const list: Array<{ url: string; label?: string }> = [];
    const seen = new Set<string>();
    const sourceArt = fullArticle || topic.article;
    for (const att of sourceArt?.attachments || []) {
      const url = att.ks3Url || att.cdnUrl || att.url;
      if (url && (!att.type || att.type.startsWith('image/')) && !seen.has(url)) {
        seen.add(url);
        list.push({ url, label: att.name });
      }
    }
    for (const inline of expandedParsed?.inlineImages || []) {
      if (!seen.has(inline)) {
        seen.add(inline);
        list.push({ url: inline });
      }
    }
    return list;
  }, [expanded, fullArticle, topic.article, expandedParsed?.inlineImages]);

  const handleToggleExpand = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (!fullArticle && excerpt.truncated) {
      setLoadingFull(true);
      try {
        const res = await api.getTopicDetail(topic.id);
        if (res.topic?.article) {
          setFullArticle(res.topic.article);
        }
      } catch {
        // Fallback to list excerpt body if detail fetch fails
      } finally {
        setLoadingFull(false);
      }
    }
  };

  if (listStyle === 'compact') {
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

  // Default Zhihu-Zen rich excerpt card
  const rawImgUrls = expandedImages.map((i) => i.url);

  return (
    <li
      className={`feed-card ${read ? 'read' : ''} ${focused ? 'focused' : ''}`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onOpenTopic(topic);
        }
      }}
    >
      <button
        type="button"
        className="feed-card-title-btn"
        onClick={() => onOpenTopic(topic)}
      >
        {rank !== undefined ? (
          <span className="topic-rank">{String(rank).padStart(2, '0')}</span>
        ) : null}
        <h2 className="feed-card-title">
          {tag ? <span className="topic-tag">[{tag}]</span> : null}
          {title}
        </h2>
      </button>

      {!expanded && excerpt.text ? (
        <div className="feed-card-excerpt" onClick={() => onOpenTopic(topic)}>
          {author ? <span className="feed-excerpt-author">{author}：</span> : null}
          <span>{excerpt.text}</span>
          {excerpt.truncated ? (
            <button
              type="button"
              className="feed-read-more"
              onClick={(e) => void handleToggleExpand(e)}
            >
              阅读全文
              <ChevronDown size={14} />
            </button>
          ) : null}
        </div>
      ) : null}

      {expanded ? (
        <div className="feed-expanded-body">
          {loadingFull ? (
            <span style={{ color: 'var(--text-subtle)', fontSize: '0.88rem' }}>正在展开主帖...</span>
          ) : (
            <>
              {(expandedParsed?.segments || []).map((seg, idx) =>
                seg.type === 'text' ? (
                  <p key={idx} className="floor-paragraph">
                    {idx === 0 && author ? (
                      <span className="feed-excerpt-author">{author}：</span>
                    ) : null}
                    {splitLinks(seg.content).map((run, rIdx) =>
                      run.type === 'link' && run.href ? (
                        <a
                          key={rIdx}
                          href={run.href}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {run.text}
                        </a>
                      ) : (
                        <span key={rIdx}>{run.text}</span>
                      ),
                    )}
                  </p>
                ) : null,
              )}

              {expandedImages.length > 0 ? (
                <div className="floor-images">
                  {expandedImages.map((img, idx) => (
                    <StealthImage
                      key={img.url}
                      rawUrl={img.url}
                      index={idx}
                      label={img.label}
                      mode={prefs.imageMode}
                      onOpenLightbox={() => onOpenLightbox?.(rawImgUrls, idx)}
                    />
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      <div className="feed-card-actions">
        {likes > 0 ? (
          <button
            type="button"
            className="vote-pill"
            onClick={() => onOpenTopic(topic)}
            title="查看亮评与帖子详情"
          >
            <ThumbsUp size={13} />
            <span>赞同 {likes}</span>
          </button>
        ) : (
          <button
            type="button"
            className="vote-pill"
            onClick={() => onOpenTopic(topic)}
            title="进入帖子讨论"
          >
            <MessageCircle size={13} />
            <span>{formatCount(replies)} 条回复</span>
          </button>
        )}

        {likes > 0 ? (
          <button
            type="button"
            className="feed-action-item"
            onClick={() => onOpenTopic(topic)}
          >
            <MessageCircle size={14} />
            <span>{formatCount(replies)} 条回复</span>
          </button>
        ) : null}

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

        {!excerpt.text && author ? <span>{author}</span> : null}

        {expanded ? (
          <button
            type="button"
            className="feed-action-item"
            style={{ color: 'var(--accent)' }}
            onClick={(e) => void handleToggleExpand(e)}
          >
            收起
            <ChevronUp size={14} />
          </button>
        ) : null}

        {time ? <span style={{ marginLeft: 'auto' }}>{formatRelativeTime(time)}</span> : null}
      </div>
    </li>
  );
}
