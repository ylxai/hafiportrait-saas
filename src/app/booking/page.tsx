'use client';

import { useState, useCallback } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

type Package = {
  id: string;
  nama: string;
  description: string;
  price: number;
  duration: number;
  fitur: string[];
};

type PackagesResponse = { data: { packages: Package[] } };

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function BookingPage() {
  const router = useRouter();
  const { data, isLoading } = useSWR<PackagesResponse>('/api/public/booking/packages', fetcher, {
    revalidateOnFocus: false,
  });
  
  const packages = data?.data?.packages ?? [];
  
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    nama: '',
    email: '',
    phone: '',
    instagram: '',
    packageId: '',
    eventDate: '',
    location: '',
    notes: '',
  });


  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const res = await fetch('/api/public/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const result: { data?: { kodeBooking?: string } } = await res.json();

      if (res.ok && result.data?.kodeBooking) {
        router.push(`/booking/invoice/${result.data.kodeBooking}`);
      } else {
        toast.error('Terjadi kesalahan. Silakan coba lagi.');
      }
    } catch {
      toast.error('Terjadi kesalahan. Silakan coba lagi.');
    } finally {
      setSubmitting(false);
    }
  }, [formData, router]);

  return (
    <div className="min-h-screen bg-background py-6 px-3">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-foreground mb-1">Booking Session</h1>
          <p className="text-muted-foreground text-sm">Isi form di bawah untuk booking sesi foto</p>
        </div>

        <form onSubmit={(e) => { void handleSubmit(e); }} className="bg-card text-foreground rounded-xl shadow-sm border border-border p-4 sm:p-6 space-y-5">
          {/* Package Selection */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Pilih Paket *</label>
            {isLoading ? (
              <div className="animate-pulse h-24 bg-muted rounded-lg"></div>
            ) : packages.length > 0 ? (
              <div className="grid grid-cols-1 gap-3">
                {packages.map((pkg) => (
                  <label
                    key={pkg.id}
                    className={`block p-3 sm:p-4 border-2 rounded-lg cursor-pointer transition ${
                      formData.packageId === pkg.id
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="packageId"
                      value={pkg.id}
                      required
                      onChange={(e) => setFormData({ ...formData, packageId: e.target.value })}
                      className="sr-only"
                    />
                    <div className="flex justify-between items-start">
                      <span className="font-semibold">{pkg.nama}</span>
                      <span className="text-primary font-bold">Rp {pkg.price.toLocaleString('id-ID')}</span>
                    </div>
                    {pkg.description && <p className="text-sm text-muted-foreground mt-1">{pkg.description}</p>}
                    {pkg.duration && <p className="text-xs text-muted-foreground mt-1">{pkg.duration} menit</p>}
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">Tidak ada paket tersedia</p>
            )}
          </div>

          {/* Personal Info */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Nama Lengkap *</label>
              <input
                type="text"
                required
                autoComplete="name"
                value={formData.nama}
                onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
                className="w-full px-3 py-2.5 sm:py-3 border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-background text-foreground touch-target"
                placeholder="Nama lengkap Anda…"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Email *</label>
              <input
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2.5 sm:py-3 border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-background text-foreground touch-target"
                placeholder="email@example.com…"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Nomor WhatsApp *</label>
              <input
                type="tel"
                required
                autoComplete="tel"
                inputMode="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2.5 sm:py-3 border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-background text-foreground touch-target"
                placeholder="0812 3456 7890…"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Instagram</label>
              <input
                type="text"
                value={formData.instagram}
                onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
                className="w-full px-3 py-2.5 sm:py-3 border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-background text-foreground touch-target"
                placeholder="@username"
              />
            </div>
          </div>

          {/* Event Details */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Tanggal Event *</label>
              <input
                type="date"
                required
                value={formData.eventDate}
                onChange={(e) => setFormData({ ...formData, eventDate: e.target.value })}
                className="w-full px-3 py-2.5 sm:py-3 border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-background text-foreground touch-target"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Lokasi</label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full px-3 py-2.5 sm:py-3 border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-background text-foreground touch-target"
                placeholder="Jakarta / Outdoor / Studio"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Catatan Tambahan</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2.5 sm:py-3 border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-background text-foreground touch-target"
              placeholder="Permintaan khusus, theme, konsep foto, dll."
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 sm:py-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg transition disabled:opacity-50 touch-target"
          >
            {submitting ? 'Mengirim...' : 'Kirim Booking'}
          </button>
        </form>
      </div>
    </div>
  );
}