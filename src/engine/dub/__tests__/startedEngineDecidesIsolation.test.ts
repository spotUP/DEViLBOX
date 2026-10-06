/**
 * Dub toggles did nothing on Fred Editor: the isolation report asked the
 * generic resolver, which fell back to an engine left loaded by an earlier
 * song (libopenmpt, Furnace) and answered "isolates". The bus then muted the
 * whole-mix tap - Fred's only way into the bus - and got silence. The engine
 * that just started now decides.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { reportPlaybackIsolation } from '../../replayer/NativeEngineRouting';
import { asIsolationCapable } from '../../tone/ChannelRoutedEffects';

describe('dub isolation report', () => {
  it('an engine with no per-channel outputs reports "cannot isolate", whatever else is loaded', async () => {
    const seen: (boolean | null)[] = [];
    const bus = { setEngineIsolation: (v: boolean | null) => { seen.push(v); } };
    const fredLike = { output: {}, play() {}, stop() {} };
    await reportPlaybackIsolation(bus, async () => asIsolationCapable(fredLike));
    expect(seen).toEqual([false]);
  });

  it('every native engine start reports its own instance, not the generic resolver', () => {
    const src = readFileSync(join(__dirname, '../../replayer/NativeEngineRouting.ts'), 'utf8');
    expect(src).not.toMatch(/void reportPlaybackIsolation\(\);/);
    expect(src.match(/reportPlaybackIsolation\(undefined, async \(\) => asIsolationCapable\(instance\)\)/g)?.length).toBe(2);
  });
});
