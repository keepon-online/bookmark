// 批量添加标签对话框

import * as React from 'react';
import { Tag, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

interface BatchTagDialogProps {
  isOpen: boolean;
  selectedCount: number;
  existingTags: string[];
  onConfirm: (tags: string[]) => void;
  onCancel: () => void;
  className?: string;
}

export function BatchTagDialog({
  isOpen,
  selectedCount,
  existingTags,
  onConfirm,
  onCancel,
  className,
}: BatchTagDialogProps) {
  const [inputValue, setInputValue] = React.useState('');
  const [selectedTags, setSelectedTags] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (isOpen) {
      setSelectedTags([]);
      setInputValue('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAddTag = () => {
    const tag = inputValue.trim();
    if (tag && !selectedTags.includes(tag)) {
      setSelectedTags([...selectedTags, tag]);
      setInputValue('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setSelectedTags(selectedTags.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleSelectExisting = (tag: string) => {
    if (!selectedTags.includes(tag)) {
      setSelectedTags([...selectedTags, tag]);
    }
  };

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
          <Tag className="h-6 w-6 text-primary" />
          <h3 className="text-lg font-semibold">添加标签</h3>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          为选中的 {selectedCount} 个书签添加标签
        </p>

        {/* 输入框 */}
        <div className="flex gap-2 mb-4">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入标签名称"
            className="flex-1"
            autoFocus
          />
          <Button onClick={handleAddTag} disabled={!inputValue.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* 已选标签 */}
        {selectedTags.length > 0 && (
          <div className="mb-4">
            <div className="text-sm text-muted-foreground mb-2">已选标签:</div>
            <div className="flex flex-wrap gap-1.5">
              {selectedTags.map((tag) => (
                <Badge
                  key={tag}
                  variant="default"
                  className="gap-1 cursor-pointer"
                  onClick={() => handleRemoveTag(tag)}
                >
                  {tag}
                  <X className="h-3 w-3" />
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* 常用标签 */}
        {existingTags.length > 0 && (
          <div className="mb-4">
            <div className="text-sm text-muted-foreground mb-2">常用标签:</div>
            <div className="flex flex-wrap gap-1.5">
              {existingTags.slice(0, 10).map((tag) => (
                <Badge
                  key={tag}
                  variant={selectedTags.includes(tag) ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => handleSelectExisting(tag)}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button
            onClick={() => onConfirm(selectedTags)}
            disabled={selectedTags.length === 0}
          >
            确定添加
          </Button>
        </div>
      </div>
    </div>
  );
}
