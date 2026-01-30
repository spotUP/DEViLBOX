# Instrument Components

This directory contains the complete instrument and effects system for the DEViLBOX tracker.

## Directory Structure

```
src/components/instruments/
├── EditInstrumentModal.tsx    # Main entry point for creating/editing instruments
├── InstrumentList.tsx         # Unified instrument list (default & FT2 variants)
│
├── editors/                   # Type-specific synth editors
│   ├── VisualTB303Editor.tsx  # TB-303 acid bass editor
│   ├── VisualSynthEditor.tsx  # All other synth types
│   ├── FurnaceEditor.tsx      # Chip synth (Furnace) editor
│   ├── BuzzmachineEditor.tsx  # Buzz machine editor
│   └── JeskolaEditors.tsx     # Jeskola machine editors
│
├── presets/                   # Preset management
│   ├── SavePresetDialog.tsx   # Save preset modal
│   ├── LoadPresetModal.tsx    # Load preset modal
│   ├── PresetDropdown.tsx     # Preset quick selector
│   └── PresetBrowser.tsx      # Full preset browser
│
├── shared/                    # Shared components
│   ├── TestKeyboard.tsx       # Virtual piano keyboard
│   ├── CategorizedSynthSelector.tsx  # Synth type browser
│   ├── EffectChain.tsx        # Effect chain editor
│   └── SynthEditorTabs.tsx    # Tab components for editors
│
└── (other files)              # Additional editors and utilities
    ├── ArpeggioEditor.tsx     # Arpeggio editor
    ├── FT2SampleEditor.tsx    # FT2-style sample editor
    ├── SampleEditor.tsx       # Sample editor
    ├── EffectPanel.tsx        # Effect parameter editor
    └── ...
```

## Quick Start

### Using EditInstrumentModal (Recommended)

```tsx
import { EditInstrumentModal } from '@components/instruments/EditInstrumentModal';

function App() {
  const [showModal, setShowModal] = useState(false);
  const [createMode, setCreateMode] = useState(false);

  return (
    <>
      <button onClick={() => { setCreateMode(false); setShowModal(true); }}>
        Edit Instrument
      </button>
      <button onClick={() => { setCreateMode(true); setShowModal(true); }}>
        Create Instrument
      </button>

      <EditInstrumentModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        createMode={createMode}
      />
    </>
  );
}
```

### Using InstrumentList

```tsx
import { InstrumentList } from '@components/instruments/InstrumentList';

// Default variant
<InstrumentList maxHeight="400px" showActions={true} />

// FT2 variant with full features
<InstrumentList
  variant="ft2"
  showPreviewOnClick={true}
  showPresetButton={true}
  showSamplePackButton={true}
  showEditButton={true}
  onEditInstrument={(id) => openInstrumentModal(id)}
/>
```

## Component Details

### EditInstrumentModal

The main entry point for instrument editing. Supports two modes:
- **Create mode**: Full synth browser, preview, name input
- **Edit mode**: Sound/Effects/Browse tabs, preset management

Features:
- Keyboard shortcuts (Z-M, Q-P) for playing notes
- Collapsible test keyboard
- Save/load presets
- Reset to defaults

### InstrumentList

Unified component that replaces the old InstrumentList and InstrumentListPanel.

Props:
- `variant`: 'default' | 'ft2' - Styling variant
- `compact`: boolean - Compact mode for sidebars
- `showActions`: boolean - Show clone/delete buttons
- `showPreviewOnClick`: boolean - Play note when selecting
- `showPresetButton`: boolean - Show preset button (FT2)
- `showSamplePackButton`: boolean - Show sample pack button (FT2)
- `showEditButton`: boolean - Show edit button (FT2)
- `onEditInstrument`: function - Callback when edit is clicked

### Synth Editors

All synth-specific editors are in the `editors/` folder:
- `VisualTB303Editor` - Classic 303 knob layout
- `VisualSynthEditor` - Generic synth with tabs for oscillator, filter, etc.
- `FurnaceEditor` - Chip music synths (GB, NES, OPN2, etc.)

### Preset System

Preset components in `presets/`:
- `PresetDropdown` - Quick preset selector dropdown
- `LoadPresetModal` - Full preset browser modal
- `SavePresetDialog` - Save current settings as preset

### Shared Components

Reusable components in `shared/`:
- `TestKeyboard` - Interactive piano keyboard with FT2 key mapping
- `CategorizedSynthSelector` - Searchable synth type browser
- `EffectChain` - Drag-and-drop effect ordering
- `SynthEditorTabs` - Tab components for editor layouts
