import { useEffect } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import { proxyImageUrl } from '../utils/format';
import { ModalDialog } from './ModalDialog';

interface LightboxProps {
  images: string[];
  index: number;
  onChangeIndex: (next: number) => void;
  onClose: () => void;
}

export function Lightbox({ images, index, onChangeIndex, onClose }: LightboxProps) {
  const open = images.length > 0 && index >= 0;
  const current = open ? images[index] : '';

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onChangeIndex((index - 1 + images.length) % images.length);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onChangeIndex((index + 1) % images.length);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, index, images.length, onChangeIndex]);

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      className="lightbox-dialog"
      ariaLabel="图片灯箱查看器"
    >
      <div className="dialog-head" style={{ borderColor: '#27272a' }}>
        <span className="mono" style={{ fontSize: '0.84rem', color: '#a1a1aa' }}>
          {index + 1} / {images.length}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <a
            href={proxyImageUrl(current)}
            target="_blank"
            rel="noopener noreferrer"
            className="icon-btn"
            style={{ color: '#d4d4d8' }}
            title="新标签页打开原图"
            aria-label="新标签页打开原图"
          >
            <ExternalLink size={16} />
          </a>
          <button
            type="button"
            className="icon-btn"
            style={{ color: '#d4d4d8' }}
            onClick={onClose}
            aria-label="关闭灯箱"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="lightbox-stage">
        {images.length > 1 ? (
          <button
            type="button"
            className="icon-btn"
            style={{ position: 'absolute', left: 10, color: '#f4f4f5', background: 'rgba(0,0,0,0.5)' }}
            onClick={() => onChangeIndex((index - 1 + images.length) % images.length)}
            aria-label="上一张"
          >
            <ChevronLeft size={20} />
          </button>
        ) : null}

        {current ? <img src={proxyImageUrl(current)} alt={`图片 ${index + 1}`} /> : null}

        {images.length > 1 ? (
          <button
            type="button"
            className="icon-btn"
            style={{ position: 'absolute', right: 10, color: '#f4f4f5', background: 'rgba(0,0,0,0.5)' }}
            onClick={() => onChangeIndex((index + 1) % images.length)}
            aria-label="下一张"
          >
            <ChevronRight size={20} />
          </button>
        ) : null}
      </div>
    </ModalDialog>
  );
}
