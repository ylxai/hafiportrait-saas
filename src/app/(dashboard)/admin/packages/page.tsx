'use client';

import { useState, useEffect, useTransition } from 'react';
import { toast } from 'sonner';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Plus, Package } from 'lucide-react';
import {
  createPackage,
  deletePackage,
  deletePackagesBulk,
  toggleActivePackagesBulk,
  updatePackage,
} from '@/actions/packages';

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
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [showModal, setShowModal] = useState(false);
  const [editingPackage, setEditingPackage] = useState<Package | null>(null);
  // `useTransition` powers the disabled state on the dialog footer's
  // submit button — see equivalent comment in admin/clients/page.tsx.
  const [isPending, startTransition] = useTransition();
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

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

    startTransition(async () => {
      const result = editingPackage
        ? await updatePackage({ id: editingPackage.id, ...payload })
        : await createPackage(payload);

      if (!result.success) {
        toast.error(result.error || 'Gagal menyimpan paket');
        return;
      }

      const pkg = result.data.package;
      if (editingPackage) {
        setPackages((prev) => prev.map((p) => (p.id === editingPackage.id ? pkg : p)));
      } else {
        setPackages((prev) => [pkg, ...prev]);
      }
      setShowModal(false);
      resetForm();
    });
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({ description: 'Hapus paket ini?', variant: 'destructive', confirmLabel: 'Hapus' });
    if (!ok) return;

    startTransition(async () => {
      const result = await deletePackage(id);
      if (!result.success) {
        toast.error(result.error || 'Gagal menghapus paket');
        return;
      }
      setPackages((prev) => prev.filter((p) => p.id !== id));
    });
  };

  // Single-package toggle uses `updatePackage` rather than the bulk
  // helper because the latter resolves "toggle" against the *current*
  // server state — fine for multi-select, but for a single-row click
  // the user expects the inverse of the row's currently-rendered
  // `isActive` value, regardless of any concurrent edits.
  //
  // Review #74-2 (CodeAnt): the previous version mirrored the local
  // optimistic state by negating `p.isActive` after the action
  // resolved. That re-derives the value the client *thought* was
  // current, not what the server actually applied — a fast double-tap
  // (or any concurrent edit) would leave the row's UI lagging the DB.
  // We now use the package returned by the action, which is the
  // authoritative post-write snapshot.
  const handleToggleActive = (pkg: Package) => {
    startTransition(async () => {
      const result = await updatePackage({ id: pkg.id, isActive: !pkg.isActive });
      if (!result.success) {
        toast.error(result.error || 'Gagal mengubah status paket');
        return;
      }
      const updated = result.data.package;
      setPackages((prev) =>
        prev.map((p) => (p.id === pkg.id ? updated : p)),
      );
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };


  const handleBulkDelete = async () => {
    const ok = await confirm({ description: `Hapus ${selectedIds.length} paket ini?`, variant: 'destructive', confirmLabel: 'Hapus' });
    if (!ok) return;

    startTransition(async () => {
      const result = await deletePackagesBulk(selectedIds);
      if (!result.success) {
        toast.error(result.error || 'Gagal menghapus paket');
        return;
      }
      const removed = new Set(selectedIds);
      setPackages((prev) => prev.filter((p) => !removed.has(p.id)));
      setSelectedIds([]);
      setShowBulkModal(false);
    });
  };

  const handleBulkToggle = () => {
    startTransition(async () => {
      const result = await toggleActivePackagesBulk(selectedIds);
      if (!result.success) {
        toast.error(result.error || 'Gagal mengubah status paket');
        return;
      }
      // The Server Action returns the new `isActive` it applied (so
      // both clients agree on the outcome of "toggle" even when two
      // admins click simultaneously). Apply that value to every
      // selected row instead of locally negating each `p.isActive`.
      const targetActive = result.data.isActive;
      const targets = new Set(selectedIds);
      setPackages((prev) =>
        prev.map((p) => (targets.has(p.id) ? { ...p, isActive: targetActive } : p)),
      );
      setSelectedIds([]);
      setShowBulkModal(false);
    });
  };

  const openBulkModal = () => setShowBulkModal(true);

  return (
    <>
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Packages</h1>
        <Button onClick={() => { resetForm(); setShowModal(true); }}>
          <Plus className="w-5 h-5 mr-2" />
          <span className="hidden sm:inline">Tambah Paket</span>
        </Button>
      </div>

      {/* Floating Action Button for Mobile */}
      <Button
        onClick={() => { resetForm(); setShowModal(true); }}
        size="icon"
        className="fab bg-primary text-primary-foreground sm:hidden fixed bottom-6 right-6"
        aria-label="Tambah Paket Baru"
      >
        <Plus className="w-6 h-6" />
      </Button>

      {selectedIds.length > 0 && (
        <div className="glass-card mb-4 p-3 flex items-center justify-between">
          <span className="text-sm text-foreground font-medium">
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
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/20 flex items-center justify-center mx-auto mb-6 shadow-inner">
            <Package className="w-10 h-10 text-primary" />
          </div>
          <h3 className="text-2xl font-bold text-foreground mb-3">Belum ada paket</h3>
          <p className="text-base text-muted-foreground mb-8 max-w-sm mx-auto">Tambah paket fotografi pertama Anda untuk menawarkan layanan kepada klien.</p>
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
                    <h3 className="font-semibold text-foreground">{pkg.nama}</h3>
                    <Badge variant={pkg.isActive ? 'default' : 'secondary'}>
                      {pkg.isActive ? 'Aktif' : 'Nonaktif'}
                    </Badge>
                  </div>
                </div>
              </div>
              {pkg.description && <p className="text-sm text-muted-foreground mb-3">{pkg.description}</p>}
              <div className="text-2xl font-bold text-primary mb-2">
                Rp {pkg.price.toLocaleString('id-ID')}
              </div>
              <div className="text-xs text-muted-foreground mb-3 space-y-1">
                {pkg.duration && <div className="flex items-center gap-2"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> {pkg.duration} menit</div>}
                <div className="flex items-center gap-2"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.76-.9l.814-1.74A2 2 0 0111.52 4H17a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /></svg> Max Seleksi: {pkg.maxSelection}</div>
                {pkg.maxDownload > 0 && <div className="flex items-center gap-2"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg> Max Download: {pkg.maxDownload}</div>}
              </div>
              {pkg.fitur.length > 0 && (
                <ul className="text-sm text-muted-foreground space-y-1 mb-4">
                  {pkg.fitur.map((f, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> {f}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2 pt-3 border-t border-border">
                <Button variant="ghost" size="sm" onClick={() => openEdit(pkg)} className="flex-1">Edit</Button>
                <Button variant="ghost" size="sm" onClick={() => handleToggleActive(pkg)} className="flex-1 text-muted-foreground">
                  {pkg.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(pkg.id)} className="flex-1 text-destructive">Hapus</Button>
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
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Menyimpan...' : editingPackage ? 'Simpan' : 'Tambah'}
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
    <ConfirmDialog />
    </>
  );
}