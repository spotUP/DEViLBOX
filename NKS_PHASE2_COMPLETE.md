# NKS Phase 2 Complete - Integration Guide

## Overview

Phase 2 of NKS (Native Kontrol Standard) implementation is now complete. The system now includes full hardware protocol support for Native Instruments controllers.

## What's New

### Hardware Protocol Layer
- **NKSHIDProtocol.ts** (530 lines)
  - Web HID integration for NI devices (vendor ID 0x17CC)
  - Support for S-Series, A-Series, M32, and Maschine controllers
  - Display updates (LCD screens with 2-4 lines)
  - Knob value reading (8 knobs)
  - Button event handling (transport, navigation, pages, etc.)
  - Light guide control (RGB LED keyboard lighting)
  - Device capability detection

### Hardware Controller Manager
- **NKSHardwareController.ts** (280 lines)
  - Bridges NKS state with HID protocol
  - Periodic display updates (10 Hz)
  - Real-time parameter sync
  - Scale-based light guide highlighting
  - Transport control integration

### UI Components
- **NKSSettingsPanel.tsx** (220 lines)
  - Hardware connection UI
  - Device status indicator
  - Current preset display
  - Page navigation controls
  - Light guide presets (C Major, C Minor, Pentatonic)
  - Preset export functionality

- **NKSPresetBrowser.tsx** (240 lines)
  - Full-screen preset browser
  - Search with metadata filtering
  - Category browsing
  - Sort by name/author/date
  - .nksf file import
  - Grid layout with preset cards

### React Integration Hooks
- **useNKSIntegration.ts** (140 lines)
  - `useNKSInstrumentSync()` - Auto-sync instrument parameters
  - `useNKSAutoConnect()` - Auto-connect to paired devices
  - `useNKSTransportControl()` - Map transport buttons to playback
  - `formatNKSParameterValue()` - Format parameter display values

## Supported Hardware

| Controller | Display | Light Guide | Knobs | Pads | Tested |
|------------|---------|-------------|-------|------|--------|
| Komplete Kontrol S49/61/88 MK2 | 4 lines | ✓ (49/61/88 keys) | 8 | - | ⏳ |
| Komplete Kontrol S49/61/88 MK3 | 4 lines | ✓ (49/61/88 keys) | 8 | - | ⏳ |
| Komplete Kontrol A25/49/61 | 2 lines | ✓ (25/49/61 keys) | 8 | - | ⏳ |
| Komplete Kontrol M32 | 2 lines | ✓ (32 keys) | 8 | - | ⏳ |
| Maschine MK3 | 2 lines | - | 8 | 16 | ⏳ |
| Maschine+ | 2 lines | - | 8 | 16 | ⏳ |

## How to Use

### 1. Add NKS Panel to MIDI Settings

Find your MIDI settings component (likely in `src/components/midi/` or similar) and add the NKS panel:

```tsx
import { NKSSettingsPanel } from './components/midi/NKSSettingsPanel';
import { NKSPresetBrowser } from './components/midi/NKSPresetBrowser';

function MIDISettingsPage() {
  const [showPresetBrowser, setShowPresetBrowser] = useState(false);
  
  return (
    <div className="midi-settings">
      {/* Existing MIDI settings */}
      <MIDIDeviceSelector />
      <MIDICCMapping />
      
      {/* Add NKS panel */}
      <NKSSettingsPanel />
      
      {/* Optional: Add preset browser button */}
      <button onClick={() => setShowPresetBrowser(true)}>
        Browse NKS Presets
      </button>
      
      {/* Preset browser modal */}
      {showPresetBrowser && (
        <NKSPresetBrowser onClose={() => setShowPresetBrowser(false)} />
      )}
    </div>
  );
}
```

### 2. Enable Auto-Connect for Hardware

In your main App component or MIDI initialization:

```tsx
import { useNKSAutoConnect } from './hooks/useNKSIntegration';

function App() {
  // Auto-connect to previously paired NI hardware
  useNKSAutoConnect();
  
  return <YourAppContent />;
}
```

### 3. Sync Instruments with NKS

In your TB-303 or instrument editor component:

```tsx
import { useNKSInstrumentSync } from './hooks/useNKSIntegration';

function TB303Editor({ instrumentId }) {
  // Auto-sync all parameter changes bidirectionally
  useNKSInstrumentSync(instrumentId);
  
  return (
    <div>
      {/* Your existing editor UI */}
      <Knob label="Cutoff" ... />
      <Knob label="Resonance" ... />
    </div>
  );
}
```

### 4. Map Transport Controls (Optional)

If you have playback controls:

```tsx
import { useNKSTransportControl } from './hooks/useNKSIntegration';

function Sequencer() {
  const handlePlay = () => { /* start playback */ };
  const handleStop = () => { /* stop playback */ };
  const handleRecord = () => { /* start recording */ };
  
  // Map hardware transport buttons
  useNKSTransportControl(handlePlay, handleStop, handleRecord);
  
  return <div>...</div>;
}
```

## Testing the Integration

### Without Hardware (UI Testing)
1. Start dev server: `npm run dev`
2. Open browser and navigate to MIDI settings
3. Verify NKS panel appears with "Connect Hardware" button
4. Click button - should see browser permission prompt (will fail without hardware)
5. Check preset browser functionality

### With Hardware (Full Testing)
1. Connect Komplete Kontrol or Maschine via USB
2. Click "Connect Hardware" in NKS panel
3. Select your device in the browser permission prompt
4. **Verify**:
   - Device name appears in panel
   - Display on hardware shows "DEViLBOX" and "Default Preset"
   - Turn knobs on hardware → parameters update in browser
   - Change parameters in browser → display updates on hardware
   - Press PAGE LEFT/RIGHT → parameter page changes
   - Light guide shows scale when button clicked

## Browser Compatibility

| Browser | Web HID Support | Recommended |
|---------|----------------|-------------|
| Chrome 89+ | ✅ | Yes |
| Edge 89+ | ✅ | Yes |
| Opera 75+ | ✅ | Yes |
| Firefox | ❌ | No (HID not supported) |
| Safari | ❌ | No (HID not supported) |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        DEViLBOX App                         │
├─────────────────────────────────────────────────────────────┤
│  React Components                                            │
│  ├─ NKSSettingsPanel     (Connection UI)                     │
│  ├─ NKSPresetBrowser     (Preset management)                 │
│  └─ Instrument Editors   (useNKSInstrumentSync)              │
├─────────────────────────────────────────────────────────────┤
│  State Management                                            │
│  ├─ NKSManager           (Zustand store)                     │
│  └─ InstrumentsStore     (Existing store)                    │
├─────────────────────────────────────────────────────────────┤
│  Hardware Layer                                              │
│  ├─ NKSHardwareController (Business logic)                   │
│  └─ NKSHIDProtocol        (Low-level HID)                    │
├─────────────────────────────────────────────────────────────┤
│  Browser APIs                                                │
│  └─ Web HID API          (navigator.hid)                     │
└─────────────────────────────────────────────────────────────┘
                              ↕
                    ┌──────────────────┐
                    │  NI Hardware     │
                    │  (USB HID)       │
                    │  - S-Series      │
                    │  - A-Series      │
                    │  - M32           │
                    │  - Maschine      │
                    └──────────────────┘
```

## File Additions

```
src/
├── midi/nks/
│   ├── NKSHIDProtocol.ts          (NEW - 530 lines)
│   ├── NKSHardwareController.ts   (NEW - 280 lines)
│   └── index.ts                   (UPDATED - added exports)
├── components/midi/
│   ├── NKSSettingsPanel.tsx       (NEW - 220 lines)
│   └── NKSPresetBrowser.tsx       (NEW - 240 lines)
└── hooks/
    └── useNKSIntegration.ts       (NEW - 140 lines)
```

**Total**: ~1400 new lines of code

## Known Limitations

1. **Browser Support**: Only Chromium-based browsers (Chrome, Edge, Opera)
2. **Hardware Required**: Full functionality requires actual NI controller
3. **Preset Format**: Only .nksf format (not .nki/.nkm)
4. **Parameters**: Currently TB-303 only (expandable to other synths)
5. **Light Guide**: Simple scale highlighting (no advanced note coloring yet)

## Next Steps

### Immediate (Phase 4)
- [ ] Test with actual S-Series controller
- [ ] Test with actual A-Series controller
- [ ] Test with M32 or Maschine
- [ ] Verify display formatting on hardware
- [ ] Optimize HID report frequency
- [ ] Add error recovery for disconnects

### Future Enhancements
- [ ] Multi-instrument NKS support (Furnace, DubSiren, etc.)
- [ ] Advanced light guide modes (chord detection, note preview)
- [ ] Preset tagging and favorites
- [ ] Cloud preset sharing
- [ ] DAW integration (VST3/AU wrapper)
- [ ] Custom display layouts per instrument
- [ ] MIDI learn from hardware buttons

## Troubleshooting

### "Web HID Not Supported"
- Use Chrome 89+, Edge 89+, or Opera 75+
- Enable chrome://flags/#enable-experimental-web-platform-features

### "Failed to connect to device"
- Check USB connection
- Ensure device is not in use by another app (Native Access, Komplete Kontrol app)
- Try unplugging and reconnecting device

### Display not updating
- Check browser console for errors
- Verify device has a display (M32 and higher)
- Try reconnecting device

### Knobs not responding
- Verify device is connected (green indicator)
- Check that correct instrument is selected
- Ensure parameter page is correct (use PAGE LEFT/RIGHT)

## Support

For issues or questions:
1. Check browser console for error messages
2. Verify hardware is recognized: `navigator.hid.getDevices()`
3. Test with NI's official Komplete Kontrol software first
4. Report issues with device model and browser version

---

**Status**: Phase 1-3 Complete ✅ | Ready for hardware testing 🚀
