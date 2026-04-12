# 🧪 Upload System Test Guide - Playwright MCP

## Pre-requisites
- Dev server running on http://localhost:3000
- Playwright MCP configured
- Photos in ~/wedding_photos

---

## Test 1: Manual Upload Test (Interactive)

### Step 1: Navigate to Login
```javascript
// Gunakan Playwright MCP untuk navigate
await page.goto('http://localhost:3000/login');
await page.waitForLoadState('networkidle');
```

### Step 2: Login
```javascript
// Isi credentials (update dengan yang benar)
await page.fill('input[type="email"]', 'admin@hafiportrait.com');
await page.fill('input[type="password"]', 'password');
await page.click('button[type="submit"]');
await page.waitForURL('**/admin/**');
```

### Step 3: Navigate to Gallery
```javascript
// Pilih gallery pertama
await page.click('a[href^="/admin/galleries/"]');
await page.waitForLoadState('networkidle');
```

### Step 4: Upload Single Photo
```javascript
// Ambil 1 foto dari wedding_photos
const photoPath = '/home/eouser/wedding_photos/1.jpg';

// Upload
await page.setInputFiles('input[type="file"]', photoPath);

// Tunggu progress
await page.waitForSelector('[role="progressbar"]');

// Tunggu complete (max 30s)
await page.waitForSelector('text=Completed', { timeout: 30000 });
```

### Step 5: Verify Success
```javascript
// Screenshot untuk verifikasi
await page.screenshot({ path: '/tmp/upload-success.png' });

// Cek tidak ada error
const errors = await page.locator('text=Failed').count();
console.log(`Errors found: ${errors}`);
```

---

## Test 2: Batch Upload Test (5-10 Photos)

```javascript
const photos = [
  '/home/eouser/wedding_photos/1.jpg',
  '/home/eouser/wedding_photos/DS4_4524.JPG',
  '/home/eouser/wedding_photos/DS4_4534.JPG',
  '/home/eouser/wedding_photos/DS4_4539.JPG',
  '/home/eouser/wedding_photos/DS4_4542.JPG',
];

const startTime = Date.now();

await page.setInputFiles('input[type="file"]', photos);

// Tunggu semua complete
await page.waitForFunction(() => {
  const completed = document.querySelectorAll('text=Completed').length;
  return completed >= 5;
}, { timeout: 120000 });

const duration = (Date.now() - startTime) / 1000;
console.log(`✅ 5 files uploaded in ${duration}s`);
```

---

## Test 3: Race Condition Test (20 Photos)

```javascript
// Ambil 20 foto
const fs = require('fs');
const photoDir = '/home/eouser/wedding_photos';
const allPhotos = fs.readdirSync(photoDir)
  .filter(f => f.match(/\.(jpg|jpeg)$/i))
  .slice(0, 20)
  .map(f => `${photoDir}/${f}`);

// Upload semua sekaligus
console.log(`Uploading ${allPhotos.length} files...`);
await page.setInputFiles('input[type="file"]', allPhotos);

// Monitor logs
page.on('console', msg => {
  if (msg.text().includes('error') || msg.text().includes('race')) {
    console.log('⚠️ Console error:', msg.text());
  }
});

// Tunggu 2 menit
await page.waitForTimeout(120000);

// Cek hasil
const completed = await page.locator('text=Completed').count();
const failed = await page.locator('text=Failed').count();
console.log(`✅ Completed: ${completed}, ❌ Failed: ${failed}`);

// Verifikasi tidak ada duplikat
const photoCards = await page.locator('.photo-card').count();
const uniquePhotos = await page.locator('.photo-card').evaluateAll(cards => 
  new Set(cards.map(c => c.dataset.id)).size
);
console.log(`Total cards: ${photoCards}, Unique: ${uniquePhotos}`);
if (photoCards !== uniquePhotos) {
  console.error('❌ Race condition detected - duplicate uploads!');
}
```

---

## Test 4: Memory Leak Test

```javascript
// Check memory before
const beforeMemory = await page.evaluate(() => {
  if ('memory' in performance) {
    return performance.memory.usedJSHeapSize;
  }
  return 0;
});

// Upload batch besar
const batch1 = allPhotos.slice(0, 30);
await page.setInputFiles('input[type="file"]', batch1);
await page.waitForTimeout(60000);

// Upload batch kedua
const batch2 = allPhotos.slice(30, 50);
await page.setInputFiles('input[type="file"]', batch2);
await page.waitForTimeout(60000);

// Check memory after
const afterMemory = await page.evaluate(() => {
  if ('memory' in performance) {
    return performance.memory.usedJSHeapSize;
  }
  return 0;
});

const increaseMB = (afterMemory - beforeMemory) / 1024 / 1024;
console.log(`Memory increased: ${increaseMB.toFixed(2)} MB`);

if (increaseMB > 200) {
  console.warn('⚠️ Possible memory leak detected');
} else {
  console.log('✅ Memory usage normal');
}
```

---

## Test 5: Storage Quota Test

```javascript
// Coba upload dengan quota yang sudah penuh (jika ada)
// Atau test file >50MB

// Create large dummy file
const largeFile = '/tmp/test-large.bin';
const fs = require('fs');
fs.writeFileSync(largeFile, Buffer.alloc(60 * 1024 * 1024)); // 60MB

// Coba upload
await page.setInputFiles('input[type="file"]', largeFile);

// Harusnya error
await page.waitForSelector('text=File too large', { timeout: 5000 });
console.log('✅ File size validation working');

// Cleanup
fs.unlinkSync(largeFile);
```

---

## Quick Commands

```bash
# Jalankan dev server
npm run dev

# List available photos
ls ~/wedding_photos | head -20

# Check server logs
tail -f /tmp/dev-server.log

# Monitor memory
top -p $(pgrep -f "npm run dev")
```

---

## Expected Results

✅ **Success Criteria:**
- Single upload: Complete dalam <30s
- Batch 10 files: Complete dalam <2 menit
- 20 files: No duplicate uploads
- Memory: Stabil, tidak terus naik
- File >50MB: Rejected dengan error message

❌ **Failure Indicators:**
- Photos upload 2x (race condition)
- Memory terus naik tanpa turun
- File >50MB diterima
- Error "Failed" muncul >10%