/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-20T10:05:41.921Z
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
export const BUILD_VERSION = '1.0.999';
export const BUILD_NUMBER = '999';
export const BUILD_HASH = '3e095967';
export const BUILD_DATE = '2026-02-20';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.999',
    date: '2026-02-20',
    changes: [
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
      },
      {
        type: 'fix',
        "description": "Remaining master FX bugs — 100% wet silence, WAM params, neural defaults"
      },
      {
        type: 'fix',
        "description": "Address known beta limitations"
      },
      {
        type: 'fix',
        "description": "Center SpringReverb editor knob panels with flex layout"
      },
      {
        type: 'fix',
        "description": "Flush pendingParams on WASM ready in all 4 WASM effects"
      },
      {
        type: 'fix',
        "description": "Advance cursor after note entry when record mode is on"
      },
      {
        type: 'fix',
        "description": "VinylNoise/Tumult — audio only when playing or editor open"
      },
      {
        type: 'fix',
        "description": "Unimplemented commands no longer swallow keypresses"
      },
      {
        type: 'fix',
        "description": "Use actual current instrument when entering notes"
      },
      {
        type: 'fix',
        "description": "Gracefully handle IT format in sample extractor"
      },
      {
        type: 'fix',
        "description": "Chore: purge debug console.logs from production code"
      },
      {
        type: 'fix',
        "description": "WASM effects param queue + WAM UI + TapeSimulator"
      },
      {
        type: 'fix',
        "description": "Partial master FX fixes — MVerb pending params, better defaults"
      },
      {
        type: 'fix',
        "description": "Atomic applyInstrument + clearSelection preserves clipboard"
      },
      {
        type: 'fix',
        "description": "Resolve all npm run type-check errors (tsc -b --force)"
      },
      {
        type: 'improvement',
        "description": "Chore: regenerate changelog, gitignore WASM build artifacts"
      },
      {
        type: 'fix',
        "description": "Implement paste/edit commands + patternOrder + console cleanup"
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
