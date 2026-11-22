import { useEffect, useRef, useState } from 'react';
import { Check, LogIn, LogOut, Save, Search, Trash2, Upload } from 'lucide-react';
import { api } from '../api/client';
import { useToast } from '../components/Toast';
import { useAuth } from '../state/auth';
import { useSettings } from '../state/settings';
import type { NforumSlotStatus, UserPreferences } from '../types/smth';
import { BUILTIN_FONT_PRESETS, customFontCssFamily } from '../utils/fonts';

interface LocalFontEntry {
  family: string;
  fullName?: string;
}

export function SettingsPage() {
  const { status, openLoginDialog, logout, refreshAuth } = useAuth();
  const { prefs, localData, updatePrefs, saveBlocklist, uploadCustomFont, deleteCustomFont } =
    useSettings();
  const { showToast } = useToast();

  const [blockUsersText, setBlockUsersText] = useState(localData.blockUsers.join(', '));
  const [blockKeywordsText, setBlockKeywordsText] = useState(localData.blockKeywords.join(', '));
  const [nforumStatus, setNforumStatus] = useState<NforumSlotStatus | null>(
    status?.nforumSlot || null,
  );
  const [nforumCookie, setNforumCookie] = useState('');

  const [customSysFont, setCustomSysFont] = useState(prefs.customSystemFont || '');
  const [localSystemFonts, setLocalSystemFonts] = useState<string[]>([]);
  const [sysFontFilter, setSysFontFilter] = useState('');
  const [uploadingFont, setUploadingFont] = useState(false);
  const fontInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setBlockUsersText(localData.blockUsers.join(', '));
    setBlockKeywordsText(localData.blockKeywords.join(', '));
  }, [localData.blockUsers, localData.blockKeywords]);

  useEffect(() => {
    setCustomSysFont(prefs.customSystemFont || '');
  }, [prefs.customSystemFont]);

  useEffect(() => {
    api
      .getNforumStatus()
      .then(setNforumStatus)
      .catch(() => {});
  }, []);

  const handleSaveBlocklist = async () => {
    const users = blockUsersText
      .split(/[,，\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const keywords = blockKeywordsText
      .split(/[,，\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    await saveBlocklist(users, keywords);
    showToast('本地屏蔽规则已保存');
  };

  const handleUploadFont = async (file: File) => {
    setUploadingFont(true);
    try {
      const added = await uploadCustomFont(file);
      showToast(`已导入并应用字体：${added.name}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '字体导入失败');
    } finally {
      setUploadingFont(false);
    }
  };

  const handleScanLocalFonts = async () => {
    const queryFn = (window as unknown as { queryLocalFonts?: () => Promise<LocalFontEntry[]> })
      .queryLocalFonts;
    if (typeof queryFn !== 'function') {
      showToast('当前浏览器不支持自动枚举系统字体，可直接在下方输入字体名');
      return;
    }
    try {
      const list = await queryFn();
      const families = Array.from(new Set(list.map((f) => f.family).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, 'zh-CN'),
      );
      setLocalSystemFonts(families);
      showToast(`已读取本机 ${families.length} 款系统字体`);
    } catch {
      showToast('未获得浏览器系统字体读取权限，可手动输入字体名');
    }
  };

  const applyCustomSystemFont = (family: string) => {
    const clean = family.trim();
    if (!clean) return;
    setCustomSysFont(clean);
    updatePrefs({ fontId: 'custom-system', customSystemFont: clean });
    showToast(`已切换系统字体：${clean}`);
  };

  const filteredSystemFonts = localSystemFonts.filter((f) =>
    sysFontFilter.trim() ? f.toLowerCase().includes(sysFontFilter.trim().toLowerCase()) : true,
  );

  return (
    <div style={{ paddingBottom: 32 }}>
      <div className="section-heading">账号与会话（wap.newsmth.net）</div>
      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-name">
            {status?.loggedIn && status.profile
              ? `当前登录：${status.profile.account.name}（${status.source === 'chrome' ? '方案 B 浏览器捕获' : '方案 A 手动 Cookie'}）`
              : '当前状态：游客只读模式'}
          </div>
          <div className="setting-desc">
            会话 Cookie 仅以 600 权限保存在本机 .local/session.json，不会上传任何第三方
          </div>
        </div>
        {status?.loggedIn ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="chip-btn" onClick={openLoginDialog}>
              重登/换号
            </button>
            <button
              type="button"
              className="chip-btn danger"
              onClick={async () => {
                await logout();
                showToast('已退出登录');
              }}
            >
              <LogOut size={13} />
              退出
            </button>
          </div>
        ) : (
          <button type="button" className="chip-btn primary" onClick={openLoginDialog}>
            <LogIn size={13} />
            登录（方案 B / A）
          </button>
        )}
      </div>

      <div className="section-heading">字体与排版</div>

      {/* Live reading sample preview (showing UI meta vs reading font separation) */}
      <div
        style={{
          padding: '12px 14px',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--surface-subtle)',
          border: '1px solid var(--border)',
          marginBottom: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'var(--font-ui)',
            fontSize: '0.72rem',
            color: 'var(--text-subtle)',
            marginBottom: 5,
          }}
        >
          <span>reader（非正文 · UI 细字）</span>
          <span className="tabular">北京市 · 11-21 08:37 · 16楼</span>
        </div>
        <div
          style={{
            fontFamily: 'var(--font-reading)',
            fontSize: 'var(--font-size-body)',
            lineHeight: 1.72,
            color: 'var(--text)',
          }}
        >
          这是一段正文排版预览。阅读字体仅作用于帖子标题与楼层正文，非正文信息保持浅淡紧凑，极简阅读 0123456789。
        </div>
      </div>

      {/* Built-in xsmth & macOS presets */}
      <div className="board-grid" style={{ marginTop: 4, marginBottom: 12 }}>
        {BUILTIN_FONT_PRESETS.map((preset) => {
          const active = prefs.fontId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              className="board-card"
              style={{
                borderColor: active ? 'var(--accent)' : undefined,
                background: active ? 'var(--accent-soft)' : undefined,
                fontFamily: preset.stack,
              }}
              onClick={() => {
                updatePrefs({ fontId: preset.id });
                showToast(`已切换字体：${preset.label}`);
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <span className="board-card-title">{preset.label}</span>
                {active ? <Check size={14} color="var(--accent)" /> : null}
              </div>
              <span className="board-card-name" style={{ fontFamily: preset.stack }}>
                {preset.note}
              </span>
            </button>
          );
        })}

        {/* User-imported TTF/OTF/WOFF2 fonts */}
        {localData.customFonts.map((f) => {
          const key = `imported:${f.id}`;
          const active = prefs.fontId === key;
          const family = `'${customFontCssFamily(f.id)}', var(--font-sans)`;
          return (
            <div
              key={f.id}
              className="board-card"
              style={{
                position: 'relative',
                borderColor: active ? 'var(--accent)' : undefined,
                background: active ? 'var(--accent-soft)' : undefined,
              }}
            >
              <button
                type="button"
                style={{ textAlign: 'left', paddingRight: 26, width: '100%', fontFamily: family }}
                onClick={() => {
                  updatePrefs({ fontId: key });
                  showToast(`已应用导入字体：${f.name}`);
                }}
              >
                <div className="board-card-title">{f.name}</div>
                <div className="board-card-name" style={{ fontFamily: family }}>
                  导入字体 · {(f.size / (1024 * 1024)).toFixed(1)} MB
                </div>
              </button>
              <button
                type="button"
                className="icon-btn"
                style={{ position: 'absolute', top: 6, right: 4, minWidth: 28, height: 28 }}
                title="删除导入字体"
                aria-label={`删除 ${f.name}`}
                onClick={async () => {
                  await deleteCustomFont(f.id);
                  showToast(`已删除字体 ${f.name}`);
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Import TTF + Pick macOS System Font */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={fontInputRef}
            type="file"
            accept=".ttf,.otf,.woff,.woff2"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUploadFont(file);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className="chip-btn primary"
            disabled={uploadingFont}
            onClick={() => fontInputRef.current?.click()}
          >
            <Upload size={13} />
            {uploadingFont ? '正在导入...' : '导入本地 .ttf / .otf / .woff2 字体'}
          </button>

          <button type="button" className="chip-btn" onClick={() => void handleScanLocalFonts()}>
            <Search size={13} />
            读取本机全部系统字体
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="text-input"
            style={{ fontSize: '0.86rem', padding: '7px 10px' }}
            placeholder="或直接输入本机已安装的系统字体名（如 LXGW WenKai、Source Han Serif SC）..."
            value={customSysFont}
            onChange={(e) => setCustomSysFont(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyCustomSystemFont(customSysFont);
            }}
          />
          <button
            type="button"
            className="btn"
            disabled={!customSysFont.trim()}
            onClick={() => applyCustomSystemFont(customSysFont)}
          >
            应用
          </button>
        </div>

        {localSystemFonts.length > 0 ? (
          <div
            style={{
              padding: 10,
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
            }}
          >
            <input
              className="text-input"
              style={{ fontSize: '0.82rem', padding: '6px 9px', marginBottom: 8 }}
              placeholder={`在 ${localSystemFonts.length} 款系统字体中搜索...`}
              value={sysFontFilter}
              onChange={(e) => setSysFontFilter(e.target.value)}
            />
            <div style={{ maxHeight: 190, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {filteredSystemFonts.slice(0, 80).map((fam) => (
                <button
                  key={fam}
                  type="button"
                  className={`drawer-item ${prefs.fontId === 'custom-system' && prefs.customSystemFont === fam ? 'active' : ''}`}
                  style={{ height: 32, fontSize: '0.86rem', fontFamily: `'${fam}', sans-serif` }}
                  onClick={() => applyCustomSystemFont(fam)}
                >
                  <span>{fam}</span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    水木极简预览
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="section-heading">外观与阅读体验</div>
      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-name">主题色板（快捷键 D）</div>
          <div className="setting-desc">日间柔灰纸感（#f4f6f9 + 纯白卡片）、深海夜蓝、深灰夜间与 OLED 纯黑</div>
        </div>
        <div className="segmented">
          {(
            [
              ['light', '日间'],
              ['navy', '深海夜'],
              ['dark', '深灰'],
              ['oled', 'OLED'],
              ['system', '系统'],
            ] as Array<[UserPreferences['theme'], string]>
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              className={prefs.theme === v ? 'active' : ''}
              onClick={() => updatePrefs({ theme: v })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-name">首页热点列表样式</div>
          <div className="setting-desc">今日十大 / 全站热帖默认纯标题紧凑列表（可随时切换摘要卡片）</div>
        </div>
        <div className="segmented">
          {(
            [
              ['compact', '紧凑标题'],
              ['feed', '摘要卡片'],
            ] as Array<[UserPreferences['listStyle'], string]>
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              className={prefs.listStyle === v ? 'active' : ''}
              onClick={() => updatePrefs({ listStyle: v })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-name">版面帖子列表样式</div>
          <div className="setting-desc">水木特快等版面默认纯标题紧凑列表，一屏扫读更快</div>
        </div>
        <div className="segmented">
          {(
            [
              ['compact', '紧凑标题'],
              ['feed', '摘要卡片'],
            ] as Array<[UserPreferences['boardListStyle'], string]>
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              className={prefs.boardListStyle === v ? 'active' : ''}
              onClick={() => updatePrefs({ boardListStyle: v })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-name">正文字号</div>
          <div className="setting-desc">
            调整正文与列表字号（与知乎插件一致，默认 16px，支持右上角微点实时拖动 14–22px）
          </div>
        </div>
        <div className="segmented">
          {[14, 16, 18, 20, 22].map((size) => (
            <button
              key={size}
              type="button"
              className={prefs.fontSize === size ? 'active' : ''}
              onClick={() => updatePrefs({ fontSize: size })}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-name">页面阅读宽度（百分比）</div>
          <div className="setting-desc">
            与知乎 Zen 插件同款百分比满屏流（默认 98%，右上角微点面板可 50%–100% 无级拖动）
          </div>
        </div>
        <div className="segmented">
          {[68, 80, 90, 98, 100].map((pct) => (
            <button
              key={pct}
              type="button"
              className={prefs.widthPct === pct ? 'active' : ''}
              onClick={() => updatePrefs({ widthPct: pct })}
            >
              {pct}%
            </button>
          ))}
        </div>
      </div>

      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-name">点击屏幕翻页（电子书模式）</div>
          <div className="setting-desc">
            帖子内点击下半屏向下翻一屏（保留约 1 行上下文），点击上半屏向上翻一屏；列表页点击两侧空白区同样可翻页，拖选复制文字不受影响
          </div>
        </div>
        <button
          type="button"
          className={`chip-btn ${prefs.tapToPage ? 'active' : ''}`}
          onClick={() => updatePrefs({ tapToPage: !prefs.tapToPage })}
        >
          {prefs.tapToPage ? '已开启' : '已关闭'}
        </button>
      </div>

      <div className="section-heading">摸鱼控图与纯文净化</div>
      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-name">图片防社死策略（快捷键 I）</div>
          <div className="setting-desc">
            纯文占位（零流量/不露图） · 灰阶缩图（极小低饱和预览） · 自动加载原图
          </div>
        </div>
        <div className="segmented">
          {(
            [
              ['collapsed', '占位'],
              ['stealth', '灰阶缩图'],
              ['auto', '自动'],
            ] as Array<[UserPreferences['imageMode'], string]>
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              className={prefs.imageMode === v ? 'active' : ''}
              onClick={() => updatePrefs({ imageMode: v })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {(
        [
          ['hideAvatars', '隐藏楼层头像', '纯文字 ID 与楼层号，极简无视觉干扰'],
          ['showNick', '显示用户昵称', '关闭后仅展示简洁英文 ID，过滤冗长括号签名昵称'],
          ['stripSignature', '自动去小尾巴', '清除「发自今日水木/ismth/水木APP」「※ 来源」等尾部噪声'],
          ['collapseQuotes', '自动折叠引用', '将大段「在某某大作中提到」折叠为单行可展开摘要'],
          ['showLikes', '展示亮评 Likes', '在帖子顶部保留水木精选亮评区'],
        ] as Array<
          [
            keyof Pick<
              UserPreferences,
              'hideAvatars' | 'showNick' | 'stripSignature' | 'collapseQuotes' | 'showLikes'
            >,
            string,
            string,
          ]
        >
      ).map(([key, name, desc]) => (
        <div key={key} className="setting-row">
          <div className="setting-info">
            <div className="setting-name">{name}</div>
            <div className="setting-desc">{desc}</div>
          </div>
          <button
            type="button"
            className={`chip-btn ${prefs[key] ? 'active' : ''}`}
            onClick={() => updatePrefs({ [key]: !prefs[key] })}
          >
            {prefs[key] ? '已开启' : '已关闭'}
          </button>
        </div>
      ))}

      <div className="section-heading">本地屏蔽名单</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 6 }}>
        <div>
          <label className="field-label" htmlFor="block-users">
            屏蔽用户 ID（逗号或换行分隔，精准匹配）
          </label>
          <input
            id="block-users"
            className="text-input"
            placeholder="例如：userA, userB"
            value={blockUsersText}
            onChange={(e) => setBlockUsersText(e.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="block-keywords">
            屏蔽关键词（逗号或换行分隔，过滤标题与楼层正文）
          </label>
          <input
            id="block-keywords"
            className="text-input"
            placeholder="例如：广告, 推广"
            value={blockKeywordsText}
            onChange={(e) => setBlockKeywordsText(e.target.value)}
          />
        </div>
        <div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleSaveBlocklist()}
          >
            <Save size={14} />
            保存屏蔽规则
          </button>
        </div>
      </div>

      <div className="section-heading">扩展槽位 · nForum 独立会话（按需预留）</div>
      <div style={{ paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="setting-desc">
          当前状态：
          {nforumStatus?.hasCookies
            ? `已导入 ${nforumStatus.cookieCount} 项 nForum Cookie`
            : '未配置（主站 95% 读写均由 wap.newsmth.net 独立完成，无需配置）'}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="text-input mono"
            style={{ fontSize: '0.8rem' }}
            placeholder="（可选）预留导入 www.newsmth.net Cookie..."
            value={nforumCookie}
            onChange={(e) => setNforumCookie(e.target.value)}
          />
          <button
            type="button"
            className="btn"
            disabled={!nforumCookie.trim()}
            onClick={async () => {
              try {
                const next = await api.importNforumCookie(nforumCookie);
                setNforumStatus(next);
                setNforumCookie('');
                await refreshAuth();
                showToast('已写入 nForum 独立会话槽位');
              } catch (err) {
                showToast(err instanceof Error ? err.message : '导入失败');
              }
            }}
          >
            写入
          </button>
          {nforumStatus?.hasCookies ? (
            <button
              type="button"
              className="btn btn-danger"
              onClick={async () => {
                const next = await api.clearNforumCookie();
                setNforumStatus(next);
                showToast('已清空 nForum 槽位');
              }}
            >
              清空
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
