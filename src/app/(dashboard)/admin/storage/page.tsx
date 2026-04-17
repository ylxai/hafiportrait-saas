'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { LoadingSpinner } from '@/components/ui/loading';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RefreshCw, KeyRound, ShieldCheck, Clock, AlertCircle } from 'lucide-react';

type StorageAccount = {
  id: string;
  name: string;
  provider: 'CLOUDINARY' | 'R2';
  isActive: boolean;
  isDefault: boolean;
  priority: number;
  usedStorage: string; // BigInt serialized as string from API
  totalPhotos: number;
  rotationEnabled: boolean;
  rotationSchedule: string | null;
  rotationNextDate: string | null;
  isSecondaryActive: boolean;
  lastRotatedAt: string | null;
  createdAt: string;
};

type RotationDetail = {
  id: string;
  name: string;
  provider: 'CLOUDINARY' | 'R2';
  rotationEnabled: boolean;
  rotationSchedule: string | null;
  rotationNextDate: string | null;
  isSecondaryActive: boolean;
  lastRotatedAt: string | null;
  rotationHistory: { rotatedAt: string; initiatedBy: 'auto' | 'manual' }[];
  hasSecondaryApiKey: boolean;
  hasSecondaryApiSecret: boolean;
  hasSecondaryAccessKey: boolean;
  hasSecondarySecretKey: boolean;
};

type AccountsResponse = { data: { accounts: StorageAccount[] } };
type EnvConfig = {
  data: {
    cloudinary: { cloudName: string };
    r2: { accountId: string; bucketName: string; publicUrl: string; endpoint: string };
  };
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function formatBytes(bytesStr: string | number): string {
  const bytes = typeof bytesStr === 'string' ? parseInt(bytesStr, 10) : bytesStr;
  if (isNaN(bytes)) return '0 B';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function isOverdue(nextDate: string | null): boolean {
  if (!nextDate) return false;
  return new Date(nextDate) <= new Date();
}

export default function StorageAccountsPage() {
  const { data, isLoading, mutate } = useSWR<AccountsResponse>('/api/admin/storage-accounts', fetcher);
  const { data: configData } = useSWR<EnvConfig>('/api/admin/storage-config', fetcher);
  const accounts = data?.data?.accounts ?? [];
  const envConfig = configData?.data?.cloudinary?.cloudName || configData?.data?.r2?.bucketName;

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [showRotationModal, setShowRotationModal] = useState(false);
  const [rotationAccount, setRotationAccount] = useState<StorageAccount | null>(null);
  const [rotationDetail, setRotationDetail] = useState<RotationDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRotateNowDialog, setShowRotateNowDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StorageAccount | null>(null);

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

  // ─── Helpers ────────────────────────────────────────────────
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

  const openRotationModal = async (account: StorageAccount) => {
    setRotationAccount(account);
    setShowRotationModal(true);
    setLoadingDetail(true);
    setRotationDetail(null);
    try {
      const res = await fetch(`/api/admin/storage-accounts/rotation?accountId=${account.id}`);
      const json = await res.json();
      if (json.success) setRotationDetail(json.data.account as RotationDetail);
    } catch {
      toast.error('Gagal memuat detail rotasi');
    } finally {
      setLoadingDetail(false);
    }
  };

  // ─── Account CRUD ────────────────────────────────────────────
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
      const json = await res.json();

      if (res.ok && json.success) {
        toast.success(editingAccount ? 'Akun berhasil diperbarui' : 'Akun berhasil ditambahkan');
        await mutate();
        setShowModal(false);
        resetForm();
      } else {
        toast.error(json.error ?? 'Gagal menyimpan akun');
      }
    } catch {
      toast.error('Terjadi kesalahan saat menyimpan akun');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = (account: StorageAccount) => {
    setDeleteTarget(account);
    setShowDeleteDialog(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/admin/storage-accounts?id=${deleteTarget.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(`Akun "${deleteTarget.name}" berhasil dihapus`);
        await mutate();
      } else {
        toast.error(json.error ?? 'Gagal menghapus akun');
      }
    } catch {
      toast.error('Terjadi kesalahan saat menghapus akun');
    } finally {
      setShowDeleteDialog(false);
      setDeleteTarget(null);
    }
  };

  const handleToggleActive = async (account: StorageAccount) => {
    try {
      const res = await fetch('/api/admin/storage-accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: account.id, isActive: !account.isActive }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(account.isActive ? 'Akun dinonaktifkan' : 'Akun diaktifkan');
        await mutate();
      } else {
        toast.error(json.error ?? 'Gagal mengubah status akun');
      }
    } catch {
      toast.error('Terjadi kesalahan');
    }
  };

  const handleSetDefault = async (account: StorageAccount) => {
    try {
      const res = await fetch('/api/admin/storage-accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: account.id, isDefault: true }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(`"${account.name}" dijadikan akun default`);
        await mutate();
      } else {
        toast.error(json.error ?? 'Gagal mengatur default');
      }
    } catch {
      toast.error('Terjadi kesalahan');
    }
  };

  // ─── Rotation handlers ───────────────────────────────────────
  const handleSetSecondaryCredentials = async () => {
    if (!rotationAccount) return;
    setSubmitting(true);
    try {
      const credentials: Record<string, string> = {};
      if (rotationAccount.provider === 'CLOUDINARY') {
        if (!rotationForm.secondaryApiKey || !rotationForm.secondaryApiSecret) {
          toast.error('API Key dan API Secret wajib diisi untuk Cloudinary');
          return;
        }
        credentials.apiKey = rotationForm.secondaryApiKey;
        credentials.apiSecret = rotationForm.secondaryApiSecret;
      } else {
        if (!rotationForm.secondaryAccessKey || !rotationForm.secondarySecretKey) {
          toast.error('Access Key dan Secret Key wajib diisi untuk R2');
          return;
        }
        credentials.accessKey = rotationForm.secondaryAccessKey;
        credentials.secretKey = rotationForm.secondarySecretKey;
      }

      const res = await fetch('/api/admin/storage-accounts/rotation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: rotationAccount.id, action: 'set-secondary', credentials }),
      });
      const json = await res.json();

      if (res.ok && json.success) {
        toast.success('Secondary credentials berhasil disimpan');
        setRotationForm({ schedule: 'monthly', secondaryApiKey: '', secondaryApiSecret: '', secondaryAccessKey: '', secondarySecretKey: '' });
        await mutate();
        // Refresh detail
        await openRotationModal(rotationAccount);
      } else {
        toast.error(json.error ?? 'Gagal menyimpan secondary credentials');
      }
    } catch {
      toast.error('Terjadi kesalahan');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEnableRotation = async () => {
    if (!rotationAccount) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/storage-accounts/rotation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: rotationAccount.id,
          action: 'enable-rotation',
          schedule: { frequency: rotationForm.schedule as 'daily' | 'weekly' | 'monthly' },
        }),
      });
      const json = await res.json();

      if (res.ok && json.success) {
        toast.success(`Auto-rotation aktif (${rotationForm.schedule})`);
        await mutate();
        await openRotationModal(rotationAccount);
      } else {
        toast.error(json.error ?? 'Gagal mengaktifkan rotation');
      }
    } catch {
      toast.error('Terjadi kesalahan');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisableRotation = async (accountId: string) => {
    try {
      const res = await fetch('/api/admin/storage-accounts/rotation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, action: 'disable-rotation' }),
      });
      const json = await res.json();

      if (res.ok && json.success) {
        toast.success('Auto-rotation dinonaktifkan');
        await mutate();
        if (rotationAccount) await openRotationModal(rotationAccount);
      } else {
        toast.error(json.error ?? 'Gagal menonaktifkan rotation');
      }
    } catch {
      toast.error('Terjadi kesalahan');
    }
  };

  const handleRotateNow = async () => {
    if (!rotationAccount) return;
    try {
      const res = await fetch('/api/admin/storage-accounts/rotation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: rotationAccount.id, action: 'rotate-now' }),
      });
      const json = await res.json();

      if (res.ok && json.success) {
        toast.success('Credentials berhasil dirotasi. Secondary key sekarang menjadi primary.');
        await mutate();
        await openRotationModal(rotationAccount);
      } else {
        toast.error(json.error ?? 'Gagal merotasi credentials');
      }
    } catch {
      toast.error('Terjadi kesalahan saat rotasi');
    } finally {
      setShowRotateNowDialog(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  const cloudinaryAccounts = accounts.filter((a) => a.provider === 'CLOUDINARY');
  const r2Accounts = accounts.filter((a) => a.provider === 'R2');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Storage Accounts</h1>
        <Button onClick={() => { resetForm(); setShowModal(true); }}>
          + Tambah Akun
        </Button>
      </div>

      {/* Env Config Info */}
      {envConfig && (
        <div className="mb-6 p-4 bg-card border border-border rounded-lg">
          <h3 className="font-medium text-foreground mb-2">Konfigurasi dari .env</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {configData?.data?.cloudinary?.cloudName && (
              <div>
                <span className="text-muted-foreground">Cloudinary:</span>
                <span className="ml-2 font-medium text-foreground">{configData.data.cloudinary.cloudName}</span>
              </div>
            )}
            {configData?.data?.r2?.bucketName && (
              <div>
                <span className="text-muted-foreground">R2 Bucket:</span>
                <span className="ml-2 font-medium text-foreground">{configData.data.r2.bucketName}</span>
              </div>
            )}
            {configData?.data?.r2?.publicUrl && (
              <div>
                <span className="text-muted-foreground">R2 Public URL:</span>
                <span className="ml-2 font-medium text-foreground">{configData.data.r2.publicUrl}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Cloudinary */}
        <div className="bg-card/50 backdrop-blur-xl border border-border shadow-2xl rounded-3xl p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Cloudinary</h2>
          {cloudinaryAccounts.length === 0 && !configData?.data?.cloudinary?.cloudName ? (
            <p className="text-muted-foreground text-sm">Belum ada akun Cloudinary</p>
          ) : (
            <div className="space-y-3">
              {cloudinaryAccounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  onToggleActive={() => handleToggleActive(account)}
                  onSetDefault={() => handleSetDefault(account)}
                  onEdit={() => openEdit(account)}
                  onDelete={() => confirmDelete(account)}
                  onRotation={() => openRotationModal(account)}
                />
              ))}
            </div>
          )}
        </div>

        {/* R2 */}
        <div className="bg-card/50 backdrop-blur-xl border border-border shadow-2xl rounded-3xl p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Cloudflare R2</h2>
          {r2Accounts.length === 0 && !configData?.data?.r2?.bucketName ? (
            <p className="text-muted-foreground text-sm">Belum ada akun R2</p>
          ) : (
            <div className="space-y-3">
              {r2Accounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  onToggleActive={() => handleToggleActive(account)}
                  onSetDefault={() => handleSetDefault(account)}
                  onEdit={() => openEdit(account)}
                  onDelete={() => confirmDelete(account)}
                  onRotation={() => openRotationModal(account)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Add/Edit Account Modal ─────────────────────────── */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAccount ? 'Edit Akun Storage' : 'Tambah Akun Storage'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Nama Akun</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="Akun Utama / Backup 1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Provider</label>
              <select
                value={formData.provider}
                onChange={(e) => setFormData({ ...formData, provider: e.target.value as 'CLOUDINARY' | 'R2' })}
                className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="CLOUDINARY">Cloudinary (Thumbnails)</option>
                <option value="R2">Cloudflare R2 (Original)</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Prioritas</label>
                <input
                  type="number"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="flex items-center pt-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isDefault}
                    onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm text-foreground">Jadikan default</span>
                </label>
              </div>
            </div>

            {formData.provider === 'CLOUDINARY' && (
              <div className="space-y-3 p-3 bg-muted rounded-lg">
                <h3 className="text-sm font-medium text-foreground">Cloudinary Credentials</h3>
                {['cloudName', 'apiKey', 'uploadPreset'].map((field) => (
                  <div key={field}>
                    <label className="block text-xs text-muted-foreground mb-1">
                      {field === 'cloudName' ? 'Cloud Name' : field === 'apiKey' ? 'API Key' : 'Upload Preset (Unsigned)'}
                    </label>
                    <input
                      type="text"
                      value={formData[field as keyof typeof formData] as string}
                      onChange={(e) => setFormData({ ...formData, [field]: e.target.value })}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">API Secret</label>
                  <input
                    type="password"
                    value={formData.apiSecret}
                    onChange={(e) => setFormData({ ...formData, apiSecret: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
            )}

            {formData.provider === 'R2' && (
              <div className="space-y-3 p-3 bg-muted rounded-lg">
                <h3 className="text-sm font-medium text-foreground">R2 Credentials</h3>
                {[
                  { field: 'accountId', label: 'Account ID', type: 'text' },
                  { field: 'accessKey', label: 'Access Key', type: 'text' },
                  { field: 'secretKey', label: 'Secret Key', type: 'password' },
                  { field: 'bucketName', label: 'Bucket Name', type: 'text' },
                  { field: 'publicUrl', label: 'Public URL', type: 'text' },
                  { field: 'endpoint', label: 'Endpoint (optional)', type: 'text' },
                ].map(({ field, label, type }) => (
                  <div key={field}>
                    <label className="block text-xs text-muted-foreground mb-1">{label}</label>
                    <input
                      type={type}
                      value={formData[field as keyof typeof formData] as string}
                      onChange={(e) => setFormData({ ...formData, [field]: e.target.value })}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                ))}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Menyimpan...' : 'Simpan'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ───────────────────────────── */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus Akun Storage</DialogTitle>
            <DialogDescription>
              Yakin ingin menghapus akun <strong>&quot;{deleteTarget?.name}&quot;</strong>? Tindakan ini tidak bisa dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Batal</Button>
            <Button variant="destructive" onClick={handleDelete}>Hapus</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Rotate Now Confirmation ───────────────────────── */}
      <Dialog open={showRotateNowDialog} onOpenChange={setShowRotateNowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Konfirmasi Rotasi Credentials</DialogTitle>
            <DialogDescription>
              Secondary credentials akan dipromosikan menjadi primary, dan secondary lama akan dihapus.
              Pastikan secondary credentials sudah dikonfigurasi dan valid sebelum melanjutkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRotateNowDialog(false)}>Batal</Button>
            <Button onClick={handleRotateNow}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Rotasi Sekarang
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Key Rotation Modal ────────────────────────────── */}
      <Dialog open={showRotationModal} onOpenChange={setShowRotationModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5" />
              Key Rotation — {rotationAccount?.name}
            </DialogTitle>
            <DialogDescription>
              Kelola rotasi credential otomatis dan manual untuk akun storage ini.
            </DialogDescription>
          </DialogHeader>

          {loadingDetail ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner size="md" />
            </div>
          ) : rotationDetail ? (
            <div className="space-y-5">
              {/* Status Card */}
              <div className="p-4 bg-muted rounded-lg space-y-1.5 text-sm">
                <div className="flex items-center gap-2 font-medium text-foreground mb-2">
                  <ShieldCheck className="w-4 h-4" />
                  Status Saat Ini
                </div>
                <StatusRow label="Auto-rotation" value={rotationDetail.rotationEnabled ? '✅ Aktif' : '⏸ Nonaktif'} />
                {rotationDetail.rotationSchedule && (
                  <StatusRow label="Jadwal" value={rotationDetail.rotationSchedule} />
                )}
                {rotationDetail.rotationNextDate && (
                  <StatusRow
                    label="Rotasi berikutnya"
                    value={formatDate(rotationDetail.rotationNextDate)}
                    alert={isOverdue(rotationDetail.rotationNextDate)}
                  />
                )}
                {rotationDetail.lastRotatedAt && (
                  <StatusRow label="Terakhir dirotasi" value={formatDate(rotationDetail.lastRotatedAt)} />
                )}
                <StatusRow
                  label="Secondary credentials"
                  value={
                    rotationDetail.provider === 'CLOUDINARY'
                      ? rotationDetail.hasSecondaryApiKey && rotationDetail.hasSecondaryApiSecret
                        ? '✅ Tersimpan'
                        : '❌ Belum diset'
                      : rotationDetail.hasSecondaryAccessKey && rotationDetail.hasSecondarySecretKey
                        ? '✅ Tersimpan'
                        : '❌ Belum diset'
                  }
                />
              </div>

              {/* Auto-rotation toggle */}
              {!rotationDetail.rotationEnabled ? (
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-foreground">Aktifkan Auto-rotation</label>
                  <select
                    value={rotationForm.schedule}
                    onChange={(e) => setRotationForm({ ...rotationForm, schedule: e.target.value })}
                    className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="daily">Daily (setiap hari)</option>
                    <option value="weekly">Weekly (setiap minggu)</option>
                    <option value="monthly">Monthly (setiap bulan)</option>
                  </select>
                  <Button className="w-full" onClick={handleEnableRotation} disabled={submitting}>
                    Aktifkan Auto-Rotation
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => setShowRotateNowDialog(true)}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Rotasi Sekarang
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 text-destructive border-destructive/40 hover:bg-destructive/10"
                    onClick={() => handleDisableRotation(rotationDetail.id)}
                  >
                    Nonaktifkan
                  </Button>
                </div>
              )}

              <hr className="border-border" />

              {/* Set Secondary Credentials */}
              <div className="space-y-3">
                <h3 className="font-medium text-foreground text-sm">Set Secondary Credentials</h3>
                <p className="text-xs text-muted-foreground">
                  Masukkan credential baru. Setelah disimpan, gunakan &quot;Rotasi Sekarang&quot; untuk mengaktifkannya.
                </p>

                {rotationDetail.provider === 'CLOUDINARY' ? (
                  <>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">New API Key</label>
                      <input
                        type="text"
                        value={rotationForm.secondaryApiKey}
                        onChange={(e) => setRotationForm({ ...rotationForm, secondaryApiKey: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                        placeholder="API Key baru"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">New API Secret</label>
                      <input
                        type="password"
                        value={rotationForm.secondaryApiSecret}
                        onChange={(e) => setRotationForm({ ...rotationForm, secondaryApiSecret: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                        placeholder="API Secret baru"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">New Access Key</label>
                      <input
                        type="text"
                        value={rotationForm.secondaryAccessKey}
                        onChange={(e) => setRotationForm({ ...rotationForm, secondaryAccessKey: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                        placeholder="Access Key baru"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">New Secret Key</label>
                      <input
                        type="password"
                        value={rotationForm.secondarySecretKey}
                        onChange={(e) => setRotationForm({ ...rotationForm, secondarySecretKey: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                        placeholder="Secret Key baru"
                      />
                    </div>
                  </>
                )}

                <Button className="w-full" onClick={handleSetSecondaryCredentials} disabled={submitting}>
                  Simpan Secondary Credentials
                </Button>
              </div>

              {/* Rotation History */}
              {rotationDetail.rotationHistory.length > 0 && (
                <>
                  <hr className="border-border" />
                  <div>
                    <h3 className="font-medium text-foreground text-sm flex items-center gap-2 mb-3">
                      <Clock className="w-4 h-4" />
                      Riwayat Rotasi (terakhir {rotationDetail.rotationHistory.length})
                    </h3>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {[...rotationDetail.rotationHistory].reverse().map((entry, idx) => (
                        <div key={idx} className="flex justify-between text-xs text-muted-foreground">
                          <span>{new Date(entry.rotatedAt).toLocaleString('id-ID')}</span>
                          <span className={entry.initiatedBy === 'auto' ? 'text-primary' : 'text-foreground'}>
                            {entry.initiatedBy === 'auto' ? '🤖 Auto' : '👤 Manual'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-4">Gagal memuat data rotasi</p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRotationModal(false)}>
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AccountCard({
  account,
  onToggleActive,
  onSetDefault,
  onEdit,
  onDelete,
  onRotation,
}: {
  account: StorageAccount;
  onToggleActive: () => void;
  onSetDefault: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRotation: () => void;
}) {
  const overdue = isOverdue(account.rotationNextDate) && account.rotationEnabled;

  return (
    <div className={`p-4 rounded-lg border transition-colors ${account.isDefault ? 'border-primary bg-primary/5' : 'border-border'}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="font-medium text-foreground">{account.name}</span>
          {account.isDefault && (
            <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">Default</span>
          )}
          {account.rotationEnabled && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${overdue ? 'bg-destructive/20 text-destructive' : 'bg-card text-muted-foreground border border-border'}`}>
              {overdue ? '⚠ Overdue' : '🔄 Auto-rotate'}
            </span>
          )}
          {account.isSecondaryActive && (
            <span className="text-xs bg-card text-muted-foreground border border-border px-2 py-0.5 rounded-full">
              Secondary siap
            </span>
          )}
        </div>
      </div>

      <div className="text-xs text-muted-foreground mb-1">
        {account.totalPhotos} foto • {formatBytes(account.usedStorage)} digunakan
      </div>

      {account.rotationNextDate && (
        <div className={`text-xs mb-2 ${overdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
          Rotasi berikutnya: {new Date(account.rotationNextDate).toLocaleDateString('id-ID')}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mt-2">
        <button
          type="button"
          onClick={onToggleActive}
          className={`text-xs px-2 py-1 rounded cursor-pointer transition-colors ${
            account.isActive
              ? 'bg-primary/10 text-primary border border-primary/20'
              : 'bg-muted text-muted-foreground border border-border'
          }`}
        >
          {account.isActive ? 'Aktif' : 'Nonaktif'}
        </button>
        <button
          type="button"
          onClick={onRotation}
          className="text-xs text-primary hover:underline cursor-pointer flex items-center gap-1"
        >
          <KeyRound className="w-3 h-3" />
          Key Rotation
        </button>
        {!account.isDefault && (
          <button type="button" onClick={onSetDefault} className="text-xs text-muted-foreground hover:text-foreground hover:underline cursor-pointer">
            Jadikan Default
          </button>
        )}
        <button type="button" onClick={onEdit} className="text-xs text-muted-foreground hover:text-foreground hover:underline cursor-pointer">
          Edit
        </button>
        <button type="button" onClick={onDelete} className="text-xs text-destructive hover:underline cursor-pointer">
          Hapus
        </button>
      </div>
    </div>
  );
}

function StatusRow({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${alert ? 'text-destructive flex items-center gap-1' : 'text-foreground'}`}>
        {alert && <AlertCircle className="w-3 h-3" />}
        {value}
      </span>
    </div>
  );
}
