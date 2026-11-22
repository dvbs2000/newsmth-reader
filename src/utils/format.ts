export function formatRelativeTime(timestampMs?: number): string {
  if (!timestampMs || !Number.isFinite(timestampMs)) return '';
  const ts = timestampMs < 1e12 ? timestampMs * 1000 : timestampMs;
  const now = Date.now();
  const diffSec = Math.floor((now - ts) / 1000);

  if (diffSec < 60) return '刚刚';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}分钟前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}小时前`;

  const date = new Date(ts);
  const nowDate = new Date(now);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');

  if (date.getFullYear() === nowDate.getFullYear()) {
    return `${mm}-${dd} ${hh}:${min}`;
  }
  return `${date.getFullYear()}-${mm}-${dd}`;
}

export function formatExactTime(timestampMs?: number): string {
  if (!timestampMs || !Number.isFinite(timestampMs)) return '';
  const ts = timestampMs < 1e12 ? timestampMs * 1000 : timestampMs;
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function proxyImageUrl(rawUrl?: string): string {
  if (!rawUrl) return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  const normalized = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed;
  return `/api/proxy/image?url=${encodeURIComponent(normalized)}`;
}

export function formatCount(n?: number): string {
  if (!n || n <= 0) return '0';
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`;
  return String(n);
}
