/**
 * Contract tests for the dub-move registry coverage.
 *
 * Guards the exact regression that happened on 2026-04-20: PR #42 added 12
 * new moves to `DubRouter.MOVES` but `DUB_MOVE_KINDS` (the MIDI-routing
 * table) and `MOVE_COLOR` (the lane-timeline color map) were never updated.
 * Result: 12 moves worked in the tracker view via mouse-click only, with
 * no MIDI CC mapping and grey lane bars.
 *
 * These tests statically parse all three sources and assert a bidirectional
 * 1:1 correspondence so the next new move can't slip through the same gap.
 *
 * Pure-string checks over the source files — no runtime, no imports of
 * DubBus / DubRouter (those pull in Tone.js + WASM).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

/** Parse the keys out of a TS object literal matching `const name: Record<...> = { key: ..., ... };`
 *  OR `const name = { key, otherKey, ... };` (shorthand property syntax).
 *  Brittle on purpose — if someone restructures the table into a Map or a
 *  computed shape, this parser fails loudly and forces the author to
 *  update this test together with the refactor. */
function parseKeys(src: string, constName: string): string[] {
  const re = new RegExp(`const\\s+${constName}\\s*[:=][^{]*{([\\s\\S]*?)\\n};`, 'm');
  const m = src.match(re);
  if (!m) throw new Error(`Could not locate ${constName} in source (has the table shape changed?)`);
  const body = m[1];
  const keys: string[] = [];
  // Match leading identifier (optionally quoted) followed by ':' OR a trailing ','
  // (shorthand property syntax — `echoThrow,` without a value).
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;
    // Strict form: name:value
    const colonMatch = trimmed.match(/^(?:['"]?)([A-Za-z_][A-Za-z0-9_]*)(?:['"]?)\s*:/);
    if (colonMatch) {
      keys.push(colonMatch[1]);
      continue;
    }
    // Shorthand form: name, or name followed by end-of-line before `}`.
    const shorthandMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*,?\s*$/);
    if (shorthandMatch) keys.push(shorthandMatch[1]);
  }
  return keys;
}

/**
 * X8, reported 2026-09-18: `fire_dub_move`'s description listed 27 moveIds
 * from the April era — no skankEchoThrow, skankFloatThrow, versionDrop,
 * riddimSection, combSweep, hpfRise or madProfPingPong. The router accepts any
 * registered id, so they all WORKED; an agent reading the tool description
 * simply had no way to know they existed. Same staleness class as the manual
 * chapters.
 *
 * A tool description has to be a literal string — the MCP protocol hands it to
 * the client before any of this code runs — so it cannot be generated from the
 * registry. Making it impossible to go stale is the next best thing, and that
 * is what this is: the description is now part of the same bidirectional
 * contract as DUB_MOVE_KINDS and MOVE_COLOR.
 */
function parseToolMoveIds(serverSrc: string): string[] {
  const m = serverSrc.match(/Valid moveIds \(all \d+[^)]*\):\s*([^']*?)\.'/);
  if (!m) {
    throw new Error(
      "Could not find the moveId list in fire_dub_move's description. " +
      'If you reworded it, keep the "Valid moveIds (all N, ...): a, b, c." shape ' +
      'so this contract can still read it.',
    );
  }
  return m[1].split(',').map(x => x.trim()).filter(Boolean);
}

describe('dub move registry contract', () => {
  const router = read('engine/dub/DubRouter.ts');
  const paramRouter = read('midi/performance/parameterRouter.ts');
  const moveColors = read('engine/dub/moveColors.ts');

  const moveIds = parseKeys(router, 'MOVES').sort();
  const midiKinds = parseKeys(paramRouter, 'DUB_MOVE_KINDS').sort();
  const laneColors = parseKeys(moveColors, 'MOVE_COLOR').sort();

  it('DubRouter.MOVES has more than one entry (smoke)', () => {
    expect(moveIds.length).toBeGreaterThanOrEqual(15);
  });

  // ── X8: the MCP tool description is part of the contract ───────────────
  const mcpServer = readFileSync(
    resolve(ROOT, '..', 'server', 'src', 'mcp', 'mcpServer.ts'), 'utf8',
  );
  const toolMoveIds = parseToolMoveIds(mcpServer).sort();

  it('fire_dub_move lists every move the router can actually fire', () => {
    const missing = moveIds.filter(id => !toolMoveIds.includes(id));
    expect(
      missing,
      'Moves registered in DubRouter.MOVES but absent from fire_dub_move\'s description. ' +
      'Consequence: the move works, but an agent reading the tool has no way to know it exists. ' +
      'Add them to the description in server/src/mcp/mcpServer.ts.',
    ).toEqual([]);
  });

  it('fire_dub_move does not advertise moves that do not exist', () => {
    const phantom = toolMoveIds.filter(id => !moveIds.includes(id));
    expect(
      phantom,
      'Listed in fire_dub_move\'s description but not in DubRouter.MOVES — ' +
      'an agent would call these and get an error.',
    ).toEqual([]);
  });

  it('states the count, and states it correctly', () => {
    const declared = Number(/Valid moveIds \(all (\d+)/.exec(mcpServer)?.[1]);
    expect(declared).toBe(moveIds.length);
  });

  it('every DubRouter.MOVES entry has a DUB_MOVE_KINDS entry', () => {
    const missingFromMidi = moveIds.filter((id) => !midiKinds.includes(id));
    expect(
      missingFromMidi,
      `Moves in DubRouter.MOVES but not in DUB_MOVE_KINDS (parameterRouter.ts). ` +
      `Consequence: MIDI controllers can't fire these moves. ` +
      `Add them to DUB_MOVE_KINDS as 'trigger' or 'hold'.`,
    ).toEqual([]);
  });

  it('every DUB_MOVE_KINDS entry has a real move in DubRouter.MOVES', () => {
    const orphans = midiKinds.filter((id) => !moveIds.includes(id));
    expect(
      orphans,
      `Moves in DUB_MOVE_KINDS but not in DubRouter.MOVES. ` +
      `MIDI route points to nothing — will silently no-op when the CC fires.`,
    ).toEqual([]);
  });

  it('every DubRouter.MOVES entry has a MOVE_COLOR entry', () => {
    const missingFromColor = moveIds.filter((id) => !laneColors.includes(id));
    expect(
      missingFromColor,
      `Moves in DubRouter.MOVES but not in MOVE_COLOR (engine/dub/moveColors.ts). ` +
      `Consequence: these moves render as the default grey bar on the lane timeline.`,
    ).toEqual([]);
  });

  it('every MOVE_COLOR entry has a real move in DubRouter.MOVES', () => {
    const orphans = laneColors.filter((id) => !moveIds.includes(id));
    expect(
      orphans,
      `Colors defined for moves that no longer exist in DubRouter.MOVES. ` +
      `Dead style code; remove.`,
    ).toEqual([]);
  });

  it('move-id lists in all three sources are IDENTICAL sets', () => {
    // Redundant with the above but makes the symmetry explicit. Reading
    // an assertion failure with a set diff is faster than combining two
    // separate ones.
    expect(new Set(moveIds)).toEqual(new Set(midiKinds));
    expect(new Set(moveIds)).toEqual(new Set(laneColors));
  });
});
