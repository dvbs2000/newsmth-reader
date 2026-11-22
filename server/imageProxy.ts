import type { Request, Response } from 'express';
import { DEFAULT_USER_AGENT, isAllowedImageHost, WAP_ORIGIN } from './config.js';
import { serializeCookieHeader } from './cookieParser.js';
import { localStore } from './store.js';

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

export async function handleImageProxy(req: Request, res: Response): Promise<void> {
  const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
  if (!rawUrl) {
    res.status(400).json({ error: 'Missing url parameter' });
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl);
  } catch {
    res.status(400).json({ error: 'Invalid image URL' });
    return;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    res.status(400).json({ error: 'Unsupported protocol' });
    return;
  }

  if (!isAllowedImageHost(parsed.hostname)) {
    res.status(403).json({ error: `Host not allowed: ${parsed.hostname}` });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const headers: Record<string, string> = {
      'User-Agent': DEFAULT_USER_AGENT,
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      Referer: parsed.hostname.endsWith('newsmth.net') ? 'https://www.newsmth.net/' : `${WAP_ORIGIN}/`,
    };

    if (parsed.hostname.endsWith('newsmth.net') || parsed.hostname.endsWith('mysmth.net')) {
      const cookieHeader = serializeCookieHeader(localStore.getWapSession().cookies);
      if (cookieHeader) headers.Cookie = cookieHeader;
    }

    const upstream = await fetch(parsed.toString(), {
      headers,
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!upstream.ok) {
      res.status(upstream.status).end();
      return;
    }

    const contentLength = Number(upstream.headers.get('content-length') || '0');
    if (contentLength > MAX_IMAGE_BYTES) {
      res.status(413).json({ error: 'Image too large' });
      return;
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    if (!contentType.startsWith('image/') && !contentType.includes('octet-stream')) {
      res.status(415).json({ error: 'Upstream resource is not an image' });
      return;
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.length > MAX_IMAGE_BYTES) {
      res.status(413).json({ error: 'Image too large' });
      return;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(200).send(buffer);
  } catch (err) {
    if (!res.headersSent) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      res.status(isAbort ? 504 : 502).json({ error: isAbort ? 'Image proxy timeout' : 'Image fetch failed' });
    }
  } finally {
    clearTimeout(timer);
  }
}
