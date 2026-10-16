/**
 * The shared controls never statically import the synth engine.
 *
 * Knob, Toggle and Switch3Way read only the theme store. They imported it
 * through the '@stores' barrel, which re-exports useAudioStore, which imports
 * InstrumentFactory and with it every synth and WASM wrapper. Any panel that
 * used a Toggle (the Jukebox, for one) dragged the whole engine graph into its
 * module load, and fileNameSearchFindsAnySong timed out at 60 s on the import
 * of JukeboxPanel alone, blocking the commit and push hooks.
 *
 * Counted from the TypeScript AST of the real sources (src/test/importGraph.ts).
 */
import { describe, it, expect } from 'vitest';
import { importChain } from '@/test/importGraph';

// Knob is not listed: its MIDI fast path imports parameterRouter, which reaches
// the engine through useInstrumentStore (Knob -> parameterRouter ->
// useInstrumentStore -> InstrumentFactory). That edge is a separate design
// question, not a barrel import.
const CONTROLS = ['Toggle', 'Switch3Way'];

describe('shared controls import graph', () => {
  it.each(CONTROLS)('%s never statically reaches InstrumentFactory', (name) => {
    expect(importChain(`src/components/controls/${name}.tsx`, 'src/engine/InstrumentFactory.ts')).toBeNull();
  }, 60000);
});
