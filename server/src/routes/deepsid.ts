/**
 * DeepSID routes — Serve composer profiles, HVSC metadata, tags, YouTube links
 * from the local DeepSID SQLite database mirror.
 *
 * All data is served locally — no external API calls to deepsid.chordian.net.
 */

import { Router, Request, Response } from 'express';
import { getDeepSIDDb } from '../db/deepsidDb';
import path from 'path';
import fs from 'fs';

const router = Router();

const IMAGES_DIR = process.env.DB_DIR
  ? path.join(process.env.DB_DIR, 'deepsid-images')
  : path.join(__dirname, '../../data/deepsid-images');

// ── Types ───────────────────────────────────────────────────────────────────

interface ComposerRow {
  id: number;
  fullname: string;
  focus: string;
  name: string;
  shortname: string;
  handles: string;
  shorthandle: string;
  active: number;
  born: string;
  died: string;
  cause: string;
  notable: string;
  country: string;
  employment: string;
  affiliation: string;
  brand: string;
  branddark: string;
  csdbtype: string;
  csdbid: number;
  imagesource: string;
}

interface ComposerLinkRow {
  id: number;
  composers_id: number;
  name: string;
  url: string;
}

interface HVSCFileRow {
  id: number;
  fullname: string;
  player: string;
  lengths: string;
  type: string;
  version: string;
  clockspeed: string;
  sidmodel: string;
  subtunes: number;
  startsubtune: number;
  name: string;
  author: string;
  copyright: string;
}

interface TagRow {
  name: string;
  type: string;
}

interface YouTubeRow {
  channel: string;
  video_id: string;
  subtune: number;
  tab_order: number;
  tab_default: number;
}

interface PlayerInfoRow {
  title: string;
  search: string;
  description: string;
  developer: string;
  startyear: number;
  endyear: number;
}

// ── Helper: HVSC path → composer photo filename ─────────────────────────────

function composerPhotoFilename(fullname: string): string {
  // "_High Voltage SID Collection/MUSICIANS/H/Hubbard_Rob" →
  // "musicians_h_hubbard_rob.jpg"
  let fn = fullname.replace('_High Voltage SID Collection/', '');
  fn = fn.replace("_Compute's Gazette SID Collection/", 'cgsc_');
  fn = fn.toLowerCase().replace(/\//g, '_');
  return fn + '.jpg';
}

// ── Helper: author name → HVSC folder path lookup ───────────────────────────

function findComposerByAuthor(db: ReturnType<typeof getDeepSIDDb>, author: string) {
  if (!db || !author) return null;

  // Try exact author name match in hvsc_files → get folder → get composer
  const fileRow = db.prepare(`
    SELECT fullname FROM hvsc_files WHERE author = ? LIMIT 1
  `).get(author) as { fullname: string } | undefined;

  if (fileRow) {
    // Extract folder: "_High Voltage SID Collection/MUSICIANS/H/Hubbard_Rob/file.sid"
    // → "_High Voltage SID Collection/MUSICIANS/H/Hubbard_Rob"
    const parts = fileRow.fullname.split('/');
    parts.pop(); // remove filename
    const folder = parts.join('/');

    const composer = db.prepare(`
      SELECT * FROM composers WHERE fullname = ? LIMIT 1
    `).get(folder) as ComposerRow | undefined;

    if (composer) return composer;
  }

  // Fallback: search composers by real name
  const byName = db.prepare(`
    SELECT * FROM composers WHERE name LIKE ? LIMIT 1
  `).get(`%${author}%`) as ComposerRow | undefined;

  return byName || null;
}

// ── GET /api/deepsid/composer?path=...&author=... ───────────────────────────

router.get('/composer', (req: Request, res: Response) => {
  const db = getDeepSIDDb();
  if (!db) return res.status(503).json({ error: 'DeepSID database not available' });

  const hvscPath = req.query.path as string;
  const author = req.query.author as string;

  let composer: ComposerRow | undefined;

  if (hvscPath) {
    // Direct HVSC folder path lookup
    composer = db.prepare('SELECT * FROM composers WHERE fullname = ? LIMIT 1')
      .get(hvscPath) as ComposerRow | undefined;
    // Also try with HVSC prefix
    if (!composer) {
      composer = db.prepare('SELECT * FROM composers WHERE fullname = ? LIMIT 1')
        .get('_High Voltage SID Collection/' + hvscPath) as ComposerRow | undefined;
    }
  } else if (author) {
    composer = findComposerByAuthor(db, author) ?? undefined;
  }

  if (!composer) {
    return res.json({ found: false });
  }

  // Get links
  const links = db.prepare(
    'SELECT name, url FROM composers_links WHERE composers_id = ? ORDER BY id'
  ).all(composer.id) as ComposerLinkRow[];

  // Get tune count for this composer
  const tuneCount = db.prepare(
    'SELECT COUNT(*) as cnt FROM hvsc_files WHERE fullname LIKE ?'
  ).get(composer.fullname + '/%') as { cnt: number };

  // Get active years (unique years from filenames/copyright)
  const yearFiles = db.prepare(`
    SELECT DISTINCT CAST(SUBSTR(copyright, 1, 4) AS INTEGER) as year
    FROM hvsc_files
    WHERE fullname LIKE ? AND copyright GLOB '[0-9][0-9][0-9][0-9]*'
    ORDER BY year
  `).all(composer.fullname + '/%') as { year: number }[];
  const years = yearFiles.map(r => r.year).filter(y => y >= 1980 && y <= 2030);

  // Get player distribution
  const players = db.prepare(`
    SELECT player, COUNT(*) as cnt
    FROM hvsc_files
    WHERE fullname LIKE ? AND player != ''
    GROUP BY player
    ORDER BY cnt DESC
    LIMIT 15
  `).all(composer.fullname + '/%') as { player: string; cnt: number }[];

  // Get tags for this composer's tunes
  const tags = db.prepare(`
    SELECT DISTINCT ti.name, ti.type
    FROM tags_lookup tl
    JOIN tags_info ti ON ti.id = tl.tags_id
    JOIN hvsc_files hf ON hf.id = tl.files_id
    WHERE hf.fullname LIKE ?
    ORDER BY ti.type, ti.name
  `).all(composer.fullname + '/%') as TagRow[];

  // Photo URL
  const photoFile = composerPhotoFilename(composer.fullname);
  const photoPath = path.join(IMAGES_DIR, 'composers', photoFile);
  const hasPhoto = fs.existsSync(photoPath);

  // Strip HTML from handles (DeepSID uses <del> for old handles)
  const cleanHandles = composer.handles
    .replace(/<del>/g, '').replace(/<\/del>/g, '')
    .split(',').map(h => h.trim()).filter(Boolean);

  // Parse employment
  const employment = composer.employment
    ? composer.employment.split(', ').map(job => {
        const [company, years] = job.split('|');
        return {
          company: company
            .replace(/\[ds-[RCWX]\]/g, '')
            .trim(),
          years: years || '',
        };
      }).filter(e => e.company)
    : [];

  res.json({
    found: true,
    id: composer.id,
    fullname: composer.fullname,
    name: composer.name,
    shortname: composer.shortname,
    handles: cleanHandles,
    focus: composer.focus,
    born: composer.born !== '0000-00-00' ? composer.born : null,
    died: composer.died !== '0000-00-00' ? composer.died : null,
    cause: composer.cause || null,
    country: composer.country || null,
    notable: composer.notable || null,
    employment,
    affiliation: composer.affiliation || null,
    csdbType: composer.csdbtype,
    csdbId: composer.csdbid || null,
    photoUrl: hasPhoto ? `/api/deepsid/image/composers/${photoFile}` : null,
    links,
    tuneCount: tuneCount.cnt,
    activeYears: years,
    players,
    tags: tags.map(t => ({ name: t.name, type: t.type })),
  });
});

// ── GET /api/deepsid/tunes?path=...&author=... ──────────────────────────────

router.get('/tunes', (req: Request, res: Response) => {
  const db = getDeepSIDDb();
  if (!db) return res.status(503).json({ error: 'DeepSID database not available' });

  const hvscPath = req.query.path as string;
  const author = req.query.author as string;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const offset = parseInt(req.query.offset as string) || 0;

  let folderPath = hvscPath;
  if (!folderPath && author) {
    const composer = findComposerByAuthor(db, author);
    if (composer) folderPath = composer.fullname;
  }
  if (!folderPath) return res.json({ tunes: [], total: 0 });

  const total = db.prepare(
    'SELECT COUNT(*) as cnt FROM hvsc_files WHERE fullname LIKE ?'
  ).get(folderPath + '/%') as { cnt: number };

  const tunes = db.prepare(`
    SELECT id, fullname, name, author, copyright, player, sidmodel, clockspeed,
           subtunes, startsubtune, lengths
    FROM hvsc_files
    WHERE fullname LIKE ?
    ORDER BY fullname
    LIMIT ? OFFSET ?
  `).all(folderPath + '/%', limit, offset) as HVSCFileRow[];

  res.json({
    total: total.cnt,
    tunes: tunes.map(t => ({
      id: t.id,
      path: t.fullname,
      filename: t.fullname.split('/').pop(),
      name: t.name,
      author: t.author,
      copyright: t.copyright,
      player: t.player,
      sidModel: t.sidmodel,
      clockSpeed: t.clockspeed,
      subtunes: t.subtunes,
      lengths: t.lengths,
    })),
  });
});

// ── GET /api/deepsid/file/:id ───────────────────────────────────────────────

router.get('/file/:id', (req: Request, res: Response) => {
  const db = getDeepSIDDb();
  if (!db) return res.status(503).json({ error: 'DeepSID database not available' });

  const id = parseInt(req.params.id);
  const file = db.prepare('SELECT * FROM hvsc_files WHERE id = ?').get(id) as HVSCFileRow | undefined;
  if (!file) return res.status(404).json({ error: 'File not found' });

  // Get tags
  const tags = db.prepare(`
    SELECT ti.name, ti.type FROM tags_lookup tl
    JOIN tags_info ti ON ti.id = tl.tags_id
    WHERE tl.files_id = ?
  `).all(id) as TagRow[];

  // Get YouTube links
  const youtube = db.prepare(
    'SELECT channel, video_id, subtune, tab_order, tab_default FROM youtube WHERE file_id = ? ORDER BY tab_order'
  ).all(id) as YouTubeRow[];

  // Get lengths per subtune
  const lengths = db.prepare(
    'SELECT subtune, length FROM hvsc_lengths WHERE fullname = ? ORDER BY subtune'
  ).all(file.fullname) as { subtune: number; length: string }[];

  res.json({
    id: file.id,
    path: file.fullname,
    filename: file.fullname.split('/').pop(),
    name: file.name,
    author: file.author,
    copyright: file.copyright,
    player: file.player,
    sidModel: file.sidmodel,
    clockSpeed: file.clockspeed,
    subtunes: file.subtunes,
    startSubtune: file.startsubtune,
    tags: tags.map(t => ({ name: t.name, type: t.type })),
    youtube: youtube.map(y => ({
      channel: y.channel,
      videoId: y.video_id,
      subtune: y.subtune,
      isDefault: y.tab_default === 1,
    })),
    lengths: lengths.map(l => ({ subtune: l.subtune, length: l.length })),
  });
});

// ── GET /api/deepsid/file-by-path?path=... ──────────────────────────────────

router.get('/file-by-path', (req: Request, res: Response) => {
  const db = getDeepSIDDb();
  if (!db) return res.status(503).json({ error: 'DeepSID database not available' });

  const filePath = req.query.path as string;
  if (!filePath) return res.status(400).json({ error: 'Missing path' });

  const file = db.prepare('SELECT id FROM hvsc_files WHERE fullname = ? LIMIT 1')
    .get(filePath) as { id: number } | undefined;
  if (!file) {
    // Try with HVSC prefix
    const prefixed = db.prepare('SELECT id FROM hvsc_files WHERE fullname = ? LIMIT 1')
      .get('_High Voltage SID Collection/' + filePath) as { id: number } | undefined;
    if (!prefixed) return res.status(404).json({ error: 'File not found' });
    return res.redirect(`/api/deepsid/file/${prefixed.id}`);
  }
  res.redirect(`/api/deepsid/file/${file.id}`);
});

// ── GET /api/deepsid/player/:name ───────────────────────────────────────────

router.get('/player/:name', (req: Request, res: Response) => {
  const db = getDeepSIDDb();
  if (!db) return res.status(503).json({ error: 'DeepSID database not available' });

  const name = req.params.name;
  const lookup = db.prepare(
    'SELECT playerid FROM players_lookup WHERE player = ? LIMIT 1'
  ).get(name) as { playerid: number } | undefined;

  if (!lookup) return res.status(404).json({ error: 'Player not found' });

  const info = db.prepare('SELECT * FROM players_info WHERE id = ?')
    .get(lookup.playerid) as PlayerInfoRow | undefined;

  if (!info) return res.status(404).json({ error: 'Player info not found' });

  res.json({
    title: info.title,
    description: info.description,
    developer: info.developer,
    startYear: info.startyear || null,
    endYear: info.endyear || null,
  });
});

// ── GET /api/deepsid/search?q=...&category=...&sort=...&scope=... ────────────

router.get('/search', (req: Request, res: Response) => {
  const db = getDeepSIDDb();
  if (!db) return res.status(503).json({ error: 'DeepSID database not available' });

  const query = (req.query.q as string || '').trim();
  if (!query) return res.json({ composers: [], files: [], total: 0 });

  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const offset = parseInt(req.query.offset as string) || 0;
  const category = (req.query.category as string) || 'all';
  const sort = (req.query.sort as string) || 'relevance';
  const scope = (req.query.scope as string) || ''; // folder path to scope search

  const pattern = `%${query}%`;
  const scopePattern = scope ? `${scope}%` : '%';

  // Build category-specific queries
  let composers: ComposerRow[] = [];
  let files: HVSCFileRow[] = [];
  let totalFiles = 0;

  const shouldSearchComposers = ['all', 'author', 'country'].includes(category);
  const shouldSearchFiles = ['all', 'filename', 'author', 'copyright', 'player', 'type', 'tags', 'stil'].includes(category);

  if (shouldSearchComposers) {
    const composerWhere = category === 'country'
      ? 'WHERE country LIKE ?'
      : 'WHERE name LIKE ? OR handles LIKE ? OR shortname LIKE ?';
    const composerParams = category === 'country'
      ? [pattern, limit]
      : [pattern, pattern, pattern, limit];

    composers = db.prepare(`
      SELECT id, fullname, name, handles, country, notable
      FROM composers
      ${composerWhere}
      LIMIT ?
    `).all(...composerParams) as ComposerRow[];
  }

  if (shouldSearchFiles) {
    let fileWhere = 'WHERE fullname LIKE ?';
    let fileParams: any[] = [scopePattern];

    switch (category) {
      case 'filename':
        fileWhere += ' AND fullname LIKE ?';
        fileParams.push(pattern);
        break;
      case 'author':
        fileWhere += ' AND author LIKE ?';
        fileParams.push(pattern);
        break;
      case 'copyright':
        fileWhere += ' AND copyright LIKE ?';
        fileParams.push(pattern);
        break;
      case 'player':
        fileWhere += ' AND player LIKE ?';
        fileParams.push(pattern);
        break;
      case 'type':
        fileWhere += ' AND type LIKE ?';
        fileParams.push(pattern);
        break;
      case 'tags':
        fileWhere = `WHERE f.id IN (
          SELECT tl.files_id FROM tags_lookup tl
          JOIN tags_info ti ON tl.tags_id = ti.id
          WHERE ti.name LIKE ?
        ) AND f.fullname LIKE ?`;
        fileParams = [pattern, scopePattern];
        break;
      default: // 'all'
        fileWhere += ' AND (fullname LIKE ? OR name LIKE ? OR author LIKE ?)';
        fileParams.push(pattern, pattern, pattern);
        break;
    }

    const orderBy = sort === 'name' ? 'ORDER BY name' : sort === 'author' ? 'ORDER BY author' : 'ORDER BY fullname';
    const tableAlias = category === 'tags' ? 'f' : 'hvsc_files';
    const fromClause = category === 'tags' ? 'hvsc_files f' : 'hvsc_files';

    const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM ${fromClause} ${fileWhere}`).get(...fileParams) as { cnt: number };
    totalFiles = countRow.cnt;

    files = db.prepare(`
      SELECT ${tableAlias}.id, ${tableAlias}.fullname, ${tableAlias}.name, ${tableAlias}.author, ${tableAlias}.player, ${tableAlias}.sidmodel, ${tableAlias}.subtunes
      FROM ${fromClause}
      ${fileWhere}
      ${orderBy}
      LIMIT ? OFFSET ?
    `).all(...fileParams, limit, offset) as HVSCFileRow[];
  }

  res.json({
    composers: composers.map(c => ({
      id: c.id,
      fullname: c.fullname,
      name: c.name,
      handles: c.handles,
      country: c.country,
      notable: c.notable,
    })),
    files: files.map(f => ({
      id: f.id,
      path: f.fullname,
      filename: f.fullname.split('/').pop(),
      name: (f as any).name,
      author: (f as any).author,
      player: f.player,
      sidModel: f.sidmodel,
      subtunes: f.subtunes,
    })),
    total: totalFiles,
  });
});

// ── GET /api/deepsid/stats ──────────────────────────────────────────────────

router.get('/stats', (_req: Request, res: Response) => {
  const db = getDeepSIDDb();
  if (!db) return res.status(503).json({ error: 'DeepSID database not available' });

  const composers = db.prepare('SELECT COUNT(*) as cnt FROM composers').get() as { cnt: number };
  const files = db.prepare('SELECT COUNT(*) as cnt FROM hvsc_files').get() as { cnt: number };
  const tags = db.prepare('SELECT COUNT(*) as cnt FROM tags_info').get() as { cnt: number };
  const youtube = db.prepare('SELECT COUNT(*) as cnt FROM youtube').get() as { cnt: number };

  res.json({
    composers: composers.cnt,
    files: files.cnt,
    tags: tags.cnt,
    youtubeLinks: youtube.cnt,
    hvscVersion: 80,
  });
});

// ── GET /api/deepsid/image/:type/:filename ──────────────────────────────────

router.get('/image/:type/:filename', (req: Request, res: Response) => {
  const { type, filename } = req.params;
  if (!['composers', 'countries'].includes(type)) {
    return res.status(400).json({ error: 'Invalid image type' });
  }

  // Sanitize filename
  const safe = path.basename(filename);
  const filePath = path.join(IMAGES_DIR, type, safe);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Image not found' });
  }

  const ext = path.extname(safe).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.gif': 'image/gif',
  };

  res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=604800'); // 1 week
  res.sendFile(filePath);
});

// ── GET /api/deepsid/tags ───────────────────────────────────────────────────

router.get('/tags', (_req: Request, res: Response) => {
  const db = getDeepSIDDb();
  if (!db) return res.status(503).json({ error: 'DeepSID database not available' });

  const tags = db.prepare(`
    SELECT ti.id, ti.name, ti.type, COUNT(tl.files_id) as count
    FROM tags_info ti
    LEFT JOIN tags_lookup tl ON ti.id = tl.tags_id
    GROUP BY ti.id
    ORDER BY ti.name
  `).all() as any[];

  res.json(tags.map(t => ({
    id: t.id,
    name: t.name,
    type: t.type || 'music',
    count: t.count,
  })));
});

// ── GET /api/deepsid/tags/:fileId ───────────────────────────────────────────

router.get('/tags/:fileId', (req: Request, res: Response) => {
  const db = getDeepSIDDb();
  if (!db) return res.status(503).json({ error: 'DeepSID database not available' });

  const fileId = parseInt(req.params.fileId);
  if (isNaN(fileId)) return res.status(400).json({ error: 'Invalid file ID' });

  const tags = db.prepare(`
    SELECT ti.id, ti.name, ti.type
    FROM tags_lookup tl
    JOIN tags_info ti ON tl.tags_id = ti.id
    WHERE tl.files_id = ?
    ORDER BY ti.name
  `).all(fileId) as any[];

  res.json(tags.map(t => ({
    id: t.id,
    name: t.name,
    type: t.type || 'music',
  })));
});

// ── POST /api/deepsid/tags/:fileId ──────────────────────────────────────────

router.post('/tags/:fileId', (req: Request, res: Response) => {
  const db = getDeepSIDDb();
  if (!db) return res.status(503).json({ error: 'DeepSID database not available' });

  const fileId = parseInt(req.params.fileId);
  const { tagId } = req.body;
  if (isNaN(fileId) || !tagId) return res.status(400).json({ error: 'Missing fileId or tagId' });

  try {
    db.prepare('INSERT OR IGNORE INTO tags_lookup (files_id, tags_id) VALUES (?, ?)').run(fileId, tagId);
    res.json({ success: true });
  } catch (err) {
    console.error('[DeepSID] Tag add error:', err);
    res.status(500).json({ error: 'Failed to add tag' });
  }
});

// ── DELETE /api/deepsid/tags/:fileId/:tagId ─────────────────────────────────

router.delete('/tags/:fileId/:tagId', (req: Request, res: Response) => {
  const db = getDeepSIDDb();
  if (!db) return res.status(503).json({ error: 'DeepSID database not available' });

  const fileId = parseInt(req.params.fileId);
  const tagId = parseInt(req.params.tagId);
  if (isNaN(fileId) || isNaN(tagId)) return res.status(400).json({ error: 'Invalid IDs' });

  try {
    db.prepare('DELETE FROM tags_lookup WHERE files_id = ? AND tags_id = ?').run(fileId, tagId);
    res.json({ success: true });
  } catch (err) {
    console.error('[DeepSID] Tag remove error:', err);
    res.status(500).json({ error: 'Failed to remove tag' });
  }
});

// ── POST /api/deepsid/tags ──────────────────────────────────────────────────

router.post('/tags', (req: Request, res: Response) => {
  const db = getDeepSIDDb();
  if (!db) return res.status(503).json({ error: 'DeepSID database not available' });

  const { name, type } = req.body;
  if (!name) return res.status(400).json({ error: 'Missing tag name' });

  try {
    const existing = db.prepare('SELECT id FROM tags_info WHERE name = ?').get(name) as any;
    if (existing) return res.json({ id: existing.id, name, type: type || 'music', exists: true });

    const result = db.prepare('INSERT INTO tags_info (name, type) VALUES (?, ?)').run(name, type || 'music');
    res.json({ id: result.lastInsertRowid, name, type: type || 'music', exists: false });
  } catch (err) {
    console.error('[DeepSID] Tag create error:', err);
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

// ── GET /api/deepsid/recommended ────────────────────────────────────────────

router.get('/recommended', (_req: Request, res: Response) => {
  const db = getDeepSIDDb();
  if (!db) return res.status(503).json({ error: 'DeepSID database not available' });

  // Return tunes flagged as notable or with the most YouTube links as "recommended"
  const recommended = db.prepare(`
    SELECT f.id, f.fullname, f.name, f.author, f.player, f.sidmodel, f.subtunes,
           COUNT(y.id) as yt_count
    FROM hvsc_files f
    LEFT JOIN youtube y ON f.id = y.files_id
    GROUP BY f.id
    HAVING yt_count > 0
    ORDER BY yt_count DESC
    LIMIT 50
  `).all() as any[];

  const notableComposers = db.prepare(`
    SELECT id, fullname, name, handles, country, notable
    FROM composers
    WHERE notable IS NOT NULL AND notable != ''
    LIMIT 30
  `).all() as ComposerRow[];

  res.json({
    topTunes: recommended.map(r => ({
      id: r.id,
      path: r.fullname,
      filename: r.fullname.split('/').pop(),
      name: r.name,
      author: r.author,
      player: r.player,
      youtubeLinks: r.yt_count,
    })),
    notableComposers: notableComposers.map(c => ({
      id: c.id,
      fullname: c.fullname,
      name: c.name,
      handles: c.handles,
      country: c.country,
      notable: c.notable,
    })),
  });
});

export default router;
