'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import useSWR from 'swr';

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

type GalleriesResponse = { galleries: Gallery[] };

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function GalleriesPage() {
  const { data, isLoading, mutate } = useSWR<GalleriesResponse>('/api/admin/galleries', fetcher);
  const galleries = data?.galleries ?? [];
  
  const [showModal, setShowModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkStatus, setBulkStatus] = useState('');

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === galleries.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(galleries.map(g => g.id));
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
    draft: 'bg-gray-100 text-gray-800',
    published: 'bg-green-100 text-green-800',
    archived: 'bg-yellow-100 text-yellow-800',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-charcoal">Galleries</h1>
        <button
          onClick={() => setShowModal(true)}
          className="touch-target px-4 py-2.5 bg-champagne-500 hover:bg-champagne-600 text-white font-medium rounded-lg transition-smooth cursor-pointer flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          <span className="hidden sm:inline">Buat Gallery</span>
        </button>
      </div>

      {/* Floating Action Button for Mobile */}
      <button
        onClick={() => setShowModal(true)}
        className="fab bg-champagne-500 text-white sm:hidden"
        aria-label="Buat Gallery Baru"
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
            <button onClick={() => { setBulkStatus(''); setShowBulkModal(true); }} className="px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 cursor-pointer">
              Ubah Status
            </button>
            <button onClick={() => { if(confirm(`Hapus ${selectedIds.length} gallery?`)) handleBulkDelete(); }} className="px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 cursor-pointer">
              Hapus
            </button>
            <button onClick={() => setSelectedIds([])} className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 cursor-pointer">
              Batal
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="glass-card overflow-hidden">
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
        <div className="glass-card p-12 text-center">
          <div className="w-16 h-16 rounded-xl bg-champagne-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-champagne-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-charcoal mb-2">Belum ada gallery</h3>
          <p className="text-warm-gray mb-4">Buat gallery pertama Anda</p>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-champagne-500 text-white rounded-lg hover:bg-champagne-600 cursor-pointer"
          >
            + Buat Gallery
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {galleries.map((gallery) => (
            <div key={gallery.id} className={`glass-card overflow-hidden glass-card-hover ${selectedIds.includes(gallery.id) ? 'ring-2 ring-champagne-500' : ''}`}>
              <div className="h-32 bg-gradient-to-r from-champagne-200 to-champagne-300 flex items-center justify-center relative">
                <svg className="w-12 h-12 text-champagne-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <div className="absolute top-2 left-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(gallery.id)}
                    onChange={() => toggleSelect(gallery.id)}
                    className="w-4 h-4 rounded border-white text-champagne-500 focus:ring-champagne-500 bg-white/50"
                  />
                </div>
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-charcoal truncate">{gallery.namaProject}</h3>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[gallery.status]}`}>
                    {gallery.status}
                  </span>
                </div>
                <p className="text-sm text-warm-gray mb-3">{gallery.event.client.nama} • {gallery.event.kodeBooking}</p>
                <div className="flex items-center gap-4 text-sm text-warm-gray mb-4">
                  <span className="flex items-center gap-1"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.76-.9l.814-1.74A2 2 0 0111.52 4H17a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /></svg> {gallery._count.photos} foto</span>
                  <span className="flex items-center gap-1"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> {gallery._count.selections} seleksi</span>
                </div>
                <div className="flex gap-2">
                  <Link href={`/admin/galleries/${gallery.id}`} className="flex-1 text-center px-3 py-2 bg-champagne-50 text-champagne-700 rounded-lg hover:bg-champagne-100 text-sm font-medium cursor-pointer transition-smooth">
                    Kelola
                  </Link>
                  <a href={`/gallery/${gallery.clientToken}`} target="_blank" rel="noopener noreferrer" className="flex-1 text-center px-3 py-2 bg-blue-50/50 text-blue-700 rounded-lg hover:bg-blue-100 text-sm font-medium cursor-pointer transition-smooth">
                    Link
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Gallery Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Buat Gallery Baru</h2>
            <form className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pilih Event</label>
                <select className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent">
                  <option value="">Pilih event...</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Project</label>
                <input type="text" className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent" placeholder="Wedding Jane & John" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Maksimal Seleksi</label>
                  <input type="number" className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent" placeholder="20" defaultValue={20} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent">
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="enableDownload" className="rounded border-gray-300 text-amber-500 focus:ring-amber-500" />
                <label htmlFor="enableDownload" className="text-sm text-gray-700">Izinkan client download foto</label>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">
                  Batal
                </button>
                <button type="submit" className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600">
                  Simpan
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
            <h2 className="text-lg font-bold text-gray-900 mb-4">Ubah Status Massal</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Status Baru</label>
              <select
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value)}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500"
              >
                <option value="">Pilih status...</option>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => { setShowBulkModal(false); setBulkStatus(''); }} 
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Batal
              </button>
              <button 
                onClick={handleBulkStatus} 
                disabled={!bulkStatus}
                className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}