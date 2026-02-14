# DEViLBOX Mobile UX Guide

Comprehensive guide to mobile UX patterns, components, and best practices for DEViLBOX.

## Table of Contents
1. [Mobile Gesture Vocabulary](#mobile-gesture-vocabulary)
2. [Touch Target Guidelines](#touch-target-guidelines)
3. [Orientation Handling](#orientation-handling)
4. [Mobile Components](#mobile-components)
5. [MIDI on Mobile](#midi-on-mobile)
6. [Performance Best Practices](#performance-best-practices)

---

## Mobile Gesture Vocabulary

### Supported Gestures

| Gesture | Threshold | Use Case | Example |
|---------|-----------|----------|---------|
| **Tap** | < 200ms, < 10px movement | Select, activate | Tap pattern cell to position cursor |
| **Double-Tap** | 2 taps within 300ms | Open detailed view | Double-tap knob for numeric input |
| **Long-Press** | 500ms hold, < 10px movement | Context menu, presets | Long-press knob for preset menu |
| **Swipe** | 50px, < 500ms | Navigate, scroll | Swipe left/right to change channels |
| **Pinch-Zoom** | 2-finger, 50px threshold | Zoom in/out | Pinch pattern editor to adjust row height |
| **Drag** | Continuous touch movement | Adjust values | Drag knob vertically or horizontally |

### Gesture Hooks

```tsx
import { useGestures } from '@/hooks/useGestures';

const handlers = useGestures({
  onTap: (x, y) => console.log('Tap at', x, y),
  onDoubleTap: (x, y) => console.log('Double-tap at', x, y),
  onLongPress: (x, y) => console.log('Long-press at', x, y),
  onSwipeLeft: () => console.log('Swipe left'),
  onSwipeRight: () => console.log('Swipe right'),
  onSwipeUp: () => console.log('Swipe up'),
  onSwipeDown: () => console.log('Swipe down'),
  onPinchZoom: (scale, centerX, centerY) => console.log('Pinch', scale),
  onRotate: (angle) => console.log('Rotate', angle),
});

// Attach to element
<div {...handlers}>Content</div>
```

---

## Touch Target Guidelines

### Minimum Sizes

| Target Type | Minimum Size | Recommended |
|-------------|--------------|-------------|
| Button | 44x44px | 48x48px |
| Icon button | 44x44px | 48x48px |
| Knob | 56x56px | 72x72px |
| Piano key | 32px width | 40px width |
| List item | 44px height | 56px height |

### CSS Utilities

```css
/* Touch target utilities (in index.css) */
.touch-target { min-width: 44px; min-height: 44px; }
.touch-target-sm { min-width: 32px; min-height: 32px; }
.touch-target-lg { min-width: 48px; min-height: 48px; }

/* Touch action control */
.touch-none { touch-action: none; } /* Prevents all gestures */
.touch-pan-y { touch-action: pan-y; } /* Only vertical scroll */
.touch-pan-x { touch-action: pan-x; } /* Only horizontal scroll */
.touch-manipulation { touch-action: manipulation; } /* Disables double-tap zoom */
```

### Component Usage

```tsx
import { TouchTarget } from '@/components/ui';

<TouchTarget
  onPress={() => console.log('Pressed')}
  onLongPress={() => console.log('Long-pressed')}
  haptic="medium"
  minSize="md"
>
  <Icon />
</TouchTarget>
```

---

## Orientation Handling

### useOrientation Hook

```tsx
import { useOrientation } from '@/hooks/useOrientation';

const { orientation, isPortrait, isLandscape, angle } = useOrientation();

// Portrait: 1 channel, Landscape: 4 channels
const visibleChannels = isLandscape ? 4 : 1;
```

### Responsive Layout Patterns

```tsx
// Pattern 1: Conditional rendering
{isPortrait && <MobileControls />}
{isLandscape && <DesktopControls />}

// Pattern 2: Conditional styling
<div className={isPortrait ? 'grid-cols-1' : 'grid-cols-4'}>

// Pattern 3: Dynamic values
const knobSize = isPortrait ? 'sm' : 'md';
```

---

## Mobile Components

### 1. MobilePatternInput

Context-aware bottom input panel that switches between piano keyboard and hex grid.

```tsx
import { MobilePatternInput } from '@/components/tracker/mobile/MobilePatternInput';

<MobilePatternInput
  onNoteInput={(note: number) => {
    // XM format: 1-96 for notes, 97 for note-off
    setCell(cursor.channel, cursor.row, { note });
  }}
  onHexInput={(value: number) => {
    // 0-15 for hex values (0-F)
    setCell(cursor.channel, cursor.row, { instrument: value });
  }}
  onDelete={() => {
    setCell(cursor.channel, cursor.row, EMPTY_CELL);
  }}
  onCopy={handleCopy}
  onCut={handleCut}
  onPaste={handlePaste}
/>
```

**Features:**
- **Piano Mode**: Shows when cursor is on note column
  - 12-key piano keyboard (1 octave)
  - Octave up/down buttons
  - Note-off button (---)
  - Touch pressure sensitivity (iOS)
- **Hex Mode**: Shows when cursor is on instrument/volume/effect column
  - 4x4 hex grid (0-F)
  - Large touch targets (56x56px)
- **Context Menu**: Long-press for copy/cut/paste

---

### 2. BottomSheet

Swipeable bottom panel with snap points.

```tsx
import { BottomSheet } from '@/components/ui';

<BottomSheet
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  snapPoints={[0.25, 0.5, 0.9]} // 25%, 50%, 90% of viewport height
  defaultSnap={1} // Start at 50%
  title="Effect Settings"
  dismissible={true}
>
  <EffectControls />
</BottomSheet>
```

**Features:**
- Swipe down to dismiss
- Drag handle for resize
- Snap to predefined heights
- Backdrop tap to close
- Portal-rendered (z-index management)

---

### 3. SwipeablePanel

Horizontal swipe navigation between panels.

```tsx
import { SwipeablePanel } from '@/components/ui';

<SwipeablePanel
  onSwipeLeft={() => nextInstrument()}
  onSwipeRight={() => previousInstrument()}
  threshold={50}
>
  <InstrumentEditor />
</SwipeablePanel>
```

**Use Cases:**
- Instrument switching
- Effect navigation
- Preset browsing

---

### 4. ScrollLockContainer

Prevents page scroll when dragging controls.

```tsx
import { ScrollLockContainer } from '@/components/ui';

<ScrollLockContainer>
  <KnobPanel>
    <Knob value={cutoff} onChange={setCutoff} />
    <Knob value={resonance} onChange={setResonance} />
    {/* More knobs... */}
  </KnobPanel>
</ScrollLockContainer>
```

**How It Works:**
1. Detects touch on child controls (knobs, sliders)
2. Sets `document.body.style.overflow = 'hidden'`
3. Restores scroll when touch ends

**Required Attributes:**
- Controls should have `data-prevent-scroll` attribute, or
- Use `.knob-body`, `[role="slider"]`, `input[type="range"]` classes

---

### 5. VirtualKeyboard

On-screen piano keyboard for mobile input.

```tsx
import { VirtualKeyboard } from '@/components/ui';

<VirtualKeyboard
  octave={4}
  onNoteOn={(midiNote, velocity) => {
    // midiNote: 0-127, velocity: 0-127
    playNote(midiNote, velocity);
  }}
  onNoteOff={(midiNote) => {
    stopNote(midiNote);
  }}
  onOctaveChange={(newOctave) => setOctave(newOctave)}
/>
```

**Features:**
- 2-octave display
- White and black keys properly positioned
- Touch pressure → velocity (iOS)
- Octave selector

---

### 6. LongPressContextMenu

Portal-rendered context menu triggered by long-press.

```tsx
import { LongPressContextMenu, type ContextMenuItem } from '@/components/ui';

const items: ContextMenuItem[] = [
  { label: 'Copy', icon: <Copy />, action: handleCopy },
  { label: 'Cut', icon: <Scissors />, action: handleCut },
  { label: 'Paste', icon: <Clipboard />, action: handlePaste },
  { label: 'Delete', icon: <Trash />, action: handleDelete, destructive: true },
];

<LongPressContextMenu
  items={items}
  position={{ x: touchX, y: touchY }}
  isOpen={menuOpen}
  onClose={() => setMenuOpen(false)}
/>
```

**Features:**
- Viewport boundary detection (stays on screen)
- Backdrop tap to close
- Haptic feedback
- Destructive action styling (red)

---

## Scroll Lock Patterns

### Problem
Dragging knobs on mobile causes page scroll, making controls unusable.

### Solutions

#### 1. CSS `touch-action: none`
```tsx
<div style={{ touchAction: 'none' }}>
  <Knob />
</div>
```

#### 2. Event Handler `passive: false`
```tsx
useEffect(() => {
  const handleTouchMove = (e: TouchEvent) => {
    e.preventDefault(); // Prevents scroll
  };

  window.addEventListener('touchmove', handleTouchMove, { passive: false });
  return () => window.removeEventListener('touchmove', handleTouchMove);
}, []);
```

#### 3. ScrollLockContainer (Recommended)
```tsx
<ScrollLockContainer>
  {/* All knobs inside automatically prevent scroll when dragged */}
  <KnobPanel />
</ScrollLockContainer>
```

---

## MIDI on Mobile

### iOS (Safari/Chrome)

**Requirements:**
- iOS 12.2+ (Web MIDI API support)
- Safari or Chrome browser
- Bluetooth MIDI devices must be paired via Settings

**Bluetooth MIDI Setup:**
1. Open Settings → Bluetooth
2. Turn on MIDI device
3. Pair device with iPhone/iPad
4. Return to DEViLBOX and refresh page
5. Device appears in MIDI settings

**USB MIDI:**
- Requires Lightning to USB adapter (older iPhones)
- Requires USB-C to USB adapter (iPad Pro, iPhone 15+)
- Device auto-detected after connection

### Android (Chrome)

**Requirements:**
- Android 6.0+ (Marshmallow)
- Chrome browser
- USB OTG cable for USB MIDI
- Bluetooth 4.0+ for Bluetooth MIDI

**USB MIDI Setup:**
1. Connect MIDI device via USB OTG cable
2. Device auto-detected (no pairing needed)

**Bluetooth MIDI Setup:**
1. Open Settings → Bluetooth
2. Pair MIDI device
3. Return to DEViLBOX and refresh
4. Device auto-detected

### Detection Utilities

```tsx
import {
  isIOSDevice,
  isWebMIDISupported,
  getBluetoothMIDIInfo,
  requestMIDIAccessMobile,
} from '@/midi/BluetoothMIDIManager';

// Check device
if (isIOSDevice()) {
  console.log('iOS device detected');
}

// Check Web MIDI support
if (isWebMIDISupported()) {
  // Request MIDI access
  try {
    const access = await requestMIDIAccessMobile();
    console.log('MIDI access granted', access);
  } catch (error) {
    console.error('MIDI access denied', error);
  }
}

// Get platform-specific instructions
const info = getBluetoothMIDIInfo();
if (info.requiresPairing) {
  console.log(info.instructions); // iOS pairing steps
}
```

---

## Performance Best Practices

### 1. Canvas Rendering
- Use `requestAnimationFrame` for smooth updates
- Cache rendered elements (Bassoon Tracker pattern)
- Limit visible rows to viewport + buffer

```tsx
const rafRef = useRef<number | null>(null);

const render = () => {
  if (!rafRef.current) {
    rafRef.current = requestAnimationFrame(() => {
      // Render logic
      rafRef.current = null;
    });
  }
};
```

### 2. Touch Event Optimization
- Use `passive: false` only when necessary
- Debounce/throttle touch move handlers
- Cancel RAF on unmount

```tsx
useEffect(() => {
  const handleMove = throttle((e: TouchEvent) => {
    // Handle move
  }, 16); // 60fps

  window.addEventListener('touchmove', handleMove, { passive: false });
  return () => {
    window.removeEventListener('touchmove', handleMove);
    handleMove.cancel(); // Lodash throttle
  };
}, []);
```

### 3. Haptic Feedback
- Use sparingly (not on every touch move)
- Prefer light haptics for frequent actions
- Reserve heavy haptics for important moments

```tsx
import { haptics } from '@/utils/haptics';

// Good
onButtonPress: () => haptics.light()

// Bad (too frequent)
onTouchMove: () => haptics.medium() // NO!
```

### 4. Memory Management
- Clear timers on unmount
- Cancel RAF on unmount
- Remove event listeners

```tsx
useEffect(() => {
  const timer = setTimeout(() => {}, 500);
  const raf = requestAnimationFrame(() => {});

  return () => {
    clearTimeout(timer);
    cancelAnimationFrame(raf);
  };
}, []);
```

---

## Safe Area Insets

### CSS Variables

```css
/* Safe area utilities (in index.css) */
.safe-top { padding-top: env(safe-area-inset-top, 0); }
.safe-bottom { padding-bottom: env(safe-area-inset-bottom, 0); }
.safe-left { padding-left: env(safe-area-inset-left, 0); }
.safe-right { padding-right: env(safe-area-inset-right, 0); }
```

### Fixed Height + Safe Area

```css
/* Mobile header with safe area */
.mobile-header {
  height: calc(60px + env(safe-area-inset-top, 0));
  padding-top: env(safe-area-inset-top, 0);
}

/* Mobile bottom input with safe area */
.mobile-bottom-input {
  height: calc(180px + env(safe-area-inset-bottom, 0));
  padding-bottom: env(safe-area-inset-bottom, 0);
}
```

### Viewport Meta Tag

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
```

**Key attributes:**
- `viewport-fit=cover` - Enables safe-area-inset
- `maximum-scale=1.0` - Prevents zoom on input focus
- `user-scalable=no` - Disables pinch-zoom (use with caution)

---

## Component Checklist

When creating new mobile components:

- [ ] Minimum 44x44px touch targets
- [ ] `touch-action` CSS properly set
- [ ] Haptic feedback on interactions
- [ ] Safe area insets respected
- [ ] Works in portrait AND landscape
- [ ] 60fps performance
- [ ] Accessible (ARIA labels, keyboard support)
- [ ] Theme-aware (light/dark, cyan-lineart)
- [ ] Error states handled gracefully
- [ ] Loading states shown

---

**Last Updated:** 2026-02-14
