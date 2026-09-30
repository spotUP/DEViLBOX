/**
 * The MCP server's tool schemas are valid for zod 4.
 *
 * zod 4's z.record() needs a key AND a value schema. Tools registered with
 * z.record(z.unknown()) built fine but broke tools/list for the whole server
 * ("Cannot read properties of undefined (reading '_zod')"): Claude Code
 * reported "Reconnected to devilbox-tracker, but fetching tools failed" and
 * no DEViLBOX tool was available (2026-09-30).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('MCP tool schemas', () => {
  it('never call z.record with a value schema alone', () => {
    const src = readFileSync(join(process.cwd(), 'server/src/mcp/mcpServer.ts'), 'utf8');
    const bad = src.split('\n').map((l, i) => [i + 1, l] as const).filter(([, l]) => /z\.record\(z\.\w+\(\)\)/.test(l));
    expect(bad.map(([n, l]) => `${n}: ${l.trim()}`)).toEqual([]);
  });
});
