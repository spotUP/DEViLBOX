/**
 * NKS Library Browser routes
 *
 * Reads from the Komplete Kontrol / Maschine komplete.db3 SQLite database
 * (populated when NKS plugins/libraries are installed via Native Access),
 * plus scans for .nicnt libraries and preview files.
 *
 * Endpoints:
 *   GET /api/nks/status            — DB path, preset count, product count
 *   GET /api/nks/products          — all product/brand entries with artwork paths
 *   GET /api/nks/presets           — paginated preset list with filters
 *   GET /api/nks/libraries         — installed Kontakt libraries from .nicnt files
 *   GET /api/nks/library-preview   — serve library preview OGG files
 *   GET /api/nks/artwork/:product/:file  — serve artwork image
 */

import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';

const router = Router();

// ── Paths ─────────────────────────────────────────────────────────────────────

function getKKDbPath(): string {
  if (process.platform === 'darwin') {
    const home = os.homedir();
    const candidates = [
      path.join(home, 'Library/Application Support/Native Instruments/Kontakt 8/komplete.db3'),
      path.join(home, 'Library/Application Support/Native Instruments/Kontakt 7/komplete.db3'),
      path.join(home, 'Library/Application Support/Native Instruments/Maschine 3/komplete.db3'),
      path.join(home, 'Library/Application Support/Native Instruments/Komplete Kontrol/Browser Data/komplete.db3'),
    ];
    for (const p of candidates) {
      try {
        const stat = fs.statSync(p);
        if (stat.size > 100_000) return p;
      } catch { /* not found */ }
    }
    return candidates[candidates.length - 1];
  }

  return path.join(
    process.env.LOCALAPPDATA ?? '',
    'Native Instruments/Komplete Kontrol/komplete.db3',
  );
}

function getNIResourcesPath(): string {
  if (process.platform === 'darwin') {
    return '/Users/Shared/NI Resources/image';
  }
  return path.join('C:/Users/Public/Documents/NI Resources/image');
}

function getUserContentPath(): string {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Documents/Native Instruments/User Content');
  }
  return path.join(os.homedir(), 'Documents/Native Instruments/User Content');
}

function getKontaktLibraryRoots(): string[] {
  if (process.platform === 'darwin') {
    return ['/Users/Shared'];
  }
  return ['C:/Users/Public/Documents'];
}

// ── DB helper ─────────────────────────────────────────────────────────────────

let _db: Database.Database | null = null;

function openDb(): Database.Database | null {
  const dbPath = getKKDbPath();
  if (!fs.existsSync(dbPath)) return null;
  try {
    if (!_db) {
      _db = new Database(dbPath, { readonly: true, fileMustExist: true });
    }
    return _db;
  } catch (e) {
    console.warn('[NKS] Could not open komplete.db3:', e);
    return null;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface NKSProduct {
  name: string;
  brand: string;
  presetCount: number;
  artworkUrl: string | null;
  logoUrl: string | null;
}

interface NKSPreset {
  id: number;
  name: string;
  vendor: string;
  product: string;
  bank: string | null;
  subbank: string | null;
  types: string | null;
  character: string | null;
  deviceType: number;
  fileName: string;
  fileExt: string;
  filePath: string;
}

interface NKSLibraryEntry {
  name: string;
  libraryPath: string;
  previewOgg: string | null;
  nicntPath: string;
}

// ── Artwork helpers ────────────────────────────────────────────────────────────

const ARTWORK_FILES = [
  'MST_artwork.png',
  'VB_artwork.png',
  'MST_plugin.png',
];
const LOGO_FILES = [
  'MST_logo.png',
  'VB_logo.png',
  'OSO_logo.png',
];

function artworkApiUrl(productName: string, fileName: string): string {
  const encoded = encodeURIComponent(productName.toLowerCase());
  return `/api/nks/artwork/${encoded}/${encodeURIComponent(fileName)}`;
}

function buildArtworkUrls(productName: string): { artworkUrl: string | null; logoUrl: string | null } {
  const base = getNIResourcesPath();
  const folder = path.join(base, productName.toLowerCase());
  if (!fs.existsSync(folder)) return { artworkUrl: null, logoUrl: null };

  let artworkUrl: string | null = null;
  let logoUrl: string | null = null;

  for (const f of ARTWORK_FILES) {
    if (fs.existsSync(path.join(folder, f))) {
      artworkUrl = artworkApiUrl(productName, f);
      break;
    }
  }
  for (const f of LOGO_FILES) {
    if (fs.existsSync(path.join(folder, f))) {
      logoUrl = artworkApiUrl(productName, f);
      break;
    }
  }
  return { artworkUrl, logoUrl };
}

// ── Scan NI Resources for all known products (even without DB entries) ─────────

function scanNIProducts(): string[] {
  const base = getNIResourcesPath();
  if (!fs.existsSync(base)) return [];
  try {
    return fs.readdirSync(base)
      .filter(f => fs.statSync(path.join(base, f)).isDirectory())
      .sort();
  } catch {
    return [];
  }
}

// ── Kontakt library scanning helpers ───────────────────────────────────────────

function scanForNicntFiles(basePath: string, maxDepth: number, depth = 0): string[] {
  if (depth > maxDepth || !fs.existsSync(basePath)) {
    return [];
  }

  const results: string[] = [];
  for (const entry of fs.readdirSync(basePath, { withFileTypes: true })) {
    const fullPath = path.join(basePath, entry.name);
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.nicnt')) {
      results.push(fullPath);
      continue;
    }
    if (entry.isDirectory()) {
      results.push(...scanForNicntFiles(fullPath, maxDepth, depth + 1));
    }
  }
  return results;
}

function parseNicntName(buffer: Buffer): string | null {
  const text = buffer.toString('utf8');
  const start = text.indexOf('<ProductHints');
  if (start === -1) {
    return null;
  }

  const end = text.indexOf('</ProductHints>', start);
  const xml = end === -1 ? text.slice(start) : text.slice(start, end + '</ProductHints>'.length);
  const match = xml.match(/<Name>([^<]+)<\/Name>/i);
  return match?.[1]?.trim() || null;
}

function buildLibraryPreviewUrl(filePath: string): string {
  return `/api/nks/library-preview?path=${encodeURIComponent(filePath)}`;
}

function findPreviewOgg(libraryPath: string): string | null {
  const candidates = [
    path.join(libraryPath, 'Instruments', '.previews'),
    path.join(libraryPath, '.previews'),
  ];

  for (const folder of candidates) {
    if (!fs.existsSync(folder)) {
      continue;
    }

    const files = fs.readdirSync(folder)
      .filter((file) => file.toLowerCase().endsWith('.ogg'))
      .sort((a, b) => Number(!a.toLowerCase().endsWith('.nki.ogg')) - Number(!b.toLowerCase().endsWith('.nki.ogg')) || a.localeCompare(b));

    if (files.length > 0) {
      return buildLibraryPreviewUrl(path.join(folder, files[0]));
    }
  }

  return null;
}

function isPathInsideRoots(candidatePath: string, roots: string[]): boolean {
  const resolved = path.resolve(candidatePath);
  return roots.some((root) => {
    const base = path.resolve(root);
    return resolved === base || resolved.startsWith(`${base}${path.sep}`);
  });
}

function scanKontaktLibraries(): NKSLibraryEntry[] {
  const nicntFiles = getKontaktLibraryRoots().flatMap((root) => scanForNicntFiles(root, 3));
  const libraries = new Map<string, NKSLibraryEntry>();

  for (const nicntPath of nicntFiles) {
    try {
      const buffer = fs.readFileSync(nicntPath);
      const libraryPath = path.dirname(nicntPath);
      const name = parseNicntName(buffer) || path.basename(libraryPath);
      libraries.set(nicntPath, {
        name,
        libraryPath,
        previewOgg: findPreviewOgg(libraryPath),
        nicntPath,
      });
    } catch (error) {
      console.warn('[NKS] nicnt parse error:', nicntPath, error);
    }
  }

  return [...libraries.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get('/status', (_req: Request, res: Response) => {
  const dbPath = getKKDbPath();
  const dbExists = fs.existsSync(dbPath);
  const db = openDb();

  let presetCount = 0;
  let productCount = 0;
  if (db) {
    try {
      presetCount = (db.prepare('SELECT COUNT(*) AS n FROM k_sound_info').get() as { n: number }).n;
      productCount = (db.prepare('SELECT COUNT(DISTINCT entry1) AS n FROM k_bank_chain').get() as { n: number }).n;
    } catch { /* empty DB */ }
  }

  const niResourcesProducts = scanNIProducts().length;

  res.json({
    dbPath,
    dbExists,
    presetCount,
    productCount,
    niResourcesProducts,
    userContentPath: getUserContentPath(),
  });
});

router.get('/products', (_req: Request, res: Response) => {
  const db = openDb();
  const niProducts = scanNIProducts();

  const dbProducts = new Map<string, { brand: string; count: number }>();
  if (db) {
    try {
      const rows = db.prepare(`
        SELECT b.entry1 AS product, COALESCE(b.bcvendor, 'Native Instruments') AS brand, COUNT(*) AS n
        FROM k_sound_info s JOIN k_bank_chain b ON s.bank_chain_id = b.id
        GROUP BY b.entry1, b.bcvendor
        ORDER BY b.entry1
      `).all() as Array<{ product: string; brand: string; n: number }>;
      for (const r of rows) {
        dbProducts.set(r.product.toLowerCase(), { brand: r.brand, count: r.n });
      }
    } catch { /* empty */ }
  }

  const seen = new Set<string>();
  const products: NKSProduct[] = [];

  for (const [key, info] of dbProducts) {
    seen.add(key);
    const { artworkUrl, logoUrl } = buildArtworkUrls(key);
    products.push({
      name: key,
      brand: info.brand,
      presetCount: info.count,
      artworkUrl,
      logoUrl,
    });
  }

  for (const p of niProducts) {
    if (seen.has(p)) continue;
    seen.add(p);
    const { artworkUrl, logoUrl } = buildArtworkUrls(p);
    products.push({
      name: p,
      brand: 'Native Instruments',
      presetCount: 0,
      artworkUrl,
      logoUrl,
    });
  }

  res.json(products);
});

router.get('/libraries', (_req: Request, res: Response) => {
  res.json(scanKontaktLibraries());
});

router.get('/library-preview', (req: Request, res: Response) => {
  const requested = typeof req.query.path === 'string' ? req.query.path : '';
  if (!requested) {
    res.status(400).json({ error: 'Missing path' });
    return;
  }

  const resolved = path.resolve(requested);
  if (!resolved.toLowerCase().endsWith('.ogg') || !isPathInsideRoots(resolved, getKontaktLibraryRoots())) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  if (!fs.existsSync(resolved)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  res.sendFile(resolved);
});

router.get('/presets', (req: Request, res: Response) => {
  const db = openDb();
  if (!db) {
    res.json({ total: 0, presets: [] });
    return;
  }

  const q = (req.query.q as string) ?? '';
  const product = (req.query.product as string) ?? '';
  const brand = (req.query.brand as string) ?? '';
  const type = (req.query.type as string) ?? '';
  const character = (req.query.character as string) ?? '';
  const offset = parseInt((req.query.offset as string) ?? '0', 10);
  const limit = Math.min(200, parseInt((req.query.limit as string) ?? '50', 10));

  const conditions: string[] = [];
  const params: string[] = [];

  if (q) {
    conditions.push('(s.name LIKE ? OR b.entry1 LIKE ? OR b.bcvendor LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (product) {
    conditions.push('LOWER(b.entry1) = LOWER(?)');
    params.push(product);
  }
  if (brand) {
    conditions.push('LOWER(COALESCE(b.bcvendor, "Native Instruments")) = LOWER(?)');
    params.push(brand);
  }
  if (type) {
    conditions.push('EXISTS (SELECT 1 FROM k_sound_info_category sc JOIN k_category c ON sc.category_id = c.id WHERE sc.sound_info_id = s.id AND c.category = ?)');
    params.push(type);
  }
  if (character) {
    conditions.push('EXISTS (SELECT 1 FROM k_sound_info_mode sm JOIN k_mode m ON sm.mode_id = m.id WHERE sm.sound_info_id = s.id AND m.name = ?)');
    params.push(character);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const countRow = db.prepare(`
      SELECT COUNT(*) AS n FROM k_sound_info s
      JOIN k_bank_chain b ON s.bank_chain_id = b.id
      ${where}
    `).get(...params) as { n: number };

    const rows = db.prepare(`
      SELECT s.id, s.name,
             COALESCE(b.bcvendor, 'Native Instruments') AS vendor,
             b.entry1 AS product, b.entry2 AS bank, b.entry3 AS subbank,
             s.device_type_flags AS deviceType,
             s.file_name AS fileName,
             COALESCE(s.file_ext, 'nksf') AS fileExt,
             CASE
               WHEN s.file_name LIKE '/%' OR s.file_name GLOB '[A-Za-z]:/*' THEN s.file_name
               WHEN cp.path IS NOT NULL AND s.sub_path IS NOT NULL AND s.sub_path != '' THEN cp.path || '/' || s.sub_path || '/' || s.file_name
               WHEN cp.path IS NOT NULL THEN cp.path || '/' || s.file_name
               ELSE s.file_name
             END AS filePath,
             (SELECT group_concat(c.category || COALESCE(', ' || c.subcategory, ''), ' / ')
              FROM k_category c JOIN k_sound_info_category sc ON c.id = sc.category_id
              WHERE sc.sound_info_id = s.id LIMIT 3) AS types,
             (SELECT group_concat(m.name, ', ')
              FROM k_mode m JOIN k_sound_info_mode sm ON m.id = sm.mode_id
              WHERE sm.sound_info_id = s.id LIMIT 5) AS character
      FROM k_sound_info s
      JOIN k_bank_chain b ON s.bank_chain_id = b.id
      LEFT JOIN k_content_path cp ON s.content_path_id = cp.id
      ${where}
      ORDER BY b.entry1, s.name
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as NKSPreset[];

    res.json({ total: countRow.n, presets: rows });
  } catch (e) {
    console.error('[NKS] presets query error:', e);
    res.status(500).json({ error: 'DB query failed' });
  }
});

router.get('/artwork/:product/:file', (req: Request, res: Response) => {
  const product = decodeURIComponent(req.params.product);
  const file = decodeURIComponent(req.params.file);

  if (!/^[\w .()-]+$/.test(product) || !/^[\w .-]+$/.test(file)) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }

  const fullPath = path.join(getNIResourcesPath(), product, file);
  const safeBase = path.resolve(getNIResourcesPath());
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(safeBase)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  if (!fs.existsSync(resolved)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  res.sendFile(resolved);
});

router.get('/types', (_req: Request, res: Response) => {
  const db = openDb();
  if (!db) { res.json([]); return; }
  try {
    const rows = db.prepare(
      'SELECT DISTINCT category AS name FROM k_category WHERE category IS NOT NULL ORDER BY category',
    ).all() as Array<{ name: string }>;
    res.json(rows.map(r => r.name));
  } catch {
    res.json([]);
  }
});

router.get('/characters', (_req: Request, res: Response) => {
  const db = openDb();
  if (!db) { res.json([]); return; }
  try {
    const rows = db.prepare(
      'SELECT DISTINCT name FROM k_mode WHERE name IS NOT NULL ORDER BY name',
    ).all() as Array<{ name: string }>;
    res.json(rows.map(r => r.name));
  } catch {
    res.json([]);
  }
});

export default router;
