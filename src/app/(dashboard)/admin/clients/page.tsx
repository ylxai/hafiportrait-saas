'use client';

import { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { createAvatar } from '@dicebear/core';
import { initials } from '@dicebear/collection';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, User } from 'lucide-react';

type Client = {
  id: string;
  nama: string;
  email: string;
  phone: string | null;
  instagram: string | null;
  storageQuotaGB: number;
  createdAt: string;
  updatedAt: string;
};

const ClientAvatar = ({ name }: { name: string }) => {
  const avatar = useMemo(() => {
    return createAvatar(initials, {
      seed: name || 'User',
      backgroundColor: ['transparent'],
      textColor: ['ffffff'],
    }).toDataUri();
  }, [name]);

  return (
    <Image
      src={avatar}
      alt={name || 'User'}
      fill
      unoptimized={true}
      className="object-cover"
    />
  );
};

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [formData, setFormData] = useState({
    nama: '',
    email: '',
    phone: '',
    instagram: '',
    storageQuotaGB: 10,
  });

  const handleQuotaChange = (value: string) => {
    if (value === '') {
      setFormData({ ...formData, storageQuotaGB: 0 });
    } else {
      const parsed = parseInt(value);
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
    setFormData({ nama: '', email: '', phone: '', instagram: '', storageQuotaGB: 10 });
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
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const payload = {
      nama: formData.nama,
      email: formData.email,
      phone: formData.phone || null,
      instagram: formData.instagram || null,
      storageQuotaGB: formData.storageQuotaGB || 10,
    };

    try {
      const url = editingClient
        ? `/api/admin/clients?id=${editingClient.id}`
        : '/api/admin/clients';
      const method = editingClient ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const result = await res.json();
        const clientData = result.data?.client || result.client;
        if (editingClient && clientData?.id) {
          setClients(clients.map(c => c.id === editingClient.id ? clientData : c));
        } else if (clientData?.id) {
          setClients([clientData, ...clients]);
        } else {
          // If no client data, refresh the list
          fetchClients();
        }
        setShowModal(false);
        resetForm();
      }
    } catch (error) {
      console.error('Error saving client:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus client ini?')) return;

    try {
      await fetch(`/api/admin/clients?id=${id}`, { method: 'DELETE' });
      setClients(clients.filter(c => c.id !== id));
    } catch (error) {
      console.error('Error deleting client:', error);
    }
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

  const handleBulkDelete = async () => {
    if (!confirm(`Hapus ${selectedIds.length} client ini?`)) return;

    try {
      await fetch('/api/admin/clients/bulk', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      });
      setClients(clients.filter(c => !selectedIds.includes(c.id)));
      setSelectedIds([]);
      setShowBulkModal(false);
    } catch (error) {
      console.error('Error bulk deleting:', error);
    }
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
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Quota</th>
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
                  <td className="px-4 py-4 text-muted-foreground text-sm font-medium">{client.storageQuotaGB || 10} GB</td>
                  <td className="px-4 py-4 text-muted-foreground text-sm">
                    {new Date(client.createdAt).toLocaleDateString('id-ID')}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(client)}>Edit</Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(client.id)} className="text-red-600">Hapus</Button>
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
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Menyimpan...' : editingClient ? 'Simpan' : 'Tambah'}
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