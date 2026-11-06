/**
 * MCP play with mode "pattern" answered mode "song" and played the whole song: the bridge table wrapped the handler as
 * `play: () => play()`, which dropped every parameter. The play tool's parameters must reach the play handler.
 */
import { describe, it, expect, vi } from 'vitest';
import './engineFreeMcpBridge';

const play = vi.fn(async (p: Record<string, unknown> = {}) => ({ ok: true, mode: p.mode ?? 'song' }));
// Registered after the helper's blanket no-op mock of writeHandlers, so this one wins.
vi.doMock('../handlers/writeHandlers', () => new Proxy({ play } as Record<string, unknown>, {
  has: () => true,
  get: (t, key) => (key === '__esModule' ? true : key === 'then' ? undefined : key in t ? t[key as string] : () => ({})),
}));

const { dispatchBridgeCall } = await import('../MCPBridge');

describe('MCP play forwards its mode', () => {
  it('pattern mode reaches the play handler', async () => {
    const r = await dispatchBridgeCall('play', { mode: 'pattern' });
    expect(play).toHaveBeenCalledWith({ mode: 'pattern' });
    expect(JSON.stringify(r)).toContain('"mode":"pattern"');
  });
});
