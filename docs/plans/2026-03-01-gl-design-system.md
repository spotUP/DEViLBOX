# GL Design System — Unified ScrollList Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a renderer-aware `ScrollList` component (one import, renders DOM or GL automatically) and use it to eliminate the `PixiDOMOverlay` in `PixiInstrumentPanel`.

**Architecture:** A `RendererCtx` React context (default `'dom'`) is set to `'gl'` by a `<GLRenderer>` wrapper placed around `<Application>` in `PixiApp.tsx`. Each unified component's dispatcher reads this context and delegates to the DOM or GL implementation. The GL `ScrollList` wraps the existing `PixiList` component (already virtualised, already has scrollbar drag). The DOM `ScrollList` is a simple CSS overflow-y div.

**Tech Stack:** React context, TypeScript, Pixi (`pixiContainer`, existing `PixiList`), Zustand (`useInstrumentStore`)

---

## Key file locations

| What | Path |
|------|------|
| Pixi app entry | `src/pixi/PixiApp.tsx` |
| Existing GL list component | `src/pixi/components/PixiList.tsx` |
| Instrument panel (PixiDOMOverlay target) | `src/pixi/views/tracker/PixiInstrumentPanel.tsx` |
| Instrument store | `src/stores/useInstrumentStore.ts` |
| GL components barrel | `src/pixi/components/index.ts` |

---

### Task 1: Create `src/ui/renderer-context.ts`

**Files:**
- Create: `src/ui/renderer-context.ts`

**Step 1: Create the context file**

```ts
// src/ui/renderer-context.ts
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

export type RendererKind = 'dom' | 'gl';

export const RendererCtx = createContext<RendererKind>('dom');

export function useRenderer(): RendererKind {
  return useContext(RendererCtx);
}

export function GLRenderer({ children }: { children: ReactNode }) {
  return <RendererCtx.Provider value="gl">{children}</RendererCtx.Provider>;
}
```

**Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/ui/renderer-context.ts
git commit -m "feat(ui): add renderer context layer (dom/gl discriminator)"
```

---

### Task 2: Create `ScrollList` types and DOM implementation

**Files:**
- Create: `src/ui/components/ScrollList/types.ts`
- Create: `src/ui/components/ScrollList/ScrollList.dom.tsx`

**Step 1: Create the shared types**

```ts
// src/ui/components/ScrollList/types.ts

export interface ScrollListItem {
  id: string;
  label: string;
  /** Secondary label shown muted (e.g. synth type) */
  sublabel?: string;
}

export interface ScrollListProps {
  items: ScrollListItem[];
  /** id of the currently selected item */
  selectedId?: string | null;
  onSelect: (id: string) => void;
  onDoubleClick?: (id: string) => void;
  /** Required — sets the fixed height of the visible scroll area */
  height: number;
  /** Row height in px. Default 28 (matches PixiList default) */
  itemHeight?: number;
  /** Required in GL; optional in DOM. Sets the container width. */
  width?: number;
  /** Extra layout props forwarded to the Pixi container (GL only) */
  layout?: Record<string, unknown>;
}
```

**Step 2: Create the DOM implementation**

```tsx
// src/ui/components/ScrollList/ScrollList.dom.tsx
import React, { useRef, useCallback } from 'react';
import type { ScrollListProps } from './types';

export const DOMScrollList: React.FC<ScrollListProps> = ({
  items,
  selectedId,
  onSelect,
  onDoubleClick,
  height,
  itemHeight = 28,
}) => {
  const lastClickRef = useRef<{ id: string; time: number }>({ id: '', time: 0 });

  const handleClick = useCallback((id: string) => {
    const now = Date.now();
    if (lastClickRef.current.id === id && now - lastClickRef.current.time < 300) {
      onDoubleClick?.(id);
      lastClickRef.current = { id: '', time: 0 };
    } else {
      onSelect(id);
      lastClickRef.current = { id, time: now };
    }
  }, [onSelect, onDoubleClick]);

  return (
    <div
      role="listbox"
      style={{
        height,
        overflowY: 'auto',
        overflowX: 'hidden',
        background: 'var(--color-bg)',
      }}
    >
      {items.map((item, idx) => {
        const isSelected = item.id === selectedId;
        const isEven = idx % 2 === 0;
        return (
          <div
            key={item.id}
            role="option"
            aria-selected={isSelected}
            tabIndex={0}
            onClick={() => handleClick(item.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(item.id); }}
            style={{
              height: itemHeight,
              display: 'flex',
              alignItems: 'center',
              paddingLeft: 8,
              gap: 8,
              cursor: 'pointer',
              background: isSelected
                ? 'rgba(var(--color-accent-rgb), 0.15)'
                : isEven ? 'var(--color-bg)' : 'var(--color-bg-secondary)',
              color: isSelected ? 'var(--color-accent)' : 'var(--color-text)',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              boxSizing: 'border-box',
              userSelect: 'none',
            }}
          >
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.label}
            </span>
            {item.sublabel && (
              <span style={{ color: 'var(--color-text-muted)', fontSize: 10, flexShrink: 0, paddingRight: 8 }}>
                {item.sublabel}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};
```

**Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 4: Commit**

```bash
git add src/ui/components/ScrollList/types.ts src/ui/components/ScrollList/ScrollList.dom.tsx
git commit -m "feat(ui): add ScrollList types and DOM implementation"
```

---

### Task 3: Create `ScrollList` GL implementation and dispatcher

**Files:**
- Create: `src/ui/components/ScrollList/ScrollList.gl.tsx`
- Create: `src/ui/components/ScrollList/ScrollList.tsx`
- Create: `src/ui/components/ScrollList/index.ts`
- Create: `src/ui/index.ts`

**Step 1: Create the GL wrapper (delegates to existing PixiList)**

```tsx
// src/ui/components/ScrollList/ScrollList.gl.tsx
import React from 'react';
import { PixiList } from '../../../pixi/components/PixiList';
import type { ScrollListProps } from './types';

/**
 * GL ScrollList — thin adapter over PixiList.
 * PixiList already handles virtualisation, scrollbar drag, and double-click.
 */
export const GLScrollList: React.FC<ScrollListProps> = ({
  items,
  selectedId,
  onSelect,
  onDoubleClick,
  height,
  itemHeight = 28,
  width = 200,
  layout,
}) => {
  return (
    <PixiList
      items={items}
      selectedId={selectedId ?? null}
      onSelect={onSelect}
      onDoubleClick={onDoubleClick}
      width={width}
      height={height}
      itemHeight={itemHeight}
      layout={layout}
    />
  );
};
```

**Step 2: Create the dispatcher**

```tsx
// src/ui/components/ScrollList/ScrollList.tsx
import React from 'react';
import { useRenderer } from '../../renderer-context';
import { DOMScrollList } from './ScrollList.dom';
import { GLScrollList } from './ScrollList.gl';
import type { ScrollListProps } from './types';

export const ScrollList: React.FC<ScrollListProps> = (props) => {
  const renderer = useRenderer();
  return renderer === 'gl' ? <GLScrollList {...props} /> : <DOMScrollList {...props} />;
};
```

**Step 3: Create module barrel files**

```ts
// src/ui/components/ScrollList/index.ts
export { ScrollList } from './ScrollList';
export type { ScrollListItem, ScrollListProps } from './types';
```

```ts
// src/ui/index.ts
export { ScrollList } from './components/ScrollList';
export type { ScrollListItem, ScrollListProps } from './components/ScrollList';
export { useRenderer, GLRenderer } from './renderer-context';
export type { RendererKind } from './renderer-context';
```

**Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 5: Commit**

```bash
git add src/ui/
git commit -m "feat(ui): add ScrollList GL adapter and dispatcher"
```

---

### Task 4: Wire `GLRenderer` into `PixiApp.tsx`

**Files:**
- Modify: `src/pixi/PixiApp.tsx` (lines 101–119)

**Step 1: Add the import**

In `src/pixi/PixiApp.tsx`, find the existing imports (around line 7–17) and add:

```ts
import { GLRenderer } from '../ui/renderer-context';
```

**Step 2: Wrap the return value**

The existing return block at line 101–119 is:

```tsx
  return (
    <div ref={containerRef} className="h-screen w-screen" style={{ overflow: 'hidden' }}>
      <Application
        ...
      >
        <PixiAppContent />
      </Application>
    </div>
  );
```

Change it to:

```tsx
  return (
    <GLRenderer>
      <div ref={containerRef} className="h-screen w-screen" style={{ overflow: 'hidden' }}>
        <Application
          ...
        >
          <PixiAppContent />
        </Application>
      </div>
    </GLRenderer>
  );
```

**Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 4: Smoke test**

Start dev server (`npm run dev`) and verify the Pixi workbench still loads without errors. The `GLRenderer` is a transparent provider — visible behaviour unchanged.

**Step 5: Commit**

```bash
git add src/pixi/PixiApp.tsx
git commit -m "feat(pixi): wrap Application in GLRenderer context"
```

---

### Task 5: Migrate `PixiInstrumentPanel` to use `ScrollList`

This removes the `PixiDOMOverlay` from the instrument panel. The GL panel now renders instrument rows natively. Advanced features (preset/edit/sample buttons, drag-to-reorder) are deferred to a subsequent task — this establishes the scaffold.

**Files:**
- Modify: `src/pixi/views/tracker/PixiInstrumentPanel.tsx` (full rewrite)

**Step 1: Understand the instrument data shape**

From `useInstrumentStore`:
- `instruments: InstrumentConfig[]` — each has `id: number`, `name: string`, `synthType: string`
- `currentInstrumentId: number | null` — the active selection
- `setCurrentInstrument: (id: number) => void` — selection action

**Step 2: Rewrite `PixiInstrumentPanel`**

Replace the entire file content with:

```tsx
/**
 * PixiInstrumentPanel — GL-native instrument list.
 * Replaces the previous PixiDOMOverlay bridge with a direct ScrollList.
 * Feature parity with the DOM InstrumentList (preset/edit/drag) is deferred.
 */

import React, { useCallback } from 'react';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { ScrollList } from '../../../ui/components/ScrollList';
import type { ScrollListItem } from '../../../ui/components/ScrollList';

interface PixiInstrumentPanelProps {
  width: number;
  height: number;
}

export const PixiInstrumentPanel: React.FC<PixiInstrumentPanelProps> = ({ width, height }) => {
  const instruments = useInstrumentStore((s) => s.instruments);
  const currentId   = useInstrumentStore((s) => s.currentInstrumentId);
  const select      = useInstrumentStore((s) => s.setCurrentInstrument);

  const items: ScrollListItem[] = instruments.map((inst) => ({
    id: String(inst.id),
    label: inst.name || `Instrument ${inst.id}`,
    sublabel: inst.synthType,
  }));

  const handleSelect = useCallback((id: string) => {
    select(Number(id));
  }, [select]);

  return (
    <ScrollList
      items={items}
      selectedId={currentId !== null ? String(currentId) : null}
      onSelect={handleSelect}
      height={height}
      width={width}
      layout={{ width, height }}
    />
  );
};
```

**Step 3: Verify the import path resolves**

`useInstrumentStore` is at `@stores/useInstrumentStore`. Check the tsconfig paths alias:

```bash
grep -n "stores" tsconfig.json tsconfig.app.json 2>/dev/null | head -5
```

Expected: `"@stores/*": ["src/stores/*"]` or similar.

**Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors. If `setCurrentInstrument` doesn't match — check exact name:

```bash
grep -n "setCurrentInstrument\|selectInstrument\|setSelected" src/stores/useInstrumentStore.ts | head -10
```

Adjust the store method name in the file if needed.

**Step 5: Smoke test**

1. Open the Pixi workbench (`npm run dev`, switch to WebGL mode if needed).
2. Open the Tracker view — the instrument panel should show a scrollable list of instruments with name and synth type.
3. Click an instrument — it should become selected (highlighted) and update the store.
4. Add several instruments and verify scrolling works.
5. Verify the 3D tilt button (3D in NavBar) still works — the panel is now GL-native and stays visible during tilt.

**Step 6: Commit**

```bash
git add src/pixi/views/tracker/PixiInstrumentPanel.tsx
git commit -m "feat(pixi): migrate PixiInstrumentPanel to GL-native ScrollList

Removes PixiDOMOverlay bridge and lazy DOM InstrumentList load.
Instrument rows now render in WebGL using the unified ScrollList
component, which stays visible during 3D tilt. Feature parity
(preset/edit/sample buttons, drag-to-reorder) is a subsequent phase."
```

---

## What is NOT in scope (deferred)

| Feature | Location | Notes |
|---------|----------|-------|
| Instrument panel toolbar (add/edit/preset/sample buttons) | `PixiInstrumentPanel` | Next phase — needs GL Button toolbar |
| DJ browser panels (playlists, modland, serato) | `PixiDJView.tsx:77–84` | Each is a rich multi-feature panel, not a simple list |
| Dropdown / Select unified component | `PixiDJView` other overlays | Next component to build after ScrollList is proven |

## Automated verification checklist

```bash
npx tsc --noEmit          # zero errors
npm run lint              # zero new warnings
```

## Manual verification checklist

- [ ] Pixi workbench loads without console errors
- [ ] Instrument panel shows scrollable list with name + synth type columns
- [ ] Clicking an item selects it (highlighted row) and activates that instrument in the editor
- [ ] Double-click is wired (calls `onDoubleClick` — no handler yet, but no crash)
- [ ] Scrolling via mouse wheel works
- [ ] Scrollbar drag works
- [ ] 3D tilt toggle (NavBar → 3D): instrument panel STAYS VISIBLE (no DOM hiding)
- [ ] DOM tracker view (non-GL mode): `ScrollList` renders as DOM div list
