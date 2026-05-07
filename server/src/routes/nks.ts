/**
 * NKS Library Browser routes
 *
 * Reads from the Komplete Kontrol / Maschine komplete.db3 SQLite database
 * (populated when NKS plugins/libraries are installed via Native Access),
 * plus scans for .nksf files found through macOS plist ContentDir entries.
 *
 * Endpoints:
 *   GET /api/nks/status         — DB path, preset count, product count
 *   GET /api/nks/products       — all product/brand entries with artwork paths
 *   GET /api/nks/presets        — paginated preset list with filters
 *   GET /api/nks/artwork/:brand/:product/:file  — serve artwork image
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
    // Priority order: most data first
    const candidates = [
      path.join(home, 'Library/Application Support/Native Instruments/Kontakt 8/komplete.db3'),
      path.join(home, 'Library/Application Support/Native Instruments/Kontakt 7/komplete.db3'),
      path.join(home, 'Library/Application Support/Native Instruments/Maschine 3/komplete.db3'),
      path.join(home, 'Library/Application Support/Native Instruments/Komplete Kontrol/Browser Data/komplete.db3'),
    ];
    // Return the first candidate that exists and has data (size > 100KB)
    for (const p of candidates) {
      try {
        const stat = fs.statSync(p);
        if (stat.size > 100_000) return p;
      } catch { /* not found */ }
    }
    return candidates[candidates.length - 1];
  }
  // Windows
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
  deviceType: string;
  fileName: string;
  fileExt: string;
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

function findArtwork(productName: string, files: string[]): string | null {
  const base = getNIResourcesPath();
  const folder = path.join(base, productName.toLowerCase());
  if (!fs.existsSync(folder)) return null;
  for (const f of files) {
    const full = path.join(folder, f);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

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
  } catch { return []; }
}

// ── Routes ────────────────────────────────────────────────────────────────────

/** GET /api/nks/status */
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

/** GET /api/nks/products */
router.get('/products', (_req: Request, res: Response) => {
  const db = openDb();
  const niProducts = scanNIProducts();

  // Build a map of products from the DB
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

  // Merge DB products + NI Resources products
  const seen = new Set<string>();
  const products: NKSProduct[] = [];

  // Products from DB first (have preset counts)
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

  // Then NI Resources products (might have artwork but no presets loaded yet)
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

/** GET /api/nks/presets?q=&product=&brand=&type=&character=&offset=&limit= */
router.get('/presets', (req: Request, res: Response) => {
  const db = openDb();
  if (!db) {
    res.json({ total: 0, presets: [] });
    return;
  }

  const q         = (req.query.q as string) ?? '';
  const product   = (req.query.product as string) ?? '';
  const brand     = (req.query.brand as string) ?? '';
  const type      = (req.query.type as string) ?? '';
  const character = (req.query.character as string) ?? '';
  const offset    = parseInt((req.query.offset as string) ?? '0', 10);
  const limit     = Math.min(200, parseInt((req.query.limit as string) ?? '50', 10));

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
             s.device_type_flags, s.file_name, COALESCE(s.file_ext, 'nksf') AS file_ext,
             (SELECT group_concat(c.category || COALESCE(', ' || c.subcategory, ''), ' / ')
              FROM k_category c JOIN k_sound_info_category sc ON c.id = sc.category_id
              WHERE sc.sound_info_id = s.id LIMIT 3) AS types,
             (SELECT group_concat(m.name, ', ')
              FROM k_mode m JOIN k_sound_info_mode sm ON m.id = sm.mode_id
              WHERE sm.sound_info_id = s.id LIMIT 5) AS character
      FROM k_sound_info s
      JOIN k_bank_chain b ON s.bank_chain_id = b.id
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

/** GET /api/nks/artwork/:product/:file — serve artwork image from NI Resources */
router.get('/artwork/:product/:file', (req: Request, res: Response) => {
  const product = decodeURIComponent(req.params.product);
  const file    = decodeURIComponent(req.params.file);

  // Sanitize — only allow safe filenames
  if (!/^[\w .()-]+$/.test(product) || !/^[\w .-]+$/.test(file)) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }

  const fullPath = path.join(getNIResourcesPath(), product, file);

  // Ensure the resolved path is inside NI Resources (prevent traversal)
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

/** GET /api/nks/types — all unique types from DB */
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

/** GET /api/nks/characters — all unique character/mode tags */
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
