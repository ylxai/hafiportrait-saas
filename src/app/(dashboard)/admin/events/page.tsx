'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit2, Trash2, Calendar } from 'lucide-react';

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

type Pagination = {
  page: number;
  limit: number;
  total: number;
  pages: number;
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
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, pages: 0 });
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
  }, [pagination.page]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [eventsRes, clientsRes, packagesRes] = await Promise.all([
        fetch(`/api/admin/events?page=${pagination.page}&limit=${pagination.limit}`),
        fetch('/api/admin/clients'),
        fetch('/api/admin/packages'),
      ]);
      const eventsData = await eventsRes.json();
      const clientsData = await clientsRes.json();
      const packagesData = await packagesRes.json();
      
      setEvents(eventsData.data?.events || eventsData.events || []);
      if (eventsData.data?.pagination || eventsData.pagination) {
        setPagination(eventsData.data?.pagination || eventsData.pagination);
      }
      setClients(clientsData.data?.clients || clientsData.clients || []);
      setPackages(packagesData.data?.packages || packagesData.packages || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.pages) {
      setPagination(prev => ({ ...prev, page: newPage }));
    }
  };

  const handlePackageChange = (packageId: string | null) => {
    const pkg = packages.find(p => p.id === packageId);
    setFormData({
      ...formData,
      packageId: packageId || '',
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
        const result = await res.json();
        const eventData = result.data?.event || result.event;
        if (editingEvent && eventData) {
          setEvents(events.map(e => e.id === editingEvent.id ? eventData : e));
        } else if (eventData) {
          setEvents([eventData, ...events]);
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Events</h1>
        <Button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="touch-target"
        >
          <Plus className="w-5 h-5 mr-2" />
          <span className="hidden sm:inline">Buat Event</span>
        </Button>
      </div>

      {/* Floating Action Button for Mobile */}
      <Button
        onClick={() => { resetForm(); setShowModal(true); }}
        size="icon"
        className="fab bg-amber-500 text-white sm:hidden fixed bottom-6 right-6"
        aria-label="Buat Event Baru"
      >
        <Plus className="w-6 h-6" />
      </Button>

      {selectedIds.length > 0 && (
        <div className="glass-card mb-4 p-3 flex items-center justify-between">
          <span className="text-sm text-slate-800 font-medium">
            {selectedIds.length} item dipilih
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => openBulkModal('status')}>
              Ubah Status
            </Button>
            <Button variant="outline" size="sm" onClick={() => openBulkModal('payment')}>
              Ubah Pembayaran
            </Button>
            <Button variant="destructive" size="sm" onClick={() => openBulkModal('delete')}>
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
      ) : events.length === 0 ? (
        <div className="glass-card p-16 text-center">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-100 to-amber-200 flex items-center justify-center mx-auto mb-6 shadow-inner">
            <Calendar className="w-10 h-10 text-amber-600" />
          </div>
          <h3 className="text-2xl font-bold text-slate-800 mb-3">Belum ada event</h3>
          <p className="text-base text-slate-500 mb-8 max-w-sm mx-auto">Buat event pertama Anda untuk memulai mengelola proyek fotografi dengan mudah.</p>
          <Button onClick={() => setShowModal(true)} size="lg">
            <Plus className="w-5 h-5 mr-2" />
            Buat Event Baru
          </Button>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="table-mobile-scroll">
            <table className="w-full">
            <thead className="bg-amber-50/50 border-b border-champagne-100">
              <tr>
                <th className="px-4 py-3 text-left">
                  <Checkbox
                    checked={selectedIds.length === events.length && events.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Kode</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Project</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Client</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Tanggal</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Pembayaran</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Total</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-champagne-100">
              {events.map((event) => (
                <tr key={event.id} className={`hover:bg-amber-50/30 transition-smooth ${selectedIds.includes(event.id) ? 'bg-amber-50' : ''}`}>
                  <td className="px-4 py-4">
                    <Checkbox
                      checked={selectedIds.includes(event.id)}
                      onCheckedChange={() => toggleSelect(event.id)}
                    />
                  </td>
                  <td className="px-4 py-4">
                    <Link href={`/admin/events/${event.id}`} className="text-amber-600 hover:underline font-medium cursor-pointer">
                      {event.kodeBooking}
                    </Link>
                  </td>
                  <td className="px-4 py-4 text-slate-800">{event.namaProject}</td>
                  <td className="px-4 py-4 text-slate-500">{event.client?.nama || '-'}</td>
                  <td className="px-4 py-4 text-slate-500">
                    {new Date(event.eventDate).toLocaleDateString('id-ID')}
                  </td>
                  <td className="px-4 py-4">
                    <Badge variant={event.status === 'completed' ? 'default' : event.status === 'cancelled' ? 'destructive' : 'secondary'}>
                      {event.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-4">
                    <Badge variant={event.paymentStatus === 'paid' ? 'default' : event.paymentStatus === 'unpaid' ? 'destructive' : 'secondary'}>
                      {event.paymentStatus}
                    </Badge>
                  </td>
                  <td className="px-4 py-4 text-slate-800 font-medium">
                    Rp {event.totalPrice.toLocaleString('id-ID')}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(event)}>Edit</Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(event.id)} className="text-red-600">Hapus</Button>
                    </div>
                  </td>
                </tr>
              ))}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="flex items-center justify-between px-4 py-4 border-t border-champagne-100">
              <div className="text-sm text-slate-500">
                Menampilkan {events.length} dari {pagination.total} event
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page === 1}
                >
                  ← Prev
                </Button>
                <span className="text-sm text-slate-600">
                  Halaman {pagination.page} dari {pagination.pages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page === pagination.pages}
                >
                  Next →
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Event Modal */}
      <Dialog open={showModal} onOpenChange={(open) => { setShowModal(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingEvent ? 'Edit Event' : 'Buat Event Baru'}</DialogTitle>
            <DialogDescription>
              {editingEvent ? 'Ubah detail event di bawah.' : 'Isi detail event baru di bawah.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Nama Project</label>
              <Input
                required
                value={formData.namaProject}
                onChange={(e) => setFormData({ ...formData, namaProject: e.target.value })}
                placeholder="Contoh: Wedding Jane & John"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Pilih Client</label>
              <Select value={formData.clientId} onValueChange={(v) => setFormData({ ...formData, clientId: v || '' })}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih client..." />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>{client.nama}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Tanggal Event</label>
                <Input
                  type="date"
                  required
                  value={formData.eventDate}
                  onChange={(e) => setFormData({ ...formData, eventDate: e.target.value })}
                />
              </div>
              <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Lokasi</label>
              <Input
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="Jakarta"
              />
            </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Paket</label>
              <Select value={formData.packageId} onValueChange={handlePackageChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih paket..." />
                </SelectTrigger>
                <SelectContent>
                  {packages.map((pkg) => (
                    <SelectItem key={pkg.id} value={pkg.id}>{pkg.nama} - Rp {pkg.price.toLocaleString('id-ID')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Total Harga</label>
              <Input
                type="number"
                value={formData.totalPrice}
                onChange={(e) => setFormData({ ...formData, totalPrice: e.target.value })}
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Catatan</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 resize-none"
                placeholder="Catatan tambahan..."
              />
            </div>
            {editingEvent && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Status</label>
                  <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v || 'pending' })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="confirmed">Confirmed</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Pembayaran</label>
                  <Select value={formData.paymentStatus} onValueChange={(v) => setFormData({ ...formData, paymentStatus: v || 'unpaid' })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unpaid">Unpaid</SelectItem>
                      <SelectItem value="partial">Partial</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setShowModal(false); resetForm(); }}>
                Batal
              </Button>
              <Button type="submit" disabled={submitting} className="bg-amber-500 hover:bg-amber-600">
                {submitting ? 'Menyimpan...' : editingEvent ? 'Simpan Perubahan' : 'Buat Event'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk Action Modal */}
      <Dialog open={showBulkModal} onOpenChange={setShowBulkModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{bulkAction === 'delete' ? 'Hapus Massal' : 'Update Massal'}</DialogTitle>
          </DialogHeader>
          
          {bulkAction === 'delete' ? (
            <p className="text-slate-500">
              Yakin hapus {selectedIds.length} event ini? Tindakan ini tidak dapat dibatalkan.
            </p>
          ) : (
            <div className="mb-4">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                {bulkAction === 'status' ? 'Status Baru' : 'Status Pembayaran Baru'}
              </label>
              <Select value={bulkValue} onValueChange={(v) => setBulkValue(v || '')}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih..." />
                </SelectTrigger>
                <SelectContent>
                  {bulkAction === 'status' ? (
                    <>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="confirmed">Confirmed</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="unpaid">Unpaid</SelectItem>
                      <SelectItem value="partial">Partial</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkModal(false)}>
              Batal
            </Button>
            <Button 
              variant="destructive"
              onClick={bulkAction === 'delete' ? handleBulkDelete : handleBulkUpdate} 
              disabled={bulkAction !== 'delete' && !bulkValue}
            >
              {bulkAction === 'delete' ? 'Hapus' : 'Update'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}