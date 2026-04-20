/**
 * G3 contract: every move registered in `DubRouter.MOVES` MUST have a
 * matching keyboard command exported from `dubMoves.ts`, and the exported
 * command's signature MUST match the move's kind (trigger = zero-arg fn,
 * hold = `(start?: boolean) => boolean`).
 *
 * Rationale: adding a new move (e.g. `reverseEcho`) to the DubRouter
 * registry without also wiring a keyboard binding creates a quiet surface
 * gap — MIDI + UI fire the move but nothing lives under the fingers. This
 * test locks the two registries in step, so the next added move either
 * ships with a keyboard command or fails CI.
 *
 * Static parse (no runtime) because DubRouter pulls in the entire Tone.js
 * graph which is heavy in happy-dom.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DUB_ROUTER_SRC = readFileSync(
  resolve(__dirname, '..', '..', '..', 'dub', 'DubRouter.ts'),
  'utf8',
);
const PARAM_ROUTER_SRC = readFileSync(
  resolve(__dirname, '..', '..', '..', '..', 'midi', 'performance', 'parameterRouter.ts'),
  'utf8',
);
const DUB_MOVES_SRC = readFileSync(
  resolve(__dirname, '..', 'dubMoves.ts'),
  'utf8',
);

function extractMovesRegistry(): string[] {
  // const MOVES: Record<string, DubMove> = { echoThrow, dubStab, ... };
  const match = DUB_ROUTER_SRC.match(/const\s+MOVES\s*:\s*Record<string,\s*DubMove>\s*=\s*\{([\s\S]*?)\};/);
  if (!match) throw new Error('MOVES registry not found in DubRouter.ts');
  const body = match[1];
  const ids: string[] = [];
  // Shorthand: `  echoThrow,`
  for (const m of body.matchAll(/^\s*([a-zA-Z][a-zA-Z0-9]*)\s*,/gm)) {
    ids.push(m[1]);
  }
  // Colon form: `  echoThrow: echoThrow,` (defensive — not currently used)
  for (const m of body.matchAll(/^\s*([a-zA-Z][a-zA-Z0-9]*)\s*:\s*[a-zA-Z]/gm)) {
    if (!ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
}

function extractMoveKinds(): Record<string, 'trigger' | 'hold'> {
  const match = PARAM_ROUTER_SRC.match(/DUB_MOVE_KINDS\s*:\s*Record<string,\s*'trigger'\s*\|\s*'hold'>\s*=\s*\{([\s\S]*?)\};/);
  if (!match) throw new Error('DUB_MOVE_KINDS not found in parameterRouter.ts');
  const body = match[1];
  const kinds: Record<string, 'trigger' | 'hold'> = {};
  for (const m of body.matchAll(/([a-zA-Z][a-zA-Z0-9]*)\s*:\s*'(trigger|hold)'/g)) {
    kinds[m[1]] = m[2] as 'trigger' | 'hold';
  }
  return kinds;
}

function exportedCommands(): Set<string> {
  const names = new Set<string>();
  // `export function dubEchoThrow()` — trigger commands
  for (const m of DUB_MOVES_SRC.matchAll(/export\s+function\s+([a-zA-Z][a-zA-Z0-9]*)/g)) {
    names.add(m[1]);
  }
  // `export const dubChannelMute` — hold commands
  for (const m of DUB_MOVES_SRC.matchAll(/export\s+const\s+([a-zA-Z][a-zA-Z0-9]*)/g)) {
    names.add(m[1]);
  }
  return names;
}

/**
 * Convert a moveId like `echoThrow` to its expected command export name
 * `dubEchoThrow`. The `dub` prefix is used everywhere to avoid global-scope
 * collisions with existing commands (`stab`, `siren`, etc.).
 * Names that already start with `dub` keep a single `dub` prefix.
 */
function moveIdToCommandName(moveId: string): string {
  if (moveId.startsWith('dub')) {
    // dubStab → dubStab, dubSiren → dubSiren
    return moveId;
  }
  return 'dub' + moveId.charAt(0).toUpperCase() + moveId.slice(1);
}

describe('dubMoves keyboard commands — G3 contract', () => {
  it('every DubRouter.MOVES id has a matching exported command', () => {
    const moves = extractMovesRegistry();
    const commands = exportedCommands();
    const missing: string[] = [];
    for (const moveId of moves) {
      const expected = moveIdToCommandName(moveId);
      if (!commands.has(expected)) missing.push(`${moveId} → ${expected}`);
    }
    expect(missing, `missing keyboard command exports: ${missing.join(', ')}`).toEqual([]);
  });

  it('every move kind matches the exported shape (trigger=function, hold=const)', () => {
    const moves = extractMovesRegistry();
    const kinds = extractMoveKinds();
    const mismatches: string[] = [];
    for (const moveId of moves) {
      const kind = kinds[moveId];
      if (!kind) {
        mismatches.push(`${moveId}: no kind in DUB_MOVE_KINDS`);
        continue;
      }
      const name = moveIdToCommandName(moveId);
      // trigger moves exported as `export function dubXxx()`
      const isTrigger = new RegExp(`export\\s+function\\s+${name}\\s*\\(\\s*\\)`).test(DUB_MOVES_SRC);
      // hold moves exported as `export const dubXxx:`
      const isHold = new RegExp(`export\\s+const\\s+${name}\\s*:`).test(DUB_MOVES_SRC);
      if (kind === 'trigger' && !isTrigger) mismatches.push(`${moveId}: expected trigger function ${name}()`);
      if (kind === 'hold' && !isHold) mismatches.push(`${moveId}: expected hold const ${name}`);
    }
    expect(mismatches, `shape mismatches: ${mismatches.join('; ')}`).toEqual([]);
  });

  it('the registry has the full 27 moves (prevents accidental deletion)', () => {
    // Ratchet — if a move is intentionally removed, bump this number. It
    // exists to make a silent `MOVES = { ... }` truncation fail loudly.
    const moves = extractMovesRegistry();
    expect(moves.length).toBeGreaterThanOrEqual(27);
  });

  it('no orphan exports (commands for moves that no longer exist)', () => {
    // Reverse check: if someone deletes a move from DubRouter.MOVES but
    // forgets to remove the keyboard command, the orphan command will
    // silently call `fire('deletedMove', ...)` and log a warning at
    // runtime. Fail fast here instead.
    const moves = new Set(extractMovesRegistry());
    const commands = exportedCommands();
    const orphans: string[] = [];
    for (const cmd of commands) {
      if (!cmd.startsWith('dub')) continue;
      // Whitelist: helpers / panic / utilities that don't map to a move.
      if (cmd === 'dubPanicReleaseAll' || cmd === 'clearHeldDubMoves') continue;
      // Reverse the moveIdToCommandName transform:
      //   dubEchoThrow → echoThrow
      //   dubStab      → dubStab (already-prefixed id)
      //   dubSiren     → dubSiren (already-prefixed id)
      const stripped = cmd.charAt(3).toLowerCase() + cmd.slice(4); // dubEcho → echo
      if (moves.has(cmd) || moves.has(stripped)) continue;
      orphans.push(cmd);
    }
    expect(orphans, `orphan keyboard commands: ${orphans.join(', ')}`).toEqual([]);
  });
});
