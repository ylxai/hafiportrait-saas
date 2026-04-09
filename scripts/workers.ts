#!/usr/bin/env node
/**
 * Standalone Worker Process for PhotoStudio SaaS
 * 
 * Run this file separately from the Next.js app to process background jobs:
 * 
 * Development:
 *   tsx scripts/workers.ts
 * 
 * Production:
 *   node dist/scripts/workers.js
 * 
 * Or with PM2:
 *   pm2 start scripts/workers.ts --name "photostudio-workers"
 */

import 'dotenv/config';
import '../src/lib/workers';

console.log('[Worker Process] Starting...');
console.log('[Worker Process] Press Ctrl+C to stop');

// Keep process alive
process.stdin.resume();
