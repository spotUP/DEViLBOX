/**
 * The bridge names the engine of the song that was just loaded, not the one
 * before it.
 *
 * `load_file` read the replayer's `getSong()` to name the engine; right after
 * a load that still holds the previous song, so a UADE-played `eco.gray`
 * answered `Hippel` (the hip7 before it) and `fireworks ii.fred` answered
 * `UADEEditable` (the .gray before it) - 2026-10-04. The format store takes
 * the song's file data at apply time, so the engine is read from there.
 */
import { describe, it, expect } from 'vitest';
import { playingEngineFromStores } from '../replayer/NativeEngineRouting';

describe('playingEngineFromStores', () => {
  it('names the engine for the file data the store holds now', () => {
    expect(playingEngineFromStores({ hippelFileData: new ArrayBuffer(8), originalModuleData: { format: 'MOD' } }, [])).toBe('Hippel');
    expect(playingEngineFromStores({ uadeEditableFileData: new ArrayBuffer(8), hippelFileData: null }, [])).toBe('UADEEditable');
    expect(playingEngineFromStores({ fredReplayerFileData: new ArrayBuffer(8) }, [])).toBe('FredReplayer2');
  });

  it('ignores cleared fields and falls back to the instruments and the scheduler', () => {
    expect(playingEngineFromStores({ hippelFileData: null, uadeEditableFileData: undefined }, [{ synthType: 'UADESynth' }])).toBe('UADE classic');
    expect(playingEngineFromStores({}, [{ synthType: 'TrackerSample' }])).toBe('tracker');
  });
});
