---
date: 2026-02-28
topic: pure-webgl-ui
tags: [pixi, webgl, ui, msdf, fonts, performance]
status: draft
---

# Pure WebGL UI — Design Document

## Goals

1. **Performance** — eliminate all `PixiDOMOverlay` RAF polling, React root overhead, and layout sync cost for main UI chrome
2. **Resolution independence** — every UI element scales perfectly at any zoom level, DPR, or screen size using MSDF vector fonts
3. **Future capabilities** — full-screen shaders (CRT, scanlines, retro), animated theme transitions, UI zoom (150%, 200%), 3D embedding, screenshot/export of entire UI as WebGL framebuffer

## Non-Goals

- Converting collaboration components (`CollaborationToolbar`, `CollaborationSplitView`) — these are rarely rendered, low-performance-impact, deferred
- Accessibility / screen reader support for Pixi components (future concern)
- Mobile IME / virtual keyboard support for `PixiPureTextInput` (deferred)

---

## Architecture

### Current (hybrid)

```
PixiRoot
├── PixiNavBar ──────────────→ PixiDOMOverlay → DOM NavBar (React)
├── PixiTrackerView
│   ├── PixiFT2Toolbar ──────→ PixiDOMOverlay → DOM FT2Toolbar (React)
│   ├── EditorControlsBar ──→ PixiDOMOverlay → DOM EditorControlsBar (React)
│   └── PixiPatternEditor   (already pure WebGL ✓)
└── PixiStatusBar ───────────→ PixiDOMOverlay → DOM StatusBar (React)
```

### Target (pure WebGL)

```
PixiRoot
├── PixiNavBar              (pure Pixi — PixiTabBar, BitmapText, PixiButton)
├── PixiTrackerView
│   ├── PixiFT2Toolbar      (pure Pixi — PixiMenuBar, PixiPureTextInput, PixiNumericInput, transport)
│   ├── PixiEditorControlsBar  (pure Pixi — PixiSelect, PixiToggle, PixiButton)
│   └── PixiPatternEditor   (unchanged ✓)
└── PixiStatusBar           (pure Pixi — BitmapText, Graphics, oscilloscope slot)
```

`PixiDOMOverlay` is retained only for collaboration components.

---

## Section 1: MSDF Font Pipeline

### Background

`fonts.ts` already implements the full MSDF loading pipeline with graceful fallback to system-font bitmap atlases. The only missing piece is the actual atlas files at `public/fonts/msdf/`.

### Fonts to generate

| File prefix | Weight | Used for |
|---|---|---|
| `Inter-Regular` | 400 | Body text, labels, menu items |
| `Inter-Medium` | 500 | Button labels, secondary controls |
| `Inter-SemiBold` | 600 | Section headers, nav tabs |
| `Inter-Bold` | 700 | Emphasized UI labels |
| `JetBrainsMono-Regular` | 400 | BPM, hex values, pattern data, status |
| `JetBrainsMono-Bold` | 700 | Numeric inputs, active values |

### Generation

Source TTFs downloaded from Google Fonts (same weights already loaded via CSS). Stored in `scripts/fonts/` (gitignored — large binary, only needed for regeneration).

```bash
# Add to package.json scripts:
"generate:fonts": "node scripts/generate-msdf-fonts.js"
```

```js
// scripts/generate-msdf-fonts.js
const fonts = [
  ['Inter-Regular', 'scripts/fonts/Inter-Regular.ttf'],
  ['Inter-Medium', 'scripts/fonts/Inter-Medium.ttf'],
  ['Inter-SemiBold', 'scripts/fonts/Inter-SemiBold.ttf'],
  ['Inter-Bold', 'scripts/fonts/Inter-Bold.ttf'],
  ['JetBrainsMono-Regular', 'scripts/fonts/JetBrainsMono-Regular.ttf'],
  ['JetBrainsMono-Bold', 'scripts/fonts/JetBrainsMono-Bold.ttf'],
];
// runs msdf-bmfont-xml per font at size 48, ascii+latin charset, json output
// output: public/fonts/msdf/{name}.json + {name}_0.png
```

Atlas size 48 renders crisply at 10–16px with headroom for 3× zoom. Each atlas ~256×256px.

---

## Section 2: New Pixi Components

### 2.1 `PixiPureTextInput`

**Location:** `src/pixi/input/PixiPureTextInput.tsx`

Replaces the DOM-backed `PixiTextInput`. No `<input>` element, no portal, no DOM.

**Visual structure:**
```
Graphics (background + border, rounded rect)
├── BitmapText (text content)
├── Graphics (selection highlight rect, blue, behind text)
└── Graphics (cursor line, 1px wide, blinks via Ticker)
```

**Behavior:**
- `pointerdown` → claim focus, set cursor position by measuring glyph offsets
- `document.addEventListener('keydown')` when focused (released on blur)
- Arrow keys: move cursor left/right by character
- Shift+Arrow: extend/shrink selection
- Home/End: jump to start/end
- Backspace/Delete: remove at cursor or collapse selection
- Printable characters: insert at cursor
- `Ctrl+A`: select all
- `Ctrl+C`: `navigator.clipboard.writeText(selectedText)`
- `Ctrl+V`: `navigator.clipboard.readText()` → insert at cursor
- `Enter`: fire `onSubmit`
- `Escape`: fire `onCancel`, restore original value
- Cursor blink: Pixi `Ticker`, toggles alpha every 30 frames when focused
- Click-outside: blur handler via `document.addEventListener('pointerdown')`

**Props:** Same interface as current `PixiTextInput` minus `screenX/screenY/isActive` (positioning handled by Pixi layout like all other components).

### 2.2 `PixiSelect`

**Location:** `src/pixi/components/PixiSelect.tsx`

Replaces `<select>` elements. Styled to match DOM `<select>` in EditorControlsBar.

**Visual structure:**
```
Graphics (button background + border)
├── BitmapText (selected label, left-aligned)
└── BitmapText ("▾", right-aligned)

[on open]
PixiDropdownPanel (absolute positioned, z-index above toolbar)
└── PixiScrollView
    └── for each item:
        PixiButton (full-width, hover highlight)
        [for optgroup]:
        BitmapText (group label, dimmed, non-interactive)
```

**Behavior:**
- Click → open panel below button (or above if near bottom of screen)
- Click item → fire `onChange(value)`, close panel
- Escape / click-outside → close without change
- Keyboard: when open, Up/Down navigate, Enter selects, Escape closes

**Props:** `options: {value, label, group?}[]`, `value`, `onChange`, `width`, `height`

### 2.3 `PixiMenuBar`

**Location:** `src/pixi/components/PixiMenuBar.tsx`

Horizontal menu bar for FT2Toolbar (File / Edit / Module / Help).

**Visual structure:**
```
Graphics (bar background, full width)
└── for each menu:
    PixiButton (menu name, flat style)
    [on open]
    PixiDropdownPanel
    └── for each item:
        Graphics (row background on hover)
        ├── BitmapText (item label, left-aligned)
        ├── BitmapText (shortcut hint, right-aligned, dimmed)
        └── [separator]: Graphics (1px horizontal line)
```

**Behavior:**
- Click menu button → open dropdown below
- Hover over another menu button while one is open → switch dropdown (standard menu bar)
- Click item → fire item's `onClick`, close all dropdowns
- Escape / click-outside → close all dropdowns
- Checkbox items: `✓` prefix shown when checked, `onChange(boolean)` fired

**Types:**
```typescript
type MenuSeparator = { type: 'separator' }
type MenuAction = { type: 'action'; label: string; shortcut?: string; onClick: () => void }
type MenuCheckbox = { type: 'checkbox'; label: string; checked: boolean; onChange: (v: boolean) => void }
type MenuItem = MenuSeparator | MenuAction | MenuCheckbox
type Menu = { label: string; items: MenuItem[] }
```

### 2.4 `PixiTabBar`

**Location:** `src/pixi/components/PixiTabBar.tsx`

Project tab bar for PixiNavBar.

**Visual structure:**
```
Graphics (tab bar background)
├── [scroll left arrow — shown on overflow]
├── for each tab:
│   Graphics (tab pill background, accent-tinted if active)
│   ├── BitmapText (tab label)
│   └── PixiButton ("×" close, shown on hover or if active)
├── [scroll right arrow — shown on overflow]
└── PixiButton ("+" new tab)
```

**Behavior:**
- Click tab → fire `onSelect(tabId)`
- Click `×` → fire `onClose(tabId)`
- Click `+` → fire `onNew()`
- Active tab: 2px accent underline, animated slide on tab switch
- Overflow: tabs scroll horizontally via arrow buttons (not mouse wheel, for parity)

### 2.5 `PixiCheckbox`

**Location:** `src/pixi/components/PixiCheckbox.tsx`

12×12 box, checkmark `✓` inside when checked. Used in menu items and settings.

---

## Section 3: Component Conversions

### 3.1 `PixiStatusBar` (pure)

Height: 32px. Layout: `flexDirection: row`, items aligned center.

| Left | Center | Right |
|---|---|---|
| Status message (BitmapText, accent, pulse alpha when set) | — | Memory `X MB / Y MB` (BitmapText) + progress bar (Graphics) |

Oscilloscope: `PixiChannelOscilloscope` already pure Pixi — inserted directly into layout when `oscilloscopeVisible` is true. No overlay.

Reads from UIStore: `statusMessage`, `oscilloscopeVisible`. Reads from AudioStore for memory stats.

### 3.2 `PixiEditorControlsBar`

Height: 28px. Layout: `flexDirection: row`, gap 8, center-aligned.

Left group:
- `PixiSelect` — view mode (Tracker/Grid/Piano Roll/TB-303/Arrangement/DJ/Drum Pads/VJ)
- `PixiSelect` — hardware preset (grouped)
- Subsong: prev `PixiButton` + `PixiNumericInput` + next `PixiButton`
- Ghost `PixiButton` (Eye icon glyph)
- Auto `PixiButton`
- Pads `PixiButton`
- Rec `PixiButton` (red pulse when active) + settings `PixiButton`
- Separator `Graphics` 1px
- Mute `PixiButton`
- Smooth `PixiButton`
- Groove `PixiButton`

Right (flex push):
- Status message `BitmapText` (fades after timeout)
- FPS pill: `BitmapText` + `Graphics` colored dot (green/orange/red)

### 3.3 `PixiNavBar`

Height: 98px. Two rows.

**Row 1 (45px):** Logo `BitmapText` "DEViLBOX" (Inter-Bold) — or `Sprite` if a logo asset exists.

**Row 2 (53px):** `PixiTabBar` filling full width. DOM-mode switch `PixiButton` right-aligned.

### 3.4 `PixiFT2Toolbar`

Height: auto (matches DOM ~160px). Sections:

**Menu bar row:** `PixiMenuBar` — File / Edit / Module / Help menus. Menu structure extracted 1:1 from `FT2Toolbar.tsx` menu definitions.

**Main toolbar row:**
- BPM: `PixiNumericInput` (large, JetBrainsMono-Bold, scroll to change, double-click to type)
- Transport: Stop `PixiButton`, Play Pattern `PixiButton`, Play Song `PixiButton`, Record `PixiButton`
- Pattern name: `PixiPureTextInput`
- Pattern rows: `PixiNumericInput`
- Add/remove channel: `PixiButton` `+` / `-`

**Instrument / Sample / Pattern panels (3-column):**
Each panel: label `BitmapText`, list `PixiList`, prev/next `PixiButton`, action buttons `PixiButton`.

**Visualizer slot:** `PixiVisualizer` (already pure Pixi) inserted directly.

**Toggle strip:** Patterns / Macros / Automation / Macro Slots — `PixiToggle` ×4.

**Compact mode:** When `compactToolbar` true, instrument/sample/pattern panels set `visible: false`.

---

## Section 4: Implementation Phases

| Phase | Work | Deliverable |
|---|---|---|
| 1 | MSDF font atlas generation script + commit 6 atlases | `public/fonts/msdf/*.json + *.png`, `scripts/generate-msdf-fonts.js` |
| 2 | New primitive components: `PixiPureTextInput`, `PixiSelect`, `PixiMenuBar`, `PixiTabBar`, `PixiCheckbox` | `src/pixi/components/Pixi{Select,MenuBar,TabBar,Checkbox}.tsx`, `src/pixi/input/PixiPureTextInput.tsx` |
| 3 | `PixiStatusBar` pure conversion | Removes DOM StatusBar overlay |
| 4 | `PixiEditorControlsBar` pure conversion | Removes DOM EditorControlsBar overlay |
| 5 | `PixiNavBar` pure conversion | Removes DOM NavBar overlay |
| 6 | `PixiFT2Toolbar` pure conversion | Removes DOM FT2Toolbar overlay |
| 7 | Cleanup: remove dead `PixiDOMOverlay` usages, `tsc --noEmit`, visual parity verification | Zero DOM overlays for main UI chrome |

---

## Success Criteria

**Automated:**
- `tsc --noEmit` passes with zero errors
- All 2709 tests pass
- No `PixiDOMOverlay` usage in `PixiNavBar`, `PixiFT2Toolbar`, `PixiStatusBar`, `PixiEditorControlsBar`

**Manual (visual parity):**
- Switch between DOM and GL modes — UI chrome looks identical at 100% zoom
- Zoom UI to 150% — all text and controls remain crisp (no pixelation)
- BPM field: click, type, scroll — all work without any DOM input appearing
- View mode dropdown: opens, scrolls, selects
- FT2 menu bar: File menu opens, items clickable, keyboard shortcuts shown
- NavBar tabs: add, switch, close tabs
- Oscilloscope appears/disappears correctly in status bar
- Compact toolbar collapses correctly
