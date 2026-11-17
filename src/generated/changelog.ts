/**
 * Auto-generated changelog from git commits
 * Generated: 2026-11-11T21:15:31.064Z
 *
 * DO NOT EDIT MANUALLY - This file is regenerated on build
 * To add changelog entries, use conventional commit messages:
 *   feat: Add new feature
 *   fix: Fix a bug
 *   perf: Improve performance
 */

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: {
    type: 'feature' | 'fix' | 'improvement';
    description: string;
  }[];
}

// Build info
export const BUILD_VERSION = '1.0.9631';
export const BUILD_NUMBER = '9631';
export const BUILD_HASH = '43c997824';
export const BUILD_DATE = '2026-11-11';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.9631',
    date: '2026-11-11',
    changes: [
      {
        type: 'improvement',
        "description": "Draw the startup jingle lips through a display-overlay store action so they raise no wrong-voice-kind warnings"
      },
      {
        type: 'improvement',
        "description": "Send cell effects and the volume column to Furnace chip instruments of tracker-made songs, on rows with and without a note; update the Neo Geo composing help"
      },
      {
        type: 'improvement',
        "description": "Make Fashion Tracker editable end to end: register its exporter, route .ex files to its real format registry entry, ratchet it byte-exact, and measure its live-edit rows"
      },
      {
        type: 'improvement',
        "description": "Refuse wrong-kind notes in swap, macro, apply-instrument, remap, channel swap, bulk, multi-pattern and channel-row edits; give remap an undo step"
      },
      {
        type: 'improvement',
        "description": "Make David Hanney editable end to end: register its exporter, give it a real format registry entry, ratchet it byte-exact, and measure its live-edit rows"
      },
      {
        type: 'improvement',
        "description": "Stop the Furnace simple editor from splitting into two CSS columns so FM operator cards use the full width"
      },
      {
        type: 'improvement',
        "description": "Tell the composing chat which effect commands reach the Neo Geo chip: one source, a help topic, a prompt pointer, a drift test"
      },
      {
        type: 'improvement',
        "description": "Restore the stored song at boot before the start dialog, and hold bridge calls until the restore is done"
      },
      {
        type: 'fix',
        "description": "Fix pattern clone and duplicate: copy the plain pattern, not the immer draft"
      },
      {
        type: 'improvement',
        "description": "Make EMS editable end to end: register its exporter, give it a real format registry entry, ratchet it byte-exact, and measure its live-edit rows"
      },
      {
        type: 'improvement',
        "description": "Pay the store import graph's cold transform once, outside the per-store budget"
      },
      {
        type: 'improvement',
        "description": "Make MCMD editable end to end: register its exporter, give it a real format registry entry, ratchet it byte-exact, and measure its live-edit rows"
      },
      {
        type: 'feature',
        "description": "Add the Riff Raff reachability test: a keystroke on a loaded .riff song reaches the module the nuade engine is handed, with one note byte changed"
      },
      {
        type: 'improvement',
        "description": "Refuse a note whose instrument voice kind does not match the chip channel it is written to, for Neo Geo, YM2608, YM2203, Y8950 and OPL4, in the pattern editor, paste, transpose and the MCP write tools"
      },
      {
        type: 'improvement',
        "description": "Update the capability parity snapshot for Organya: it is editable and natively exportable since its exporter was registered, so the frozen all-zero rows were stale"
      },
      {
        type: 'fix',
        "description": "Name Art of Noise one id across parser, encoder, registry, router and fixtures, and measure its live-edit and add-on-empty-row provenance rows"
      },
      {
        type: 'improvement',
        "description": "Let a Neo Geo instrument pick FM, SSG, ADPCM-A or ADPCM-B in the editor, give SSG audible macros, and play a loaded ADPCM sample through the chip"
      },
      {
        type: 'improvement',
        "description": "Make Art of Noise songs editable: write grid edits into the module, swap it into the engine, export it, and carry an edit to positions sharing a stored pattern"
      },
      {
        type: 'improvement',
        "description": "Let a Furnace config name its instrument type so Neo Geo SSG and ADPCM voices encode as their own kinds, and play on their own chip channels"
      },
      {
        type: 'improvement',
        "description": "Mute a Furnace chip instrument's channels when the song's channels are muted"
      },
      {
        type: 'improvement',
        "description": "Map Art of Noise file notes to the grid through the replayer period so parser and encoder agree and octaves match the song"
      },
      {
        type: 'fix',
        "description": "Refuse a liveEditHeard fixture that content detection does not confirm as the row's format, and fail loudly naming the row"
      },
      {
        type: 'improvement',
        "description": "Map PiyoPiyo channel mute and solo from chord lanes to the engine's four tracks"
      },
      {
        type: 'improvement',
        "description": "Keep the unnamed operators when a synth config update names one"
      },
      {
        type: 'improvement',
        "description": "Pick the real Organya and DigiBooster songs for the live-edit table instead of an empty song and an Ad Lib capture"
      },
      {
        type: 'feature',
        "description": "Add storage-order carrier indices and manual-order operator conversion to the FM operator model"
      },
      {
        type: 'feature',
        "description": "Let the composing chat add channels to the song"
      },
      {
        type: 'improvement',
        "description": "Make PiyoPiyo songs editable: decode chords into lane channels, write cell edits back byte-exact, and reload the edited module into the running engine"
      },
      {
        type: 'improvement',
        "description": "Write OPN-family operators to the slot Furnace commits them to"
      },
      {
        type: 'improvement',
        "description": "Refuse MCP pattern writes outside the song instead of answering ok"
      },
      {
        type: 'improvement',
        "description": "Give every Furnace chip instrument a chip patch when it is created"
      },
      {
        type: 'improvement',
        "description": "Make Organya songs editable: decode the .org events into a grid, write cell edits back byte-exact, and reload the edited module into the running engine"
      },
      {
        type: 'improvement',
        "description": "Let a chat on the visitor's own Anthropic key compose a whole song, with a model picker and a copyable log"
      },
      {
        type: 'improvement',
        "description": "Rebuild the Furnace FM instrument editor around the chip's own operator numbering"
      },
      {
        type: 'improvement',
        "description": "Test that an online Modland StoneTracker song carries its sample bank into the parse, driven through openSong with the indexer's own listing"
      },
      {
        type: 'improvement',
        "description": "Show Ron Klaren arpeggio, portamento and ADSR speed arguments in the grid effect columns with byte-exact write-back"
      }
    ]
  },
  {
    version: '2026-11-06',
    date: '2026-11-06',
    changes: [
      {
        type: 'improvement',
        "description": "Hand the stored cell bytes to layouts that encode over them in the encoder round-trip harness, as the write paths do"
      },
      {
        type: 'improvement',
        "description": "Send play to the PreTracker worklet in the playhead and meter tests since it renders only between play and stop"
      },
      {
        type: 'improvement',
        "description": "Pin the Modland index schema version the StoneTracker companion indexing bumped to 4"
      },
      {
        type: 'improvement',
        "description": "Keep the David Whittaker grid row count in the leaf dwGridTicks module so the engine registry loads no engine"
      },
      {
        type: 'improvement',
        "description": "Put the Voodoo Supreme grid on the shared step clock: 8 ticks per row, off-step onsets as row offsets or extra note columns"
      },
      {
        type: 'improvement',
        "description": "Show Voodoo Supreme bass periods above C-0 as the octave below C-0 through a shared periodToGridNote, and pin them against UADE's AUDxPER log"
      },
      {
        type: 'improvement',
        "description": "Show Sound Programming Language extra note bytes in the grid effect columns with byte-exact write-back"
      },
      {
        type: 'improvement',
        "description": "Show Voodoo Supreme grid notes as the note of the period the replayer writes to Paula, drop the per-song octave lift, and pin it against UADE's AUDxPER log on both songs"
      },
      {
        type: 'improvement',
        "description": "Decode the Voodoo Supreme voice track streams into a read-only tick grid and route .vss files through the native parser so the editor shows the real notes"
      },
      {
        type: 'improvement',
        "description": "Keep the PreTracker worklet silent after load and render audio only between play and stop"
      },
      {
        type: 'improvement',
        "description": "Place OctaMED MMD3 grid notes 24 semitones below the MMD0-2 reading (base -12), as OpenMPT's MED loader does, and pin it on the bounty hunter song"
      },
      {
        type: 'improvement',
        "description": "Stub the real Fred replayer class in the dub-bus tap test so the registry's dynamic import cannot build a live engine in CI"
      },
      {
        type: 'improvement',
        "description": "Count only note-on cells as Dave Lowe grid onsets in the step-grid reachability test, since a rest after a note is a note-off cell"
      },
      {
        type: 'improvement',
        "description": "Write Riff Raff and Howie Davies effect column edits back into the command's argument byte"
      }
    ]
  }
];

// Current display version
export const CURRENT_VERSION = FULL_VERSION;

// Get all changes from the last N entries
export function getRecentChanges(count: number = 10): ChangelogEntry[] {
  return CHANGELOG.slice(0, count);
}
