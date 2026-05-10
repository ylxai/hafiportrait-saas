import { LoadingSpinner } from '@/components/ui/loading';

export default function AdminLoading() {
  return (
    // Review #72-1 (CodeAnt + Gemini): the previous version put
    // `role="status"` on this wrapper *and* `LoadingSpinner` already
    // emits its own `role="status"` (with `aria-label="Loading"`) on
    // the spinner div. Two `role="status"` regions in the same tree
    // fire two separate live announcements, which screen readers
    // surface as "Loading. Memuat dashboard…" — extra noise without
    // extra information.
    //
    // Per CodeAnt's recommendation we keep the inner spinner as the
    // canonical status region (it is the shared component used by
    // `PageLoader`/`LoadingOverlay` and other callers), and the
    // wrapper retains only `aria-busy="true"` so AT can still report
    // the route as "loading" without re-announcing it. The
    // descriptive text below stays in DOM order, so a screen reader
    // walking the page still encounters it.
    <div
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