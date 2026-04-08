'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

type Stats = {
  totalEvents: number;
  totalClients: number;
  totalGalleries: number;
  totalPhotos: number;
  totalRevenue: number;
  recentEvents: {
    id: string;
    namaProject: string;
    kodeBooking: string;
    eventDate: string;
    status: string;
    client: string;
  }[];
  recentGalleries: {
    id: string;
    namaProject: string;
    status: string;
    photoCount: number;
    client: string;
  }[];
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { data, isLoading } = useSWR<{ stats: Stats }>('/api/admin/stats', fetcher);
  const stats = data?.stats;

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  if (status === 'loading' || isLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton skeleton-title" style={{ width: '30%' }}></div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass-card p-4 space-y-3">
              <div className="skeleton skeleton-avatar"></div>
              <div className="skeleton skeleton-text"></div>
              <div className="skeleton skeleton-text" style={{ width: '60%' }}></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
  };

  return (
    <div>
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 mb-4 sm:mb-6">Dashboard</h1>
      
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3 sm:gap-6">
        <div className="glass-card p-4 sm:p-6 glass-card-hover">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mb-3">
            <svg className="w-5 h-5 sm:w-6 sm:h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-800">{stats?.totalEvents ?? 0}</div>
          <div className="text-xs sm:text-sm text-slate-500 mt-1">Events</div>
        </div>
        
        <div className="glass-card p-4 sm:p-6 glass-card-hover">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-rose-500/10 flex items-center justify-center mb-3">
            <svg className="w-5 h-5 sm:w-6 sm:h-6 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-800">{stats?.totalClients ?? 0}</div>
          <div className="text-xs sm:text-sm text-slate-500 mt-1">Clients</div>
        </div>
        
        <div className="glass-card p-4 sm:p-6 glass-card-hover">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mb-3">
            <svg className="w-5 h-5 sm:w-6 sm:h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-800">{stats?.totalGalleries ?? 0}</div>
          <div className="text-xs sm:text-sm text-slate-500 mt-1">Galleries</div>
        </div>
        
        <div className="glass-card p-4 sm:p-6 glass-card-hover">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-green-500/10 flex items-center justify-center mb-3">
            <svg className="w-5 h-5 sm:w-6 sm:h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="text-xs sm:text-lg lg:text-xl font-bold text-slate-800 truncate">{formatCurrency(stats?.totalRevenue ?? 0)}</div>
          <div className="text-xs sm:text-sm text-slate-500 mt-1">Revenue</div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800">Recent Events</h2>
            <Link href="/admin/events" className="text-sm text-amber-600 hover:text-amber-700 transition-smooth cursor-pointer">View all →</Link>
          </div>
          {stats?.recentEvents && stats.recentEvents.length > 0 ? (
            <div className="space-y-3">
              {stats.recentEvents.map((event) => (
                <div key={event.id} className="flex items-center justify-between p-3 bg-amber-50/50 rounded-lg">
                  <div>
                    <div className="font-medium text-slate-800">{event.namaProject}</div>
                    <div className="text-sm text-slate-500">{event.client} • {event.kodeBooking}</div>
                  </div>
                  <Badge variant={event.status === 'completed' ? 'default' : 'secondary'}>
                    {event.status}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-sm">No events yet</p>
          )}
        </div>
        
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800">Recent Galleries</h2>
            <Link href="/admin/galleries" className="text-sm text-amber-600 hover:text-amber-700 transition-smooth cursor-pointer">View all →</Link>
          </div>
          {stats?.recentGalleries && stats.recentGalleries.length > 0 ? (
            <div className="space-y-3">
              {stats.recentGalleries.map((gallery) => (
                <div key={gallery.id} className="flex items-center justify-between p-3 bg-amber-50/50 rounded-lg">
                  <div>
                    <div className="font-medium text-slate-800">{gallery.namaProject}</div>
                    <div className="text-sm text-slate-500">{gallery.client} • {gallery.photoCount} photos</div>
                  </div>
                  <Badge variant={gallery.status === 'published' ? 'default' : 'secondary'}>
                    {gallery.status}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-sm">No galleries yet</p>
          )}
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-card p-6">
          <h2 className="font-semibold text-slate-800 mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <Link href="/admin/events/new" className="block p-3 bg-amber-50/50 text-amber-700 rounded-lg hover:bg-amber-100/50 transition-smooth cursor-pointer">
              + Buat Event Baru
            </Link>
            <Link href="/admin/galleries/new" className="block p-3 bg-blue-50/50 text-blue-700 rounded-lg hover:bg-blue-100/50 transition-smooth cursor-pointer">
              + Buat Gallery Baru
            </Link>
            <a href="/booking" className="block p-3 bg-green-50/50 text-green-700 rounded-lg hover:bg-green-100/50 transition-smooth cursor-pointer" target="_blank">
              Link Booking Form →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}