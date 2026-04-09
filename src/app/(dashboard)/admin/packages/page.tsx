'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Plus, Package } from 'lucide-react';

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
        const result = await res.json();
        const packageData = result.data?.package || result.package;
        if (editingPackage && packageData) {
          setPackages(packages.map(p => p.id === editingPackage.id ? packageData : p));
        } else if (packageData) {
          setPackages([packageData, ...packages]);
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
        <h1 className="text-2xl font-bold text-slate-800">Packages</h1>
        <Button onClick={() => { resetForm(); setShowModal(true); }}>
          <Plus className="w-5 h-5 mr-2" />
          <span className="hidden sm:inline">Tambah Paket</span>
        </Button>
      </div>

      {/* Floating Action Button for Mobile */}
      <Button
        onClick={() => { resetForm(); setShowModal(true); }}
        size="icon"
        className="fab bg-amber-500 text-white sm:hidden fixed bottom-6 right-6"
        aria-label="Tambah Paket Baru"
      >
        <Plus className="w-6 h-6" />
      </Button>

      {selectedIds.length > 0 && (
        <div className="glass-card mb-4 p-3 flex items-center justify-between">
          <span className="text-sm text-slate-800 font-medium">
            {selectedIds.length} item dipilih
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleBulkToggle}>
              Toggle Aktif
            </Button>
            <Button variant="destructive" size="sm" onClick={openBulkModal}>
              Hapus
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
              Batal
            </Button>
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
        <div className="glass-card p-16 text-center">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-100 to-amber-200 flex items-center justify-center mx-auto mb-6 shadow-inner">
            <Package className="w-10 h-10 text-amber-600" />
          </div>
          <h3 className="text-2xl font-bold text-slate-800 mb-3">Belum ada paket</h3>
          <p className="text-base text-slate-500 mb-8 max-w-sm mx-auto">Tambah paket fotografi pertama Anda untuk menawarkan layanan kepada klien.</p>
          <Button onClick={() => setShowModal(true)} size="lg">
            <Plus className="w-5 h-5 mr-2" />
            Tambah Paket
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {packages.filter(p => p && p.id).map((pkg) => (
            <div key={pkg.id} className={`glass-card p-6 glass-card-hover ${selectedIds.includes(pkg.id) ? 'ring-2 ring-champagne-500' : ''}`}>
              <div className="flex items-start gap-3 mb-3">
                <Checkbox
                  checked={selectedIds.includes(pkg.id)}
                  onCheckedChange={() => toggleSelect(pkg.id)}
                />
                <div className="flex-1">
                  <div className="flex items-start justify-between">
                    <h3 className="font-semibold text-slate-800">{pkg.nama}</h3>
                    <Badge variant={pkg.isActive ? 'default' : 'secondary'}>
                      {pkg.isActive ? 'Aktif' : 'Nonaktif'}
                    </Badge>
                  </div>
                </div>
              </div>
              {pkg.description && <p className="text-sm text-slate-500 mb-3">{pkg.description}</p>}
              <div className="text-2xl font-bold text-amber-600 mb-2">
                Rp {pkg.price.toLocaleString('id-ID')}
              </div>
              <div className="text-xs text-slate-400 mb-3 space-y-1">
                {pkg.duration && <div className="flex items-center gap-2"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> {pkg.duration} menit</div>}
                <div className="flex items-center gap-2"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.76-.9l.814-1.74A2 2 0 0111.52 4H17a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /></svg> Max Seleksi: {pkg.maxSelection}</div>
                {pkg.maxDownload > 0 && <div className="flex items-center gap-2"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg> Max Download: {pkg.maxDownload}</div>}
              </div>
              {pkg.fitur.length > 0 && (
                <ul className="text-sm text-slate-500 space-y-1 mb-4">
                  {pkg.fitur.map((f, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> {f}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2 pt-3 border-t border-champagne-100">
                <Button variant="ghost" size="sm" onClick={() => openEdit(pkg)} className="flex-1">Edit</Button>
                <Button variant="ghost" size="sm" onClick={() => handleToggleActive(pkg)} className="flex-1 text-slate-500">
                  {pkg.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(pkg.id)} className="flex-1 text-red-600">Hapus</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Package Modal */}
      <Dialog open={showModal} onOpenChange={(open) => { setShowModal(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPackage ? 'Edit Paket' : 'Tambah Paket Baru'}</DialogTitle>
            <DialogDescription>
              {editingPackage ? 'Ubah detail paket di bawah.' : 'Isi detail paket baru di bawah.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Nama Paket *</label>
              <Input
                required
                value={formData.nama}
                onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Deskripsi</label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Harga (Rp) *</label>
                <Input
                  type="number"
                  required
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Durasi (menit)</label>
                <Input
                  type="number"
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Max Seleksi Foto</label>
                <Input
                  type="number"
                  value={formData.maxSelection}
                  onChange={(e) => setFormData({ ...formData, maxSelection: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Max Download</label>
                <Input
                  type="number"
                  value={formData.maxDownload}
                  onChange={(e) => setFormData({ ...formData, maxDownload: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Fitur (pisahkan dengan koma)</label>
              <Input
                value={formData.fitur}
                onChange={(e) => setFormData({ ...formData, fitur: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
              />
              <label htmlFor="isActive" className="text-sm">Paket Aktif</label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setShowModal(false); resetForm(); }}>
                Batal
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Menyimpan...' : editingPackage ? 'Simpan' : 'Tambah'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk Action Modal */}
      <Dialog open={showBulkModal} onOpenChange={setShowBulkModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Hapus Massal</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Yakin hapus {selectedIds.length} paket ini? Tindakan ini tidak dapat dibatalkan.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkModal(false)}>
              Batal
            </Button>
            <Button variant="destructive" onClick={handleBulkDelete}>
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}