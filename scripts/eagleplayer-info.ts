#!/usr/bin/env npx tsx
/**
 * eagleplayer-info.ts — UADE Eagleplayer.conf Lookup Tool
 *
 * Parses Reference Code/uade-3.05/eagleplayer.conf and looks up player
 * information by format name, extension, or lists all players.
 *
 * Usage:
 *   npx tsx scripts/eagleplayer-info.ts <name-or-ext>
 *   npx tsx scripts/eagleplayer-info.ts --list
 *   npx tsx scripts/eagleplayer-info.ts --ext jt
 *   npx tsx scripts/eagleplayer-info.ts JeroenTel
 */

import { readFileSync, statSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const CONF_PATH = join(ROOT, 'Reference Code/uade-3.05/eagleplayer.conf');
const PLAYERS_DIR = join(ROOT, 'Reference Code/uade-3.05/players');

// ── Data types ────────────────────────────────────────────────────────────────

interface EagleEntry {
  playerName: string;
  prefixes: string[];
  options: string[];
  playerPath: string | null;
  playerSize: number | null;
}

// ── Parse eagleplayer.conf ────────────────────────────────────────────────────

function parseConf(): EagleEntry[] {
  let src: string;
  try {
    src = readFileSync(CONF_PATH, 'utf8');
  } catch {
    console.error(`❌ Cannot read: ${CONF_PATH}`);
    console.error('   Make sure you are running from the DEViLBOX root directory.');
    process.exit(1);
  }

  const entries: EagleEntry[] = [];

  for (const rawLine of src.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    // Fields are tab-separated: PlayerName  prefixes=ext1,ext2  [options...]
    const parts = line.split(/\t+/);
    if (parts.length < 2) continue;

    const playerName = parts[0].trim();
    const prefixField = parts.find(p => p.startsWith('prefixes='));
    if (!prefixField) continue;

    const prefixes = prefixField.replace('prefixes=', '').split(',').map(s => s.trim().toLowerCase());
    const options = parts.filter(p => !p.startsWith('prefixes=') && p !== playerName && p.trim()).map(s => s.trim());

    // Look up player binary (case-sensitive on some systems)
    const playerPath = join(PLAYERS_DIR, playerName);
    let resolvedPath: string | null = null;
    let playerSize: number | null = null;

    if (existsSync(playerPath)) {
      resolvedPath = playerPath;
      try { playerSize = statSync(playerPath).size; } catch { /* */ }
    } else {
      // Try case-insensitive match via listing
      // (not implemented for perf; show the expected path anyway)
      resolvedPath = null;
    }

    entries.push({ playerName, prefixes, options, playerPath: resolvedPath, playerSize });
  }

  return entries;
}

// ── Format output ─────────────────────────────────────────────────────────────

function formatSize(bytes: number | null): string {
  if (bytes === null) return 'not found';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function printEntry(entry: EagleEntry) {
  console.log(`\n  Player:    ${entry.playerName}`);
  console.log(`  Prefixes:  ${entry.prefixes.join(', ')}`);
  if (entry.options.length > 0) {
    console.log(`  Options:   ${entry.options.join('  ')}`);
  }
  console.log(`  Binary:    ${entry.playerPath ?? '(not found in players/)'}`);
  console.log(`  Size:      ${formatSize(entry.playerSize)}`);
  if (entry.playerSize !== null) {
    const complexity = entry.playerSize < 4096 ? 'small (simple player)'
      : entry.playerSize < 16384 ? 'medium'
      : entry.playerSize < 64000 ? 'large (complex player)'
      : 'very large (complex + tables)';
    console.log(`  Complexity: ${complexity} (${entry.playerSize.toLocaleString()} bytes)`);
  }
}

// ── List mode ─────────────────────────────────────────────────────────────────

function listAll(entries: EagleEntry[]) {
  console.log('\n── All Eagleplayers ───────────────────────────────────────────────────────────');
  console.log('  Player Name                    Prefixes                         Size');
  console.log('  ─────────────────────────────  ───────────────────────────────  ──────────');
  for (const e of entries) {
    const name = e.playerName.substring(0, 30).padEnd(30);
    const pref = e.prefixes.join(',').substring(0, 32).padEnd(32);
    const size = formatSize(e.playerSize).padStart(10);
    console.log(`  ${name}  ${pref}  ${size}`);
  }
  console.log(`\n  Total: ${entries.length} players\n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
eagleplayer-info.ts — UADE eagleplayer.conf lookup

Usage:
  npx tsx scripts/eagleplayer-info.ts <format-name>   # search by player name
  npx tsx scripts/eagleplayer-info.ts --ext <ext>     # search by extension
  npx tsx scripts/eagleplayer-info.ts --list          # list all players

Examples:
  npx tsx scripts/eagleplayer-info.ts JeroenTel
  npx tsx scripts/eagleplayer-info.ts --ext jt
  npx tsx scripts/eagleplayer-info.ts --ext mdat
  npx tsx scripts/eagleplayer-info.ts --list
`);
  process.exit(0);
}

const entries = parseConf();

if (args.includes('--list')) {
  listAll(entries);
  process.exit(0);
}

// Extension lookup
const extIdx = args.indexOf('--ext');
if (extIdx !== -1) {
  const ext = args[extIdx + 1]?.toLowerCase();
  if (!ext) {
    console.error('❌ --ext requires a value');
    process.exit(1);
  }
  const matches = entries.filter(e => e.prefixes.includes(ext));
  if (matches.length === 0) {
    console.log(`\n  No player found for extension: ${ext}`);
    console.log('  (may be handled by magic-byte detection or a generic player)\n');
  } else {
    console.log(`\n── Players for extension ".${ext}" ──────────────────────────────────────────`);
    for (const m of matches) printEntry(m);
    console.log();
  }
  process.exit(0);
}

// Name search (case-insensitive substring)
const query = args[0].toLowerCase();
const matches = entries.filter(e =>
  e.playerName.toLowerCase().includes(query) ||
  e.prefixes.some(p => p === query)
);

if (matches.length === 0) {
  console.log(`\n  No player found matching: ${args[0]}`);
  console.log('  Try: npx tsx scripts/eagleplayer-info.ts --list\n');
} else {
  console.log(`\n── Eagleplayer matches for "${args[0]}" ──────────────────────────────────────`);
  for (const m of matches) printEntry(m);
  console.log();
}
