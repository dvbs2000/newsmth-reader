import { useMemo, useState } from 'react';
import {
  Ban,
  ChevronDown,
  ChevronRight,
  CornerUpLeft,
  Filter,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import type { ArticleObj, UserPreferences } from '../types/smth';
import { parseArticleBody, splitLinks } from '../utils/content';
import { formatExactTime, formatRelativeTime, proxyImageUrl } from '../utils/format';
import { StealthImage } from './StealthImage';

interface FloorCardProps {
  article: ArticleObj;
  opUsername?: string;
  currentUsername?: string;
  prefs: UserPreferences;
  focused?: boolean;
  onReply: (article: ArticleObj) => void;
  onEdit?: (article: ArticleObj) => void;
  onDelete?: (article: ArticleObj) => void;
  onFilterAuthor?: (article: ArticleObj) => void;
  onOpenUser: (username: string) => void;
  onBlockUser: (username: string) => void;
  onOpenLightbox: (urls: string[], index: number) => void;
}

export function FloorCard({
  article,
  opUsername,
  currentUsername,
  prefs,
  focused,
  onReply,
  onEdit,
  onDelete,
  onFilterAuthor,
  onOpenUser,
  onBlockUser,
  onOpenLightbox,
}: FloorCardProps) {
  const [expandedQuotes, setExpandedQuotes] = useState<Record<number, boolean>>({});
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const author = article.account?.name || '匿名';
  const nick = article.account?.nick;
  const avatar = article.account?.k3sUrl || article.account?.avatarUrl;
  const isOp = Boolean(opUsername && author === opUsername) || article.topicOrder === 1;
  const isMine = Boolean(currentUsername && author.toLowerCase() === currentUsername.toLowerCase());
  const floorLabel =
    article.topicOrder === 1
      ? '楼主'
      : article.topicOrder && article.topicOrder > 1
        ? `${article.topicOrder - 1}楼`
        : '';

  const parsed = useMemo(
    () => parseArticleBody(article.body || '', prefs.stripSignature),
    [article.body, prefs.stripSignature],
  );

  const imageUrls = useMemo(() => {
    const urls: Array<{ url: string; label?: string }> = [];
    const seen = new Set<string>();
    const add = (raw?: string, label?: string) => {
      if (!raw) return;
      const clean = raw.trim();
      if (!clean || seen.has(clean)) return;
      seen.add(clean);
      urls.push({ url: clean, label });
    };

    for (const att of article.attachments || []) {
      const url = att.ks3Url || att.cdnUrl || att.url;
      if (url && (!att.type || att.type.startsWith('image/'))) {
        add(url, att.name);
      }
    }
    for (const inline of parsed.inlineImages) {
      add(inline);
    }
    return urls;
  }, [article.attachments, parsed.inlineImages]);

  const rawList = useMemo(() => imageUrls.map((i) => i.url), [imageUrls]);

  const renderActions = () => (
    <>
      <button type="button" className="floor-action-btn" onClick={() => onReply(article)}>
        <CornerUpLeft size={11.5} />
        回复
      </button>

      {onFilterAuthor ? (
        <button
          type="button"
          className="floor-action-btn"
          onClick={() => onFilterAuthor(article)}
        >
          <Filter size={11.5} />
          只看TA
        </button>
      ) : null}

      {isMine && onEdit ? (
        <button type="button" className="floor-action-btn" onClick={() => onEdit(article)}>
          <Pencil size={11.5} />
          编辑
        </button>
      ) : null}

      {isMine && onDelete ? (
        <button
          type="button"
          className="floor-action-btn danger"
          onClick={() => onDelete(article)}
        >
          <Trash2 size={11.5} />
          删除
        </button>
      ) : null}

      {!isMine ? (
        <button
          type="button"
          className="floor-action-btn"
          title={`本地屏蔽 ${author}`}
          onClick={() => onBlockUser(author)}
        >
          <Ban size={11.5} />
          屏蔽
        </button>
      ) : null}
    </>
  );

  return (
    <article className={`floor-card ${focused ? 'focused' : ''}`} data-article-id={article.id}>
      <div className="floor-head">
        <div className="floor-author-group">
          {!prefs.hideAvatars && avatar ? (
            <img
              src={proxyImageUrl(avatar)}
              alt=""
              loading="lazy"
              className="floor-avatar"
            />
          ) : null}
          <button
            type="button"
            className="floor-author"
            onClick={() => onOpenUser(author)}
          >
            {author}
          </button>
          {isOp ? <span className="op-mark">楼主</span> : null}
          {prefs.showNick && nick && nick !== author ? (
            <span className="floor-nick" title={nick}>
              {nick}
            </span>
          ) : null}
        </div>

        {/* Desktop hover-reveal actions inside header — zero vertical waste */}
        <div className="floor-hover-actions" aria-label="楼层操作">
          {renderActions()}
        </div>

        <div className="floor-right-meta tabular">
          {article.city ? <span>{article.city}</span> : null}
          {article.city && article.postTime ? <span className="floor-meta-sep">·</span> : null}
          {article.postTime ? (
            <span title={formatExactTime(article.postTime)}>
              {formatRelativeTime(article.postTime)}
            </span>
          ) : null}
          {floorLabel ? (
            <>
              <span className="floor-meta-sep">·</span>
              <span className="mono">{floorLabel}</span>
            </>
          ) : null}
          <button
            type="button"
            className="floor-more-btn"
            aria-label="展开楼层操作"
            onClick={() => setMobileMenuOpen((v) => !v)}
          >
            <MoreHorizontal size={14} />
          </button>
        </div>
      </div>

      <div className="floor-body">
        {parsed.segments.length === 0 && imageUrls.length === 0 ? (
          <span style={{ color: 'var(--text-subtle)' }}>（空内容）</span>
        ) : null}

        {parsed.segments.map((seg, idx) => {
          if (seg.type === 'quote') {
            const isOpen = !prefs.collapseQuotes || Boolean(expandedQuotes[idx]);
            return (
              <div key={idx} className="quote-block">
                <button
                  type="button"
                  className="quote-toggle"
                  onClick={() =>
                    setExpandedQuotes((prev) => ({ ...prev, [idx]: !isOpen }))
                  }
                >
                  {isOpen ? <ChevronDown size={11.5} /> : <ChevronRight size={11.5} />}
                  <span>
                    {seg.header}（{seg.lineCount}行）
                  </span>
                </button>
                {isOpen ? <div className="quote-content">{seg.content}</div> : null}
              </div>
            );
          }

          return (
            <p key={idx} className="floor-paragraph">
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
          );
        })}
      </div>

      {imageUrls.length > 0 ? (
        <div className="floor-images">
          {imageUrls.map((img, idx) => (
            <StealthImage
              key={img.url}
              rawUrl={img.url}
              index={idx}
              label={img.label}
              mode={prefs.imageMode}
              onOpenLightbox={() => onOpenLightbox(rawList, idx)}
            />
          ))}
        </div>
      ) : null}

      {mobileMenuOpen ? <div className="floor-mobile-actions">{renderActions()}</div> : null}
    </article>
  );
}
