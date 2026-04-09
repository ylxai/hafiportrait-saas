'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Image as ImageIcon } from 'lucide-react';

type Gallery = {
  id: string;
  namaProject: string;
  clientToken: string;
  status: string;
  maxSelection: number;
  viewCount: number;
  event: { kodeBooking: string; client: { nama: string } };
  _count: { photos: number; selections: number };
};

type Event = {
  id: string;
  namaProject: string;
  kodeBooking: string;
  client: { nama: string };
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  pages: number;
};

type GalleriesResponse = { galleries: Gallery[]; pagination?: Pagination };
type EventsResponse = { data: { events: Event[] } };

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function GalleriesPage() {
  const [page, setPage] = useState(1);
  const limit = 20;
  
  const { data, isLoading, mutate } = useSWR<GalleriesResponse>(`/api/admin/galleries?page=${page}&limit=${limit}`, fetcher);
  const galleries = data?.galleries ?? [];
  const pagination = data?.pagination;

  // Fetch events for the create form
  const { data: eventsData } = useSWR<EventsResponse>('/api/admin/events?limit=100', fetcher);
  const events = eventsData?.data?.events ?? [];
  
  const [showModal, setShowModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkStatus, setBulkStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    eventId: '',
    namaProject: '',
    maxSelection: 20,
    status: 'draft' as 'draft' | 'published',
    enableDownload: false,
  });

  const handlePageChange = (newPage: number) => {
    if (pagination && newPage >= 1 && newPage <= pagination.pages) {
      setPage(newPage);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };


  const resetForm = () => {
    setFormData({
      eventId: '',
      namaProject: '',
      maxSelection: 20,
      status: 'draft',
      enableDownload: false,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.eventId || !formData.namaProject) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/admin/galleries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setShowModal(false);
        resetForm();
        mutate(); // Refresh gallery list
      } else {
        const error = await res.json();
        alert(error.error || 'Gagal membuat gallery');
      }
    } catch (err) {
      console.error('Error creating gallery:', err);
      alert('Gagal membuat gallery');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Hapus ${selectedIds.length} gallery ini?`)) return;
    try {
      await fetch('/api/admin/galleries/bulk', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      });
      mutate();
      setSelectedIds([]);
      setShowBulkModal(false);
    } catch (error) {
      console.error('Error bulk deleting:', error);
    }
  };

  const handleBulkStatus = async () => {
    if (!bulkStatus) return;
    try {
      await fetch('/api/admin/galleries/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds, status: bulkStatus }),
      });
      mutate();
      setSelectedIds([]);
      setShowBulkModal(false);
      setBulkStatus('');
    } catch (error) {
      console.error('Error bulk updating:', error);
    }
  };

  const statusColors: Record<string, string> = {
    draft: 'bg-muted text-muted-foreground',
    published: 'bg-green-500/20 text-green-400',
    archived: 'bg-amber-500/20 text-amber-400',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Galleries</h1>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="w-5 h-5 mr-2" />
          <span className="hidden sm:inline">Buat Gallery</span>
        </Button>
      </div>

      {/* Floating Action Button for Mobile */}
      <Button
        onClick={() => setShowModal(true)}
        size="icon"
        className="fab bg-muted0 text-white sm:hidden fixed bottom-6 right-6"
        aria-label="Buat Gallery Baru"
      >
        <Plus className="w-6 h-6" />
      </Button>

      {selectedIds.length > 0 && (
        <div className="bg-card/50 backdrop-blur-xl border border-border shadow-2xl rounded-3xl mb-4 p-3 flex items-center justify-between">
          <span className="text-sm text-foreground font-medium">
            {selectedIds.length} item dipilih
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setBulkStatus(''); setShowBulkModal(true); }}>
              Ubah Status
            </Button>
            <Button variant="destructive" size="sm" onClick={() => { if(confirm(`Hapus ${selectedIds.length} gallery?`)) handleBulkDelete(); }}>
              Hapus
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
              Batal
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-card/50 backdrop-blur-xl border border-border shadow-2xl rounded-3xl overflow-hidden">
              <div className="skeleton skeleton-image"></div>
              <div className="p-4 space-y-2">
                <div className="skeleton skeleton-title"></div>
                <div className="skeleton skeleton-text"></div>
                <div className="skeleton skeleton-text" style={{ width: '50%' }}></div>
              </div>
            </div>
          ))}
        </div>
      ) : galleries.length === 0 ? (
        <div className="bg-card/50 backdrop-blur-xl border border-border shadow-2xl rounded-3xl p-12 text-center">
          <div className="w-16 h-16 rounded-xl bg-primary/20 flex items-center justify-center mx-auto mb-4">
            <ImageIcon className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-2">Belum ada gallery</h3>
          <p className="text-base text-muted-foreground mb-6">Buat gallery pertama Anda</p>
          <Button onClick={() => setShowModal(true)} className="bg-muted0 text-white hover:bg-amber-600">
            <Plus className="w-4 h-4 mr-2" />
            + Buat Gallery
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {galleries.map((gallery) => (
            <div key={gallery.id} className={`bg-card/50 backdrop-blur-xl border border-border shadow-2xl rounded-3xl overflow-hidden bg-card/50 backdrop-blur-xl border border-border shadow-2xl rounded-3xl-hover ${selectedIds.includes(gallery.id) ? 'ring-2 ring-champagne-500' : ''}`}>
              <div className="h-32 bg-gradient-to-r from-champagne-200 to-champagne-300 flex items-center justify-center relative">
                <svg className="w-12 h-12 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <div className="absolute top-2 left-2">
                  <Checkbox
                    checked={selectedIds.includes(gallery.id)}
                    onCheckedChange={() => toggleSelect(gallery.id)}
                  />
                </div>
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-foreground truncate">{gallery.namaProject}</h3>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[gallery.status]}`}>
                    {gallery.status}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mb-3">{gallery.event.client.nama} • {gallery.event.kodeBooking}</p>
                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                  <span className="flex items-center gap-1"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.76-.9l.814-1.74A2 2 0 0111.52 4H17a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /></svg> {gallery._count.photos} foto</span>
                  <span className="flex items-center gap-1"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> {gallery._count.selections} seleksi</span>
                </div>
                <div className="flex gap-2">
                  <Link href={`/admin/galleries/${gallery.id}`} className="flex-1 text-center">
                    <Button variant="outline" size="sm" className="w-full">Kelola</Button>
                  </Link>
                  <a href={`/gallery/${gallery.clientToken}`} target="_blank" rel="noopener noreferrer" className="flex-1">
                    <Button variant="outline" size="sm" className="w-full">Link</Button>
                  </a>
                </div>
              </div>
          </div>
        ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <div className="text-sm text-muted-foreground">
            Menampilkan {galleries.length} dari {pagination.total} gallery
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(page - 1)}
              disabled={page === 1 || isLoading}
            >
              ← Prev
            </Button>
            <span className="text-sm text-muted-foreground">
              Halaman {page} dari {pagination.pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(page + 1)}
              disabled={page === pagination.pages || isLoading}
            >
              Next →
            </Button>
          </div>
        </div>
      )}

      {/* Create Gallery Modal */}
      <Dialog open={showModal} onOpenChange={(open) => { setShowModal(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Buat Gallery Baru</DialogTitle>
            <DialogDescription>
              Buat gallery untuk event fotografi.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Pilih Event *</label>
              <Select 
                value={formData.eventId || undefined} 
                onValueChange={(value) => setFormData({ ...formData, eventId: value || '' })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih event..." />
                </SelectTrigger>
                <SelectContent>
                  {events.map((event) => (
                    <SelectItem key={event.id} value={event.id}>
                      {event.namaProject} ({event.client.nama})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Nama Project *</label>
              <Input 
                type="text" 
                placeholder="Wedding Jane & John"
                value={formData.namaProject}
                onChange={(e) => setFormData({ ...formData, namaProject: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Maksimal Seleksi</label>
                <Input 
                  type="number" 
                  min={0}
                  value={formData.maxSelection}
                  onChange={(e) => setFormData({ ...formData, maxSelection: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Status</label>
                <Select 
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: (value as 'draft' | 'published') || 'draft' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch 
                id="enableDownload" 
                checked={formData.enableDownload}
                onCheckedChange={(checked) => setFormData({ ...formData, enableDownload: checked })}
              />
              <label htmlFor="enableDownload" className="text-sm text-foreground">Izinkan client download foto</label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                Batal
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting || !formData.eventId || !formData.namaProject}
              >
                {isSubmitting ? 'Menyimpan...' : 'Simpan'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk Action Modal */}
      <Dialog open={showBulkModal} onOpenChange={(open) => { setShowBulkModal(open); if (!open) setBulkStatus(''); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ubah Status Massal</DialogTitle>
          </DialogHeader>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Status Baru</label>
            <Select value={bulkStatus} onValueChange={(v) => setBulkStatus(v || '')}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih status..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowBulkModal(false); setBulkStatus(''); }}>
              Batal
            </Button>
            <Button onClick={handleBulkStatus} disabled={!bulkStatus}>
              Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}