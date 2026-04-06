'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import useSWR from 'swr';

type Settings = {
  appName: string;
  appLogo: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  businessDescription: string;
  bookingMessage: string;
  defaultMaxSelection: string;
  watermarkEnabled: string;
};

const defaultSettings: Settings = {
  appName: 'PhotoStudio',
  appLogo: '',
  contactEmail: '',
  contactPhone: '',
  address: '',
  businessDescription: '',
  bookingMessage: 'Terima kasih telah memilih foto-foto kami!',
  defaultMaxSelection: '20',
  watermarkEnabled: 'false',
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
      const entries = Object.entries(formData);
      for (const [key, value] of entries) {
        await fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value }),
        });
      }
      setMessage('Settings saved successfully!');
      mutate();
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
      <h1 className="text-2xl font-bold text-charcoal mb-6">Settings</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="glass-card p-6">
          <h2 className="font-semibold text-charcoal mb-4">General</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-warm-gray mb-1">App Name</label>
              <input
                type="text"
                value={formData.appName}
                onChange={(e) => handleChange('appName', e.target.value)}
                className="w-full px-4 py-2 glass-input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-warm-gray mb-1">Contact Email</label>
              <input
                type="email"
                value={formData.contactEmail}
                onChange={(e) => handleChange('contactEmail', e.target.value)}
                className="w-full px-4 py-2 glass-input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-warm-gray mb-1">Contact Phone</label>
              <input
                type="text"
                value={formData.contactPhone}
                onChange={(e) => handleChange('contactPhone', e.target.value)}
                className="w-full px-4 py-2 glass-input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-warm-gray mb-1">Default Max Selection</label>
              <input
                type="number"
                value={formData.defaultMaxSelection}
                onChange={(e) => handleChange('defaultMaxSelection', e.target.value)}
                className="w-full px-4 py-2 glass-input"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4">Business Info</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <textarea
                value={formData.address}
                onChange={(e) => handleChange('address', e.target.value)}
                rows={2}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Business Description</label>
              <textarea
                value={formData.businessDescription}
                onChange={(e) => handleChange('businessDescription', e.target.value)}
                rows={3}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4">Gallery Settings</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Booking Message</label>
              <textarea
                value={formData.bookingMessage}
                onChange={(e) => handleChange('bookingMessage', e.target.value)}
                rows={2}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="watermarkEnabled"
                checked={formData.watermarkEnabled === 'true'}
                onChange={(e) => handleChange('watermarkEnabled', e.target.checked ? 'true' : 'false')}
                className="rounded border-gray-300"
              />
              <label htmlFor="watermarkEnabled" className="text-sm text-gray-700">
                Enable watermark on photos
              </label>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
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