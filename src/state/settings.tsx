import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { CustomFontItem, LocalDataStore, UserPreferences } from '../types/smth';
import { buildFontFacesCss, resolveFontStack } from '../utils/fonts';

const LS_KEY = 'xsmth_settings_v1';
const PREF_VERSION = 2;

const DEFAULT_PREFS: UserPreferences = {
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

interface SettingsContextValue {
  prefs: UserPreferences;
  localData: LocalDataStore;
  updatePrefs: (patch: Partial<UserPreferences>) => void;
  cycleTheme: () => UserPreferences['theme'];
  cycleImageMode: () => UserPreferences['imageMode'];
  saveBlocklist: (users: string[], keywords: string[]) => Promise<void>;
  toggleLocalFavBoard: (board: { id: string; name: string; title: string }) => Promise<void>;
  recordBoardHistory: (board: { id: string; name: string; title: string }) => void;
  markTopicRead: (topicId: string, lastPage: number, subject?: string) => void;
  uploadCustomFont: (file: File, name?: string) => Promise<CustomFontItem>;
  deleteCustomFont: (id: string) => Promise<void>;
  isBlocked: (author?: string, text?: string) => boolean;
}

const DEFAULT_LOCAL: LocalDataStore = {
  localFavBoards: [],
  boardSearchHistory: [],
  articleSearchHistory: [],
  readTopics: {},
  blockUsers: [],
  blockKeywords: [],
  customFonts: [],
  preferences: DEFAULT_PREFS,
};

function normalizePrefs(raw?: Partial<UserPreferences> | null): UserPreferences {
  if (!raw) return DEFAULT_PREFS;
  if (raw.prefVersion !== PREF_VERSION) {
    return {
      ...DEFAULT_PREFS,
      ...raw,
      prefVersion: PREF_VERSION,
      widthPct: 98,
      fontSize: 16,
      fontId: 'system',
      customSystemFont: '',
      listStyle: 'compact',
      boardListStyle: 'compact',
    };
  }
  return { ...DEFAULT_PREFS, ...raw };
}

function readCachedPrefs(): UserPreferences {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_PREFS;
    return normalizePrefs(JSON.parse(raw) as Partial<UserPreferences>);
  } catch {
    return DEFAULT_PREFS;
  }
}

function syncFontFaceStyle(customFonts: CustomFontItem[]): void {
  const styleId = 'xsmth-font-faces';
  let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = buildFontFacesCss(customFonts);
}

function applyThemeToDom(prefs: UserPreferences, customFonts: CustomFontItem[]): void {
  const resolved =
    prefs.theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'navy'
        : 'light'
      : prefs.theme;
  const fontStack = resolveFontStack(prefs, customFonts);
  const pct = Math.max(50, Math.min(100, Number(prefs.widthPct) || 98));
  const padX = pct >= 99 ? 10 : pct >= 96 ? 14 : 20;
  const fontSz = Math.max(14, Math.min(22, Number(prefs.fontSize) || 16));

  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.setProperty('--font-size-body', `${fontSz}px`);
  document.documentElement.style.setProperty('--content-width', `${pct}%`);
  document.documentElement.style.setProperty('--card-pad-x', `${padX}px`);
  document.documentElement.style.setProperty('--font-reading', fontStack);
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ ...prefs, resolvedFontStack: fontStack }));
  } catch {
    // ignore storage quota
  }
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<UserPreferences>(readCachedPrefs);
  const [localData, setLocalData] = useState<LocalDataStore>({
    ...DEFAULT_LOCAL,
    preferences: readCachedPrefs(),
  });

  useEffect(() => {
    syncFontFaceStyle(localData.customFonts);
    applyThemeToDom(prefs, localData.customFonts);
  }, [prefs, localData.customFonts]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (prefs.theme === 'system') applyThemeToDom(prefs, localData.customFonts);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [prefs, localData.customFonts]);

  useEffect(() => {
    api
      .getLocalData()
      .then((data) => {
        setLocalData({ ...DEFAULT_LOCAL, ...data, customFonts: data.customFonts || [] });
        if (data.preferences) {
          setPrefs(normalizePrefs(data.preferences));
        }
      })
      .catch(() => {});
  }, []);

  const updatePrefs = useCallback(
    (patch: Partial<UserPreferences>) => {
      setPrefs((prev) => {
        const next = { ...prev, ...patch };
        applyThemeToDom(next, localData.customFonts);
        return next;
      });
      void api.updatePreferences(patch).catch(() => {});
    },
    [localData.customFonts],
  );

  const cycleTheme = useCallback(() => {
    const order: Array<UserPreferences['theme']> = ['light', 'navy', 'dark', 'oled'];
    const current =
      prefs.theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'navy'
          : 'light'
        : prefs.theme;
    const next = order[(order.indexOf(current) + 1) % order.length];
    updatePrefs({ theme: next });
    return next;
  }, [prefs.theme, updatePrefs]);

  const cycleImageMode = useCallback(() => {
    const order: Array<UserPreferences['imageMode']> = ['collapsed', 'stealth', 'auto'];
    const next = order[(order.indexOf(prefs.imageMode) + 1) % order.length];
    updatePrefs({ imageMode: next });
    return next;
  }, [prefs.imageMode, updatePrefs]);

  const saveBlocklist = useCallback(async (users: string[], keywords: string[]) => {
    const updated = await api.updateBlocklist(users, keywords);
    setLocalData((prev) => ({
      ...prev,
      blockUsers: updated.blockUsers,
      blockKeywords: updated.blockKeywords,
    }));
  }, []);

  const toggleLocalFavBoard = useCallback(
    async (board: { id: string; name: string; title: string }) => {
      const next = await api.toggleLocalFavBoard(board);
      setLocalData((prev) => ({ ...prev, localFavBoards: next }));
    },
    [],
  );

  const recordBoardHistory = useCallback((board: { id: string; name: string; title: string }) => {
    void api
      .recordBoardHistory(board)
      .then((history) => setLocalData((prev) => ({ ...prev, boardSearchHistory: history })))
      .catch(() => {});
  }, []);

  const markTopicRead = useCallback((topicId: string, lastPage: number, subject?: string) => {
    setLocalData((prev) => ({
      ...prev,
      readTopics: {
        ...prev.readTopics,
        [topicId]: { lastPage, readAt: Date.now(), subject },
      },
    }));
    void api.markTopicRead(topicId, lastPage, subject).catch(() => {});
  }, []);

  const uploadCustomFont = useCallback(
    async (file: File, name?: string) => {
      const res = await api.uploadCustomFont(file, name);
      setLocalData((prev) => ({ ...prev, customFonts: res.customFonts }));
      const nextFontId = `imported:${res.font.id}`;
      setPrefs((prev) => {
        const next = { ...prev, fontId: nextFontId };
        syncFontFaceStyle(res.customFonts);
        applyThemeToDom(next, res.customFonts);
        return next;
      });
      void api.updatePreferences({ fontId: nextFontId }).catch(() => {});
      return res.font;
    },
    [],
  );

  const deleteCustomFont = useCallback(async (id: string) => {
    const res = await api.deleteCustomFont(id);
    setLocalData((prev) => ({ ...prev, customFonts: res.customFonts }));
    setPrefs((prev) => {
      const next = prev.fontId === `imported:${id}` ? { ...prev, fontId: 'system' } : prev;
      applyThemeToDom(next, res.customFonts);
      return next;
    });
  }, []);

  const isBlocked = useCallback(
    (author?: string, text?: string) => {
      if (author && localData.blockUsers.length > 0) {
        const lower = author.toLowerCase();
        if (localData.blockUsers.some((u) => u.toLowerCase() === lower)) return true;
      }
      if (text && localData.blockKeywords.length > 0) {
        const lowerText = text.toLowerCase();
        if (localData.blockKeywords.some((k) => k && lowerText.includes(k.toLowerCase()))) {
          return true;
        }
      }
      return false;
    },
    [localData.blockKeywords, localData.blockUsers],
  );

  return (
    <SettingsContext.Provider
      value={{
        prefs,
        localData,
        updatePrefs,
        cycleTheme,
        cycleImageMode,
        saveBlocklist,
        toggleLocalFavBoard,
        recordBoardHistory,
        markTopicRead,
        uploadCustomFont,
        deleteCustomFont,
        isBlocked,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
