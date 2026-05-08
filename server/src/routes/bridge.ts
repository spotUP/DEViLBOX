/**
 * Bridge route — Auto-start/stop the native AU plugin bridge process.
 *
 * POST /api/bridge/start  → spawn kontakt-bridge if not running
 * POST /api/bridge/stop   → kill bridge process
 * GET  /api/bridge/status → { running, pid, port }
 */

import { Router } from 'express';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import net from 'net';

const router = Router();

let bridgeProcess: ChildProcess | null = null;
let bridgePid: number | null = null;

const BRIDGE_PORT = 4009;
const BRIDGE_DIR = path.resolve(__dirname, '../../../tools/kontakt-bridge/build');
const BRIDGE_BIN = path.join(BRIDGE_DIR, 'kontakt-bridge');

/** Check if a TCP port is accepting connections (connects + disconnects immediately). */
function isPortOpen(port: number, timeoutMs = 500): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error', () => resolve(false));
    sock.once('timeout', () => { sock.destroy(); resolve(false); });
    sock.connect(port, '127.0.0.1');
  });
}

/** Wait for bridge to start listening, with retries. */
async function waitForPort(port: number, maxAttempts = 20, intervalMs = 250): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    if (await isPortOpen(port)) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

// POST /api/bridge/start
router.post('/start', async (_req, res) => {
  // Already running and port open?
  if (bridgeProcess && !bridgeProcess.killed) {
    const alive = await isPortOpen(BRIDGE_PORT);
    if (alive) {
      return res.json({ status: 'already_running', pid: bridgePid, port: BRIDGE_PORT });
    }
    // Process exists but port dead — clean up
    bridgeProcess.kill();
    bridgeProcess = null;
    bridgePid = null;
  }

  // Check binary exists
  const fs = await import('fs');
  if (!fs.existsSync(BRIDGE_BIN)) {
    return res.status(404).json({
      status: 'error',
      error: `Bridge binary not found at ${BRIDGE_BIN}. Run: cd tools/kontakt-bridge/build && cmake .. && make`,
    });
  }

  try {
    const child = spawn(BRIDGE_BIN, [], {
      cwd: BRIDGE_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    bridgeProcess = child;
    bridgePid = child.pid ?? null;

    child.stdout?.on('data', (data: Buffer) => {
      console.log(`[AU Bridge] ${data.toString().trim()}`);
    });

    child.stderr?.on('data', (data: Buffer) => {
      console.error(`[AU Bridge] ${data.toString().trim()}`);
    });

    child.on('exit', (code) => {
      console.log(`[AU Bridge] Process exited with code ${code}`);
      if (bridgeProcess === child) {
        bridgeProcess = null;
        bridgePid = null;
      }
    });

    // Wait for it to start accepting connections
    const ready = await waitForPort(BRIDGE_PORT);
    if (ready) {
      console.log(`[AU Bridge] Started (pid ${bridgePid}, port ${BRIDGE_PORT})`);
      return res.json({ status: 'started', pid: bridgePid, port: BRIDGE_PORT });
    } else {
      child.kill();
      bridgeProcess = null;
      bridgePid = null;
      return res.status(500).json({ status: 'error', error: 'Bridge started but port never opened' });
    }
  } catch (e) {
    return res.status(500).json({
      status: 'error',
      error: e instanceof Error ? e.message : 'Failed to start bridge',
    });
  }
});

// POST /api/bridge/stop
router.post('/stop', (_req, res) => {
  if (bridgeProcess && !bridgeProcess.killed) {
    bridgeProcess.kill('SIGTERM');
    bridgeProcess = null;
    bridgePid = null;
    return res.json({ status: 'stopped' });
  }
  return res.json({ status: 'not_running' });
});

// GET /api/bridge/status
router.get('/status', async (_req, res) => {
  const running = bridgeProcess !== null && !bridgeProcess.killed && await isPortOpen(BRIDGE_PORT);
  res.json({ running, pid: running ? bridgePid : null, port: BRIDGE_PORT });
});

export default router;
