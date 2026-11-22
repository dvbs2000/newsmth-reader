import type { CustomFontItem, UserPreferences } from '../types/smth';

export interface FontPreset {
  id: string;
  label: string;
  note: string;
  stack: string;
}

export const DEFAULT_FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', 'Microsoft YaHei', sans-serif";

export const BUILTIN_FONT_PRESETS: FontPreset[] = [
  {
    id: 'system',
    label: '知乎默认（系统无衬线 · 苹方 / 微软雅黑）',
    note: '与 Zhihu Zen 一致的高清系统无衬线字栈',
    stack: DEFAULT_FONT_STACK,
  },
  {
    id: 'macos-hiragino',
    label: '冬青黑体（Hiragino Sans GB）',
    note: '优雅清秀黑体',
    stack: "'Hiragino Sans GB', 'PingFang SC', 'Microsoft YaHei', sans-serif",
  },
  {
    id: 'macos-songti',
    label: '宋体（Songti SC / SimSun）',
    note: '书卷纸墨感，适合长文阅读',
    stack: "'Songti SC', 'STSong', 'Noto Serif CJK SC', 'SimSun', serif",
  },
  {
    id: 'macos-kaiti',
    label: '楷体（Kaiti SC / KaiTi）',
    note: '舒缓手写楷书风格',
    stack: "'Kaiti SC', 'STKaiti', 'KaiTi', serif",
  },
  {
    id: 'macos-fangsong',
    label: '仿宋（STFangsong / FangSong）',
    note: '传统书刻细衬线',
    stack: "'STFangsong', 'FangSong', 'Noto Serif CJK SC', serif",
  },
  {
    id: 'macos-yuanti',
    label: '圆体（Yuanti SC）',
    note: '柔和圆润，低疲劳感',
    stack: "'Yuanti SC', 'STYuanti-SC-Regular', 'PingFang SC', sans-serif",
  },
  {
    id: 'macos-mono',
    label: '极客等宽（SF Mono / Consolas）',
    note: '终端与代码风格阅读',
    stack: "ui-monospace, 'SF Mono', Menlo, Consolas, 'PingFang SC', monospace",
  },
];

function escapeCssFontName(name: string): string {
  return name.replace(/["'\\]/g, '').trim();
}

export function customFontCssFamily(id: string): string {
  return `SmthCustomFont_${id}`;
}

export function resolveFontStack(
  prefs: Pick<UserPreferences, 'fontId' | 'customSystemFont'>,
  customFonts: CustomFontItem[],
): string {
  const fontId = prefs.fontId || 'system';

  if (fontId.startsWith('imported:')) {
    const id = fontId.slice('imported:'.length);
    const found = customFonts.find((f) => f.id === id);
    if (found) {
      return `'${customFontCssFamily(found.id)}', ${DEFAULT_FONT_STACK}`;
    }
  }

  if (fontId === 'custom-system' && prefs.customSystemFont?.trim()) {
    const clean = escapeCssFontName(prefs.customSystemFont);
    if (clean) {
      return `'${clean}', ${DEFAULT_FONT_STACK}`;
    }
  }

  const preset = BUILTIN_FONT_PRESETS.find((p) => p.id === fontId);
  return preset ? preset.stack : DEFAULT_FONT_STACK;
}

export function buildFontFacesCss(customFonts: CustomFontItem[]): string {
  const rules: string[] = [];

  for (const f of customFonts) {
    rules.push(`@font-face {
  font-family: '${customFontCssFamily(f.id)}';
  src: url('/api/local/fonts/${encodeURIComponent(f.filename)}') format('${f.format}');
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}`);
  }

  return rules.join('\n\n');
}
