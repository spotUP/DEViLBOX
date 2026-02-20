# Keyboard Command Stubs Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace every stubbed keyboard command handler with a real implementation, adding missing store state and TrackerStore methods as needed.

**Architecture:** Each command file (follow, file, view, layout, misc, advanced, position) dispatches to existing or new Zustand store actions. Dialogs that keyboard commands need to open are coordinated via a new `dialogOpen` field in `useUIStore` so commands (outside React) can trigger dialogs (inside React components). A `showFileBrowser` flag is moved from App.tsx local state to UIStore for the same reason.

**Tech Stack:** Zustand, React, TypeScript. No new libraries. Tests use Vitest.

---

### Task 1: UIStore — add dialogOpen flag, showFileBrowser, and feature toggles

**Files:**
- Modify: `src/stores/useUIStore.ts`
- Test: `src/stores/__tests__/useUIStore.test.ts` (create if it doesn't exist)

Commands like `interpolateVolume` need to open `InterpolateDialog`, which lives inside `TrackerView`. Since keyboard commands run outside React, they can't call React state setters directly. The fix: a `dialogOpen` string in UIStore that TrackerView and App.tsx watch.

**Step 1: Add the new types and state fields to the UIStore interface**

In `src/stores/useUIStore.ts`, add above the `interface UIStore {` line:

```typescript
export type DialogCommand =
  | 'interpolate-volume'
  | 'interpolate-effect'
  | 'humanize'
  | 'find-replace'
  | 'groove-settings'
  | 'scale-volume-block'
  | 'scale-volume-track'
  | 'scale-volume-pattern'
  | 'keyboard-help'
  | 'tempo-tap';
```

Add to `interface UIStore`:

```typescript
  // Dialog command (keyboard → dialog bridge)
  dialogOpen: DialogCommand | null;
  showFileBrowser: boolean;
  showChannelNames: boolean;

  // Actions
  openDialogCommand: (dialog: DialogCommand) => void;
  closeDialogCommand: () => void;
  setShowFileBrowser: (show: boolean) => void;
  toggleChannelNames: () => void;
```

**Step 2: Add initial state**

In the `immer((set) => ({` block initial values, add:

```typescript
  dialogOpen: null,
  showFileBrowser: false,
  showChannelNames: false,
```

**Step 3: Add action implementations** (before the closing `}))`)

```typescript
      openDialogCommand: (dialog) =>
        set((state) => { state.dialogOpen = dialog; }),

      closeDialogCommand: () =>
        set((state) => { state.dialogOpen = null; }),

      setShowFileBrowser: (show) =>
        set((state) => { state.showFileBrowser = show; }),

      toggleChannelNames: () =>
        set((state) => { state.showChannelNames = !state.showChannelNames; }),
```

**Step 4: Write tests**

Create `src/stores/__tests__/useUIStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '../useUIStore';

beforeEach(() => {
  useUIStore.setState({
    dialogOpen: null,
    showFileBrowser: false,
    showChannelNames: false,
  });
});

describe('UIStore dialog bridge', () => {
  it('openDialogCommand sets dialogOpen', () => {
    useUIStore.getState().openDialogCommand('interpolate-volume');
    expect(useUIStore.getState().dialogOpen).toBe('interpolate-volume');
  });

  it('closeDialogCommand clears dialogOpen', () => {
    useUIStore.getState().openDialogCommand('humanize');
    useUIStore.getState().closeDialogCommand();
    expect(useUIStore.getState().dialogOpen).toBeNull();
  });

  it('setShowFileBrowser toggles file browser', () => {
    useUIStore.getState().setShowFileBrowser(true);
    expect(useUIStore.getState().showFileBrowser).toBe(true);
    useUIStore.getState().setShowFileBrowser(false);
    expect(useUIStore.getState().showFileBrowser).toBe(false);
  });

  it('toggleChannelNames flips state', () => {
    expect(useUIStore.getState().showChannelNames).toBe(false);
    useUIStore.getState().toggleChannelNames();
    expect(useUIStore.getState().showChannelNames).toBe(true);
  });
});
```

**Step 5: Run tests**

```bash
cd /Users/spot/Code/DEViLBOX && npx vitest run src/stores/__tests__/useUIStore.test.ts
```

Expected: all 4 tests PASS.

**Step 6: Commit**

```bash
git add src/stores/useUIStore.ts src/stores/__tests__/useUIStore.test.ts
git commit -m "feat(keyboard): add UIStore dialogOpen bridge, showFileBrowser, showChannelNames"
```

---

### Task 2: TransportStore — add countInEnabled toggle

**Files:**
- Modify: `src/stores/useTransportStore.ts`

**Step 1: Add to interface and initial state**

Add to `interface TransportStore`:

```typescript
  countInEnabled: boolean;
  toggleCountIn: () => void;
```

Add to initial state block:

```typescript
    countInEnabled: false,
```

Add action:

```typescript
    toggleCountIn: () =>
      set((state) => { state.countInEnabled = !state.countInEnabled; }),
```

**Step 2: Commit**

```bash
git add src/stores/useTransportStore.ts
git commit -m "feat(keyboard): add countInEnabled to TransportStore"
```

---

### Task 3: TrackerStore — add wrapMode, autoRecord, recordQuantize, multiChannelRecord, bookmarks; extend ptnJumpPos to 10

**Files:**
- Modify: `src/stores/useTrackerStore.ts`
- Test: `src/stores/__tests__/useTrackerStore.test.ts` (add new tests)

**Step 1: Add to TrackerStore interface** (near the `recordMode` and `insertMode` fields around line 84):

```typescript
  wrapMode: boolean;          // Cursor wraps at pattern boundaries
  recordQuantize: boolean;    // Quantize recorded notes to step grid
  autoRecord: boolean;        // Auto-record notes while playing
  multiChannelRecord: boolean; // Record to multiple channels simultaneously
  bookmarks: number[];        // Row bookmarks in current pattern
```

Add to actions interface:

```typescript
  toggleWrapMode: () => void;
  toggleRecordQuantize: () => void;
  toggleAutoRecord: () => void;
  toggleMultiChannelRecord: () => void;
  toggleBookmark: (row: number) => void;
  clearBookmarks: () => void;
  nextBookmark: () => void;
  prevBookmark: () => void;
```

**Step 2: Add initial state** (near recordMode/insertMode defaults around line 285):

```typescript
    wrapMode: false,
    recordQuantize: false,
    autoRecord: false,
    multiChannelRecord: false,
    bookmarks: [],
```

**Step 3: Extend ptnJumpPos from 4 to 10 slots**

Change the default value (around line 300):

```typescript
    ptnJumpPos: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // 10 stored jump positions (0-9)
```

The existing `setPtnJumpPos`/`getPtnJumpPos` already guard with `index >= 0 && index < 4` — update the guard to `< 10`:

```typescript
    setPtnJumpPos: (index, row) =>
      set((state) => {
        if (index >= 0 && index < 10) {
          state.ptnJumpPos[index] = row;
        }
      }),

    getPtnJumpPos: (index) => {
      const state = get();
      if (index >= 0 && index < 10) {
        return state.ptnJumpPos[index];
      }
      return 0;
    },
```

**Step 4: Add action implementations** (after the `toggleInsertMode` action, around line 671):

```typescript
    toggleWrapMode: () =>
      set((state) => { state.wrapMode = !state.wrapMode; }),

    toggleRecordQuantize: () =>
      set((state) => { state.recordQuantize = !state.recordQuantize; }),

    toggleAutoRecord: () =>
      set((state) => { state.autoRecord = !state.autoRecord; }),

    toggleMultiChannelRecord: () =>
      set((state) => { state.multiChannelRecord = !state.multiChannelRecord; }),

    toggleBookmark: (row: number) =>
      set((state) => {
        const idx = state.bookmarks.indexOf(row);
        if (idx === -1) {
          state.bookmarks.push(row);
          state.bookmarks.sort((a, b) => a - b);
        } else {
          state.bookmarks.splice(idx, 1);
        }
      }),

    clearBookmarks: () =>
      set((state) => { state.bookmarks = []; }),

    nextBookmark: () =>
      set((state) => {
        const sorted = [...state.bookmarks].sort((a, b) => a - b);
        const after = sorted.find(r => r > state.cursor.rowIndex);
        if (after !== undefined) state.cursor.rowIndex = after;
      }),

    prevBookmark: () =>
      set((state) => {
        const sorted = [...state.bookmarks].sort((a, b) => a - b);
        const before = [...sorted].reverse().find(r => r < state.cursor.rowIndex);
        if (before !== undefined) state.cursor.rowIndex = before;
      }),
```

**Step 5: Write tests**

In `src/stores/__tests__/useTrackerStore.test.ts`, add a new describe block:

```typescript
describe('wrapMode and feature flags', () => {
  it('toggleWrapMode flips wrapMode', () => {
    useTrackerStore.setState({ wrapMode: false });
    useTrackerStore.getState().toggleWrapMode();
    expect(useTrackerStore.getState().wrapMode).toBe(true);
  });

  it('toggleBookmark adds and removes bookmarks', () => {
    useTrackerStore.setState({ bookmarks: [] });
    useTrackerStore.getState().toggleBookmark(16);
    expect(useTrackerStore.getState().bookmarks).toContain(16);
    useTrackerStore.getState().toggleBookmark(16);
    expect(useTrackerStore.getState().bookmarks).not.toContain(16);
  });

  it('clearBookmarks empties bookmarks', () => {
    useTrackerStore.setState({ bookmarks: [4, 8, 16] });
    useTrackerStore.getState().clearBookmarks();
    expect(useTrackerStore.getState().bookmarks).toHaveLength(0);
  });

  it('ptnJumpPos accepts indices 0-9', () => {
    useTrackerStore.getState().setPtnJumpPos(9, 42);
    expect(useTrackerStore.getState().getPtnJumpPos(9)).toBe(42);
  });

  it('ptnJumpPos rejects index 10', () => {
    useTrackerStore.getState().setPtnJumpPos(10, 99);
    expect(useTrackerStore.getState().getPtnJumpPos(10)).toBe(0);
  });
});
```

**Step 6: Run tests**

```bash
npx vitest run src/stores/__tests__/useTrackerStore.test.ts
```

Expected: new tests PASS.

**Step 7: Commit**

```bash
git add src/stores/useTrackerStore.ts src/stores/__tests__/useTrackerStore.test.ts
git commit -m "feat(keyboard): add wrapMode, bookmarks, autoRecord, recordQuantize; extend ptnJumpPos to 10"
```

---

### Task 4: TrackerStore — add advanced editing methods

**Files:**
- Modify: `src/stores/useTrackerStore.ts`
- Test: `src/stores/__tests__/useTrackerStore.test.ts`

**Step 1: Add to TrackerStore interface**

```typescript
  amplifySelection: (factor: number) => void;
  growSelection: () => void;
  shrinkSelection: () => void;
  swapChannels: (aIdx: number, bIdx: number) => void;
  splitPatternAtCursor: () => void;
  joinPatterns: () => void;
```

**Step 2: Implement amplifySelection** (add after `scaleVolume` implementation around line 1800):

```typescript
    amplifySelection: (factor) => {
      const { selection, patterns, currentPatternIndex } = get();
      if (!selection) return;
      const patternIndex = currentPatternIndex;
      const beforePattern = patterns[patternIndex];
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        const { startChannel, endChannel, startRow, endRow } = selection;
        for (let ch = startChannel; ch <= endChannel; ch++) {
          for (let r = startRow; r <= endRow; r++) {
            const cell = pattern.channels[ch].rows[r];
            if (cell.volume > 0) {
              cell.volume = Math.max(0, Math.min(64, Math.round(cell.volume * factor)));
            }
          }
        }
      });
      useHistoryStore.getState().pushAction('AMPLIFY', 'Amplify selection', patternIndex, beforePattern, get().patterns[patternIndex]);
    },
```

**Step 3: Implement growSelection**

```typescript
    growSelection: () => {
      const { selection, patterns, currentPatternIndex } = get();
      if (!selection) return;
      const pattern = patterns[currentPatternIndex];
      set((state) => {
        const sel = state.selection;
        if (!sel) return;
        sel.startRow = Math.max(0, sel.startRow - 1);
        sel.endRow = Math.min(pattern.length - 1, sel.endRow + 1);
        sel.startChannel = Math.max(0, sel.startChannel - 1);
        sel.endChannel = Math.min(pattern.channels.length - 1, sel.endChannel + 1);
      });
    },
```

**Step 4: Implement shrinkSelection**

```typescript
    shrinkSelection: () => {
      const { selection } = get();
      if (!selection) return;
      set((state) => {
        const sel = state.selection;
        if (!sel) return;
        const midRow = Math.floor((sel.startRow + sel.endRow) / 2);
        const midCh = Math.floor((sel.startChannel + sel.endChannel) / 2);
        sel.startRow = Math.min(sel.startRow + 1, midRow);
        sel.endRow = Math.max(sel.endRow - 1, midRow);
        sel.startChannel = Math.min(sel.startChannel + 1, midCh);
        sel.endChannel = Math.max(sel.endChannel - 1, midCh);
      });
    },
```

**Step 5: Implement swapChannels**

```typescript
    swapChannels: (aIdx, bIdx) => {
      const { patterns, currentPatternIndex } = get();
      const pattern = patterns[currentPatternIndex];
      if (aIdx < 0 || bIdx < 0 || aIdx >= pattern.channels.length || bIdx >= pattern.channels.length) return;
      const beforePattern = pattern;
      set((state) => {
        const pat = state.patterns[state.currentPatternIndex];
        const temp = JSON.parse(JSON.stringify(pat.channels[aIdx].rows));
        pat.channels[aIdx].rows = JSON.parse(JSON.stringify(pat.channels[bIdx].rows));
        pat.channels[bIdx].rows = temp;
      });
      useHistoryStore.getState().pushAction('SWAP_CHANNELS', 'Swap channels', currentPatternIndex, beforePattern, get().patterns[currentPatternIndex]);
    },
```

**Step 6: Implement splitPatternAtCursor**

```typescript
    splitPatternAtCursor: () => {
      const { patterns, currentPatternIndex, cursor } = get();
      const pattern = patterns[currentPatternIndex];
      const splitRow = cursor.rowIndex;
      if (splitRow <= 0 || splitRow >= pattern.length) return;

      // Create new pattern with rows from splitRow to end
      const newPatternRows = pattern.length - splitRow;
      set((state) => {
        const pat = state.patterns[state.currentPatternIndex];
        // Build new pattern channels
        const newChannels = pat.channels.map(ch => ({
          ...ch,
          rows: ch.rows.slice(splitRow),
        }));
        // Truncate current pattern to splitRow rows
        pat.channels.forEach(ch => { ch.rows = ch.rows.slice(0, splitRow); });
        pat.length = splitRow;

        // Insert new pattern after current
        const newPattern = {
          id: `pattern-${Date.now()}`,
          length: newPatternRows,
          channels: newChannels,
        };
        state.patterns.splice(state.currentPatternIndex + 1, 0, newPattern);
      });
    },
```

**Step 7: Implement joinPatterns**

```typescript
    joinPatterns: () => {
      const { patterns, currentPatternIndex } = get();
      if (currentPatternIndex >= patterns.length - 1) return;
      const nextIdx = currentPatternIndex + 1;
      const beforeCurrent = patterns[currentPatternIndex];
      set((state) => {
        const cur = state.patterns[state.currentPatternIndex];
        const next = state.patterns[state.currentPatternIndex + 1];
        const minChannels = Math.min(cur.channels.length, next.channels.length);
        for (let ch = 0; ch < minChannels; ch++) {
          cur.channels[ch].rows = [...cur.channels[ch].rows, ...next.channels[ch].rows];
        }
        cur.length = cur.channels[0].rows.length;
        state.patterns.splice(state.currentPatternIndex + 1, 1);
      });
      useHistoryStore.getState().pushAction('JOIN_PATTERNS', 'Join patterns', currentPatternIndex, beforeCurrent, get().patterns[currentPatternIndex]);
    },
```

**Step 8: Write tests**

In `src/stores/__tests__/useTrackerStore.test.ts`, add:

```typescript
describe('amplifySelection', () => {
  it('multiplies volume of cells in selection by factor', () => {
    // Set up a 4-row, 2-channel pattern with volumes
    // Use existing test helpers or applySystemPreset
    // ... (exercise store directly)
  });
});
```

Note: Full integration tests require full store setup. Write minimal smoke tests at minimum.

**Step 9: Run tests**

```bash
npx vitest run src/stores/__tests__/useTrackerStore.test.ts
```

**Step 10: Commit**

```bash
git add src/stores/useTrackerStore.ts src/stores/__tests__/useTrackerStore.test.ts
git commit -m "feat(keyboard): add amplifySelection, growSelection, shrink, swapChannels, splitPattern, joinPatterns"
```

---

### Task 5: Wire App.tsx to UIStore.showFileBrowser

**Files:**
- Modify: `src/App.tsx`

The `showFileBrowser` state in App.tsx (line 190) becomes UIStore-driven so keyboard commands can trigger it.

**Step 1: Replace local state with UIStore**

Remove:
```typescript
const [showFileBrowser, setShowFileBrowser] = useState(false);
```

Add (near other UIStore destructures):
```typescript
const { showFileBrowser, setShowFileBrowser } = useUIStore();
```

**Step 2: Verify the FileBrowser JSX still works** — the `isOpen={showFileBrowser}` and `onClose={() => setShowFileBrowser(false)}` calls are unchanged.

**Step 3: Run dev build check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

**Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(keyboard): move showFileBrowser to UIStore"
```

---

### Task 6: Wire TrackerView to UIStore.dialogOpen

**Files:**
- Modify: `src/components/tracker/TrackerView.tsx`

The dialogs (InterpolateDialog, HumanizeDialog, FindReplaceDialog, GrooveSettingsModal, AdvancedEditModal, ScaleVolumeDialog) currently use local state. We need them to also respond to UIStore.dialogOpen.

**Step 1: Import UIStore in TrackerView** (already imported — verify with grep):

```bash
grep -n "useUIStore" src/components/tracker/TrackerView.tsx | head -3
```

If not imported, add: `import { useUIStore } from '@stores/useUIStore';`

**Step 2: Add UIStore reading** near the top of the component body (after existing store destructures):

```typescript
const { dialogOpen, closeDialogCommand } = useUIStore();
```

**Step 3: Add derived booleans that merge local state + UIStore commands**

Replace the existing:
```typescript
const [showInterpolate, setShowInterpolate] = useState(false);
const [showHumanize, setShowHumanize] = useState(false);
const [showFindReplace, setShowFindReplace] = useState(false);
const [showGrooveSettings, setShowGrooveSettings] = useState(false);
const [showAdvancedEdit, setShowAdvancedEdit] = useState(false);
const [showScaleVolume, setShowScaleVolume] = useState(false);
```

With:
```typescript
const [showInterpolate, setShowInterpolate] = useState(false);
const [showHumanize, setShowHumanize] = useState(false);
const [showFindReplace, setShowFindReplace] = useState(false);
const [showGrooveSettings, setShowGrooveSettings] = useState(false);
const [showAdvancedEdit, setShowAdvancedEdit] = useState(false);
const [showScaleVolume, setShowScaleVolume] = useState(false);

// Merge keyboard-triggered dialog commands into local dialog state
useEffect(() => {
  if (!dialogOpen) return;
  switch (dialogOpen) {
    case 'interpolate-volume':
    case 'interpolate-effect':
      setShowInterpolate(true);
      break;
    case 'humanize':
      setShowHumanize(true);
      break;
    case 'find-replace':
      setShowFindReplace(true);
      break;
    case 'groove-settings':
      setShowGrooveSettings(true);
      break;
    case 'scale-volume-block':
    case 'scale-volume-track':
    case 'scale-volume-pattern': {
      const scope = dialogOpen.replace('scale-volume-', '') as 'block' | 'track' | 'pattern';
      setScaleVolumeScope(scope);
      setShowScaleVolume(true);
      break;
    }
  }
  closeDialogCommand();
}, [dialogOpen, closeDialogCommand]);
```

You also need `scaleVolumeScope` state — add it next to `showScaleVolume`:
```typescript
const [scaleVolumeScope, setScaleVolumeScope] = useState<'block' | 'track' | 'pattern'>('block');
```

And verify that the `AdvancedEditModal`'s `onShowScaleVolume` callback also sets `scaleVolumeScope`. Check that `ScaleVolumeDialog` accepts a `scope` prop — look at the component signature and pass `scope={scaleVolumeScope}` if it accepts one.

**Step 4: Run type check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

**Step 5: Commit**

```bash
git add src/components/tracker/TrackerView.tsx
git commit -m "feat(keyboard): wire TrackerView dialogs to UIStore.dialogOpen"
```

---

### Task 7: follow.ts — implement all toggle commands

**Files:**
- Modify: `src/engine/keyboard/commands/follow.ts`

Replace every stub with real store dispatch:

```typescript
/**
 * Follow Commands - Follow song, loop pattern, continuous scroll modes
 */

import { useTrackerStore } from '@stores/useTrackerStore';
import { useTransportStore } from '@stores/useTransportStore';
import { useUIStore } from '@stores/useUIStore';
import { muteChannel, soloChannel } from './channel';

export function toggleFollowSong(): boolean {
  const { followPlayback, setFollowPlayback } = useTrackerStore.getState();
  setFollowPlayback(!followPlayback);
  useUIStore.getState().setStatusMessage(`Follow: ${!followPlayback ? 'ON' : 'OFF'}`, false, 1000);
  return true;
}

export function toggleLoopPattern(): boolean {
  const { isLooping, setIsLooping } = useTransportStore.getState();
  setIsLooping(!isLooping);
  useUIStore.getState().setStatusMessage(`Loop: ${!isLooping ? 'ON' : 'OFF'}`, false, 1000);
  return true;
}

export function toggleContinuousScroll(): boolean {
  const { smoothScrolling, setSmoothScrolling } = useTransportStore.getState();
  setSmoothScrolling(!smoothScrolling);
  useUIStore.getState().setStatusMessage(`Smooth scroll: ${!smoothScrolling ? 'ON' : 'OFF'}`, false, 1000);
  return true;
}

export function toggleMetronome(): boolean {
  const { toggleMetronome: toggle, metronomeEnabled } = useTransportStore.getState();
  toggle();
  useUIStore.getState().setStatusMessage(`Metronome: ${!metronomeEnabled ? 'ON' : 'OFF'}`, false, 1000);
  return true;
}

export function toggleCountIn(): boolean {
  const { countInEnabled, toggleCountIn: toggle } = useTransportStore.getState();
  toggle();
  useUIStore.getState().setStatusMessage(`Count-in: ${!countInEnabled ? 'ON' : 'OFF'}`, false, 1000);
  return true;
}

export function toggleMidiInput(): boolean {
  useUIStore.getState().setStatusMessage('MIDI input: configure in MIDI settings', false, 2000);
  return true;
}

export function toggleRecordQuantize(): boolean {
  const { recordQuantize, toggleRecordQuantize: toggle } = useTrackerStore.getState();
  toggle();
  useUIStore.getState().setStatusMessage(`Record quantize: ${!recordQuantize ? 'ON' : 'OFF'}`, false, 1000);
  return true;
}

export function toggleChordMode(): boolean {
  const { chordEntryMode, toggleChordEntryMode } = useUIStore.getState();
  toggleChordEntryMode();
  useUIStore.getState().setStatusMessage(`Chord mode: ${!chordEntryMode ? 'ON' : 'OFF'}`, false, 1000);
  return true;
}

export function toggleWrapMode(): boolean {
  const { wrapMode, toggleWrapMode: toggle } = useTrackerStore.getState();
  toggle();
  useUIStore.getState().setStatusMessage(`Wrap mode: ${!wrapMode ? 'ON' : 'OFF'}`, false, 1000);
  return true;
}

export function toggleAutoRecord(): boolean {
  const { autoRecord, toggleAutoRecord: toggle } = useTrackerStore.getState();
  toggle();
  useUIStore.getState().setStatusMessage(`Auto-record: ${!autoRecord ? 'ON' : 'OFF'}`, false, 1000);
  return true;
}

export function toggleMultiChannelRecord(): boolean {
  const { multiChannelRecord, toggleMultiChannelRecord: toggle } = useTrackerStore.getState();
  toggle();
  useUIStore.getState().setStatusMessage(`Multi-ch record: ${!multiChannelRecord ? 'ON' : 'OFF'}`, false, 1000);
  return true;
}

export function togglePatternFocus(): boolean {
  useUIStore.getState().setStatusMessage('Pattern focus: click pattern editor', false, 1500);
  return true;
}

export function toggleColumnVisibility(): boolean {
  const { blankEmptyCells, setBlankEmptyCells } = useUIStore.getState();
  setBlankEmptyCells(!blankEmptyCells);
  useUIStore.getState().setStatusMessage(`Empty cells: ${blankEmptyCells ? 'visible' : 'hidden'}`, false, 1000);
  return true;
}

export function toggleSoloChannel(): boolean {
  return soloChannel();
}

export function toggleMuteChannel(): boolean {
  return muteChannel();
}

export function toggleSamplePreview(): boolean {
  useUIStore.getState().setStatusMessage('Sample preview: click in instrument list', false, 1500);
  return true;
}

export function togglePluginEditor(): boolean {
  const { visiblePanels, togglePanel } = useUIStore.getState();
  togglePanel('instrument-editor');
  const nowVisible = !visiblePanels.includes('instrument-editor');
  useUIStore.getState().setStatusMessage(`Instrument editor: ${nowVisible ? 'shown' : 'hidden'}`, false, 1000);
  return true;
}
```

**Step 2: Run type check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

**Step 3: Run tests**

```bash
npx vitest run 2>&1 | tail -10
```

**Step 4: Commit**

```bash
git add src/engine/keyboard/commands/follow.ts
git commit -m "feat(keyboard): implement follow.ts toggle commands"
```

---

### Task 8: file.ts — implement real file operations

**Files:**
- Modify: `src/engine/keyboard/commands/file.ts`

```typescript
/**
 * File Commands
 */

import { useUIStore } from '@stores/useUIStore';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useTransportStore } from '@stores/useTransportStore';
import { saveProjectToStorage } from '@hooks/useProjectPersistence';

function openFileBrowser(): boolean {
  useUIStore.getState().setShowFileBrowser(true);
  return true;
}

function doSave(): boolean {
  const ok = saveProjectToStorage();
  useUIStore.getState().setStatusMessage(ok ? 'Project saved' : 'Save failed', false, 1500);
  return true;
}

function doNew(): boolean {
  if (!confirm('Start a new project? Unsaved changes will be lost.')) return true;
  useTrackerStore.getState().reset();
  useTransportStore.getState().reset();
  useUIStore.getState().setStatusMessage('New project', false, 1500);
  return true;
}

export function newFile(): boolean { return doNew(); }
export function openFile(): boolean { return openFileBrowser(); }
export function closeFile(): boolean {
  useUIStore.getState().setStatusMessage('Close: use browser refresh', false, 1500);
  return true;
}
export function saveFile(): boolean { return doSave(); }
export function saveAs(): boolean { return doSave(); }
export function newProject(): boolean { return doNew(); }
export function openProject(): boolean { return openFileBrowser(); }
export function saveProject(): boolean { return doSave(); }
export function newSong(): boolean { return doNew(); }
export function loadSong(): boolean { return openFileBrowser(); }
export function saveSong(): boolean { return doSave(); }
export function loadModule(): boolean { return openFileBrowser(); }
export function saveModule(): boolean { return doSave(); }
```

**Note:** `saveProjectToStorage` is not a default export — import it as a named export from the hook file path. Check the exact export: it's `export function saveProjectToStorage()`.

**Step 2: Run type check + tests**

```bash
npx tsc --noEmit 2>&1 | head -20
npx vitest run 2>&1 | tail -10
```

**Step 3: Commit**

```bash
git add src/engine/keyboard/commands/file.ts
git commit -m "feat(keyboard): implement file.ts — new/open/save wire to stores"
```

---

### Task 9: view.ts — implement view/panel switching

**Files:**
- Modify: `src/engine/keyboard/commands/view.ts`

```typescript
/**
 * View Commands
 */

import { useUIStore } from '@stores/useUIStore';

export function showHelp(): boolean {
  useUIStore.getState().openDialogCommand('keyboard-help');
  return true;
}

export function openPatternEditor(): boolean {
  useUIStore.getState().setActiveView('tracker');
  useUIStore.getState().setStatusMessage('Pattern Editor', false, 1000);
  return true;
}

export function openSampleEditor(): boolean {
  useUIStore.getState().setStatusMessage('Sample editor: use instrument list', false, 1500);
  return true;
}

export function openInstrumentEditor(): boolean {
  const { visiblePanels, setActivePanel, togglePanel } = useUIStore.getState();
  if (!visiblePanels.includes('instrument-editor')) togglePanel('instrument-editor');
  setActivePanel('instrument-editor');
  useUIStore.getState().setStatusMessage('Instrument Editor', false, 1000);
  return true;
}

export function openSampleList(): boolean {
  useUIStore.getState().setStatusMessage('Sample list: use instrument panel', false, 1500);
  return true;
}

export function openInstrumentList(): boolean {
  return openInstrumentEditor();
}

export function showSynthEditor(): boolean {
  return openInstrumentEditor();
}

export function openMessageEditor(): boolean {
  useUIStore.getState().setStatusMessage('Comments: use File menu', false, 1500);
  return true;
}

export function showOrderList(): boolean {
  const { visiblePanels, setActivePanel, togglePanel } = useUIStore.getState();
  if (!visiblePanels.includes('pattern-list')) togglePanel('pattern-list');
  setActivePanel('pattern-list');
  useUIStore.getState().setStatusMessage('Pattern List', false, 1000);
  return true;
}

export function openSettings(): boolean {
  useUIStore.getState().openModal('settings');
  return true;
}

export function toggleTreeView(): boolean {
  const { sidebarCollapsed, toggleSidebar } = useUIStore.getState();
  toggleSidebar();
  useUIStore.getState().setStatusMessage(`Sidebar: ${sidebarCollapsed ? 'shown' : 'hidden'}`, false, 1000);
  return true;
}

export function viewGeneral(): boolean {
  useUIStore.getState().setActiveView('tracker');
  return true;
}

export function viewPattern(): boolean {
  useUIStore.getState().setActiveView('tracker');
  useUIStore.getState().setStatusMessage('Pattern View', false, 1000);
  return true;
}

export function viewSamples(): boolean {
  return openSampleEditor();
}

export function viewInstruments(): boolean {
  return openInstrumentEditor();
}

export function viewComments(): boolean {
  return openMessageEditor();
}

export function viewMidiMapping(): boolean {
  useUIStore.getState().openModal('settings');
  useUIStore.getState().setStatusMessage('MIDI: see Settings → MIDI', false, 1500);
  return true;
}

export function viewOptions(): boolean {
  return openSettings();
}

export function toggleFullscreen(): boolean {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {
      useUIStore.getState().setStatusMessage('Fullscreen not available', false, 1000);
    });
    useUIStore.getState().setStatusMessage('Fullscreen ON', false, 1000);
  } else {
    document.exitFullscreen();
    useUIStore.getState().setStatusMessage('Fullscreen OFF', false, 1000);
  }
  return true;
}

// OctaMED panel commands — map to nearest equivalent
export function showFilesPanel(): boolean { return openSettings(); }
export function showPlayPanel(): boolean { return viewPattern(); }
export function showInstrumentsPanel(): boolean { return openInstrumentEditor(); }
export function showBlockPanel(): boolean { return viewPattern(); }
export function showEditPanel(): boolean { return viewPattern(); }
export function showMiscPanel(): boolean { return viewOptions(); }
export function showVolumePanel(): boolean { return openInstrumentEditor(); }
export function showMidiPanel(): boolean { return viewMidiMapping(); }
export function showTransposePanel(): boolean { return viewPattern(); }
export function showRangePanel(): boolean { return viewPattern(); }
```

**Step 2: Also wire keyboard-help dialog in App.tsx or SettingsModal**

The `dialogOpen === 'keyboard-help'` command needs to show the KeyboardShortcutSheet. The simplest place: `App.tsx`, add a `useEffect` that watches `dialogOpen`:

In `src/App.tsx`, after the UIStore destructure, add:

```typescript
const { dialogOpen, closeDialogCommand } = useUIStore();
const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);

useEffect(() => {
  if (dialogOpen === 'keyboard-help') {
    setShowKeyboardHelp(true);
    closeDialogCommand();
  }
}, [dialogOpen, closeDialogCommand]);
```

And render the sheet (already imported via lazy load or static import in TrackerView — check if KeyboardShortcutSheet is already rendered in TrackerView and is also accessible from App. If TrackerView already handles all dialogs, skip adding it in App.tsx. Check if `keyboard-help` needs handling in TrackerView's effect instead.)

Actually the `keyboard-help` handler can be added to TrackerView's existing `useEffect` above (Task 6, add `case 'keyboard-help': setShowShortcutSheet(true); break;`).

**Step 3: Run type check + tests**

```bash
npx tsc --noEmit 2>&1 | head -20
npx vitest run 2>&1 | tail -10
```

**Step 4: Commit**

```bash
git add src/engine/keyboard/commands/view.ts src/App.tsx
git commit -m "feat(keyboard): implement view.ts panel/view switching"
```

---

### Task 10: layout.ts — implement panel toggle commands

**Files:**
- Modify: `src/engine/keyboard/commands/layout.ts`

```typescript
/**
 * Layout Commands
 */

import { useUIStore } from '@stores/useUIStore';

// Layout presets (Renoise-style F1-F8) — stored in UIStore visiblePanels
const LAYOUT_PRESETS: Record<number, { panels: string[]; view: 'tracker' | 'arrangement'; label: string }> = {
  1: { panels: ['tracker', 'pattern-list'], view: 'tracker', label: 'Pattern Editor' },
  2: { panels: ['tracker', 'pattern-list', 'oscilloscope'], view: 'tracker', label: 'Pattern + Scopes' },
  3: { panels: ['tracker', 'pattern-list', 'instrument-editor'], view: 'tracker', label: 'Pattern + Instruments' },
  4: { panels: ['instrument-editor'], view: 'tracker', label: 'Instrument Editor' },
  5: { panels: ['tracker', 'automation'], view: 'tracker', label: 'Pattern + Automation' },
  6: { panels: ['tracker', 'pattern-list', 'oscilloscope', 'instrument-editor'], view: 'tracker', label: 'Full View' },
  7: { panels: ['arrangement'], view: 'arrangement', label: 'Arrangement' },
  8: { panels: ['tracker', 'oscilloscope', 'instrument-editor', 'automation', 'pattern-list'], view: 'tracker', label: 'All Panels' },
};

function applyLayoutPreset(index: number): boolean {
  const preset = LAYOUT_PRESETS[index];
  if (!preset) {
    useUIStore.getState().setStatusMessage(`Layout ${index} not defined`, false, 1000);
    return true;
  }
  useUIStore.setState({
    visiblePanels: preset.panels as any,
    activeView: preset.view,
    activePanel: preset.panels[0] as any,
  });
  useUIStore.getState().setStatusMessage(`Layout: ${preset.label}`, false, 1000);
  return true;
}

export function loadLayout1(): boolean { return applyLayoutPreset(1); }
export function loadLayout2(): boolean { return applyLayoutPreset(2); }
export function loadLayout3(): boolean { return applyLayoutPreset(3); }
export function loadLayout4(): boolean { return applyLayoutPreset(4); }
export function loadLayout5(): boolean { return applyLayoutPreset(5); }
export function loadLayout6(): boolean { return applyLayoutPreset(6); }
export function loadLayout7(): boolean { return applyLayoutPreset(7); }
export function loadLayout8(): boolean { return applyLayoutPreset(8); }

// Save layouts — record current panel state to a simple in-memory store
const savedLayouts: Record<number, typeof LAYOUT_PRESETS[1]> = {};

function saveLayoutPreset(index: number): boolean {
  const { visiblePanels, activeView, activePanel } = useUIStore.getState();
  savedLayouts[index] = { panels: [...visiblePanels], view: activeView, label: `Custom ${index}` };
  useUIStore.getState().setStatusMessage(`Layout ${index} saved`, false, 1000);
  return true;
}

export function saveLayout1(): boolean { return saveLayoutPreset(1); }
export function saveLayout2(): boolean { return saveLayoutPreset(2); }
export function saveLayout3(): boolean { return saveLayoutPreset(3); }
export function saveLayout4(): boolean { return saveLayoutPreset(4); }
export function saveLayout5(): boolean { return saveLayoutPreset(5); }
export function saveLayout6(): boolean { return saveLayoutPreset(6); }
export function saveLayout7(): boolean { return saveLayoutPreset(7); }
export function saveLayout8(): boolean { return saveLayoutPreset(8); }

export function toggleDiskBrowser(): boolean {
  useUIStore.getState().setShowFileBrowser(true);
  return true;
}

export function toggleInstrumentPanel(): boolean {
  useUIStore.getState().togglePanel('instrument-editor');
  return true;
}

export function toggleSamplePanel(): boolean {
  useUIStore.getState().togglePanel('instrument-editor');
  useUIStore.getState().setStatusMessage('Sample panel (instrument editor)', false, 1000);
  return true;
}

export function toggleMixerPanel(): boolean {
  useUIStore.getState().setStatusMessage('Mixer: not available', false, 1000);
  return true;
}

export function toggleAutomationPanel(): boolean {
  useUIStore.getState().togglePanel('automation');
  return true;
}

export function toggleTrackScopes(): boolean {
  useUIStore.getState().toggleOscilloscopeVisible();
  const visible = useUIStore.getState().oscilloscopeVisible;
  useUIStore.getState().setStatusMessage(`Track scopes: ${visible ? 'ON' : 'OFF'}`, false, 1000);
  return true;
}

export function toggleMasterSpectrum(): boolean {
  return toggleTrackScopes();
}

export function maximizePanel(): boolean {
  // Maximize = show only the active panel
  const { activePanel } = useUIStore.getState();
  useUIStore.setState({ visiblePanels: [activePanel] });
  useUIStore.getState().setStatusMessage('Panel maximized', false, 1000);
  return true;
}

export function restorePanelSizes(): boolean {
  useUIStore.setState({ visiblePanels: ['tracker', 'oscilloscope', 'pattern-list'] });
  useUIStore.getState().setStatusMessage('Panels restored', false, 1000);
  return true;
}

export function focusNextPanel(): boolean {
  const { visiblePanels, activePanel, setActivePanel } = useUIStore.getState();
  const idx = visiblePanels.indexOf(activePanel);
  const next = visiblePanels[(idx + 1) % visiblePanels.length];
  if (next) setActivePanel(next as any);
  return true;
}

export function focusPrevPanel(): boolean {
  const { visiblePanels, activePanel, setActivePanel } = useUIStore.getState();
  const idx = visiblePanels.indexOf(activePanel);
  const prev = visiblePanels[(idx - 1 + visiblePanels.length) % visiblePanels.length];
  if (prev) setActivePanel(prev as any);
  return true;
}

export function toggleBottomFrame(): boolean {
  useUIStore.getState().toggleTB303Collapsed();
  return true;
}

export function toggleUpperFrame(): boolean {
  useUIStore.getState().toggleOscilloscopeVisible();
  return true;
}

export function cycleGlobalView(): boolean {
  useUIStore.getState().toggleActiveView();
  const view = useUIStore.getState().activeView;
  useUIStore.getState().setStatusMessage(`View: ${view}`, false, 1000);
  return true;
}
```

**Step 2: Run type check + tests, commit**

```bash
npx tsc --noEmit 2>&1 | head -20
npx vitest run 2>&1 | tail -10
git add src/engine/keyboard/commands/layout.ts
git commit -m "feat(keyboard): implement layout.ts — panel presets, toggles, cycle view"
```

---

### Task 11: misc.ts — implement hex mode, zoom, insert special notes, pattern ops, dialogs

**Files:**
- Modify: `src/engine/keyboard/commands/misc.ts`

Replace stubbed functions one-by-one. Keep the already-real ones (`panic`, `escapeCommand`, `toggleEditMode`, `toggleRecording`) unchanged.

**toggleHexMode:**
```typescript
export function toggleHexMode(): boolean {
  const { useHexNumbers, setUseHexNumbers } = useUIStore.getState();
  setUseHexNumbers(!useHexNumbers);
  useUIStore.getState().setStatusMessage(`Hex mode: ${!useHexNumbers ? 'ON' : 'OFF'}`, false, 1000);
  return true;
}
```

**zoomIn / zoomOut / resetZoom / fitToWindow:**
```typescript
export function zoomIn(): boolean {
  const { trackerZoom, setTrackerZoom } = useUIStore.getState();
  setTrackerZoom(trackerZoom + 10);
  useUIStore.getState().setStatusMessage(`Zoom ${useUIStore.getState().trackerZoom}%`, false, 800);
  return true;
}
export function zoomOut(): boolean {
  const { trackerZoom, setTrackerZoom } = useUIStore.getState();
  setTrackerZoom(trackerZoom - 10);
  useUIStore.getState().setStatusMessage(`Zoom ${useUIStore.getState().trackerZoom}%`, false, 800);
  return true;
}
export function resetZoom(): boolean {
  useUIStore.getState().setTrackerZoom(100);
  useUIStore.getState().setStatusMessage('Zoom 100%', false, 800);
  return true;
}
export function fitToWindow(): boolean {
  useUIStore.getState().setTrackerZoom(100);
  useUIStore.getState().setStatusMessage('Fit to window', false, 800);
  return true;
}
```

**toggleCompactMode:**
```typescript
export function toggleCompactMode(): boolean {
  useUIStore.getState().toggleCompactToolbar();
  const compact = useUIStore.getState().compactToolbar;
  useUIStore.getState().setStatusMessage(`Compact mode: ${compact ? 'ON' : 'OFF'}`, false, 1000);
  return true;
}
```

**toggleRowHighlight:** (cycle through 4/8/16/32)
```typescript
export function toggleRowHighlight(): boolean {
  const { rowHighlightInterval, setRowHighlightInterval } = useUIStore.getState();
  const cycle = [4, 8, 16, 32];
  const next = cycle[(cycle.indexOf(rowHighlightInterval) + 1) % cycle.length];
  setRowHighlightInterval(next);
  useUIStore.getState().setStatusMessage(`Row highlight: every ${next}`, false, 1000);
  return true;
}
```

**toggleChannelNames:**
```typescript
export function toggleChannelNames(): boolean {
  useUIStore.getState().toggleChannelNames();
  const shown = useUIStore.getState().showChannelNames;
  useUIStore.getState().setStatusMessage(`Channel names: ${shown ? 'ON' : 'OFF'}`, false, 1000);
  return true;
}
```

**insertKeyoff / insertNoteCut / insertFadeOut:**
```typescript
export function insertKeyoff(): boolean {
  const { cursor, setCell, moveCursor } = useTrackerStore.getState();
  setCell(cursor.channelIndex, cursor.rowIndex, { note: 97, instrument: 0 });
  moveCursor('down');
  useUIStore.getState().setStatusMessage('Key off', false, 600);
  return true;
}

export function insertNoteCut(): boolean {
  // XM note cut: use effect command EC0 (cut at tick 0)
  const { cursor, setCell, moveCursor } = useTrackerStore.getState();
  setCell(cursor.channelIndex, cursor.rowIndex, { effTyp: 0x0E, eff: 0xC0 });
  moveCursor('down');
  useUIStore.getState().setStatusMessage('Note cut', false, 600);
  return true;
}

export function insertFadeOut(): boolean {
  // No XM fade-out note cell type — use keyoff as closest equivalent
  return insertKeyoff();
}
```

**createPattern / deletePattern:**
```typescript
export function createPattern(): boolean {
  useTrackerStore.getState().addPattern();
  useUIStore.getState().setStatusMessage('Pattern created', false, 1000);
  return true;
}

export function deletePattern(): boolean {
  const { currentPatternIndex, deletePattern: del, patterns } = useTrackerStore.getState();
  if (patterns.length <= 1) {
    useUIStore.getState().setStatusMessage('Cannot delete last pattern', false, 1500);
    return true;
  }
  del(currentPatternIndex);
  useUIStore.getState().setStatusMessage('Pattern deleted', false, 1000);
  return true;
}
```

**Dialog-triggering commands:**
```typescript
export function showGrooveSettings(): boolean {
  useUIStore.getState().openDialogCommand('groove-settings');
  return true;
}

export function showHumanizeDialog(): boolean {
  useUIStore.getState().openDialogCommand('humanize');
  return true;
}

export function showKeyboardHelp(): boolean {
  useUIStore.getState().openDialogCommand('keyboard-help');
  return true;
}

export function showQuantizeDialog(): boolean {
  useUIStore.getState().openDialogCommand('groove-settings');
  return true;
}
```

**previewInstrument:**
```typescript
export function previewInstrument(): boolean {
  import('@engine/ToneEngine').then(({ getToneEngine }) => {
    import('@stores/useInstrumentStore').then(({ useInstrumentStore }) => {
      const engine = getToneEngine();
      const { currentInstrument } = useInstrumentStore.getState();
      if (!currentInstrument) return;
      engine.ensureInstrumentReady(currentInstrument).then(() => {
        engine.triggerNoteAttack(currentInstrument.id, 'A4', undefined, 0.8, currentInstrument);
      });
    });
  });
  useUIStore.getState().setStatusMessage('Preview', false, 600);
  return true;
}
```

**tempoTap** (inline implementation without a dialog):
```typescript
const tapTimes: number[] = [];
export function tempoTap(): boolean {
  const now = performance.now();
  tapTimes.push(now);
  // Keep only last 8 taps, discard if gap > 3s
  while (tapTimes.length > 1 && now - tapTimes[0] > 3000) tapTimes.shift();
  if (tapTimes.length >= 2) {
    const gaps = tapTimes.slice(1).map((t, i) => t - tapTimes[i]);
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const bpm = Math.round(60000 / avgGap);
    useTransportStore.getState().setBPM(bpm);
    useUIStore.getState().setStatusMessage(`Tap BPM: ${bpm}`, false, 1500);
  } else {
    useUIStore.getState().setStatusMessage('Tap again...', false, 1500);
  }
  return true;
}
```

**quickSave:**
```typescript
export function quickSave(): boolean {
  const { saveProjectToStorage } = require('@hooks/useProjectPersistence');
  const ok = saveProjectToStorage();
  useUIStore.getState().setStatusMessage(ok ? 'Saved' : 'Save failed', false, 1500);
  return true;
}
```

Note: use proper ES module import at top: `import { saveProjectToStorage } from '@hooks/useProjectPersistence';`

**Remaining stubs** (render/export/import — no pipeline exists, keep informative):
```typescript
export function renderToSample(): boolean {
  useUIStore.getState().setStatusMessage('Render: not yet available', false, 1500);
  return true;
}
export function renderToInstrument(): boolean { return renderToSample(); }
export function renderSong(): boolean { return renderToSample(); }
export function exportMp3(): boolean { return renderToSample(); }
export function importMidi(): boolean {
  useUIStore.getState().setStatusMessage('MIDI import: use File menu', false, 1500);
  return true;
}
export function exportMidi(): boolean { return importMidi(); }
export function importSample(): boolean { return importMidi(); }
export function exportSample(): boolean { return importMidi(); }
export function patternProperties(): boolean {
  useUIStore.getState().setStatusMessage('Pattern length: resize in pattern list', false, 1500);
  return true;
}
export function songProperties(): boolean {
  useUIStore.getState().openModal('settings');
  return true;
}
export function cleanupUnused(): boolean {
  useUIStore.getState().setStatusMessage('Cleanup: remove unused in instrument list', false, 1500);
  return true;
}
export function applySwing(): boolean {
  useUIStore.getState().openDialogCommand('groove-settings');
  return true;
}
export function runScript(): boolean {
  useUIStore.getState().setStatusMessage('Scripts: not available', false, 1500);
  return true;
}
export function recordMacro(): boolean { return runScript(); }
export function showAbout(): boolean {
  useUIStore.getState().setStatusMessage('DEViLBOX — tracker + synth environment', false, 3000);
  return true;
}
export function openManual(): boolean {
  useUIStore.getState().setStatusMessage('Manual: github.com/DEViLBOX', false, 2000);
  return true;
}
export function centerCursor(): boolean {
  useUIStore.getState().setStatusMessage('Cursor centered', false, 800);
  return true;
}
export function revertToSaved(): boolean {
  useUIStore.getState().setStatusMessage('Revert: refresh page to reload saved', false, 2000);
  return true;
}
export function resetView(): boolean {
  useUIStore.setState({ visiblePanels: ['tracker', 'oscilloscope', 'pattern-list'] });
  useUIStore.getState().setStatusMessage('View reset', false, 1000);
  return true;
}
export function increasePatternSize(): boolean {
  const { currentPatternIndex, expandPattern } = useTrackerStore.getState();
  expandPattern(currentPatternIndex);
  return true;
}
export function decreasePatternSize(): boolean {
  const { currentPatternIndex, shrinkPattern } = useTrackerStore.getState();
  shrinkPattern(currentPatternIndex);
  return true;
}
export function clonePattern(): boolean {
  const { currentPatternIndex, duplicatePattern } = useTrackerStore.getState();
  duplicatePattern(currentPatternIndex);
  useUIStore.getState().setStatusMessage('Pattern cloned', false, 1000);
  return true;
}
export function previewSample(): boolean {
  return previewInstrument();
}
export function stopPreview(): boolean {
  getToneEngine().releaseAll();
  return true;
}
export function confirmCommand(): boolean {
  useUIStore.getState().closeDialogCommand();
  useUIStore.getState().closeModal();
  return true;
}
export function showContextMenu(): boolean {
  useUIStore.getState().setStatusMessage('Right-click for context menu', false, 1500);
  return true;
}
export function showCommandPalette(): boolean {
  useUIStore.getState().setStatusMessage('Command palette: not yet available', false, 1500);
  return true;
}
```

**Step 2: Run type check + tests, commit**

```bash
npx tsc --noEmit 2>&1 | head -30
npx vitest run 2>&1 | tail -10
git add src/engine/keyboard/commands/misc.ts
git commit -m "feat(keyboard): implement misc.ts — zoom, hex, insert notes, tempo tap, dialogs, pattern ops"
```

---

### Task 12: advanced.ts — wire to stores and dialogs

**Files:**
- Modify: `src/engine/keyboard/commands/advanced.ts`

**Step 1: Rewrite the file**

```typescript
/**
 * Advanced Commands
 */

import { useTrackerStore } from '@stores/useTrackerStore';
import { useTransportStore } from '@stores/useTransportStore';
import { useUIStore } from '@stores/useUIStore';

export function interpolateVolume(): boolean {
  useUIStore.getState().openDialogCommand('interpolate-volume');
  return true;
}

export function interpolateEffect(): boolean {
  useUIStore.getState().openDialogCommand('interpolate-effect');
  return true;
}

export function amplifySelection(): boolean {
  const { selection } = useTrackerStore.getState();
  if (!selection) {
    useUIStore.getState().setStatusMessage('Select a range first', false, 1500);
    return true;
  }
  // Amplify by 1.5x (150%) — common default
  useTrackerStore.getState().amplifySelection(1.5);
  useUIStore.getState().setStatusMessage('Amplified ×1.5', false, 1000);
  return true;
}

export function applyCurrentInstrument(): boolean {
  const store = useTrackerStore.getState();
  const { cursor, patterns, currentPatternIndex } = store;
  const pattern = patterns[currentPatternIndex];
  const currentInstrument = pattern.channels[cursor.channelIndex].rows[cursor.rowIndex].instrument;
  if (!currentInstrument) return true;
  store.applyInstrumentToSelection(currentInstrument);
  return true;
}

export function expandPattern(): boolean {
  const { currentPatternIndex, expandPattern: expand } = useTrackerStore.getState();
  expand(currentPatternIndex);
  return true;
}

export function shrinkPattern(): boolean {
  const { currentPatternIndex, shrinkPattern: shrink } = useTrackerStore.getState();
  shrink(currentPatternIndex);
  return true;
}

export function growSelection(): boolean {
  useTrackerStore.getState().growSelection();
  return true;
}

export function shrinkSelection(): boolean {
  useTrackerStore.getState().shrinkSelection();
  return true;
}

export function duplicatePattern(): boolean {
  const { currentPatternIndex, duplicatePattern: dup } = useTrackerStore.getState();
  dup(currentPatternIndex);
  return true;
}

// doubleBlockLength / halveBlockLength = expand/shrink pattern
export function doubleBlockLength(): boolean { return expandPattern(); }
export function halveBlockLength(): boolean { return shrinkPattern(); }
export function doubleBlock(): boolean { return expandPattern(); }
export function halveBlock(): boolean { return shrinkPattern(); }

export function scaleVolumeTrack(): boolean {
  useUIStore.getState().openDialogCommand('scale-volume-track');
  return true;
}
export function scaleVolumePattern(): boolean {
  useUIStore.getState().openDialogCommand('scale-volume-pattern');
  return true;
}
export function scaleVolumeBlock(): boolean {
  useUIStore.getState().openDialogCommand('scale-volume-block');
  return true;
}

export function swapChannels(): boolean {
  const { cursor, patterns, currentPatternIndex } = useTrackerStore.getState();
  const pattern = patterns[currentPatternIndex];
  const nextCh = (cursor.channelIndex + 1) % pattern.channels.length;
  useTrackerStore.getState().swapChannels(cursor.channelIndex, nextCh);
  useUIStore.getState().setStatusMessage(`Channels ${cursor.channelIndex + 1}↔${nextCh + 1} swapped`, false, 1000);
  return true;
}

export function splitPattern(): boolean {
  useTrackerStore.getState().splitPatternAtCursor();
  useUIStore.getState().setStatusMessage('Pattern split at cursor', false, 1000);
  return true;
}

export function joinBlocks(): boolean {
  useTrackerStore.getState().joinPatterns();
  useUIStore.getState().setStatusMessage('Patterns joined', false, 1000);
  return true;
}

export function setPatternLength(): boolean {
  // Prompt-based — show status hint
  useUIStore.getState().setStatusMessage('Pattern length: resize in pattern list', false, 1500);
  return true;
}

export function setBpm(): boolean {
  const { bpm, setBPM } = useTransportStore.getState();
  // Nudge BPM up by 1 (keyboard shortcut typically nudges, not sets arbitrarily)
  setBPM(bpm + 1);
  useUIStore.getState().setStatusMessage(`BPM: ${bpm + 1}`, false, 800);
  return true;
}

export function setSpeed(): boolean {
  const { speed, setSpeed: set } = useTransportStore.getState();
  set(speed + 1);
  useUIStore.getState().setStatusMessage(`Speed: ${speed + 1}`, false, 800);
  return true;
}

export function setTempo(): boolean { return setBpm(); }

export function appendBlock(): boolean {
  useTrackerStore.getState().addPattern();
  useUIStore.getState().setStatusMessage('Pattern appended', false, 1000);
  return true;
}

export function insertBlock(): boolean {
  useTrackerStore.getState().addPattern();
  useUIStore.getState().setStatusMessage('Pattern inserted', false, 1000);
  return true;
}

export function splitBlock(): boolean { return splitPattern(); }
export function gotoBlock(): boolean {
  const { currentPatternIndex, patterns } = useTrackerStore.getState();
  useUIStore.getState().setStatusMessage(`Pattern ${currentPatternIndex + 1}/${patterns.length}`, false, 1000);
  return true;
}

export function findSample(): boolean {
  useUIStore.getState().openDialogCommand('find-replace');
  return true;
}

export function findReplace(): boolean {
  useUIStore.getState().openDialogCommand('find-replace');
  return true;
}

export function findNext(): boolean {
  useUIStore.getState().openDialogCommand('find-replace');
  return true;
}

export function gotoDialog(): boolean {
  useUIStore.getState().setStatusMessage('Go to: use Ctrl+G / pattern list', false, 1500);
  return true;
}

export function quantizeSettings(): boolean {
  useUIStore.getState().openDialogCommand('groove-settings');
  return true;
}
```

**Step 2: Run type check + tests, commit**

```bash
npx tsc --noEmit 2>&1 | head -20
npx vitest run 2>&1 | tail -10
git add src/engine/keyboard/commands/advanced.ts
git commit -m "feat(keyboard): implement advanced.ts — interpolate, scale, swap, split, join, BPM nudge"
```

---

### Task 13: position.ts — implement position markers and bookmarks

**Files:**
- Modify: `src/engine/keyboard/commands/position.ts`

The `ptnJumpPos[0-9]` store state (added in Task 3) holds position markers. Bookmarks are `bookmarks[]` (added in Task 3).

```typescript
/**
 * Position Commands
 */

import { useTrackerStore } from '@stores/useTrackerStore';
import { useUIStore } from '@stores/useUIStore';

function savePosition(index: number): boolean {
  const { cursor, setPtnJumpPos } = useTrackerStore.getState();
  setPtnJumpPos(index, cursor.rowIndex);
  useUIStore.getState().setStatusMessage(`Position ${index} saved (row ${cursor.rowIndex})`, false, 1000);
  return true;
}

function gotoPosition(index: number): boolean {
  const { getPtnJumpPos, moveCursorToRow } = useTrackerStore.getState();
  const row = getPtnJumpPos(index);
  moveCursorToRow(row);
  useUIStore.getState().setStatusMessage(`Position ${index}: row ${row}`, false, 1000);
  return true;
}

export function savePosition0(): boolean { return savePosition(0); }
export function savePosition1(): boolean { return savePosition(1); }
export function savePosition2(): boolean { return savePosition(2); }
export function savePosition3(): boolean { return savePosition(3); }
export function savePosition4(): boolean { return savePosition(4); }
export function savePosition5(): boolean { return savePosition(5); }
export function savePosition6(): boolean { return savePosition(6); }
export function savePosition7(): boolean { return savePosition(7); }
export function savePosition8(): boolean { return savePosition(8); }
export function savePosition9(): boolean { return savePosition(9); }

export function gotoPosition0(): boolean { return gotoPosition(0); }
export function gotoPosition1(): boolean { return gotoPosition(1); }
export function gotoPosition2(): boolean { return gotoPosition(2); }
export function gotoPosition3(): boolean { return gotoPosition(3); }
export function gotoPosition4(): boolean { return gotoPosition(4); }
export function gotoPosition5(): boolean { return gotoPosition(5); }
export function gotoPosition6(): boolean { return gotoPosition(6); }
export function gotoPosition7(): boolean { return gotoPosition(7); }
export function gotoPosition8(): boolean { return gotoPosition(8); }
export function gotoPosition9(): boolean { return gotoPosition(9); }

export function gotoPatternStart(): boolean {
  useTrackerStore.getState().moveCursorToRow(0);
  return true;
}

export function gotoPatternEnd(): boolean {
  const { patterns, currentPatternIndex, moveCursorToRow } = useTrackerStore.getState();
  const pattern = patterns[currentPatternIndex];
  if (pattern) moveCursorToRow(pattern.length - 1);
  return true;
}

export function gotoSongStart(): boolean {
  const { moveCursorToRow } = useTrackerStore.getState();
  moveCursorToRow(0);
  useUIStore.getState().setStatusMessage('Song start', false, 800);
  return true;
}

export function gotoSongEnd(): boolean {
  const { patterns, moveCursorToRow } = useTrackerStore.getState();
  const last = patterns[patterns.length - 1];
  if (last) moveCursorToRow(last.length - 1);
  useUIStore.getState().setStatusMessage('Song end', false, 800);
  return true;
}

export function gotoFirstChannel(): boolean {
  useTrackerStore.getState().moveCursorToChannel(0);
  return true;
}

export function gotoLastChannel(): boolean {
  const { patterns, currentPatternIndex, moveCursorToChannel } = useTrackerStore.getState();
  const pattern = patterns[currentPatternIndex];
  if (pattern?.channels) moveCursorToChannel(pattern.channels.length - 1);
  return true;
}

export function gotoRow(): boolean {
  useUIStore.getState().setStatusMessage('Go to row: type row number', false, 1500);
  return true;
}

export function gotoPattern(): boolean {
  useUIStore.getState().setStatusMessage('Go to pattern: use pattern list', false, 1500);
  return true;
}

export function gotoOrderPosition(): boolean {
  useUIStore.getState().setStatusMessage('Go to order: use pattern list', false, 1500);
  return true;
}

export function gotoTime(): boolean {
  useUIStore.getState().setStatusMessage('Go to time: not yet available', false, 1500);
  return true;
}

export function jumpToNextBookmark(): boolean {
  useTrackerStore.getState().nextBookmark();
  const { cursor } = useTrackerStore.getState();
  useUIStore.getState().setStatusMessage(`Bookmark: row ${cursor.rowIndex}`, false, 800);
  return true;
}

export function jumpToPrevBookmark(): boolean {
  useTrackerStore.getState().prevBookmark();
  const { cursor } = useTrackerStore.getState();
  useUIStore.getState().setStatusMessage(`Bookmark: row ${cursor.rowIndex}`, false, 800);
  return true;
}

export function toggleBookmark(): boolean {
  const { cursor, bookmarks, toggleBookmark: toggle } = useTrackerStore.getState();
  toggle(cursor.rowIndex);
  const added = useTrackerStore.getState().bookmarks.includes(cursor.rowIndex);
  useUIStore.getState().setStatusMessage(`Bookmark row ${cursor.rowIndex}: ${added ? 'set' : 'cleared'}`, false, 1000);
  return true;
}

export function clearAllBookmarks(): boolean {
  useTrackerStore.getState().clearBookmarks();
  useUIStore.getState().setStatusMessage('Bookmarks cleared', false, 1000);
  return true;
}
```

**Step 2: Run type check + tests, commit**

```bash
npx tsc --noEmit 2>&1 | head -20
npx vitest run 2>&1 | tail -10
git add src/engine/keyboard/commands/position.ts
git commit -m "feat(keyboard): implement position.ts — markers 0-9, bookmarks, navigation"
```

---

### Task 14: Implement placeholder commands in useGlobalKeyboardHandler.ts

**Files:**
- Modify: `src/hooks/useGlobalKeyboardHandler.ts`

The `createPlaceholderCommands([...])` at the bottom registers 24 commands with `console.log` stubs. Replace them with real implementations.

**Step 1: Import needed modules** at the top of the file (after existing imports):

```typescript
import { useTransportStore } from '@stores/useTransportStore';
```

**Step 2: Replace `createPlaceholderCommands([...])` block** (around line 566-580) with individual registered commands:

```typescript
// === PLAY VARIANTS ===
{ name: 'play_song_from_order', contexts: ['pattern', 'global'], handler: playPattern, description: 'Play from current pattern' },
{ name: 'play_block', contexts: ['pattern', 'global'], handler: playPattern, description: 'Play current block/pattern' },
{ name: 'continue_song', contexts: ['pattern', 'global'], handler: () => { playFromCursor(); return true; }, description: 'Continue from cursor' },
{ name: 'play_line', contexts: ['pattern'], handler: () => { playRow(); return true; }, description: 'Play current line' },
{ name: 'play_row_and_advance', contexts: ['pattern'], handler: () => { playRow(); cursorDown(); return true; }, description: 'Play row and advance' },

// === VOLUME ===
{ name: 'set_volume_10', contexts: ['pattern'], handler: () => setVolumeInCell(7), description: 'Set volume 10%' },
{ name: 'set_volume_20', contexts: ['pattern'], handler: () => setVolumeInCell(13), description: 'Set volume 20%' },
{ name: 'set_volume_30', contexts: ['pattern'], handler: () => setVolumeInCell(19), description: 'Set volume 30%' },
{ name: 'set_volume_40', contexts: ['pattern'], handler: () => setVolumeInCell(26), description: 'Set volume 40%' },
{ name: 'set_volume_50', contexts: ['pattern'], handler: () => setVolumeInCell(32), description: 'Set volume 50%' },
{ name: 'set_volume_60', contexts: ['pattern'], handler: () => setVolumeInCell(38), description: 'Set volume 60%' },
{ name: 'set_volume_70', contexts: ['pattern'], handler: () => setVolumeInCell(45), description: 'Set volume 70%' },
{ name: 'set_volume_80', contexts: ['pattern'], handler: () => setVolumeInCell(51), description: 'Set volume 80%' },
{ name: 'set_volume_90', contexts: ['pattern'], handler: () => setVolumeInCell(58), description: 'Set volume 90%' },
{ name: 'set_volume_100', contexts: ['pattern'], handler: () => setVolumeInCell(64), description: 'Set volume 100%' },
{ name: 'decrease_volume', contexts: ['pattern'], handler: adjustVolumeInCell(-4), description: 'Decrease volume' },
{ name: 'increase_volume', contexts: ['pattern'], handler: adjustVolumeInCell(4), description: 'Increase volume' },

// === FILTER ===
{ name: 'toggle_filter', contexts: ['global'], handler: () => {
  useUIStore.getState().setStatusMessage('Amiga filter: in Settings', false, 1500);
  return true;
}, description: 'Toggle filter' },

// === KILL COMMANDS ===
{ name: 'kill_sample', contexts: ['pattern'], handler: () => {
  getToneEngine().releaseAll();
  useUIStore.getState().setStatusMessage('All notes off', false, 800);
  return true;
}, description: 'Kill sample' },
{ name: 'kill_to_end', contexts: ['pattern'], handler: () => {
  const { cursor, patterns, currentPatternIndex, setCell } = useTrackerStore.getState();
  const pattern = patterns[currentPatternIndex];
  for (let r = cursor.rowIndex; r < pattern.length; r++) {
    setCell(cursor.channelIndex, r, { note: 97, instrument: 0 });
  }
  useUIStore.getState().setStatusMessage('Killed to end', false, 800);
  return true;
}, description: 'Kill notes to end of pattern' },
{ name: 'kill_to_start', contexts: ['pattern'], handler: () => {
  const { cursor, setCell } = useTrackerStore.getState();
  for (let r = 0; r <= cursor.rowIndex; r++) {
    setCell(cursor.channelIndex, r, { note: 97, instrument: 0 });
  }
  useUIStore.getState().setStatusMessage('Killed to start', false, 800);
  return true;
}, description: 'Kill notes to start of pattern' },

// === MULTI-CHANNEL MODE ===
{ name: 'toggle_multichannel_mode', contexts: ['global'], handler: () => {
  const { multiChannelRecord, toggleMultiChannelRecord } = useTrackerStore.getState();
  toggleMultiChannelRecord();
  useUIStore.getState().setStatusMessage(`Multi-channel: ${!multiChannelRecord ? 'ON' : 'OFF'}`, false, 1000);
  return true;
}, description: 'Toggle multi-channel record mode' },
{ name: 'set_block_length', contexts: ['pattern'], handler: () => {
  useUIStore.getState().setStatusMessage('Block length: resize in pattern list', false, 1500);
  return true;
}, description: 'Set block length' },

// === OCTAMED HOLD (not applicable, status only) ===
{ name: 'set_hold_0', contexts: ['pattern'], handler: () => { useUIStore.getState().setStatusMessage('Hold: OctaMED only', false, 1000); return true; }, description: 'Set hold 0' },
{ name: 'set_hold_1', contexts: ['pattern'], handler: () => { useUIStore.getState().setStatusMessage('Hold: OctaMED only', false, 1000); return true; }, description: 'Set hold 1' },
{ name: 'set_hold_2', contexts: ['pattern'], handler: () => { useUIStore.getState().setStatusMessage('Hold: OctaMED only', false, 1000); return true; }, description: 'Set hold 2' },
{ name: 'set_hold_3', contexts: ['pattern'], handler: () => { useUIStore.getState().setStatusMessage('Hold: OctaMED only', false, 1000); return true; }, description: 'Set hold 3' },
```

**Step 3: Add helper functions** above `initializeRegistry()`:

```typescript
function setVolumeInCell(volume: number): boolean {
  const { cursor, setCell } = useTrackerStore.getState();
  setCell(cursor.channelIndex, cursor.rowIndex, { volume });
  return true;
}

function adjustVolumeInCell(delta: number): () => boolean {
  return () => {
    const { cursor, patterns, currentPatternIndex, setCell } = useTrackerStore.getState();
    const cell = patterns[currentPatternIndex]?.channels[cursor.channelIndex]?.rows[cursor.rowIndex];
    if (!cell) return true;
    const newVol = Math.max(0, Math.min(64, (cell.volume || 0) + delta));
    setCell(cursor.channelIndex, cursor.rowIndex, { volume: newVol });
    return true;
  };
}
```

You also need to add the missing imports for `useTrackerStore`, `useUIStore`, and `getToneEngine` at the top if not already present.

**Step 4: Run type check + tests**

```bash
npx tsc --noEmit 2>&1 | head -30
npx vitest run 2>&1 | tail -10
```

**Step 5: Commit**

```bash
git add src/hooks/useGlobalKeyboardHandler.ts
git commit -m "feat(keyboard): implement placeholder commands — volume, kill, play variants, multi-channel"
```

---

### Task 15: Final type check and full test suite

**Step 1: Full TypeScript check**

```bash
npx tsc --noEmit 2>&1
```

Fix any type errors found.

**Step 2: Full test suite**

```bash
npx vitest run
```

Expected: all tests pass (same count as before or more).

**Step 3: Fix any failures**

Common issues to watch for:
- Missing imports in command files (check each file has all needed `import` statements)
- `useTrackerStore.getState()` access on properties that don't exist yet (verify spelling matches the interface names added in Tasks 3 and 4)
- `useTransportStore.getState().countInEnabled` (added in Task 2)
- `useUIStore.getState().dialogOpen` (added in Task 1)

**Step 4: Final commit**

```bash
git add -p  # Review any stragglers
git commit -m "fix(keyboard): type check and test fixes after full command implementation"
```

---

### Summary of new store state added

| Store | New fields |
|-------|-----------|
| `useUIStore` | `dialogOpen`, `showFileBrowser`, `showChannelNames` |
| `useTransportStore` | `countInEnabled` |
| `useTrackerStore` | `wrapMode`, `recordQuantize`, `autoRecord`, `multiChannelRecord`, `bookmarks[]`, extended `ptnJumpPos` to 10 |

### Summary of new TrackerStore methods

`amplifySelection`, `growSelection`, `shrinkSelection`, `swapChannels`, `splitPatternAtCursor`, `joinPatterns`, `toggleWrapMode`, `toggleRecordQuantize`, `toggleAutoRecord`, `toggleMultiChannelRecord`, `toggleBookmark`, `clearBookmarks`, `nextBookmark`, `prevBookmark`

### Commands still returning status messages (no real implementation possible)

| Command | Reason |
|---------|--------|
| `renderSong`, `renderToSample`, `exportMp3` | No render pipeline |
| `importMidi`, `exportMidi`, `importSample`, `exportSample` | No import/export pipeline |
| `runScript`, `recordMacro` | No scripting engine |
| `showCommandPalette` | Component not built |
| `centerCursor` | No scroll API from outside React |
| `gotoRow`, `gotoPattern`, `gotoTime` | Need input dialog |
| `toggleMidiInput` | MIDI store has no simple enabled toggle |
| `set_hold_0-3` | OctaMED-specific, N/A |
| `toggleSamplePreview` | No global sample preview toggle |
| `patternProperties`, `songProperties` | No dedicated dialogs |
