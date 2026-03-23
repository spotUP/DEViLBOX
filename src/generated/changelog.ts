/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-23T22:15:53.093Z
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
export const BUILD_VERSION = '1.0.3338';
export const BUILD_NUMBER = '3338';
export const BUILD_HASH = '87fc570fe';
export const BUILD_DATE = '2026-03-23';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.3338',
    date: '2026-03-23',
    changes: [
      {
        type: 'improvement',
        "description": "All turntable views share engine physics + DJActions"
      },
      {
        type: 'fix',
        "description": "Echo-out toggle — clicking again restores volume"
      },
      {
        type: 'fix',
        "description": "Loop distortion + auth warning on recording"
      },
      {
        type: 'improvement',
        "description": "3D views use shared DJActions + engine physics"
      },
      {
        type: 'fix',
        "description": "Move MIDI to bottom of mobile menu, add file load diagnostics"
      },
      {
        type: 'fix',
        "description": "Pixi transport gains spinDown+quantize, mixer becomes functional"
      },
      {
        type: 'improvement',
        "description": "DOM mixer + transport use shared DJActions"
      },
      {
        type: 'fix',
        "description": "Bump hamburger menu z-index to always be on top"
      },
      {
        type: 'feature',
        "description": "DeckEngine owns TurntablePhysics per deck"
      },
      {
        type: 'fix',
        "description": "Headless position polling — fixes broken 3D mode position updates"
      },
      {
        type: 'feature',
        "description": "Add shared DJActions for atomic store+engine sync"
      },
      {
        type: 'feature',
        "description": "Add DJ set browser to Pixi nav bar"
      },
      {
        type: 'feature',
        "description": "Add DJ set browser dropdown to DOM nav bar"
      },
      {
        type: 'fix',
        "description": "Diag: add file loading debug logs for iOS troubleshooting"
      },
      {
        type: 'feature',
        "description": "Upload local tracks on recording stop, disable REC during playback"
      },
      {
        type: 'feature',
        "description": "Add playSet/stopPlayback/fetchSets/deleteSet store actions"
      },
      {
        type: 'feature',
        "description": "Opus transcoding for DJ set blobs, 100MB upload limit, total count"
      },
      {
        type: 'feature',
        "description": "Retain file bytes, update format types, add total to API"
      },
      {
        type: 'improvement',
        "description": "Add DJ set playback implementation plan"
      },
      {
        type: 'improvement',
        "description": "Disconnect Tone.Meter when not playing to save idle CPU"
      },
      {
        type: 'improvement',
        "description": "Add DJ set playback design spec"
      },
      {
        type: 'improvement',
        "description": "Disable PixiJS on mobile, throttle DJ 3D polling"
      },
      {
        type: 'fix',
        "description": "Unified file loading — static first, server API supplement"
      },
      {
        type: 'fix',
        "description": "Guard readStaticFile against SPA catch-all returning HTML"
      },
      {
        type: 'fix',
        "description": "FilterRes replay bug + playCount in single-set API response"
      },
      {
        type: 'fix',
        "description": "Encode URL path segments for file loading"
      },
      {
        type: 'fix',
        "description": "Skip tests in deploy — fixtures only exist locally"
      },
      {
        type: 'fix',
        "description": "Use test:ci instead of test:all — skip tests needing local fixtures"
      },
      {
        type: 'feature',
        "description": "Diag: add iOS sample rate diagnostic logs to AudioContext and worklets"
      },
      {
        type: 'fix',
        "description": "Prevent platter scratch from stealing tonearm clicks"
      },
      {
        type: 'fix',
        "description": "ProjectM soft cut transitions, broadcast toggle, 3D render loop"
      },
      {
        type: 'fix',
        "description": "Fix 3D pitch slider — bigger hitbox, window-level drag events"
      },
      {
        type: 'fix',
        "description": "Decouple turntable physics from audio playback rate"
      },
      {
        type: 'fix',
        "description": "Restore 60fps for VU meters and 3D scene"
      },
      {
        type: 'improvement',
        "description": "Reduce CPU usage — throttle VU meters, position polling, 3D renders"
      },
      {
        type: 'feature',
        "description": "Physics-driven turntable start/stop and power on/off"
      },
      {
        type: 'fix',
        "description": "Install multer for DJ set blob uploads"
      },
      {
        type: 'feature',
        "description": "Add Twitch and custom RTMP live streaming support"
      },
      {
        type: 'feature',
        "description": "YouTube upload, live streaming, and stream control UI"
      },
      {
        type: 'feature',
        "description": "Video capture and recording for DJ sets"
      },
      {
        type: 'feature',
        "description": "Server API, mic input, and recording UI for DJ sets"
      },
      {
        type: 'feature',
        "description": "DJ mixer mic control, set recording, Hively track editor improvements"
      },
      {
        type: 'improvement',
        "description": "Chore: server database, DJ engine updates, changelog"
      },
      {
        type: 'feature',
        "description": "Per-channel VU meters via module scope RMS polling"
      },
      {
        type: 'fix',
        "description": "Eagerly init scratch buffer on play for SunVox audio"
      },
      {
        type: 'improvement',
        "description": "Chore: update format state and furnace audit tools"
      },
      {
        type: 'feature',
        "description": "Add DJ set recording and playback engine"
      },
      {
        type: 'fix',
        "description": "Suppress font cache warnings by checking Cache.has() before install"
      },
      {
        type: 'improvement',
        "description": "Only poll module scope when canvas is visible"
      },
      {
        type: 'fix',
        "description": "Tighter knob sensitivity, center detent snap, faster tonearm tracking"
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
