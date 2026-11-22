import { spawn, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { CHROME_CANDIDATES, DEFAULT_USER_AGENT, WAP_API_BASE, WAP_ORIGIN } from './config.js';
import { serializeCookieHeader, type CookieMap } from './cookieParser.js';
import { localStore } from './store.js';

export type ChromeLoginState =
  | { status: 'idle' }
  | { status: 'launching'; message: string }
  | { status: 'waiting'; message: string; startedAt: number }
  | { status: 'success'; message: string; user: { id: string; name: string; nick: string } }
  | { status: 'error'; message: string }
  | { status: 'cancelled'; message: string };

interface CdpCookie {
  name: string;
  value: string;
  domain: string;
}

class ChromeLoginManager {
  private state: ChromeLoginState = { status: 'idle' };
  private child: ChildProcess | null = null;
  private tempDir: string | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private activeRunId = 0;

  getState(): ChromeLoginState {
    return this.state;
  }

  findChromePath(): string | null {
    for (const candidate of CHROME_CANDIDATES) {
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }

  async start(): Promise<ChromeLoginState> {
    if (this.state.status === 'launching' || this.state.status === 'waiting') {
      return this.state;
    }

    const chromePath = this.findChromePath();
    if (!chromePath) {
      this.state = {
        status: 'error',
        message: '未在本机找到 Chrome / Edge，请使用方案 A 粘贴 Cookie 或设置环境变量 SMTH_CHROME_PATH',
      };
      return this.state;
    }

    const runId = ++this.activeRunId;
    this.state = { status: 'launching', message: '正在启动隔离 Chrome 窗口...' };

    try {
      const port = await getFreePort();
      const tmpDir = path.join(os.tmpdir(), `xsmth-login-${crypto.randomBytes(6).toString('hex')}`);
      fs.mkdirSync(tmpDir, { recursive: true, mode: 0o700 });
      this.tempDir = tmpDir;

      const args = [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${tmpDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-default-apps',
        '--window-size=520,780',
        `${WAP_ORIGIN}/login`,
      ];

      const child = spawn(chromePath, args, {
        stdio: 'ignore',
        detached: false,
      });
      this.child = child;

      child.on('exit', () => {
        if (this.activeRunId !== runId) return;
        this.clearPoll();
        if (this.state.status === 'launching' || this.state.status === 'waiting') {
          this.state = { status: 'cancelled', message: '登录窗口已关闭，未检测到登录状态' };
        }
        this.cleanupTempDir();
        this.child = null;
      });

      this.state = {
        status: 'waiting',
        message: '请在弹出的 Chrome 窗口中完成水木登录与滑块验证，登录成功后将自动捕获会话并关闭窗口',
        startedAt: Date.now(),
      };

      void this.monitorLogin(runId, port);
      return this.state;
    } catch (err) {
      this.cleanup();
      this.state = {
        status: 'error',
        message: err instanceof Error ? err.message : '启动 Chrome 失败',
      };
      return this.state;
    }
  }

  cancel(): ChromeLoginState {
    this.activeRunId++;
    this.cleanup();
    this.state = { status: 'cancelled', message: '已取消浏览器登录' };
    return this.state;
  }

  shutdown(): void {
    this.activeRunId++;
    this.cleanup();
  }

  private async monitorLogin(runId: number, port: number): Promise<void> {
    const deadline = Date.now() + 5 * 60 * 1000;

    // Wait for CDP HTTP endpoint to become ready
    let wsUrl: string | null = null;
    for (let i = 0; i < 40 && this.activeRunId === runId; i++) {
      wsUrl = await fetchBrowserWsUrl(port);
      if (wsUrl) break;
      await sleep(250);
    }

    if (this.activeRunId !== runId) return;
    if (!wsUrl) {
      this.cleanup();
      this.state = { status: 'error', message: '无法连接到本地 Chrome 调试接口，请改用方案 A 粘贴 Cookie' };
      return;
    }

    const tick = async () => {
      if (this.activeRunId !== runId) return;
      if (Date.now() > deadline) {
        this.cleanup();
        this.state = { status: 'error', message: '登录超时（5 分钟），请重试' };
        return;
      }

      try {
        const allCookies = await readCdpCookies(wsUrl!);
        const wapCookies: CookieMap = {};
        for (const c of allCookies) {
          const dom = (c.domain || '').toLowerCase();
          if (dom.includes('newsmth.net') || dom.includes('mysmth.net')) {
            wapCookies[c.name] = c.value;
          }
        }

        if (Object.keys(wapCookies).length > 0) {
          const profile = await verifyWapProfile(wapCookies);
          if (this.activeRunId !== runId) return;
          if (profile) {
            localStore.setWapCookies(wapCookies, 'chrome', true);
            this.state = {
              status: 'success',
              message: `已登录水木账号 ${profile.name}`,
              user: profile,
            };
            this.cleanup();
            return;
          }
        }
      } catch {
        // Ignore transient CDP / network errors while user is interacting
      }

      if (this.activeRunId === runId && this.state.status === 'waiting') {
        this.pollTimer = setTimeout(() => void tick(), 1500);
      }
    };

    this.pollTimer = setTimeout(() => void tick(), 1800);
  }

  private clearPoll(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private cleanup(): void {
    this.clearPoll();
    if (this.child && !this.child.killed) {
      try {
        this.child.kill('SIGTERM');
      } catch {
        // ignore
      }
    }
    this.child = null;
    setTimeout(() => this.cleanupTempDir(), 800);
  }

  private cleanupTempDir(): void {
    if (!this.tempDir) return;
    const dir = this.tempDir;
    this.tempDir = null;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close(() => reject(new Error('Failed to allocate port')));
        return;
      }
      const { port } = addr;
      server.close(() => resolve(port));
    });
  });
}

async function fetchBrowserWsUrl(port: number): Promise<string | null> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`);
    if (!res.ok) return null;
    const json = (await res.json()) as { webSocketDebuggerUrl?: string };
    return json.webSocketDebuggerUrl || null;
  } catch {
    return null;
  }
}

async function readCdpCookies(wsUrl: string): Promise<CdpCookie[]> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          ws.close();
        } catch {
          // ignore
        }
        reject(new Error('CDP timeout'));
      }
    }, 4000);

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ id: 1, method: 'Storage.getCookies' }));
    });

    ws.addEventListener('message', (event) => {
      if (settled) return;
      try {
        const msg = JSON.parse(String(event.data)) as {
          id?: number;
          result?: { cookies?: CdpCookie[] };
          error?: { message?: string };
        };
        if (msg.id !== 1) return;
        settled = true;
        clearTimeout(timeout);
        ws.close();
        if (msg.error) {
          reject(new Error(msg.error.message || 'CDP error'));
        } else {
          resolve(msg.result?.cookies || []);
        }
      } catch (e) {
        settled = true;
        clearTimeout(timeout);
        ws.close();
        reject(e);
      }
    });

    ws.addEventListener('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(new Error('CDP socket error'));
    });
  });
}

async function verifyWapProfile(
  cookies: CookieMap,
): Promise<{ id: string; name: string; nick: string } | null> {
  const cookieHeader = serializeCookieHeader(cookies);
  if (!cookieHeader) return null;

  const res = await fetch(`${WAP_API_BASE}/api/profile`, {
    method: 'POST',
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      Referer: `${WAP_ORIGIN}/`,
      Origin: WAP_ORIGIN,
      Cookie: cookieHeader,
      Accept: 'application/json',
    },
  });

  if (!res.ok) return null;
  const json = (await res.json()) as {
    code?: number;
    data?: {
      id?: string;
      name?: string;
      nick?: string;
      account?: { id?: string; name?: string; nick?: string };
    };
  };

  if (json.code !== 1 || !json.data) return null;
  const account = json.data.account || json.data;
  const name = account.name || '';
  if (!name || name.toLowerCase() === 'guest') return null;

  return {
    id: String(account.id || name),
    name,
    nick: account.nick || name,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const chromeLoginManager = new ChromeLoginManager();
