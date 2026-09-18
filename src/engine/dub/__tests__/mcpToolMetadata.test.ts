/**
 * X8 — the MCP tools lied about themselves in two different ways.
 *
 * (a) `fire_dub_move`'s description listed 27 moveIds from the April era. The
 *     router accepts any registered id, so every missing move WORKED; an agent
 *     reading the tool description simply had no way to know it existed. The
 *     list is now pinned by `moveRegistryContract.test.ts`, which fails if a
 *     move is added to the router without being advertised.
 *
 * (b) Every modland tool returned 404. Not a stale index and not a bad query:
 *     `.env` sets PORT=3011, the Express API listens there, and the MCP server
 *     is a SEPARATE process started with `cwd: server/`, where `dotenv/config`
 *     looks for `server/.env` and finds nothing. So `API_BASE` fell back to
 *     3001 — where an unrelated service happens to be listening, which is why
 *     it answered with a valid 404 instead of a connection error. The failure
 *     read as "modland is broken" when it was "we asked the wrong door".
 *
 * Both are the same class: a second copy of a fact, drifting from the first.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config as parseEnv } from 'dotenv';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const mcpServer = readFileSync(resolve(ROOT, 'server/src/mcp/mcpServer.ts'), 'utf8');

describe('X8(b) — the MCP server and the API agree on a port', () => {
  it('loads the repo-root .env rather than whatever the cwd has', () => {
    expect(mcpServer).toContain("loadEnv({ path: resolve(__dirname, '..', '..', '..', '.env') })");
  });

  it('loads it BEFORE computing the API base, or the fallback wins anyway', () => {
    const envAt = mcpServer.indexOf('loadEnv({');
    const baseAt = mcpServer.indexOf('const API_BASE');
    expect(envAt).toBeGreaterThan(-1);
    expect(baseAt).toBeGreaterThan(envAt);
  });

  it('resolves to the real .env from the mcp directory', () => {
    const fromMcpDir = resolve(ROOT, 'server/src/mcp', '..', '..', '..', '.env');
    expect(fromMcpDir).toBe(resolve(ROOT, '.env'));
  });

  it('reads the same PORT the API server reads', () => {
    const envPath = resolve(ROOT, '.env');
    if (!existsSync(envPath)) return;            // CI without a local .env
    const parsed = parseEnv({ path: envPath, processEnv: {} }).parsed ?? {};
    const apiIndex = readFileSync(resolve(ROOT, 'server/src/index.ts'), 'utf8');
    // Both sides read process.env.PORT with the same fallback; the bug was
    // that only one of them had the env loaded.
    expect(apiIndex).toContain('process.env.PORT || 3001');
    expect(mcpServer).toContain('process.env.PORT || 3001');
    expect(parsed.PORT, 'the repo .env should pin a port for both processes').toBeTruthy();
  });

  it('uses __dirname, because this package compiles as CommonJS', () => {
    // `import.meta` fails to compile here (TS1343) — the same idiom the rest
    // of the server uses.
    const envLine = mcpServer.split('\n').find(l => l.includes('loadEnv({')) ?? '';
    expect(envLine).not.toContain('import.meta');
  });
});

describe('X8(a) — every modland tool asks the API, not a guess', () => {
  it('builds every modland URL from the one API base', () => {
    const modlandFetches = mcpServer.match(/fetch\(`\$\{[^}]+\}\/api\/modland\/[^`]*`\)/g) ?? [];
    expect(modlandFetches.length).toBeGreaterThan(0);
    for (const call of modlandFetches) expect(call).toContain('${API_BASE}');
  });

  it('has no hardcoded port anywhere in a URL', () => {
    const hardcoded = mcpServer.match(/http:\/\/localhost:\d+\/api/g) ?? [];
    expect(hardcoded).toEqual([]);
  });
});

/**
 * Every handler the bridge routes should be declared by the MCP server.
 *
 * `get_performance_journal` and `clear_performance_journal` had routes and no
 * declarations, so neither was reachable. Auditing for others turned up
 * `get_channel_roles` — the very diagnostic the dub ledger tells you to reach
 * for when the performer seems to be ignoring a channel — plus
 * `route_parameter`, `set_master_effects` and `test_tone`.
 */
describe('X8 — no handler is left unreachable', () => {
  const bridge = readFileSync(resolve(ROOT, 'src/bridge/MCPBridge.ts'), 'utf8');

  /**
   * The DJ tools are deliberately funnelled through `dj_vj_action` rather than
   * declared one by one, so they are not gaps.
   */
  const INTENTIONALLY_INDIRECT = /^dj_/;

  /**
   * Arbitrary script evaluation is a capability decision for the repo's owner,
   * not something to expose in passing. Listed here so it stays a CHOICE
   * rather than drifting back into being an oversight.
   */
  const DELIBERATELY_UNDECLARED = new Set(['evaluate_script']);

  it('declares every routed tool, or names why not', () => {
    const routed = [...bridge.matchAll(/^  ([a-z_]+): [a-zA-Z]+,$/gm)].map(m => m[1]);
    expect(routed.length).toBeGreaterThan(50);
    const missing = routed.filter(name =>
      !INTENTIONALLY_INDIRECT.test(name)
      && !DELIBERATELY_UNDECLARED.has(name)
      && !mcpServer.includes(`'${name}'`),
    );
    expect(
      missing,
      'Routed by MCPBridge but never declared by the MCP server, so unreachable '
      + 'from outside. Declare them, or add them to one of the exemptions above '
      + 'with a reason.',
    ).toEqual([]);
  });

  it('keeps the diagnostic the dub ledger points at reachable', () => {
    expect(mcpServer).toContain("'get_channel_roles'");
  });
});
