'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import useSWR from 'swr';

type Analytics = {
  id: string;
  namaProject: string;
  client: string;
  status: string;
  photoCount: number;
  viewCount: number;
  selectionCount: number;
  selectedPhotos: number;
  createdAt: string;
  publishedAt: string | null;
};

type Summary = {
  totalGalleries: number;
  publishedGalleries: number;
  totalViews: number;
  avgViews: number;
  totalSelections: number;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function AnalyticsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { data, isLoading } = useSWR<{ analytics: Analytics[]; summary: Summary }>('/api/admin/analytics', fetcher);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  if (status === 'loading' || isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const analytics = data?.analytics || [];
  const summary = data?.summary;

  const filteredAnalytics = filter === 'all' 
    ? analytics 
    : analytics.filter((g) => g.status === filter);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Gallery Analytics</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        <div className="glass-card p-4">
          <div className="text-sm text-slate-500">Total Galleries</div>
          <div className="text-2xl font-bold text-slate-800">{summary?.totalGalleries ?? 0}</div>
        </div>
        <div className="glass-card p-4">
          <div className="text-sm text-slate-500">Published</div>
          <div className="text-2xl font-bold text-green-600">{summary?.publishedGalleries ?? 0}</div>
        </div>
        <div className="glass-card p-4">
          <div className="text-sm text-slate-500">Total Views</div>
          <div className="text-2xl font-bold text-blue-600">{summary?.totalViews ?? 0}</div>
        </div>
        <div className="glass-card p-4">
          <div className="text-sm text-slate-500">Avg Views</div>
          <div className="text-2xl font-bold text-purple-600">{summary?.avgViews ?? 0}</div>
        </div>
        <div className="glass-card p-4">
          <div className="text-sm text-slate-500">Total Selections</div>
          <div className="text-2xl font-bold text-amber-600">{summary?.totalSelections ?? 0}</div>
        </div>
      </div>

      <div className="glass-card">
        <div className="p-4 border-b border-champagne-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Gallery Performance</h2>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="glass-input px-3 py-2 text-sm w-auto"
          >
            <option value="all">All</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-amber-50/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Gallery</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Client</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Photos</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Views</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Selected</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-champagne-100">
              {filteredAnalytics.length > 0 ? (
                filteredAnalytics.map((item) => (
                  <tr key={item.id} className="hover:bg-amber-50/30 transition-smooth">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{item.namaProject}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">{item.client}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{item.photoCount}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{item.viewCount}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{item.selectedPhotos}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        item.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No galleries found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}