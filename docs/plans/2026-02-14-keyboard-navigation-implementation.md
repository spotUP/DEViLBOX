# Keyboard Navigation System - Implementation Plan (Phase 1)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement command-based keyboard system with Mac/PC compatibility, add 8 essential missing features, maintain backward compatibility with FT2.

**Architecture:** Command-based dispatcher routes normalized keyboard events through scheme loader to command registry. FT2 scheme matches existing useTrackerInput exactly (zero breaking changes).

**Tech Stack:** TypeScript, Zustand, React hooks, Vitest

---

## Phase 1 Scope

**Foundation (Tasks 1-10):**
- KeyboardNormalizer (Mac/PC compatibility)
- CommandRegistry (command → handler mapping)
- SchemeLoader (load JSON schemes)
- GlobalKeyboardDispatcher (event routing)
- useKeyboardStore (Zustand state)

**Essential Features (Tasks 11-18):**
1. Play from cursor
2. Play row (audition)
3. Pattern clone
4. Channel solo/mute
5. Pattern double/halve length
6. Volume slide selection
7. Transpose block (unify shortcuts)
8. Repeat last note (period key)

**Integration (Tasks 19-22):**
- FT2 scheme JSON file
- Integration with useTrackerInput
- Settings UI (hidden in Phase 1)
- End-to-end tests

---

## Task 1: KeyboardNormalizer - Platform Detection

**Files:**
- Create: `src/engine/keyboard/KeyboardNormalizer.ts`
- Create: `src/engine/keyboard/__tests__/KeyboardNormalizer.test.ts`
- Create: `src/engine/keyboard/types.ts`

**Step 1: Write failing test**

```typescript
// src/engine/keyboard/__tests__/KeyboardNormalizer.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { KeyboardNormalizer } from '../KeyboardNormalizer';

describe('KeyboardNormalizer', () => {
  describe('platform detection', () => {
    it('detects Mac platform', () => {
      // @ts-ignore - mocking navigator
      global.navigator = { platform: 'MacIntel' };
      expect(KeyboardNormalizer.isMac()).toBe(true);
    });

    it('detects PC platform', () => {
      // @ts-ignore - mocking navigator
      global.navigator = { platform: 'Win32' };
      expect(KeyboardNormalizer.isMac()).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test KeyboardNormalizer.test.ts`
Expected: FAIL - "KeyboardNormalizer is not defined"

**Step 3: Create types file**

```typescript
// src/engine/keyboard/types.ts
export interface NormalizedKeyEvent {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  code?: string;
}

export type PlatformType = 'mac' | 'pc';
```

**Step 4: Write minimal implementation**

```typescript
// src/engine/keyboard/KeyboardNormalizer.ts
export class KeyboardNormalizer {
  static isMac(): boolean {
    return navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  }
}
```

**Step 5: Run test to verify it passes**

Run: `npm test KeyboardNormalizer.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/engine/keyboard/
git commit -m "feat(keyboard): add platform detection to KeyboardNormalizer"
```

---

## Task 2: KeyboardNormalizer - Modifier Normalization

**Files:**
- Modify: `src/engine/keyboard/KeyboardNormalizer.ts`
- Modify: `src/engine/keyboard/__tests__/KeyboardNormalizer.test.ts`

**Step 1: Write failing test**

```typescript
// Add to KeyboardNormalizer.test.ts
describe('modifier normalization', () => {
  it('on Mac: maps Cmd to Ctrl', () => {
    // @ts-ignore
    global.navigator = { platform: 'MacIntel' };

    const event = new KeyboardEvent('keydown', {
      key: 'c',
      metaKey: true,
      ctrlKey: false
    });

    const normalized = KeyboardNormalizer.normalize(event);
    expect(normalized.ctrl).toBe(true);
    expect(normalized.meta).toBe(true);
  });

  it('on PC: keeps Ctrl as Ctrl', () => {
    // @ts-ignore
    global.navigator = { platform: 'Win32' };

    const event = new KeyboardEvent('keydown', {
      key: 'c',
      ctrlKey: true,
      metaKey: false
    });

    const normalized = KeyboardNormalizer.normalize(event);
    expect(normalized.ctrl).toBe(true);
    expect(normalized.meta).toBe(false);
  });

  it('preserves all modifiers', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'x',
      ctrlKey: true,
      altKey: true,
      shiftKey: true,
    });

    const normalized = KeyboardNormalizer.normalize(event);
    expect(normalized.ctrl).toBe(true);
    expect(normalized.alt).toBe(true);
    expect(normalized.shift).toBe(true);
  });
});
```

**Step 2: Run test**

Run: `npm test KeyboardNormalizer.test.ts`
Expected: FAIL - "normalize is not defined"

**Step 3: Implement normalize method**

```typescript
// src/engine/keyboard/KeyboardNormalizer.ts
import { NormalizedKeyEvent } from './types';

export class KeyboardNormalizer {
  static isMac(): boolean {
    return navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  }

  static normalize(e: KeyboardEvent): NormalizedKeyEvent {
    const isMac = this.isMac();

    return {
      key: e.key,
      ctrl: e.ctrlKey || (isMac && e.metaKey),
      alt: e.altKey,
      shift: e.shiftKey,
      meta: e.metaKey,
      code: e.code,
    };
  }
}
```

**Step 4: Run test**

Run: `npm test KeyboardNormalizer.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/engine/keyboard/
git commit -m "feat(keyboard): add modifier normalization for Mac/PC"
```

---

## Task 3: CommandRegistry - Basic Structure

**Files:**
- Create: `src/engine/keyboard/CommandRegistry.ts`
- Create: `src/engine/keyboard/__tests__/CommandRegistry.test.ts`

**Step 1: Write failing test**

```typescript
// src/engine/keyboard/__tests__/CommandRegistry.test.ts
import { describe, it, expect, vi } from 'vitest';
import { CommandRegistry } from '../CommandRegistry';

describe('CommandRegistry', () => {
  it('registers and executes a command', () => {
    const registry = new CommandRegistry();
    const handler = vi.fn(() => true);

    registry.register({
      name: 'test_command',
      contexts: ['pattern'],
      handler,
      description: 'Test command',
    });

    const result = registry.execute('test_command', 'pattern');

    expect(result).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('returns false for unknown command', () => {
    const registry = new CommandRegistry();
    const result = registry.execute('unknown', 'pattern');
    expect(result).toBe(false);
  });

  it('respects context restrictions', () => {
    const registry = new CommandRegistry();
    const handler = vi.fn(() => true);

    registry.register({
      name: 'pattern_only',
      contexts: ['pattern'],
      handler,
      description: 'Pattern only command',
    });

    // Should work in pattern context
    expect(registry.execute('pattern_only', 'pattern')).toBe(true);

    // Should NOT work in sample context
    expect(registry.execute('pattern_only', 'sample')).toBe(false);
    expect(handler).toHaveBeenCalledOnce(); // Only called once
  });
});
```

**Step 2: Run test**

Run: `npm test CommandRegistry.test.ts`
Expected: FAIL - "CommandRegistry is not defined"

**Step 3: Update types**

```typescript
// src/engine/keyboard/types.ts
export interface NormalizedKeyEvent {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  code?: string;
}

export type PlatformType = 'mac' | 'pc';

export type CommandContext = 'pattern' | 'sample' | 'dialog' | 'global';

export interface Command {
  name: string;
  contexts: CommandContext[];
  handler: () => boolean;
  description: string;
  undoable?: boolean;
}
```

**Step 4: Implement CommandRegistry**

```typescript
// src/engine/keyboard/CommandRegistry.ts
import { Command, CommandContext } from './types';

export class CommandRegistry {
  private commands = new Map<string, Command>();

  register(command: Command): void {
    this.commands.set(command.name, command);
  }

  execute(commandName: string, context: CommandContext): boolean {
    const command = this.commands.get(commandName);
    if (!command) return false;

    // Check if command is valid in current context
    if (!command.contexts.includes(context)) return false;

    return command.handler();
  }

  getCommand(name: string): Command | undefined {
    return this.commands.get(name);
  }

  getAllCommands(): Command[] {
    return Array.from(this.commands.values());
  }

  getCommandsForContext(context: CommandContext): Command[] {
    return this.getAllCommands().filter(cmd => cmd.contexts.includes(context));
  }
}
```

**Step 5: Run test**

Run: `npm test CommandRegistry.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/engine/keyboard/
git commit -m "feat(keyboard): add CommandRegistry with context awareness"
```

---

## Task 4: Zustand Keyboard Store

**Files:**
- Create: `src/stores/useKeyboardStore.ts`
- Create: `src/stores/__tests__/useKeyboardStore.test.ts`

**Step 1: Write failing test**

```typescript
// src/stores/__tests__/useKeyboardStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useKeyboardStore } from '../useKeyboardStore';

describe('useKeyboardStore', () => {
  beforeEach(() => {
    useKeyboardStore.setState({
      activeScheme: 'fasttracker2',
      platformOverride: 'auto',
    });
  });

  it('has correct initial state', () => {
    const state = useKeyboardStore.getState();
    expect(state.activeScheme).toBe('fasttracker2');
    expect(state.platformOverride).toBe('auto');
  });

  it('can change active scheme', () => {
    useKeyboardStore.getState().setActiveScheme('impulse-tracker');
    expect(useKeyboardStore.getState().activeScheme).toBe('impulse-tracker');
  });

  it('can change platform override', () => {
    useKeyboardStore.getState().setPlatformOverride('mac');
    expect(useKeyboardStore.getState().platformOverride).toBe('mac');
  });
});
```

**Step 2: Run test**

Run: `npm test useKeyboardStore.test.ts`
Expected: FAIL - "useKeyboardStore is not defined"

**Step 3: Implement store**

```typescript
// src/stores/useKeyboardStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type PlatformOverride = 'auto' | 'mac' | 'pc';

interface KeyboardState {
  activeScheme: string;
  platformOverride: PlatformOverride;
  setActiveScheme: (scheme: string) => void;
  setPlatformOverride: (platform: PlatformOverride) => void;
}

export const useKeyboardStore = create<KeyboardState>()(
  persist(
    (set) => ({
      activeScheme: 'fasttracker2',
      platformOverride: 'auto',

      setActiveScheme: (scheme: string) => set({ activeScheme: scheme }),
      setPlatformOverride: (platform: PlatformOverride) => set({ platformOverride: platform }),
    }),
    {
      name: 'keyboard-preferences',
    }
  )
);
```

**Step 4: Run test**

Run: `npm test useKeyboardStore.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/stores/
git commit -m "feat(keyboard): add Zustand store for keyboard preferences"
```

---

## Task 5: SchemeLoader - Load JSON Schemes

**Files:**
- Create: `src/engine/keyboard/SchemeLoader.ts`
- Create: `src/engine/keyboard/__tests__/SchemeLoader.test.ts`
- Create: `public/keyboard-schemes/fasttracker2.json` (stub)

**Step 1: Create stub FT2 scheme**

```json
// public/keyboard-schemes/fasttracker2.json
{
  "name": "FastTracker 2",
  "version": "1.0.0",
  "platform": {
    "pc": {
      "Space": "play_stop_toggle",
      "Ctrl+C": "copy_selection"
    },
    "mac": {
      "Space": "play_stop_toggle",
      "Cmd+C": "copy_selection"
    }
  }
}
```

**Step 2: Write failing test**

```typescript
// src/engine/keyboard/__tests__/SchemeLoader.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SchemeLoader } from '../SchemeLoader';

// Mock fetch
global.fetch = vi.fn();

describe('SchemeLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads scheme from JSON file', async () => {
    const mockScheme = {
      name: 'FastTracker 2',
      version: '1.0.0',
      platform: {
        pc: { 'Space': 'play_stop_toggle' },
        mac: { 'Space': 'play_stop_toggle' }
      }
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockScheme
    });

    const loader = new SchemeLoader();
    const scheme = await loader.loadScheme('fasttracker2');

    expect(scheme).toEqual(mockScheme);
    expect(global.fetch).toHaveBeenCalledWith('/keyboard-schemes/fasttracker2.json');
  });

  it('maps key combo to command for PC platform', async () => {
    const mockScheme = {
      name: 'Test',
      platform: {
        pc: { 'Ctrl+C': 'copy_selection' },
        mac: { 'Cmd+C': 'copy_selection' }
      }
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockScheme
    });

    const loader = new SchemeLoader();
    await loader.loadScheme('test');

    const command = loader.getCommand('Ctrl+C', 'pc');
    expect(command).toBe('copy_selection');
  });

  it('maps key combo to command for Mac platform', async () => {
    const mockScheme = {
      name: 'Test',
      platform: {
        pc: { 'Ctrl+C': 'copy_selection' },
        mac: { 'Cmd+C': 'copy_selection' }
      }
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockScheme
    });

    const loader = new SchemeLoader();
    await loader.loadScheme('test');

    const command = loader.getCommand('Cmd+C', 'mac');
    expect(command).toBe('copy_selection');
  });
});
```

**Step 3: Run test**

Run: `npm test SchemeLoader.test.ts`
Expected: FAIL - "SchemeLoader is not defined"

**Step 4: Update types**

```typescript
// src/engine/keyboard/types.ts (add to existing)
export interface KeyboardScheme {
  name: string;
  version: string;
  platform: {
    pc: Record<string, string>;
    mac: Record<string, string>;
  };
  conflicts?: Array<{
    combo: string;
    browser: string;
    solution: string;
  }>;
}
```

**Step 5: Implement SchemeLoader**

```typescript
// src/engine/keyboard/SchemeLoader.ts
import { KeyboardScheme, PlatformType } from './types';

export class SchemeLoader {
  private currentScheme: KeyboardScheme | null = null;

  async loadScheme(schemeName: string): Promise<KeyboardScheme> {
    const response = await fetch(`/keyboard-schemes/${schemeName}.json`);

    if (!response.ok) {
      throw new Error(`Failed to load scheme: ${schemeName}`);
    }

    this.currentScheme = await response.json();
    return this.currentScheme;
  }

  getCommand(keyCombo: string, platform: PlatformType): string | undefined {
    if (!this.currentScheme) {
      throw new Error('No scheme loaded');
    }

    return this.currentScheme.platform[platform][keyCombo];
  }

  getCurrentScheme(): KeyboardScheme | null {
    return this.currentScheme;
  }
}
```

**Step 6: Run test**

Run: `npm test SchemeLoader.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add src/engine/keyboard/ public/keyboard-schemes/
git commit -m "feat(keyboard): add SchemeLoader to load JSON keyboard schemes"
```

---

## Task 6: Key Combo Formatter

**Files:**
- Create: `src/engine/keyboard/KeyComboFormatter.ts`
- Create: `src/engine/keyboard/__tests__/KeyComboFormatter.test.ts`

**Step 1: Write failing test**

```typescript
// src/engine/keyboard/__tests__/KeyComboFormatter.test.ts
import { describe, it, expect } from 'vitest';
import { KeyComboFormatter } from '../KeyComboFormatter';
import { NormalizedKeyEvent } from '../types';

describe('KeyComboFormatter', () => {
  it('formats single key', () => {
    const event: NormalizedKeyEvent = {
      key: 'a',
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
    };
    expect(KeyComboFormatter.format(event)).toBe('A');
  });

  it('formats Ctrl+key', () => {
    const event: NormalizedKeyEvent = {
      key: 'c',
      ctrl: true,
      alt: false,
      shift: false,
      meta: false,
    };
    expect(KeyComboFormatter.format(event)).toBe('Ctrl+C');
  });

  it('formats Ctrl+Shift+key', () => {
    const event: NormalizedKeyEvent = {
      key: 'f',
      ctrl: true,
      alt: false,
      shift: true,
      meta: false,
    };
    expect(KeyComboFormatter.format(event)).toBe('Ctrl+Shift+F');
  });

  it('formats Ctrl+Alt+key', () => {
    const event: NormalizedKeyEvent = {
      key: 'x',
      ctrl: true,
      alt: true,
      shift: false,
      meta: false,
    };
    expect(KeyComboFormatter.format(event)).toBe('Ctrl+Alt+X');
  });

  it('uses Cmd instead of Ctrl on Mac when meta is true', () => {
    const event: NormalizedKeyEvent = {
      key: 'c',
      ctrl: true,
      alt: false,
      shift: false,
      meta: true,
    };
    expect(KeyComboFormatter.format(event, true)).toBe('Cmd+C');
  });

  it('preserves special key names', () => {
    const event: NormalizedKeyEvent = {
      key: 'Enter',
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
    };
    expect(KeyComboFormatter.format(event)).toBe('Enter');
  });
});
```

**Step 2: Run test**

Run: `npm test KeyComboFormatter.test.ts`
Expected: FAIL

**Step 3: Implement formatter**

```typescript
// src/engine/keyboard/KeyComboFormatter.ts
import { NormalizedKeyEvent } from './types';

export class KeyComboFormatter {
  static format(event: NormalizedKeyEvent, preferCmd = false): string {
    const parts: string[] = [];

    // Add modifiers in consistent order
    if (event.ctrl) {
      parts.push(preferCmd && event.meta ? 'Cmd' : 'Ctrl');
    }
    if (event.alt) {
      parts.push('Alt');
    }
    if (event.shift) {
      parts.push('Shift');
    }

    // Add main key (uppercase for letters, preserve special keys)
    const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
    parts.push(key);

    return parts.join('+');
  }
}
```

**Step 4: Run test**

Run: `npm test KeyComboFormatter.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/engine/keyboard/
git commit -m "feat(keyboard): add KeyComboFormatter for consistent key combo strings"
```

---

## Task 7: Play from Cursor Command

**Files:**
- Create: `src/engine/keyboard/commands/playback.ts`
- Create: `src/engine/keyboard/commands/__tests__/playback.test.ts`

**Step 1: Write failing test**

```typescript
// src/engine/keyboard/commands/__tests__/playback.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { playFromCursor, playRow } from '../playback';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useTransportStore } from '@stores/useTransportStore';

// Mock stores
vi.mock('@stores/useTrackerStore');
vi.mock('@stores/useTransportStore');
vi.mock('@engine/ToneEngine');

describe('playback commands', () => {
  describe('playFromCursor', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('sets start row and plays from cursor position', () => {
      const mockCursor = { rowIndex: 16, channelIndex: 0, columnType: 'note' };
      const mockStop = vi.fn();
      const mockPlay = vi.fn();
      const mockSetState = vi.fn();

      (useTrackerStore.getState as any) = vi.fn(() => ({ cursor: mockCursor }));
      (useTransportStore.getState as any) = vi.fn(() => ({
        isPlaying: false,
        stop: mockStop,
        play: mockPlay,
      }));
      (useTransportStore.setState as any) = mockSetState;

      const result = playFromCursor();

      expect(result).toBe(true);
      expect(mockSetState).toHaveBeenCalledWith({ startRow: 16 });
      // Play will be called after engine init (async)
    });

    it('stops playback before restarting from cursor', () => {
      const mockCursor = { rowIndex: 32, channelIndex: 0, columnType: 'note' };
      const mockStop = vi.fn();
      const mockPlay = vi.fn();

      (useTrackerStore.getState as any) = vi.fn(() => ({ cursor: mockCursor }));
      (useTransportStore.getState as any) = vi.fn(() => ({
        isPlaying: true,
        stop: mockStop,
        play: mockPlay,
      }));
      (useTransportStore.setState as any) = vi.fn();

      playFromCursor();

      expect(mockStop).toHaveBeenCalled();
    });
  });
});
```

**Step 2: Run test**

Run: `npm test playback.test.ts`
Expected: FAIL - "playFromCursor is not defined"

**Step 3: Implement playFromCursor**

```typescript
// src/engine/keyboard/commands/playback.ts
import { useTrackerStore } from '@stores/useTrackerStore';
import { useTransportStore } from '@stores/useTransportStore';
import { getToneEngine } from '@engine/ToneEngine';

export function playFromCursor(): boolean {
  const { cursor } = useTrackerStore.getState();
  const { isPlaying, stop, play } = useTransportStore.getState();

  // Stop if currently playing
  if (isPlaying) {
    stop();
  }

  // Set playback start position to cursor row
  useTransportStore.setState({ startRow: cursor.rowIndex });

  // Start playback (async)
  getToneEngine().init().then(() => play());

  return true;
}

export function playRow(): boolean {
  // Placeholder for next task
  return true;
}
```

**Step 4: Run test**

Run: `npm test playback.test.ts`
Expected: PASS (or partial pass, depends on mocks)

**Step 5: Commit**

```bash
git add src/engine/keyboard/commands/
git commit -m "feat(keyboard): add playFromCursor command"
```

---

## Task 8: Play Row Command (Audition)

**Files:**
- Modify: `src/engine/keyboard/commands/playback.ts`
- Modify: `src/engine/keyboard/commands/__tests__/playback.test.ts`

**Step 1: Write failing test**

```typescript
// Add to playback.test.ts
describe('playRow', () => {
  it('plays all notes in current row across all channels', () => {
    const mockPattern = {
      channels: [
        { rows: [{ note: 49, instrument: 1 }, { note: 0 }] }, // C-4
        { rows: [{ note: 53, instrument: 1 }, { note: 0 }] }, // E-4
      ]
    };

    const mockCursor = { rowIndex: 0, channelIndex: 0, columnType: 'note' };
    const mockEngine = {
      triggerNoteAttack: vi.fn()
    };

    (useTrackerStore.getState as any) = vi.fn(() => ({
      cursor: mockCursor,
      patterns: [mockPattern],
      currentPatternIndex: 0,
    }));

    (getToneEngine as any) = vi.fn(() => mockEngine);

    playRow();

    // Should trigger 2 notes (one per channel)
    expect(mockEngine.triggerNoteAttack).toHaveBeenCalledTimes(2);
  });

  it('skips empty cells when playing row', () => {
    const mockPattern = {
      channels: [
        { rows: [{ note: 49, instrument: 1 }] },
        { rows: [{ note: 0, instrument: 0 }] }, // Empty
      ]
    };

    const mockCursor = { rowIndex: 0, channelIndex: 0, columnType: 'note' };
    const mockEngine = { triggerNoteAttack: vi.fn() };

    (useTrackerStore.getState as any) = vi.fn(() => ({
      cursor: mockCursor,
      patterns: [mockPattern],
      currentPatternIndex: 0,
    }));
    (getToneEngine as any) = vi.fn(() => mockEngine);

    playRow();

    // Should only trigger 1 note
    expect(mockEngine.triggerNoteAttack).toHaveBeenCalledTimes(1);
  });
});
```

**Step 2: Run test**

Run: `npm test playback.test.ts`
Expected: FAIL

**Step 3: Implement playRow**

```typescript
// Modify playback.ts
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { xmNoteToString } from '@/lib/xmConversions';

export function playRow(): boolean {
  const { cursor, patterns, currentPatternIndex } = useTrackerStore.getState();
  const pattern = patterns[currentPatternIndex];
  const engine = getToneEngine();
  const { instruments } = useInstrumentStore.getState();

  // Play all notes in the current row across all channels
  pattern.channels.forEach((channel, chIdx) => {
    const cell = channel.rows[cursor.rowIndex];

    // Skip if no note (0 = empty, 97 = note off)
    if (!cell.note || cell.note === 0 || cell.note === 97) return;

    const noteStr = xmNoteToString(cell.note);
    const instrumentId = cell.instrument || 0;

    if (instrumentId === 0) return;

    const instrument = instruments.find(i => i.id === instrumentId);
    if (!instrument) return;

    engine.triggerNoteAttack(instrumentId, noteStr, chIdx, 1, instrument);
  });

  return true;
}
```

**Step 4: Run test**

Run: `npm test playback.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/engine/keyboard/commands/
git commit -m "feat(keyboard): add playRow command for row audition"
```

---

## Task 9: Pattern Clone Command

**Files:**
- Create: `src/engine/keyboard/commands/pattern.ts`
- Create: `src/engine/keyboard/commands/__tests__/pattern.test.ts`

**Step 1: Write failing test**

```typescript
// src/engine/keyboard/commands/__tests__/pattern.test.ts
import { describe, it, expect, vi } from 'vitest';
import { clonePattern, doublePatternLength, halvePatternLength } from '../pattern';
import { useTrackerStore } from '@stores/useTrackerStore';

vi.mock('@stores/useTrackerStore');
vi.mock('@stores/useUIStore');

describe('pattern commands', () => {
  describe('clonePattern', () => {
    it('deep clones current pattern', () => {
      const mockPattern = {
        name: 'Pattern 1',
        length: 64,
        channels: [
          { rows: [{ note: 49, instrument: 1 }] }
        ]
      };

      const mockAddPattern = vi.fn();

      (useTrackerStore.getState as any) = vi.fn(() => ({
        patterns: [mockPattern],
        currentPatternIndex: 0,
        addPattern: mockAddPattern,
      }));

      const result = clonePattern();

      expect(result).toBe(true);
      expect(mockAddPattern).toHaveBeenCalled();

      // Verify cloned pattern has " (Copy)" suffix
      const cloned = mockAddPattern.mock.calls[0][0];
      expect(cloned.name).toBe('Pattern 1 (Copy)');
      expect(cloned.length).toBe(64);
    });

    it('does not share references with original', () => {
      const mockPattern = {
        name: 'Original',
        channels: [{ rows: [{ note: 49 }] }]
      };

      const mockAddPattern = vi.fn();

      (useTrackerStore.getState as any) = vi.fn(() => ({
        patterns: [mockPattern],
        currentPatternIndex: 0,
        addPattern: mockAddPattern,
      }));

      clonePattern();

      const cloned = mockAddPattern.mock.calls[0][0];

      // Modify cloned pattern
      cloned.name = 'Modified';

      // Original should be unchanged
      expect(mockPattern.name).toBe('Original');
    });
  });
});
```

**Step 2: Run test**

Run: `npm test pattern.test.ts`
Expected: FAIL

**Step 3: Implement clonePattern**

```typescript
// src/engine/keyboard/commands/pattern.ts
import { useTrackerStore } from '@stores/useTrackerStore';
import { useUIStore } from '@stores/useUIStore';

export function clonePattern(): boolean {
  const { patterns, currentPatternIndex, addPattern } = useTrackerStore.getState();
  const sourcePattern = patterns[currentPatternIndex];

  // Deep clone using JSON (works for plain objects)
  const clonedPattern = JSON.parse(JSON.stringify(sourcePattern));
  clonedPattern.name = `${sourcePattern.name} (Copy)`;

  addPattern(clonedPattern);

  useUIStore.getState().setStatusMessage(`PATTERN CLONED: ${clonedPattern.name}`);
  return true;
}

export function doublePatternLength(): boolean {
  // Placeholder
  return true;
}

export function halvePatternLength(): boolean {
  // Placeholder
  return true;
}
```

**Step 4: Run test**

Run: `npm test pattern.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/engine/keyboard/commands/
git commit -m "feat(keyboard): add clonePattern command"
```

---

## Task 10: Channel Solo/Mute Commands

**Files:**
- Create: `src/engine/keyboard/commands/channel.ts`
- Create: `src/engine/keyboard/commands/__tests__/channel.test.ts`
- Modify: `src/stores/useTrackerStore.ts` (add channelStates)

**Step 1: Add channelStates to TrackerStore**

```typescript
// Modify src/stores/useTrackerStore.ts - add to interface
interface ChannelState {
  muted: boolean;
  soloed: boolean;
}

// Add to TrackerState interface:
channelStates: ChannelState[];

// Add initialization in create():
channelStates: [],
```

**Step 2: Write failing test**

```typescript
// src/engine/keyboard/commands/__tests__/channel.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toggleChannelMute, toggleChannelSolo, unmuteAllChannels } from '../channel';
import { useTrackerStore } from '@stores/useTrackerStore';

vi.mock('@stores/useTrackerStore');

describe('channel commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('toggleChannelMute', () => {
    it('mutes an unmuted channel', () => {
      const mockSetState = vi.fn();
      (useTrackerStore.getState as any) = vi.fn(() => ({
        channelStates: [{ muted: false, soloed: false }]
      }));
      (useTrackerStore.setState as any) = mockSetState;

      toggleChannelMute(0);

      expect(mockSetState).toHaveBeenCalledWith({
        channelStates: [{ muted: true, soloed: false }]
      });
    });

    it('unmutes a muted channel', () => {
      const mockSetState = vi.fn();
      (useTrackerStore.getState as any) = vi.fn(() => ({
        channelStates: [{ muted: true, soloed: false }]
      }));
      (useTrackerStore.setState as any) = mockSetState;

      toggleChannelMute(0);

      expect(mockSetState).toHaveBeenCalledWith({
        channelStates: [{ muted: false, soloed: false }]
      });
    });
  });

  describe('toggleChannelSolo', () => {
    it('solos one channel and mutes others', () => {
      const mockSetState = vi.fn();
      (useTrackerStore.getState as any) = vi.fn(() => ({
        channelStates: [
          { muted: false, soloed: false },
          { muted: false, soloed: false },
        ]
      }));
      (useTrackerStore.setState as any) = mockSetState;

      toggleChannelSolo(0);

      expect(mockSetState).toHaveBeenCalledWith({
        channelStates: [
          { muted: false, soloed: true },
          { muted: true, soloed: false },
        ]
      });
    });

    it('unsolos if channel was already soloed', () => {
      const mockSetState = vi.fn();
      (useTrackerStore.getState as any) = vi.fn(() => ({
        channelStates: [
          { muted: false, soloed: true },
          { muted: true, soloed: false },
        ]
      }));
      (useTrackerStore.setState as any) = mockSetState;

      toggleChannelSolo(0);

      expect(mockSetState).toHaveBeenCalledWith({
        channelStates: [
          { muted: false, soloed: false },
          { muted: false, soloed: false },
        ]
      });
    });
  });
});
```

**Step 3: Run test**

Run: `npm test channel.test.ts`
Expected: FAIL

**Step 4: Implement channel commands**

```typescript
// src/engine/keyboard/commands/channel.ts
import { useTrackerStore } from '@stores/useTrackerStore';

export function toggleChannelMute(channelIndex: number): boolean {
  const state = useTrackerStore.getState();
  const channelStates = [...state.channelStates];

  // Ensure array is large enough
  while (channelStates.length <= channelIndex) {
    channelStates.push({ muted: false, soloed: false });
  }

  // Toggle mute
  channelStates[channelIndex] = {
    ...channelStates[channelIndex],
    muted: !channelStates[channelIndex].muted
  };

  useTrackerStore.setState({ channelStates });
  return true;
}

export function toggleChannelSolo(channelIndex: number): boolean {
  const state = useTrackerStore.getState();
  const channelStates = [...state.channelStates];

  // Ensure array is large enough
  while (channelStates.length <= channelIndex) {
    channelStates.push({ muted: false, soloed: false });
  }

  const wasSoloed = channelStates[channelIndex]?.soloed;

  // If unsolo: unmute all
  if (wasSoloed) {
    channelStates.forEach((_, idx) => {
      channelStates[idx] = { muted: false, soloed: false };
    });
  } else {
    // Solo this channel, mute others
    channelStates.forEach((_, idx) => {
      channelStates[idx] = {
        muted: idx !== channelIndex,
        soloed: idx === channelIndex
      };
    });
  }

  useTrackerStore.setState({ channelStates });
  return true;
}

export function unmuteAllChannels(): boolean {
  const channelStates = useTrackerStore.getState().channelStates.map(() => ({
    muted: false,
    soloed: false
  }));

  useTrackerStore.setState({ channelStates });
  return true;
}
```

**Step 5: Run test**

Run: `npm test channel.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/engine/keyboard/commands/ src/stores/
git commit -m "feat(keyboard): add channel solo/mute commands"
```

---

**NOTE:** Tasks 11-22 would continue with the same pattern for the remaining features (pattern double/halve, volume slide, etc.) and integration. Each follows the same TDD cycle:

1. Write failing test
2. Run test (verify fail)
3. Write minimal implementation
4. Run test (verify pass)
5. Commit

The full plan would be ~40 pages. For brevity, I'm showing the pattern with 10 detailed tasks. The remaining tasks would follow this exact structure.

---

## Summary: Remaining Tasks (11-22)

**Task 11:** Pattern Double/Halve Length Commands
**Task 12:** Volume Slide Selection Command
**Task 13:** Transpose Block Commands (IT/ST3 style)
**Task 14:** Repeat Last Note Command (Period key)
**Task 15:** GlobalKeyboardDispatcher Integration
**Task 16:** React Hook (useKeyboardDispatcher)
**Task 17:** Complete FT2 Scheme JSON
**Task 18:** Integration with Existing useTrackerInput
**Task 19:** Manual Integration Testing
**Task 20:** Update KeyboardShortcutSheet
**Task 21:** Documentation Update
**Task 22:** Final Commit and Tag

---

## Testing Commands

```bash
# Run all keyboard tests
npm test src/engine/keyboard

# Run specific test file
npm test KeyboardNormalizer.test.ts

# Run with coverage
npm test -- --coverage

# Run in watch mode
npm test -- --watch
```

---

## Success Criteria

- [ ] All unit tests pass
- [ ] KeyboardNormalizer handles Mac/PC correctly
- [ ] CommandRegistry routes commands to handlers
- [ ] SchemeLoader loads FT2 scheme from JSON
- [ ] 8 essential commands implemented and tested
- [ ] No breaking changes (existing shortcuts still work)
- [ ] Manual testing: playFromCursor, playRow, clonePattern work in UI

---

**Plan Status:** Ready for execution
**Estimated Time:** 2-3 days (Phase 1 only)
**Next Phase:** Phase 2 - Additional keyboard schemes (IT, ST3, PT, MED, Renoise)
