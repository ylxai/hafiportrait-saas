'use client';

import { useState, use } from 'react';
import useSWR from 'swr';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { formatBigIntFileSize } from '@/lib/bigint-utils';
import { CheckCircle2, AlertCircle, Clock, Upload, Printer, ArrowLeft, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface Payment {
  id: string;
  amount: number;
  uniqueCode: number;
  type: string;
  status: string;
  proofUrl: string | null;
}

interface EventData {
  id: string;
  kodeBooking: string;
  namaProject: string;
  eventDate: string;
  createdAt: string;
  location: string;
  status: string;
  paymentStatus: string;
  totalPrice: number;
  paidAmount: number;
  client: {
    nama: string;
    email: string;
    phone: string;
  };
  package: {
    nama: string;
    price: number;
  } | null;
  payments: Payment[];
}

export default function InvoicePage({ params }: { params: Promise<{ kodeBooking: string }> }) {
  const { kodeBooking } = use(params);
  const { data, error, isLoading, mutate } = useSWR<{ success: boolean, data: EventData }>(
    `/api/public/booking/${kodeBooking}`,
    fetcher,
    { refreshInterval: 30000, revalidateOnFocus: true }
  );

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const event = data?.data;

  const handleCopy = (text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(label);
    toast.success(`${label} berhasil disalin`);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleUpload = async () => {
    if (!selectedFile || !event) return;
    
    const pendingPayment = event.payments.find(p => p.status === 'pending');
    if (!pendingPayment) {
      toast.error('Tidak ada tagihan aktif');
      return;
    }

    setUploading(true);
    try {
      // 1. Get presigned URL
      const presignedRes = await fetch('/api/public/payment/presigned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: selectedFile.name,
          contentType: selectedFile.type,
          eventId: event.id,
          fileSize: selectedFile.size,
        }),
      });

      if (!presignedRes.ok) throw new Error('Gagal mendapatkan URL upload');
      const { data: presignedData } = await presignedRes.json();

      // 2. Upload to R2
      const uploadRes = await fetch(presignedData.presignedUrl, {
        method: 'PUT',
        body: selectedFile,
        headers: { 'Content-Type': selectedFile.type },
      });

      if (!uploadRes.ok) throw new Error('Gagal mengunggah file ke storage');

      // 3. Complete payment
      const completeRes = await fetch('/api/public/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          paymentId: pendingPayment.id,
          uploadId: presignedData.uploadId,
        }),
      });

      if (!completeRes.ok) throw new Error('Gagal menyimpan bukti transfer');
      
      toast.success('Bukti transfer berhasil diunggah! Mohon tunggu konfirmasi admin.');
      setIsUploadOpen(false);
      setSelectedFile(null);
      void mutate();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Terjadi kesalahan saat mengunggah');
    } finally {
      setUploading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-muted rounded-full"></div>
          <div className="h-4 w-32 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="max-w-md w-full text-center p-6">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">Invoice Tidak Ditemukan</h1>
          <p className="text-muted-foreground mb-6">Link invoice mungkin salah atau telah kadaluarsa.</p>
          <Button variant="outline" onClick={() => window.history.back()}>
            Kembali
          </Button>
        </Card>
      </div>
    );
  }

  const pendingPayment = event.payments.find(p => p.status === 'pending');
  const confirmedPayments = event.payments.filter(p => p.status === 'approved');
  const awaitingConfirmation = event.paymentStatus === 'awaiting_confirmation';

  const getStatusBadge = () => {
    switch (event.paymentStatus) {
      case 'paid':
      case 'fully_paid':
        return <Badge variant="default" className="bg-green-500 hover:bg-green-600">LUNAS</Badge>;
      case 'partial':
      case 'dp_paid':
        return <Badge variant="secondary" className="bg-amber-500 text-white hover:bg-amber-600">DP DIBAYAR</Badge>;
      case 'awaiting_confirmation':
        return <Badge variant="outline" className="text-amber-500 border-amber-500">MENUNGGU KONFIRMASI</Badge>;
      default:
        return <Badge variant="destructive">BELUM BAYAR</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background py-8 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header Actions */}
        <div className="flex justify-between items-center print:hidden">
          <Button variant="ghost" size="sm" onClick={() => window.history.back()} className="text-muted-foreground">
            <ArrowLeft className="w-4 h-4 mr-2" /> Kembali
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-2" /> Cetak
            </Button>
          </div>
        </div>

        {/* Invoice Card */}
        <Card className="overflow-hidden border-border shadow-xl">
          <CardHeader className="border-b bg-card py-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-primary tracking-widest uppercase mb-1">Invoice</p>
                <h1 className="text-2xl font-bold tracking-tight">{event.kodeBooking}</h1>
              </div>
              <div className="text-left md:text-right">
                {getStatusBadge()}
                <p className="text-sm text-muted-foreground mt-2">
                  Diterbitkan: {new Date(event.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="py-8 space-y-8">
            {/* Summary Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Informasi Klien</h3>
                <p className="font-semibold text-base">{event.client.nama}</p>
                <p className="text-sm text-muted-foreground">{event.client.email}</p>
                <p className="text-sm text-muted-foreground">{event.client.phone}</p>
              </div>
              <div>
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Detail Event</h3>
                <p className="font-semibold text-base">{event.namaProject}</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(event.eventDate).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
                <p className="text-sm text-muted-foreground">{event.location || 'Lokasi menyusul'}</p>
              </div>
            </div>

            {/* Package Items */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider border-b pb-2">Rincian Layanan</h3>
              <div className="flex justify-between items-center py-2">
                <div>
                  <p className="font-medium">{event.package?.nama || 'Custom Project'}</p>
                  <p className="text-xs text-muted-foreground italic">Paket Dokumentasi</p>
                </div>
                <p className="font-semibold">Rp {event.totalPrice.toLocaleString('id-ID')}</p>
              </div>
              
              {confirmedPayments.length > 0 && (
                <div className="space-y-2 pt-4 border-t border-dashed">
                  {confirmedPayments.map((p, i) => (
                    <div key={p.id} className="flex justify-between items-center text-sm">
                      <p className="text-muted-foreground">Pembayaran {i + 1} ({p.type.toUpperCase()})</p>
                      <p className="text-green-500 font-medium">- Rp {p.amount.toLocaleString('id-ID')}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Total Section */}
            <div className="bg-muted/30 rounded-xl p-6 flex flex-col gap-2">
              <div className="flex justify-between items-center text-sm">
                <p className="text-muted-foreground">Subtotal</p>
                <p>Rp {event.totalPrice.toLocaleString('id-ID')}</p>
              </div>
              <div className="flex justify-between items-center text-xl font-bold pt-2 border-t">
                <p>Sisa Tagihan</p>
                <p className="text-primary">Rp {(event.totalPrice - event.paidAmount).toLocaleString('id-ID')}</p>
              </div>
            </div>

            {/* Payment Instructions if Unpaid */}
            {pendingPayment && !awaitingConfirmation && (
              <div className="border-2 border-primary/20 bg-primary/5 rounded-xl p-6 space-y-4 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center gap-2 text-primary">
                  <Clock className="w-5 h-5" />
                  <h3 className="font-bold">Instruksi Pembayaran</h3>
                </div>
                
                <p className="text-sm text-muted-foreground">
                  Silakan lakukan transfer sesuai nominal berikut untuk konfirmasi otomatis:
                </p>
                
                <div className="bg-background border rounded-lg p-4 flex justify-between items-center">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Total Transfer (Hingga digit terakhir)</p>
                    <p className="text-2xl font-mono font-bold text-primary">
                      Rp {(pendingPayment.amount + pendingPayment.uniqueCode).toLocaleString('id-ID')}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleCopy((pendingPayment.amount + pendingPayment.uniqueCode).toString(), 'Nominal')}>
                    {copied === 'Nominal' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-background border rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-1">Bank BCA</p>
                    <div className="flex justify-between items-center">
                      <p className="font-bold">1234567890</p>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopy('1234567890', 'Nomor Rekening')}>
                        {copied === 'Nomor Rekening' ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                      </Button>
                    </div>
                    <p className="text-xs">A/N Studio Foto</p>
                  </div>
                  <div className="bg-background border rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-1">Bank Mandiri</p>
                    <div className="flex justify-between items-center">
                      <p className="font-bold">0987654321</p>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopy('0987654321', 'Nomor Rekening')}>
                        {copied === 'Nomor Rekening' ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                      </Button>
                    </div>
                    <p className="text-xs">A/N Studio Foto</p>
                  </div>
                </div>

                <Button className="w-full h-12" onClick={() => setIsUploadOpen(true)}>
                  <Upload className="w-4 h-4 mr-2" /> Konfirmasi Pembayaran
                </Button>
              </div>
            )}

            {awaitingConfirmation && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-6 text-center space-y-2">
                <Clock className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                <h3 className="font-bold text-amber-500">Menunggu Konfirmasi</h3>
                <p className="text-sm text-muted-foreground">
                  Bukti pembayaran Anda telah kami terima dan sedang dalam proses verifikasi oleh admin.
                  Halaman ini akan diperbarui secara otomatis setelah pembayaran dikonfirmasi.
                </p>
              </div>
            )}

            {event.paymentStatus === 'fully_paid' && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-6 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
                <h3 className="font-bold text-green-500">Pembayaran Selesai</h3>
                <p className="text-sm text-muted-foreground">
                  Terima kasih! Seluruh tagihan Anda telah lunas. Sampai jumpa di sesi foto!
                </p>
              </div>
            )}
          </CardContent>
          
          <CardFooter className="bg-muted/20 border-t py-4 justify-center">
            <p className="text-xs text-muted-foreground">
              Ada pertanyaan? Hubungi kami di <span className="text-primary font-medium">0812-3456-7890</span>
            </p>
          </CardFooter>
        </Card>
      </div>

      {/* Upload Dialog */}
      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Konfirmasi Pembayaran</DialogTitle>
            <DialogDescription>
              Unggah bukti transfer Anda (JPG/PNG, max 5MB).
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            <div 
              className={`
                border-2 border-dashed rounded-xl p-8 text-center transition-colors
                ${selectedFile ? 'border-primary bg-primary/5' : 'border-muted-foreground/20 hover:border-primary/50'}
              `}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) setSelectedFile(file);
              }}
            >
              <input 
                type="file" 
                id="file-upload" 
                className="hidden" 
                accept="image/*"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
              <label htmlFor="file-upload" className="cursor-pointer block space-y-2">
                <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-2">
                  <Upload className="w-6 h-6 text-muted-foreground" />
                </div>
                {selectedFile ? (
                  <>
                    <p className="font-semibold text-primary">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">{formatBigIntFileSize(BigInt(selectedFile.size))}</p>
                  </>
                ) : (
                  <>
                    <p className="font-medium">Klik untuk pilih file</p>
                    <p className="text-xs text-muted-foreground text-balance">atau drag and drop bukti transfer di sini</p>
                  </>
                )}
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsUploadOpen(false)} disabled={uploading}>
              Batal
            </Button>
            <Button onClick={handleUpload} disabled={!selectedFile || uploading}>
              {uploading ? 'Mengunggah...' : 'Unggah Bukti'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
