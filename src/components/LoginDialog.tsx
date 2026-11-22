import { useEffect, useState } from 'react';
import { Chrome, KeyRound, Loader2, X } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../state/auth';
import type { ChromeLoginState } from '../types/smth';
import { ModalDialog } from './ModalDialog';
import { useToast } from './Toast';

export function LoginDialog() {
  const { status, loginDialogOpen, closeLoginDialog, refreshAuth } = useAuth();
  const { showToast } = useToast();

  const [tab, setTab] = useState<'chrome' | 'cookie'>('chrome');
  const [chromeState, setChromeState] = useState<ChromeLoginState>({ status: 'idle' });
  const [cookieInput, setCookieInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loginDialogOpen) return;
    setError(null);
    setChromeState(status?.chromeLogin || { status: 'idle' });
  }, [loginDialogOpen, status?.chromeLogin]);

  // Poll Scheme B Chrome login status while active
  useEffect(() => {
    if (!loginDialogOpen) return;
    if (chromeState.status !== 'launching' && chromeState.status !== 'waiting') return;

    const id = setInterval(async () => {
      try {
        const next = await api.getChromeLoginStatus();
        setChromeState(next);
        if (next.status === 'success') {
          await refreshAuth();
          showToast(next.message);
          closeLoginDialog();
        }
      } catch {
        // ignore transient poll failure
      }
    }, 1200);

    return () => clearInterval(id);
  }, [loginDialogOpen, chromeState.status, refreshAuth, closeLoginDialog, showToast]);

  const handleStartChrome = async () => {
    setError(null);
    try {
      const next = await api.startChromeLogin();
      setChromeState(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : '启动 Chrome 失败');
    }
  };

  const handleCancelChrome = async () => {
    try {
      const next = await api.cancelChromeLogin();
      setChromeState(next);
    } catch {
      // ignore
    }
  };

  const handleImportCookie = async () => {
    if (!cookieInput.trim()) {
      setError('请粘贴 Cookie 或 Chrome 复制的 cURL 命令');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.importManualCookie(cookieInput);
      await refreshAuth();
      showToast(`已导入登录态：${res.profile.account.name}`);
      setCookieInput('');
      closeLoginDialog();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cookie 校验失败');
    } finally {
      setSubmitting(false);
    }
  };

  const isWaiting = chromeState.status === 'launching' || chromeState.status === 'waiting';

  return (
    <ModalDialog open={loginDialogOpen} onClose={closeLoginDialog} ariaLabel="登录水木社区">
      <div className="dialog-head">
        <h2 className="dialog-title">登录水木社区</h2>
        <button type="button" className="icon-btn" onClick={closeLoginDialog} aria-label="关闭">
          <X size={17} />
        </button>
      </div>

      <div className="dialog-body">
        <div className="subtabs" style={{ paddingTop: 0, marginBottom: 14 }}>
          <button
            type="button"
            className={`subtab ${tab === 'chrome' ? 'active' : ''}`}
            onClick={() => setTab('chrome')}
          >
            方案 B · 本机浏览器登录（推荐）
          </button>
          <button
            type="button"
            className={`subtab ${tab === 'cookie' ? 'active' : ''}`}
            onClick={() => setTab('cookie')}
          >
            方案 A · 粘贴 Cookie / cURL
          </button>
        </div>

        {error ? <div className="error-banner">{error}</div> : null}

        {tab === 'chrome' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.65 }}>
              点击下方按钮将唤起一个隔离的本地 Chrome 窗口打开{' '}
              <span className="mono">wap.newsmth.net/login</span>。你在真浏览器中自行输入账号密码并完成滑块验证，登录成功后本服务自动接管会话并关闭窗口（Cookie 仅以 600 私有权限保存在本机{' '}
              <span className="mono">.local/session.json</span>，不上传任何第三方）。
            </p>

            {chromeState.status !== 'idle' ? (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface-subtle)',
                  fontSize: '0.84rem',
                  color: chromeState.status === 'error' ? 'var(--danger)' : 'var(--text)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                {isWaiting ? (
                  <Loader2 size={15} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                ) : null}
                <span>{'message' in chromeState ? chromeState.message : ''}</span>
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={isWaiting}
                onClick={handleStartChrome}
              >
                <Chrome size={15} />
                {isWaiting ? '等待浏览器中完成登录...' : '打开本机 Chrome 登录'}
              </button>
              {isWaiting ? (
                <button type="button" className="btn" onClick={handleCancelChrome}>
                  取消
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              支持以下任意一种格式直接粘贴，后端会自动提取水木会话并验活：
              <br />• 浏览器导出的 <span className="mono">Netscape cookies.txt</span> 整段文本
              <br />• DevTools 右键 <span className="mono">Copy as cURL</span> 或请求头{' '}
              <span className="mono">Cookie: kbs-info=...; kbs-key=...</span>
              <br />• Cookie 插件导出的 JSON 数组
            </p>
            <textarea
              className="text-area mono"
              style={{ minHeight: 126, fontSize: '0.8rem' }}
              placeholder="直接整段粘贴 cookies.txt、Cookie 请求头、cURL 或 JSON..."
              value={cookieInput}
              onChange={(e) => setCookieInput(e.target.value)}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={submitting}
                onClick={handleImportCookie}
              >
                <KeyRound size={15} />
                {submitting ? '校验中...' : '校验并导入会话'}
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </ModalDialog>
  );
}
