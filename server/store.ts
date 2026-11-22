import fs from 'node:fs';
import path from 'node:path';
import { DATA_FILE, FONTS_DIR, LOCAL_DIR, SESSION_FILE } from './config.js';
import type { CookieMap } from './cookieParser.js';

export interface SessionSlot {
  cookies: CookieMap;
  updatedAt: number;
  source: 'chrome' | 'manual' | 'guest' | 'none';
}

export interface SessionStore {
  wap: SessionSlot;
  nforum: SessionSlot;
}

export interface LocalFavBoard {
  id: string;
  name: string;
  title: string;
  addedAt: number;
}

export interface BoardHistoryItem {
  id: string;
  name: string;
  title: string;
  usedAt: number;
}

export interface ReadTopicEntry {
  lastPage: number;
  readAt: number;
  subject?: string;
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
  prefVersion?: number;
  theme: 'light' | 'navy' | 'dark' | 'oled' | 'system';
  fontSize: number;
  widthPct: number;
  colWidth: number;
  fontId: string;
  customSystemFont: string;
  listStyle: 'feed' | 'compact';
  boardListStyle: 'compact' | 'feed';
  tapToPage: boolean;
  imageMode: 'collapsed' | 'stealth' | 'auto';
  hideAvatars: boolean;
  showNick: boolean;
  stripSignature: boolean;
  collapseQuotes: boolean;
  showLikes: boolean;
}

export interface LocalDataStore {
  localFavBoards: LocalFavBoard[];
  boardSearchHistory: BoardHistoryItem[];
  articleSearchHistory: string[];
  readTopics: Record<string, ReadTopicEntry>;
  blockUsers: string[];
  blockKeywords: string[];
  customFonts: CustomFontItem[];
  preferences: UserPreferences;
}

const PREF_VERSION = 2;

const DEFAULT_PREFERENCES: UserPreferences = {
  prefVersion: PREF_VERSION,
  theme: 'light',
  fontSize: 16,
  widthPct: 98,
  colWidth: 980,
  fontId: 'system',
  customSystemFont: '',
  listStyle: 'compact',
  boardListStyle: 'compact',
  tapToPage: true,
  imageMode: 'collapsed',
  hideAvatars: true,
  showNick: false,
  stripSignature: true,
  collapseQuotes: true,
  showLikes: true,
};

const DEFAULT_SESSIONS: SessionStore = {
  wap: { cookies: {}, updatedAt: 0, source: 'none' },
  nforum: { cookies: {}, updatedAt: 0, source: 'none' },
};

const DEFAULT_DATA: LocalDataStore = {
  localFavBoards: [],
  boardSearchHistory: [],
  articleSearchHistory: [],
  readTopics: {},
  blockUsers: [],
  blockKeywords: [],
  customFonts: [],
  preferences: { ...DEFAULT_PREFERENCES },
};

function ensureLocalDir(): void {
  if (!fs.existsSync(LOCAL_DIR)) {
    fs.mkdirSync(LOCAL_DIR, { recursive: true, mode: 0o700 });
  }
}

function readJsonSafe<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return structuredClone(fallback);
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return structuredClone(fallback);
  }
}

function writeJsonAtomic(filePath: string, data: unknown, mode: number): void {
  ensureLocalDir();
  const tmpPath = `${filePath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), { mode });
  fs.renameSync(tmpPath, filePath);
  try {
    fs.chmodSync(filePath, mode);
  } catch {
    // ignore chmod failures on non-POSIX filesystems
  }
}

class LocalStore {
  private sessions: SessionStore;
  private data: LocalDataStore;

  constructor() {
    const loadedSessions = readJsonSafe<Partial<SessionStore>>(SESSION_FILE, DEFAULT_SESSIONS);
    this.sessions = {
      wap: { ...DEFAULT_SESSIONS.wap, ...(loadedSessions.wap || {}) },
      nforum: { ...DEFAULT_SESSIONS.nforum, ...(loadedSessions.nforum || {}) },
    };

    const loadedData = readJsonSafe<Partial<LocalDataStore>>(DATA_FILE, DEFAULT_DATA);
    const rawPrefs = loadedData.preferences;
    const needsV2Migration = !rawPrefs || rawPrefs.prefVersion !== PREF_VERSION;
    const mergedPrefs: UserPreferences = needsV2Migration
      ? {
          ...DEFAULT_PREFERENCES,
          ...(rawPrefs || {}),
          prefVersion: PREF_VERSION,
          widthPct: 98,
          fontSize: 16,
          fontId: 'system',
          customSystemFont: '',
          listStyle: 'compact',
          boardListStyle: 'compact',
        }
      : { ...DEFAULT_PREFERENCES, ...rawPrefs };

    this.data = {
      localFavBoards: loadedData.localFavBoards || [],
      boardSearchHistory: loadedData.boardSearchHistory || [],
      articleSearchHistory: loadedData.articleSearchHistory || [],
      readTopics: loadedData.readTopics || {},
      blockUsers: loadedData.blockUsers || [],
      blockKeywords: loadedData.blockKeywords || [],
      customFonts: loadedData.customFonts || [],
      preferences: mergedPrefs,
    };

    if (needsV2Migration && fs.existsSync(DATA_FILE)) {
      this.saveData();
    }
  }

  getWapSession(): SessionSlot {
    return this.sessions.wap;
  }

  setWapCookies(cookies: CookieMap, source: SessionSlot['source'], replace = false): void {
    this.sessions.wap = {
      cookies: replace ? { ...cookies } : { ...this.sessions.wap.cookies, ...cookies },
      updatedAt: Date.now(),
      source,
    };
    this.saveSessions();
  }

  clearWapSession(): void {
    this.sessions.wap = { cookies: {}, updatedAt: Date.now(), source: 'none' };
    this.saveSessions();
  }

  getNforumSession(): SessionSlot {
    return this.sessions.nforum;
  }

  setNforumCookies(cookies: CookieMap, source: 'chrome' | 'manual'): void {
    this.sessions.nforum = {
      cookies: { ...cookies },
      updatedAt: Date.now(),
      source,
    };
    this.saveSessions();
  }

  clearNforumSession(): void {
    this.sessions.nforum = { cookies: {}, updatedAt: Date.now(), source: 'none' };
    this.saveSessions();
  }

  private saveSessions(): void {
    writeJsonAtomic(SESSION_FILE, this.sessions, 0o600);
  }

  getData(): LocalDataStore {
    return this.data;
  }

  updatePreferences(patch: Partial<UserPreferences>): UserPreferences {
    this.data.preferences = { ...this.data.preferences, ...patch };
    this.saveData();
    return this.data.preferences;
  }

  updateBlocklist(blockUsers?: string[], blockKeywords?: string[]): {
    blockUsers: string[];
    blockKeywords: string[];
  } {
    if (Array.isArray(blockUsers)) {
      this.data.blockUsers = Array.from(new Set(blockUsers.map((s) => s.trim()).filter(Boolean)));
    }
    if (Array.isArray(blockKeywords)) {
      this.data.blockKeywords = Array.from(
        new Set(blockKeywords.map((s) => s.trim()).filter(Boolean)),
      );
    }
    this.saveData();
    return { blockUsers: this.data.blockUsers, blockKeywords: this.data.blockKeywords };
  }

  toggleLocalFavBoard(board: { id: string; name: string; title: string }): LocalFavBoard[] {
    const idx = this.data.localFavBoards.findIndex(
      (b) => b.id === board.id || b.name.toLowerCase() === board.name.toLowerCase(),
    );
    if (idx >= 0) {
      this.data.localFavBoards.splice(idx, 1);
    } else {
      this.data.localFavBoards.unshift({ ...board, addedAt: Date.now() });
    }
    this.saveData();
    return this.data.localFavBoards;
  }

  recordBoardHistory(board: { id: string; name: string; title: string }): BoardHistoryItem[] {
    this.data.boardSearchHistory = this.data.boardSearchHistory.filter(
      (b) => b.name.toLowerCase() !== board.name.toLowerCase(),
    );
    this.data.boardSearchHistory.unshift({ ...board, usedAt: Date.now() });
    if (this.data.boardSearchHistory.length > 20) {
      this.data.boardSearchHistory.length = 20;
    }
    this.saveData();
    return this.data.boardSearchHistory;
  }

  recordArticleSearch(keyword: string): string[] {
    const k = keyword.trim();
    if (!k) return this.data.articleSearchHistory;
    this.data.articleSearchHistory = [
      k,
      ...this.data.articleSearchHistory.filter((item) => item !== k),
    ].slice(0, 20);
    this.saveData();
    return this.data.articleSearchHistory;
  }

  markTopicRead(topicId: string, lastPage: number, subject?: string): void {
    this.data.readTopics[topicId] = {
      lastPage: Math.max(1, lastPage),
      readAt: Date.now(),
      subject,
    };
    const keys = Object.keys(this.data.readTopics);
    if (keys.length > 600) {
      keys
        .sort((a, b) => (this.data.readTopics[b]?.readAt || 0) - (this.data.readTopics[a]?.readAt || 0))
        .slice(500)
        .forEach((k) => delete this.data.readTopics[k]);
    }
    this.saveData();
  }

  addCustomFont(item: CustomFontItem): CustomFontItem[] {
    this.data.customFonts = [
      item,
      ...this.data.customFonts.filter((f) => f.id !== item.id),
    ];
    this.saveData();
    return this.data.customFonts;
  }

  removeCustomFont(id: string): CustomFontItem[] {
    const target = this.data.customFonts.find((f) => f.id === id);
    if (target) {
      const fullPath = path.join(FONTS_DIR, target.filename);
      try {
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      } catch {
        // ignore unlink errors
      }
    }
    this.data.customFonts = this.data.customFonts.filter((f) => f.id !== id);
    if (this.data.preferences.fontId === `imported:${id}`) {
      this.data.preferences.fontId = 'system';
    }
    this.saveData();
    return this.data.customFonts;
  }

  private saveData(): void {
    writeJsonAtomic(DATA_FILE, this.data, 0o600);
  }
}

export const localStore = new LocalStore();
