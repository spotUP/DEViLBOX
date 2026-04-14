/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-14T13:48:15.928Z
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
export const BUILD_VERSION = '1.0.5248';
export const BUILD_NUMBER = '5248';
export const BUILD_HASH = 'd6ba6c29b';
export const BUILD_DATE = '2026-04-14';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.5248',
    date: '2026-04-14',
    changes: [
      {
        type: 'fix',
        "description": "DJ preset loading now auto-switches to Bank A"
      },
      {
        type: 'fix',
        "description": "Improve drumpad text contrast"
      },
      {
        type: 'fix',
        "description": "SID repair filter checks path not name for .sid extension"
      },
      {
        type: 'fix',
        "description": "PadButton uniform dark bg with colored text + SID render frame count fix"
      },
      {
        type: 'feature',
        "description": "Add full one-shot preset browser to pad wizard"
      },
      {
        type: 'fix',
        "description": "One-shot pad assignment now uses actual preset configs"
      },
      {
        type: 'fix',
        "description": "DJ vocoder race conditions, error boundary recovery, drumpad keyboard dedup + voice cleanup"
      },
      {
        type: 'fix',
        "description": "WebSID init regex for nested braces in spp_backend_state_SID"
      },
      {
        type: 'fix',
        "description": "Route HVSC SIDs to WebSID pipeline, not UADE, when loading to DJ deck"
      },
      {
        type: 'fix',
        "description": "Move SID_PLAYLIST_KEYWORDS before store creation to avoid TDZ"
      },
      {
        type: 'feature',
        "description": "Auto-repair SID playlists on store load"
      },
      {
        type: 'fix',
        "description": "Close AutoDJ dialog + playlist panel when starting Auto DJ"
      },
      {
        type: 'fix',
        "description": "HVSC SIDs can now be added to DJ playlists"
      },
      {
        type: 'feature',
        "description": "Add search + category filter to DJ FX preset selector"
      },
      {
        type: 'feature',
        "description": "Add HVSC (C64 SID) support to DJ auto-download pipeline"
      },
      {
        type: 'feature',
        "description": "UADE companion support, Play from here, network abort for analyzer"
      },
      {
        type: 'improvement',
        "description": "Chore: remove MoogFilter diagnostic logging spam"
      },
      {
        type: 'fix',
        "description": "Dropdown menu matches trigger button width"
      },
      {
        type: 'fix',
        "description": "Audit all FX presets — fix 10 neural amp clipping/artefact risks"
      },
      {
        type: 'fix',
        "description": "Add 404 auto-fix to precache process"
      },
      {
        type: 'feature',
        "description": "Add WebSID C64 SID rendering to DJ view + sync AMIGA_EXTENSIONS"
      },
      {
        type: 'fix',
        "description": "BadCat Jazz squeaky glitch — reduce drive/level/wet"
      },
      {
        type: 'fix',
        "description": "High Gain Mesa beep — swap to Splawn OD, reduce drive/level"
      },
      {
        type: 'fix',
        "description": "Crunch Marshall beep — swap SM57 mic model to clean DI model"
      },
      {
        type: 'fix',
        "description": "Mark failed tracks as bad during precache, remove debug logging"
      },
      {
        type: 'fix',
        "description": "WAM prefetch uses fetch() not import(), suppress effect rebuild spam"
      },
      {
        type: 'improvement',
        "description": "Smooth FX knobs — direct engine calls + throttled store writes"
      },
      {
        type: 'fix',
        "description": "Add button render debug logging and red border"
      },
      {
        type: 'fix',
        "description": "MasterEffectConfigs not proxied in _masterFxCtx — knobs saw empty map"
      },
      {
        type: 'fix',
        "description": "Add debug logging for cache button visibility"
      },
      {
        type: 'feature',
        "description": "Add tooltips to all playlist buttons and show Re-test Bad always"
      },
      {
        type: 'fix',
        "description": "Dragonfly gain comp, eliminate double compensation, unwrap wet updates"
      },
      {
        type: 'fix',
        "description": "Remove debug logging from context menu handler"
      },
      {
        type: 'feature',
        "description": "Add data-track-index to virtual scroll wrapper div"
      },
      {
        type: 'improvement',
        "description": "Chore: dev scripts, service worker, vite config, remove tinyplayer.exe"
      },
      {
        type: 'feature',
        "description": "Drumpad context menu, DJ FX crossfade, volume normalization"
      },
      {
        type: 'fix',
        "description": "FX preset tuning, gain-comp unwrap, neural amp 2x, WAM caching, chain race fix"
      },
      {
        type: 'fix',
        "description": "Add debug logging to context menu handler"
      },
      {
        type: 'fix',
        "description": "Fix context menu using onContextMenuCapture handler"
      },
      {
        type: 'fix',
        "description": "Tame harsh FX presets + 4× neural amp downsampling"
      },
      {
        type: 'feature',
        "description": "Add onContextMenuCapture to prevent browser context menu"
      },
      {
        type: 'fix',
        "description": "Fix playlist context menu - remove duplicate handler"
      },
      {
        type: 'fix',
        "description": "Fix UADE crash during pre-rendered track loading"
      },
      {
        type: 'fix',
        "description": "Rewrite ShimmerReverb DSP — true allpass, 4-head pitch shifter, Hermite interp"
      },
      {
        type: 'fix',
        "description": "Fix Auto DJ UADE crashes with background pre-rendering"
      },
      {
        type: 'fix',
        "description": "FTM/Klystrack volume, AVP subsong selector UI"
      },
      {
        type: 'fix',
        "description": "ShimmerReverb stutter — remove ScriptProcessorNode fallback"
      },
      {
        type: 'fix',
        "description": "Rewrite Exciter as pure Web Audio — no WASM worklet"
      },
      {
        type: 'fix',
        "description": "Apply passthroughGain pattern to all 56 WASM AudioWorklet effects"
      },
      {
        type: 'fix',
        "description": "Exciter audio kill — use passthrough gain mute instead of disconnect"
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
