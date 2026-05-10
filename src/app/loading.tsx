export default function Loading() {
  return (
    // `role="status"` + `aria-live="polite"` mengumumkan ke screen reader
    // bahwa region ini sedang diperbarui (loading) tanpa menginterupsi user.
    // `aria-busy` menandai konten anak sebagai sedang dimuat.
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="min-h-screen flex items-center justify-center bg-background"
    >
      <div className="text-center">
        {/* Spinner murni dekoratif — sembunyikan dari assistive tech karena
            teks `Memuat…` di bawah sudah dibacakan oleh `role="status"`. */}
        <div
          aria-hidden="true"
          className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-4"
        />
        <p className="text-muted-foreground">Memuat…</p>
      </div>
    </div>
  );
}