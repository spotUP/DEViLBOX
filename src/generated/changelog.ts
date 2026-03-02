/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-02T21:02:29.619Z
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
export const BUILD_VERSION = '1.0.1976';
export const BUILD_NUMBER = '1976';
export const BUILD_HASH = '31440c01';
export const BUILD_DATE = '2026-03-02';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1976',
    date: '2026-03-02',
    changes: [
      {
        type: 'fix',
        "description": "Fix Sonix SMUS playback — tempo, companion files, register 0"
      },
      {
        type: 'fix',
        "description": "Remove unused INSTRUMENTS_DIR variable in SonixMusicDriverParser test"
      },
      {
        type: 'fix',
        "description": "Resolve type errors in modern shell components"
      },
      {
        type: 'feature',
        "description": "Load Sonix companion .ss sample files into instruments"
      },
      {
        type: 'improvement',
        "description": "Merge: resolve PixiNavBar conflict in favor of modern rewrite"
      },
      {
        type: 'feature',
        "description": "Modern fixed-zone shell with Ableton-inspired design"
      },
      {
        type: 'feature',
        "description": "Multi-file/folder support for Amiga formats needing companion files"
      },
      {
        type: 'feature',
        "description": "Add Master FX GL window"
      },
      {
        type: 'improvement',
        "description": "Move frame-rate updates from React state to imperative PixiJS mutations"
      },
      {
        type: 'feature',
        "description": "Per-channel FX slots with GL dropdown selector"
      },
      {
        type: 'feature',
        "description": "Convert clip/empty-area context menus to GL dropdown"
      },
      {
        type: 'feature',
        "description": "Add octave control to FT2 toolbar transport row"
      },
      {
        type: 'fix',
        "description": "Always draw item hit rect in dropdown panel to eliminate shaky clicks"
      },
      {
        type: 'feature',
        "description": "Right-click GL context menu (quantize, transpose, delete)"
      },
      {
        type: 'fix',
        "description": "Fix dropdown item selection by replacing DOM-capture close with PixiJS backdrop"
      },
      {
        type: 'feature',
        "description": "Instrument names, VU peak hold, dB level readout in GL mixer"
      },
      {
        type: 'feature',
        "description": "Follow-playback auto-scroll + ctrl+wheel zoom"
      },
      {
        type: 'feature',
        "description": "Remove channel in GL context menu"
      },
      {
        type: 'feature',
        "description": "Multi-channel waveforms, track rename, track remove, ctrl+wheel zoom"
      },
      {
        type: 'fix',
        "description": "Remove layout+sortableChildren from worldRef to eliminate Yoga BindingError"
      },
      {
        type: 'improvement',
        "description": "Test(sonix): expand SonixMusicDriverParser tests — SNX/TINY/SMUS coverage"
      },
      {
        type: 'feature',
        "description": "Improve SonixMusicDriverParser with full smus/snx/tiny routing"
      },
      {
        type: 'fix',
        "description": "Stable wrappers for worldRef children prevent Yoga BindingError"
      },
      {
        type: 'fix',
        "description": "Correct VBlank BPM formula and amiga period-to-note octave mapping"
      },
      {
        type: 'fix',
        "description": "Separate channelMuted/channelSolo selectors to prevent infinite loop"
      },
      {
        type: 'fix',
        "description": "Eliminate double-scan and enable tick snapshots for dialog imports"
      },
      {
        type: 'feature',
        "description": "GL envelope editor + sampler waveform + dropdown overlay store"
      },
      {
        type: 'fix',
        "description": "Replace react-dom portal in PixiKnob with imperative DOM div"
      },
      {
        type: 'feature',
        "description": "Per-channel mute/solo GL buttons + FX search and replace panel"
      },
      {
        type: 'feature',
        "description": "GL save/load nav actions + clip note waveforms + double-click clip opens piano roll"
      },
      {
        type: 'feature',
        "description": "Automation pan/synth params + clip crop and loop"
      },
      {
        type: 'fix',
        "description": "Resolve 14 TypeScript errors across pixi views"
      },
      {
        type: 'feature',
        "description": "Cmd+J consolidation, MIDI recording, and chord detection in piano roll"
      },
      {
        type: 'feature',
        "description": "Implement full XM instrument/sample writing in XMExporter"
      },
      {
        type: 'fix',
        "description": "Use logarithmic toDb conversion for perceptually correct fader taper"
      },
      {
        type: 'fix',
        "description": "Correct instrument numbers and speed detection in pattern reconstructor"
      },
      {
        type: 'feature',
        "description": "Add interactive volume/pan faders to track headers"
      },
      {
        type: 'feature',
        "description": "Clip transpose and automation lane playback"
      },
      {
        type: 'feature',
        "description": "Mount MixerPanel in App + Ctrl+M shortcut"
      },
      {
        type: 'feature',
        "description": "Add DOM MixerPanel floating panel"
      },
      {
        type: 'feature',
        "description": "Implement PixiMixerView with live VU meters"
      },
      {
        type: 'fix',
        "description": "Add React import to PixiMixerChannelStrip"
      },
      {
        type: 'feature',
        "description": "Add PixiMixerChannelStrip GL component"
      },
      {
        type: 'feature',
        "description": "Register mixer window in workbench + nav"
      },
      {
        type: 'fix',
        "description": "Increase 68k stack space for complex eagleplayers"
      },
      {
        type: 'feature',
        "description": "Add setMixerChannelVolume + setMixerChannelPan to ToneEngine"
      },
      {
        type: 'feature',
        "description": "Track group folding and per-track automation lane rendering"
      },
      {
        type: 'fix',
        "description": "Call setMixerChannelVolume/Pan in store (cast any until Task 2)"
      },
      {
        type: 'feature',
        "description": "MIDI key preview on click and multi-channel note display"
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
