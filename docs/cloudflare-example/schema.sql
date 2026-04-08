-- D1 Database Schema for 100% Cloudflare PhotoStudio
-- D1 uses SQLite syntax

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'admin',
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Clients table
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  instagram TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Events table
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  kodeBooking TEXT UNIQUE NOT NULL,
  clientId TEXT NOT NULL,
  packageId TEXT,
  namaProject TEXT NOT NULL,
  eventDate DATETIME,
  location TEXT,
  notes TEXT,
  status TEXT DEFAULT 'pending',
  totalPrice INTEGER DEFAULT 0,
  paidAmount INTEGER DEFAULT 0,
  paymentStatus TEXT DEFAULT 'unpaid',
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (clientId) REFERENCES clients(id),
  FOREIGN KEY (packageId) REFERENCES packages(id)
);

-- Packages table
CREATE TABLE IF NOT EXISTS packages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price INTEGER DEFAULT 0,
  photoCount INTEGER,
  duration INTEGER,
  isActive BOOLEAN DEFAULT 1,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Galleries table
CREATE TABLE IF NOT EXISTS galleries (
  id TEXT PRIMARY KEY,
  namaProject TEXT NOT NULL,
  clientToken TEXT UNIQUE NOT NULL,
  eventId TEXT,
  maxSelection INTEGER DEFAULT 20,
  enableDownload BOOLEAN DEFAULT 0,
  status TEXT DEFAULT 'active',
  viewCount INTEGER DEFAULT 0,
  welcomeMessage TEXT,
  thankYouMessage TEXT,
  bannerClientName TEXT,
  bannerEventDate TEXT,
  isSelectionLocked BOOLEAN DEFAULT 0,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (eventId) REFERENCES events(id)
);

-- Photos table
CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  galleryId TEXT NOT NULL,
  filename TEXT NOT NULL,
  url TEXT NOT NULL,
  thumbnailUrl TEXT,
  r2Key TEXT,
  publicId TEXT,
  width INTEGER,
  height INTEGER,
  fileSize INTEGER,
  storageAccountId TEXT,
  order INTEGER DEFAULT 0,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (galleryId) REFERENCES galleries(id) ON DELETE CASCADE
);

-- Create indexes for photos
CREATE INDEX IF NOT EXISTS idx_photos_gallery ON photos(galleryId);
CREATE INDEX IF NOT EXISTS idx_photos_created ON photos(createdAt);
CREATE INDEX IF NOT EXISTS idx_photos_order ON photos(galleryId, order);

-- Photo selections
CREATE TABLE IF NOT EXISTS selections (
  id TEXT PRIMARY KEY,
  galleryId TEXT NOT NULL,
  submittedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  clientName TEXT,
  clientEmail TEXT,
  notes TEXT,
  FOREIGN KEY (galleryId) REFERENCES galleries(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS photo_selections (
  id TEXT PRIMARY KEY,
  selectionId TEXT NOT NULL,
  photoId TEXT NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (selectionId) REFERENCES selections(id) ON DELETE CASCADE,
  FOREIGN KEY (photoId) REFERENCES photos(id) ON DELETE CASCADE
);

-- Storage accounts
CREATE TABLE IF NOT EXISTS storage_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL, -- 'CLOUDINARY' or 'R2'
  isActive BOOLEAN DEFAULT 1,
  isDefault BOOLEAN DEFAULT 0,
  priority INTEGER DEFAULT 0,
  
  -- Cloudinary fields
  cloudName TEXT,
  apiKey TEXT,
  apiSecret TEXT,
  uploadPreset TEXT,
  
  -- R2 fields
  accountId TEXT,
  accessKey TEXT,
  secretKey TEXT,
  bucketName TEXT,
  publicUrl TEXT,
  endpoint TEXT,
  
  -- Usage tracking
  usedStorage INTEGER DEFAULT 0,
  totalPhotos INTEGER DEFAULT 0,
  
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Settings
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY DEFAULT 'studio',
  namaStudio TEXT DEFAULT 'PhotoStudio',
  logoUrl TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  socialMedia TEXT, -- JSON string
  bookingFields TEXT, -- JSON string
  notifications TEXT, -- JSON string
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Views untuk analytics
CREATE VIEW IF NOT EXISTS gallery_stats AS
SELECT 
  g.id,
  g.namaProject,
  COUNT(p.id) as totalPhotos,
  COALESCE(SUM(p.fileSize), 0) as totalStorage,
  g.viewCount,
  g.createdAt
FROM galleries g
LEFT JOIN photos p ON g.id = p.galleryId
GROUP BY g.id;

-- Insert default admin user (password: admin123 - change in production!)
-- Note: In production, use proper password hashing
INSERT OR IGNORE INTO users (id, email, name, password, role) 
VALUES (
  'admin-default',
  'admin@photostudio.com',
  'Admin',
  '$2a$10$YourHashedPasswordHere', -- bcrypt hash
  'admin'
);

-- Insert default settings
INSERT OR IGNORE INTO settings (id) VALUES ('studio');
