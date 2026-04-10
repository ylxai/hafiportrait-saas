'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  pages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
  className?: string;
}

export function Pagination({
  page,
  pages,
  total,
  limit,
  onPageChange,
  isLoading,
  className,
}: PaginationProps) {
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <div className={cn('flex items-center justify-between py-4', className)}>
      <p className="text-sm text-muted-foreground">
        Showing {start} to {end} of {total} results
      </p>
      
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1 || isLoading}
          className="border-border hover:bg-accent"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        
        <span className="text-sm text-muted-foreground px-2">
          Page {page} of {pages}
        </span>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page === pages || isLoading}
          className="border-border hover:bg-accent"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

interface PaginationInfo {
  page: number;
  limit: number;
  skip: number;
  total: number;
  pages: number;
}

export function getPaginationInfo(searchParams: URLSearchParams): PaginationInfo {
  const pageRaw = parseInt(searchParams.get('page') ?? '1', 10);
  const page = Number.isNaN(pageRaw) ? 1 : Math.max(1, pageRaw);
  const limitRaw = parseInt(searchParams.get('limit') ?? '20', 10);
  const limit = Number.isNaN(limitRaw) ? 20 : Math.min(100, Math.max(1, limitRaw));
  
  return { page, limit, skip: (page - 1) * limit, pages: 1, total: 0 };
}

export function calculatePages(total: number, limit: number): number {
  return Math.ceil(total / limit);
}
