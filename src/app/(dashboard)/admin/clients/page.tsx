'use client';

import { useState, useEffect, useTransition } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, User, ShieldCheck, Clock } from 'lucide-react';
import {
  approveClient,
  createClient,
  deleteClient,
  deleteClientsBulk,
  updateClient,
} from '@/actions/clients';

type Client = {
  id: string;
  nama: string;
  email: string;
  phone: string | null;
  instagram: string | null;
  storageQuotaGB: number;
  // `isApproved=false` means the row was created via the public booking
  // form and the auth provider will reject login until an admin clicks
  // "Setujui" in the row's action column.
  isApproved: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: {
    events: number;
  };
  usedStorageBytes?: string;
  photoCount?: number;
};

const ClientAvatar = ({ name }: { name: string }) => {
  const initials = name
    ? name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  return (
    <div className="w-full h-full rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">
      {initials}
    </div>
  );
};

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  // `useTransition` keeps the UI responsive while the Server Action runs.
  // We surface `isPending` to the existing "Menyimpan…" / disabled-button
  // UX so the swap from `fetch`-based pending state is invisible.
  const [isPending, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [formData, setFormData] = useState({
    nama: '',
    email: '',
    phone: '',
    instagram: '',
    storageQuotaGB: 10,
    // Stored in admin form state only — never echoed back from the API.
    // Required at create time; left blank when editing means "keep current".
    password: '',
  });

  const handleQuotaChange = (value: string) => {
    if (value === '') {
      setFormData({ ...formData, storageQuotaGB: 0 });
    } else {
      const parsed = parseInt(value, 10);
      if (!isNaN(parsed)) {
        setFormData({ ...formData, storageQuotaGB: parsed });
      }
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const res = await fetch('/api/admin/clients');
      const data = await res.json();
      setClients(data.data?.clients || data.clients || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({ nama: '', email: '', phone: '', instagram: '', storageQuotaGB: 10, password: '' });
    setEditingClient(null);
  };

  const openEdit = (client: Client) => {
    setEditingClient(client);
    setFormData({
      nama: client.nama,
      email: client.email,
      phone: client.phone || '',
      instagram: client.instagram || '',
      storageQuotaGB: client.storageQuotaGB || 10,
      password: '',
    });
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Build the payload the Server Action's Zod schema expects. The
    // `password` field is only forwarded when non-empty so an edit
    // submit doesn't clobber the existing bcrypt hash with `null`.
    type ClientPayload = {
      nama: string;
      email: string;
      phone: string | null;
      instagram: string | null;
      storageQuotaGB: number;
      password?: string;
    };
    const payload: ClientPayload = {
      nama: formData.nama,
      email: formData.email,
      phone: formData.phone || null,
      instagram: formData.instagram || null,
      storageQuotaGB: formData.storageQuotaGB || 10,
    };
    if (formData.password) {
      payload.password = formData.password;
    }

    // `startTransition` guarantees React batches the resulting state
    // updates and surfaces `isPending=true` until the action resolves —
    // so the modal's "Menyimpan…" button stays disabled without us
    // having to track that flag manually.
    startTransition(async () => {
      const result = editingClient
        ? await updateClient({ id: editingClient.id, ...payload })
        : await createClient(payload);

      if (!result.success) {
        // Surface the specific server-side error (e.g. "Email sudah
        // terdaftar", "Password minimal 8 karakter") instead of a
        // generic banner. AGENTS.md prohibits `alert()`.
        toast.error(result.error || 'Gagal menyimpan client');
        return;
      }

      const clientData = result.data.client;
      if (editingClient) {
        setClients((prev) =>
          prev.map((c) => (c.id === editingClient.id ? { ...c, ...clientData } : c)),
        );
      } else {
        setClients((prev) => [clientData, ...prev]);
      }
      setShowModal(false);
      resetForm();
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm('Hapus client ini?')) return;

    startTransition(async () => {
      const result = await deleteClient(id);
      if (!result.success) {
        toast.error(result.error || 'Gagal menghapus client');
        return;
      }
      // Functional updater avoids the stale-closure trap when multiple
      // deletes are dispatched in flight at once (cf. PR #67 review).
      setClients((prev) => prev.filter((c) => c.id !== id));
    });
  };

  // Flip a booking-created client's `isApproved` flag to `true` so they
  // can sign in to the portal. Uses the dedicated `approveClient`
  // Server Action which is just a typed wrapper around
  // `prisma.client.update({ data: { isApproved: true } })`.
  const handleApprove = (id: string) => {
    startTransition(async () => {
      const result = await approveClient(id);
      if (!result.success) {
        toast.error(result.error || 'Gagal menyetujui client');
        return;
      }
      // Optimistically flip the row so the badge updates and the
      // "Setujui" button disappears without a full refetch.
      setClients((prev) =>
        prev.map((c) => (c.id === id ? { ...c, isApproved: true } : c)),
      );
      toast.success('Client disetujui dan dapat login portal');
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === clients.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(clients.map(c => c.id));
    }
  };

  const handleBulkDelete = () => {
    if (!confirm(`Hapus ${selectedIds.length} client ini?`)) return;

    startTransition(async () => {
      const result = await deleteClientsBulk(selectedIds);
      if (!result.success) {
        toast.error(result.error || 'Gagal menghapus client');
        return;
      }
      // Snapshot the IDs before clearing them so the filter below uses
      // a stable list even if `selectedIds` is mutated mid-transition.
      const removed = new Set(selectedIds);
      setClients((prev) => prev.filter((c) => !removed.has(c.id)));
      setSelectedIds([]);
      setShowBulkModal(false);
    });
  };

  const openBulkModal = () => setShowBulkModal(true);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Clients</h1>
        <Button onClick={() => { resetForm(); setShowModal(true); }}>
          <Plus className="w-5 h-5 mr-2" />
          <span className="hidden sm:inline">Tambah Client</span>
        </Button>
      </div>

      {/* Floating Action Button for Mobile */}
      <Button
        onClick={() => { resetForm(); setShowModal(true); }}
        size="icon"
        className="fab bg-primary text-primary-foreground sm:hidden fixed bottom-6 right-6"
        aria-label="Tambah Client Baru"
      >
        <Plus className="w-6 h-6" />
      </Button>

      {selectedIds.length > 0 && (
        <div className="glass-card mb-4 p-3 flex items-center justify-between">
          <span className="text-sm text-foreground font-medium">
            {selectedIds.length} item dipilih
          </span>
          <div className="flex gap-2">
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
        <div className="glass-card p-4 space-y-3">
          <div className="skeleton skeleton-title"></div>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton skeleton-table-row"></div>
          ))}
        </div>
      ) : clients.length === 0 ? (
        <div className="glass-card p-16 text-center">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6 shadow-inner">
            <User className="w-10 h-10 text-primary" />
          </div>
          <h3 className="text-2xl font-bold text-foreground mb-3">Belum ada client</h3>
          <p className="text-base text-muted-foreground mb-8 max-w-sm mx-auto">Tambah client pertama Anda untuk memulai mengelola data klien dengan mudah.</p>
          <Button onClick={() => setShowModal(true)} size="lg">
            <Plus className="w-5 h-5 mr-2" />
            Tambah Client
          </Button>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="table-mobile-scroll">
            <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left">
                  <Checkbox
                    checked={selectedIds.length === clients.length && clients.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Nama</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Instagram</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Storage</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Dibuat</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {clients.filter(c => c && c.id).map((client) => (
                <tr key={client.id} className={`hover:bg-muted/30 transition-smooth ${selectedIds.includes(client.id) ? 'bg-muted' : ''}`}>
                  <td className="px-4 py-4">
                    <Checkbox
                      checked={selectedIds.includes(client.id)}
                      onCheckedChange={() => toggleSelect(client.id)}
                    />
                  </td>
                  <td className="px-4 py-4 text-foreground font-medium">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-muted shrink-0 relative">
                        <ClientAvatar name={client.nama} />
                      </div>
                      <span>{client.nama}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-muted-foreground">{client.email}</td>
                  <td className="px-4 py-4 text-muted-foreground">{client.phone || '-'}</td>
                  <td className="px-4 py-4 text-muted-foreground">{client.instagram || '-'}</td>
                  <td className="px-4 py-4">
                    {client.usedStorageBytes !== undefined ? (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            {(Number(client.usedStorageBytes) / 1073741824).toFixed(2)} GB / {client.storageQuotaGB} GB
                          </span>
                          <span className="text-muted-foreground font-medium">
                            {Math.round((Number(client.usedStorageBytes) / (client.storageQuotaGB * 1073741824)) * 100)}%
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${
                              (Number(client.usedStorageBytes) / (client.storageQuotaGB * 1073741824)) >= 0.95
                                ? 'bg-destructive'
                                : (Number(client.usedStorageBytes) / (client.storageQuotaGB * 1073741824)) >= 0.8
                                ? 'bg-warning'
                                : 'bg-primary'
                            }`}
                            style={{
                              width: `${Math.min(100, (Number(client.usedStorageBytes) / (client.storageQuotaGB * 1073741824)) * 100)}%`
                            }}
                          />
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {client.photoCount || 0} photos
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">{client.storageQuotaGB} GB</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    {client.isApproved ? (
                      <span className="inline-flex items-center gap-1 text-xs text-success">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Aktif
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-warning">
                        <Clock className="w-3.5 h-3.5" />
                        Menunggu persetujuan
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-muted-foreground text-sm">
                    {new Date(client.createdAt).toLocaleDateString('id-ID')}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex gap-2 justify-end">
                      {!client.isApproved && (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleApprove(client.id)}
                        >
                          Setujui
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => openEdit(client)}>Edit</Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(client.id)} className="text-destructive">Hapus</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Add/Edit Client Modal */}
      <Dialog open={showModal} onOpenChange={(open) => { setShowModal(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingClient ? 'Edit Client' : 'Tambah Client Baru'}</DialogTitle>
            <DialogDescription>
              {editingClient ? 'Ubah detail client di bawah.' : 'Isi detail client baru di bawah.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Nama Lengkap *</label>
              <Input
                required
                value={formData.nama}
                onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email *</label>
              <Input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Password {editingClient ? '' : '*'}
              </label>
              <Input
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={72}
                required={!editingClient}
                placeholder={editingClient ? 'Kosongkan jika tidak diubah' : 'Minimal 8 karakter'}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Dipakai client untuk login ke portal & galeri. {editingClient ? 'Kosongkan untuk mempertahankan password yang sekarang.' : 'Wajib diisi minimal 8 karakter.'}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone</label>
              <Input
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Instagram</label>
              <Input
                value={formData.instagram}
                onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Storage Quota (GB)</label>
              <Input
                type="number"
                min={1}
                max={1000}
                value={formData.storageQuotaGB === 0 ? '' : formData.storageQuotaGB}
                onChange={(e) => handleQuotaChange(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">Default: 10 GB. Maksimal 1000 GB.</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setShowModal(false); resetForm(); }}>
                Batal
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Menyimpan...' : editingClient ? 'Simpan' : 'Tambah'}
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
            Yakin hapus {selectedIds.length} client ini? Tindakan ini tidak dapat dibatalkan.
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