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
import { useProjectStore } from '@stores/useProjectStore';
import { getEditableFormat } from '@/lib/formats/EditableFormatRegistry';
import '@lib/formats/EditableFormatRegistry.builtins';
import { openSong } from '@/lib/song/openSong';

export type NewSongMode = 'empty' | 'preset' | 'format';

/**
 * What the new song starts as: a blank generic song, a chip/system preset on a
 * generic song, or a real song in one editable format (its template file opened
 * through openSong, so it gets that format's editor, replayer and export).
 */
export type NewSongRequest =
  | { kind: 'empty' }
  | { kind: 'preset'; presetId: string; loadInstruments: boolean }
  | { kind: 'format'; formatId: string };

export const NEW_SONG_NAME = 'Untitled';

/** Resolves once the new song is in place; rejects when a format's template is missing or fails to open. */
export async function startNewSong(req: NewSongRequest): Promise<void> {
  if (req.kind === 'format') return startFormatSong(req.formatId);
  return startGenericSong(req.kind === 'preset' ? req : null);
}

async function startFormatSong(formatId: string): Promise<void> {
  const template = getEditableFormat(formatId)?.newSong?.template;
  if (!template) throw new Error(`No new-song template for format "${formatId}"`);
  // Fetch before addTab so a missing template leaves the open song untouched.
  const res = await fetch(`${import.meta.env.BASE_URL ?? '/'}${template}`);
  if (!res.ok) throw new Error(`New-song template ${template}: HTTP ${res.status}`);
  const bytes = await res.arrayBuffer();
  useTabsStore.getState().addTab();
  const name = template.slice(template.lastIndexOf('/') + 1);
  const result = await openSong({ kind: 'bytes', name, bytes }, { origin: 'new-song' });
  if (!result.ok) throw new Error(`New-song template ${template}: ${result.error}`);
  useProjectStore.getState().setMetadata({ name: NEW_SONG_NAME });
  useUIStore.getState().setActiveSystemPreset(null);
  useUIStore.getState().setStatusMessage('New project', false, 1500);
}

function startGenericSong(preset: { presetId: string; loadInstruments: boolean } | null): Promise<void> {
  const presetId = preset?.presetId ?? '';
  const loadInstruments = preset?.loadInstruments ?? false;
  // 1. addTab() saves current project state and resets stores to blank.
  //    NOTE: addTab → restoreState → loadInstruments uses queueMicrotask to
  //    defer the instrument state reset. We must defer our work too, otherwise
  //    the microtask overwrites any instruments we create synchronously here.
  useTabsStore.getState().addTab();

  return new Promise((resolve) => {
    // Defer preset application so it runs AFTER loadInstruments' microtask.
    queueMicrotask(() => {
      // 2. Apply system preset (channel names, colors, count)
      if (presetId) {
        useTrackerStore.getState().applySystemPreset(presetId);

        // 3. Apply Amiga song settings (hard-panning + BPM) if Amiga format
        if (AMIGA_UADE_PRESET_IDS.has(presetId)) {
          useTrackerStore.getState().applyAmigaSongSettings(presetId);
        }
      }

      // 4. Load starter instruments
      if (loadInstruments && presetId) {
        const presets = getInstrumentPresetsForSystem(presetId);
        presets.forEach((inst) => {
          useInstrumentStore.getState().createInstrument(inst);
        });
      }

      // 5. Track active system for filtering
      useUIStore.getState().setActiveSystemPreset(
        presetId || null
      );

      useUIStore.getState().setStatusMessage('New project', false, 1500);
      resolve();
    });
  });
}
