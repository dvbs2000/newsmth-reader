import os from 'node:os';
import path from 'node:path';

export const IS_PROD =
  process.argv.includes('--prod') || process.env.NODE_ENV === 'production';
export const SERVER_PORT = Number(process.env.PORT || (IS_PROD ? 3173 : 3174));
export const SERVER_HOST = process.env.HOST || '127.0.0.1';

export const WAP_ORIGIN = 'https://wap.newsmth.net';
export const WAP_API_BASE = `${WAP_ORIGIN}/wap`;
export const NFORUM_ORIGIN = 'https://www.newsmth.net';

export const LOCAL_DIR = path.resolve(process.cwd(), '.local');
export const SESSION_FILE = path.join(LOCAL_DIR, 'session.json');
export const DATA_FILE = path.join(LOCAL_DIR, 'data.json');
export const FONTS_DIR = path.join(LOCAL_DIR, 'fonts');

function buildChromeCandidates(): string[] {
  const list: Array<string | undefined> = [process.env.SMTH_CHROME_PATH, process.env.XSMTH_CHROME_PATH];

  if (process.platform === 'darwin') {
    list.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    );
  } else if (process.platform === 'win32') {
    const localApp = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const progFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
    const progFiles86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
    list.push(
      path.join(progFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(progFiles86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(localApp, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(progFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(progFiles86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    );
  } else {
    list.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/microsoft-edge',
    );
  }

  return list.filter((p): p is string => Boolean(p));
}

export const CHROME_CANDIDATES = buildChromeCandidates();

export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const ALLOWED_IMAGE_SUFFIXES = [
  'newsmth.net',
  'mysmth.net',
  'smth.net',
  'ksyun.com',
  'ksyuncs.com',
  'ks-cdn.com',
  'qpic.cn',
  'sinaimg.cn',
];

export function isAllowedImageHost(hostname: string): boolean {
  const host = hostname.toLowerCase().trim();
  if (!host || host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) {
    return false;
  }
  return ALLOWED_IMAGE_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}
