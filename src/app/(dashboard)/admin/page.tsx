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
  const { data, isLoading } = useSWR<{ data: { stats: Stats } }>('/api/admin/stats', fetcher);
  const stats = data?.data?.stats;

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
            <div key={i} className="bg-card/50 backdrop-blur-xl border border-border shadow-[0_4px_24px_rgba(0,0,0,0.2)] rounded-3xl p-4 space-y-3">
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Dashboard</h1>
      </div>
      
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="bg-card/50 backdrop-blur-xl border border-border p-5 rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,0.2)] hover:border-primary/50 transition-all group">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 border border-primary/20 group-hover:shadow-[0_0_15px_rgba(245,158,11,0.3)] transition-all">
            <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="text-2xl lg:text-4xl font-bold text-foreground">{stats?.totalEvents ?? 0}</div>
          <div className="text-sm text-muted-foreground mt-1 font-medium">Events</div>
        </div>
        
        <div className="bg-card/50 backdrop-blur-xl border border-border p-5 rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,0.2)] hover:border-destructive/50 transition-all group">
          <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4 border border-destructive/20 group-hover:shadow-[0_0_15px_rgba(239,68,68,0.3)] transition-all">
            <svg className="w-6 h-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div className="text-2xl lg:text-4xl font-bold text-foreground">{stats?.totalClients ?? 0}</div>
          <div className="text-sm text-muted-foreground mt-1 font-medium">Clients</div>
        </div>
        
        <div className="bg-card/50 backdrop-blur-xl border border-border p-5 rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,0.2)] hover:border-info/50 transition-all group">
          <div className="w-12 h-12 rounded-2xl bg-info/10 flex items-center justify-center mb-4 border border-info/20 group-hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all">
            <svg className="w-6 h-6 text-info" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="text-2xl lg:text-4xl font-bold text-foreground">{stats?.totalGalleries ?? 0}</div>
          <div className="text-sm text-muted-foreground mt-1 font-medium">Galleries</div>
        </div>
        
        <div className="bg-card/50 backdrop-blur-xl border border-border p-5 rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,0.2)] hover:border-success/50 transition-all group">
          <div className="w-12 h-12 rounded-2xl bg-success/10 flex items-center justify-center mb-4 border border-success/20 group-hover:shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all">
            <svg className="w-6 h-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="text-lg lg:text-2xl font-bold text-foreground truncate">{formatCurrency(stats?.totalRevenue ?? 0)}</div>
          <div className="text-sm text-muted-foreground mt-1 font-medium">Revenue</div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card/50 backdrop-blur-xl border border-border rounded-3xl p-6 shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-semibold text-lg text-foreground tracking-tight">Recent Events</h2>
            <Link href="/admin/events" className="text-sm text-primary hover:text-primary/80 transition-smooth cursor-pointer font-medium">View all →</Link>
          </div>
          {stats?.recentEvents && stats.recentEvents.length > 0 ? (
            <div className="space-y-4">
              {stats.recentEvents.map((event) => (
                <div key={event.id} className="flex items-center justify-between p-4 bg-background/50 border border-border rounded-2xl hover:border-primary/30 transition-all">
                  <div>
                    <div className="font-semibold text-foreground tracking-wide">{event.namaProject}</div>
                    <div className="text-sm text-muted-foreground mt-1">{event.client} • <span className="font-mono text-xs opacity-80">{event.kodeBooking}</span></div>
                  </div>
                  <Badge variant={event.status === 'completed' ? 'default' : 'secondary'} className={event.status === 'completed' ? 'bg-primary/20 text-primary border-primary/30' : 'bg-muted text-muted-foreground'}>
                    {event.status}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                 <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                 </svg>
              </div>
              <p className="text-muted-foreground font-medium">No events yet</p>
            </div>
          )}
        </div>
        
        <div className="bg-card/50 backdrop-blur-xl border border-border rounded-3xl p-6 shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-semibold text-lg text-foreground tracking-tight">Recent Galleries</h2>
            <Link href="/admin/galleries" className="text-sm text-primary hover:text-primary/80 transition-smooth cursor-pointer font-medium">View all →</Link>
          </div>
          {stats?.recentGalleries && stats.recentGalleries.length > 0 ? (
            <div className="space-y-4">
              {stats.recentGalleries.map((gallery) => (
                <div key={gallery.id} className="flex items-center justify-between p-4 bg-background/50 border border-border rounded-2xl hover:border-primary/30 transition-all">
                  <div>
                    <div className="font-semibold text-foreground tracking-wide">{gallery.namaProject}</div>
                    <div className="text-sm text-muted-foreground mt-1">{gallery.client} • {gallery.photoCount} photos</div>
                  </div>
                  <Badge variant={gallery.status === 'published' ? 'default' : 'secondary'} className={gallery.status === 'published' ? 'bg-primary/20 text-primary border-primary/30' : 'bg-muted text-muted-foreground'}>
                    {gallery.status}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
             <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                 <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                 </svg>
              </div>
              <p className="text-muted-foreground font-medium">No galleries yet</p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card/50 backdrop-blur-xl border border-border rounded-3xl p-6 shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
          <h2 className="font-semibold text-lg text-foreground mb-6 tracking-tight">Quick Actions</h2>
          <div className="space-y-4">
            <Link href="/admin/events/new" className="block p-4 bg-primary/10 text-primary border border-primary/20 rounded-2xl hover:bg-primary/20 transition-all cursor-pointer font-medium shadow-[inset_0_0_15px_rgba(245,158,11,0.05)]">
              <span className="text-xl mr-2">+</span> Buat Event Baru
            </Link>
            <Link href="/admin/galleries/new" className="block p-4 bg-info/10 text-info border border-info/20 rounded-2xl hover:bg-info/20 transition-all cursor-pointer font-medium shadow-[inset_0_0_15px_rgba(59,130,246,0.05)]">
              <span className="text-xl mr-2">+</span> Buat Gallery Baru
            </Link>
            <a href="/booking" className="block p-4 bg-success/10 text-success border border-success/20 rounded-2xl hover:bg-success/20 transition-all cursor-pointer font-medium shadow-[inset_0_0_15px_rgba(16,185,129,0.05)] flex justify-between items-center" target="_blank">
              <span>Link Booking Form</span>
              <span>→</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}