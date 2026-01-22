// 批量操作进度对话框

import { Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

export interface BatchProgress {
  total: number;
  completed: number;
  success: number;
  failed: number;
  current?: string;
}

interface BatchProgressDialogProps {
  isOpen: boolean;
  title: string;
  progress: BatchProgress;
  onCancel?: () => void;
  onClose?: () => void;
  canCancel?: boolean;
  className?: string;
}

export function BatchProgressDialog({
  isOpen,
  title,
  progress,
  onCancel,
  onClose,
  canCancel = true,
  className,
}: BatchProgressDialogProps) {
  if (!isOpen) return null;

  const percentage = progress.total > 0
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;

  const isComplete = progress.completed >= progress.total;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className={cn(
          'w-full max-w-md bg-background rounded-lg shadow-lg p-6',
          'animate-slide-up',
          className
        )}
      >
        {/* 标题 */}
        <div className="flex items-center gap-3 mb-4">
          {isComplete ? (
            progress.failed > 0 ? (
              <AlertTriangle className="h-6 w-6 text-yellow-500" />
            ) : (
              <CheckCircle className="h-6 w-6 text-green-500" />
            )
          ) : (
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          )}
          <h3 className="text-lg font-semibold">{title}</h3>
        </div>

        {/* 进度条 */}
        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {isComplete ? '完成' : '处理中...'}
            </span>
            <span className="font-medium">
              {progress.completed} / {progress.total}
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full transition-all duration-300',
                isComplete
                  ? progress.failed > 0
                    ? 'bg-yellow-500'
                    : 'bg-green-500'
                  : 'bg-primary'
              )}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        {/* 统计信息 */}
        <div className="flex items-center gap-4 text-sm mb-4">
          <div className="flex items-center gap-1.5">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <span>成功: {progress.success}</span>
          </div>
          {progress.failed > 0 && (
            <div className="flex items-center gap-1.5">
              <XCircle className="h-4 w-4 text-red-500" />
              <span>失败: {progress.failed}</span>
            </div>
          )}
        </div>

        {/* 当前处理项 */}
        {progress.current && !isComplete && (
          <div className="text-sm text-muted-foreground truncate mb-4">
            正在处理: {progress.current}
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex justify-end gap-2">
          {!isComplete && canCancel && onCancel && (
            <Button variant="outline" onClick={onCancel}>
              取消
            </Button>
          )}
          {isComplete && onClose && (
            <Button onClick={onClose}>
              关闭
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
