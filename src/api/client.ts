import type { GeetestCaptchaPayload } from '../utils/geetest';
import type {
  AccountObj,
  ArticleObj,
  AuthStatusPayload,
  BoardObj,
  ChromeLoginState,
  ConversationItem,
  CustomFontItem,
  LikeObj,
  LocalDataStore,
  MessageObj,
  NforumSlotStatus,
  NotifyItem,
  PagerObj,
  ProfilePayload,
  SectionObj,
  TopicObj,
  UnreadSummary,
  UserPreferences,
} from '../types/smth';

export class ApiError extends Error {
  status: number;
  upstreamCode?: number;

  constructor(status: number, message: string, upstreamCode?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.upstreamCode = upstreamCode;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {};
  if (init?.body && !(init.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
  });

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  if (!res.ok) {
    const errObj = (data && typeof data === 'object' ? data : {}) as {
      error?: string;
      upstreamCode?: number;
    };
    throw new ApiError(res.status, errObj.error || `请求失败 (${res.status})`, errObj.upstreamCode);
  }
  return data as T;
}

export const api = {
  // ---- Auth ----
  getAuthStatus: () => request<AuthStatusPayload>('/auth/status'),
  startChromeLogin: () => request<ChromeLoginState>('/auth/chrome/start', { method: 'POST' }),
  getChromeLoginStatus: () => request<ChromeLoginState>('/auth/chrome/status'),
  cancelChromeLogin: () => request<ChromeLoginState>('/auth/chrome/cancel', { method: 'POST' }),
  importManualCookie: (cookie: string) =>
    request<{ ok: boolean; profile: ProfilePayload }>('/auth/cookie', {
      method: 'POST',
      body: JSON.stringify({ cookie }),
    }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  // ---- nForum extension slot ----
  getNforumStatus: () => request<NforumSlotStatus>('/nforum/status'),
  importNforumCookie: (cookie: string) =>
    request<NforumSlotStatus>('/nforum/cookie', {
      method: 'POST',
      body: JSON.stringify({ cookie }),
    }),
  clearNforumCookie: () => request<NforumSlotStatus>('/nforum/cookie', { method: 'DELETE' }),

  // ---- Local store ----
  getLocalData: () => request<LocalDataStore>('/local/data'),
  updatePreferences: (patch: Partial<UserPreferences>) =>
    request<UserPreferences>('/local/preferences', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  updateBlocklist: (blockUsers: string[], blockKeywords: string[]) =>
    request<{ blockUsers: string[]; blockKeywords: string[] }>('/local/blocklist', {
      method: 'PUT',
      body: JSON.stringify({ blockUsers, blockKeywords }),
    }),
  toggleLocalFavBoard: (board: { id: string; name: string; title: string }) =>
    request<LocalDataStore['localFavBoards']>('/local/fav-boards/toggle', {
      method: 'POST',
      body: JSON.stringify(board),
    }),
  recordBoardHistory: (board: { id: string; name: string; title: string }) =>
    request<LocalDataStore['boardSearchHistory']>('/local/board-history', {
      method: 'POST',
      body: JSON.stringify(board),
    }),
  markTopicRead: (topicId: string, lastPage: number, subject?: string) =>
    request<{ ok: boolean }>('/local/read-topic', {
      method: 'POST',
      body: JSON.stringify({ topicId, lastPage, subject }),
    }),
  uploadCustomFont: (file: File, name?: string) => {
    const fd = new FormData();
    fd.append('font', file, file.name);
    if (name?.trim()) fd.append('name', name.trim());
    return request<{ font: CustomFontItem; customFonts: CustomFontItem[] }>('/local/fonts', {
      method: 'POST',
      body: fd,
    });
  },
  deleteCustomFont: (id: string) =>
    request<{ customFonts: CustomFontItem[] }>(`/local/fonts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  // ---- Home & Hot ----
  getHotTen: () => request<{ topics?: TopicObj[] }>('/hot/ten'),
  getHotGlobal: (page = 1, size = 20) =>
    request<{ pager?: PagerObj; topics?: TopicObj[] }>(`/hot/global?page=${page}&size=${size}`),
  getHotSection: (id: string, page = 1) =>
    request<{ pager?: PagerObj; topics?: TopicObj[] }>(
      `/hot/section?id=${encodeURIComponent(id)}&page=${page}`,
    ),
  getPopularBoards: () => request<BoardObj[]>('/hot/boards'),

  // ---- Sections & Boards ----
  getSections: () => request<{ sections?: SectionObj[] }>('/sections'),
  getSectionBoards: (sectionId: string) =>
    request<{ boards?: BoardObj[] }>(`/sections/${encodeURIComponent(sectionId)}/boards`),
  searchBoards: (keyword: string) =>
    request<BoardObj[]>(`/boards/search?keyword=${encodeURIComponent(keyword)}`),
  getBoardTopics: (boardId: string, page = 1, order: 0 | 1 = 1) =>
    request<{
      pager?: PagerObj;
      topics?: TopicObj[];
      tops?: TopicObj[];
      board?: BoardObj;
    }>(`/boards/${encodeURIComponent(boardId)}/topics?page=${page}&order=${order}`),
  getBoardTops: (boardId: string, start = 0, size = 20) =>
    request<{ pager?: PagerObj; tops?: TopicObj[] }>(
      `/boards/${encodeURIComponent(boardId)}/tops?start=${start}&size=${size}`,
    ),
  getBoardEssence: (boardId: string, start = 0, size = 20) =>
    request<{ pager?: PagerObj; articles?: Array<TopicObj & { articles?: ArticleObj[] }> }>(
      `/boards/${encodeURIComponent(boardId)}/essence?start=${start}&size=${size}`,
    ),

  // ---- Cloud Favorites ----
  getCloudFavBoards: () => request<unknown>('/favorites/boards'),
  addCloudFavBoard: (id: string) =>
    request<unknown>('/favorites/boards', { method: 'POST', body: JSON.stringify({ id }) }),
  removeCloudFavBoard: (id: string, dirId = 0) =>
    request<unknown>(`/favorites/boards/${encodeURIComponent(id)}?dirId=${dirId}`, {
      method: 'DELETE',
    }),
  getCloudFavTopics: (start = 0, size = 20) =>
    request<{
      favTopic?: Array<{ topicWrapper?: TopicObj; readOrder?: number; hasNewReply?: boolean }>;
      pager?: PagerObj;
    }>(`/favorites/topics?start=${start}&size=${size}`),
  addCloudFavTopic: (id: string) =>
    request<unknown>('/favorites/topics', { method: 'POST', body: JSON.stringify({ id }) }),
  removeCloudFavTopic: (id: string) =>
    request<unknown>(`/favorites/topics/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // ---- Thread ----
  getTopicDetail: (topicId: string) =>
    request<{ topic?: TopicObj; favTopic?: { readOrder?: number } }>(
      `/topics/${encodeURIComponent(topicId)}/detail`,
    ),
  getTopicArticles: (topicId: string, mode = 1, page = 1, size = 20, articleId?: string) =>
    request<{
      pager?: PagerObj;
      topic?: TopicObj;
      articles?: ArticleObj[];
      board?: BoardObj;
    }>(
      `/topics/${encodeURIComponent(topicId)}/articles?mode=${mode}&page=${page}&size=${size}${
        articleId ? `&articleId=${encodeURIComponent(articleId)}` : ''
      }`,
    ),
  getTopicLikes: (topicId: string) =>
    request<[LikeObj | null, LikeObj[], number, number, number]>(
      `/topics/${encodeURIComponent(topicId)}/likes`,
    ),

  // ---- Write Operations ----
  checkPublishCaptcha: () =>
    request<{ needCaptcha: boolean; code?: number; message?: string }>('/topics/publish/check'),
  getUploadToken: () => request<{ token: string }>('/files/token'),
  uploadFiles: (boardId: string, token: string, files: File[]) => {
    const fd = new FormData();
    for (const f of files) fd.append('files', f, f.name);
    return request<unknown>(
      `/files/upload/${encodeURIComponent(boardId)}/${encodeURIComponent(token)}`,
      { method: 'POST', body: fd },
    );
  },
  deleteUploadedFile: (token: string, filenames: string[]) =>
    request<unknown>(`/files/${encodeURIComponent(token)}`, {
      method: 'DELETE',
      body: JSON.stringify({ filenames }),
    }),
  publishTopic: (payload: {
    boardId: string;
    subject: string;
    body: string;
    uploadToken?: string;
    captcha?: GeetestCaptchaPayload;
  }) => request<unknown>('/topics/publish', { method: 'POST', body: JSON.stringify(payload) }),
  replyArticle: (payload: {
    articleId: string;
    body: string;
    uploadToken?: string;
    captcha?: GeetestCaptchaPayload;
  }) => request<unknown>('/topics/reply', { method: 'POST', body: JSON.stringify(payload) }),
  updateArticle: (payload: {
    articleId: string;
    subject: string;
    body: string;
    uploadToken?: string;
  }) => request<unknown>('/articles/update', { method: 'POST', body: JSON.stringify(payload) }),
  deleteTopic: (topicId: string) =>
    request<unknown>(`/topics/${encodeURIComponent(topicId)}`, { method: 'DELETE' }),
  deleteArticle: (articleId: string) =>
    request<unknown>(`/articles/${encodeURIComponent(articleId)}`, { method: 'DELETE' }),
  addLike: (
    topicId: string,
    payload: { boardName: string; body: string; score: number; captcha?: GeetestCaptchaPayload },
  ) =>
    request<unknown>(`/topics/${encodeURIComponent(topicId)}/like`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  removeLike: (topicId: string, boardName: string) =>
    request<unknown>(
      `/topics/${encodeURIComponent(topicId)}/like?boardName=${encodeURIComponent(boardName)}`,
      { method: 'DELETE' },
    ),

  // ---- Messages & Notifications ----
  getUnreadSummary: () => request<UnreadSummary>('/messages/unread'),
  getConversations: (page = 1) =>
    request<{
      conversations?: ConversationItem[];
      lastMessages?: MessageObj[];
      pager?: PagerObj;
    }>(`/messages/conversations?page=${page}`),
  getConversationMessages: (speakerId: string, page = 1) =>
    request<{
      messages?: MessageObj[];
      account?: AccountObj;
      speaker?: AccountObj;
      pager?: PagerObj;
    }>(`/messages/conversations/${encodeURIComponent(speakerId)}?page=${page}`),
  sendMessage: (recipientName: string, body: string, subject = '') =>
    request<unknown>('/messages/send', {
      method: 'POST',
      body: JSON.stringify({ recipientName, body, subject }),
    }),
  markConversationRead: (speakerId: string) =>
    request<unknown>(`/messages/conversations/${encodeURIComponent(speakerId)}/read`, {
      method: 'POST',
    }),
  deleteConversation: (speakerId: string) =>
    request<unknown>(`/messages/conversations/${encodeURIComponent(speakerId)}`, {
      method: 'DELETE',
    }),
  getNotifications: (type: 1 | 2 | 3, start = 0, status: 0 | 1 | 2 = 0) =>
    request<{ notifies?: NotifyItem[]; pager?: PagerObj }>(
      `/notifications/${type}?start=${start}&status=${status}`,
    ),
  markNotifyRead: (id: string) =>
    request<unknown>(`/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' }),
  markAllNotifyRead: (type: 1 | 2 | 3) =>
    request<unknown>(`/notifications/read-all/${type}`, { method: 'POST' }),
  deleteNotify: (id: string) =>
    request<unknown>(`/notifications/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // ---- Search & Users ----
  searchArticles: (params: {
    keyword: string;
    start?: number;
    original?: boolean;
    boards?: string;
    status?: 0 | 2;
  }) => {
    const q = new URLSearchParams({
      keyword: params.keyword,
      start: String(params.start ?? 0),
      original: String(params.original ?? true),
      boards: params.boards ?? '',
      status: String(params.status ?? 0),
    });
    return request<{ total?: number; articles?: ArticleObj[] }>(`/search/articles?${q.toString()}`);
  },
  getUserDetail: (username: string) =>
    request<{
      account?: AccountObj;
      title?: string;
      isBlack?: boolean;
      isFriend?: boolean;
      newsmthScore?: { total?: number };
    }>(`/users/${encodeURIComponent(username)}`),
  getUserPosts: (username: string, page = 1) =>
    request<{ pager?: PagerObj; content?: ArticleObj[]; account?: AccountObj }>(
      `/users/${encodeURIComponent(username)}/posts?page=${page}`,
    ),
};
