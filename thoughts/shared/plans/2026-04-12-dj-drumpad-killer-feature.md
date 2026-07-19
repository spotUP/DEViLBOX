---
date: 2026-04-12
topic: dj-drumpad-killer-feature
tags: [dj, drumpad, performance, fx, one-shot, ux]
status: draft
---

# DJ Drum Pad — Killer Feature Plan

## Problem Statement

The drum pad engine is powerful (31 momentary DJ FX, 25 scratch actions, 33 one-shot synth presets, full synth/sample/effect assignment). But the UI is MPC-producer focused — assigning anything requires opening a modal editor, scrolling through dropdowns, and closing. There's no DJ workflow. A DJ on stage needs: tap a pad category, tap a pad to assign, hit it live. Zero modals, zero scrolling.

## Vision

The drum pad view becomes a **DJ performance instrument** — like CDJ performance pads meets Ableton Push. Four pad modes selectable with one tap. Every pad shows what it does at a glance. Quick-assign from curated categories without leaving the pad view. Hold-to-engage momentary effects with visual feedback. Pre-built DJ programs load with one tap.

---

## Phase 1: Pad Mode System (the backbone)

**Goal:** Add a mode selector strip to the pad view that switches what the 16 pads DO.

### Pad Modes (4 modes, switchable via tabs above the grid)

| Mode | What Pads Do | Visual |
|------|-------------|--------|
| **SAMPLES** | Trigger loaded samples/synths (current behavior) | Pad color = sample color, name shown |
| **DJ FX** | Hold = engage momentary effect, release = disengage | Pad color = FX category color, pulsing when active |
| **ONE SHOTS** | Tap = fire-and-forget synth sound (air horn, siren, etc.) | Pad color = preset category color |
| **SCRATCH** | Tap = execute DJ scratch pattern on active deck | Pad color = scratch type color |

### Implementation

**Files to modify:**
- `src/components/drumpad/DrumPadManager.tsx` — add mode selector strip
- `src/components/drumpad/PadGrid.tsx` — mode-aware pad rendering + trigger behavior
- `src/components/drumpad/PadButton.tsx` — mode-aware visuals (color, label, active state)
- `src/stores/useDrumPadStore.ts` — add `padMode` state
- `src/types/drumpad.ts` — add `PadMode` type

**New type:**
```typescript
export type PadMode = 'samples' | 'djfx' | 'oneshots' | 'scratch';
```

**Mode selector UI** — horizontal strip between header and pad grid:
```
[ SAMPLES ] [ DJ FX ] [ ONE SHOTS ] [ SCRATCH ]
```
- Active mode highlighted with accent color
- Keyboard shortcuts: 1/2/3/4 to switch modes (when not in text input)
- Mode persists per-program in the store

**Behavior per mode:**
- **SAMPLES mode**: Current behavior exactly as-is
- **DJ FX mode**: Each pad maps to one of the 24 DJ FX actions. Pad shows FX name + category color. Press = `engage()`, release = `disengage()`. Active FX pad pulses/glows.
- **ONE SHOTS mode**: Each pad maps to one of the 33 one-shot presets. Pad shows preset name. Press = trigger synth with one-shot envelope.
- **SCRATCH mode**: Each pad maps to one of the 25 scratch patterns. Press = execute scratch on active DJ deck.

### Default Pad Assignments Per Mode

**DJ FX (Bank A = 16 pads):**
```
Row 1: Stutter 1/8  | Stutter 1/16 | Stutter 1/32 | Dub Echo
Row 2: Tape Echo     | Ping Pong    | HP Sweep      | LP Sweep
Row 3: Reverb Wash   | Spring Reverb| Flanger       | Phaser
Row 4: Tape Stop     | Vinyl Brake  | Half Speed    | Bitcrush
```

**ONE SHOTS (Bank A):**
```
Row 1: Air Horn      | Reggaeton Horn | Dub Siren    | Rave Siren
Row 2: Sub Drop      | Boom          | Rewind        | Tape Stop
Row 3: White Noise   | Frequency Sweep| Dark Riser   | Euphoria Riser
Row 4: DJ Laser      | Glitch Zap    | Vinyl Scratch | Echo Washout
```

**SCRATCH (Bank A):**
```
Row 1: Baby          | Transform     | Flare         | Chirp
Row 2: Crab          | Orbit         | Hydro         | Tear
Row 3: Uzi           | 8-Crab        | 3-Flare       | Twiddle
Row 4: Laser         | Phaser        | Drag          | Stop
```

### Success Criteria
- [ ] Mode selector visible in both normal and performance mode
- [ ] Switching modes instantly changes pad labels/colors
- [ ] DJ FX pads engage/disengage on press/release with visual feedback
- [ ] One-shot pads fire synths on press
- [ ] Scratch pads execute patterns on press
- [ ] Keyboard shortcuts 1-4 switch modes
- [ ] `npm run type-check` passes
- [ ] Both DOM and Pixi versions updated

---

## Phase 2: Quick-Assign Overlay (one-tap assignment)

**Goal:** Long-press or right-click any pad to open an inline assignment picker — no modals.

### Quick-Assign Panel

When a pad is long-pressed (300ms) or right-clicked, a **floating panel** appears anchored to the pad:

```
┌─────────────────────────────────┐
│ ASSIGN TO PAD 3                 │
├─────────────────────────────────┤
│ ▸ DJ FX                        │
│   [Stutter 1/8] [Stutter 1/16] │
│   [Dub Echo]    [Tape Echo]    │
│   [HP Sweep]    [LP Sweep]     │
│   [Reverb Wash] [Flanger]     │
│   [Tape Stop]   [Vinyl Brake]  │
│   ...                           │
│ ▸ One Shots                     │
│   [Air Horn]    [Dub Siren]    │
│   [Sub Drop]    [Laser]        │
│   ...                           │
│ ▸ Scratch                       │
│   [Baby]  [Transform]  [Flare] │
│   ...                           │
│ ▸ Synths                        │
│   [TR-808]  [TR-909]  [DubSiren]│
│   ...                           │
│ ▸ Sample from File...           │
│ ▸ Clear Pad                     │
└─────────────────────────────────┘
```

Each item is a small colored chip — tap it and the pad is assigned immediately. Panel closes. No confirm dialog. Assignment is instant.

### Implementation

**New component:** `src/components/drumpad/QuickAssignPanel.tsx`
- Anchored to pad position (appears above or below depending on screen space)
- Categories are collapsible accordion sections
- Items are small colored chips with name
- Tap = assign + close
- Click outside = close
- Escape = close

**Files to modify:**
- `src/components/drumpad/PadButton.tsx` — add long-press handler, right-click handler
- `src/components/drumpad/PadGrid.tsx` — manage quick-assign panel state
- `src/stores/useDrumPadStore.ts` — add `assignDjFxToPad()`, `assignOneShotToPad()`, `assignScratchToPad()` actions

### Success Criteria
- [ ] Long-press (300ms) or right-click opens quick-assign
- [ ] All DJ FX, one-shots, scratch patterns, and synth types available
- [ ] Tap to assign, panel closes immediately
- [ ] Works in both normal and performance mode
- [ ] Panel positioned correctly (no overflow off-screen)
- [ ] `npm run type-check` passes

---

## Phase 3: Visual Feedback & Active State (the juice)

**Goal:** Make the pads feel alive during performance.

### Active State Indicators

| Pad Type | Idle State | Active State |
|----------|-----------|--------------|
| Sample | Solid color, name | Bright flash on trigger, velocity-scaled brightness |
| DJ FX (momentary) | Category color, FX name | **Pulsing glow** while held, brighter = louder |
| DJ FX (toggle) | Category color, FX name | **Solid bright** while active, dim when off |
| One Shot | Preset color, name | Flash on trigger, brief tail glow |
| Scratch | Pattern color, name | Flash + scratch waveform icon animation |

### Color Scheme by Category

```typescript
const DJ_FX_COLORS: Record<string, string> = {
  stutter:    '#ff6b35', // orange
  delay:      '#ffd166', // gold
  filter:     '#06d6a0', // teal
  reverb:     '#118ab2', // blue
  modulation: '#8338ec', // purple
  distortion: '#ef476f', // pink
  tape:       '#073b4c', // dark teal
  oneshot:    '#ffd166', // gold
};

const ONE_SHOT_COLORS: Record<string, string> = {
  'horns':      '#ff6b35',
  'risers':     '#8338ec',
  'impacts':    '#ef476f',
  'lasers':     '#06d6a0',
  'sirens':     '#ffd166',
  'noise':      '#073b4c',
  'transitions':'#118ab2',
};
```

### Implementation

**Files to modify:**
- `src/components/drumpad/PadButton.tsx` — active state animations (CSS transitions + animation classes)
- `src/engine/drumpad/DjFxActions.ts` — emit active/inactive events to store
- `src/stores/useDrumPadStore.ts` — add `activeFxPads: Set<number>` for tracking which FX are engaged

**CSS animations (Tailwind + custom):**
```css
/* Pulsing glow for momentary FX */
@keyframes pad-pulse {
  0%, 100% { box-shadow: 0 0 8px var(--pad-color); opacity: 0.9; }
  50% { box-shadow: 0 0 20px var(--pad-color); opacity: 1; }
}

/* Flash for one-shots */
@keyframes pad-flash {
  0% { background: white; }
  100% { background: var(--pad-color); }
}
```

### Success Criteria
- [ ] DJ FX pads pulse while held
- [ ] One-shot pads flash on trigger
- [ ] Colors match category scheme
- [ ] No jank — CSS animations only, no JS animation loops
- [ ] Works in both DOM and Pixi
- [ ] `npm run type-check` passes

---

## Phase 4: DJ Program Presets (instant kit loading)

**Goal:** One-tap preset programs that load curated DJ pad setups.

### Built-in DJ Programs

| Program | Description | What's on the pads |
|---------|-------------|-------------------|
| **DJ FX Essential** | Core performance FX | 16 most-used momentary effects |
| **DJ FX Full** | All 24 FX across 2 banks | Banks A+B = all DJ FX |
| **One Shots Live** | Performance sounds | 16 curated one-shots (horns, drops, risers) |
| **Scratch Master** | All scratch patterns | 16 scratch patterns + 4 LFO modes |
| **DJ Complete** | Everything | Bank A=FX, B=One Shots, C=Scratch, D=Samples |
| **Minimal DJ** | Less is more | 8 FX + 4 one-shots + 4 scratch |

### Implementation

**New file:** `src/constants/djPadPresets.ts`
- Each preset defines a `DrumProgram` with pre-assigned pads
- DJ FX pads have `djFxAction` set
- One-shot pads have `synthConfig` set (from `djOneShotPresets.ts`)
- Scratch pads have `scratchAction` set

**Files to modify:**
- `src/components/drumpad/DrumPadManager.tsx` — add "DJ PRESETS" button in header
- `src/stores/useDrumPadStore.ts` — add `loadDJPreset(presetId)` action
- `src/lib/drumpad/defaultKitLoader.ts` — add DJ preset sources

### Preset Loader Flow
1. User taps "DJ PRESETS" in header
2. Dropdown shows 6 DJ programs
3. Tap one → creates new program with pre-assigned pads
4. Switches to that program immediately
5. User is ready to perform

### Success Criteria
- [ ] All 6 DJ presets load correctly
- [ ] Pads have correct assignments (FX, one-shots, scratch)
- [ ] Preset pads show correct colors and labels
- [ ] Loading a preset doesn't destroy existing programs
- [ ] `npm run type-check` passes

---

## Phase 5: Performance Mode Enhancements

**Goal:** Make performance mode a real stage-ready view.

### Changes to Performance Mode

Current: Just bigger pads with minimal UI.
New: Bigger pads + mode strip + active FX indicators + BPM display + deck status.

**Layout in Performance Mode:**
```
┌──────────────────────────────────────────────────┐
│ LIVE │ BPM: 128 │ Deck A: Playing │ [ESC]       │
├──────────────────────────────────────────────────┤
│ [ SAMPLES ] [ DJ FX ] [ ONE SHOTS ] [ SCRATCH ]  │
├──────────────────────────────────────────────────┤
│                                                    │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐    │
│  │STUTTER │ │STUTTER │ │STUTTER │ │ DUB    │    │
│  │  1/8   │ │  1/16  │ │  1/32  │ │ ECHO   │    │
│  └────────┘ └────────┘ └────────┘ └────────┘    │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐    │
│  │ TAPE   │ │  PING  │ │  HPF   │ │  LPF   │    │
│  │ ECHO   │ │  PONG  │ │ SWEEP  │ │ SWEEP  │    │
│  └────────┘ └────────┘ └────────┘ └────────┘    │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐    │
│  │REVERB  │ │SPRING  │ │FLANGER │ │PHASER  │    │
│  │ WASH   │ │  REV   │ │        │ │        │    │
│  └────────┘ └────────┘ └────────┘ └────────┘    │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐    │
│  │ TAPE   │ │ VINYL  │ │ HALF   │ │  BIT   │    │
│  │ STOP   │ │ BRAKE  │ │ SPEED  │ │ CRUSH  │    │
│  └────────┘ └────────┘ └────────┘ └────────┘    │
│                                                    │
│ BANK [ A ] [ B ] [ C ] [ D ]                      │
└──────────────────────────────────────────────────┘
```

### Key Additions
1. **BPM display** — from transport store, for tempo-synced FX awareness
2. **Deck status** — which deck is active (for scratch targeting)
3. **Mode strip** — same 4-mode selector, always visible
4. **Bank selector** — at bottom, always visible
5. **Larger pads** — maximize pad size for touch/MIDI controller use
6. **No sidebar** — all controls collapsed, just pads

### Implementation

**Files to modify:**
- `src/components/drumpad/DrumPadManager.tsx` — enhanced performance mode layout
- `src/components/drumpad/PadButton.tsx` — larger pad variant for performance mode

### Success Criteria
- [ ] Performance mode shows BPM and deck status
- [ ] Mode selector visible in performance mode
- [ ] Pads are maximally large
- [ ] No sidebar or settings panels visible
- [ ] Touch-friendly pad sizes (minimum 80x80px)
- [ ] `npm run type-check` passes

---

## Phase 6: Pixi/GL Parity

**Goal:** All DOM changes mirrored 1:1 in Pixi/GL view.

### Files to update
- `src/pixi/dialogs/PixiDrumPadManager.tsx` — mode selector, performance mode enhancements
- `src/pixi/dialogs/PixiPadEditor.tsx` — quick-assign panel (if applicable)
- New: `src/pixi/dialogs/PixiQuickAssignPanel.tsx` — Pixi version of quick-assign

### Rules (from CLAUDE.md)
- Use `theme.*` from `usePixiTheme()` for all colors — never hardcoded hex
- No DOM overlays in Pixi — all native Pixi components
- Share stores and hooks with DOM version
- Visual 1:1 match with DOM

### Success Criteria
- [ ] Mode selector in Pixi matches DOM
- [ ] Active FX glow/pulse in Pixi matches DOM
- [ ] Quick-assign panel works in Pixi
- [ ] Performance mode layout matches DOM
- [ ] `npm run type-check` passes

---

## Implementation Order

1. **Phase 1** (Pad Mode System) — the foundation everything else builds on
2. **Phase 4** (DJ Program Presets) — immediately usable after Phase 1
3. **Phase 3** (Visual Feedback) — makes it feel professional
4. **Phase 2** (Quick-Assign) — power-user feature for custom setups
5. **Phase 5** (Performance Mode) — stage-ready polish
6. **Phase 6** (Pixi Parity) — after DOM is solid

Estimated: Phase 1-4 = core DJ feature, ready for gig use. Phase 5-6 = polish.

---

## What Already Exists (DO NOT rebuild)

- `DjFxActions.ts` — all 31 momentary FX with engage/disengage (WORKING)
- `djOneShotPresets.ts` — all 33 one-shot synth presets (WORKING)
- `SCRATCH_ACTION_HANDLERS` — all 25 scratch patterns (WORKING)
- `DrumPadEngine` — sample playback with ADSR, filter, mute groups (WORKING)
- `NoteRepeatEngine` — tempo-synced auto-retrigger (WORKING)
- `PadButton` with mousedown/mouseup for velocity + release tracking (WORKING)
- DJ FX pad press/release already wired in `PadGrid.tsx` lines 177-180 + 257-259

The engine layer is DONE. This plan is purely UI/UX work — surfacing what already exists.
