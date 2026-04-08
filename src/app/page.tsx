import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

export default function Home() {
  return (
    <div className="min-h-screen pearl-gradient">
      {/* Floating Header */}
      <header className="fixed top-4 left-4 right-4 z-50">
        <nav className="glass rounded-2xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl glass flex items-center justify-center">
              <svg className="w-5 h-5 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.76-.9l.814-1.74A2 2 0 0111.52 4H17a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span className="font-bold text-slate-800">PhotoStudio</span>
          </Link>
          
          <div className="flex items-center gap-3">
            <Link href="/booking" className="glass-btn text-sm hidden sm:flex">
              Booking
            </Link>
            <Link href="/login" className="glass-btn-primary text-sm">
              Masuk
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="pt-32 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-2">
              <span className="w-2 h-2 rounded-full bg-antique-gold animate-pulse"></span>
              <span className="text-sm text-slate-500">Platform Management Foto Profesional</span>
            </div>
            
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-800 leading-tight">
              Kelola Bisnis<br />
              <span className="text-antique-gold">Fotografi</span> dengan Mudah
            </h1>
            
            <p className="text-lg text-slate-500 max-w-lg">
              Platform all-in-one untuk mengelola booking, galeri klien, dan seleksi foto. 
              Tingkatkan pengalaman klien Anda dengan layanan profesional.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/booking" className="glass-btn-primary px-8 py-4 text-center">
                Buat Booking
              </Link>
              <Link href="/login" className="glass-btn px-8 py-4 text-center">
                Login Admin
              </Link>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-6 pt-4">
              <div className="glass-card p-4 text-center">
                <div className="text-2xl font-bold text-slate-800">500+</div>
                <div className="text-xs text-slate-500">Client</div>
              </div>
              <div className="glass-card p-4 text-center">
                <div className="text-2xl font-bold text-slate-800">1.2K</div>
                <div className="text-xs text-slate-500">Session</div>
              </div>
              <div className="glass-card p-4 text-center">
                <div className="text-2xl font-bold text-slate-800">98%</div>
                <div className="text-xs text-slate-500">Kepuasan</div>
              </div>
            </div>
          </div>

          {/* Right - Glass Cards Visual */}
          <div className="relative hidden lg:block">
            {/* Background decoration */}
            <div className="absolute inset-0 bg-gradient-to-br from-antique-gold/10 to-rose-gold/10 rounded-3xl blur-3xl"></div>
            
            {/* Main card */}
            <div className="relative glass-card p-6 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-antique-gold to-rose-gold flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold text-slate-800">Wedding Gallery</div>
                  <div className="text-sm text-slate-500">24 foto • 12 dipilih</div>
                </div>
              </div>
              
              {/* Photo grid preview */}
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <div key={i} className="aspect-square rounded-lg bg-gradient-to-br from-champagne to-cream flex items-center justify-center">
                    <span className="text-xs text-slate-400">{i}</span>
                  </div>
                ))}
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Status: <span className="text-green-600 font-medium">Selesai</span></span>
                <Badge>Published</Badge>
              </div>
            </div>

            {/* Floating cards */}
            <div className="absolute -right-4 top-8 glass-card p-4 w-48">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="text-sm font-medium text-slate-800">Booking Baru</span>
              </div>
              <p className="text-xs text-slate-500">Jane & John - Wedding Session</p>
            </div>

            <div className="absolute -left-4 bottom-16 glass-card p-4 w-48">
              <div className="text-sm font-medium text-slate-800 mb-1">Stats Hari Ini</div>
              <div className="text-xs text-slate-500">5 views • 2 Seleksi</div>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div className="mt-24">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-800 mb-4">Fitur Utama</h2>
            <p className="text-slate-500 max-w-2xl mx-auto">
              Semua yang Anda butuhkan untuk mengelola bisnis fotografi
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="glass-card glass-card-hover p-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-antique-gold/20 to-antique-gold/10 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">Booking System</h3>
              <p className="text-sm text-slate-500">Kelola jadwal booking klien dengan mudah. Terintegrasi dengan kalender.</p>
            </div>

            {/* Feature 2 */}
            <div className="glass-card glass-card-hover p-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-gold/20 to-rose-gold/10 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-rose" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">Gallery Picked</h3>
              <p className="text-sm text-slate-500">Klien dapat memilih foto langsung dari galeri online dengan real-time update.</p>
            </div>

            {/* Feature 3 */}
            <div className="glass-card glass-card-hover p-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-antique-gold/20 to-antique-gold/10 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">Download Otomatis</h3>
              <p className="text-sm text-slate-500">Download foto original dengan satu klik. Support Cloudflare R2.</p>
            </div>

            {/* Feature 4 */}
            <div className="glass-card glass-card-hover p-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-gold/20 to-rose-gold/10 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-rose" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">Dashboard Analytics</h3>
              <p className="text-sm text-slate-500">Pantau performance bisnis dengan data lengkap dan visual.</p>
            </div>

            {/* Feature 5 */}
            <div className="glass-card glass-card-hover p-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-antique-gold/20 to-antique-gold/10 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">Kelola Klien</h3>
              <p className="text-sm text-slate-500">Database klien terintegrasi dengan riwayat booking dan galeri.</p>
            </div>

            {/* Feature 6 */}
            <div className="glass-card glass-card-hover p-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-gold/20 to-rose-gold/10 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-rose" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">Aman & Terproteksi</h3>
              <p className="text-sm text-slate-500">Gallery hanya bisa diakses dengan token unik oleh klien.</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-glass-border">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg glass flex items-center justify-center">
              <svg className="w-4 h-4 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.76-.9l.814-1.74A2 2 0 0111.52 4H17a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              </svg>
            </div>
            <span className="font-medium text-slate-800">PhotoStudio</span>
          </div>
          <p className="text-sm text-slate-500">© {new Date().getFullYear()} PhotoStudio. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}