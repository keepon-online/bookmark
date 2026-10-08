// AI 整理的学习规则面板
//
// 展示由"用户确认并成功应用的高置信度 AI 建议"固化下来的域名规则。
// 这些规则命中时会直接跳过 LLM，所以必须能被看见、被撤销：粒度是整个域名，
// 同一域名的多用途书签会共用一条规则，学错时需要用户能一键清掉。

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Brain, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import {
  LEARNED_RULES_MAX,
  clearLearnedRules,
  loadLearnedRules,
  type LearnedDomainRules,
} from '@/lib/learnedRules';
import { formatRelativeTime } from '@/lib/utils';

interface LearnedRulesPanelProps {
  className?: string;
}

export function LearnedRulesPanel({ className = '' }: LearnedRulesPanelProps) {
  const [rules, setRules] = useState<LearnedDomainRules | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setRules(await loadLearnedRules());
    } catch (error) {
      console.error('Failed to load learned rules:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleClear = async () => {
    if (
      !confirm(
        '确定清空全部学习规则吗？清空后这些域名的书签会重新交给 AI 或本地规则判断，此操作不可撤销。'
      )
    ) {
      return;
    }
    await clearLearnedRules();
    setMessage('已清空学习规则');
    await load();
  };

  const entries = Object.entries(rules ?? {}).sort((a, b) => b[1].learnedAt - a[1].learnedAt);

  return (
    <div className={`bg-white dark:bg-zinc-900 rounded-lg shadow-sm p-6 ${className}`}>
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-100 dark:bg-emerald-950/60 rounded-lg">
            <Brain className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">AI 学习规则</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              整理时确认应用过的高置信度建议会被记住，同域名的书签下次直接命中、不再消耗
              AI 调用
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 dark:text-gray-400 tabular-nums">
            {entries.length} / {LEARNED_RULES_MAX}
          </span>
          <button
            onClick={() => void load()}
            disabled={isLoading}
            className="px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-50 flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300"
          >
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            刷新
          </button>
          <button
            onClick={() => void handleClear()}
            disabled={isLoading || entries.length === 0}
            className="px-3 py-2 border border-red-300 dark:border-red-900 rounded-lg text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 flex items-center gap-1.5 text-sm"
          >
            <Trash2 className="w-3.5 h-3.5" />
            清空
          </button>
        </div>
      </div>

      {message && (
        <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-lg text-sm text-emerald-800 dark:text-emerald-300">
          {message}
        </div>
      )}

      {/* 规则列表 */}
      {entries.length === 0 ? (
        <div className="p-6 bg-gray-50 dark:bg-zinc-950/40 border border-gray-200 dark:border-zinc-800 rounded-lg text-center">
          <Brain className="w-8 h-8 text-gray-400 dark:text-zinc-600 mx-auto mb-2" />
          <p className="text-sm text-gray-600 dark:text-gray-400">还没有学习规则</p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
            在「智能整理」里应用 AI 建议后，这里会记录对应域名的归类偏好
          </p>
        </div>
      ) : (
        <div className="max-h-80 overflow-y-auto space-y-1.5 pr-1">
          {entries.map(([domain, rule]) => (
            <div
              key={domain}
              className="flex items-center justify-between gap-3 p-3 border border-gray-200 dark:border-zinc-800 rounded-lg"
            >
              <div className="min-w-0">
                <div className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                  {domain}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  归入 {rule.folder}
                  {rule.tags.length > 0 && ` · 标签 ${rule.tags.slice(0, 3).join('、')}${rule.tags.length > 3 ? ` 等 ${rule.tags.length} 个` : ''}`}
                </div>
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                {formatRelativeTime(rule.learnedAt)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 已知取舍提示 */}
      <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-900 rounded-lg flex items-start gap-2">
        <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-500 shrink-0 mt-0.5" />
        <div className="text-xs text-yellow-800 dark:text-yellow-200">
          <p className="font-medium mb-1">粒度是整个域名</p>
          <p>
            同一域名下的不同用途书签会共用一条规则（例如 medium.com 上的技术文与生活文），
            命中的书签不会再交给 AI。规则不合适的域请直接清空，之后会重新学习。
          </p>
        </div>
      </div>
    </div>
  );
}
