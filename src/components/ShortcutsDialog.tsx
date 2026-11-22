import { X } from 'lucide-react';
import { ModalDialog } from './ModalDialog';

interface ShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS: Array<[string, string]> = [
  ['/', '打开全局版面直达 / 搜索面板'],
  ['J / K', '在帖子列表或楼层间向下 / 向上移动焦点'],
  ['Enter', '打开当前聚焦的帖子'],
  ['Esc', '关闭弹窗/抽屉，或从帖子/版面返回上一级'],
  ['O', '帖子内切换「只看楼主 / 全部楼层」'],
  ['R', '帖子内快速打开回复框'],
  ['N', '版面内快速发表新帖'],
  ['U', '立即刷新当前列表或帖子并归顶（再点当前 Tab 也可刷新）'],
  ['← / →', '返回上一级页面 / 前进到刚才离开的页面（保留阅读位置）'],
  ['点击下半屏', '电子书模式：向下翻一屏（保留一行上下文）'],
  ['点击上半屏', '电子书模式：向上翻一屏（保留一行上下文）'],
  ['D', '循环切换主题（日间 → 夜间 → OLED 纯黑）'],
  ['I', '循环切换图片控图（纯文占位 → 灰阶缩图 → 原图）'],
  ['?', '显示 / 关闭本快捷键指南'],
];

export function ShortcutsDialog({ open, onClose }: ShortcutsDialogProps) {
  return (
    <ModalDialog open={open} onClose={onClose} ariaLabel="键盘快捷键指南">
      <div className="dialog-head">
        <h2 className="dialog-title">键盘流快捷键</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
          <X size={17} />
        </button>
      </div>
      <div className="dialog-body" style={{ paddingTop: 8 }}>
        {SHORTCUTS.map(([key, desc]) => (
          <div key={key} className="setting-row" style={{ padding: '9px 0' }}>
            <span style={{ fontSize: '0.88rem' }}>{desc}</span>
            <kbd className="kbd-hint" style={{ fontSize: '0.78rem', padding: '2px 8px' }}>
              {key}
            </kbd>
          </div>
        ))}
      </div>
    </ModalDialog>
  );
}
