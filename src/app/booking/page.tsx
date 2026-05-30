'use client';

import { useState, useCallback } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

type Package = {
  id: string;
  nama: string;
  description: string;
  price: number;
  duration: number;
  fitur: string[];
};

type PackagesResponse = { success: boolean; data: { packages: Package[] } };

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function BookingPage() {
  const router = useRouter();
  const { data, isLoading } = useSWR<PackagesResponse>('/api/public/booking/packages', fetcher, {
    revalidateOnFocus: false,
  });

  const packages = data?.data?.packages ?? [];

  const [submitting, setSubmitting] = useState(false);
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [formData, setFormData] = useState({
    nama: '',
    email: '',
    password: '',
    phone: '',
    instagram: '',
    packageId: '',
    eventDate: '',
    location: '',
    notes: '',
  });

  const handlePackageSelect = (packageId: string) => {
    setFormData({ ...formData, packageId });
    setShowPackageModal(false);
  };

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const res = await fetch('/api/public/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const result: {
        data?: { kodeBooking?: string };
        error?: string;
      } = await res.json();

      if (res.ok && result.data?.kodeBooking) {
        router.push(`/booking/invoice/${result.data.kodeBooking}`);
      } else {
        toast.error(result.error || 'Terjadi kesalahan. Silakan coba lagi.');
      }
    } catch {
      toast.error('Terjadi kesalahan. Silakan coba lagi.');
    } finally {
      setSubmitting(false);
    }
  }, [formData, router]);

  const formatCurrency = (price: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(price);

  const selectedPackage = packages.find(p => p.id === formData.packageId);

  return (
    <div className="min-h-screen bg-background py-6 px-3">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-foreground mb-1">Booking Session</h1>
          <p className="text-muted-foreground text-sm">Isi form di bawah untuk booking sesi foto</p>
        </div>

        <form onSubmit={(e) => { void handleSubmit(e); }} className="bg-card text-foreground rounded-xl shadow-sm border border-border p-4 sm:p-6 space-y-6">

          {/* Section 1: Package Selection */}
          <fieldset>
            <legend className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">1</span>
              Pilih Paket
            </legend>
            <button
              type="button"
              onClick={() => setShowPackageModal(true)}
              className={`w-full p-4 border-2 rounded-lg text-left transition flex items-center justify-between ${
                formData.packageId
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              {formData.packageId ? (
                <div className="flex items-center gap-3">
                  <CheckCircle className="size-5 text-primary shrink-0" />
                  <div>
                    <p className="font-semibold text-foreground">{selectedPackage?.nama}</p>
                    <p className="text-sm text-primary font-bold">{selectedPackage ? formatCurrency(selectedPackage.price) : ''}</p>
                  </div>
                </div>
              ) : (
                <span className="text-muted-foreground">Tap untuk memilih paket...</span>
              )}
              <ChevronRight className="size-5 text-muted-foreground shrink-0" />
            </button>
          </fieldset>

          {/* Section 2: Personal Info */}
          <fieldset>
            <legend className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">2</span>
              Data Diri
            </legend>
            <div className="space-y-4">
              <div>
                <label htmlFor="nama" className="block text-sm font-medium text-foreground mb-1.5">Nama Lengkap *</label>
                <input
                  id="nama"
                  type="text"
                  required
                  autoComplete="name"
                  value={formData.nama}
                  onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
                  className="w-full px-3 py-2.5 sm:py-3 border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-background text-foreground"
                  placeholder="Nama lengkap Anda…"
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">Email *</label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2.5 sm:py-3 border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-background text-foreground"
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1.5">Password *</label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  maxLength={72}
                  autoComplete="new-password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2.5 sm:py-3 border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-background text-foreground"
                  placeholder="Minimal 8 karakter"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Untuk login melihat galeri setelah disetujui admin.
                </p>
              </div>
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-foreground mb-1.5">Nomor WhatsApp *</label>
                <input
                  id="phone"
                  type="tel"
                  required
                  autoComplete="tel"
                  inputMode="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2.5 sm:py-3 border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-background text-foreground"
                  placeholder="0812 3456 7890"
                />
              </div>
              <div>
                <label htmlFor="instagram" className="block text-sm font-medium text-foreground mb-1.5">Instagram</label>
                <input
                  id="instagram"
                  type="text"
                  value={formData.instagram}
                  onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
                  className="w-full px-3 py-2.5 sm:py-3 border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-background text-foreground"
                  placeholder="@username"
                />
              </div>
            </div>
          </fieldset>

          {/* Section 3: Event Details */}
          <fieldset>
            <legend className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">3</span>
              Detail Event
            </legend>
            <div className="space-y-4">
              <div>
                <label htmlFor="eventDate" className="block text-sm font-medium text-foreground mb-1.5">Tanggal Event *</label>
                <input
                  id="eventDate"
                  type="date"
                  required
                  value={formData.eventDate}
                  onChange={(e) => setFormData({ ...formData, eventDate: e.target.value })}
                  className="w-full px-3 py-2.5 sm:py-3 border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-background text-foreground"
                />
              </div>
              <div>
                <label htmlFor="location" className="block text-sm font-medium text-foreground mb-1.5">Lokasi</label>
                <input
                  id="location"
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="w-full px-3 py-2.5 sm:py-3 border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-background text-foreground"
                  placeholder="Jakarta / Outdoor / Studio"
                />
              </div>
              <div>
                <label htmlFor="notes" className="block text-sm font-medium text-foreground mb-1.5">Catatan Tambahan</label>
                <textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2.5 sm:py-3 border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-background text-foreground"
                  placeholder="Permintaan khusus, theme, konsep foto, dll."
                />
              </div>
            </div>
          </fieldset>

          {/* Submit - sticky on mobile */}
          <div className="sticky bottom-0 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 px-4 sm:px-6 py-4 bg-card border-t border-border rounded-b-xl">
            <button
              type="submit"
              disabled={submitting || !formData.packageId}
              className="w-full py-3 sm:py-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg transition disabled:opacity-50"
            >
              {submitting ? 'Mengirim...' : 'Kirim Booking'}
            </button>
          </div>
        </form>

        {/* Package Selection Modal */}
        <Dialog open={showPackageModal} onOpenChange={setShowPackageModal}>
          <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Pilih Paket</DialogTitle>
              <DialogDescription>Pilih paket yang sesuai kebutuhan Anda</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              {isLoading ? (
                <div className="animate-pulse h-24 bg-muted rounded-lg" />
              ) : packages.length > 0 ? (
                packages.map((pkg) => (
                  <button
                    key={pkg.id}
                    type="button"
                    onClick={() => handlePackageSelect(pkg.id)}
                    className={`w-full text-left p-4 border-2 rounded-lg transition ${
                      formData.packageId === pkg.id
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-start gap-3">
                        {formData.packageId === pkg.id && (
                          <CheckCircle className="size-5 text-primary shrink-0 mt-0.5" />
                        )}
                        <div>
                          <p className="font-semibold text-foreground">{pkg.nama}</p>
                          {pkg.description && <p className="text-sm text-muted-foreground mt-0.5">{pkg.description}</p>}
                          {pkg.duration && <p className="text-xs text-muted-foreground mt-0.5">{pkg.duration} menit</p>}
                        </div>
                      </div>
                      <span className="text-primary font-bold text-sm shrink-0 ml-2">{formatCurrency(pkg.price)}</span>
                    </div>
                    {pkg.fitur && pkg.fitur.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-1.5 pl-8">
                        {pkg.fitur.map((f, i) => (
                          <li key={i} className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                            {f}
                          </li>
                        ))}
                      </ul>
                    )}
                  </button>
                ))
              ) : (
                <p className="text-muted-foreground text-sm text-center py-4">Tidak ada paket tersedia</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
