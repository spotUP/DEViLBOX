# NKS (Native Kontrol Standard) Implementation

Complete implementation of Native Instruments' NKS specification for DEViLBOX.

## ✅ Phase 1: Core Infrastructure (COMPLETE)

### Files Created

1. **`types.ts`** - Complete NKS type definitions
   - Parameter types (Float, Int, Boolean, Selector)
   - Section categories (Synthesis, Filter, Effects, etc.)
   - Preset metadata structure
   - Hardware controller capabilities
   - Display and light guide interfaces

2. **`NKSFileFormat.ts`** - .nksf file format parser/writer
   - Binary chunk-based format (NKSF, NISI, NIKA, PLUG chunks)
   - Full read/write support for preset files
   - plugin.json generator
   - File import/export utilities

3. **`parameterMap.ts`** - Parameter organization
   - TB-303 parameter definitions (16+ params)
   - Organized into 2 pages (Main + Effects)
   - CC mapping included
   - Value formatting helpers
   - Page builder utilities

4. **`NKSManager.ts`** - Central NKS manager (Zustand store)
   - Preset management (load/save/export)
   - Parameter value tracking
   - Page navigation
   - Display updates
   - Light guide control
   - Hardware detection hooks

5. **`index.ts`** - Export barrel for clean imports

## Features Implemented

### ✅ Preset Management
- Load .nksf preset files
- Save presets with full metadata
- Export to .nksf format
- Plugin.json generation
- Preset browser foundation

### ✅ Parameter System
- 16 TB-303 parameters mapped
- Organized into logical pages
- Full value range support
- Unit formatting (Hz, dB, %)
- Changed parameter tracking
- Reset to default functionality

### ✅ Page System
- Multi-page parameter organization (8 params per page)
- Page navigation (next/prev/direct)
- Automatic page naming from sections
- Display info generation

### ✅ Display System
- Current preset name
- Parameter names and values
- Changed parameter highlighting
- Page indicator (current/total)

### ✅ Light Guide System
- Individual key lighting
- Scale highlighting
- Color support (10 colors)
- Brightness control

## 🚧 Phase 2: Hardware Protocol (TODO)

Next steps to implement:

### 1. Web HID Integration
```typescript
// Detect NI controllers via Web HID API
- Request HID access
- Filter for NI vendor ID (0x17CC)
- Identify device models
- Establish bidirectional communication
```

### 2. NI HID Protocol
```typescript
// Implement NI's proprietary HID protocol
- Display updates (LCD screen commands)
- Knob value reads
- Button state monitoring
- Light guide control
- Transport controls
```

### 3. Controller Models to Support
- **Komplete Kontrol S-Series** (S49/S61/S88 MK2/MK3)
- **Komplete Kontrol A-Series** (A25/A49/A61)
- **Komplete Kontrol M32**
- **Maschine MK3**
- **Maschine+**

### 4. Display Rendering
```typescript
// Multi-line LCD display
- 2-line displays (A-series): 2 × 72 chars
- 4-line displays (S-series): 4 × 144 chars
- Custom fonts and graphics
- Real-time parameter updates
```

### 5. Integration Points
- Hook into existing MIDIManager
- Extend useMIDIStore with NKS state
- Add NKS panel to UI
- Preset browser component
- Hardware settings panel

## Usage Example

```typescript
import { useNKSStore, loadNKSF, downloadNKSF } from '@/midi/nks';

// Initialize NKS system
const { init, loadPreset, setParameterValue } = useNKSStore();
await init();

// Load preset from file
const file = await selectFile();
await loadPresetFromFile(file);

// Change parameter
setParameterValue('tb303.cutoff', 0.75);

// Navigate pages
nextPage();

// Export preset
exportPreset();

// Light guide: highlight C major scale
setScaleHighlight(60, [0, 2, 4, 5, 7, 9, 11]); // C major
```

## File Format Details

### .nksf Structure
```
NKSF                    # Magic header (4 bytes)
  Version 1.0          # Version (4 bytes)
  
  NISI Chunk           # NI Sound Info (metadata JSON)
    - name, author, tags
    - bank chain
    - search attributes
  
  NIKA Chunk           # NI Kontrol Automation (parameter values)
    - param count
    - param ID + value pairs
  
  PLUG Chunk           # Plugin state blob (optional)
    - raw plugin data
```

### plugin.json Structure
```json
{
  "author": "DEViLBOX",
  "name": "DEViLBOX Tracker",
  "vendor": "DEViLBOX",
  "version": "1.0.0",
  "uuid": "devilbox-tracker-v1",
  "ni_hw_integration": {
    "device_type": "INST",
    "num_pages": 2
  }
}
```

## Testing Requirements

### Browser Testing
- ✅ File format read/write
- ✅ Parameter mapping
- ✅ State management

### Hardware Testing (Requires Devices)
- ⏳ Komplete Kontrol S49 MK2
- ⏳ Komplete Kontrol A49
- ⏳ Maschine MK3
- ⏳ Display rendering
- ⏳ Light guide
- ⏳ Knob control

## Browser Compatibility

- **Web HID API**: Chrome 89+, Edge 89+
- **File System Access**: Chrome 86+, Edge 86+
- **Web MIDI**: Chrome 43+, Edge 79+

## Implementation Status

### ✅ Phase 1: File Format & State Management (COMPLETE)
- NKS type definitions (`types.ts`)
- .nksf file parser/writer (`NKSFileFormat.ts`)
- TB-303 parameter mapping (`parameterMap.ts`)
- Zustand state management (`NKSManager.ts`)
- Preset import/export functionality

### ✅ Phase 2: Hardware Protocol (COMPLETE)
- Web HID integration layer (`NKSHIDProtocol.ts`)
- NI HID protocol implementation
- Display update commands
- Knob value reading
- Button event handling
- Light guide control
- Device capability detection (`NKSHardwareController.ts`)

### ✅ Phase 3: UI Components (COMPLETE)
- NKS Settings Panel (`components/midi/NKSSettingsPanel.tsx`)
- Preset Browser with search (`components/midi/NKSPresetBrowser.tsx`)
- Hardware connection UI
- Light guide controls
- React integration hooks (`hooks/useNKSIntegration.ts`)

### ⏳ Phase 4: Testing & Refinement (PENDING)
- Hardware testing with S-Series controllers
- Hardware testing with A-Series controllers
- Hardware testing with M32/Maschine
- Performance optimization
- Error handling improvements

## Architecture Benefits

1. **Modular Design**: Each component is independent and testable
2. **Type Safety**: Full TypeScript coverage
3. **State Management**: Zustand integration for reactive updates
4. **Extensible**: Easy to add more instruments (Furnace, DubSiren, etc.)
5. **Standards Compliant**: Follows NI's official NKS specification

## Usage

### Connect Hardware

```typescript
import { getNKSHardwareController } from './midi/nks';

const controller = getNKSHardwareController();

// Request user to select device
await controller.requestConnection();

// Or auto-connect to paired device
import { useNKSAutoConnect } from './hooks/useNKSIntegration';
useNKSAutoConnect();
```

### Sync with Instruments

```typescript
import { useNKSInstrumentSync } from './hooks/useNKSIntegration';

function MyInstrumentEditor({ instrumentId }) {
  // Auto-sync instrument parameters with NKS
  useNKSInstrumentSync(instrumentId);
  
  return <div>...</div>;
}
```

### Add NKS UI

```tsx
import { NKSSettingsPanel } from './components/midi/NKSSettingsPanel';
import { NKSPresetBrowser } from './components/midi/NKSPresetBrowser';

function MIDISettings() {
  const [showBrowser, setShowBrowser] = useState(false);
  
  return (
    <>
      <NKSSettingsPanel />
      {showBrowser && <NKSPresetBrowser onClose={() => setShowBrowser(false)} />}
    </>
  );
}
```

## Next Steps

1. **Integrate UI**: Add `<NKSSettingsPanel />` to MIDI settings
2. **Test Hardware**: Connect Komplete Kontrol/Maschine device
3. **Verify Display**: Check parameter names/values on screen
4. **Test Knobs**: Verify parameter control with knobs
5. **Test Light Guide**: Verify scale highlighting on keyboards
6. **Refine UX**: Adjust display layouts and button mappings

## Resources

- NI NKS Specification (requires NI Developer account)
- Web HID API: https://developer.mozilla.org/en-US/docs/Web/API/WebHID_API
- Existing DEViLBOX MIDI system: `src/midi/MIDIManager.ts`

---

**Status**: Phase 1-3 complete ✅ | Ready for hardware testing 🚀
