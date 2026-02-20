/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-20T11:35:26.981Z
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
export const BUILD_VERSION = '1.0.1015';
export const BUILD_NUMBER = '1015';
export const BUILD_HASH = '42f37e2a';
export const BUILD_DATE = '2026-02-20';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1015',
    date: '2026-02-20',
    changes: [
      {
        type: 'feature',
        "description": "Add general-purpose Randomize dialog for pattern editor"
      },
      {
        type: 'fix',
        "description": "Resolve erasableSyntaxOnly and unused import errors"
      },
      {
        type: 'feature',
        "description": "Context-aware DJ routing for knobs, pitch bend, and mod wheel"
      },
      {
        type: 'feature',
        "description": "Add per-pad DJ scratch action with editor UI"
      },
      {
        type: 'feature',
        "description": "Add scratch preset UI, fader LFO, and keyboard commands"
      },
      {
        type: 'improvement',
        "description": "Chore(keyboard-schemes): strip trailing blank lines from JSON scheme files"
      },
      {
        type: 'feature',
        "description": "Add true reverse scratch with ring-buffer AudioWorklet"
      },
      {
        type: 'fix',
        "description": "Fix instrument ID mismatch for empty module slots in DJ mode"
      },
      {
        type: 'feature',
        "description": "Add quick-nav keyboard shortcut (0-9, a-z) to file browser"
      },
      {
        type: 'feature',
        "description": "Integrate modland.com browser into main file browser"
      },
      {
        type: 'improvement',
        "description": "Extract module parser from App.tsx, improve status bar and layout"
      },
      {
        type: 'feature',
        "description": "Major DJ mode overhaul with per-deck routing, visualizers, and playlists"
      },
      {
        type: 'fix',
        "description": "Guard DB303 against redundant DSP-reinitializing param sends"
      },
      {
        type: 'feature',
        "description": "Add ToneArm vinyl simulation and instrument FX presets"
      },
      {
        type: 'feature',
        "description": "Add client-side cloud sync for presets and settings"
      },
      {
        type: 'feature',
        "description": "Add cloud sync API and modland proxy"
      },
      {
        type: 'fix',
        "description": "Use CSS zoom instead of transform:scale for WAM plugin GUIs"
      },
      {
        type: 'feature',
        "description": "Add DJ Mixer option to view switcher dropdowns"
      },
      {
        type: 'improvement',
        "description": "Chore: update plan docs and generated files"
      },
      {
        type: 'feature',
        "description": "Chore(midi): add reggae/ska/rocksteady MIDI song pack, remove old test patterns"
      },
      {
        type: 'feature',
        "description": "Per-note percussion channels + pattern length fix + cleanup consistency"
      },
      {
        type: 'feature',
        "description": "DJ mixing mode with dual-deck playback and mixer"
      },
      {
        type: 'fix',
        "description": "BitCrusher WaveShaper fallback, NeuralEffect drive improvements"
      },
      {
        type: 'feature',
        "description": "Route chip engine audio through master effects chain"
      },
      {
        type: 'feature',
        "description": "Load GM2 instruments in App.tsx MIDI handler"
      },
      {
        type: 'feature',
        "description": "Load GM2 instruments into instrument slots on MIDI file import"
      },
      {
        type: 'improvement',
        "description": "Consolidate importMIDIFile return to single statement"
      },
      {
        type: 'feature',
        "description": "Auto-create GM2 instruments from track program numbers on import"
      },
      {
        type: 'fix',
        "description": "Correct sustain scale, guitar/ethnic program mappings in GMSoundBank"
      },
      {
        type: 'feature',
        "description": "Add GM2 sound bank — 128 programs mapped to DEViLBOX synths"
      }
    ]
  },
  {
    version: '2026-02-19',
    date: '2026-02-19',
    changes: [
      {
        type: 'feature',
        "description": "Wire up MIDI file import to tracker pattern loader"
      },
      {
        type: 'feature',
        "description": "Mac shortcuts parity across all 6 keyboard schemes"
      },
      {
        type: 'fix',
        "description": "EffectVisualizer — scale canvas by devicePixelRatio"
      },
      {
        type: 'fix',
        "description": "PatternEditorCanvas — scale main canvas and glyph caches by devicePixelRatio"
      },
      {
        type: 'fix',
        "description": "Remove unused createPlaceholderCommands function"
      },
      {
        type: 'fix',
        "description": "AmigaPalModal drawWaveform — scale canvas by devicePixelRatio"
      },
      {
        type: 'feature',
        "description": "Replace placeholder commands with real implementations"
      },
      {
        type: 'feature',
        "description": "Implement all stubbed keyboard commands"
      },
      {
        type: 'feature',
        "description": "Wire App.tsx + TrackerView to UIStore dialog bridge"
      },
      {
        type: 'feature',
        "description": "Add store state for keyboard commands"
      },
      {
        type: 'fix',
        "description": "Resolve 4 TypeScript errors — ActionType union + triggerNoteAttack time arg"
      },
      {
        type: 'fix',
        "description": "ChannelLevelsCompact — scale canvas by devicePixelRatio"
      },
      {
        type: 'fix',
        "description": "StereoField — scale canvas by devicePixelRatio"
      },
      {
        type: 'fix',
        "description": "Use useLayoutEffect for editingEffectRef in InstrumentEffectsModal"
      },
      {
        type: 'fix',
        "description": "Oscilloscope — scale canvas by devicePixelRatio"
      },
      {
        type: 'fix',
        "description": "Rebuild guitarMLRegistry to match actual GuitarML model indices"
      },
      {
        type: 'fix',
        "description": "Set type='Neural' in unifiedEffects so correct node is created"
      },
      {
        type: 'fix',
        "description": "Differentiate amp models and fix stuck knobs"
      },
      {
        type: 'fix',
        "description": "Phaser — raise baseFrequency default to 1000Hz, add Q=10"
      },
      {
        type: 'fix',
        "description": "Use getRawNode() for SpaceyDelayer and RETapeEcho worklet connections"
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
