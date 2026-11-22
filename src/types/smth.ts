export interface AccountObj {
  id: string;
  name: string;
  nick?: string;
  gender?: number;
  avatar?: string;
  avatarUrl?: string;
  k3sUrl?: string;
  level?: number;
  levelTitle?: string;
  score?: number;
  createTime?: number;
  loginTime?: number;
  friendCount?: number;
  fansCount?: number;
  articleCount?: number;
}

export interface ProfilePayload {
  account: AccountObj;
  title?: string;
}

export interface BoardObj {
  id: string;
  name: string;
  title: string;
  sectionId?: string;
  section?: { id: string; name: string };
  todayPostCount?: number;
  articleCount?: number;
  topicCount?: number;
  popularity?: number;
  isFavorite?: boolean;
  isFavorites?: boolean;
  readOnly?: boolean;
  forbiddenReply?: boolean;
  status?: number;
}

export interface AttachmentObj {
  id?: string;
  name?: string;
  type?: string;
  size?: number;
  url?: string;
  cdnUrl?: string;
  ks3Url?: string;
}

export interface ArticleObj {
  id: string;
  subject?: string;
  body: string;
  postTime?: number;
  editTime?: number;
  accountId?: string;
  account?: AccountObj;
  topicId?: string;
  boardId?: string;
  replyId?: string;
  topicOrder?: number;
  status?: number;
  country?: string;
  city?: string;
  attachments?: AttachmentObj[];
  likes?: LikeObj[];
  board?: BoardObj;
  topic?: TopicObj;
}

export interface TopicObj {
  id: string;
  subject: string;
  boardId?: string;
  board?: BoardObj;
  availables?: number;
  firstArticleId?: string;
  lastArticleId?: string;
  lastArticleOrder?: number;
  likeAvailables?: number;
  flushTime?: number;
  lastPostTime?: number;
  fav?: boolean;
  status?: number;
  article?: ArticleObj;
  firstAccount?: AccountObj;
}

export interface LikeObj {
  id: string;
  articleId?: string;
  accountId?: string;
  accountName?: string;
  account?: AccountObj;
  body: string;
  score: number;
  time?: number;
}

export interface SectionObj {
  id: string;
  name: string;
  description?: string;
}

export interface PagerObj {
  page?: number;
  size?: number;
  total?: number;
  items?: number;
  currentPage?: number;
  pageSize?: number;
  start?: number;
  totalItems?: number;
  totalPages?: number;
}

export interface ConversationItem {
  speakerId: string;
  speaker?: AccountObj;
  unread?: number;
  lastMessage?: MessageObj;
}

export interface MessageObj {
  id?: string;
  senderId?: string;
  sendTime?: number;
  body: string;
  subject?: string;
}

export interface NotifyItem {
  id: string;
  transactorId?: string;
  transactorName?: string;
  transactor?: AccountObj;
  causeId?: string;
  cause?: {
    id?: string;
    subject?: string;
    body?: string;
    topicId?: string;
    board?: BoardObj;
  };
  target?: {
    id?: string;
    subject?: string;
    topicId?: string;
    board?: BoardObj;
  };
  createTime?: number;
  status?: number;
}

export interface UnreadSummary {
  at: number;
  reply: number;
  like: number;
  mail: number;
  total: number;
}

export interface NforumSlotStatus {
  enabled: boolean;
  hasCookies: boolean;
  cookieCount: number;
  updatedAt: number;
  source: string;
  capabilities: string[];
}

export type ChromeLoginState =
  | { status: 'idle' }
  | { status: 'launching'; message: string }
  | { status: 'waiting'; message: string; startedAt: number }
  | { status: 'success'; message: string; user: { id: string; name: string; nick: string } }
  | { status: 'error'; message: string }
  | { status: 'cancelled'; message: string };

export interface AuthStatusPayload {
  loggedIn: boolean;
  profile: ProfilePayload | null;
  source: string;
  updatedAt: number;
  chromeAvailable: boolean;
  chromeLogin: ChromeLoginState;
  nforumSlot: NforumSlotStatus;
}

export interface CustomFontItem {
  id: string;
  name: string;
  filename: string;
  format: 'truetype' | 'opentype' | 'woff' | 'woff2';
  size: number;
  addedAt: number;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'oled' | 'system';
  fontSize: number;
  colWidth: number;
  fontId: string;
  customSystemFont: string;
  tapToPage: boolean;
  imageMode: 'collapsed' | 'stealth' | 'auto';
  hideAvatars: boolean;
  showNick: boolean;
  stripSignature: boolean;
  collapseQuotes: boolean;
  showLikes: boolean;
}

export interface LocalDataStore {
  localFavBoards: Array<{ id: string; name: string; title: string; addedAt: number }>;
  boardSearchHistory: Array<{ id: string; name: string; title: string; usedAt: number }>;
  articleSearchHistory: string[];
  readTopics: Record<string, { lastPage: number; readAt: number; subject?: string }>;
  blockUsers: string[];
  blockKeywords: string[];
  customFonts: CustomFontItem[];
  preferences: UserPreferences;
}
