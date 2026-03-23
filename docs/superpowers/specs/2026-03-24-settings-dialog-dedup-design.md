# Settings Dialog Deduplication — Design Spec

## Problem

`SettingsModal.tsx` (DOM, 1,099 lines) and `PixiSettingsModal.tsx` (Pixi, 1,387 lines) duplicate ~1,200 lines of identical logic: store subscriptions, local state, effects, handlers, computed options, and constants. This duplication has already caused a bug — Pixi's stereo mode handler omits `applyLibopenmptSeparation()`, so changing stereo separation mode in Pixi mode doesn't forward to libopenmpt.

This is the first dialog in a broader Phase 2 effort to deduplicate all 57 Pixi dialog files. The pattern established here will be reused for ExportDialog, HelpModal, SIDInfoModal, NewSongWizard, FileBrowser, and GrooveSettingsModal.

## Solution

Extract all shared logic into a single React hook: `useSettingsDialog()`. Both dialog files call this hook and keep only their renderer-specific JSX/Pixi markup.

### Architecture

```
useSettingsDialog() hook (~400-500 lines)
  ├── Store subscriptions (useUIStore, useThemeStore, useSettingsStore, etc.)
  ├── Local state (fullscreen, ASID devices, WebUSB)
  ├── Effects (fullscreen listener, ASID device polling)
  ├── Handlers (stereo, fullscreen, clear state)
  └── Computed values (options, constants)

SettingsModal.tsx (~600 lines)        PixiSettingsModal.tsx (~800 lines)
  const s = useSettingsDialog()         const s = useSettingsDialog()
  return <DOM rendering using s.*>      return <Pixi rendering using s.*>
```

### New File

**`src/hooks/dialogs/useSettingsDialog.ts`**

Parameters:
- `isOpen: boolean` — controls whether effects (ASID polling, fullscreen listener) are active. Effects activate only when `isOpen` is true, supporting Pixi's persistent-mount lifecycle (DOM unmounts entirely when closed).

Returns a typed `SettingsDialogState` interface with these groups:

#### Tab State
- `activeTab: SettingsTab` — current tab ID
- `setActiveTab: (tab: SettingsTab) => void`
- `TABS: Array<{ id: SettingsTab; label: string }>` — tab definitions

#### Store Bindings (~55-60 fields)
All destructured store fields passed through. Grouped by source store:

- **useUIStore**: `useHexNumbers`, `setUseHexNumbers`, `blankEmptyCells`, `setBlankEmptyCells`, `oscilloscopeVisible`, `setOscilloscopeVisible`, `tb303Collapsed`, `setTB303Collapsed`, `scratchEnabled`, `setScratchEnabled`, `scratchAcceleration`, `setScratchAcceleration`, `platterMass`, `setPlatterMass`
- **useThemeStore**: `currentThemeId`, `setTheme`, `customThemeColors`, `copyThemeToCustom`, `setCustomColor`, `resetCustomTheme`
- **useSettingsStore**: `amigaLimits`, `setAmigaLimits`, `linearInterpolation`, `setLinearInterpolation`, `useBLEP`, `setUseBLEP`, `stereoSeparation`, `stereoSeparationMode`, `modplugSeparation`, `midiPolyphonic`, `setMidiPolyphonic`, `trackerVisualBg`, `setTrackerVisualBg`, `trackerVisualMode`, `setTrackerVisualMode`, `renderMode`, `setRenderMode`, `crtEnabled`, `crtParams`, `setCrtEnabled`, `setCrtParam`, `resetCrtParams`, `lensEnabled`, `lensPreset`, `lensParams`, `setLensEnabled`, `setLensPreset`, `setLensParam`, `resetLensParams`, `sidEngine`, `setSidEngine`, `asidDeviceId`, `setAsidDeviceId`, `sidHardwareMode`, `setSidHardwareMode`, `vuMeterMode`, `setVuMeterMode`, `vuMeterStyle`, `setVuMeterStyle`, `vuMeterSwing`, `setVuMeterSwing`, `vuMeterMirror`, `setVuMeterMirror`, `customBannerImage`, `setCustomBannerImage`, `wobbleWindows`, `setWobbleWindows`, `welcomeJingleEnabled`, `setWelcomeJingleEnabled`, `asidEnabled`, `setAsidEnabled`, `asidDeviceAddress`, `setAsidDeviceAddress`, `webusbClockRate`, `setWebusbClockRate`, `webusbStereo`, `setWebusbStereo`, + remaining WebUSB fields
- **useAudioStore**: `sampleBusGain`, `setSampleBusGain`, `synthBusGain`, `setSynthBusGain`, `autoGain`, `setAutoGain`
- **useEditorStore**: `editStep`, `setEditStep`, `insertMode`, `toggleInsertMode`, `recQuantEnabled`, `setRecQuantEnabled`, `recQuantRes`, `setRecQuantRes`, `recReleaseEnabled`, `setRecReleaseEnabled`
- **useKeyboardStore**: `activeScheme`, `setActiveScheme`, `platformOverride`, `setPlatformOverride`
- **useModlandContributionModal**: `openModal` (used in About tab)

#### Local State
- `isFullscreen: boolean`
- `asidDevices: Array<{ id: string; name: string }>`
- `asidSupported: boolean`
- `webusbSupported: boolean`
- `webusbConnected: boolean`
- `webusbDeviceName: string | null`
- `webusbFirmware: string | null`
- `webusbChips: Array<{ slot: number; detected: boolean; type?: string }> | null`

#### Handlers
- `toggleFullscreen(): Promise<void>` — request/exit fullscreen with error handling
- `setStereoMode(mode: 'pt2' | 'modplug'): void` — updates store + tracker replayer + DJ engine replayers + libopenmpt forwarding (fixes Pixi bug)
- `setStereoSeparationValue(value: number): void` — PT2 separation (0-100) to store + all replayers + libopenmpt (note: libopenmpt uses 0-200 scale, so the handler applies `value * 2` before forwarding)
- `setModplugSeparationValue(value: number): void` — modplug separation to store + all replayers + libopenmpt
- `handleClearState(): void` — unregister service workers, clear caches/localStorage/indexedDB, reload

#### Computed Values (dynamic, in hook return)
- `visualModeOptions: Array<{ value: string; label: string }>`
- `asidDeviceOptions: Array<{ value: string; label: string }>`

#### Constants (exported separately, not in hook return)
- `SETTINGS_TABS` — tab definitions
- `KEYBOARD_SCHEMES` — canonical shape `{ id: string; name: string; description: string }`. DOM uses directly. Pixi maps to `{ value: id, label: name }` at render time.
- `CRT_SLIDERS` — 12 CRT parameter slider definitions (extracted from PixiSettingsModal)
- `LENS_SLIDERS` — lens parameter slider definitions
- `RENDER_MODE_OPTIONS` — DOM/Pixi/Auto select options
- `NUMBER_FORMAT_OPTIONS` — hex/decimal select options
- `EDIT_MODE_OPTIONS` — insert/overwrite select options
- `QUANT_RES_OPTIONS` — recording quantization resolution options
- `PLATFORM_OPTIONS` — keyboard platform override options
- `STEREO_MODE_OPTIONS` — pt2/modplug select options
- `VU_MODE_OPTIONS` — VU meter mode select options

### Modified Files

**`src/components/dialogs/SettingsModal.tsx`** (1,099 → ~600 lines):
- Remove: lines 43-284 (constants, imports, store hooks, local state, effects, handlers)
- Add: `import { useSettingsDialog, KEYBOARD_SCHEMES, CRT_SLIDERS } from '@/hooks/dialogs/useSettingsDialog'`
- Add: `const s = useSettingsDialog({ isOpen: true })` (DOM modal is always open when mounted)
- Replace all direct store/handler references with `s.xxx`
- Remove `showShortcuts` state stays local (DOM-only feature)

**`src/pixi/dialogs/PixiSettingsModal.tsx`** (1,387 → ~800 lines):
- Remove: lines 59-392 (constants, imports, store hooks, local state, effects, handlers)
- Add: same import + hook call with `isOpen` prop
- Replace all direct store/handler references with `s.xxx`

### Bug Fix

The hook's `setStereoMode()` includes `applyLibopenmptSeparation()` — fixing the existing Pixi bug where stereo mode changes didn't forward to libopenmpt. Both dialogs get the fix automatically.

### What Stays in Each Dialog File

- All JSX/Pixi rendering markup
- Renderer-specific layout constants (MODAL_W, MODAL_H, etc.)
- Component-specific imports (Lucide icons for DOM, PixiButton/PixiSlider for Pixi)
- **DOM-only**: `showShortcuts` local state, `normalizeToHex6()` utility (for `<input type="color">`), `CRTSlider` styled sub-component
- **Pixi-only**: `notify.success()` calls for toast feedback (hook's `handleClearState` does the clearing, dialog adds the toast)
- Mapping shared constants to renderer format (e.g., Pixi maps `KEYBOARD_SCHEMES` to `{ value, label }` for `PixiSelect`)

### Pattern for Future Dialogs

This establishes the pattern for remaining dialog pairs:
1. Create `useXxxDialog.ts` hook in `src/hooks/dialogs/`
2. Move all shared store subscriptions, state, effects, handlers into the hook
3. Export constants separately (not in the hook return)
4. Both DOM and Pixi dialogs call the hook, keep only rendering

Next candidates (in priority order):
1. ExportDialog (~2,600 combined lines)
2. HelpModal (~1,900 combined lines)
3. SIDInfoModal (~1,600 combined lines)
4. NewSongWizard (~1,150 combined lines)
5. GrooveSettingsModal (~500 combined lines)

Already following this pattern (no work needed):
- FileBrowser — uses shared `useFileNavigation` hook
- ImportModuleDialog — uses shared `useImportDialog` hook

### Out of Scope

- View deduplication (PatternEditor, PianoRoll, etc.) — separate project
- Creating new shared action files for non-dialog operations
- Refactoring the stores themselves
