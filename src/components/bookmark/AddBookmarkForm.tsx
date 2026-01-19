// 添加书签表单组件

import * as React from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { getCurrentPageInfo } from '@/lib/messaging';
import type { CreateBookmarkDTO } from '@/types';

interface AddBookmarkFormProps {
  onSubmit: (dto: CreateBookmarkDTO) => Promise<void>;
  onCancel?: () => void;
  className?: string;
}

export function AddBookmarkForm({ onSubmit, onCancel, className }: AddBookmarkFormProps) {
  const [url, setUrl] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [tags, setTags] = React.useState<string[]>([]);
  const [tagInput, setTagInput] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [isLoadingPage, setIsLoadingPage] = React.useState(true);

  // 加载当前页面信息
  React.useEffect(() => {
    const loadCurrentPage = async () => {
      try {
        const pageInfo = await getCurrentPageInfo();
        if (pageInfo) {
          setUrl(pageInfo.url);
          setTitle(pageInfo.title);
        }
      } catch (error) {
        console.error('Failed to get current page info:', error);
      } finally {
        setIsLoadingPage(false);
      }
    };
    loadCurrentPage();
  }, []);

  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setIsLoading(true);
    try {
      await onSubmit({
        url: url.trim(),
        title: title.trim() || url.trim(),
        tags,
      });
      // 重置表单
      setUrl('');
      setTitle('');
      setTags([]);
    } catch (error) {
      console.error('Failed to add bookmark:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoadingPage) {
    return (
      <div className={cn('flex items-center justify-center py-8', className)}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-4', className)}>
      {/* URL */}
      <div className="space-y-2">
        <label className="text-sm font-medium">网址</label>
        <Input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          required
        />
      </div>

      {/* Title */}
      <div className="space-y-2">
        <label className="text-sm font-medium">标题</label>
        <Input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="页面标题"
        />
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <label className="text-sm font-medium">标签</label>
        <div className="flex gap-2">
          <Input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            placeholder="输入标签后回车"
            className="flex-1"
          />
          <Button type="button" variant="outline" size="icon" onClick={handleAddTag}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                onClick={() => handleRemoveTag(tag)}
              >
                {tag} ×
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            取消
          </Button>
        )}
        <Button type="submit" disabled={isLoading || !url.trim()}>
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              保存中...
            </>
          ) : (
            '保存书签'
          )}
        </Button>
      </div>
    </form>
  );
}
