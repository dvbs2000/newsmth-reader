import { useState } from 'react';
import { Eye, Image as ImageIcon } from 'lucide-react';
import type { UserPreferences } from '../types/smth';
import { proxyImageUrl } from '../utils/format';

interface StealthImageProps {
  rawUrl: string;
  index: number;
  label?: string;
  mode: UserPreferences['imageMode'];
  onOpenLightbox: () => void;
}

export function StealthImage({
  rawUrl,
  index,
  label,
  mode,
  onOpenLightbox,
}: StealthImageProps) {
  const [expanded, setExpanded] = useState(false);
  const src = proxyImageUrl(rawUrl);
  const caption = label || `图片 ${index + 1}`;

  if (mode === 'collapsed' && !expanded) {
    return (
      <button
        type="button"
        className="stealth-pill"
        onClick={() => setExpanded(true)}
        title="点击临时展开此图"
      >
        <ImageIcon size={14} strokeWidth={1.75} />
        <span>{caption} · 点击展开</span>
      </button>
    );
  }

  if (mode === 'stealth' && !expanded) {
    return (
      <button
        type="button"
        className="stealth-thumb-btn"
        onClick={onOpenLightbox}
        title="点击查看高清原图"
      >
        <img
          src={src}
          alt={caption}
          loading="lazy"
          decoding="async"
          className="stealth-thumb-img"
        />
        <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', paddingRight: 6 }}>
          <Eye size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />
          {caption}
        </span>
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: '100%' }}>
      <button
        type="button"
        className="full-img-btn"
        onClick={onOpenLightbox}
        title="点击放大查看"
      >
        <img src={src} alt={caption} loading="lazy" decoding="async" />
      </button>
      {mode !== 'auto' ? (
        <button
          type="button"
          className="floor-action-btn"
          style={{ alignSelf: 'flex-start', fontSize: '0.74rem' }}
          onClick={() => setExpanded(false)}
        >
          收起图片
        </button>
      ) : null}
    </div>
  );
}
