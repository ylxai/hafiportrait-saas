export type User = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: Date;
  updatedAt: Date;
};

export type Client = {
  id: string;
  nama: string;
  email: string;
  phone: string | null;
  instagram: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Package = {
  id: string;
  nama: string;
  description: string | null;
  price: number;
  duration: number | null;
  fitur: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type Event = {
  id: string;
  kodeBooking: string;
  clientId: string;
  client?: Client;
  packageId: string | null;
  package?: Package;
  namaProject: string;
  eventDate: Date;
  location: string | null;
  notes: string | null;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  totalPrice: number;
  paidAmount: number;
  paymentStatus: 'unpaid' | 'awaiting_confirmation' | 'dp_paid' | 'fully_paid' | 'partial' | 'paid';
  createdAt: Date;
  updatedAt: Date;
};

export type Photo = {
  id: string;
  galleryId: string;
  filename: string;
  url: string;           // R2 - original file URL
  thumbnailUrl: string | null;  // Cloudinary - thumbnail URL
  publicId: string | null;      // Cloudinary public ID
  r2Key: string | null;          // R2 storage key
  width: number | null;
  height: number | null;
  order: number;
  createdAt: Date;
};

export type Gallery = {
  id: string;
  eventId: string;
  event?: Event;
  namaProject: string;
  clientToken: string;
  status: 'draft' | 'published' | 'archived';
  maxSelection: number;
  enableDownload: boolean;
  welcomeMessage: string | null;
  thankYouMessage: string | null;
  bannerClientName: string | null;
  bannerEventDate: string | null;
  bannerMessage: string | null;
  viewCount: number;
  isSelectionLocked: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type Selection = {
  id: string;
  galleryId: string;
  submittedAt: Date;
};

export type PhotoSelection = {
  id: string;
  selectionId: string;
  photoId: string;
};

export type Settings = {
  id: string;
  namaStudio: string | null;
  logoUrl: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  socialMedia: Record<string, string> | null;
  bookingFields: Record<string, unknown> | null;
  notifications: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};