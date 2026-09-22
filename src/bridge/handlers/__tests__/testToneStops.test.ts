import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A test tone must stop by itself, and must be stoppable.
 *
 * The MCP schema advertised `durationMs` and `gain`; the handler read neither,
 * and offered no `action` — so an 800 Hz probe tone rang for minutes over the
 * music, and the "stop" call started a 440 Hz one instead (2026-09-22).
 */
const handler = readFileSync(join(process.cwd(), 'src/bridge/handlers/writeHandlers.ts'), 'utf-8');
const server = readFileSync(join(process.cwd(), 'server/src/mcp/mcpServer.ts'), 'utf-8');

describe('test_tone', () => {
  it('is bounded — every start arms a stop timer from durationMs', () => {
    expect(handler).toContain('_testToneTimer = setTimeout(() => { _testToneTimer = null; stopAllTestTones(); }, durationMs);');
    expect(handler).toContain('(params.durationMs as number) ?? TEST_TONE_DEFAULT_MS');
  });

  it('clears the timer on any stop or restart, so a restart cannot be cut short by the old timer', () => {
    const stop = handler.slice(handler.indexOf('function stopAllTestTones()'), handler.indexOf('function stopAllTestTones()') + 400);
    expect(stop).toContain('if (_testToneTimer) { clearTimeout(_testToneTimer); _testToneTimer = null; }');
  });

  it('exposes action, level and mode through the MCP schema, and honours the advertised gain', () => {
    const tool = server.slice(server.indexOf("'test_tone',"), server.indexOf("'test_tone',") + 900);
    expect(tool).toContain("action: z.enum(['start', 'stop']).optional()");
    expect(tool).toContain('level: z.number().optional()');
    expect(tool).toContain("mode: z.enum(['sine', 'rich']).optional()");
    expect(handler).toContain('20 * Math.log10(gainLinear)');
  });
});
