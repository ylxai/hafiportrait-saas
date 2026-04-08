# Worker Deployment Guide

## Opsi Deployment Workers

### 1. **Separate Process (Recommended)** 🌟
Jalankan workers sebagai proses terpisah dari Next.js app. Ini paling stabil dan scalable.

**Keuntungan:**
- Workers dan web app tidak saling mengganggu
- Bisa scale workers independently (misal: 2 workers untuk 1 web)
- Jika web crash, workers tetap berjalan (dan sebaliknya)
- Monitoring terpisah

**Cara menjalankan:**
```bash
# Terminal 1 - Jalankan web
npm run dev

# Terminal 2 - Jalankan workers
npm run workers
```

**Production:**
```bash
# Build dulu
npm run build

# Jalankan web (background)
npm start &

# Jalankan workers (background)
npm run workers:prod &
```

### 2. **PM2 Process Manager (Recommended untuk Production)** 🚀
Gunakan PM2 untuk manage multiple processes dengan monitoring.

**Setup:**
```bash
# Install PM2 global
npm install -g pm2

# Buat folder logs
mkdir -p logs

# Start dengan PM2
pm2 start ecosystem.config.js

# Monitor
pm2 logs
pm2 monit

# Restart
pm2 restart all
pm2 restart photostudio-workers

# Save config agar auto-start saat reboot
pm2 save
pm2 startup
```

**Cek status:**
```bash
pm2 status
pm2 logs photostudio-workers --lines 50
```

### 3. **Docker Multi-Container** 🐳
Jalankan web dan workers di container terpisah.

**docker-compose.yml:**
```yaml
version: '3.8'
services:
  web:
    build: .
    command: npm start
    ports:
      - "3000:3000"
    env_file: .env
    depends_on:
      - redis
      - postgres

  workers:
    build: .
    command: npm run workers:prod
    env_file: .env
    depends_on:
      - redis
      - postgres
    deploy:
      replicas: 2  # Scale workers

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

  postgres:
    image: postgres:15-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  redis_data:
  postgres_data:
```

**Jalankan:**
```bash
docker-compose up -d
docker-compose logs -f workers
```

### 4. **Same Process (Not Recommended)** ⚠️
Jalankan workers di dalam Next.js server. Ini kurang stabil tapi lebih simpel.

**Keuntungan:**
- 1 command untuk jalankan semua

**Kekurangan:**
- Jika web crash, workers juga mati
- Harder to debug
- Memory leak di workers bisa crash web

**Cara (di server.ts custom):**
```typescript
// server.ts
import { createServer } from 'http';
import next from 'next';
import './src/lib/workers'; // Import workers

const app = next({ dev: process.env.NODE_ENV !== 'production' });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => handle(req, res)).listen(3000);
});
```

## 📊 Comparison

| Opsi | Kompleksitas | Stabilitas | Scalability | Monitoring | Best For |
|------|-------------|------------|-------------|------------|----------|
| Separate Process | Low | Medium | Medium | Manual | Development |
| PM2 | Medium | High | High | Built-in | Production |
| Docker | High | High | Very High | Built-in | Large Production |
| Same Process | Low | Low | Low | Manual | Quick prototyping |

## 🔧 Current Setup

Kita menggunakan **Separate Process dengan script**: `scripts/workers.ts`

**Commands tersedia:**
```bash
npm run workers      # Development (tsx)
npm run workers:prod # Production (node compiled)
```

**Jika menggunakan VPS/Server:**
```bash
# Start web + workers dengan PM2
pm2 start ecosystem.config.js

# Atau manual dengan nohup
nohup npm start > web.log 2>&1 &
nohup npm run workers:prod > workers.log 2>&1 &
```

## 🌟 Production Recommendation

Untuk production, gunakan **PM2** atau **Docker** karena:

1. **Auto-restart** jika crash
2. **Log rotation** (file log tidak membesar tanpa batas)
3. **Monitoring** built-in
4. **Cluster mode** (scale workers ke multiple CPU cores)

## 📝 Environment Variables

Pastikan `.env` tersedia untuk workers (sama dengan web app):
```env
DATABASE_URL=...
REDIS_URL=...
R2_*=...
CLOUDINARY_*=...
ABLY_API_KEY=...
```
