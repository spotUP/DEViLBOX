import { describe, it, expect, vi, afterEach } from 'vitest';
import { downloadModlandFile } from '@/lib/modlandApi';
import { isKnownSource } from '@/lib/modland/ModlandDetector';

// The online search list loaded "chemical emotion.mod" from Modland without marking it, so the loader showed
// "not in Modland" when the hash database had no row for it (2026-10-22). The mark belongs to the download,
// not to each caller.
describe('contribution prompt: a file downloaded from Modland is a known source', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('marks the file by its path basename after a successful download, case-insensitively', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })));
    expect(isKnownSource('chemical emotion.mod')).toBe(false);
    const bytes = await downloadModlandFile('/pub/modules/Protracker/James/chemical emotion.mod');
    expect(bytes.byteLength).toBe(3);
    expect(isKnownSource('Chemical Emotion.MOD')).toBe(true);
    expect(isKnownSource('other.mod')).toBe(false);
  });

  it('does not mark a file whose download failed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"nope"}', { status: 404 })));
    await expect(downloadModlandFile('/pub/modules/Protracker/X/missing.mod')).rejects.toThrow('nope');
    expect(isKnownSource('missing.mod')).toBe(false);
  });
});
