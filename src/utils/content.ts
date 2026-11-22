export interface ParsedBody {
  segments: BodySegment[];
  inlineImages: string[];
  signature?: string;
}

export type BodySegment =
  | { type: 'text'; content: string }
  | { type: 'quote'; header: string; content: string; lineCount: number };

const ENTITY_MAP: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
};

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/gi, (m) => ENTITY_MAP[m.toLowerCase()] ?? m)
    .replace(/&#(\d+);/g, (_, num) => {
      const code = Number(num);
      return Number.isFinite(code) && code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : '';
    });
}

export function stripHtmlTags(input?: string): string {
  if (!input) return '';
  return decodeHtmlEntities(input.replace(/<[^>]+>/g, '')).trim();
}

const CLIENT_TAIL_PATTERNS = [
  /^[-—–~\s#]*来自\s*[「「\[【(（]?\s*(?:水木社区|最水木|水木|SMTH|xsmth|iSMTH|zSMTH|NewSMTH|Android|iPhone|iPad|HarmonyOS).*$/i,
  /^[-—–~\s#]*发自\s*[「「\[【(（]?\s*(?:今日水木|水木社区|水木|iSMTH|xsmth|zSMTH|SMTH|NewSMTH|最水木|iPhone|Android|iPad|HarmonyOS|小米|华为|vivo|OPPO|客户端|手机).*$/i,
  /^[-—–~\s]*Sent from my .*$/i,
  /^※\s*(?:来源|修改)\s*[:：·].*$/,
  /^FROM\s+\d+\.\d+\.\d+\.\*.*$/i,
  /^#\s*发送自.*$/,
];

function isSignatureDelimiter(line: string): boolean {
  const t = line.trim();
  return t === '--' || t === '——';
}

function isClientTailLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  return CLIENT_TAIL_PATTERNS.some((re) => re.test(t));
}

export function normalizeRawBody(raw: string): { text: string; inlineImages: string[] } {
  if (!raw) return { text: '', inlineImages: [] };

  const inlineImages: string[] = [];
  let text = raw.replace(/\r\n?/g, '\n');

  // Extract inline <img src="..."> before stripping tags
  text = text.replace(/<img\b[^>]*\bsrc\s*=\s*['"]([^'"]+)['"][^>]*>/gi, (_, src: string) => {
    const cleanSrc = decodeHtmlEntities(src.trim());
    if (cleanSrc && !inlineImages.includes(cleanSrc)) {
      inlineImages.push(cleanSrc);
    }
    return '\n';
  });

  // Convert structural HTML breaks into newlines
  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|blockquote|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  text = decodeHtmlEntities(text);

  // Strip ANSI escape codes sometimes left by classic telnet posts
  // eslint-disable-next-line no-control-regex
  text = text.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '');

  // Trim excessive blank lines
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return { text, inlineImages };
}

export function parseArticleBody(raw: string, stripSignature: boolean): ParsedBody {
  const { text, inlineImages } = normalizeRawBody(raw);
  if (!text) return { segments: [], inlineImages };

  const allLines = text.split('\n');
  let mainLines = allLines;
  let signature: string | undefined;

  // Detect standard BBS signature delimiter `--` near the tail
  let sigIdx = -1;
  for (let i = allLines.length - 1; i >= 0; i--) {
    if (isSignatureDelimiter(allLines[i])) {
      sigIdx = i;
      break;
    }
  }
  if (sigIdx !== -1 && allLines.length - sigIdx <= 12) {
    signature = allLines.slice(sigIdx).join('\n').trim();
    if (stripSignature) {
      mainLines = allLines.slice(0, sigIdx);
    }
  }

  // Strip trailing mobile client tails ("发自「今日水木...」", "- 来自 水木社区APP...", "※ 来源:...")
  if (stripSignature) {
    while (mainLines.length > 0) {
      const last = mainLines[mainLines.length - 1].trim();
      if (!last || isClientTailLine(last)) {
        mainLines.pop();
      } else {
        break;
      }
    }
  }

  // Group lines into prose text vs BBS quote blocks (`【 在 xxx 的大作中提到: 】` + `: ...`)
  const segments: BodySegment[] = [];
  let textBuf: string[] = [];

  const flushText = () => {
    if (stripSignature) {
      while (textBuf.length > 0) {
        const last = textBuf[textBuf.length - 1].trim();
        if (!last || isClientTailLine(last) || isSignatureDelimiter(last)) {
          textBuf.pop();
        } else {
          break;
        }
      }
    }
    const joined = textBuf.join('\n').replace(/^\n+|\n+$/g, '');
    if (joined) {
      segments.push({ type: 'text', content: joined });
    }
    textBuf = [];
  };

  let i = 0;
  while (i < mainLines.length) {
    const line = mainLines[i];
    const quoteHeaderMatch = line.match(/^\s*【\s*在\s*(.+?)\s*的大作中提到\s*[:：]\s*】\s*$/);
    const isColonQuote = /^\s*[:：]/.test(line);

    if (quoteHeaderMatch || isColonQuote) {
      flushText();
      let header = quoteHeaderMatch ? `引用 ${quoteHeaderMatch[1].trim()}` : '引用内容';
      const quoteLines: string[] = [];
      if (quoteHeaderMatch) {
        i++;
      }
      while (i < mainLines.length) {
        const cur = mainLines[i];
        if (/^\s*[:：]/.test(cur)) {
          quoteLines.push(cur.replace(/^\s*[:：]\s?/, ''));
          i++;
        } else if (cur.trim() === '' && i + 1 < mainLines.length && /^\s*[:：]/.test(mainLines[i + 1])) {
          quoteLines.push('');
          i++;
        } else {
          break;
        }
      }
      const cleanedQuote = quoteLines.join('\n').trim();
      if (cleanedQuote) {
        // Shorten header author if it contains parenthesis nick
        header = header.replace(/\s+/g, ' ').trim();
        segments.push({
          type: 'quote',
          header,
          content: cleanedQuote,
          lineCount: cleanedQuote.split('\n').length,
        });
      }
      continue;
    }

    textBuf.push(line);
    i++;
  }
  flushText();

  return { segments, inlineImages, signature };
}

export interface TextRun {
  type: 'plain' | 'link';
  text: string;
  href?: string;
}

const URL_REGEX = /(https?:\/\/[^\s<>"'`\u4e00-\u9fa5]+)/gi;

export function splitLinks(text: string): TextRun[] {
  const runs: TextRun[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(URL_REGEX)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) {
      runs.push({ type: 'plain', text: text.slice(lastIndex, idx) });
    }
    const url = match[0].replace(/[.,;!?)\]]+$/, '');
    runs.push({ type: 'link', text: url, href: url });
    lastIndex = idx + url.length;
  }
  if (lastIndex < text.length) {
    runs.push({ type: 'plain', text: text.slice(lastIndex) });
  }
  return runs;
}

export function buildQuotePrefix(author: string, body: string): string {
  const { segments } = parseArticleBody(body, true);
  const firstText = segments.find((s) => s.type === 'text')?.content || '';
  const excerptLines = firstText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((l) => `: ${l.slice(0, 72)}`);

  if (excerptLines.length === 0) return '';
  return `\n\n【 在 ${author} 的大作中提到: 】\n${excerptLines.join('\n')}\n`;
}

/**
 * Produces a clean 2–3 line feed excerpt for Zhihu-Zen style topic cards:
 * strips HTML, inline client signatures (`#发自zSMTH...`), and BBS quotes,
 * collapses newlines into smooth flowing prose.
 */
export function extractFeedExcerpt(
  rawBody?: string,
  maxChars = 118,
): { text: string; truncated: boolean } {
  if (!rawBody) return { text: '', truncated: false };
  const { segments } = parseArticleBody(rawBody, true);
  let prose = segments
    .filter((s) => s.type === 'text')
    .map((s) => s.content)
    .join(' ')
    // Also strip inline trailing `#发自zSMTH@...` appended on the same line
    .replace(/\s+#\s*(?:发自|来自|发送自)[^\n]*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!prose) return { text: '', truncated: false };
  // Upstream list endpoints often truncate body around ~140-160 chars already
  const looksUpstreamTruncated = prose.length >= 115;
  if (prose.length > maxChars) {
    prose = prose.slice(0, maxChars).replace(/[，、；：,\s]+$/, '');
    return { text: `${prose}...`, truncated: true };
  }
  return { text: prose, truncated: looksUpstreamTruncated };
}
