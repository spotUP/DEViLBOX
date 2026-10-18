/**
 * startNewSong - the one way a new song begins: the New Song wizard and the
 * MCP `new_song` tool both call it.
 *
 * addTab() keeps the current song in its own tab and resets the stores to a
 * blank song, so starting a new song never overwrites the one that was open.
 */
import { useUIStore } from '@stores/useUIStore';
import { AMIGA_UADE_PRESET_IDS, getInstrumentPresetsForSystem } from '@constants/uadeInstrumentPresets';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { useTabsStore } from '@stores/useTabsStore';

export type NewSongMode = 'empty' | 'preset';

/** Resolves once the blank song (plus any preset) is in place. */
export function startNewSong(mode: NewSongMode, loadInstruments: boolean, presetId: string): Promise<void> {
  // 1. addTab() saves current project state and resets stores to blank.
  //    NOTE: addTab → restoreState → loadInstruments uses queueMicrotask to
  //    defer the instrument state reset. We must defer our work too, otherwise
  //    the microtask overwrites any instruments we create synchronously here.
  useTabsStore.getState().addTab();

  return new Promise((resolve) => {
    // Defer preset application so it runs AFTER loadInstruments' microtask.
    queueMicrotask(() => {
      // 2. Apply system preset (channel names, colors, count)
      if (mode === 'preset' && presetId) {
        useTrackerStore.getState().applySystemPreset(presetId);

        // 3. Apply Amiga song settings (hard-panning + BPM) if Amiga format
        if (AMIGA_UADE_PRESET_IDS.has(presetId)) {
          useTrackerStore.getState().applyAmigaSongSettings(presetId);
        }
      }

      // 4. Load starter instruments
      if (mode === 'preset' && loadInstruments && presetId) {
        const presets = getInstrumentPresetsForSystem(presetId);
        presets.forEach((inst) => {
          useInstrumentStore.getState().createInstrument(inst);
        });
      }

      // 5. Track active system for filtering
      useUIStore.getState().setActiveSystemPreset(
        mode === 'preset' ? presetId : null
      );

      useUIStore.getState().setStatusMessage('New project', false, 1500);
      resolve();
    });
  });
}
