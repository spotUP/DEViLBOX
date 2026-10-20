/**
 * Client for the server's Up Rough song generator (server/src/routes/uprough.ts).
 * The server runs the Up Rough host's own generator; this only moves the request.
 */
import type { R2Event } from '@/engine/uprough/r2Events';

export interface GenerateRequest {
  style: string;
  seed: number;
  key?: string;
  /** Song length in bars; omitted = the whole song. */
  bars?: number;
}

async function failure(res: Response): Promise<Error> {
  let message = `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { error?: string; detail?: string };
    if (body.error) message = body.detail ? `${body.error}: ${body.detail}` : body.error;
  } catch {
    // body was not JSON; keep the status line
  }
  return new Error(message);
}

export async function fetchStyles(signal?: AbortSignal): Promise<string[]> {
  const res = await fetch('/api/uprough/styles', { signal });
  if (!res.ok) throw await failure(res);
  return ((await res.json()) as { styles: string[] }).styles;
}

export interface GenerateOptions {
  /** Receives every NDJSON event of the host generate run (R2 protocol 3.2) as it arrives; asking for it selects the streaming request. */
  onEvent?: (event: R2Event) => void;
}

/**
 * Reads an NDJSON body: calls onLine for each complete line (blank lines are skipped), holding a partial line across
 * chunk boundaries; a final line without a newline is delivered at the end of the stream.
 */
export async function readNdjson(body: ReadableStream<Uint8Array>, onLine: (line: string) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  for (;;) {
    const { done, value } = await reader.read();
    pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
    let at = pending.indexOf('\n');
    while (at >= 0) {
      const line = pending.slice(0, at).trim();
      pending = pending.slice(at + 1);
      if (line) onLine(line);
      at = pending.indexOf('\n');
    }
    if (done) break;
  }
  if (pending.trim()) onLine(pending.trim());
}

/** Returns the song-file JSON text, ready for openUpRoughSong. With options.onEvent the events stream in and the song is the done line's. */
export async function generateSong(req: GenerateRequest, signal?: AbortSignal, options: GenerateOptions = {}): Promise<string> {
  const { onEvent } = options;
  const res = await fetch('/api/uprough/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(onEvent ? { ...req, events: true } : req),
    signal,
  });
  if (!res.ok) throw await failure(res);
  if (!onEvent) return res.text();
  if (!res.body) throw new Error('generate: the response has no body to stream');
  let song: string | null = null;
  await readNdjson(res.body, (line) => {
    const event = JSON.parse(line) as R2Event | { type: 'error'; error?: string; detail?: string };
    if (event.type === 'error') {
      const e = event as { error?: string; detail?: string };
      throw new Error(e.detail ? `${e.error ?? 'generate failed'}: ${e.detail}` : (e.error ?? 'generate failed'));
    }
    onEvent(event as R2Event);
    if (event.type === 'done') {
      const doneSong = (event as Extract<R2Event, { type: 'done' }>).song;
      if (doneSong !== undefined) song = JSON.stringify(doneSong);
    }
  });
  if (song === null) throw new Error('generate: the stream ended without a done line carrying the song');
  return song;
}

/** Renders a song-file text with the real Up Rough synth on the server; returns the WAV bytes. */
export async function renderSong(text: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const res = await fetch('/api/uprough/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ song: text }),
    signal,
  });
  if (!res.ok) throw await failure(res);
  return res.arrayBuffer();
}
