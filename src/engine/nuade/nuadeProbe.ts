/**
 * Which player recognises these bytes, asked of nuade itself (plan D7: the router decides the engine from the file).
 *
 * The import route needs the answer on the main thread, where only the settings store and the file are at hand, so
 * Nuade.wasm is loaded here once, on first use, and only when a format's choice is 'nuade' and its extension matches.
 * Tests inject the Node loader (NuadeHeadless) with `setNuadeProbe`.
 */
import { NuadeDriver } from './nuadeDriver';
import { loadNuadeModuleFromPublic, probeWith, type NuadeModule } from './nuadeModule';

/** 0 supported, 1 unsupported, 2 unsure, -1 no such player. */
export type NuadeProbe = (playerId: string, bytes: Uint8Array, fileName: string) => Promise<number>;

let module: Promise<NuadeModule> | null = null;

let probe: NuadeProbe = async (playerId, bytes, fileName) => {
  module ??= loadNuadeModuleFromPublic();
  return probeWith(await module, playerId, bytes, fileName);
};

export function nuadeProbe(): NuadeProbe { return probe; }

/** Replace the probe (tests); returns the previous one. */
export function setNuadeProbe(next: NuadeProbe): NuadeProbe {
  const previous = probe;
  probe = next;
  return previous;
}

/**
 * How many voices `playerId` gives this module (the answer the audio node is sized from) and how many subsongs it holds
 * (the answer the subsong control is shown from at import, before any engine has loaded), known only after the player
 * opens the file. Asked of the same main-thread Nuade.wasm as the probe, one song slot, closed again. null when the
 * player refuses the module.
 */
export interface NuadeSongInfo { voices: number; subsongs: number; defaultSubsong: number }
export type NuadeVoiceCounter = (bytes: Uint8Array, fileName: string, playerId: string, companions?: Map<string, ArrayBuffer>) => Promise<NuadeSongInfo | null>;

let counter: NuadeVoiceCounter = async (bytes, fileName, playerId, companions) => {
  module ??= loadNuadeModuleFromPublic();
  const nu = NuadeDriver.fromModule(await module);
  try {
    nu.clearFiles();
    for (const [name, data] of companions ?? []) nu.addFile(name, new Uint8Array(data));
    nu.open(bytes, fileName, playerId);
    const info = { voices: nu.voiceCount, subsongs: nu.subsongCount, defaultSubsong: nu.defaultSubsong };
    nu.close();
    return info;
  } catch {
    return null;
  }
};

export function nuadeVoiceCounter(): NuadeVoiceCounter { return counter; }

/** Replace the voice counter (tests); returns the previous one. */
export function setNuadeVoiceCounter(next: NuadeVoiceCounter): NuadeVoiceCounter {
  const previous = counter;
  counter = next;
  return previous;
}
