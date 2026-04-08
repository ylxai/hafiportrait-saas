'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';

type Settings = {
  namaStudio: string;
  logoUrl: string;
  phone: string;
  email: string;
  address: string;
  socialMedia: Record<string, string>;
  bookingFields: Record<string, unknown>;
  notifications: Record<string, unknown>;
};

const defaultSettings: Settings = {
  namaStudio: 'PhotoStudio',
  logoUrl: '',
  phone: '',
  email: '',
  address: '',
  socialMedia: {},
  bookingFields: {},
  notifications: {},
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { data, isLoading, mutate } = useSWR<{ settings: Settings }>('/api/admin/settings', fetcher);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Settings>(defaultSettings);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (data?.settings) {
      setFormData({ ...defaultSettings, ...data.settings });
    }
  }, [data]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setMessage('Settings saved successfully!');
        mutate();
      } else {
        setMessage('Failed to save settings');
      }
    } catch (error) {
      setMessage('Failed to save settings');
    }

    setSaving(false);
  };

  const handleChange = (key: keyof Settings, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

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

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Settings</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="glass-card p-6">
          <h2 className="font-semibold text-slate-800 mb-4">Studio Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-1">Studio Name</label>
              <input
                type="text"
                value={formData.namaStudio}
                onChange={(e) => handleChange('namaStudio', e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-1">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-1">Phone</label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-1">Logo URL</label>
              <input
                type="text"
                value={formData.logoUrl}
                onChange={(e) => handleChange('logoUrl', e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm">
          <h2 className="font-semibold text-slate-900 mb-4">Address</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Studio Address</label>
              <textarea
                value={formData.address}
                onChange={(e) => handleChange('address', e.target.value)}
                rows={3}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                placeholder="Enter your studio address..."
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm">
          <h2 className="font-semibold text-slate-900 mb-4">JSON Settings</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Social Media (JSON)</label>
              <textarea
                value={JSON.stringify(formData.socialMedia, null, 2)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    setFormData((prev) => ({ ...prev, socialMedia: parsed }));
                  } catch {
                    // Invalid JSON, ignore
                  }
                }}
                rows={4}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 font-mono text-sm"
                placeholder='{"instagram": "@yourstudio", "facebook": "..."}'
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Button type="submit" disabled={saving} className="bg-amber-500 hover:bg-amber-600">
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
          {message && (
            <span className={message.includes('success') ? 'text-green-600' : 'text-red-600'}>
              {message}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
