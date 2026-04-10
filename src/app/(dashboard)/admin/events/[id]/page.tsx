'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function EventDetailPage() {
  const params = useParams();
  const eventId = params.id as string;
  
  const [message, setMessage] = useState('');

  const { data, isLoading, mutate } = useSWR(
    eventId ? `/api/admin/events/${eventId}` : null,
    fetcher
  );

  const event = data?.data?.event;

  const handleUpdate = async (field: string, value: string | number | null) => {
    if (!event) return;
    
    setMessage('');
    
    try {
      const response = await fetch(`/api/admin/events?id=${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      
      if (response.ok) {
        setMessage('Updated successfully');
        mutate();
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('Failed to update');
      }
    } catch (error) {
      console.error('Error updating event:', error);
      setMessage('Error updating event');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Event not found</p>
        <Link href="/admin/events" className="text-primary hover:underline">
          ← Back to events
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href="/admin/events" className="text-muted-foreground hover:text-primary flex items-center gap-2 mb-4">
          <ArrowLeft className="w-4 h-4" />
          Back to events
        </Link>
        <h1 className="text-2xl font-bold text-foreground">Event Detail</h1>
        <p className="text-muted-foreground">{event.kodeBooking}</p>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg ${message.includes('success') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {message}
        </div>
      )}

      <div className="space-y-6">
        {/* Event Info */}
        <div className="bg-card/50 backdrop-blur-xl border border-border shadow-2xl rounded-3xl p-6">
          <h2 className="font-semibold text-lg text-foreground mb-4">Event Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Project Name</label>
              <input
                type="text"
                defaultValue={event.namaProject}
                onBlur={(e) => handleUpdate('namaProject', e.target.value)}
                className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Event Date</label>
              <input
                type="date"
                defaultValue={event.eventDate?.split('T')[0]}
                onBlur={(e) => handleUpdate('eventDate', e.target.value)}
                className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Location</label>
              <input
                type="text"
                defaultValue={event.location || ''}
                onBlur={(e) => handleUpdate('location', e.target.value)}
                className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Status</label>
              <select
                value={event.status}
                onChange={(e) => handleUpdate('status', e.target.value)}
                className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
        </div>

        {/* Client Info */}
        <div className="bg-card/50 backdrop-blur-xl border border-border shadow-2xl rounded-3xl p-6">
          <h2 className="font-semibold text-lg text-foreground mb-4">Client Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Client Name</label>
              <p className="text-foreground">{event.client?.nama || '-'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Email</label>
              <p className="text-foreground">{event.client?.email || '-'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Phone</label>
              <p className="text-foreground">{event.client?.phone || '-'}</p>
            </div>
          </div>
        </div>

        {/* Payment Info */}
        <div className="bg-card/50 backdrop-blur-xl border border-border shadow-2xl rounded-3xl p-6">
          <h2 className="font-semibold text-lg text-foreground mb-4">Payment Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Total Price</label>
              <p className="text-foreground">Rp {event.totalPrice?.toLocaleString() || '0'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Paid Amount</label>
              <p className="text-foreground">Rp {event.paidAmount?.toLocaleString() || '0'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Payment Status</label>
              <select
                value={event.paymentStatus}
                onChange={(e) => handleUpdate('paymentStatus', e.target.value)}
                className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="unpaid">Unpaid</option>
                <option value="partial">Partial</option>
                <option value="paid">Paid</option>
              </select>
            </div>
          </div>
        </div>

        {/* Package Info */}
        {event.package && (
          <div className="bg-card/50 backdrop-blur-xl border border-border shadow-2xl rounded-3xl p-6">
            <h2 className="font-semibold text-lg text-foreground mb-4">Package</h2>
            <p className="text-foreground">{event.package.name}</p>
            <p className="text-muted-foreground text-sm">Rp {event.package.price?.toLocaleString()}</p>
          </div>
        )}
      </div>
    </div>
  );
}
