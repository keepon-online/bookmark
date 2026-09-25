// 扩展元数据数据库（Dexie）
// v0.6 起 chrome.bookmarks 是唯一数据源，本库只存浏览器书签没有的增强元数据，
// 全部以 chrome 书签节点 id 关联，可随时重建或丢弃。

import Dexie, { type Table } from 'dexie';
import type { AuxBookmarkMeta } from '@/types';
import type { OrganizeHistory } from '@/types/organizer';

// 死链检查记录
export interface LinkCheckRecord {
  id: string;
  bookmarkId: string;
  status: number;
  isAccessible: boolean;
  responseTime: number;
  errorMessage?: string;
  checkedAt: number;
}

export class AuxDatabase extends Dexie {
  bookmarkMeta!: Table<AuxBookmarkMeta, string>;
  linkChecks!: Table<LinkCheckRecord, string>;
  organizeHistory!: Table<OrganizeHistory, string>;

  constructor() {
    super('SmartBookmarkAuxDB');

    this.version(1).stores({
      // 主键为 chrome 书签节点 id
      bookmarkMeta: 'bookmarkId, isFavorite, linkStatus',
      linkChecks: 'id, bookmarkId, checkedAt',
      organizeHistory: 'id, timestamp',
    });
  }
}

export const auxDb = new AuxDatabase();

// 构造默认元数据
export function defaultMeta(bookmarkId: string): AuxBookmarkMeta {
  return {
    bookmarkId,
    tags: [],
    isFavorite: false,
    visitCount: 0,
  };
}

// 清理已不存在书签的孤儿元数据，返回清理数量
export async function sweepOrphanMeta(validIds: Set<string>): Promise<number> {
  const all = await auxDb.bookmarkMeta.toArray();
  const orphanIds = all
    .filter((meta) => !validIds.has(meta.bookmarkId))
    .map((meta) => meta.bookmarkId);
  if (orphanIds.length > 0) {
    await auxDb.bookmarkMeta.bulkDelete(orphanIds);
  }
  return orphanIds.length;
}

export interface AuxExportData {
  version: 1;
  exportedAt: number;
  bookmarkMeta: AuxBookmarkMeta[];
  linkChecks: LinkCheckRecord[];
  organizeHistory: OrganizeHistory[];
}

// 导出全部元数据（JSON 备份用）
export async function exportAuxData(): Promise<AuxExportData> {
  const [bookmarkMeta, linkChecks, organizeHistory] = await Promise.all([
    auxDb.bookmarkMeta.toArray(),
    auxDb.linkChecks.toArray(),
    auxDb.organizeHistory.toArray(),
  ]);
  return { version: 1, exportedAt: Date.now(), bookmarkMeta, linkChecks, organizeHistory };
}

// 导入元数据（合并写入，不覆盖未涉及的记录）
export async function importAuxData(data: AuxExportData): Promise<void> {
  if (data.version !== 1) {
    throw new Error('Unsupported aux data version');
  }
  if (data.bookmarkMeta?.length) {
    await auxDb.bookmarkMeta.bulkPut(data.bookmarkMeta);
  }
  if (data.linkChecks?.length) {
    await auxDb.linkChecks.bulkPut(data.linkChecks);
  }
  if (data.organizeHistory?.length) {
    await auxDb.organizeHistory.bulkPut(data.organizeHistory);
  }
}
