export type CookieMap = Record<string, string>;

const HEADER_VALUE_UNSAFE = /[\r\n\0]/g;

/**
 * Parse cookies flexibly from:
 * 1. Netscape HTTP Cookie File (`cookies.txt`, 7 tab-separated columns, incl. `#HttpOnly_`)
 * 2. JSON array of `{ name, value }` cookie objects or key-value map
 * 3. Chrome DevTools "Copy as cURL" command (`-b '...'` or `-H 'cookie: ...'`)
 * 4. Raw Cookie header (`Cookie: a=1; b=2`) or bare `document.cookie` string
 */
export function parseCookieInput(rawInput: string): CookieMap {
  const input = rawInput.trim();
  if (!input) return {};

  // Case 1: Netscape HTTP Cookie File (cookies.txt)
  const netscapeMap = tryParseNetscapeCookies(input);
  if (netscapeMap && Object.keys(netscapeMap).length > 0) {
    return netscapeMap;
  }

  // Case 2: JSON array or object
  if (input.startsWith('[') || input.startsWith('{')) {
    try {
      const parsed = JSON.parse(input);
      const map: CookieMap = {};
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item.name === 'string' && typeof item.value === 'string') {
            setSafeCookie(map, item.name, item.value);
          }
        }
        if (Object.keys(map).length > 0) return map;
      } else if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === 'string') setSafeCookie(map, k, v);
        }
        if (Object.keys(map).length > 0) return map;
      }
    } catch {
      // fall through to string parsing
    }
  }

  let cookieStr = input;

  // Case 3: cURL extraction (-b / --cookie / -H 'cookie: ...')
  if (/^\s*curl\b/i.test(input)) {
    const cookieFlagMatch =
      input.match(/(?:^|\s)(?:-b|--cookie)\s+(['"])([\s\S]*?)\1/i) ||
      input.match(/-H\s+(['"])\s*cookie\s*:\s*([\s\S]*?)\1/i);
    if (cookieFlagMatch?.[2]) {
      cookieStr = cookieFlagMatch[2];
    }
  }

  // Strip leading "Cookie:" prefix if pasted as header line
  cookieStr = cookieStr.replace(/^cookie\s*:\s*/i, '').trim();

  // Strip wrapping quotes
  if (
    (cookieStr.startsWith('"') && cookieStr.endsWith('"')) ||
    (cookieStr.startsWith("'") && cookieStr.endsWith("'"))
  ) {
    cookieStr = cookieStr.slice(1, -1);
  }

  const map: CookieMap = {};
  for (const part of cookieStr.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const name = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    // Skip Set-Cookie attribute names if someone accidentally pasted Set-Cookie headers
    if (
      /^(path|domain|expires|max-age|samesite|secure|httponly|priority)$/i.test(name)
    ) {
      continue;
    }
    setSafeCookie(map, name, value);
  }

  return map;
}

function tryParseNetscapeCookies(input: string): CookieMap | null {
  const lines = input.split(/\r?\n/);
  const rows: Array<{ domain: string; name: string; value: string }> = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    let line = trimmed;
    if (line.startsWith('#HttpOnly_')) {
      line = line.slice('#HttpOnly_'.length);
    } else if (line.startsWith('#')) {
      continue;
    }

    const parts = line.includes('\t') ? line.split('\t') : line.split(/\s{2,}/);
    if (parts.length < 7) continue;

    const domain = parts[0].trim().toLowerCase();
    const includeSub = parts[1].trim().toUpperCase();
    const secure = parts[3].trim().toUpperCase();
    if (
      (includeSub !== 'TRUE' && includeSub !== 'FALSE') ||
      (secure !== 'TRUE' && secure !== 'FALSE')
    ) {
      continue;
    }

    const name = parts[5].trim();
    const value = parts.slice(6).join('\t').trim();
    if (name) {
      rows.push({ domain, name, value });
    }
  }

  if (rows.length === 0) return null;

  // If the file contains NewSMTH domains alongside unrelated sites, only keep NewSMTH cookies
  const smthRows = rows.filter(
    (r) => r.domain.includes('newsmth.net') || r.domain.includes('mysmth.net'),
  );
  const selected = smthRows.length > 0 ? smthRows : rows;

  const map: CookieMap = {};
  for (const row of selected) {
    setSafeCookie(map, row.name, row.value);
  }
  return map;
}

function setSafeCookie(target: CookieMap, name: string, value: string): void {
  const cleanName = name.replace(HEADER_VALUE_UNSAFE, '').trim();
  const cleanVal = value.replace(HEADER_VALUE_UNSAFE, '').trim();
  if (!cleanName || /[;\s=]/.test(cleanName)) return;
  target[cleanName] = cleanVal;
}

export function serializeCookieHeader(cookies: CookieMap): string {
  return Object.entries(cookies)
    .filter(([k]) => Boolean(k))
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

export function extractSetCookies(headers: Headers): CookieMap {
  const map: CookieMap = {};
  const setCookies =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : headers.get('set-cookie')
        ? [headers.get('set-cookie') as string]
        : [];

  for (const line of setCookies) {
    const firstSegment = line.split(';')[0]?.trim();
    if (!firstSegment) continue;
    const eqIdx = firstSegment.indexOf('=');
    if (eqIdx <= 0) continue;
    const name = firstSegment.slice(0, eqIdx).trim();
    const value = firstSegment.slice(eqIdx + 1).trim();
    setSafeCookie(map, name, value);
  }
  return map;
}
