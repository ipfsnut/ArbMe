/**
 * ArbMe Bot Service
 * - Runs arbitrage bot in background
 * - Health check endpoint only
 * - All API logic moved to Next.js
 */

import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());

// ═══════════════════════════════════════════════════════════════════════════════
// START BOT IN BACKGROUND
// ═══════════════════════════════════════════════════════════════════════════════

let botProcess: any = null;

function startBot() {
  console.log('[Bot Service] Starting arbitrage bot in background...');

  // Run the phase2 bot
  botProcess = spawn('tsx', ['src/bot-phase2.ts'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit', // Show bot logs
    env: process.env
  });

  botProcess.on('error', (err: any) => {
    console.error('[Bot Service] Bot process error:', err);
  });

  botProcess.on('exit', (code: number) => {
    console.log(`[Bot Service] Bot process exited with code ${code}`);
    // Restart bot on crash
    if (code !== 0) {
      console.log('[Bot Service] Restarting bot in 5 seconds...');
      setTimeout(startBot, 5000);
    }
  });
}

// Start bot on server start
startBot();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Bot Service] SIGTERM received, shutting down...');
  if (botProcess) botProcess.kill();
  process.exit(0);
});

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'bot',
    bot: botProcess ? 'running' : 'stopped',
    uptime: process.uptime()
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log(`[Bot Service] Running on port ${PORT}`);
  console.log(`[Bot Service] Health check: http://localhost:${PORT}/health`);
});
