'use client';

import { useState, useEffect } from 'react';

type Package = {
  id: string;
  nama: string;
  description: string | null;
  price: number;
  duration: number | null;
  fitur: string[];
  maxSelection: number;
  maxDownload: number;
  isActive: boolean;
  createdAt: string;
};

export default function PackagesPage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPackage, setEditingPackage] = useState<Package | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [formData, setFormData] = useState({
    nama: '',
    description: '',
    price: '',
    duration: '',
    fitur: '',
    maxSelection: '20',
    maxDownload: '0',
    isActive: true,
  });

  useEffect(() => {
    fetchPackages();
  }, []);

  const fetchPackages = async () => {
    try {
      const res = await fetch('/api/admin/packages');
      if (!res.ok) {
        console.error('Failed to fetch packages:', res.status);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setPackages(data.packages || []);
    } catch (error) {
      console.error('Error fetching packages:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      nama: '',
      description: '',
      price: '',
      duration: '',
      fitur: '',
      maxSelection: '20',
      maxDownload: '0',
      isActive: true,
    });
    setEditingPackage(null);
  };

  const openEdit = (pkg: Package) => {
    setEditingPackage(pkg);
    setFormData({
      nama: pkg.nama,
      description: pkg.description || '',
      price: pkg.price.toString(),
      duration: pkg.duration?.toString() || '',
      fitur: pkg.fitur.join(', '),
      maxSelection: pkg.maxSelection.toString(),
      maxDownload: pkg.maxDownload.toString(),
      isActive: pkg.isActive,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const payload = {
      nama: formData.nama,
      description: formData.description || null,
      price: parseInt(formData.price),
      duration: formData.duration ? parseInt(formData.duration) : null,
      fitur: formData.fitur ? formData.fitur.split(',').map(f => f.trim()).filter(Boolean) : [],
      maxSelection: parseInt(formData.maxSelection) || 20,
      maxDownload: parseInt(formData.maxDownload) || 0,
      isActive: formData.isActive,
    };

    try {
      const url = editingPackage
        ? `/api/admin/packages?id=${editingPackage.id}`
        : '/api/admin/packages';
      const method = editingPackage ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        if (editingPackage) {
          setPackages(packages.map(p => p.id === editingPackage.id ? data.package : p));
        } else {
          setPackages([data.package, ...packages]);
        }
        setShowModal(false);
        resetForm();
      }
    } catch (error) {
      console.error('Error saving package:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus paket ini?')) return;

    try {
      await fetch(`/api/admin/packages?id=${id}`, { method: 'DELETE' });
      setPackages(packages.filter(p => p.id !== id));
    } catch (error) {
      console.error('Error deleting package:', error);
    }
  };

  const handleToggleActive = async (pkg: Package) => {
    try {
      const res = await fetch('/api/admin/packages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pkg.id, isActive: !pkg.isActive }),
      });
      if (res.ok) {
        setPackages(packages.map(p => p.id === pkg.id ? { ...p, isActive: !p.isActive } : p));
      }
    } catch (error) {
      console.error('Error toggling package:', error);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === packages.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(packages.map(p => p.id));
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Hapus ${selectedIds.length} paket ini?`)) return;

    try {
      await fetch('/api/admin/packages/bulk', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      });
      setPackages(packages.filter(p => !selectedIds.includes(p.id)));
      setSelectedIds([]);
      setShowBulkModal(false);
    } catch (error) {
      console.error('Error bulk deleting:', error);
    }
  };

  const handleBulkToggle = async () => {
    try {
      await fetch('/api/admin/packages/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds, toggleActive: true }),
      });
      setPackages(packages.map(p => 
        selectedIds.includes(p.id) ? { ...p, isActive: !p.isActive } : p
      ));
      setSelectedIds([]);
      setShowBulkModal(false);
    } catch (error) {
      console.error('Error bulk toggling:', error);
    }
  };

  const openBulkModal = () => setShowBulkModal(true);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-charcoal">Packages</h1>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="touch-target px-4 py-2.5 bg-champagne-500 hover:bg-champagne-600 text-white font-medium rounded-lg transition-smooth cursor-pointer flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          <span className="hidden sm:inline">Tambah Paket</span>
        </button>
      </div>

      {/* Floating Action Button for Mobile */}
      <button
        onClick={() => { resetForm(); setShowModal(true); }}
        className="fab bg-champagne-500 text-white sm:hidden"
        aria-label="Tambah Paket Baru"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {selectedIds.length > 0 && (
        <div className="glass-card mb-4 p-3 flex items-center justify-between">
          <span className="text-sm text-charcoal font-medium">
            {selectedIds.length} item dipilih
          </span>
          <div className="flex gap-2">
            <button onClick={handleBulkToggle} className="px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 cursor-pointer">
              Toggle Aktif
            </button>
            <button onClick={openBulkModal} className="px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 cursor-pointer">
              Hapus
            </button>
            <button onClick={() => setSelectedIds([])} className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 cursor-pointer">
              Batal
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="glass-card p-4 space-y-3">
              <div className="skeleton skeleton-title"></div>
              <div className="skeleton skeleton-text"></div>
              <div className="skeleton skeleton-text" style={{ width: '40%' }}></div>
              <div className="skeleton skeleton-button"></div>
            </div>
          ))}
        </div>
      ) : packages.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <div className="w-16 h-16 rounded-xl bg-champagne-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-champagne-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-charcoal mb-2">Belum ada paket</h3>
          <p className="text-warm-gray mb-4">Tambah paket fotografi pertama Anda</p>
          <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-champagne-500 text-white rounded-lg hover:bg-champagne-600 cursor-pointer">
            + Tambah Paket
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {packages.map((pkg) => (
            <div key={pkg.id} className={`glass-card p-6 glass-card-hover ${selectedIds.includes(pkg.id) ? 'ring-2 ring-champagne-500' : ''}`}>
              <div className="flex items-start gap-3 mb-3">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(pkg.id)}
                  onChange={() => toggleSelect(pkg.id)}
                  className="w-4 h-4 mt-1 rounded border-gray-300 text-champagne-500 focus:ring-champagne-500"
                />
                <div className="flex-1">
                  <div className="flex items-start justify-between">
                    <h3 className="font-semibold text-charcoal">{pkg.nama}</h3>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${pkg.isActive ? 'badge-gold bg-green-100/50 text-green-700' : 'badge-gold'}`}>
                      {pkg.isActive ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </div>
                </div>
              </div>
              {pkg.description && <p className="text-sm text-warm-gray mb-3">{pkg.description}</p>}
              <div className="text-2xl font-bold text-champagne-600 mb-2">
                Rp {pkg.price.toLocaleString('id-ID')}
              </div>
              <div className="text-xs text-light-gray mb-3 space-y-1">
                {pkg.duration && <div className="flex items-center gap-2"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> {pkg.duration} menit</div>}
                <div className="flex items-center gap-2"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.76-.9l.814-1.74A2 2 0 0111.52 4H17a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /></svg> Max Seleksi: {pkg.maxSelection}</div>
                {pkg.maxDownload > 0 && <div className="flex items-center gap-2"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg> Max Download: {pkg.maxDownload}</div>}
              </div>
              {pkg.fitur.length > 0 && (
                <ul className="text-sm text-warm-gray space-y-1 mb-4">
                  {pkg.fitur.map((f, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-champagne-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> {f}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2 pt-3 border-t border-champagne-100">
                <button onClick={() => openEdit(pkg)} className="flex-1 text-sm text-blue-600 hover:underline py-2 cursor-pointer">Edit</button>
                <button onClick={() => handleToggleActive(pkg)} className="flex-1 text-sm text-gray-500 hover:underline py-2">
                  {pkg.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                </button>
                <button onClick={() => handleDelete(pkg.id)} className="flex-1 text-sm text-red-600 hover:underline py-2">Hapus</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Package Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editingPackage ? 'Edit Paket' : 'Tambah Paket Baru'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Paket *</label>
                <input
                  type="text"
                  required
                  value={formData.nama}
                  onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Harga (Rp) *</label>
                  <input
                    type="number"
                    required
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Durasi (menit)</label>
                  <input
                    type="number"
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Seleksi Foto</label>
                  <input
                    type="number"
                    value={formData.maxSelection}
                    onChange={(e) => setFormData({ ...formData, maxSelection: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Download</label>
                  <input
                    type="number"
                    value={formData.maxDownload}
                    onChange={(e) => setFormData({ ...formData, maxDownload: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fitur (pisahkan dengan koma)</label>
                <input
                  type="text"
                  value={formData.fitur}
                  onChange={(e) => setFormData({ ...formData, fitur: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <label htmlFor="isActive" className="text-sm text-gray-700">Paket Aktif</label>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); resetForm(); }}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
                >
                  {submitting ? 'Menyimpan...' : editingPackage ? 'Simpan' : 'Tambah'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Action Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Hapus Massal</h2>
            <p className="text-gray-600 mb-4">
              Yakin hapus {selectedIds.length} paket ini? Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowBulkModal(false)} 
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Batal
              </button>
              <button 
                onClick={handleBulkDelete} 
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}