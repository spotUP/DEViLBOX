/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-26T09:36:22.042Z
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
export const BUILD_VERSION = '1.0.3666';
export const BUILD_NUMBER = '3666';
export const BUILD_HASH = '49422b21f';
export const BUILD_DATE = '2026-03-26';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.3666',
    date: '2026-03-26',
    changes: [
      {
        type: 'feature',
        "description": "Replace FontAudio icons with Lucide SVG textures"
      },
      {
        type: 'feature',
        "description": "Lucide SVG → Pixi Texture converter + icon library"
      },
      {
        type: 'fix',
        "description": "Channel headers — enable pointer events on all containers"
      },
      {
        type: 'fix',
        "description": "Channel headers — remove stencil mask, use overflow hidden"
      },
      {
        type: 'fix',
        "description": "Channel headers use layoutContainer + flexShrink: 0"
      },
      {
        type: 'fix',
        "description": "Channel header ROW column uses bgTertiary not theme.bg (red)"
      },
      {
        type: 'fix',
        "description": "Pitch slider width 52px matching DOM's DJPitchSlider"
      },
      {
        type: 'fix',
        "description": "Pitch slider — use layoutContainer for backgroundColor support"
      },
      {
        type: 'fix',
        "description": "Pitch slider — solid background + fix groove color"
      },
      {
        type: 'fix',
        "description": "VBlank speed hint for compiled 68k formats, fix dl prefix skip"
      },
      {
        type: 'fix',
        "description": "Grid base fill always opaque — no red bleed through"
      },
      {
        type: 'fix',
        "description": "Dave Lowe format uses UADE playback with title extraction"
      },
      {
        type: 'fix',
        "description": "Alternate milkdrop/projectM layers to prevent projectM crashes"
      },
      {
        type: 'fix',
        "description": "Remove DrumPadManager as standalone view, unify into DJ Pads"
      },
      {
        type: 'fix',
        "description": "Remove row number column background, extend rows full width"
      },
      {
        type: 'fix',
        "description": "Remove unused onShowDrumpads prop from DJView in App.tsx"
      },
      {
        type: 'fix',
        "description": "Row number column and mute overlay use correct colors"
      },
      {
        type: 'fix',
        "description": "Merge Drumpads + Sampler into single Pads button"
      },
      {
        type: 'fix',
        "description": "Ghost buttons truly transparent — use Graphics draw for bg"
      },
      {
        type: 'fix',
        "description": "Enable pattern overlay by default in VJ view"
      },
      {
        type: 'fix',
        "description": "Ghost button hover state clears properly"
      }
    ]
  },
  {
    version: '2026-03-25',
    date: '2026-03-25',
    changes: [
      {
        type: 'fix',
        "description": "Chore: stage pending changes (DaveLowe WASM, synth categories, CRT fixes)"
      },
      {
        type: 'fix',
        "description": "Remove border from GROOVE button — consistent borderless"
      },
      {
        type: 'fix',
        "description": "Remove all button borders — consistent borderless style"
      },
      {
        type: 'fix',
        "description": "Hardware button — no emoji, renamed, moved to playback section"
      },
      {
        type: 'fix',
        "description": "Play/Stop buttons use primary/danger variants matching DOM"
      },
      {
        type: 'fix',
        "description": "FT2 toolbar height accounts for padding + gap"
      },
      {
        type: 'fix',
        "description": "FT2 toolbar padding/gap matches DOM exactly"
      },
      {
        type: 'feature',
        "description": "WAM plugin browser (DOM+Pixi) + mobile touch fixes"
      },
      {
        type: 'fix',
        "description": "FT2 toolbar uses grid-like fixed column widths matching DOM"
      },
      {
        type: 'fix',
        "description": "Remove vertical dividers from FT2 toolbar"
      },
      {
        type: 'fix',
        "description": "Tab bar — exact DOM values for font, radius, height, + button"
      },
      {
        type: 'fix',
        "description": "Tab bar matches DOM — top-rounded tabs, proper colors/fonts"
      },
      {
        type: 'fix',
        "description": "Volume slider — add label, taller handle for visibility"
      },
      {
        type: 'fix',
        "description": "Restore nav bar and button readability"
      },
      {
        type: 'fix',
        "description": "Nav bar height, gap, bg, MIDI — match DOM exactly"
      },
      {
        type: 'fix',
        "description": "Hide WAVE mode label in visualizer, cleanup layout index"
      },
      {
        type: 'fix',
        "description": "Remove Groove button from toolbar, add colons to FT2 labels"
      },
      {
        type: 'fix',
        "description": "DOM/GL parity — mixer sends/FX/record, clip clone, hover tooltip"
      },
      {
        type: 'fix',
        "description": "Replace volume knob with horizontal slider matching DOM"
      },
      {
        type: 'fix',
        "description": "Visual parity — flatten buttons, fix labels, channel headers"
      },
      {
        type: 'feature',
        "description": "Wire all new components into views"
      },
      {
        type: 'feature',
        "description": "Pattern preview tooltip, order sidebar, step sequencer (DOM+Pixi)"
      },
      {
        type: 'fix',
        "description": "Visual parity pass — match GL chrome to DOM layout"
      },
      {
        type: 'feature',
        "description": "Pattern matrix (DOM+Pixi), pattern preview hook, mixer send/record UI"
      },
      {
        type: 'fix',
        "description": "Move useGTUltraStore hook before mobile early return"
      },
      {
        type: 'feature',
        "description": "Store actions for pattern clone, tracker jump, ruler mode, channel sync"
      },
      {
        type: 'fix',
        "description": "Match nav bar and editor controls to DOM layout"
      },
      {
        type: 'fix',
        "description": "Pattern grid background uses trackerRowEven instead of theme.bg"
      },
      {
        type: 'feature',
        "description": "CC automation lane, step sequencer, multi-channel already wired"
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
