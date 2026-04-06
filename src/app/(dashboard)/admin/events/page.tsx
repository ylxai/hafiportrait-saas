'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

type Client = {
  id: string;
  nama: string;
  email: string;
};

type Package = {
  id: string;
  nama: string;
  price: number;
  maxSelection: number;
  maxDownload: number;
};

type Event = {
  id: string;
  kodeBooking: string;
  namaProject: string;
  eventDate: string;
  location: string | null;
  notes: string | null;
  status: string;
  paymentStatus: string;
  totalPrice: number;
  client: { id: string; nama: string };
  package: { id: string; nama: string; maxSelection: number; maxDownload: number } | null;
};

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkAction, setBulkAction] = useState<'delete' | 'status' | 'payment' | ''>('');
  const [bulkValue, setBulkValue] = useState('');
  const [formData, setFormData] = useState({
    clientId: '',
    packageId: '',
    namaProject: '',
    eventDate: '',
    location: '',
    notes: '',
    totalPrice: '',
    status: 'pending',
    paymentStatus: 'unpaid',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [eventsRes, clientsRes, packagesRes] = await Promise.all([
        fetch('/api/admin/events'),
        fetch('/api/admin/clients'),
        fetch('/api/admin/packages'),
      ]);
      const eventsData = await eventsRes.json();
      const clientsData = await clientsRes.json();
      const packagesData = await packagesRes.json();
      
      setEvents(eventsData.events || []);
      setClients(clientsData.clients || []);
      setPackages(packagesData.packages || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePackageChange = (packageId: string) => {
    const pkg = packages.find(p => p.id === packageId);
    setFormData({
      ...formData,
      packageId,
      totalPrice: pkg ? String(pkg.price) : formData.totalPrice,
    });
  };

  const resetForm = () => {
    setFormData({
      clientId: '',
      packageId: '',
      namaProject: '',
      eventDate: '',
      location: '',
      notes: '',
      totalPrice: '',
      status: 'pending',
      paymentStatus: 'unpaid',
    });
    setEditingEvent(null);
  };

  const openEdit = (event: Event) => {
    setEditingEvent(event);
    setFormData({
      clientId: event.client?.id || '',
      packageId: event.package?.id || '',
      namaProject: event.namaProject,
      eventDate: event.eventDate.split('T')[0],
      location: event.location || '',
      notes: event.notes || '',
      totalPrice: String(event.totalPrice),
      status: event.status,
      paymentStatus: event.paymentStatus,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const payload = {
      clientId: formData.clientId,
      packageId: formData.packageId || null,
      namaProject: formData.namaProject,
      eventDate: formData.eventDate,
      location: formData.location || null,
      notes: formData.notes || null,
      totalPrice: parseInt(formData.totalPrice) || 0,
      status: formData.status,
      paymentStatus: formData.paymentStatus,
    };

    try {
      const url = editingEvent
        ? `/api/admin/events?id=${editingEvent.id}`
        : '/api/admin/events';
      const method = editingEvent ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        if (editingEvent) {
          setEvents(events.map(e => e.id === editingEvent.id ? data.event : e));
        } else {
          setEvents([data.event, ...events]);
        }
        setShowModal(false);
        resetForm();
      }
    } catch (error) {
      console.error('Error saving event:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus event ini?')) return;

    try {
      await fetch(`/api/admin/events?id=${id}`, { method: 'DELETE' });
      setEvents(events.filter(e => e.id !== id));
    } catch (error) {
      console.error('Error deleting event:', error);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === events.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(events.map(e => e.id));
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Hapus ${selectedIds.length} event ini?`)) return;

    try {
      await fetch('/api/admin/events/bulk', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      });
      setEvents(events.filter(e => !selectedIds.includes(e.id)));
      setSelectedIds([]);
      setShowBulkModal(false);
    } catch (error) {
      console.error('Error bulk deleting:', error);
    }
  };

  const handleBulkUpdate = async () => {
    if (!selectedIds.length) return;

    try {
      const data: Record<string, string | string[]> = { ids: selectedIds };
      if (bulkAction === 'status') data.status = bulkValue;
      if (bulkAction === 'payment') data.paymentStatus = bulkValue;

      await fetch('/api/admin/events/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      setEvents(events.map(e => 
        selectedIds.includes(e.id) 
          ? { ...e, ...(bulkAction === 'status' ? { status: bulkValue } : {}), ...(bulkAction === 'payment' ? { paymentStatus: bulkValue } : {}) }
          : e
      ));
      setSelectedIds([]);
      setShowBulkModal(false);
    } catch (error) {
      console.error('Error bulk updating:', error);
    }
  };

  const openBulkModal = (action: 'delete' | 'status' | 'payment') => {
    setBulkAction(action);
    setBulkValue('');
    setShowBulkModal(true);
  };

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    confirmed: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  };

  const paymentColors: Record<string, string> = {
    unpaid: 'bg-red-100 text-red-800',
    partial: 'bg-orange-100 text-orange-800',
    paid: 'bg-green-100 text-green-800',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-charcoal">Events</h1>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="touch-target px-4 py-2.5 bg-champagne-500 hover:bg-champagne-600 text-white font-medium rounded-lg transition-smooth cursor-pointer flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          <span className="hidden sm:inline">Buat Event</span>
        </button>
      </div>

      {/* Floating Action Button for Mobile */}
      <button
        onClick={() => { resetForm(); setShowModal(true); }}
        className="fab bg-champagne-500 text-white sm:hidden"
        aria-label="Buat Event Baru"
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
            <button onClick={() => openBulkModal('status')} className="px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 cursor-pointer">
              Ubah Status
            </button>
            <button onClick={() => openBulkModal('payment')} className="px-3 py-1.5 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 cursor-pointer">
              Ubah Pembayaran
            </button>
            <button onClick={() => openBulkModal('delete')} className="px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 cursor-pointer">
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
      ) : events.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <div className="w-16 h-16 rounded-xl bg-champagne-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-champagne-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-charcoal mb-2">Belum ada event</h3>
          <p className="text-warm-gray mb-4">Buat event pertama Anda</p>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-champagne-500 text-white rounded-lg hover:bg-champagne-600 cursor-pointer"
          >
            + Buat Event
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
                    checked={selectedIds.length === events.length && events.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 text-champagne-500 focus:ring-champagne-500"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-warm-gray uppercase">Kode</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-warm-gray uppercase">Project</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-warm-gray uppercase">Client</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-warm-gray uppercase">Tanggal</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-warm-gray uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-warm-gray uppercase">Pembayaran</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-warm-gray uppercase">Total</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-warm-gray uppercase">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-champagne-100">
              {events.map((event) => (
                <tr key={event.id} className={`hover:bg-champagne-50/30 transition-smooth ${selectedIds.includes(event.id) ? 'bg-champagne-50' : ''}`}>
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(event.id)}
                      onChange={() => toggleSelect(event.id)}
                      className="w-4 h-4 rounded border-gray-300 text-champagne-500 focus:ring-champagne-500"
                    />
                  </td>
                  <td className="px-4 py-4">
                    <Link href={`/admin/events/${event.id}`} className="text-champagne-600 hover:underline font-medium cursor-pointer">
                      {event.kodeBooking}
                    </Link>
                  </td>
                  <td className="px-4 py-4 text-charcoal">{event.namaProject}</td>
                  <td className="px-4 py-4 text-warm-gray">{event.client?.nama || '-'}</td>
                  <td className="px-4 py-4 text-warm-gray">
                    {new Date(event.eventDate).toLocaleDateString('id-ID')}
                  </td>
                  <td className="px-4 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[event.status] || 'badge-gold'}`}>
                      {event.status}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${paymentColors[event.paymentStatus] || 'badge-gold'}`}>
                      {event.paymentStatus}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-charcoal font-medium">
                    Rp {event.totalPrice.toLocaleString('id-ID')}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <button onClick={() => openEdit(event)} className="text-blue-600 hover:underline mr-3 cursor-pointer">Edit</button>
                    <button onClick={() => handleDelete(event.id)} className="text-red-600 hover:underline cursor-pointer">Hapus</button>
                  </td>
                </tr>
              ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create/Edit Event Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editingEvent ? 'Edit Event' : 'Buat Event Baru'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Project</label>
                <input
                  type="text"
                  required
                  value={formData.namaProject}
                  onChange={(e) => setFormData({ ...formData, namaProject: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="Contoh: Wedding Jane & John"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pilih Client</label>
                <select
                  required
                  value={formData.clientId}
                  onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                >
                  <option value="">Pilih client...</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>{client.nama}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal Event</label>
                  <input
                    type="date"
                    required
                    value={formData.eventDate}
                    onChange={(e) => setFormData({ ...formData, eventDate: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lokasi</label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="Jakarta"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Paket</label>
                <select
                  value={formData.packageId}
                  onChange={(e) => handlePackageChange(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                >
                  <option value="">Pilih paket...</option>
                  {packages.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>{pkg.nama} - Rp {pkg.price.toLocaleString('id-ID')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Total Harga</label>
                <input
                  type="number"
                  value={formData.totalPrice}
                  onChange={(e) => setFormData({ ...formData, totalPrice: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Catatan</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="Catatan tambahan..."
                />
              </div>
              {editingEvent && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="pending">Pending</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Pembayaran</label>
                    <select
                      value={formData.paymentStatus}
                      onChange={(e) => setFormData({ ...formData, paymentStatus: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="unpaid">Unpaid</option>
                      <option value="partial">Partial</option>
                      <option value="paid">Paid</option>
                    </select>
                  </div>
                </div>
              )}
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">
                  Batal
                </button>
                  <button type="submit" disabled={submitting} className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50">
                  {submitting ? 'Menyimpan...' : editingEvent ? 'Simpan' : 'Buat'}
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
            <h2 className="text-lg font-bold text-gray-900 mb-4">
              {bulkAction === 'delete' ? 'Hapus Massal' : 'Update Massal'}
            </h2>
            
            {bulkAction === 'delete' ? (
              <p className="text-gray-600 mb-4">
                Yakin hapus {selectedIds.length} event ini? Tindakan ini tidak dapat dibatalkan.
              </p>
            ) : (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {bulkAction === 'status' ? 'Status Baru' : 'Status Pembayaran Baru'}
                </label>
                <select
                  value={bulkValue}
                  onChange={(e) => setBulkValue(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">Pilih...</option>
                  {bulkAction === 'status' ? (
                    <>
                      <option value="pending">Pending</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </>
                  ) : (
                    <>
                      <option value="unpaid">Unpaid</option>
                      <option value="partial">Partial</option>
                      <option value="paid">Paid</option>
                    </>
                  )}
                </select>
              </div>
            )}

            <div className="flex gap-3">
              <button 
                onClick={() => setShowBulkModal(false)} 
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Batal
              </button>
              <button 
                onClick={bulkAction === 'delete' ? handleBulkDelete : handleBulkUpdate} 
                disabled={bulkAction !== 'delete' && !bulkValue}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
              >
                {bulkAction === 'delete' ? 'Hapus' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}