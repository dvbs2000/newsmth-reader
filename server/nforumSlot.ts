import { NFORUM_ORIGIN, DEFAULT_USER_AGENT } from './config.js';
import { parseCookieInput, serializeCookieHeader } from './cookieParser.js';
import { localStore } from './store.js';

/**
 * Isolated extension slot for legacy `www.newsmth.net/nForum` features
 * (multi-level essence directory tree, legacy multi-folder favorites, polls).
 *
 * Kept strictly decoupled from `wap.newsmth.net` because upstream cookies
 * between `wap` and `nForum` are independent.
 */
export interface NforumSlotStatus {
  enabled: boolean;
  hasCookies: boolean;
  cookieCount: number;
  updatedAt: number;
  source: string;
  capabilities: string[];
}

export function getNforumSlotStatus(): NforumSlotStatus {
  const slot = localStore.getNforumSession();
  const count = Object.keys(slot.cookies).length;
  return {
    enabled: count > 0,
    hasCookies: count > 0,
    cookieCount: count,
    updatedAt: slot.updatedAt,
    source: slot.source,
    capabilities: [
      'essence-tree (reserved)',
      'legacy-advanced-search (reserved)',
      'multi-folder-favorites (reserved)',
    ],
  };
}

export function importNforumCookie(rawCookie: string): NforumSlotStatus {
  const cookies = parseCookieInput(rawCookie);
  if (Object.keys(cookies).length === 0) {
    throw new Error('未解析到有效的 nForum Cookie');
  }
  localStore.setNforumCookies(cookies, 'manual');
  return getNforumSlotStatus();
}

export function clearNforumCookie(): NforumSlotStatus {
  localStore.clearNforumSession();
  return getNforumSlotStatus();
}

/**
 * Future adapter hook for authenticated GBK nForum requests.
 */
export async function fetchNforumRaw(pathname: string): Promise<ArrayBuffer> {
  const slot = localStore.getNforumSession();
  const headers: Record<string, string> = {
    'User-Agent': DEFAULT_USER_AGENT,
    'X-Requested-With': 'XMLHttpRequest',
    Referer: `${NFORUM_ORIGIN}/nForum/`,
  };
  const cookieHeader = serializeCookieHeader(slot.cookies);
  if (cookieHeader) headers.Cookie = cookieHeader;

  const res = await fetch(`${NFORUM_ORIGIN}${pathname}`, { headers });
  if (!res.ok) {
    throw new Error(`nForum request failed (${res.status})`);
  }
  return res.arrayBuffer();
}
