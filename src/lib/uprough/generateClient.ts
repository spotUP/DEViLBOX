/**
 * Client for the server's Up Rough song generator (server/src/routes/uprough.ts).
 * The server runs the Up Rough host's own generator; this only moves the request.
 */

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

/** Returns the song-file JSON text, ready for openUpRoughSong. */
export async function generateSong(req: GenerateRequest, signal?: AbortSignal): Promise<string> {
  const res = await fetch('/api/uprough/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok) throw await failure(res);
  return res.text();
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
