import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Offline-readiness regression guard (2026-07-21, user report: "devilbox must
 * degrade and be fully usable offline for everything not intrinsically online").
 *
 * Locks in:
 *  1. NO external font CDN — fonts are self-hosted in public/fonts (a
 *     fonts.googleapis.com reference regresses offline typography).
 *  2. The self-hosted font bundle actually exists and declares faces.
 *  3. The service worker keeps its offline cache rules for fonts and
 *     visited demo songs.
 *  4. The offline UX primitives exist (useOnlineStatus + OfflineNotice) and
 *     the intrinsically-online panels use them.
 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('offline readiness', () => {
  it('no external font CDN references in the app shell', () => {
    expect(read('index.html')).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    expect(read('src/index.css')).not.toMatch(/fonts\.googleapis\.com/);
  });

  it('self-hosted font bundle exists with real @font-face declarations', () => {
    expect(existsSync(join(ROOT, 'public/fonts/fonts.css'))).toBe(true);
    const css = read('public/fonts/fonts.css');
    const faces = css.match(/@font-face/g) ?? [];
    expect(faces.length).toBeGreaterThanOrEqual(20);
    // Core families the UI depends on
    for (const fam of ['Inter', 'JetBrains Mono', 'Orbitron', 'VT323']) {
      expect(css).toContain(`font-family: '${fam}'`);
    }
    // All URLs local
    expect(css).not.toMatch(/https?:\/\//);
    // And the referenced woff2 files are actually shipped
    const urls = [...css.matchAll(/url\((\/fonts\/[^)]+)\)/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) {
      expect(existsSync(join(ROOT, 'public', u.replace(/^\//, '')))).toBe(true);
    }
  });

  it('service worker caches fonts and visited demo songs', () => {
    const sw = read('public/sw.js');
    expect(sw).toMatch(/\\\/fonts\\\//);
    expect(sw).toMatch(/data\\\/songs/);
  });

  it('offline UX primitives exist and online-only panels use them', () => {
    expect(read('src/hooks/useOnlineStatus.ts')).toContain('navigator.onLine');
    expect(read('src/components/common/OfflineNotice.tsx')).toContain('OfflineNotice');
    for (const panel of [
      'src/components/dj/DJModlandBrowser.tsx',
      'src/components/dialogs/sid/SIDCSDbTab.tsx',
      'src/components/dj/DJYouTubeUpload.tsx',
    ]) {
      const src = read(panel);
      expect(src).toContain('useOnlineStatus');
      expect(src).toContain('OfflineNotice');
    }
    // Global indicator in the status bar
    expect(read('src/components/layout/StatusBar.tsx')).toContain('useOnlineStatus');
  });
});
