/**
 * Stream routes — WebSocket → ffmpeg → RTMP relay for live streaming.
 *
 * Receives WebM video chunks from the browser over WebSocket,
 * pipes them through ffmpeg to remux to FLV, and forwards to
 * YouTube's RTMP ingest server.
 *
 * Requires ffmpeg installed on the server.
 */

import { Router } from 'express';
import { spawn, type ChildProcess } from 'child_process';
import type { WebSocket } from 'ws';

const router = Router();

// Active stream processes (keyed by stream key hash for privacy)
const activeStreams = new Map<string, ChildProcess>();

/**
 * WebSocket handler — attach to Express server's upgrade event.
 * Call registerStreamWebSocket(wss) from index.ts.
 */
export function handleStreamConnection(ws: WebSocket, streamKey: string): void {
  if (!streamKey) {
    ws.close(4001, 'Missing stream key');
    return;
  }

  const rtmpUrl = `rtmp://a.rtmp.youtube.com/live2/${streamKey}`;
  console.log(`[Stream] Starting ffmpeg relay for stream`);

  // Spawn ffmpeg: read WebM from stdin, remux to FLV, output to RTMP
  const ffmpeg = spawn('ffmpeg', [
    '-i', 'pipe:0',           // Read from stdin
    '-c:v', 'copy',           // Pass through video codec (VP8/VP9 → FLV)
    '-c:a', 'aac',            // Transcode audio to AAC (required for RTMP)
    '-b:a', '128k',
    '-f', 'flv',              // FLV container for RTMP
    '-flvflags', 'no_duration_filesize',
    rtmpUrl,
  ], {
    stdio: ['pipe', 'ignore', 'pipe'], // stdin=pipe, stdout=ignore, stderr=pipe
  });

  const keyHash = streamKey.slice(0, 8); // short ID for logging
  activeStreams.set(keyHash, ffmpeg);

  ffmpeg.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg.includes('Error') || msg.includes('error')) {
      console.error(`[Stream:${keyHash}] ffmpeg error:`, msg);
    }
  });

  ffmpeg.on('close', (code) => {
    console.log(`[Stream:${keyHash}] ffmpeg exited with code ${code}`);
    activeStreams.delete(keyHash);
    try { ws.close(1000, 'Stream ended'); } catch { /* ignore */ }
  });

  ffmpeg.on('error', (err) => {
    console.error(`[Stream:${keyHash}] ffmpeg spawn error:`, err.message);
    try { ws.close(4002, 'ffmpeg not available'); } catch { /* ignore */ }
    activeStreams.delete(keyHash);
  });

  // Pipe incoming WebSocket binary frames to ffmpeg stdin
  ws.on('message', (data: Buffer | ArrayBuffer) => {
    const buf = data instanceof ArrayBuffer ? Buffer.from(data) : data;
    if (ffmpeg.stdin && !ffmpeg.stdin.destroyed) {
      ffmpeg.stdin.write(buf);
    }
  });

  ws.on('close', () => {
    console.log(`[Stream:${keyHash}] WebSocket closed — killing ffmpeg`);
    if (ffmpeg.stdin && !ffmpeg.stdin.destroyed) {
      ffmpeg.stdin.end();
    }
    ffmpeg.kill('SIGTERM');
    activeStreams.delete(keyHash);
  });

  ws.on('error', (err) => {
    console.error(`[Stream:${keyHash}] WebSocket error:`, err.message);
    ffmpeg.kill('SIGTERM');
    activeStreams.delete(keyHash);
  });
}

/** Check if ffmpeg is available */
export function checkFfmpeg(): boolean {
  try {
    const result = spawn('ffmpeg', ['-version'], { stdio: 'ignore' });
    result.on('error', () => {});
    return true;
  } catch {
    return false;
  }
}

export default router;
