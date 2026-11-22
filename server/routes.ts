import { Router, type NextFunction, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { chromeLoginManager } from './chromeLogin.js';
import { FONTS_DIR } from './config.js';
import { handleImageProxy } from './imageProxy.js';
import { clearNforumCookie, getNforumSlotStatus, importNforumCookie } from './nforumSlot.js';
import { SmthApiError, smthClient } from './smthClient.js';
import { localStore, type CustomFontItem } from './store.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 9 },
});

const fontUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
});

const FONT_EXT_MAP: Record<string, { format: CustomFontItem['format']; mime: string }> = {
  '.ttf': { format: 'truetype', mime: 'font/ttf' },
  '.otf': { format: 'opentype', mime: 'font/otf' },
  '.woff': { format: 'woff', mime: 'font/woff' },
  '.woff2': { format: 'woff2', mime: 'font/woff2' },
};

function asyncRoute(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

function asInt(val: unknown, fallback: number): number {
  const n = Number(val);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

export function createApiRouter(): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({
      ok: true,
      chromeAvailable: Boolean(chromeLoginManager.findChromePath()),
      nforumSlot: getNforumSlotStatus(),
    });
  });

  // ---- Image Proxy ----
  router.get('/proxy/image', asyncRoute(handleImageProxy));

  // ---- Auth (Dual Channel: Scheme B Chrome + Scheme A Manual Cookie) ----
  router.get(
    '/auth/status',
    asyncRoute(async (_req, res) => {
      const slot = localStore.getWapSession();
      const profile = await smthClient.getProfile();
      res.json({
        loggedIn: Boolean(profile),
        profile,
        source: slot.source,
        updatedAt: slot.updatedAt,
        chromeAvailable: Boolean(chromeLoginManager.findChromePath()),
        chromeLogin: chromeLoginManager.getState(),
        nforumSlot: getNforumSlotStatus(),
      });
    }),
  );

  router.post(
    '/auth/chrome/start',
    asyncRoute(async (_req, res) => {
      const state = await chromeLoginManager.start();
      res.json(state);
    }),
  );

  router.get('/auth/chrome/status', (_req, res) => {
    res.json(chromeLoginManager.getState());
  });

  router.post('/auth/chrome/cancel', (_req, res) => {
    res.json(chromeLoginManager.cancel());
  });

  router.post(
    '/auth/cookie',
    asyncRoute(async (req, res) => {
      const raw = typeof req.body?.cookie === 'string' ? req.body.cookie : '';
      const profile = await smthClient.importManualCookie(raw);
      res.json({ ok: true, profile });
    }),
  );

  router.post(
    '/auth/logout',
    asyncRoute(async (_req, res) => {
      await smthClient.logout();
      res.json({ ok: true });
    }),
  );

  // ---- Optional isolated nForum extension slot ----
  router.get('/nforum/status', (_req, res) => {
    res.json(getNforumSlotStatus());
  });

  router.post('/nforum/cookie', (req, res) => {
    const raw = typeof req.body?.cookie === 'string' ? req.body.cookie : '';
    res.json(importNforumCookie(raw));
  });

  router.delete('/nforum/cookie', (_req, res) => {
    res.json(clearNforumCookie());
  });

  // ---- Local Preferences, Blocklist, History & Local Favorites ----
  router.get('/local/data', (_req, res) => {
    res.json(localStore.getData());
  });

  router.patch('/local/preferences', (req, res) => {
    res.json(localStore.updatePreferences(req.body || {}));
  });

  router.put('/local/blocklist', (req, res) => {
    res.json(localStore.updateBlocklist(req.body?.blockUsers, req.body?.blockKeywords));
  });

  router.post('/local/fav-boards/toggle', (req, res) => {
    const { id, name, title } = req.body || {};
    if (!id || !name) {
      res.status(400).json({ error: 'id and name required' });
      return;
    }
    res.json(localStore.toggleLocalFavBoard({ id: String(id), name: String(name), title: String(title || name) }));
  });

  router.post('/local/board-history', (req, res) => {
    const { id, name, title } = req.body || {};
    if (!name) {
      res.status(400).json({ error: 'name required' });
      return;
    }
    res.json(localStore.recordBoardHistory({ id: String(id || ''), name: String(name), title: String(title || name) }));
  });

  router.post('/local/read-topic', (req, res) => {
    const { topicId, lastPage, subject } = req.body || {};
    if (!topicId) {
      res.status(400).json({ error: 'topicId required' });
      return;
    }
    localStore.markTopicRead(String(topicId), asInt(lastPage, 1), typeof subject === 'string' ? subject : undefined);
    res.json({ ok: true });
  });

  // ---- Local Custom Fonts (.ttf / .otf / .woff / .woff2) ----
  router.post('/local/fonts', fontUpload.single('font'), (req, res) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: '请选择字体文件（支持 .ttf / .otf / .woff / .woff2）' });
      return;
    }
    // Decode UTF-8 original filename safely (multer encodes non-ASCII filenames as latin1)
    const decodedOrig = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const ext = path.extname(decodedOrig).toLowerCase();
    const meta = FONT_EXT_MAP[ext];
    if (!meta) {
      res.status(400).json({ error: '不支持的字体格式，请上传 .ttf / .otf / .woff / .woff2' });
      return;
    }

    if (!fs.existsSync(FONTS_DIR)) {
      fs.mkdirSync(FONTS_DIR, { recursive: true, mode: 0o700 });
    }

    const id = crypto.randomBytes(6).toString('hex');
    const filename = `font_${id}${ext}`;
    const targetPath = path.join(FONTS_DIR, filename);
    fs.writeFileSync(targetPath, file.buffer, { mode: 0o600 });

    const baseName = path.basename(decodedOrig, path.extname(decodedOrig)).trim();
    const customName =
      typeof req.body?.name === 'string' && req.body.name.trim()
        ? req.body.name.trim()
        : baseName || `自定义字体 ${id.slice(0, 4)}`;

    const fontItem: CustomFontItem = {
      id,
      name: customName,
      filename,
      format: meta.format,
      size: file.size,
      addedAt: Date.now(),
    };
    const customFonts = localStore.addCustomFont(fontItem);
    res.json({ font: fontItem, customFonts });
  });

  router.get('/local/fonts/:filename', (req, res) => {
    const filename = String(req.params.filename || '');
    if (!/^font_[a-f0-9]+\.(ttf|otf|woff2?)$/i.test(filename)) {
      res.status(400).json({ error: 'Invalid font filename' });
      return;
    }
    const fullPath = path.join(FONTS_DIR, filename);
    if (!fs.existsSync(fullPath)) {
      res.status(404).end();
      return;
    }
    const ext = path.extname(filename).toLowerCase();
    const mime = FONT_EXT_MAP[ext]?.mime || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(fullPath);
  });

  router.delete('/local/fonts/:id', (req, res) => {
    const customFonts = localStore.removeCustomFont(String(req.params.id || ''));
    res.json({ customFonts });
  });

  // ---- Home & Hot ----
  router.get(
    '/hot/ten',
    asyncRoute(async (_req, res) => {
      res.json(await smthClient.getHotTen());
    }),
  );

  router.get(
    '/hot/global',
    asyncRoute(async (req, res) => {
      res.json(await smthClient.getHotGlobal(asInt(req.query.page, 1), asInt(req.query.size, 20)));
    }),
  );

  router.get(
    '/hot/section',
    asyncRoute(async (req, res) => {
      const id = String(req.query.id || '');
      if (!id) throw new SmthApiError(400, '缺少分区 id');
      res.json(await smthClient.getHotSection(id, asInt(req.query.page, 1)));
    }),
  );

  router.get(
    '/hot/boards',
    asyncRoute(async (_req, res) => {
      res.json(await smthClient.getPopularBoards());
    }),
  );

  // ---- Sections & Boards ----
  router.get(
    '/sections',
    asyncRoute(async (_req, res) => {
      res.json(await smthClient.getSections());
    }),
  );

  router.get(
    '/sections/:id/boards',
    asyncRoute(async (req, res) => {
      res.json(await smthClient.getSectionBoards(String(req.params.id)));
    }),
  );

  router.get(
    '/boards/search',
    asyncRoute(async (req, res) => {
      const keyword = String(req.query.keyword || '').trim();
      if (!keyword) {
        res.json([]);
        return;
      }
      res.json(await smthClient.searchBoards(keyword));
    }),
  );

  router.get(
    '/boards/:id/topics',
    asyncRoute(async (req, res) => {
      const page = asInt(req.query.page, 1);
      const order = asInt(req.query.order, 1) === 0 ? 0 : 1;
      res.json(await smthClient.getBoardTopics(String(req.params.id), page, order));
    }),
  );

  router.get(
    '/boards/:id/tops',
    asyncRoute(async (req, res) => {
      res.json(
        await smthClient.getBoardTops(
          String(req.params.id),
          asInt(req.query.start, 0),
          asInt(req.query.size, 20),
        ),
      );
    }),
  );

  router.get(
    '/boards/:id/essence',
    asyncRoute(async (req, res) => {
      res.json(
        await smthClient.getBoardEssence(
          String(req.params.id),
          asInt(req.query.start, 0),
          asInt(req.query.size, 20),
        ),
      );
    }),
  );

  // ---- Cloud Favorites ----
  router.get(
    '/favorites/boards',
    asyncRoute(async (_req, res) => {
      res.json(await smthClient.getFavBoards());
    }),
  );

  router.post(
    '/favorites/boards',
    asyncRoute(async (req, res) => {
      const id = String(req.body?.id || '');
      if (!id) throw new SmthApiError(400, '缺少版面 id');
      res.json(await smthClient.addFavBoard(id));
    }),
  );

  router.delete(
    '/favorites/boards/:id',
    asyncRoute(async (req, res) => {
      const dirId = asInt(req.query.dirId, 0);
      res.json(await smthClient.removeFavBoard(String(req.params.id), dirId));
    }),
  );

  router.get(
    '/favorites/topics',
    asyncRoute(async (req, res) => {
      const sort = req.query.sort === 'asc' ? 'asc' : 'desc';
      res.json(
        await smthClient.getFavTopics(asInt(req.query.start, 0), asInt(req.query.size, 20), sort),
      );
    }),
  );

  router.post(
    '/favorites/topics',
    asyncRoute(async (req, res) => {
      const id = String(req.body?.id || '');
      if (!id) throw new SmthApiError(400, '缺少主题 id');
      res.json(await smthClient.addFavTopic(id));
    }),
  );

  router.delete(
    '/favorites/topics/:id',
    asyncRoute(async (req, res) => {
      res.json(await smthClient.removeFavTopic(String(req.params.id)));
    }),
  );

  // ---- Thread & Articles ----
  router.get(
    '/topics/:id/detail',
    asyncRoute(async (req, res) => {
      res.json(await smthClient.getTopicDetail(String(req.params.id)));
    }),
  );

  router.get(
    '/topics/:id/articles',
    asyncRoute(async (req, res) => {
      const mode = asInt(req.query.mode, 1);
      const page = asInt(req.query.page, 1);
      const size = asInt(req.query.size, 20);
      const articleId = typeof req.query.articleId === 'string' ? req.query.articleId : undefined;
      res.json(await smthClient.getTopicArticles(String(req.params.id), mode, page, size, articleId));
    }),
  );

  router.get(
    '/topics/:id/likes',
    asyncRoute(async (req, res) => {
      res.json(await smthClient.getTopicLikes(String(req.params.id)));
    }),
  );

  // ---- Write Operations ----
  router.get(
    '/topics/publish/check',
    asyncRoute(async (_req, res) => {
      res.json(await smthClient.checkPublishCaptcha());
    }),
  );

  router.get(
    '/files/token',
    asyncRoute(async (_req, res) => {
      const token = await smthClient.getUploadToken();
      res.json({ token });
    }),
  );

  router.post(
    '/files/upload/:boardId/:token',
    upload.array('files', 9),
    asyncRoute(async (req, res) => {
      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length === 0) throw new SmthApiError(400, '未收到上传文件');
      const result = await smthClient.uploadAttachments(
        String(req.params.boardId),
        String(req.params.token),
        files.map((f) => ({
          buffer: f.buffer,
          originalname: f.originalname,
          mimetype: f.mimetype,
        })),
      );
      res.json(result);
    }),
  );

  router.delete(
    '/files/:token',
    asyncRoute(async (req, res) => {
      const filenames = Array.isArray(req.body?.filenames) ? req.body.filenames.map(String) : [];
      res.json(await smthClient.deleteUploadedFile(String(req.params.token), filenames));
    }),
  );

  router.post(
    '/topics/publish',
    asyncRoute(async (req, res) => {
      const { boardId, subject, body, uploadToken, captcha } = req.body || {};
      if (!boardId || !subject?.trim()) {
        throw new SmthApiError(400, '请填写标题和版面');
      }
      res.json(
        await smthClient.publishTopic({
          boardId: String(boardId),
          subject: String(subject).trim(),
          body: String(body || ''),
          uploadToken: uploadToken ? String(uploadToken) : undefined,
          captcha: captcha && typeof captcha === 'object' ? captcha : undefined,
        }),
      );
    }),
  );

  router.post(
    '/topics/reply',
    asyncRoute(async (req, res) => {
      const { articleId, body, uploadToken, captcha } = req.body || {};
      if (!articleId || !String(body || '').trim()) {
        throw new SmthApiError(400, '回复内容不能为空');
      }
      res.json(
        await smthClient.replyArticle({
          articleId: String(articleId),
          body: String(body),
          uploadToken: uploadToken ? String(uploadToken) : undefined,
          captcha: captcha && typeof captcha === 'object' ? captcha : undefined,
        }),
      );
    }),
  );

  router.post(
    '/articles/update',
    asyncRoute(async (req, res) => {
      const { articleId, subject, body, uploadToken } = req.body || {};
      if (!articleId) throw new SmthApiError(400, '缺少文章 id');
      res.json(
        await smthClient.updateArticle({
          articleId: String(articleId),
          subject: String(subject || ''),
          body: String(body || ''),
          uploadToken: uploadToken ? String(uploadToken) : undefined,
        }),
      );
    }),
  );

  router.delete(
    '/topics/:id',
    asyncRoute(async (req, res) => {
      res.json(await smthClient.deleteTopic(String(req.params.id)));
    }),
  );

  router.delete(
    '/articles/:id',
    asyncRoute(async (req, res) => {
      res.json(await smthClient.deleteArticle(String(req.params.id)));
    }),
  );

  router.post(
    '/topics/:id/like',
    asyncRoute(async (req, res) => {
      const { boardName, body, score, captcha } = req.body || {};
      if (!boardName || !String(body || '').trim()) {
        throw new SmthApiError(400, '请填写 Like 评语');
      }
      res.json(
        await smthClient.addLike({
          topicId: String(req.params.id),
          boardName: String(boardName),
          body: String(body).trim().slice(0, 30),
          score: Math.max(-5, Math.min(5, asInt(score, 1))),
          captcha: captcha && typeof captcha === 'object' ? captcha : undefined,
        }),
      );
    }),
  );

  router.delete(
    '/topics/:id/like',
    asyncRoute(async (req, res) => {
      const boardName = String(req.query.boardName || '');
      if (!boardName) throw new SmthApiError(400, '缺少版面名');
      res.json(await smthClient.removeLike(String(req.params.id), boardName));
    }),
  );

  // ---- Messages & Notifications ----
  router.get(
    '/messages/unread',
    asyncRoute(async (_req, res) => {
      res.json(await smthClient.getUnreadSummary());
    }),
  );

  router.get(
    '/messages/conversations',
    asyncRoute(async (req, res) => {
      res.json(await smthClient.getConversations(asInt(req.query.page, 1)));
    }),
  );

  router.get(
    '/messages/conversations/:speakerId',
    asyncRoute(async (req, res) => {
      res.json(
        await smthClient.getConversationMessages(
          String(req.params.speakerId),
          asInt(req.query.page, 1),
        ),
      );
    }),
  );

  router.post(
    '/messages/send',
    asyncRoute(async (req, res) => {
      const { recipientName, body, subject } = req.body || {};
      if (!recipientName?.trim() || !body?.trim()) {
        throw new SmthApiError(400, '收件人和正文不能为空');
      }
      res.json(
        await smthClient.sendMessage(
          String(recipientName).trim(),
          String(body),
          typeof subject === 'string' ? subject : '',
        ),
      );
    }),
  );

  router.post(
    '/messages/conversations/:speakerId/read',
    asyncRoute(async (req, res) => {
      res.json(await smthClient.markConversationRead(String(req.params.speakerId)));
    }),
  );

  router.delete(
    '/messages/conversations/:speakerId',
    asyncRoute(async (req, res) => {
      res.json(await smthClient.deleteConversation(String(req.params.speakerId)));
    }),
  );

  router.get(
    '/notifications/:type',
    asyncRoute(async (req, res) => {
      const typeNum = asInt(req.params.type, 2);
      const type = (typeNum === 1 || typeNum === 2 || typeNum === 3 ? typeNum : 2) as 1 | 2 | 3;
      const statusNum = asInt(req.query.status, 0);
      const status = (statusNum === 1 || statusNum === 2 ? statusNum : 0) as 0 | 1 | 2;
      res.json(
        await smthClient.getNotifications(
          type,
          status,
          asInt(req.query.start, 0),
          asInt(req.query.size, 20),
        ),
      );
    }),
  );

  router.post(
    '/notifications/:id/read',
    asyncRoute(async (req, res) => {
      res.json(await smthClient.markNotifyRead(String(req.params.id)));
    }),
  );

  router.post(
    '/notifications/read-all/:type',
    asyncRoute(async (req, res) => {
      const typeNum = asInt(req.params.type, 2);
      const type = (typeNum === 1 || typeNum === 2 || typeNum === 3 ? typeNum : 2) as 1 | 2 | 3;
      res.json(await smthClient.markAllNotifyRead(type));
    }),
  );

  router.delete(
    '/notifications/:id',
    asyncRoute(async (req, res) => {
      res.json(await smthClient.deleteNotify(String(req.params.id)));
    }),
  );

  // ---- Search & Users ----
  router.get(
    '/search/articles',
    asyncRoute(async (req, res) => {
      const keyword = String(req.query.keyword || '').trim();
      if (!keyword) {
        res.json({ total: 0, articles: [] });
        return;
      }
      localStore.recordArticleSearch(keyword);
      res.json(
        await smthClient.searchArticles({
          keyword,
          start: asInt(req.query.start, 0),
          count: asInt(req.query.count, 20),
          original: req.query.original !== 'false',
          boards: typeof req.query.boards === 'string' ? req.query.boards : '',
          status: asInt(req.query.status, 0) === 2 ? 2 : 0,
        }),
      );
    }),
  );

  router.get(
    '/search/accounts',
    asyncRoute(async (req, res) => {
      const keyword = String(req.query.keyword || '').trim();
      if (!keyword) {
        res.json({ total: 0, accounts: [] });
        return;
      }
      res.json(
        await smthClient.searchAccounts(
          keyword,
          asInt(req.query.start, 0),
          asInt(req.query.count, 20),
        ),
      );
    }),
  );

  router.get(
    '/users/:username',
    asyncRoute(async (req, res) => {
      res.json(await smthClient.getAccountDetail(String(req.params.username)));
    }),
  );

  router.get(
    '/users/:username/posts',
    asyncRoute(async (req, res) => {
      res.json(
        await smthClient.getAccountPosts(
          String(req.params.username),
          asInt(req.query.page, 1),
        ),
      );
    }),
  );

  // Centralized error handler
  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof SmthApiError) {
      res.status(err.status).json({
        error: err.message,
        upstreamCode: err.upstreamCode,
        kbsCode: err.kbsCode,
      });
      return;
    }
    const message = err instanceof Error ? err.message : '服务器内部错误';
    res.status(500).json({ error: message });
  });

  return router;
}
