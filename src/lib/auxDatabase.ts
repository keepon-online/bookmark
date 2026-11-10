// 扩展元数据数据库（Dexie）
// v0.6 起 chrome.bookmarks 是唯一数据源，本库只存浏览器书签没有的增强元数据，
// 全部以 chrome 书签节点 id 关联，可随时重建或丢弃。

import Dexie, { type Table } from 'dexie';
import type { AuxBookmarkMeta, BrowserBookmarkNode } from '@/types';
import type { OrganizeHistory } from '@/types/organizer';
import { loadLearnedRules, saveLearnedRules, trimLearnedRules, type LearnedDomainRules } from './learnedRules';
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
  // 网络层失败类别（timeout/network/ssl/blocked）：blocked/ssl 是环境
  // 问题，不应计入 unreachable 连击
  errorKind?: string;
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
  // 与"同链接、已有自己元数据"的节点合并掉的条数
  merged: number;
}

/**
 * 同一链接出现多份元数据时的合并规则（目标节点自己的那份为准，取并集不丢信息）：
 * 标签去重合并、收藏取或、访问次数相加、最近访问取较晚的；
 * 备注优先保留目标节点上的（用户在新节点写过就以他为准）；
 * 死链状态取"检查时间较新"的那份。
 */
export function mergeMeta(target: AuxBookmarkMeta, orphan: AuxBookmarkMeta): AuxBookmarkMeta {
  const recipient = (target.linkCheckedAt ?? 0) >= (orphan.linkCheckedAt ?? 0) ? target : orphan;
  const lastVisited = Math.max(target.lastVisited ?? 0, orphan.lastVisited ?? 0);
  return {
    ...target,
    tags: [...new Set([...target.tags, ...orphan.tags])],
    notes: target.notes ?? orphan.notes,
    isFavorite: target.isFavorite || orphan.isFavorite,
    visitCount: target.visitCount + orphan.visitCount,
    lastVisited: lastVisited > 0 ? lastVisited : undefined,
    linkStatus: recipient.linkStatus,
    linkCheckedAt: recipient.linkCheckedAt,
    lastStatusCode: recipient.lastStatusCode,
    lastErrorMessage: recipient.lastErrorMessage,
    lastResponseTime: recipient.lastResponseTime,
    linkStatusManual: target.linkStatusManual || orphan.linkStatusManual,
    aiGenerated: target.aiGenerated || orphan.aiGenerated,
    orphanedAt: undefined,
  };
}

/**
 * 元数据对账：把 aux 里的元数据与当前书签树对齐。
 *
 * 1. 书签还在 → 补齐缺失的 `urlKey`
 * 2. 书签没了、但有 urlKey 相同且**还没有元数据**的新节点 → 认领（bookmarkId 换成新 id）
 * 3. 书签没了、同链接节点**已有自己的元数据** → 与该节点合并（见 `mergeMeta`）
 * 4. 暂时无人认领 → 打上 `orphanedAt` 保留等待
 * 5. 超过 `ORPHAN_META_TTL_MS` 仍无人认领，或是没有 urlKey 的旧数据 → 清理
 */
export async function reconcileMeta(
  bookmarks: BrowserBookmarkNode[],
  nowTs: number = Date.now()
): Promise<ReconcileResult> {
  const { result } = await computeAndApplyReconcile(bookmarks, nowTs);
  return result;
}

/**
 * 对账并一步读出最终元数据映射：对账内部本来就加载了全部行，
 * 直接拼最终状态返回，省掉调用方紧随其后的第二次全表 toArray()
 * （refresh 是高频路径，大库下每事件突发可省一半物化成本）
 */
export async function reconcileAndLoadMeta(
  bookmarks: BrowserBookmarkNode[],
  nowTs: number = Date.now()
): Promise<Record<string, AuxBookmarkMeta>> {
  const { finalRows } = await computeAndApplyReconcile(bookmarks, nowTs);
  const map: Record<string, AuxBookmarkMeta> = {};
  for (const row of finalRows) {
    map[row.bookmarkId] = row;
  }
  return map;
}

// 对账核心：加载全部行 → 计算 puts/deletes → 落库 → 返回最终行集合
async function computeAndApplyReconcile(
  bookmarks: BrowserBookmarkNode[],
  nowTs: number
): Promise<{ result: ReconcileResult; finalRows: AuxBookmarkMeta[] }> {
  const result: ReconcileResult = {
    rebound: 0,
    backfilled: 0,
    removed: 0,
    pending: 0,
    merged: 0,
  };
  const all = await auxDb.bookmarkMeta.toArray();
  if (all.length === 0) {
    return { result, finalRows: [] };
  }

  // 当前书签 id → urlKey
  const urlKeyById = new Map<string, string>();
  for (const bookmark of bookmarks) {
    if (bookmark.url) {
      urlKeyById.set(bookmark.id, getUrlKey(bookmark.url));
    }
  }

  // 仍在树上的元数据按 urlKey 建索引，供第 3 步合并用
  const liveMetaByUrlKey = new Map<string, AuxBookmarkMeta>();
  for (const meta of all) {
    const liveUrlKey = urlKeyById.get(meta.bookmarkId);
    if (liveUrlKey && !liveMetaByUrlKey.has(liveUrlKey)) {
      liveMetaByUrlKey.set(liveUrlKey, meta);
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

  // 写入集合按主键去重：同一行可能同时命中多个分支（如存活行的 urlKey
  // 回填 + 同 urlKey 孤儿的合并结果），bulkPut 后写覆盖先写会把合并
  // 结果静默抹掉。Map 语义：同键后写覆盖前写，且各分支写入前先与
  // 已有待写内容合并，保证任一分支的结果不丢
  const putsByKey = new Map<string, AuxBookmarkMeta>();
  const deletes: string[] = [];

  const stagePut = (row: AuxBookmarkMeta) => {
    putsByKey.set(row.bookmarkId, row);
  };

  for (const meta of all) {
    const liveUrlKey = urlKeyById.get(meta.bookmarkId);

    // 1) 书签还在：补齐 urlKey（若该行已被合并结果占用，只补 urlKey）
    if (liveUrlKey) {
      if (meta.urlKey !== liveUrlKey) {
        const pending = putsByKey.get(meta.bookmarkId);
        stagePut({ ...(pending ?? meta), urlKey: liveUrlKey, orphanedAt: undefined });
        result.backfilled++;
      }
      continue;
    }

    // 2) 孤儿：有 urlKey 才有认领/合并的可能。
    //    升级兼容：旧算法的 urlKey 是整体小写的（新算法保留 path 大小写），
    //    存量孤儿永远走不到 step 1 的回填——exact miss 时用小写折叠键
    //    再试一次，让旧数据在新算法下仍能认领/合并
    if (meta.urlKey) {
      let target = claimable.get(meta.urlKey)?.shift();
      let existing = liveMetaByUrlKey.get(meta.urlKey);
      if (!target && !existing) {
        const lowerKey = meta.urlKey.toLowerCase();
        for (const [key, ids] of claimable) {
          if (key.toLowerCase() === lowerKey && ids.length > 0) {
            target = ids.shift();
            break;
          }
        }
        existing ??= [...liveMetaByUrlKey.values()].find(
          (row) => row.urlKey?.toLowerCase() === lowerKey
        );
      }
      if (target) {
        const claimed = { ...meta, bookmarkId: target, orphanedAt: undefined };
        stagePut(claimed);
        // 同步认领索引：同 urlKey 的后续孤儿才能链式合并进这份结果
        liveMetaByUrlKey.set(meta.urlKey, claimed);
        deletes.push(meta.bookmarkId);
        result.rebound++;
        continue;
      }

      // 3) 同链接的节点已有自己的元数据：合并而不是丢弃
      if (existing) {
        const merged = mergeMeta(existing, meta);
        // 合并结果必然属于正确的 urlKey 家族，显式写入避免沿用
        // existing 行上尚未回填的旧 urlKey
        const row = { ...merged, urlKey: meta.urlKey };
        stagePut(row);
        deletes.push(meta.bookmarkId);
        // 同一 urlKey 的后续孤儿继续并进这份结果
        liveMetaByUrlKey.set(meta.urlKey, row);
        result.merged++;
        continue;
      }

      // 4) 还没人认领：打时间戳等待，超时才清理
      const orphanedAt = meta.orphanedAt ?? nowTs;
      if (nowTs - orphanedAt > ORPHAN_META_TTL_MS) {
        deletes.push(meta.bookmarkId);
        result.removed++;
      } else {
        if (meta.orphanedAt !== orphanedAt) {
          stagePut({ ...meta, orphanedAt });
        }
        result.pending++;
      }
      continue;
    }

    // 5) 旧数据没有 urlKey，无从认领
    deletes.push(meta.bookmarkId);
    result.removed++;
  }

  const puts = [...putsByKey.values()];
  if (puts.length > 0) {
    await auxDb.bookmarkMeta.bulkPut(puts);
  }
  if (deletes.length > 0) {
    await auxDb.bookmarkMeta.bulkDelete(deletes);
  }

  // 最终行集合 = 原始行 + 待写覆盖 − 待删（调用方可直接复用，免二次全表读）
  const finalById = new Map(all.map((row) => [row.bookmarkId, row]));
  for (const [key, row] of putsByKey) {
    finalById.set(key, row);
  }
  for (const id of deletes) {
    finalById.delete(id);
  }

  return { result, finalRows: [...finalById.values()] };
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

// 导入的元数据行是不可信的外部数据（手工编辑过的备份/旧版本导出），
// 缺字段会让渲染路径（record.tags 遍历等）直接抛 TypeError。
// 逐行规范化并丢弃没有主键的行，避免导入后白屏
function numOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeImportedMeta(row: unknown): AuxBookmarkMeta | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const bookmarkId = r.bookmarkId;
  if (typeof bookmarkId !== 'string' || !bookmarkId) return null;
  return {
    ...r,
    bookmarkId,
    tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === 'string') : [],
    isFavorite: Boolean(r.isFavorite),
    visitCount: typeof r.visitCount === 'number' && Number.isFinite(r.visitCount) ? r.visitCount : 0,
    // 数字字段显式收敛：字符串 orphanedAt 会让 TTL 比较为 NaN，
    // 该行将永久 pending 永不清理
    orphanedAt: numOrUndefined(r.orphanedAt),
    linkCheckedAt: numOrUndefined(r.linkCheckedAt),
    lastVisited: numOrUndefined(r.lastVisited),
    lastStatusCode: numOrUndefined(r.lastStatusCode),
    lastResponseTime: numOrUndefined(r.lastResponseTime),
  } as AuxBookmarkMeta;
}

// 有主键的行才允许入库（bulkPut 遇到缺主键的行整批抛错）
function rowsWithKey<T extends { id: string }>(rows: unknown): T[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row): row is T => !!row && typeof (row as T).id === 'string');
}

// 导入元数据（合并写入，不覆盖未涉及的记录；学习规则按 key 合并，导入方优先）
export async function importAuxData(data: AuxExportData): Promise<void> {
  if (data.version !== 1) {
    throw new Error('Unsupported aux data version');
  }
  if (data.bookmarkMeta?.length) {
    const rows = data.bookmarkMeta
      .map(normalizeImportedMeta)
      .filter((row): row is AuxBookmarkMeta => row !== null);
    if (rows.length > 0) {
      await auxDb.bookmarkMeta.bulkPut(rows);
    }
  }
  if (data.linkChecks?.length) {
    await auxDb.linkChecks.bulkPut(rowsWithKey<LinkCheckRecord>(data.linkChecks));
  }
  if (data.organizeHistory?.length) {
    await auxDb.organizeHistory.bulkPut(rowsWithKey<OrganizeHistory>(data.organizeHistory));
  }
  if (data.learnedDomainRules && typeof data.learnedDomainRules === 'object') {
    // 学习规则逐条校验：畸形值（字符串/缺 folder）会让 matchLearnedRule
    // 返回 undefined tags，整理建议全流程 TypeError
    const clean: Record<string, { folder: string; tags: string[]; learnedAt: number }> = {};
    for (const [domain, value] of Object.entries(data.learnedDomainRules)) {
      if (!domain || !value || typeof value !== 'object') continue;
      const v = value as unknown as Record<string, unknown>;
      if (typeof v.folder !== 'string' || !v.folder) continue;
      clean[domain] = {
        folder: v.folder,
        tags: Array.isArray(v.tags) ? v.tags.filter((t): t is string => typeof t === 'string') : [],
        learnedAt: typeof v.learnedAt === 'number' && Number.isFinite(v.learnedAt) ? v.learnedAt : Date.now(),
      };
    }
    if (Object.keys(clean).length > 0) {
      const current = await loadLearnedRules();
      await saveLearnedRules(trimLearnedRules({ ...current, ...clean }));
    }
  }
}
