import { DEFAULT_USER_AGENT, WAP_API_BASE, WAP_ORIGIN } from './config.js';
import {
  extractSetCookies,
  parseCookieInput,
  serializeCookieHeader,
  type CookieMap,
} from './cookieParser.js';
import { localStore } from './store.js';

export class SmthApiError extends Error {
  status: number;
  upstreamCode?: number;
  kbsCode?: number;

  constructor(status: number, message: string, upstreamCode?: number, kbsCode?: number) {
    super(message);
    this.name = 'SmthApiError';
    this.status = status;
    this.upstreamCode = upstreamCode;
    this.kbsCode = kbsCode;
  }
}

interface WapRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  form?: Record<string, string | number | boolean | undefined | null>;
  json?: unknown;
  formData?: FormData;
  overrideCookies?: CookieMap;
  allowCodeZero?: boolean;
}

interface WapEnvelope<T> {
  code?: number;
  kbsCode?: number;
  message?: string;
  data?: T;
  result?: T;
}

async function wapRequest<T = unknown>(opts: WapRequestOptions): Promise<T> {
  const method = opts.method || 'GET';
  const url = new URL(`${WAP_API_BASE}${opts.path.startsWith('/') ? opts.path : `/${opts.path}`}`);

  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, String(v));
      }
    }
  }

  const session = localStore.getWapSession();
  const cookies = opts.overrideCookies ?? session.cookies;
  const cookieHeader = serializeCookieHeader(cookies);

  const headers: Record<string, string> = {
    'User-Agent': DEFAULT_USER_AGENT,
    Accept: 'application/json, text/plain, */*',
    Referer: `${WAP_ORIGIN}/`,
    Origin: WAP_ORIGIN,
  };
  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  let body: BodyInit | undefined;
  if (opts.formData) {
    body = opts.formData;
  } else if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json;charset=UTF-8';
    body = JSON.stringify(opts.json);
  } else if (method !== 'GET') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
    const params = new URLSearchParams();
    if (opts.form) {
      for (const [k, v] of Object.entries(opts.form)) {
        if (v !== undefined && v !== null) {
          params.set(k, String(v));
        }
      }
    }
    params.set('t', String(Date.now()));
    body = params.toString();
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18_000);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method,
      headers,
      body,
      signal: controller.signal,
    });
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    throw new SmthApiError(
      isAbort ? 504 : 502,
      isAbort ? '连接水木超时，请稍后重试' : '无法连接到水木社区服务器',
    );
  } finally {
    clearTimeout(timer);
  }

  // Keep session cookies fresh if upstream rotates any Set-Cookie
  if (!opts.overrideCookies && session.source !== 'none') {
    const incoming = extractSetCookies(res.headers);
    if (Object.keys(incoming).length > 0) {
      localStore.setWapCookies(incoming, session.source, false);
    }
  }

  const rawText = await res.text();
  let envelope: WapEnvelope<T>;
  try {
    envelope = JSON.parse(rawText) as WapEnvelope<T>;
  } catch {
    throw new SmthApiError(
      res.ok ? 502 : res.status,
      `水木接口返回非 JSON 内容 (HTTP ${res.status})`,
    );
  }

  if (envelope.code === 403) {
    throw new SmthApiError(401, envelope.message || '未登录或会话已过期，请重新登录', 403, envelope.kbsCode);
  }
  if (envelope.code === 3) {
    throw new SmthApiError(
      428,
      envelope.message || '水木触发人机校验，请先在官方页面完成验证后重试',
      3,
      envelope.kbsCode,
    );
  }

  const okCodes = opts.allowCodeZero ? [1, 0] : [1];
  if (envelope.code !== undefined && !okCodes.includes(envelope.code)) {
    throw new SmthApiError(
      400,
      envelope.message || `水木操作失败 (code=${envelope.code}, kbs=${envelope.kbsCode ?? ''})`,
      envelope.code,
      envelope.kbsCode,
    );
  }

  return (envelope.data !== undefined ? envelope.data : envelope.result) as T;
}

export interface GeetestCaptchaFields {
  lot_number: string;
  captcha_output: string;
  pass_token: string;
  gen_time: string;
  captcha_id: string;
  client?: string;
  type?: number;
}

export interface ProfilePayload {
  account: {
    id: string;
    name: string;
    nick: string;
    avatarUrl?: string;
    k3sUrl?: string;
    level?: number;
    levelTitle?: string;
    score?: number;
    createTime?: number;
    loginTime?: number;
  };
  title?: string;
}

export const smthClient = {
  // ---- Auth ----
  async getProfile(overrideCookies?: CookieMap): Promise<ProfilePayload | null> {
    const cookies = overrideCookies ?? localStore.getWapSession().cookies;
    if (Object.keys(cookies).length === 0) return null;
    try {
      const data = await wapRequest<ProfilePayload>({
        method: 'POST',
        path: '/api/profile',
        overrideCookies,
      });
      if (!data?.account?.name || data.account.name.toLowerCase() === 'guest') {
        return null;
      }
      return data;
    } catch (err) {
      if (err instanceof SmthApiError && err.status === 401) {
        return null;
      }
      throw err;
    }
  },

  async importManualCookie(rawCookie: string): Promise<ProfilePayload> {
    const cookies = parseCookieInput(rawCookie);
    if (Object.keys(cookies).length === 0) {
      throw new SmthApiError(400, '未能解析出有效 Cookie，请检查粘贴内容');
    }
    const profile = await this.getProfile(cookies);
    if (!profile) {
      throw new SmthApiError(
        401,
        '该 Cookie 未通过水木登录态校验（请确保来自 wap.newsmth.net 且处于已登录状态）',
      );
    }
    localStore.setWapCookies(cookies, 'manual', true);
    return profile;
  },

  async logout(): Promise<void> {
    try {
      await wapRequest({ method: 'POST', path: '/authorize/sign-out' });
    } catch {
      // ignore upstream sign-out failure; always clear local session
    }
    localStore.clearWapSession();
  },

  // ---- Home & Hot ----
  getHotTen() {
    return wapRequest({ path: '/api/hot/ten' });
  },

  getHotGlobal(page = 1, size = 20) {
    return wapRequest({ path: '/api/hot/global', query: { page, size } });
  },

  getHotSection(sectionId: string, page = 1) {
    return wapRequest({ path: '/api/hot/section', query: { id: sectionId, page } });
  },

  getPopularBoards() {
    return wapRequest({ path: '/api/hot/popularity/board' });
  },

  getChannels() {
    return wapRequest({ path: '/api/channel/loadChannels' });
  },

  getChannelTopics(channel: string, page = 1, size = 20) {
    if (channel === 'album') {
      return wapRequest({ path: '/api/album/load/global', query: { page, size } });
    }
    return wapRequest({ path: '/api/channel/loadTopics', query: { channel, page, size } });
  },

  // ---- Sections & Boards ----
  getSections() {
    return wapRequest({ path: '/api/section/all' });
  },

  getSectionBoards(sectionId: string) {
    return wapRequest({ path: '/api/section/subs', query: { id: sectionId } });
  },

  getBoardTopics(boardId: string, page = 1, isOrderByFlushTime: 0 | 1 = 1) {
    return wapRequest({
      path: '/api/board/topic/list',
      query: { id: boardId, isOrderByFlushTime, page },
    });
  },

  getBoardTops(boardId: string, start = 0, size = 20) {
    return wapRequest({ path: `/api/board/load/top/${encodeURIComponent(boardId)}/${start}/${size}` });
  },

  getBoardEssence(boardId: string, start = 0, size = 20) {
    return wapRequest({
      path: `/api/board/load/essence/${encodeURIComponent(boardId)}/${start}/${size}`,
    });
  },

  searchBoards(keyword: string) {
    return wapRequest({ path: '/api/search/board', query: { keyword } });
  },

  // ---- Cloud Favorites ----
  getFavBoards() {
    return wapRequest({ path: '/api/profile/fav/boards' });
  },

  addFavBoard(boardId: string) {
    return wapRequest({
      method: 'POST',
      path: '/api/profile/addFavorite',
      form: { id: boardId },
    });
  },

  removeFavBoard(boardId: string, dirId = 0) {
    return wapRequest({
      method: 'DELETE',
      path: `/api/profile/favorite/boards/${encodeURIComponent(boardId)}/${dirId}`,
    });
  },

  getFavTopics(start = 0, size = 20, sort: 'desc' | 'asc' = 'desc') {
    return wapRequest({ path: `/api/profile/favTopic/${sort}/${start}/${size}` });
  },

  addFavTopic(topicId: string) {
    return wapRequest({
      method: 'POST',
      path: '/api/profile/addFavTopic',
      form: { id: topicId },
    });
  },

  removeFavTopic(topicId: string) {
    return wapRequest({
      method: 'DELETE',
      path: `/api/profile/favTopic/topicid/${encodeURIComponent(topicId)}`,
    });
  },

  // ---- Thread & Articles ----
  getTopicDetail(topicId: string) {
    return wapRequest({ path: `/api/topic/${encodeURIComponent(topicId)}/detail` });
  },

  getTopicArticles(
    topicId: string,
    mode = 1,
    page = 1,
    size = 20,
    articleId?: string,
  ) {
    return wapRequest({
      path: `/api/topic/loadArticlesByMode/${encodeURIComponent(topicId)}/${mode}/${page}/${size}`,
      query: articleId ? { articleId } : undefined,
    });
  },

  getTopicLikes(topicId: string) {
    return wapRequest({ path: `/api/topic/${encodeURIComponent(topicId)}/likes` });
  },

  // ---- Write Ops ----
  getUploadToken() {
    return wapRequest<string>({ path: '/api/file/token' });
  },

  getArticleFilesToken(articleId: string) {
    return wapRequest<{ token?: string; files?: unknown[] }>({
      path: `/api/topic/${encodeURIComponent(articleId)}/files/load`,
    });
  },

  async uploadAttachments(
    boardId: string,
    token: string,
    files: Array<{ buffer: Buffer; originalname: string; mimetype: string }>,
  ) {
    const fd = new FormData();
    for (const f of files) {
      const blob = new Blob([new Uint8Array(f.buffer)], {
        type: f.mimetype || 'application/octet-stream',
      });
      fd.append('files', blob, f.originalname || 'image.jpg');
    }
    return wapRequest({
      method: 'POST',
      path: `/api/file/upload/${encodeURIComponent(boardId)}/${encodeURIComponent(token)}`,
      formData: fd,
    });
  },

  deleteUploadedFile(token: string, filenames: string[]) {
    return wapRequest({
      method: 'DELETE',
      path: `/api/file/delete/${encodeURIComponent(token)}`,
      json: filenames,
    });
  },

  async checkPublishCaptcha(): Promise<{ needCaptcha: boolean; code?: number; message?: string }> {
    const data = await wapRequest<{ code?: number; message?: string }>({
      path: '/api/topic/publish/check',
    });
    return {
      needCaptcha: data?.code === 3,
      code: data?.code,
      message: data?.message,
    };
  },

  async publishTopic(params: {
    boardId: string;
    subject: string;
    body: string;
    uploadToken?: string;
    captcha?: GeetestCaptchaFields;
  }) {
    const uploadToken = params.uploadToken || (await this.getUploadToken());
    const captchaForm = params.captcha
      ? {
          type: params.captcha.type ?? 3,
          lot_number: params.captcha.lot_number,
          captcha_output: params.captcha.captcha_output,
          pass_token: params.captcha.pass_token,
          gen_time: params.captcha.gen_time,
          captcha_id: params.captcha.captcha_id,
          client: params.captcha.client || 'wap',
        }
      : {};
    return wapRequest({
      method: 'POST',
      path: '/api/topic/publish',
      form: {
        boardId: params.boardId,
        subject: params.subject,
        body: params.body,
        uploadToken,
        ...captchaForm,
      },
    });
  },

  async replyArticle(params: {
    articleId: string;
    body: string;
    uploadToken?: string;
    captcha?: GeetestCaptchaFields;
  }) {
    const uploadToken = params.uploadToken || (await this.getUploadToken());
    const captchaForm = params.captcha
      ? {
          type: params.captcha.type ?? 3,
          lot_number: params.captcha.lot_number,
          captcha_output: params.captcha.captcha_output,
          pass_token: params.captcha.pass_token,
          gen_time: params.captcha.gen_time,
          captcha_id: params.captcha.captcha_id,
          client: params.captcha.client || 'wap',
        }
      : {};
    return wapRequest({
      method: 'POST',
      path: '/api/topic/reply',
      form: {
        articleId: params.articleId,
        body: params.body,
        uploadToken,
        ...captchaForm,
      },
    });
  },

  async updateArticle(params: {
    articleId: string;
    subject: string;
    body: string;
    uploadToken?: string;
  }) {
    let uploadToken = params.uploadToken;
    if (!uploadToken) {
      try {
        const res = await this.getArticleFilesToken(params.articleId);
        uploadToken = res?.token;
      } catch {
        // fallback to fresh upload token
      }
    }
    if (!uploadToken) {
      uploadToken = await this.getUploadToken();
    }
    return wapRequest({
      method: 'POST',
      path: '/api/topic/updateArticle',
      form: {
        articleId: params.articleId,
        subject: params.subject,
        body: params.body,
        uploadToken,
      },
    });
  },

  deleteTopic(topicId: string) {
    return wapRequest({
      method: 'DELETE',
      path: `/api/topic/delete/${encodeURIComponent(topicId)}`,
    });
  },

  deleteArticle(articleId: string) {
    return wapRequest({
      method: 'DELETE',
      path: `/api/topic/delete/article/${encodeURIComponent(articleId)}`,
    });
  },

  addLike(params: {
    topicId: string;
    boardName: string;
    body: string;
    score: number;
    captcha?: GeetestCaptchaFields;
  }) {
    const captchaForm = params.captcha
      ? {
          lot_number: params.captcha.lot_number,
          captcha_output: params.captcha.captcha_output,
          pass_token: params.captcha.pass_token,
          gen_time: params.captcha.gen_time,
          captcha_id: params.captcha.captcha_id,
          client: params.captcha.client || 'wap',
        }
      : {};
    return wapRequest({
      method: 'POST',
      path: '/api/topic/addLike',
      form: {
        id: params.topicId,
        boardName: params.boardName,
        body: params.body,
        score: params.score,
        ...captchaForm,
      },
    });
  },

  removeLike(topicId: string, boardName: string) {
    return wapRequest({
      method: 'DELETE',
      path: '/api/topic/removeLike',
      query: { id: topicId, boardName },
      json: {},
    });
  },

  // ---- Messages & Notifications ----
  getConversations(page = 1) {
    return wapRequest({ path: '/api/message/conversations', query: { page } });
  },

  getConversationMessages(speakerId: string, page = 1) {
    return wapRequest({
      path: `/api/message/${encodeURIComponent(speakerId)}/messages/${page}`,
    });
  },

  sendMessage(recipientName: string, body: string, subject = '') {
    return wapRequest({
      method: 'POST',
      path: '/api/message/send',
      form: { recipientName, subject, body },
    });
  },

  markConversationRead(speakerId: string) {
    return wapRequest({ path: '/api/message/read', query: { speakId: speakerId } });
  },

  deleteConversation(speakerId: string) {
    return wapRequest({
      method: 'PATCH',
      path: `/api/message/delete/${encodeURIComponent(speakerId)}/all`,
    });
  },

  getNotifications(type: 1 | 2 | 3, status: 0 | 1 | 2 = 0, start = 0, size = 20) {
    return wapRequest({
      path: `/api/notify/${type}/${status}/${start}/${size}`,
    });
  },

  async getUnreadSummary(): Promise<{
    at: number;
    reply: number;
    like: number;
    mail: number;
    total: number;
  }> {
    const safeCount = async (fn: () => Promise<unknown>): Promise<number> => {
      try {
        const data = (await fn()) as {
          pager?: { items?: number };
          conversations?: Array<{ unread?: number }>;
        };
        if (Array.isArray(data?.conversations)) {
          return data.conversations.reduce((acc, c) => acc + (Number(c.unread) || 0), 0);
        }
        return Number(data?.pager?.items || 0);
      } catch {
        return 0;
      }
    };

    const [at, reply, like, mail] = await Promise.all([
      safeCount(() => this.getNotifications(1, 1, 0, 1)),
      safeCount(() => this.getNotifications(2, 1, 0, 1)),
      safeCount(() => this.getNotifications(3, 1, 0, 1)),
      safeCount(() => this.getConversations(1)),
    ]);

    return { at, reply, like, mail, total: at + reply + like + mail };
  },

  markNotifyRead(notifyId: string) {
    return wapRequest({
      method: 'PATCH',
      path: `/api/notify/read/${encodeURIComponent(notifyId)}`,
    });
  },

  markAllNotifyRead(type: 1 | 2 | 3) {
    return wapRequest({
      method: 'PATCH',
      path: `/api/notify/read/all/${type}`,
    });
  },

  deleteNotify(notifyId: string) {
    return wapRequest({
      method: 'DELETE',
      path: `/api/notify/del/${encodeURIComponent(notifyId)}`,
    });
  },

  // ---- Search & Account ----
  searchArticles(params: {
    keyword: string;
    start?: number;
    count?: number;
    original?: boolean;
    boards?: string;
    status?: 0 | 2;
  }) {
    return wapRequest({
      path: '/api/search/article',
      query: {
        keyword: params.keyword,
        start: params.start ?? 0,
        count: params.count ?? 20,
        original: params.original ?? true,
        earliest: '',
        boards: params.boards ?? '',
        status: params.status ?? 0,
      },
    });
  },

  searchAccounts(keyword: string, start = 0, count = 20) {
    return wapRequest({
      path: '/api/search/account',
      query: { keyword, start, count },
    });
  },

  getAccountDetail(username: string) {
    return wapRequest({ path: `/api/account/detail/${encodeURIComponent(username)}` });
  },

  getAccountPosts(username: string, page = 1) {
    return wapRequest({
      path: `/api/account/${encodeURIComponent(username)}/mixlogs`,
      query: { page },
    });
  },
};
