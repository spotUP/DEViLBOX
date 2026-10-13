/**
 * Vitest setup: nuade's own probe and voice counter, from the Node loader.
 *
 * The app asks nuade which player plays a file (nuadeProbe.ts) and how many voices it has by loading Nuade.wasm over
 * fetch on the main thread. A test that imports a song through the real route (parseModuleToSong) meets that question
 * for every format whose engine choice is nuade, and has no server to fetch from: the import then failed with
 * "unexpected fetch ... /nuade/Nuade.js" and the 17 tests of 2026-10-13 broke. This answers the same questions from the
 * same Nuade.wasm, loaded by Node, once per test file and only when a test asks.
 */
import { setNuadeProbe, setNuadeVoiceCounter } from '@/engine/nuade/nuadeProbe';

let headless: Promise<import('@/engine/nuade/nuadeHeadless').NuadeHeadless> | null = null;
const nu = (): Promise<import('@/engine/nuade/nuadeHeadless').NuadeHeadless> => {
  headless ??= import('@/engine/nuade/nuadeHeadless').then((m) => m.NuadeHeadless.create());
  return headless;
};

setNuadeProbe(async (id, bytes, name) => (await nu()).probeWith(id, bytes, name));
setNuadeVoiceCounter(async (bytes, fileName, playerId, companions) => {
  const n = await nu();
  try {
    n.clearFiles();
    for (const [name, data] of companions ?? []) n.addFile(name, new Uint8Array(data));
    n.open(bytes, fileName, playerId);
    const voices = n.voiceCount;
    n.close();
    return voices;
  } catch {
    return null;
  }
});
