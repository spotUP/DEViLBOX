/**
 * "you keep forgetting dismissing the restore dialog so you never reach the
 * app" (2026-09-27).
 *
 * The MCP relay serves one browser tab and keeps the newest. A second tab
 * silently took the connection from the one the user was watching, so every
 * MCP call — including answering the restore dialog — landed in a tab
 * nobody saw. The evicted tab then reconnected on its own backoff and took
 * the connection back, so two open tabs traded it forever.
 *
 * The relay now closes the old tab with RELAY_REPLACED_CLOSE_CODE; that tab
 * stops reconnecting and says so, with a button to take control back.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { RELAY_REPLACED_CLOSE_CODE } from '../protocol';
import { RELAY_REPLACED_CLOSE_CODE as SERVER_CODE } from '../../../server/src/mcp/protocol';

class FakeSocket {
  static made: FakeSocket[] = [];
  static OPEN = 1;
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  url: string;
  constructor(url: string) { this.url = url; FakeSocket.made.push(this); }
  send(): void {}
  close(): void {}
}

beforeAll(() => {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', FakeSocket);
});
afterAll(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('a tab another tab took MCP control from', { timeout: 60000 }, () => {
  it('uses the close code the relay sends', () => {
    expect(RELAY_REPLACED_CLOSE_CODE).toBe(SERVER_CODE);
  });

  it('stays off the relay, says so, and takes control back only when asked', async () => {
    const { initMCPBridge, disposeMCPBridge } = await import('../MCPBridge');
    const { useNotificationStore } = await import('@stores/useNotificationStore');
    initMCPBridge();
    expect(FakeSocket.made).toHaveLength(1);

    FakeSocket.made[0].onclose!({ code: RELAY_REPLACED_CLOSE_CODE });
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.made, 'the evicted tab reconnected and evicted the other').toHaveLength(1);

    const notice = useNotificationStore.getState().notifications.find((n) => n.action);
    expect(notice?.message).toMatch(/Another DEViLBOX tab has taken over MCP control/);
    expect(notice?.duration).toBe(0);                    // stays until acted on

    notice!.action!.run();
    expect(FakeSocket.made).toHaveLength(2);             // reconnects: the relay hands it control

    // An ordinary drop (relay restart) still reconnects by itself.
    FakeSocket.made[1].onclose!({ code: 1006 });
    vi.advanceTimersByTime(10_000);
    expect(FakeSocket.made.length).toBeGreaterThan(2);
    disposeMCPBridge();
  });
});
