/**
 * The live song carries the parser's format, so engines gated on a format
 * list activate for chip-dump songs.
 *
 * The live song is rebuilt from the stores and read its format from the
 * first pattern's importMetadata.sourceFormat; SAP, ASAP, AY, PMD and
 * PiyoPiyo parsers never set it, so `formats: ['ASAP']` and friends never
 * matched and the TS scheduler voiced an empty grid in silence ("POKEY WASM
 * emulation known silent", four Silent verdicts; 2026-10-05 broken-formats
 * sweep). applyEditorMode now records song.format once.
 */
import { describe, it, expect } from 'vitest';
import { useFormatStore } from '@/stores/useFormatStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { liveTrackerSong } from '../liveSong';
import { playingEngineFor, playingEngineFromStores } from '@/engine/replayer/NativeEngineRouting';
import type { Pattern } from '@/types';
import { getNativeEngineMetaForExport, decodeNativeEngineFields } from '@/lib/export/exporters';

const emptyCell = () => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
const pattern = (): Pattern => ({
  id: 'p0', name: 'Pattern 1', length: 4,
  channels: [{ id: 'ch0', name: 'A', muted: false, solo: false, collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null, rows: Array.from({ length: 4 }, emptyCell) }],
});

describe('live song format', () => {
  it('an ASAP song without pattern importMetadata still activates the Asap engine', () => {
    useTrackerStore.setState({ patterns: [pattern()], patternOrder: [0] } as never);
    useFormatStore.getState().applyEditorMode({ format: 'ASAP', asapFileData: new ArrayBuffer(16) } as never);
    const live = liveTrackerSong();
    expect(live.format).toBe('ASAP');
    expect(playingEngineFor(live)).toBe('Asap');
    expect(playingEngineFromStores(useFormatStore.getState() as unknown as Record<string, unknown>, [])).toBe('Asap');
  });

  it('a PiyoPiyo song activates the PiyoPiyo engine', () => {
    useTrackerStore.setState({ patterns: [pattern()], patternOrder: [0] } as never);
    useFormatStore.getState().applyEditorMode({ format: 'PiyoPiyo', piyoPiyoFileData: new ArrayBuffer(16) } as never);
    expect(playingEngineFor(liveTrackerSong())).toBe('PiyoPiyo');
  });

  it('a TFM Music Maker song activates the TFM engine', () => {
    useTrackerStore.setState({ patterns: [pattern()], patternOrder: [0] } as never);
    useFormatStore.getState().applyEditorMode({ format: 'TFM', tfmFileData: new ArrayBuffer(16) } as never);
    expect(playingEngineFor(liveTrackerSong())).toBe('TFM');
    expect(playingEngineFromStores(useFormatStore.getState() as unknown as Record<string, unknown>, [])).toBe('TFM');
  });

  it('an Atari ST SNDH song activates the Psgplay engine on its subtune', () => {
    useTrackerStore.setState({ patterns: [pattern()], patternOrder: [0] } as never);
    useFormatStore.getState().applyEditorMode({ format: 'SNDH', sndhFileData: new ArrayBuffer(16), sndhSubtune: 3 } as never);
    const live = liveTrackerSong();
    expect(playingEngineFor(live)).toBe('Psgplay');
    expect(live.sndhSubtune).toBe(3);
    expect(playingEngineFromStores(useFormatStore.getState() as unknown as Record<string, unknown>, [])).toBe('Psgplay');
  });

  it('a StoneTracker song activates the StoneTracker engine with its sample bank', () => {
    useTrackerStore.setState({ patterns: [pattern()], patternOrder: [0] } as never);
    const bank = new ArrayBuffer(8);
    useFormatStore.getState().applyEditorMode({ format: 'StoneTracker', stoneTrackerFileData: new ArrayBuffer(16), stoneTrackerSampleData: bank } as never);
    const live = liveTrackerSong();
    expect(playingEngineFor(live)).toBe('StoneTracker');
    expect(live.stoneTrackerSampleData).toBe(bank);
    expect(playingEngineFromStores(useFormatStore.getState() as unknown as Record<string, unknown>, [])).toBe('StoneTracker');
  });

  it('a saved / crash-recovered MDX comes back on the Mdxmini engine', () => {
    useTrackerStore.setState({ patterns: [pattern()], patternOrder: [0] } as never);
    useFormatStore.getState().applyEditorMode({ format: 'MDX', mdxminiFileData: new ArrayBuffer(16) } as never);
    const meta = getNativeEngineMetaForExport();
    useFormatStore.getState().applyEditorMode({} as never);
    expect(playingEngineFor(liveTrackerSong())).toBe('tracker');
    const engine = decodeNativeEngineFields({ mdxminiFileData: btoa('x'.repeat(16)) }, meta ?? undefined, false, undefined);
    useFormatStore.getState().applyEditorMode(engine as never);
    expect(playingEngineFor(liveTrackerSong())).toBe('Mdxmini');
  });
});
