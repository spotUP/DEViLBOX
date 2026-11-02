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
import { useFormatStore, type FormatStore } from '@stores/useFormatStore';
import { emptyHippelCoSoLayout } from '@lib/import/formats/HippelCoSoParser';
import { emptyTFMXLayout } from '@lib/import/formats/TFMXParser';
import { emptyPumaTrackerLayout } from '@lib/import/formats/PumaTrackerParser';
import { emptySidMon2Layout } from '@lib/import/formats/SidMon2Parser';

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

/**
 * System presets whose song has a format of its own: the format-store state a
 * song of that format carries, which names it to the native export router (a
 * preset song without one is exported as no format at all). Each entry is the
 * route that format's importer sets: its layout, or the song format tag its
 * exporter branch tests.
 */
const PRESET_FORMAT_STATE: Readonly<Record<string, () => Partial<FormatStore>>> = {
  uade_hippelcoso: () => ({ uadeVariableLayout: emptyHippelCoSoLayout() }),
  uade_tfmx: () => ({ uadePatternLayout: emptyTFMXLayout() }),
  // TFMX 7-Voice is a TFMX song using seven of the module's eight voices: the same serializer, seven channels.
  uade_tfmx7: () => ({ uadePatternLayout: emptyTFMXLayout(7) }),
  uade_sidmon2: () => ({ uadeVariableLayout: emptySidMon2Layout() }),
  uade_pumatracker: () => ({ uadeVariableLayout: emptyPumaTrackerLayout() }),
  // The format tag the OctaMED importer sets (importMetadata.sourceFormat) and the router's MED branch tests.
  uade_octamed: () => ({ songFormat: 'MED' }),
  uade_soundmon: () => ({ songFormat: 'SMON' }),
  uade_futurecomposer: () => ({ songFormat: 'FC' }),
  uade_jamcracker: () => ({ songFormat: 'JamCracker' }),
};

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
  await useTabsStore.getState().addTab();
  const name = template.slice(template.lastIndexOf('/') + 1);
  const result = await openSong({ kind: 'bytes', name, bytes }, { origin: 'new-song' });
  if (!result.ok) throw new Error(`New-song template ${template}: ${result.error}`);
  useProjectStore.getState().setMetadata({ name: NEW_SONG_NAME });
  useUIStore.getState().setActiveSystemPreset(null);
  useUIStore.getState().setStatusMessage('New project', false, 1500);
}

async function startGenericSong(preset: { presetId: string; loadInstruments: boolean } | null): Promise<void> {
  const presetId = preset?.presetId ?? '';
  const loadInstruments = preset?.loadInstruments ?? false;
  // 1. addTab() saves the current song in its tab and opens a blank one; the
  //    preset applies only once that blank song is in place.
  await useTabsStore.getState().addTab();

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

  // 4b. Name the song's format to the export router
  const formatState = PRESET_FORMAT_STATE[presetId];
  if (formatState) useFormatStore.setState(formatState());

  // 5. Track active system for filtering
  useUIStore.getState().setActiveSystemPreset(presetId || null);

  useUIStore.getState().setStatusMessage('New project', false, 1500);
}
