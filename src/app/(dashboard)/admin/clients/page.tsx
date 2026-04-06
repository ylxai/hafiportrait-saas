'use client';

import { useState, useEffect } from 'react';

type Client = {
  id: string;
  nama: string;
  email: string;
  phone: string | null;
  instagram: string | null;
  createdAt: string;
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
  });

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const res = await fetch('/api/admin/clients');
      const data = await res.json();
      setClients(data.clients || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({ nama: '', email: '', phone: '', instagram: '' });
    setEditingClient(null);
  };

  const openEdit = (client: Client) => {
    setEditingClient(client);
    setFormData({
      nama: client.nama,
      email: client.email,
      phone: client.phone || '',
      instagram: client.instagram || '',
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
        const data = await res.json();
        if (editingClient) {
          setClients(clients.map(c => c.id === editingClient.id ? data.client : c));
        } else {
          setClients([data.client, ...clients]);
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
        <h1 className="text-2xl font-bold text-charcoal">Clients</h1>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="touch-target px-4 py-2.5 bg-champagne-500 hover:bg-champagne-600 text-white font-medium rounded-lg transition-smooth cursor-pointer flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          <span className="hidden sm:inline">Tambah Client</span>
        </button>
      </div>

      {/* Floating Action Button for Mobile */}
      <button
        onClick={() => { resetForm(); setShowModal(true); }}
        className="fab bg-champagne-500 text-white sm:hidden"
        aria-label="Tambah Client Baru"
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
        <div className="glass-card p-4 space-y-3">
          <div className="skeleton skeleton-title"></div>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton skeleton-table-row"></div>
          ))}
        </div>
      ) : clients.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <div className="w-16 h-16 rounded-xl bg-champagne-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-champagne-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-charcoal mb-2">Belum ada client</h3>
          <p className="text-warm-gray mb-4">Tambah client pertama Anda</p>
          <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-champagne-500 text-white rounded-lg hover:bg-champagne-600 cursor-pointer">
            + Tambah Client
          </button>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="table-mobile-scroll">
            <table className="w-full">
            <thead className="bg-champagne-50/50 border-b border-champagne-100">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === clients.length && clients.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 text-champagne-500 focus:ring-champagne-500"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-warm-gray uppercase">Nama</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-warm-gray uppercase">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-warm-gray uppercase">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-warm-gray uppercase">Instagram</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-warm-gray uppercase">Dibuat</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-warm-gray uppercase">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-champagne-100">
              {clients.map((client) => (
                <tr key={client.id} className={`hover:bg-champagne-50/30 transition-smooth ${selectedIds.includes(client.id) ? 'bg-champagne-50' : ''}`}>
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(client.id)}
                      onChange={() => toggleSelect(client.id)}
                      className="w-4 h-4 rounded border-gray-300 text-champagne-500 focus:ring-champagne-500"
                    />
                  </td>
                  <td className="px-4 py-4 text-charcoal font-medium">{client.nama}</td>
                  <td className="px-4 py-4 text-warm-gray">{client.email}</td>
                  <td className="px-4 py-4 text-warm-gray">{client.phone || '-'}</td>
                  <td className="px-4 py-4 text-warm-gray">{client.instagram || '-'}</td>
                  <td className="px-4 py-4 text-warm-gray text-sm">
                    {new Date(client.createdAt).toLocaleDateString('id-ID')}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <button onClick={() => openEdit(client)} className="text-blue-600 hover:underline mr-3 cursor-pointer">Edit</button>
                    <button onClick={() => handleDelete(client.id)} className="text-red-600 hover:underline cursor-pointer">Hapus</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Add/Edit Client Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editingClient ? 'Edit Client' : 'Tambah Client Baru'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap *</label>
                <input
                  type="text"
                  required
                  value={formData.nama}
                  onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Instagram</label>
                <input
                  type="text"
                  value={formData.instagram}
                  onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
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
                  {submitting ? 'Menyimpan...' : editingClient ? 'Simpan' : 'Tambah'}
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
              Yakin hapus {selectedIds.length} client ini? Tindakan ini tidak dapat dibatalkan.
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