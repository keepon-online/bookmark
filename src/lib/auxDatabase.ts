// 扩展元数据数据库（Dexie）
// v0.6 起 chrome.bookmarks 是唯一数据源，本库只存浏览器书签没有的增强元数据，
// 全部以 chrome 书签节点 id 关联，可随时重建或丢弃。

import Dexie, { type Table } from 'dexie';
import type { AuxBookmarkMeta, BrowserBookmarkNode } from '@/types';
import type { OrganizeHistory } from '@/types/organizer';
import { loadLearnedRules, saveLearnedRules, type LearnedDomainRules } from './learnedRules';
import { getUrlKey } from './utils';

// 死链检查记录
export interface LinkCheckRecord {
  id: string;
  bookmarkId: string;
  status: number;
  isAccessible: boolean;
  responseTime: number;
  errorMessage?: string;
  checkedAt: number;
  // 网络层失败标记（未获得 HTTP 响应），用于"连续无法连接"判定
  networkError?: boolean;
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

// 孤儿元数据的保留时长。书签被删除后不立刻丢弃元数据，而是等一段时间：
// 期间若同一个链接（urlKey 相同）被重新添加，或由其它设备同步进来，
// 就把标签/备注认领回去；超过这个时长仍无人认领才真正清理
export const ORPHAN_META_TTL_MS = 90 * 24 * 3600_000;

export interface ReconcileResult {
  // 被重新认领（bookmarkId 换成了新节点 id）的条数
  rebound: number;
  // 补齐了 urlKey 的条数
  backfilled: number;
  // 真正清理掉的条数
  removed: number;
  // 仍在等待认领的条数
  pending: number;
}

/**
 * 元数据对账：把 aux 里的元数据与当前书签树对齐。
 *
 * 1. 书签还在 → 补齐缺失的 `urlKey`
 * 2. 书签没了但已有元数据对应到新节点（urlKey 相同且该节点还没有元数据）→ 认领
 * 3. 书签没了、暂时无人认领 → 打上 `orphanedAt` 保留等待
 * 4. 超过 `ORPHAN_META_TTL_MS` 仍无人认领，或是没有 urlKey 的旧数据 → 清理
 */
export async function reconcileMeta(
  bookmarks: BrowserBookmarkNode[],
  nowTs: number = Date.now()
): Promise<ReconcileResult> {
  const result: ReconcileResult = { rebound: 0, backfilled: 0, removed: 0, pending: 0 };
  const all = await auxDb.bookmarkMeta.toArray();
  if (all.length === 0) {
    return result;
  }

  // 当前书签 id → urlKey
  const urlKeyById = new Map<string, string>();
  for (const bookmark of bookmarks) {
    if (bookmark.url) {
      urlKeyById.set(bookmark.id, getUrlKey(bookmark.url));
    }
  }

  const withMeta = new Set(all.map((meta) => meta.bookmarkId));
  // 可以被认领的目标：当前存在、且还没有元数据的书签，按 urlKey 分组
  const claimable = new Map<string, string[]>();
  for (const bookmark of bookmarks) {
    const urlKey = urlKeyById.get(bookmark.id);
    if (!urlKey || withMeta.has(bookmark.id)) continue;
    const candidates = claimable.get(urlKey) ?? [];
    candidates.push(bookmark.id);
    claimable.set(urlKey, candidates);
  }

  const puts: AuxBookmarkMeta[] = [];
  const deletes: string[] = [];

  for (const meta of all) {
    const liveUrlKey = urlKeyById.get(meta.bookmarkId);

    // 1) 书签还在：补齐 urlKey
    if (liveUrlKey) {
      if (meta.urlKey !== liveUrlKey) {
        puts.push({ ...meta, urlKey: liveUrlKey, orphanedAt: undefined });
        result.backfilled++;
      }
      continue;
    }

    // 2) 孤儿：有 urlKey 才有认领的可能
    if (meta.urlKey) {
      const target = claimable.get(meta.urlKey)?.shift();
      if (target) {
        puts.push({ ...meta, bookmarkId: target, orphanedAt: undefined });
        deletes.push(meta.bookmarkId);
        result.rebound++;
        continue;
      }

      // 3) 还没人认领：打时间戳等待，超时才清理
      const orphanedAt = meta.orphanedAt ?? nowTs;
      if (nowTs - orphanedAt > ORPHAN_META_TTL_MS) {
        deletes.push(meta.bookmarkId);
        result.removed++;
      } else {
        if (meta.orphanedAt !== orphanedAt) {
          puts.push({ ...meta, orphanedAt });
        }
        result.pending++;
      }
      continue;
    }

    // 4) 旧数据没有 urlKey，无从认领
    deletes.push(meta.bookmarkId);
    result.removed++;
  }

  if (puts.length > 0) {
    await auxDb.bookmarkMeta.bulkPut(puts);
  }
  if (deletes.length > 0) {
    await auxDb.bookmarkMeta.bulkDelete(deletes);
  }

  return result;
}

export interface AuxExportData {
  version: 1;
  exportedAt: number;
  bookmarkMeta: AuxBookmarkMeta[];
  linkChecks: LinkCheckRecord[];
  organizeHistory: OrganizeHistory[];
  // AI 整理的学习规则存在 chrome.storage.local（不属于 aux 库），但同属
  // "扩展自有数据"，一并备份，避免换机或重装后学习成果丢失
  learnedDomainRules?: LearnedDomainRules;
}

// 导出全部元数据（JSON 备份用）
export async function exportAuxData(): Promise<AuxExportData> {
  const [bookmarkMeta, linkChecks, organizeHistory, learnedDomainRules] = await Promise.all([
    auxDb.bookmarkMeta.toArray(),
    auxDb.linkChecks.toArray(),
    auxDb.organizeHistory.toArray(),
    loadLearnedRules(),
  ]);
  return {
    version: 1,
    exportedAt: Date.now(),
    bookmarkMeta,
    linkChecks,
    organizeHistory,
    learnedDomainRules,
  };
}

// 导入元数据（合并写入，不覆盖未涉及的记录；学习规则按 key 合并，导入方优先）
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
  if (data.learnedDomainRules && Object.keys(data.learnedDomainRules).length > 0) {
    const current = await loadLearnedRules();
    await saveLearnedRules({ ...current, ...data.learnedDomainRules });
  }
}
