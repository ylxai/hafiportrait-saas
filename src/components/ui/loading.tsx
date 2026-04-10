'use client';

import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  text?: string;
}

const sizeClasses = {
  sm: 'h-4 w-4 border-2',
  md: 'h-8 w-8 border-2',
  lg: 'h-12 w-12 border-3',
  xl: 'h-16 w-16 border-4',
};

export function LoadingSpinner({ size = 'md', className, text }: LoadingSpinnerProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center', className)}>
      <div
        className={cn(
          'animate-spin rounded-full border-primary border-t-transparent',
          sizeClasses[size]
        )}
        role="status"
        aria-label="Loading"
      />
      {text && (
        <p className="mt-4 text-sm text-muted-foreground">{text}</p>
      )}
    </div>
  );
}

interface LoadingOverlayProps {
  children?: React.ReactNode;
  className?: string;
}

export function LoadingOverlay({ children, className }: LoadingOverlayProps) {
  return (
    <div className={cn('flex items-center justify-center h-64', className)}>
      {children || <LoadingSpinner size="lg" />}
    </div>
  );
}

interface PageLoaderProps {
  className?: string;
}

export function PageLoader({ className }: PageLoaderProps) {
  return (
    <div className={cn('flex items-center justify-center min-h-[60vh]', className)}>
      <LoadingSpinner size="xl" text="Loading..." />
    </div>
  );
}
