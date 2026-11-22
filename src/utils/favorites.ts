import type { BoardObj } from '../types/smth';

export interface CloudFavBoardEntry extends BoardObj {
  dirId: number;
  folderName?: string;
}

/**
 * Extracts cloud favorite boards from `wap.newsmth.net/wap/api/profile/fav/boards`.
 * Upstream nests each board inside `favBoards[].items[].bid` (and optional `folderList`).
 */
export function extractFavBoards(raw: unknown): CloudFavBoardEntry[] {
  const result: CloudFavBoardEntry[] = [];
  const seen = new Set<string>();

  const pushBoard = (candidate: unknown, dirId: number, folderName?: string) => {
    if (!candidate || typeof candidate !== 'object') return;
    const obj = candidate as Record<string, unknown>;
    if (typeof obj.id === 'string' && typeof obj.name === 'string' && obj.id && obj.name) {
      if (seen.has(obj.id)) return;
      seen.add(obj.id);
      result.push({
        ...(obj as unknown as BoardObj),
        title: typeof obj.title === 'string' && obj.title ? obj.title : obj.name,
        dirId,
        folderName,
      });
    }
  };

  const walk = (node: unknown, dirId = 0, folderName?: string) => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, dirId, folderName);
      return;
    }
    if (typeof node !== 'object') return;

    const obj = node as Record<string, unknown>;

    // Direct BoardObj
    if (typeof obj.id === 'string' && typeof obj.name === 'string' && !Array.isArray(obj.items)) {
      pushBoard(obj, dirId, folderName);
      return;
    }

    // Folder node: { id: number, name?: string, items: [...], folderList: {...} }
    const nextDirId = typeof obj.id === 'number' ? obj.id : dirId;
    const nextFolderName =
      typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : folderName;

    // Favorite item wrapping actual board in `bid` or `board`
    if (obj.bid && typeof obj.bid === 'object') {
      pushBoard(obj.bid, nextDirId, nextFolderName);
    }
    if (obj.board && typeof obj.board === 'object') {
      pushBoard(obj.board, nextDirId, nextFolderName);
    }

    for (const key of ['favBoards', 'boards', 'items', 'children']) {
      if (obj[key]) walk(obj[key], nextDirId, nextFolderName);
    }

    if (obj.folderList && typeof obj.folderList === 'object') {
      for (const sub of Object.values(obj.folderList as Record<string, unknown>)) {
        walk(sub, nextDirId, nextFolderName);
      }
    }
  };

  walk(raw);
  return result;
}
