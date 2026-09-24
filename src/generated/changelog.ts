/**
 * Auto-generated changelog from git commits
 * Generated: 2026-09-23T19:40:13.216Z
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
export const BUILD_VERSION = '1.0.7354';
export const BUILD_NUMBER = '7354';
export const BUILD_HASH = '80a8c0b0b';
export const BUILD_DATE = '2026-09-23';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.7354',
    date: '2026-09-23',
    changes: [
      {
        type: 'fix',
        "description": "Four more dead classes, and the hovers that repainted their own base"
      },
      {
        type: 'fix',
        "description": "Give the long tail's dead class names a token that exists"
      },
      {
        type: 'improvement',
        "description": "Correct the mapping — a hover that repaints the base does nothing"
      },
      {
        type: 'fix',
        "description": "The effects modals and the dialogs get colours that exist"
      },
      {
        type: 'fix',
        "description": "The synth panels name colours the theme actually has"
      },
      {
        type: 'fix',
        "description": "The DJ panels' dead class names become real tokens"
      },
      {
        type: 'fix',
        "description": "The EQ tab's gain sliders are the design system's fader"
      },
      {
        type: 'fix',
        "description": "A fader occupies the channel's column, down to the mute below it"
      },
      {
        type: 'improvement',
        "description": "Test(dub): the sweep checks a released move stops driving the bus"
      },
      {
        type: 'improvement',
        "description": "The mapping for the 222 classes that render as nothing"
      },
      {
        type: 'improvement',
        "description": "Chore: drop the PixiJS notice and the last page that loaded it"
      },
      {
        type: 'feature',
        "description": "The deck drives the controller's lamps"
      },
      {
        type: 'improvement',
        "description": "The build config and the FPS probe stop naming Pixi"
      },
      {
        type: 'improvement',
        "description": "The manual stops teaching a render mode the app does not have"
      },
      {
        type: 'feature',
        "description": "The controller's buttons light up to show what is latched"
      },
      {
        type: 'improvement',
        "description": "The comments stop describing a renderer that no longer exists"
      },
      {
        type: 'improvement',
        "description": "Remove the last dead Pixi surfaces — a flag nobody sets, tint fields nobody reads"
      },
      {
        type: 'feature',
        "description": "Controls take a colour by name, not by hex"
      },
      {
        type: 'improvement',
        "description": "The CRT, lens and wobble settings go, and take their storage with them"
      },
      {
        type: 'fix',
        "description": "The settings dialog stops advertising a mode that was deleted"
      },
      {
        type: 'improvement',
        "description": "The drum pad's colour recipe becomes the design system's"
      },
      {
        type: 'feature',
        "description": "Two blocks, declared row heights, and Layer B as the channel bank"
      },
      {
        type: 'feature',
        "description": "Nine columns — a channel strip sits in its own fader column"
      },
      {
        type: 'fix',
        "description": "The controller panel uses the design system the way the editors do"
      },
      {
        type: 'feature',
        "description": "The fader touch aims the deck, and the strip fits the hardware"
      },
      {
        type: 'feature',
        "description": "The channel section is strips around one op panel"
      },
      {
        type: 'improvement',
        "description": "The send fader is the routing, so there is no channel select"
      },
      {
        type: 'improvement',
        "description": "Design the channel section as strips around one op panel"
      },
      {
        type: 'feature',
        "description": "The deck can wear the shape of the controller in front of you"
      },
      {
        type: 'fix',
        "description": "The colour moves land as gestures, and the bus says which stages are in circuit"
      },
      {
        type: 'feature',
        "description": "The X-Touch Compact drives the dub deck out of the box"
      },
      {
        type: 'fix',
        "description": "Stop the controller panel collapsing into a thumbnail"
      },
      {
        type: 'fix',
        "description": "The controller diagram fits its dialog instead of hiding behind scrollbars"
      },
      {
        type: 'fix',
        "description": "Controller diagram labels stop overlapping, and every control says its address"
      },
      {
        type: 'feature',
        "description": "The X-Touch Compact's Layer B is mappable"
      },
      {
        type: 'feature',
        "description": "Every response names the dialog that is blocking the UI"
      },
      {
        type: 'fix',
        "description": "The per-channel sends open themselves from the store, so the bus is not fed silence"
      },
      {
        type: 'fix',
        "description": "Remove the return governor — a dub return is meant to run louder than the dry"
      },
      {
        type: 'fix',
        "description": "A hold fired from MIDI, AutoDub or a lane stays lit until it releases"
      },
      {
        type: 'fix',
        "description": "Every move colour has an active state — Riddim, Float, Build, Emph, Liquid lit nothing"
      },
      {
        type: 'fix',
        "description": "The vinyl surface noise stops when the record stops"
      },
      {
        type: 'fix',
        "description": "Instrument players get their own output, so a live note survives a stop"
      },
      {
        type: 'fix',
        "description": "Loading a tune no longer destroys the instrument players"
      },
      {
        type: 'fix',
        "description": "Drop the worklet's once-a-second render heartbeat"
      },
      {
        type: 'fix',
        "description": "A hand on FX WET or FEEDBACK wins over the move driving it"
      },
      {
        type: 'fix',
        "description": "BUS tab is one row of faders in two groups"
      },
      {
        type: 'fix',
        "description": "A full send no longer squeezes the channel card"
      },
      {
        type: 'fix',
        "description": "Taller deck, full-size card buttons, master card shaped like a channel card"
      },
      {
        type: 'fix',
        "description": "Channel cards fit the deck — ops as a 3x3 grid beside the fader"
      },
      {
        type: 'fix',
        "description": "The external feedback loop closes at the echo, not after the compressor"
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
