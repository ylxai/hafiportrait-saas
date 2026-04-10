import { LoadingSpinner } from '@/components/ui/loading';

export default function AdminLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <LoadingSpinner size="lg" className="mx-auto mb-4" />
        <p className="text-muted-foreground">Memuat dashboard…</p>
      </div>
    </div>
  );
}