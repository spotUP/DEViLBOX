/**
 * Repair SID playlists — find SID tracks without hvsc: prefix,
 * search HVSC for matches, and output the patched localStorage JSON.
 *
 * Usage:
 *   1. In browser console: copy(localStorage.getItem("devilbox-dj-playlists"))
 *   2. Paste into a file: tools/sid-playlists-raw.json
 *   3. Run: node tools/repair-sid-playlists.mjs tools/sid-playlists-raw.json
 *   4. Script outputs patched file + a JS snippet to paste back into browser console
 *
 * Requires: dev server running (npm run dev) for HVSC search API.
 */

const API = 'http://localhost:3001/api';

async function searchHVSC(query, limit = 20) {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const resp = await fetch(`${API}/hvsc/search?${params}`);
  if (!resp.ok) throw new Error('HVSC search failed: ' + resp.status);
  const data = await resp.json();
  return data.results || [];
}

// Check server is running
try {
  await fetch(`${API}/hvsc/search?q=test&limit=1`);
} catch {
  console.error('Server not running at localhost:3001 — start with: npm run dev');
  process.exit(1);
}

// Read input
const fs = await import('fs');
const inputFile = process.argv[2];
if (!inputFile) {
  console.error('Usage: node tools/repair-sid-playlists.mjs <localStorage-json-file>');
  console.error('');
  console.error('Get the data from browser console:');
  console.error('  copy(localStorage.getItem("devilbox-dj-playlists"))');
  console.error('Then paste into a file and run this script on it.');
  process.exit(1);
}

const raw = fs.readFileSync(inputFile, 'utf-8');
const data = JSON.parse(raw);
const playlists = data.state?.playlists || data.playlists || [];

// Identify SID playlists by name keywords
const SID_KEYWORDS = ['sid', 'c64', 'commodore', 'dual sid', '6581', '8580'];
const sidPlaylists = playlists.filter(pl => {
  const name = pl.name.toLowerCase();
  return SID_KEYWORDS.some(kw => name.includes(kw));
});

if (sidPlaylists.length === 0) {
  console.log('No SID playlists found. Playlist names:');
  for (const pl of playlists) console.log('  - "' + pl.name + '" (' + pl.tracks.length + ' tracks)');
  process.exit(0);
}

console.log('Found ' + sidPlaylists.length + ' SID playlist(s):');
for (const pl of sidPlaylists) {
  console.log('  "' + pl.name + '" — ' + pl.tracks.length + ' tracks');
}

let totalFixed = 0;
let totalFailed = 0;
let totalSkipped = 0;

for (const pl of sidPlaylists) {
  console.log('\n-- Repairing "' + pl.name + '" --');

  for (let i = 0; i < pl.tracks.length; i++) {
    const t = pl.tracks[i];

    // Already has hvsc: or modland: prefix — skip
    if (t.fileName.startsWith('hvsc:') || t.fileName.startsWith('modland:')) {
      console.log('  OK ' + (t.trackName || t.fileName) + ' — already has prefix');
      totalSkipped++;
      continue;
    }

    // Extract search term from track name or filename
    const searchTerm = (t.trackName || t.fileName)
      .replace(/\.sid$/i, '')
      .replace(/[_-]/g, ' ')
      .trim();

    if (!searchTerm) {
      console.log('  SKIP track ' + i + ': empty name');
      totalFailed++;
      continue;
    }

    try {
      let sidResults = [];

      // First try: full search term
      const results = await searchHVSC(searchTerm, 20);
      sidResults = results.filter(r => !r.isDirectory && r.name.toLowerCase().endsWith('.sid'));

      // Second try: just first word (if >= 3 chars)
      if (sidResults.length === 0) {
        const firstWord = searchTerm.split(/\s+/)[0];
        if (firstWord && firstWord.length >= 3) {
          await new Promise(r => setTimeout(r, 200));
          const retry = await searchHVSC(firstWord, 20);
          sidResults = retry.filter(r => !r.isDirectory && r.name.toLowerCase().endsWith('.sid'));
        }
      }

      if (sidResults.length > 0) {
        // Prefer exact filename match
        const lowerSearch = searchTerm.toLowerCase();
        const exactMatch = sidResults.find(r =>
          r.name.toLowerCase().replace(/\.sid$/i, '') === lowerSearch
        );
        const match = exactMatch || sidResults[0];

        const oldFileName = t.fileName;
        t.fileName = 'hvsc:' + match.path;
        if (!t.trackName || t.trackName === oldFileName) {
          t.trackName = match.name.replace(/\.sid$/i, '');
        }
        if (match.author) t.author = match.author;
        t.format = 'SID';

        console.log('  FIXED "' + searchTerm + '" -> hvsc:' + match.path);
        totalFixed++;
      } else {
        console.log('  MISS  "' + searchTerm + '" — no HVSC match');
        totalFailed++;
      }

      // Throttle
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.log('  ERROR "' + searchTerm + '" — ' + err.message);
      totalFailed++;
    }
  }
}

console.log('\n-- Summary --');
console.log('  Fixed:   ' + totalFixed);
console.log('  Skipped: ' + totalSkipped);
console.log('  Failed:  ' + totalFailed);

if (totalFixed > 0) {
  const outFile = inputFile.replace(/\.json$/, '') + '-patched.json';
  fs.writeFileSync(outFile, JSON.stringify(data));
  console.log('\nPatched data written to: ' + outFile);
  console.log('');
  console.log('To apply, paste this in the browser console:');
  console.log('  localStorage.setItem("devilbox-dj-playlists", <contents of ' + outFile + '>)');
  console.log('  location.reload()');
}
