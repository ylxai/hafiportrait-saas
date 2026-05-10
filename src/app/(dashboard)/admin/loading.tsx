import { LoadingSpinner } from '@/components/ui/loading';

export default function AdminLoading() {
  return (
    // Wrapper diberi `role="status"` + `aria-live="polite"` agar screen
    // reader mengumumkan teks "Memuat dashboard…" saat halaman admin
    // sedang dimuat. `LoadingSpinner` di dalam sudah punya role-nya
    // sendiri tetapi dibungkus untuk menyertakan teks deskriptif.
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="min-h-screen flex items-center justify-center bg-background"
    >
      <div className="text-center">
        <LoadingSpinner size="lg" className="mx-auto mb-4" />
        <p className="text-muted-foreground">Memuat dashboard…</p>
      </div>
    </div>
  );
}