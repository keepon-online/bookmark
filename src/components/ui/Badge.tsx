// Badge 组件

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'destructive';
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          variant === 'default' && 'border-transparent bg-primary text-primary-foreground shadow',
          variant === 'secondary' && 'border-transparent bg-secondary text-secondary-foreground',
          variant === 'outline' && 'border border-input text-foreground',
          variant === 'destructive' && 'border-transparent bg-destructive text-destructive-foreground shadow',
          className
        )}
        {...props}
      />
    );
  }
);

Badge.displayName = 'Badge';

export { Badge };
