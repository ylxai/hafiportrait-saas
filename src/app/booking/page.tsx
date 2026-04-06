'use client';

import { useState, useCallback } from 'react';
import useSWR from 'swr';

type Package = {
  id: string;
  nama: string;
  description: string;
  price: number;
  duration: number;
  fitur: string[];
};

type PackagesResponse = { packages: Package[] };

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function BookingPage() {
  const { data, isLoading } = useSWR<PackagesResponse>('/api/public/booking/packages', fetcher, {
    revalidateOnFocus: false,
  });
  
  const packages = data?.packages ?? [];
  
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
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

  const handleInputChange = useCallback((field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const res = await fetch('/api/public/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setSubmitted(true);
      } else {
        alert('Terjadi kesalahan. Silakan coba lagi.');
      }
    } catch {
      alert('Terjadi kesalahan. Silakan coba lagi.');
    } finally {
      setSubmitting(false);
    }
  }, [formData]);

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">✓</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Booking Diterima!</h1>
          <p className="text-gray-600 mb-6">Terima kasih telah melakukan booking. Kami akan menghubungi Anda segera.</p>
            <button 
              onClick={() => window.location.reload()} 
              aria-label="Booking lagi"
              className="px-6 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600"
            >
            Booking Lagi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Booking Session</h1>
          <p className="text-gray-600">Isi form di bawah untuk melakukan booking sesi foto</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 space-y-6">
          {/* Package Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Pilih Paket</label>
            {isLoading ? (
              <div className="animate-pulse h-24 bg-gray-100 rounded-lg"></div>
            ) : packages.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {packages.map((pkg) => (
                  <label
                    key={pkg.id}
                    className={`block p-4 border-2 rounded-lg cursor-pointer transition ${
                      formData.packageId === pkg.id
                        ? 'border-amber-500 bg-amber-50'
                        : 'border-gray-200 hover:border-amber-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="packageId"
                      value={pkg.id}
                      onChange={(e) => setFormData({ ...formData, packageId: e.target.value })}
                      className="sr-only"
                    />
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-semibold text-gray-900">{pkg.nama}</span>
                      <span className="text-amber-600 font-bold">Rp {pkg.price.toLocaleString('id-ID')}</span>
                    </div>
                    {pkg.description && <p className="text-sm text-gray-500 mb-2">{pkg.description}</p>}
                    {pkg.duration && <p className="text-xs text-gray-400">{pkg.duration} menit</p>}
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">Tidak ada paket tersedia</p>
            )}
          </div>

          {/* Personal Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap *</label>
              <input
                type="text"
                required
                autoComplete="name"
                value={formData.nama}
                onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                placeholder="Nama lengkap Anda…"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                placeholder="email@example.com…"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nomor WhatsApp *</label>
              <input
                type="tel"
                required
                autoComplete="tel"
                inputMode="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                placeholder="0812 3456 7890…"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Instagram</label>
              <input
                type="text"
                value={formData.instagram}
                onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                placeholder="@username"
              />
            </div>
          </div>

          {/* Event Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal Event *</label>
              <input
                type="date"
                required
                value={formData.eventDate}
                onChange={(e) => setFormData({ ...formData, eventDate: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lokasi</label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                placeholder="Jakarta / Outdoor / Studio"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Catatan Tambahan</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              placeholder="Permintaan khusus, theme, konsep foto, dll."
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg transition disabled:opacity-50"
          >
            {submitting ? 'Mengirim...' : 'Kirim Booking'}
          </button>
        </form>
      </div>
    </div>
  );
}