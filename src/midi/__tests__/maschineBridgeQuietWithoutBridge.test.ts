/**
 * With no Maschine bridge running, the live site logged "WebSocket connection
 * to 'ws://localhost:4005/' failed" every 2 seconds for as long as the page
 * stayed open (reported 2026-10-23). The bridge client retried forever. It now
 * tries once at start-up and again when the tab regains focus; timed retries
 * run only after a bridge that was connected drops.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../MIDIManager', () => ({ getMIDIManager: () => ({}) }));
vi.mock('../performance/screens/MK2ScreenManager', () => ({
  getMK2ScreenManager: () => ({ start: () => {}, setDeviceModel: () => {}, resetDisplayHashes: () => {}, markDirty: () => {} }),
}));
vi.mock('../../stores/useTransportStore', () => ({ useTransportStore: { getState: () => ({}) } }));

class FakeSocket extends EventTarget {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  static made: FakeSocket[] = [];
  readyState = FakeSocket.CONNECTING;
  url: string;
  constructor(url: string) { super(); this.url = url; FakeSocket.made.push(this); }
  send() {}
  close() {}
  fail() { this.readyState = FakeSocket.CLOSED; this.dispatchEvent(new Event('error')); this.dispatchEvent(new Event('close')); }
  open() { this.readyState = FakeSocket.OPEN; this.dispatchEvent(new Event('open')); }
}

async function freshBridge() {
  vi.resetModules();
  delete (window as unknown as Record<string, unknown>).__mk2Bridge;
  return import('../MaschineHIDBridge');
}

const last = () => FakeSocket.made[FakeSocket.made.length - 1];

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.made = [];
  vi.stubGlobal('WebSocket', FakeSocket);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// The focus test runs first: each fresh module adds its own window focus listener.
describe('Maschine bridge client with no bridge running', () => {
  it('connects when the tab regains focus after the bridge starts', async () => {
    const { initMaschineHIDBridge } = await freshBridge();
    initMaschineHIDBridge();
    last().fail();
    window.dispatchEvent(new Event('focus'));
    expect(FakeSocket.made).toHaveLength(2);
  });

  it('tries once and then stays quiet', async () => {
    const { initMaschineHIDBridge } = await freshBridge();
    initMaschineHIDBridge();
    expect(FakeSocket.made).toHaveLength(1);
    last().fail();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(FakeSocket.made).toHaveLength(1);
  });

  it('retries on a timer after a connected bridge drops, then stops', async () => {
    const { initMaschineHIDBridge } = await freshBridge();
    initMaschineHIDBridge();
    last().open();
    last().fail();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(FakeSocket.made).toHaveLength(2);
    for (let i = 0; i < 40; i++) {
      last().fail();
      await vi.advanceTimersByTimeAsync(2_000);
    }
    const settled = FakeSocket.made.length;
    expect(settled).toBeLessThan(20);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(FakeSocket.made).toHaveLength(settled);
  });
});
