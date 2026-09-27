/**
 * Every MCP tool the server declares must reach a handler in the browser.
 *
 * The MCP server and the bridge are two processes holding two copies of one
 * fact — which tools exist. `server.tool(name, ..., () => call(name))` only
 * forwards a string; nothing checks that a handler answers to it. A tool can be
 * declared, described, and listed in the help catalogue while calling it
 * returns "unknown method", and it looks exactly like a working tool until an
 * agent tries it mid-debug.
 *
 * Same class as the port drift in `mcpToolMetadata.test.ts` and the stale
 * transport rows: a second copy of a fact with nothing holding it to the first.
 *
 * This reads the declarations from the server source and the handler map from
 * the bridge source, so it also serves as the reachability check for any new
 * tool — including `get_playback_silence`, whose whole purpose is to be
 * callable while the room has gone quiet.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const mcpServer = readFileSync(resolve(ROOT, 'server/src/mcp/mcpServer.ts'), 'utf8');
const bridge = readFileSync(resolve(ROOT, 'src/bridge/MCPBridge.ts'), 'utf8');

/** Tool names the server forwards to the browser. */
const forwarded = new Set(
  [...mcpServer.matchAll(/(?:call|callBrowser)\(\s*'([a-z0-9_]+)'/g)].map((m) => m[1]),
);

/** Keys of the bridge's handler map, brace-matched so nothing outside leaks in. */
function registeredHandlers(): Set<string> {
  const decl = 'const handlers: Record<string, Handler> = {';
  const at = bridge.indexOf(decl);
  expect(at, 'bridge handler map not found').toBeGreaterThan(-1);
  const open = bridge.indexOf('{', at);
  let depth = 0;
  let close = -1;
  for (let i = open; i < bridge.length; i++) {
    if (bridge[i] === '{') depth++;
    else if (bridge[i] === '}' && --depth === 0) { close = i; break; }
  }
  const block = bridge.slice(open, close);
  return new Set([...block.matchAll(/^\s*([a-z0-9_]+)\s*:/gm)].map((m) => m[1]));
}

/**
 * Declared, advertised in the help catalogue, and never implemented.
 *
 * `get_arrangement_state` promises "tracks, clips, markers, selection, tool,
 * playback position" for a DAW timeline that does not exist in this codebase —
 * there is no arrangement store and no clip type. It is left declared rather
 * than deleted because that is a product call, not a test's call; this entry
 * records that it is known-dead so a SECOND one cannot slip in beside it
 * unnoticed.
 */
const KNOWN_UNIMPLEMENTED = new Set(['get_arrangement_state']);

describe('MCP tools reach their handlers', () => {
  it('finds both sides of the wiring', () => {
    // Guards against a parse that silently matched nothing and passed.
    expect(forwarded.size).toBeGreaterThan(150);
    expect(registeredHandlers().size).toBeGreaterThan(150);
  });

  it('exposes every handler the bridge has as a tool', () => {
    // The other direction. Twenty-two DJ handlers (dj_pitch, dj_toggle_play,
    // dj_crossfader...) sat in the bridge for months with no tool declaring
    // them, so an agent testing a DJ-tempo fix had to ask the user to hold a
    // preset and nudge the tempo with one mouse (2026-09-27).
    const missing = [...registeredHandlers()].filter((h) => !forwarded.has(h)).sort();
    expect(missing).toEqual([]);
  });

  it('declares no tool that would answer "unknown method"', () => {
    const handlers = registeredHandlers();
    const dead = [...forwarded]
      .filter((t) => !handlers.has(t))
      .filter((t) => !KNOWN_UNIMPLEMENTED.has(t))
      .sort();
    expect(dead).toEqual([]);
  });

  it('keeps the known-dead list honest', () => {
    // An exemption that has quietly been implemented should be removed from the
    // list, not left to excuse the next one.
    const handlers = registeredHandlers();
    for (const t of KNOWN_UNIMPLEMENTED) {
      expect(forwarded.has(t), `${t} is no longer declared — drop the exemption`).toBe(true);
      expect(handlers.has(t), `${t} now has a handler — drop the exemption`).toBe(false);
    }
  });

  it('routes the silence watchdog end to end', () => {
    // The one reachability assertion for this feature: declared, forwarded,
    // handled, and backed by the pure judge.
    expect(mcpServer).toContain("'get_playback_silence'");
    expect(forwarded.has('get_playback_silence')).toBe(true);
    expect(registeredHandlers().has('get_playback_silence')).toBe(true);
    const handlers = readFileSync(
      resolve(ROOT, 'src/bridge/handlers/readHandlers.ts'), 'utf8',
    );
    expect(handlers).toContain('export async function getPlaybackSilence()');
    expect(handlers).toContain('judgePlaybackSilence({');
  });
});
