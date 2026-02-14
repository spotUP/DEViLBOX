# Mobile Testing Checklist

Comprehensive testing guide for DEViLBOX mobile UX implementation.

## Test Devices

### Required Test Matrix
- [ ] iPhone 12/13/14 (Safari, Chrome)
- [ ] iPad (Safari, Chrome)
- [ ] Android phone (Chrome, Samsung Internet)
- [ ] Android tablet (Chrome)

### Browser-Specific
- [ ] iOS Safari (primary)
- [ ] iOS Chrome
- [ ] Android Chrome (primary)
- [ ] Samsung Internet

---

## Core Mobile UX Tests

### 1. Pattern Editor - Mobile Input

**Orientation Tests:**
- [ ] Portrait mode: Shows 1 channel at a time
- [ ] Landscape mode: Shows 4 channels simultaneously
- [ ] Orientation change: Smooth transition, no layout breaks
- [ ] Safe area insets: Header/footer respect notch and home indicator

**Bottom Input Panel:**
- [ ] Piano keyboard appears when cursor on note column
- [ ] Hex grid appears when cursor on instrument/volume/effect column
- [ ] Piano keys respond to touch (no delay)
- [ ] Octave up/down buttons work
- [ ] Note-off button (---) works
- [ ] Delete button clears cell
- [ ] Touch pressure sensitivity works on iOS (3D Touch/Force Touch)

**Channel Navigation (Portrait):**
- [ ] Channel selector shows current channel (CH 01, CH 02, etc.)
- [ ] Left/Right arrows change channel
- [ ] Swipe left on pattern area moves to next channel
- [ ] Swipe right on pattern area moves to previous channel
- [ ] Channel boundaries prevent overflow

**Pattern Scrolling:**
- [ ] Vertical swipe scrolls pattern rows smoothly
- [ ] Scroll doesn't trigger during horizontal swipe
- [ ] Pinch-zoom changes row height (16px - 40px) [if implemented]
- [ ] 60fps scroll performance (check with DevTools)

**Context Menus:**
- [ ] Long-press on cell shows context menu
- [ ] Context menu: Copy works
- [ ] Context menu: Cut works
- [ ] Context menu: Paste works
- [ ] Context menu: Closes on backdrop tap
- [ ] Haptic feedback on long-press (if device supports)

---

### 2. Knob Controls - No Scroll Conflict

**Touch Interaction:**
- [ ] Dragging knob vertically changes value
- [ ] Page does NOT scroll when dragging knob
- [ ] Dragging knob horizontally also changes value (bidirectional)
- [ ] Knob drag is smooth (no stuttering)
- [ ] Multiple knobs can be used sequentially without issues

**Mobile Enhancements:**
- [ ] Double-tap knob opens numeric input modal
- [ ] Numeric input accepts keyboard input
- [ ] Numeric input OK button applies value
- [ ] Numeric input Cancel button closes without change
- [ ] Long-press knob shows preset value menu (0%, 25%, 50%, 75%, 100%)
- [ ] Preset menu selection applies value
- [ ] Haptic feedback on interactions

**Editors with Knobs (Test All):**
- [ ] TB303Controls - No scroll conflict
- [ ] JC303StyledKnobPanel - No scroll conflict
- [ ] ChipSynthControls - No scroll conflict
- [ ] SAMControls - No scroll conflict
- [ ] V2SpeechControls - No scroll conflict
- [ ] DexedControls - No scroll conflict
- [ ] FurnaceEditor - No scroll conflict

---

### 3. Gestures & Haptics

**Tap Gestures:**
- [ ] Single tap: Pattern cell position changes
- [ ] Double-tap: Knob numeric input modal
- [ ] Tap response time < 100ms (feels instant)

**Swipe Gestures:**
- [ ] Swipe up: Scroll pattern up
- [ ] Swipe down: Scroll pattern down
- [ ] Swipe left: Next channel (portrait) or scroll left (landscape)
- [ ] Swipe right: Previous channel (portrait) or scroll right (landscape)
- [ ] Swipe threshold: 50px (not too sensitive)

**Long-Press:**
- [ ] Long-press delay: 500ms
- [ ] Visual feedback before trigger (if implemented)
- [ ] Haptic feedback on trigger (heavy vibration)
- [ ] Long-press on knob shows preset menu
- [ ] Long-press on cell shows context menu

**Pinch-Zoom (if implemented):**
- [ ] Two-finger pinch-out increases row height
- [ ] Two-finger pinch-in decreases row height
- [ ] Min row height: 16px
- [ ] Max row height: 40px

**Haptic Feedback:**
- [ ] Light haptic: Button presses, note input
- [ ] Medium haptic: Important actions, double-tap
- [ ] Heavy haptic: Long-press trigger, critical actions
- [ ] Success haptic: Preset applied, action confirmed
- [ ] Error haptic: Invalid input, failed action
- [ ] Haptics work on iOS (all iPhones)
- [ ] Haptics work on Android (vibration motor)

---

### 4. Responsive Layout

**Portrait Mode:**
- [ ] Header fits viewport (no overflow)
- [ ] Pattern editor visible above keyboard
- [ ] Bottom input panel height: 180px + safe-area
- [ ] Tab bar at bottom (56px + safe-area)
- [ ] No horizontal scroll on any screen
- [ ] All modals fit viewport (max-width: calc(100vw - 32px))

**Landscape Mode:**
- [ ] 4 channels visible side-by-side
- [ ] Header collapsed or compact
- [ ] Controls accessible without excessive scrolling
- [ ] Keyboard doesn't obstruct critical UI

**Safe Area Insets:**
- [ ] iPhone notch: Header safe-top applied
- [ ] iPhone home indicator: Footer safe-bottom applied
- [ ] iPad rounded corners: No content cutoff
- [ ] No content hidden behind system UI

**Viewport Meta Tags:**
- [ ] Page doesn't zoom on input focus
- [ ] Maximum scale: 1.0 enforced
- [ ] User-scalable: no enforced
- [ ] viewport-fit=cover for safe-area support

---

### 5. Mobile-Specific Components

**BottomSheet:**
- [ ] Swipe down to dismiss (if dismissible)
- [ ] Snap to defined snap points (0.5, 0.9)
- [ ] Backdrop tap closes (if dismissible)
- [ ] Drag handle visible and functional
- [ ] Smooth spring animation

**SwipeablePanel:**
- [ ] Swipe left triggers onSwipeLeft callback
- [ ] Swipe right triggers onSwipeRight callback
- [ ] Threshold: 50px (configurable)
- [ ] Resistance at edges (visual feedback)

**TouchTarget:**
- [ ] Minimum 44x44px touch area
- [ ] Visual press state (scale down)
- [ ] Haptic feedback on press
- [ ] Long-press triggers after 500ms

**VirtualKeyboard:**
- [ ] 2 octaves displayed
- [ ] White keys and black keys properly positioned
- [ ] Touch response immediate
- [ ] Velocity sensitivity on iOS (force touch)
- [ ] Octave selector changes range

**ScrollLockContainer:**
- [ ] Body scroll locked when dragging child controls
- [ ] Scroll unlocked when drag ends
- [ ] Works with knobs, sliders, XY pads

---

### 6. MIDI on Mobile

**iOS (Safari/Chrome):**
- [ ] Web MIDI API supported (iOS 12.2+)
- [ ] Bluetooth MIDI pairing instructions shown
- [ ] USB MIDI adapter supported (with Lightning/USB-C adapter)
- [ ] MIDI input detected after pairing
- [ ] MIDI notes trigger sound
- [ ] MIDI device name displayed correctly

**Android (Chrome):**
- [ ] Web MIDI API supported
- [ ] USB MIDI device auto-detected (OTG cable)
- [ ] Bluetooth MIDI supported (Android 6.0+)
- [ ] MIDI input detected automatically
- [ ] MIDI notes trigger sound
- [ ] MIDI device name displayed correctly

**Settings Modal MIDI Section:**
- [ ] Detects iOS and shows Bluetooth pairing instructions
- [ ] Shows Web MIDI support status
- [ ] Displays connected MIDI devices (if API extended)
- [ ] Polyphonic mode toggle works

---

### 7. Performance Benchmarks

**Pattern Editor:**
- [ ] 60fps scrolling (check Chrome DevTools Performance tab)
- [ ] Smooth row rendering with 16+ channels
- [ ] No jank when switching orientation
- [ ] Memory usage stable after 10 minutes (check DevTools Memory)

**Knob Performance:**
- [ ] Smooth drag at 60fps
- [ ] No lag with 20+ knobs on screen (TB303 panel)
- [ ] RequestAnimationFrame properly throttled

**Touch Response:**
- [ ] Touch latency < 100ms (feels instant)
- [ ] Multi-touch gestures (pinch, rotate) smooth
- [ ] No ghost touches or missed inputs

---

### 8. Edge Cases & Error Handling

**Low Memory:**
- [ ] App doesn't crash on iPhone SE / old Android
- [ ] Graceful degradation if canvas rendering fails
- [ ] Warning shown if device is low on memory

**Interruptions:**
- [ ] Phone call: Audio pauses, resumes after call
- [ ] Background app: Audio context suspended correctly
- [ ] Return to foreground: State preserved

**Network Loss:**
- [ ] App works offline (PWA mode)
- [ ] No error dialogs if offline

**Browser Compatibility:**
- [ ] iOS Safari: Full functionality
- [ ] iOS Chrome: Full functionality
- [ ] Android Chrome: Full functionality
- [ ] Samsung Internet: Basic functionality (test MIDI support)

---

## Bug Report Template

When filing mobile UX bugs, include:

```
**Device:** iPhone 14 Pro / Pixel 7 / etc.
**OS Version:** iOS 17.2 / Android 14
**Browser:** Safari 17.2 / Chrome 120
**Orientation:** Portrait / Landscape

**Steps to Reproduce:**
1.
2.
3.

**Expected Behavior:**


**Actual Behavior:**


**Screenshots/Video:**
[Attach if possible]

**Console Errors:**
[Check browser DevTools Console]
```

---

## Automated Test Scenarios (Optional)

If Playwright or Cypress configured for mobile:

```bash
# Run mobile-specific tests
npm run test:mobile

# Visual regression tests
npm run test:visual -- mobile-tracker-view
npm run test:visual -- mobile-knob-controls
```

---

## Sign-Off Criteria

### Minimum Viable Mobile UX
- [x] Pattern input works (piano keyboard + hex grid)
- [x] Knobs don't cause page scroll
- [x] Orientation changes handled gracefully
- [x] Safe area insets respected
- [x] Basic gestures work (tap, swipe, long-press)

### Production-Ready Mobile UX
- [ ] All checklist items above passing
- [ ] Tested on 4+ devices (iOS + Android)
- [ ] 60fps performance on pattern editor
- [ ] MIDI working on iOS and Android
- [ ] No critical bugs filed in last 2 weeks

---

**Last Updated:** 2026-02-14
