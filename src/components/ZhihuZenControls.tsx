import { useEffect, useRef, useState } from 'react';
import { useRouter } from '../state/router';
import { useSettings } from '../state/settings';
import { useToast } from './Toast';
import type { UserPreferences } from '../types/smth';

const WIDTH_PRESETS = [
  { pct: 100, label: '100%' },
  { pct: 98, label: '98%' },
  { pct: 90, label: '90%' },
  { pct: 80, label: '80%' },
  { pct: 68, label: '68%' },
];

const FONT_PRESETS = [14, 16, 18, 20];

const IMAGE_MODES: Array<[UserPreferences['imageMode'], string]> = [
  ['collapsed', '占位'],
  ['stealth', '灰阶'],
  ['auto', '自动'],
];

/**
 * 1:1 port of zhihu_zen_extension right-corner 6px micro-dots:
 * - Top-right 6px dot -> opens floating 340px reading control panel (#zhZenPanel)
 * - Bottom-right 6px dot -> instant jump to next floor card on ThreadPage
 */
export function ZhihuZenControls() {
  const { route, navigate } = useRouter();
  const { prefs, updatePrefs } = useSettings();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [route]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target) || btnRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const isDark =
    prefs.theme === 'navy' ||
    prefs.theme === 'dark' ||
    prefs.theme === 'oled' ||
    (prefs.theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  const toggleLightDark = () => {
    const next = isDark ? 'light' : 'navy';
    updatePrefs({ theme: next });
    showToast(next === 'navy' ? '深蓝夜间模式' : '浅色纸感模式');
  };

  const jumpNextFloor = (direction: 1 | -1) => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>('.floor-card')).filter(
      (el) => el.offsetHeight > 30,
    );
    if (cards.length === 0) return;

    let currentIdx = -1;
    for (let i = 0; i < cards.length; i++) {
      if (cards[i].getBoundingClientRect().top <= 18) {
        currentIdx = i;
      } else {
        break;
      }
    }

    const targetIdx =
      direction > 0
        ? Math.min(cards.length - 1, currentIdx + 1)
        : Math.max(0, currentIdx <= 0 ? 0 : currentIdx - 1);

    if (direction > 0 && currentIdx >= cards.length - 1) {
      window.dispatchEvent(new Event('xsmth:load-more'));
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
      return;
    }

    const target = cards[targetIdx];
    if (target) {
      const top = Math.max(0, window.scrollY + target.getBoundingClientRect().top - 8);
      window.scrollTo({ top, behavior: 'instant' });
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        id="zhZenMenuBtn"
        type="button"
        className={`zh-zen-dot-btn top-right ${open ? 'active' : ''}`}
        aria-label="展开沉浸阅读控制面板"
        title="沉浸阅读控制面板（宽度 / 字号 / 夜间模式）"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      />

      {route.name === 'topic' ? (
        <button
          id="zhZenNextBtn"
          type="button"
          className="zh-zen-dot-btn bottom-right"
          aria-label="跳到下一楼"
          title="点击跳到下一楼（Shift+点击跳上一楼）"
          onClick={(e) => {
            e.stopPropagation();
            jumpNextFloor(e.shiftKey ? -1 : 1);
          }}
        />
      ) : null}

      {open ? (
        <div
          ref={panelRef}
          id="zhZenPanel"
          className="zh-zen-panel"
          role="dialog"
          aria-label="沉浸阅读控制面板"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="zh-zen-row zh-zen-header">
            <span className="zh-zen-title">沉浸阅读控制</span>
            <div className="zh-zen-btn-group">
              <button
                type="button"
                className={`zh-zen-btn ${isDark ? 'primary' : ''}`}
                onClick={toggleLightDark}
              >
                {isDark ? '夜间中' : '深蓝夜'}
              </button>
              <button
                type="button"
                className="zh-zen-btn"
                onClick={() => {
                  setOpen(false);
                  navigate({ name: 'settings' });
                }}
              >
                全部设置
              </button>
            </div>
          </div>

          <div className="zh-zen-row zh-zen-box">
            <div className="zh-zen-label-row">
              <span>内容宽度</span>
              <span className="zh-zen-val tabular">{prefs.widthPct}%</span>
            </div>
            <input
              type="range"
              className="zh-zen-range"
              min={50}
              max={100}
              step={1}
              value={prefs.widthPct}
              onChange={(e) => updatePrefs({ widthPct: Number(e.target.value) })}
            />
            <div className="zh-zen-presets">
              {WIDTH_PRESETS.map((p) => (
                <button
                  key={p.pct}
                  type="button"
                  className={`zh-zen-pill ${prefs.widthPct === p.pct ? 'active' : ''}`}
                  onClick={() => updatePrefs({ widthPct: p.pct })}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="zh-zen-row zh-zen-box">
            <div className="zh-zen-label-row">
              <span>正文字号</span>
              <span className="zh-zen-val tabular">{prefs.fontSize}px</span>
            </div>
            <input
              type="range"
              className="zh-zen-range"
              min={14}
              max={22}
              step={1}
              value={prefs.fontSize}
              onChange={(e) => updatePrefs({ fontSize: Number(e.target.value) })}
            />
            <div className="zh-zen-presets">
              {FONT_PRESETS.map((sz) => (
                <button
                  key={sz}
                  type="button"
                  className={`zh-zen-pill ${prefs.fontSize === sz ? 'active' : ''}`}
                  onClick={() => updatePrefs({ fontSize: sz })}
                >
                  {sz}px
                </button>
              ))}
            </div>
          </div>

          <div className="zh-zen-row zh-zen-box">
            <div className="zh-zen-label-row">
              <span>图片防社死模式</span>
              <span className="zh-zen-val">快捷键 I</span>
            </div>
            <div className="zh-zen-presets" style={{ marginTop: 2 }}>
              {IMAGE_MODES.map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  className={`zh-zen-pill ${prefs.imageMode === mode ? 'active' : ''}`}
                  onClick={() => updatePrefs({ imageMode: mode })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="zh-zen-row zh-zen-box">
            <label className="zh-zen-chk-label">
              <input
                type="checkbox"
                checked={prefs.tapToPage}
                onChange={(e) => updatePrefs({ tapToPage: e.target.checked })}
              />
              <span>点击半屏瞬时翻页（精准保留 1 行）</span>
            </label>
            <label className="zh-zen-chk-label">
              <input
                type="checkbox"
                checked={prefs.collapseQuotes}
                onChange={(e) => updatePrefs({ collapseQuotes: e.target.checked })}
              />
              <span>默认折叠回帖引用块</span>
            </label>
            <label className="zh-zen-chk-label">
              <input
                type="checkbox"
                checked={prefs.hideAvatars}
                onChange={(e) => updatePrefs({ hideAvatars: e.target.checked })}
              />
              <span>隐藏楼层头像（更像纯文阅读）</span>
            </label>
          </div>
        </div>
      ) : null}
    </>
  );
}
