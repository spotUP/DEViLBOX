---
date: 2026-04-17
topic: padeditor-chaos-audit
tags: [drumpad, padeditor, ui, audit]
status: draft
---

# PadEditor Chaos Audit

## 1. File Size & Sprawl

**Lines:** 1,083 lines in `src/components/drumpad/PadEditor.tsx` (line 1—1083)

**Top-level state/hooks:**
- 5 `useState` hooks (lines 122—125: `activeTab`, `isLearning`, `showLayerBrowser`, `showSampleBrowser`)
- 1 `useRef` (line 126: `learningRef`)
- 1 `useMemo` (lines 236—268: `adsrVisualization` — memoized ADSR viz bar)
- 3 `useCallback` hooks (lines 140—228: `handleUpdate`, `handlePreviewDown`, `handlePreviewUp`, `handleMIDILearn`)
- 1 `useEffect` hook (lines 231—233: MIDI cleanup)

**Sub-sections within render tree:**
1. Sound tab: Synth type picker, trigger note, sample loader, synth editor (UnifiedInstrumentEditor lazy-loaded)
2. Main tab: Name, Level/Tune/Pan 3-col grid, MPC controls (mute group, reverse, sample start/end), Output + Velocity Curve, Color picker, MIDI trigger, Clear button
3. Envelope tab: ADSR 2×2 grid, ADSR visualization, Filter type, Cutoff/Resonance, Filter Envelope (conditional if filter active), Filter Env Attack/Decay (conditional if env amount > 0)
4. Velocity tab: 5 velocity modulation sliders (veloToLevel, veloToAttack, veloToStart, veloToFilter, veloToPitch)
5. Layers tab: Existing layers display + remove, Add Layer button, SamplePackBrowser (conditional)
6. DJ tab: Scratch action dropdown, Scratch action status display, DJ FX action dropdown, DJ FX status display

**Total top-level handlers directly in render:** 51 inline `onChange` / `onClick` handlers

---

## 2. Tab/Section Structure

**Layout:** 6 horizontal tab buttons (tabs: "Sound", "Main", "Envelope", "Velocity", "Layers", "DJ FX") (lines 278—285, 349—365).

**Navigation:** Flat tab bar at line 349, `activeTab === <name>` conditional render (lines 369, 535, 716, 819, 897, 992). Each tab renders a completely separate `<div className="space-y-4">` block.

**How user finds features:**
- **ADSR:** Envelope tab
- **Velocity layers:** Layers tab
- **Synth config:** Sound tab (lazy-loaded editor inside) + Main tab (basic settings)
- **DJ FX/scratches:** DJ tab
- **Filter:** Envelope tab (requires scrolling down past ADSR)
- **Sample tuning:** Main tab (tune slider)
- **Mute group/reverse/sample start-end:** Main tab (MPC section)
- **Color/MIDI/Output bus:** Main tab

**Pain points:**
- **Velocity modulation controls live in their own tab** — five slider controls (veloToLevel, veloToAttack, veloToStart, veloToFilter, veloToPitch) are visually isolated; a user tweaking levels on the Main tab cannot quickly access velocity curve settings without tabbing away
- **Filter controls split across Envelope tab:** ADSR in one section, filter type/cutoff/resonance in conditional sub-block below, filter envelope in *another* conditional block — requires scrolling and collapsing conditional states mentally
- **Synth editor is heavyweight lazy-loaded component** — appears inside Sound tab only; switching tabs then back requires re-render/re-mount (line 516—530)

---

## 3. Duplicated Controls

**In the context menu (`usePadContextMenu.ts`):**
- "Mute Group" submenu (lines 911—930) — **duplicates** Main tab mute group dropdown (line 580—589)
- "Velocity Curve" submenu (lines 942—954) — **duplicates** Main tab velocity curve dropdown (lines 641—652)
- "Output Bus" submenu (lines 966—978) — **duplicates** Main tab output bus dropdown (lines 626—638)
- "Color" submenu (lines 982—1002) — **duplicates** Main tab color picker (lines 657—682)
- "Reverse" toggle (line 192—195 in menu) — **duplicates** Main tab reverse checkbox (lines 595—599)

**Quick-assign in context menu** (`buildQuickAssignSubmenu` lines 641—689) vs **Sound tab synth picker** (lines 372—427): Both allow assigning synths and switching synth types. Context menu includes presets; PadEditor Sound tab allows switching synth type and embedding the full UnifiedInstrumentEditor.

**Sample load flow:** 
- Context menu: "Load Sample..." (line 165—167 in menu)
- PadEditor Sound tab: "Browse Sample Packs..." OR "Upload File..." (lines 476—500)
- Both point to `SamplePackBrowser` but through different entry points

**MIDI Learn:**
- PadEditor Main tab: "MIDI Learn" button (lines 697—704)
- Not exposed in context menu (only copy/paste/clear)

---

## 4. Conditional Rendering Complexity

**if (!pad)** check on line 270: Early exit if pad not found.

**Conditional branches within render:**
1. Line 431—452: `if (pad.synthConfig || pad.instrumentId != null)` — show trigger note picker
2. Line 458—501: `if (pad.sample)` ... `else` — sample display vs load buttons
3. Line 504—513: `if (showSampleBrowser)` — nested SamplePackBrowser modal
4. Line 516—530: `if (pad.synthConfig)` — conditional lazy-load of UnifiedInstrumentEditor (Sound tab only)
5. Line 775—814: `if (pad.filterType !== 'off')` — filter controls conditional on filter type
6. Line 798—811: `if (pad.filterEnvAmount > 0)` — filter envelope controls conditional on env amount
7. Line 902—906: `if (pad.layers.length === 0)` — empty state vs layer list (Layers tab)
8. Line 974—988: `if (showLayerBrowser)` — nested SamplePackBrowser modal for layers
9. Line 1012—1028: `if (pad.scratchAction)` ... `else` — status display for scratch action (DJ tab)
10. Line 1064—1076: `if (pad.djFxAction)` ... — status display for DJ FX action (DJ tab)

**Dramatic shifts:** Sound tab **completely changes appearance** if `pad.synthConfig` is set (adds 400+ lines of UnifiedInstrumentEditor). User does not see a clear visual indicator that the editor is loading or that it's a separate, heavyweight component.

---

## 5. Modal / Panel Size

**Container:** Line 288:
```
<div className="bg-dark-bg border border-dark-border rounded-lg overflow-hidden flex flex-col max-h-[95vh]">
```

**No explicit width constraint.** Parent container in DrumPadManager (line 268):
```
<div className="max-w-6xl w-full mx-4 max-h-[95vh]">
```

**Max width: 6xl (1152px).** Modal uses full-width within parent; on larger screens (e.g., 2560px), this leaves blank space on sides. On smaller screens (<768px), may be cramped.

**Scrollable content area:** Line 368:
```
<div className="p-4 overflow-y-auto flex-1 min-h-0">
```

**Content overflow strategy:** Each tab renders independently with its own `space-y-4` grid; if a tab (e.g., Envelope or Velocity) has many controls, they stack vertically and scroll within the modal.

**Tab bar is NOT sticky** — scrolls away with content (only header is fixed at top).

---

## 6. Field Density

**Main tab — 3-column grid (Level/Tune/Pan):** Line 549—572, 3 sliders side-by-side.

**Velocity tab — 5 sliders stacked:** Lines 819—894, each slider has label + range input + descriptive text below. ~8 lines per slider = 40+ lines for 5 controls. High density; requires scrolling in modal.

**Envelope tab — 2×2 ADSR grid:** Lines 720—752, 4 sliders in grid layout. Then memoized visualization (lines 754). Then Filter section (lines 757+), which conditionally expands.

**Layer section:** Each layer is a card (lines 908—964) with 3 controls (vel min/max, level offset) per layer. If pad has 4 layers, ~24 lines of UI just for layers.

**Raw <input type="range"> elements:** 14 throughout (lines 552, 560, 568, 607, 615, 723, 728, 744, 749, 780, 785, 795, 802, 807).

**Design-system compliance:** No `<Knob>` component used. All continuous parameters use raw HTML `<input type="range">` (browser default range slider). Per CLAUDE.md line 81, design-system `<Knob>` is mandated for continuous values.

**Toggle compliance:** Line 595 uses `<input type="checkbox">` (browser default); likely should be design-system `<Toggle>` component.

**Dropdowns:** CustomSelect component used consistently (lines 376, 434, 580, 626, 642, 761, 1000, 1038) for categorical/choice inputs.

---

## 7. Design-Token Violations

**Line 469** (Remove Sample button):
```tsx
className="px-2 py-1 text-[10px] font-mono text-red-400 hover:text-red-300 bg-dark-surface border border-dark-border rounded"
```

**Violation:** `text-red-400` and `hover:text-red-300` are raw Tailwind color classes.

**Correct tokens (from CLAUDE.md line 100):** Should use `text-accent-error` and `hover:text-accent-error/80` or similar.

**Exception context:** Per CLAUDE.md line 81, the only exceptions are "intentional decorative palettes (channel colors, hot cue colors, oscilloscope voice colors)." A "Remove Sample" button is not a decorative palette; it's a UI control. This is a violation.

**Rest of file:** All other color classes follow token system (e.g., `text-text-primary`, `bg-dark-surface`, `border-dark-border`, `text-accent-primary`, `bg-accent-error` on line 710 for "Clear Pad" button).

---

## 8. Event-Handler Density

**Inline handlers in render tree:** 51 total `onChange` / `onClick` handlers (grep count, line counts vary).

**Duplicate-logic handlers:** Most handlers follow pattern:
```tsx
onChange={(e) => handleUpdate({ fieldName: parseFloat(e.target.value) })}
```

**Example:** Lines 552—554, 560—562, 568—570 (Level/Tune/Pan) all follow same pattern:
```tsx
<input type="range" min="..." max="..." value={pad.level}
  onChange={(e) => handleUpdate({ level: parseInt(e.target.value) })}
  className="w-full" />
```

**Could be unified:** Create a generic handler factory or use a data-driven approach to render sliders (array of slider configs) instead of hand-coding each.

**Handler fragmentation:** Most handlers are inline lambdas `(e) => handleUpdate(...)` rather than extracted functions. This makes the component harder to trace for live gig debugging.

**No useless re-renders detected:** Each handler is wrapped in useCallback where needed (line 140—228 for handleUpdate, handlePreviewDown, handlePreviewUp, handleMIDILearn).

---

## 9. State Leaks

**Local state that belongs in store:**
- `activeTab` (line 122) — which tab is active. Lives in component state; if modal closes and reopens, tab resets to `initialTab` (default 'sound'). For live use, might want to persist tab selection in UIStore.
- `showLayerBrowser` (line 124) — whether layer browser modal is open. Ephemeral UI state; correct placement in component.
- `showSampleBrowser` (line 125) — whether sample browser modal is open. Ephemeral; correct.
- `isLearning` (line 123) + `learningRef` (line 126) — MIDI learn state. Uses both state + ref to avoid stale closure bugs (ref pattern matches CLAUDE.md guidance). Correct.

**Store dependencies:** Component reads from `useDrumPadStore()` (lines 128—135), calling `updatePad()` for all changes. This is correct — pad state lives in store, not component.

**Preview state leaks:** Lines 145—146:
```tsx
const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);
const previewInstRef = useRef<{ instId: number; note: string; config: InstrumentConfig } | null>(null);
```

These are refs for holding audio nodes during preview (mouseDown/Up). Correct; should not be in store (ephemeral, preview-only).

**No stale-state issues detected:** Refs are used correctly to avoid closure bugs in MIDI learn (line 206—227).

---

## 10. Missing or Broken Things

**No TODO/FIXME comments found** in PadEditor.tsx.

**Lazy-loaded component (Suspense):** Line 517 wraps UnifiedInstrumentEditor in Suspense with fallback text. Fallback is minimal ("Loading synth editor..."). If load takes >2s, user sees placeholder; no cancel/timeout mechanism. Not broken, but UX could be clearer.

**Dead code / commented blocks:** None detected.

**Setters wired to non-existent store fields:** All handlers use `updatePad()` which updates DrumPad object in store. Store fields (attack, decay, filterType, etc.) match DrumPad interface (lines 52—117 in `src/types/drumpad.ts`). No broken wiring detected.

**Half-finished features:** 
- Layers tab has "Add Layer" but no UI to edit layer velocity ranges after creation (only via inline controls after adding). Minor friction, not broken.
- Filter envelope only shows controls if `filterEnvAmount > 0` (line 798); user must first set env amount to see/edit attack/decay. Non-intuitive but intentional.

---

## 11. User Flow: Sample Load → Pad Plays

**Happy path (right-click empty pad):**

1. Right-click empty pad → context menu (DOM ContextMenu from DrumPadManager)
2. Select "Load Sample..." → triggers `onLoadSample` callback (line 238—241 in DrumPadManager)
3. **Call:** `setSelectedPadId(id)` + `setPadEditorShowSamples(true)` + `setShowPadEditor(true)`
4. PadEditor modal opens with `initialShowSampleBrowser={true}`
5. Line 504: `if (showSampleBrowser)` → renders `<SamplePackBrowser>` directly in Sound tab
6. User selects sample → `onSelectSample` handler (line 507—510): calls `loadSampleToPad(padId, sample)` + closes browser
7. Sample now visible in Sound tab (lines 458—473): "Remove" button, sample name, "Replace" button
8. User closes PadEditor modal (line 337—343 or via `onClose` callback)
9. **Focus shift:** Modal backdrop closes; focus returns to PadGrid. Pad now shows sample in grid.
10. User clicks pad → pad plays sample (handled by PadGrid play logic, not PadEditor)

**Friction points:**
- Step 2: "Load Sample..." is in context menu (requires right-click, navigate submenu). Alternative: click pad to select, then PadEditor opens to Sound tab. Two different entry points.
- Step 5: SamplePackBrowser is rendered inside PadEditor Sound tab, not as a standalone modal. If user wants to cancel, they must close SamplePackBrowser (line 511) OR close entire PadEditor modal (line 339). Escape key behavior is unclear.
- **Focus shift (Step 9):** When modal closes, focus returns to page body, not to the PadGrid. User must click pad again to trigger it. No auto-play-after-load behavior.

**Modal stacking:**
- PadEditor itself is in a full-screen modal overlay (line 264—275 in DrumPadManager): `fixed inset-0 z-[99990]`
- SamplePackBrowser inside PadEditor: not a separate modal; renders inline in Sound tab (line 504—512). **No modal stacking**, but SamplePackBrowser likely has its own modal/fullscreen overlay inside (not checked here).
- Layers tab also shows SamplePackBrowser (line 974—988) for adding layers. Same component, two entry points.

**Total clicks to play:** 4—5 clicks (right-click pad → Load Sample → Select Sample → Close PadEditor → Click pad to play).

---

## 12. Recent Commits

**Last 2 weeks of changes to `src/components/drumpad/PadEditor.tsx`:**

| Hash | Message | Status |
|------|---------|--------|
| `4e0794aa0` | Add default Reggae Soundsystem FX for drumpad synths | Maintenance — adds FX defaults |
| `1be965d0a` | Drumpad UI improvements: ROM speech presets, pad grid layout | Enhancement — UI polish |
| `78730c954` | fix: PadEditor preview button uses mouseDown/Up for hold-to-play | Bug fix — preview interaction |
| `287a90c84` | refactor: PadEditor uses UnifiedInstrumentEditor, wider modal | **MAJOR REFACTOR** — synth editor embedding (added ~100 lines, Suspense wrapper) |
| `5d8f9b181` | PadEditor: dispose cached synth on config change | Bug fix — memory leak prevention |
| `b3977bd4f` | DrumPad: refactor pad editor, grid, and context menu | Refactor — UI restructuring |
| `e018e454d` | Tour FX, play retrigger, drumpad/MIDI note fixes | Bug fixes — multiple issues |
| `236b4a58e` | refactor: migrate remaining selects to CustomSelect | Cleanup — design-system compliance |

**Band-aids detected:** Commit `5d8f9b181` ("dispose cached synth on config change") suggests synths were not being properly cleaned up before; line 381 in PadEditor calls `getToneEngine().disposeInstrument()` to prevent leaks. Necessary fix, but indicates prior state-management oversight.

**Large refactor:** Commit `287a90c84` embeds UnifiedInstrumentEditor via lazy-load. This was a **major change** to the architecture; PadEditor now hosts a full synth editor inside the Sound tab, making that tab heavy and introducing loading states. This is the root of the "chaos" — mixing pad-quick-edit UI with a heavyweight synth editor.

---

## Top 5 Pain Points for the User

1. **Scattered controls across tabs requiring tab navigation:** Velocity modulation settings are isolated in their own tab, separated from the basic level/pan/tune controls on Main. Tweaking feel requires tab-switching. Live gig = slow.

2. **Raw HTML sliders instead of design-system knobs:** 14 `<input type="range">` elements render as browser-default sliders; no unified visual language, no MIDI knob integration, no consistent haptic feedback on touch. Design system mandates `<Knob>` component; PadEditor ignores this.

3. **Heavyweight synth editor embedded in Sound tab with no loading feedback:** UnifiedInstrumentEditor (427 lines) is lazy-loaded inside PadEditor Sound tab. If user switches to Sound tab and synth is complex (FurnaceEditor is 132K+ lines), the fallback text flickers and user cannot interact until fully loaded. No progress indication.

4. **Duplicate controls in context menu vs. PadEditor dialog:** Mute group, velocity curve, output bus, color, reverse, sample load all exist in both right-click context menu AND in PadEditor Modal. User must learn two paths to the same setting. For live tweaking, this adds cognitive load.

5. **Design-token violation (red color on Remove button):** Single instance of `text-red-400` / `hover:text-red-300` on Remove Sample button breaks design-system consistency. Minor visual issue, but in live gig context, inconsistent button styling = harder to identify destructive actions at a glance.

---

**End of audit. User decides what to fix next.**
