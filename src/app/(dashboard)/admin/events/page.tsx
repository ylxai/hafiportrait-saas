'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Plus, Calendar, Image as ImageIcon } from 'lucide-react';
import { LazyImage } from '@/components/ui/lazy-image';
import { AdminPaginationResponse } from '@/types/pagination';

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
  galleries?: { photos: { url: string; thumbnailUrl: string | null }[] }[];
};

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkAction, setBulkAction] = useState<'delete' | 'status' | 'payment' | ''>('');
  const [bulkValue, setBulkValue] = useState('');
  const [pagination, setPagination] = useState<AdminPaginationResponse>({ page: 1, limit: 20, total: 0, pages: 0 });
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

  // SWR for clients and packages (bounded, cached, no re-fetch on every page change)
  const { data: clientsData } = useSWR('/api/admin/clients?limit=100', (url) =>
    fetch(url).then(res => res.json()).then(d => d.data?.clients || d.clients || []),
    { revalidateOnFocus: false, dedupingInterval: 300000 }
  );
  const { data: packagesData } = useSWR('/api/admin/packages?limit=100', (url) =>
    fetch(url).then(res => res.json()).then(d => d.data?.packages || d.packages || []),
    { revalidateOnFocus: false, dedupingInterval: 300000 }
  );

  const clients: Client[] = clientsData || [];
  const packages: Package[] = packagesData || [];

  useEffect(() => {
    fetchEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page]);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const eventsRes = await fetch(`/api/admin/events?page=${pagination.page}&limit=${pagination.limit}`);
      const eventsData = await eventsRes.json();

      setEvents(eventsData.data?.events || eventsData.events || []);
      if (eventsData.data?.pagination || eventsData.pagination) {
        setPagination(eventsData.data?.pagination || eventsData.pagination);
      }
    } catch (error) {
      console.error('Error fetching events:', error);
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
        <h1 className="text-2xl font-bold text-foreground">Events</h1>
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
        className="fab bg-muted0 text-white sm:hidden fixed bottom-6 right-6"
        aria-label="Buat Event Baru"
      >
        <Plus className="w-6 h-6" />
      </Button>

      {selectedIds.length > 0 && (
        <div className="bg-card/50 backdrop-blur-xl border border-border shadow-2xl rounded-3xl mb-4 p-3 flex items-center justify-between">
          <span className="text-sm text-foreground font-medium">
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
        <div className="bg-card/50 backdrop-blur-xl border border-border shadow-2xl rounded-3xl p-4 space-y-3">
          <div className="skeleton skeleton-title"></div>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton skeleton-table-row"></div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="bg-card/50 backdrop-blur-xl border border-border shadow-2xl rounded-3xl p-16 text-center">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-100 to-amber-200 flex items-center justify-center mx-auto mb-6 shadow-inner">
            <Calendar className="w-10 h-10 text-primary" />
          </div>
          <h3 className="text-2xl font-bold text-foreground mb-3">Belum ada event</h3>
          <p className="text-base text-muted-foreground mb-8 max-w-sm mx-auto">Buat event pertama Anda untuk memulai mengelola proyek fotografi dengan mudah.</p>
          <Button onClick={() => setShowModal(true)} size="lg">
            <Plus className="w-5 h-5 mr-2" />
            Buat Event Baru
          </Button>
        </div>
      ) : (
        <div className="bg-card/50 backdrop-blur-xl border border-border shadow-2xl rounded-3xl overflow-hidden">
          <div className="table-mobile-scroll">
            <table className="w-full">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left">
                  <Checkbox
                    checked={selectedIds.length === events.length && events.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Kode</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Project</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Client</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Tanggal</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Pembayaran</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Total</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-champagne-100">
              {events.map((event) => (
                <tr key={event.id} className={`hover:bg-muted/20 transition-smooth ${selectedIds.includes(event.id) ? 'bg-muted' : ''}`}>
                  <td className="px-4 py-4">
                    <Checkbox
                      checked={selectedIds.includes(event.id)}
                      onCheckedChange={() => toggleSelect(event.id)}
                    />
                  </td>
                  <td className="px-4 py-4">
                    <Link href={`/admin/events/${event.id}`} className="text-primary hover:underline font-medium cursor-pointer">
                      {event.kodeBooking}
                    </Link>
                  </td>
                  <td className="px-4 py-4 text-foreground">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-md overflow-hidden bg-muted/50 border border-border relative shrink-0">
                        {event.galleries?.[0]?.photos?.[0] ? (
                          <LazyImage
                            src={event.galleries[0].photos[0].thumbnailUrl || event.galleries[0].photos[0].url}
                            alt={event.namaProject}
                            fill
                            className="object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-muted">
                            <ImageIcon className="w-4 h-4 text-muted-foreground/50" />
                          </div>
                        )}
                      </div>
                      <span className="font-medium">{event.namaProject}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-muted-foreground">{event.client?.nama || '-'}</td>
                  <td className="px-4 py-4 text-muted-foreground">
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
                  <td className="px-4 py-4 text-foreground font-medium">
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
            <div className="flex items-center justify-between px-4 py-4 border-t border-border">
              <div className="text-sm text-muted-foreground">
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
                <span className="text-sm text-muted-foreground">
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
              <label className="block text-sm font-semibold text-foreground mb-2">Nama Project</label>
              <Input
                required
                value={formData.namaProject}
                onChange={(e) => setFormData({ ...formData, namaProject: e.target.value })}
                placeholder="Contoh: Wedding Jane & John"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">Pilih Client</label>
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
                <label className="block text-sm font-semibold text-foreground mb-2">Tanggal Event</label>
                <Input
                  type="date"
                  required
                  value={formData.eventDate}
                  onChange={(e) => setFormData({ ...formData, eventDate: e.target.value })}
                />
              </div>
              <div>
              <label className="block text-sm font-semibold text-foreground mb-2">Lokasi</label>
              <Input
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="Jakarta"
              />
            </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">Paket</label>
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
              <label className="block text-sm font-semibold text-foreground mb-2">Total Harga</label>
              <Input
                type="number"
                value={formData.totalPrice}
                onChange={(e) => setFormData({ ...formData, totalPrice: e.target.value })}
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">Catatan</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
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
              <Button type="submit" disabled={submitting} className="bg-primary text-primary-foreground hover:bg-primary/90">
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
            <p className="text-muted-foreground">
              Yakin hapus {selectedIds.length} event ini? Tindakan ini tidak dapat dibatalkan.
            </p>
          ) : (
            <div className="mb-4">
              <label className="block text-sm font-semibold text-foreground mb-2">
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