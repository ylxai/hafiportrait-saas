'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';

type StorageAccount = {
  id: string;
  name: string;
  provider: 'CLOUDINARY' | 'R2';
  isActive: boolean;
  isDefault: boolean;
  priority: number;
  usedStorage: bigint;
  totalPhotos: number;
  rotationEnabled: boolean;
  rotationSchedule: string | null;
  rotationNextDate: string | null;
  isSecondaryActive: boolean;
  lastRotatedAt: string | null;
  createdAt: string;
};

type AccountsResponse = { accounts: StorageAccount[] };
type EnvConfig = {
  cloudinary: { cloudName: string };
  r2: { accountId: string; bucketName: string; publicUrl: string; endpoint: string };
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function formatBytes(bytes: bigint): string {
  const gb = Number(bytes) / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = Number(bytes) / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

export default function StorageAccountsPage() {
  const { data, isLoading, mutate } = useSWR<AccountsResponse>('/api/admin/storage-accounts', fetcher);
  const { data: configData } = useSWR<EnvConfig>('/api/admin/storage-config', fetcher);
  const { data: rotationData } = useSWR('/api/admin/storage-accounts/rotation', fetcher);
  const accounts = data?.accounts ?? [];
  const envConfig = configData?.cloudinary?.cloudName || configData?.r2?.bucketName;

  const [showModal, setShowModal] = useState(false);
  const [showRotationModal, setShowRotationModal] = useState(false);
  const [rotationAccount, setRotationAccount] = useState<StorageAccount | null>(null);
  const [editingAccount, setEditingAccount] = useState<StorageAccount | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    provider: 'CLOUDINARY',
    isActive: true,
    isDefault: false,
    priority: 0,
    cloudName: '',
    apiKey: '',
    apiSecret: '',
    uploadPreset: '',
    accountId: '',
    accessKey: '',
    secretKey: '',
    bucketName: '',
    publicUrl: '',
    endpoint: '',
  });
  const [rotationForm, setRotationForm] = useState({
    schedule: 'monthly',
    secondaryApiKey: '',
    secondaryApiSecret: '',
    secondaryAccessKey: '',
    secondarySecretKey: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const url = editingAccount
        ? `/api/admin/storage-accounts?id=${editingAccount.id}`
        : '/api/admin/storage-accounts';
      const method = editingAccount ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        mutate();
        setShowModal(false);
        resetForm();
      }
    } catch (error) {
      console.error('Error saving account:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus akun storage ini?')) return;

    try {
      await fetch(`/api/admin/storage-accounts?id=${id}`, { method: 'DELETE' });
      mutate();
    } catch (error) {
      console.error('Error deleting account:', error);
    }
  };

  const handleToggleActive = async (account: StorageAccount) => {
    try {
      await fetch('/api/admin/storage-accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: account.id, isActive: !account.isActive }),
      });
      mutate();
    } catch (error) {
      console.error('Error toggling account:', error);
    }
  };

  const handleSetDefault = async (account: StorageAccount) => {
    try {
      await fetch('/api/admin/storage-accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: account.id, isDefault: true }),
      });
      mutate();
    } catch (error) {
      console.error('Error setting default:', error);
    }
  };

  const handleSetSecondaryCredentials = async () => {
    if (!rotationAccount) return;
    setSubmitting(true);
    try {
      const credentials: Record<string, string> = {};
      if (rotationAccount.provider === 'CLOUDINARY') {
        if (rotationForm.secondaryApiKey) credentials.apiKey = rotationForm.secondaryApiKey;
        if (rotationForm.secondaryApiSecret) credentials.apiSecret = rotationForm.secondaryApiSecret;
      } else {
        if (rotationForm.secondaryAccessKey) credentials.accessKey = rotationForm.secondaryAccessKey;
        if (rotationForm.secondarySecretKey) credentials.secretKey = rotationForm.secondarySecretKey;
      }
      await fetch('/api/admin/storage-accounts/rotation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: rotationAccount.id,
          action: 'set-secondary',
          credentials,
        }),
      });
      setShowRotationModal(false);
      setRotationForm({
        schedule: 'monthly',
        secondaryApiKey: '',
        secondaryApiSecret: '',
        secondaryAccessKey: '',
        secondarySecretKey: '',
      });
      mutate();
    } catch (error) {
      console.error('Error setting secondary credentials:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEnableRotation = async () => {
    if (!rotationAccount) return;
    setSubmitting(true);
    try {
      await fetch('/api/admin/storage-accounts/rotation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: rotationAccount.id,
          action: 'enable-rotation',
          schedule: { frequency: rotationForm.schedule as 'daily' | 'weekly' | 'monthly' },
        }),
      });
      setShowRotationModal(false);
      mutate();
    } catch (error) {
      console.error('Error enabling rotation:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisableRotation = async (accountId: string) => {
    try {
      await fetch('/api/admin/storage-accounts/rotation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, action: 'disable-rotation' }),
      });
      mutate();
    } catch (error) {
      console.error('Error disabling rotation:', error);
    }
  };

  const handleRotateNow = async (accountId: string) => {
    if (!confirm('Rotasi credentials sekarang? Ini akan menukar API key aktif dengan secondary.')) return;
    try {
      await fetch('/api/admin/storage-accounts/rotation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, action: 'rotate-now' }),
      });
      mutate();
    } catch (error) {
      console.error('Error rotating credentials:', error);
    }
  };

  const openRotationModal = (account: StorageAccount) => {
    setRotationAccount(account);
    setShowRotationModal(true);
  };

  const resetForm = () => {
    setEditingAccount(null);
    setFormData({
      name: '',
      provider: 'CLOUDINARY',
      isActive: true,
      isDefault: false,
      priority: 0,
      cloudName: '',
      apiKey: '',
      apiSecret: '',
      uploadPreset: '',
      accountId: '',
      accessKey: '',
      secretKey: '',
      bucketName: '',
      publicUrl: '',
      endpoint: '',
    });
  };

  const openEdit = (account: StorageAccount) => {
    setEditingAccount(account);
    setFormData({
      name: account.name,
      provider: account.provider,
      isActive: account.isActive,
      isDefault: account.isDefault,
      priority: account.priority,
      cloudName: '',
      apiKey: '',
      apiSecret: '',
      uploadPreset: '',
      accountId: '',
      accessKey: '',
      secretKey: '',
      bucketName: '',
      publicUrl: '',
      endpoint: '',
    });
    setShowModal(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  const cloudinaryAccounts = accounts.filter((a) => a.provider === 'CLOUDINARY');
  const r2Accounts = accounts.filter((a) => a.provider === 'R2');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Storage Accounts</h1>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition"
        >
          + Tambah Akun
        </button>
      </div>

      {/* Env Config Info */}
      {envConfig && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-medium text-blue-800 mb-2">Konfigurasi dari .env</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {configData?.cloudinary?.cloudName && (
              <div>
                <span className="text-slate-500">Cloudinary:</span>
                <span className="ml-2 font-medium">{configData.cloudinary.cloudName}</span>
              </div>
            )}
            {configData?.r2?.bucketName && (
              <div>
                <span className="text-slate-500">R2 Bucket:</span>
                <span className="ml-2 font-medium">{configData.r2.bucketName}</span>
              </div>
            )}
            {configData?.r2?.publicUrl && (
              <div>
                <span className="text-slate-500">R2 Public URL:</span>
                <span className="ml-2 font-medium">{configData.r2.publicUrl}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Cloudinary */}
        <div className="glass-card p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Cloudinary</h2>
          
          {cloudinaryAccounts.length === 0 && !configData?.cloudinary?.cloudName ? (
            <p className="text-slate-500 text-sm">Belum ada akun Cloudinary</p>
          ) : (
            <div className="space-y-3">
              {cloudinaryAccounts.map((account) => (
                <div key={account.id} className={`p-4 rounded-lg border ${account.isDefault ? 'border-champagne-500 bg-amber-50' : 'border-champagne-100'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="font-medium text-slate-800">{account.name}</span>
                      {account.isDefault && <span className="ml-2 text-xs bg-amber-500 text-white px-2 py-0.5 rounded">Default</span>}
                      {account.rotationEnabled && (
                        <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">🔄 Auto-rotate</span>
                      )}
                      {account.isSecondaryActive && (
                        <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">Secondary Active</span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 mb-2">
                    {account.totalPhotos} foto • {formatBytes(account.usedStorage)} digunakan
                  </div>
                  {account.rotationNextDate && (
                    <div className="text-xs text-blue-600 mb-2">
                      Next rotation: {new Date(account.rotationNextDate).toLocaleDateString('id-ID')}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleToggleActive(account)}
                      className={`text-xs px-2 py-1 rounded cursor-pointer ${account.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}
                    >
                      {account.isActive ? 'Aktif' : 'Nonaktif'}
                    </button>
                    <button onClick={() => openRotationModal(account)} className="text-xs text-blue-600 hover:underline cursor-pointer">Key Rotation</button>
                    {!account.isDefault && (
                      <button onClick={() => handleSetDefault(account)} className="text-xs text-amber-600 hover:underline cursor-pointer">Jadikan Default</button>
                    )}
                    <button onClick={() => openEdit(account)} className="text-xs text-blue-600 hover:underline cursor-pointer">Edit</button>
                    <button onClick={() => handleDelete(account.id)} className="text-xs text-red-600 hover:underline cursor-pointer">Hapus</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* R2 */}
        <div className="glass-card p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Cloudflare R2</h2>
          
          {r2Accounts.length === 0 && !configData?.r2?.bucketName ? (
            <p className="text-slate-500 text-sm">Belum ada akun R2</p>
          ) : (
            <div className="space-y-3">
              {r2Accounts.map((account) => (
                <div key={account.id} className={`p-4 rounded-lg border ${account.isDefault ? 'border-champagne-500 bg-amber-50' : 'border-champagne-100'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="font-medium text-slate-800">{account.name}</span>
                      {account.isDefault && <span className="ml-2 text-xs bg-amber-500 text-white px-2 py-0.5 rounded">Default</span>}
                      {account.rotationEnabled && (
                        <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">🔄 Auto-rotate</span>
                      )}
                      {account.isSecondaryActive && (
                        <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">Secondary Active</span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 mb-2">
                    {account.totalPhotos} foto • {formatBytes(account.usedStorage)} digunakan
                  </div>
                  {account.rotationNextDate && (
                    <div className="text-xs text-blue-600 mb-2">
                      Next rotation: {new Date(account.rotationNextDate).toLocaleDateString('id-ID')}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleToggleActive(account)}
                      className={`text-xs px-2 py-1 rounded cursor-pointer ${account.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}
                    >
                      {account.isActive ? 'Aktif' : 'Nonaktif'}
                    </button>
                    <button onClick={() => openRotationModal(account)} className="text-xs text-blue-600 hover:underline cursor-pointer">Key Rotation</button>
                    {!account.isDefault && (
                      <button onClick={() => handleSetDefault(account)} className="text-xs text-amber-600 hover:underline cursor-pointer">Jadikan Default</button>
                    )}
                    <button onClick={() => openEdit(account)} className="text-xs text-blue-600 hover:underline cursor-pointer">Edit</button>
                    <button onClick={() => handleDelete(account.id)} className="text-xs text-red-600 hover:underline cursor-pointer">Hapus</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-slate-900 mb-4">
              {editingAccount ? 'Edit Akun Storage' : 'Tambah Akun Storage'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nama Akun</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                  placeholder="Akun Utama / Backup 1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Provider</label>
                <select
                  value={formData.provider}
                  onChange={(e) => setFormData({ ...formData, provider: e.target.value as 'CLOUDINARY' | 'R2' })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                >
                  <option value="CLOUDINARY">Cloudinary (Thumbnails)</option>
                  <option value="R2">Cloudflare R2 (Original)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Prioritas</label>
                  <input
                    type="number"
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                    placeholder="0"
                  />
                </div>
                <div className="flex items-center pt-6">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.isDefault}
                      onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                      className="rounded"
                    />
                    <span className="text-sm text-slate-700">Jadikan default</span>
                  </label>
                </div>
              </div>

              {formData.provider === 'CLOUDINARY' && (
                <div className="space-y-3 p-3 bg-slate-50 rounded-lg">
                  <h3 className="text-sm font-medium text-slate-700">Cloudinary Credentials</h3>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Cloud Name</label>
                    <input
                      type="text"
                      value={formData.cloudName}
                      onChange={(e) => setFormData({ ...formData, cloudName: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">API Key</label>
                    <input
                      type="text"
                      value={formData.apiKey}
                      onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">API Secret</label>
                    <input
                      type="password"
                      value={formData.apiSecret}
                      onChange={(e) => setFormData({ ...formData, apiSecret: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Upload Preset (Unsigned)</label>
                    <input
                      type="text"
                      value={formData.uploadPreset}
                      onChange={(e) => setFormData({ ...formData, uploadPreset: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                </div>
              )}

              {formData.provider === 'R2' && (
                <div className="space-y-3 p-3 bg-slate-50 rounded-lg">
                  <h3 className="text-sm font-medium text-slate-700">R2 Credentials</h3>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Account ID</label>
                    <input
                      type="text"
                      value={formData.accountId}
                      onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Access Key</label>
                    <input
                      type="text"
                      value={formData.accessKey}
                      onChange={(e) => setFormData({ ...formData, accessKey: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Secret Key</label>
                    <input
                      type="password"
                      value={formData.secretKey}
                      onChange={(e) => setFormData({ ...formData, secretKey: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Bucket Name</label>
                    <input
                      type="text"
                      value={formData.bucketName}
                      onChange={(e) => setFormData({ ...formData, bucketName: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Public URL</label>
                    <input
                      type="text"
                      value={formData.publicUrl}
                      onChange={(e) => setFormData({ ...formData, publicUrl: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Endpoint (optional)</label>
                    <input
                      type="text"
                      value={formData.endpoint}
                      onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-champagne-200 text-slate-800 rounded-lg hover:bg-amber-50">
                  Batal
                </button>
                <button type="submit" disabled={submitting} className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50">
                  {submitting ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Key Rotation Modal */}
      {showRotationModal && rotationAccount && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-slate-800 mb-4">
              Key Rotation - {rotationAccount.name}
            </h2>
            
            <div className="space-y-4">
              <div className="p-3 bg-amber-50 rounded-lg">
                <p className="text-sm text-slate-800">
                  <strong>Current Status:</strong><br />
                  Rotation: {rotationAccount.rotationEnabled ? 'Enabled' : 'Disabled'}<br />
                  {rotationAccount.rotationSchedule && `Schedule: ${rotationAccount.rotationSchedule}`}<br />
                  {rotationAccount.rotationNextDate && `Next: ${new Date(rotationAccount.rotationNextDate).toLocaleDateString('id-ID')}`}
                </p>
              </div>

              {!rotationAccount.rotationEnabled ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-800 mb-1">Jadwal Rotasi</label>
                    <select
                      value={rotationForm.schedule}
                      onChange={(e) => setRotationForm({ ...rotationForm, schedule: e.target.value })}
                      className="w-full px-4 py-2 border border-champagne-200 rounded-lg"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                  
                  <button
                    onClick={handleEnableRotation}
                    disabled={submitting}
                    className="w-full px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
                  >
                    Aktifkan Auto-Rotation
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => handleRotateNow(rotationAccount.id)}
                    className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                  >
                    Rotasi Sekarang
                  </button>
                  
                  <button
                    onClick={() => handleDisableRotation(rotationAccount.id)}
                    className="w-full px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                  >
                    Matikan Auto-Rotation
                  </button>
                </>
              )}

              <hr className="border-champagne-200" />
              
              <h3 className="font-medium text-slate-800">Set Secondary Credentials</h3>
              <p className="text-xs text-slate-500">
                Masukkan credential baru yang akan digunakan setelah rotasi.
              </p>
              
              {rotationAccount.provider === 'CLOUDINARY' ? (
                <>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">New API Key</label>
                    <input
                      type="text"
                      value={rotationForm.secondaryApiKey}
                      onChange={(e) => setRotationForm({ ...rotationForm, secondaryApiKey: e.target.value })}
                      className="w-full px-3 py-2 border border-champagne-200 rounded-lg text-sm"
                      placeholder="API Key baru"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">New API Secret</label>
                    <input
                      type="password"
                      value={rotationForm.secondaryApiSecret}
                      onChange={(e) => setRotationForm({ ...rotationForm, secondaryApiSecret: e.target.value })}
                      className="w-full px-3 py-2 border border-champagne-200 rounded-lg text-sm"
                      placeholder="API Secret baru"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">New Access Key</label>
                    <input
                      type="text"
                      value={rotationForm.secondaryAccessKey}
                      onChange={(e) => setRotationForm({ ...rotationForm, secondaryAccessKey: e.target.value })}
                      className="w-full px-3 py-2 border border-champagne-200 rounded-lg text-sm"
                      placeholder="Access Key baru"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">New Secret Key</label>
                    <input
                      type="password"
                      value={rotationForm.secondarySecretKey}
                      onChange={(e) => setRotationForm({ ...rotationForm, secondarySecretKey: e.target.value })}
                      className="w-full px-3 py-2 border border-champagne-200 rounded-lg text-sm"
                      placeholder="Secret Key baru"
                    />
                  </div>
                </>
              )}
              
              <button
                onClick={handleSetSecondaryCredentials}
                disabled={submitting}
                className="w-full px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
              >
                Simpan Secondary Credentials
              </button>
            </div>
            
            <div className="flex gap-3 pt-4 mt-4 border-t border-champagne-200">
              <button type="button" onClick={() => setShowRotationModal(false)} className="flex-1 px-4 py-2 border border-champagne-200 text-slate-800 rounded-lg hover:bg-amber-50">
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}