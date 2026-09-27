/**
 * "for the one millionth time: you never dismiss the blocking song recovery
 * dialog" / "you need to fix the mcp so it reports the dialog and give you an
 * option to dismiss" (2026-09-27).
 *
 * Every reload during an agent session brings up the crash-recovery prompt,
 * which blocks the whole app. The agent could answer it and every response
 * reported it, but the agent had to notice a reload had happened between its
 * own calls, and it kept not noticing. The tab now answers Restore itself as
 * soon as it knows an MCP session is attached: the relay greets it on connect,
 * or any call arrives. Discard is never automatic.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { RELAY_AGENT_ATTACHED } from '../protocol';
import { RELAY_AGENT_ATTACHED as SERVER_HELLO } from '../../../server/src/mcp/protocol';
import { setRecoveryPrompt } from '@/lib/persistence/recoveryPrompt';

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

beforeAll(() => { vi.stubGlobal('WebSocket', FakeSocket); });
afterAll(() => { vi.unstubAllGlobals(); });

const prompt = () => ({ restore: vi.fn(), discard: vi.fn() });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('the recovery prompt during an agent session', { timeout: 60000 }, () => {
  it('uses the greeting the relay sends', () => {
    expect(RELAY_AGENT_ATTACHED).toBe(SERVER_HELLO);
  });

  it('is left alone while no agent is attached, and restored once one is', async () => {
    const { initMCPBridge, disposeMCPBridge } = await import('../MCPBridge');
    initMCPBridge();
    const sock = FakeSocket.made.at(-1)!;

    const p = prompt();
    setRecoveryPrompt(p);
    await flush();
    expect(p.restore).not.toHaveBeenCalled();              // a person may be choosing

    sock.onmessage!({ data: JSON.stringify({ type: RELAY_AGENT_ATTACHED }) });
    await flush();
    expect(p.restore).toHaveBeenCalledTimes(1);
    expect(p.discard).not.toHaveBeenCalled();
    setRecoveryPrompt(null);

    // A prompt that opens later, with the agent still attached (a reload's
    // prompt can mount after the bridge has connected), is answered too.
    const later = prompt();
    setRecoveryPrompt(later);
    await flush();
    expect(later.restore).toHaveBeenCalledTimes(1);
    setRecoveryPrompt(null);
    disposeMCPBridge();
  });
});
