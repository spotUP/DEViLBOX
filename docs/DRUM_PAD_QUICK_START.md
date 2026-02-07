# Drum Pad Quick Start

## Add to Your App in 3 Steps

### Step 1: Import the Component

```tsx
import { DrumPadManager } from './components/drumpad';
```

### Step 2: Add State

```tsx
const [showDrumPad, setShowDrumPad] = useState(false);
```

### Step 3: Render Button + Modal

```tsx
// Add button to your toolbar/UI
<button
  onClick={() => setShowDrumPad(true)}
  className="px-4 py-2 bg-accent-primary text-white rounded"
>
  🥁 Drum Pad
</button>

// Render modal when active
{showDrumPad && (
  <DrumPadManager onClose={() => setShowDrumPad(false)} />
)}
```

## Complete Example

Here's a complete integration example:

```tsx
import React, { useState } from 'react';
import { DrumPadManager } from './components/drumpad';

export function YourMainComponent() {
  const [showDrumPad, setShowDrumPad] = useState(false);

  return (
    <div>
      {/* Your existing UI */}
      <div className="toolbar">
        {/* Add this button */}
        <button
          onClick={() => setShowDrumPad(true)}
          className="px-4 py-2 bg-accent-primary hover:bg-accent-primary/80 text-white rounded-lg font-bold transition-colors"
          title="Open Drum Pad Manager"
        >
          🥁 Drum Pad
        </button>
      </div>

      {/* Your existing content */}
      <main>
        {/* ... */}
      </main>

      {/* Drum Pad Modal */}
      {showDrumPad && (
        <DrumPadManager onClose={() => setShowDrumPad(false)} />
      )}
    </div>
  );
}
```

## Usage

Once integrated:

1. **Click "🥁 Drum Pad"** to open
2. **Upload samples** - Click "Load Sample" or drag & drop audio files
3. **Trigger pads** - Click pads or use keyboard (Q-N keys)
4. **Edit parameters** - Shift+Click pad, then "Edit Parameters"
5. **Save programs** - Auto-saved to localStorage

## Keyboard Shortcuts

```
Q W E R  →  Pads 1-4
A S D F  →  Pads 5-8
Z X C V  →  Pads 9-12
T G B N  →  Pads 13-16

Shift+Click  →  Select pad
Escape       →  Close
```

## Factory Presets

Two programs are pre-loaded:
- **A-01**: 808 Kit (pad names configured)
- **B-01**: 909 Kit (pad names configured)
- **C-01**: Empty Kit

Upload your own samples to these pads to get started!

## Next Steps

See **DRUM_PAD_INTEGRATION.md** for:
- Connecting MIDI
- Loading sample libraries
- Audio routing
- Advanced features

---

**That's it!** The drum pad is now integrated and ready to use.
