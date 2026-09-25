// 浏览器书签添加/编辑表单

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { getCurrentPageInfo } from '@/lib/messaging';
import type { BrowserBookmarkNode } from '@/types';

export interface BookmarkFormValue {
  url: string;
  title: string;
  folderId?: string;
  tags: string[];
}

interface BrowserBookmarkFormProps {
  // 编辑模式传入原节点；添加模式为空（自动读取当前页）
  initial?: BrowserBookmarkNode;
  initialTags?: string[];
  folders: Array<{ id: string; title: string; path: string }>;
  onSubmit: (value: BookmarkFormValue) => Promise<void>;
  onCancel?: () => void;
  className?: string;
}

export function BrowserBookmarkForm({
  initial,
  initialTags = [],
  folders,
  onSubmit,
  onCancel,
  className,
}: BrowserBookmarkFormProps) {
  const isEdit = Boolean(initial);
  const [url, setUrl] = React.useState(initial?.url ?? '');
  const [title, setTitle] = React.useState(initial?.title ?? '');
  const [folderId, setFolderId] = React.useState<string>(initial?.parentId ?? '');
  const [tags, setTags] = React.useState<string[]>(initialTags);
  const [tagInput, setTagInput] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // 添加模式：自动读取当前页面
  React.useEffect(() => {
    if (isEdit) return;
    const loadCurrentPage = async () => {
      try {
        const pageInfo = await getCurrentPageInfo();
        if (pageInfo) {
          setUrl((current) => current || pageInfo.url);
          setTitle((current) => current || pageInfo.title);
        }
      } catch {
        // 无法读取当前页时保持空表单
      }
    };
    void loadCurrentPage();
  }, [isEdit]);

  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
    }
    setTagInput('');
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      setError('请输入 URL');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await onSubmit({
        url: url.trim(),
        title: title.trim() || url.trim(),
        folderId: folderId || undefined,
        tags,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={`space-y-3 ${className ?? ''}`}>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">URL</label>
        <Input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          required
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">标题</label>
        <Input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="页面标题"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">文件夹</label>
        <select
          value={folderId}
          onChange={(e) => setFolderId(e.target.value)}
          className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">书签栏（默认）</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.path ? `${folder.path}/` : ''}
              {folder.title}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          标签（Enter 添加）
        </label>
        <Input
          type="text"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={handleTagKeyDown}
          onBlur={handleAddTag}
          placeholder="输入标签后回车"
        />
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="cursor-pointer"
                onClick={() => setTags(tags.filter((t) => t !== tag))}
              >
                {tag} ×
              </Badge>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex items-center gap-2 justify-end">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            取消
          </Button>
        )}
        <Button type="submit" disabled={isLoading || !url.trim()}>
          {isLoading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          {isEdit ? '保存' : '添加书签'}
        </Button>
      </div>
    </form>
  );
}
