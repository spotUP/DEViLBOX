// OfflineAudioContext.startRendering awaits the worklet's processor-created
// acks before the native render starts. Upstream polled that with
// setTimeout(0); dubBusRig fakes setTimeout, so a pending ack made the render
// hang forever (state 'suspended', currentTime 0) and the rig papered over it
// with a real 10 ms delay. scripts/patch-node-web-audio.mjs makes the wait
// event-driven; this proves a faked setTimeout can no longer stall a render.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('OfflineAudioContext render with a faked setTimeout', () => {
  it('startRendering resolves while a processor-created ack is still pending', async () => {
    const { OfflineAudioContext, AudioWorkletNode } = await import('node-web-audio-api');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dubrig-'));
    const mod = path.join(dir, 'proc.mjs');
    fs.writeFileSync(mod, "registerProcessor('p', class extends AudioWorkletProcessor { process() { return true; } });");
    const realSetTimeout = globalThis.setTimeout;
    try {
      const ctx = new OfflineAudioContext(1, 4800, 48000);
      await ctx.audioWorklet.addModule(mod);
      const node = new AudioWorkletNode(ctx, 'p'); // ack is now pending
      node.connect(ctx.destination);
      globalThis.setTimeout = (() => 0) as unknown as typeof setTimeout; // fake timers never fire
      const outcome = await Promise.race([
        ctx.startRendering().then(() => 'rendered'),
        new Promise<string>((r) => realSetTimeout(() => r('hung'), 3000)),
      ]);
      expect(outcome).toBe('rendered');
    } finally {
      globalThis.setTimeout = realSetTimeout;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 10000);
});
