// 标签建议组件

import * as React from 'react';
import { Sparkles, Plus, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { aiService } from '@/services/aiService';
import type { Bookmark, ClassificationResult } from '@/types';

interface TagSuggestionProps {
  bookmark: Partial<Bookmark>;
  existingTags: string[];
  onAccept: (tags: string[]) => void;
  onReject?: () => void;
  className?: string;
}

export function TagSuggestion({
  bookmark,
  existingTags,
  onAccept,
  onReject,
  className,
}: TagSuggestionProps) {
  const [suggestions, setSuggestions] = React.useState<ClassificationResult | null>(null);
  const [selectedTags, setSelectedTags] = React.useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = React.useState(false);
  const [hasClassified, setHasClassified] = React.useState(false);

  // 获取建议
  React.useEffect(() => {
    if (!bookmark.url || !bookmark.title || hasClassified) return;

    const classify = async () => {
      setIsLoading(true);
      try {
        const result = await aiService.classifyBookmark(bookmark as Bookmark);
        // 过滤已存在的标签
        const newTags = result.suggestedTags.filter((t) => !existingTags.includes(t));
        if (newTags.length > 0) {
          setSuggestions({ ...result, suggestedTags: newTags });
          setSelectedTags(new Set(newTags));
        }
      } catch (error) {
        console.error('Classification failed:', error);
      } finally {
        setIsLoading(false);
        setHasClassified(true);
      }
    };

    classify();
  }, [bookmark.url, bookmark.title, existingTags, hasClassified]);

  // 切换标签选择
  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  };

  // 接受选中的标签
  const handleAccept = () => {
    onAccept([...selectedTags]);
    setSuggestions(null);
  };

  // 拒绝所有建议
  const handleReject = () => {
    setSuggestions(null);
    onReject?.();
  };

  if (isLoading) {
    return (
      <div className={cn('flex items-center gap-2 text-sm text-muted-foreground', className)}>
        <Sparkles className="h-4 w-4 animate-pulse" />
        <span>分析中...</span>
      </div>
    );
  }

  if (!suggestions || suggestions.suggestedTags.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-2 text-sm">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-muted-foreground">建议标签</span>
        {suggestions.confidence >= 0.7 && (
          <Badge variant="secondary" className="text-xs">
            高置信度
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {suggestions.suggestedTags.map((tag) => (
          <Badge
            key={tag}
            variant={selectedTags.has(tag) ? 'default' : 'outline'}
            className={cn(
              'cursor-pointer transition-colors',
              selectedTags.has(tag)
                ? 'bg-primary hover:bg-primary/90'
                : 'hover:bg-accent'
            )}
            onClick={() => toggleTag(tag)}
          >
            {selectedTags.has(tag) ? (
              <Check className="h-3 w-3 mr-1" />
            ) : (
              <Plus className="h-3 w-3 mr-1" />
            )}
            {tag}
          </Badge>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={handleAccept}
          disabled={selectedTags.size === 0}
        >
          采用 ({selectedTags.size})
        </Button>
        <Button size="sm" variant="ghost" onClick={handleReject}>
          忽略
        </Button>
      </div>
    </div>
  );
}
