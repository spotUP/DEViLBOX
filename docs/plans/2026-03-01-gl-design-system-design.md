---
date: 2026-03-01
topic: gl-design-system
tags: [pixi, ui, design-system, gl, dom]
status: draft
---

# Renderer-Aware Unified Design System

## Problem

The GL workbench uses `PixiDOMOverlay` bridges to render DOM components inside
the Pixi layout tree. These overlays are hidden during WebGL 3D tilt (they can't
participate in GL transforms), introduce layout drift bugs, and prevent the GL
UI from looking truly native. There are 9 `PixiDOMOverlay` usages and 3
`createPortal` usages to eliminate.

## Goal

A renderer-aware design system: one import per component, renders DOM `<div>`
or Pixi `<pixiContainer>` automatically based on whether the component is inside
a Pixi `<Application>` tree. DOM remains the blueprint — GL must look identical.

```tsx
import { ScrollList } from '@/ui/ScrollList';
// In DOM tree   → <div class="scroll-list"> ... </div>
// In Pixi tree  → <pixiContainer> with virtualized Pixi rows
```

## Architecture: Renderer Context Discriminator

A React context (`RendererCtx`) carries the string `'dom' | 'gl'`. The Pixi app
sets it to `'gl'`; all other trees default to `'dom'`.

### Context Layer

**New file:** `src/ui/renderer-context.ts`

```ts
import { createContext, useContext } from 'react';

export type RendererKind = 'dom' | 'gl';
export const RendererCtx = createContext<RendererKind>('dom');
export const useRenderer = (): RendererKind => useContext(RendererCtx);

export const GLRenderer: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <RendererCtx.Provider value="gl">{children}</RendererCtx.Provider>
);
```

### Integration Point

**File:** `src/pixi/PixiApp.tsx` line 101–118

Wrap the outer `<div>` with `<GLRenderer>`:

```tsx
return (
  <GLRenderer>
    <div ref={containerRef} className="h-screen w-screen" style={{ overflow: 'hidden' }}>
      <Application ...>
        <PixiAppContent />
      </Application>
    </div>
  </GLRenderer>
);
```

Every component inside the Pixi Application tree inherits `'gl'`. All DOM trees
(NavBar, settings panels, modals) remain at the default `'dom'`.

## File Structure

```
src/ui/
  renderer-context.ts              ← RendererCtx, useRenderer, GLRenderer
  index.ts                         ← re-exports all unified components
  components/
    ScrollList/
      types.ts                     ← ScrollListItem + ScrollListProps
      ScrollList.tsx               ← dispatcher: useRenderer() → dom | gl
      ScrollList.dom.tsx           ← <div> + CSS overflow-y scroll
      ScrollList.gl.tsx            ← Pixi virtualized rows + wheel scroll
      index.ts                     ← export { ScrollList }
```

Future components follow the identical pattern: `Button/`, `Dropdown/`, etc.

## ScrollList — First Component

ScrollList is the highest-value first target: it powers InstrumentList
(`PixiInstrumentPanel`) and the DJ browser panels (`PixiDJView`), which are the
largest PixiDOMOverlay consumers.

### Shared API (types.ts)

```ts
export interface ScrollListItem {
  id: string;
  label: string;
  meta?: string;     // secondary text (e.g. synth type)
  icon?: string;     // icon key shared by both renderers
  indent?: number;   // tree indentation level (0 = root)
}

export interface ScrollListProps {
  items: ScrollListItem[];
  selectedId?: string;
  onSelect: (id: string) => void;
  height: number;       // required — both renderers need explicit height
  itemHeight?: number;  // default 24px
  width?: number;       // GL needs explicit width for clip rect
}
```

### Dispatcher (ScrollList.tsx)

```tsx
import { useRenderer } from '../../renderer-context';
import { DOMScrollList } from './ScrollList.dom';
import { GLScrollList } from './ScrollList.gl';

export const ScrollList: React.FC<ScrollListProps> = (props) => {
  const r = useRenderer();
  return r === 'gl' ? <GLScrollList {...props} /> : <DOMScrollList {...props} />;
};
```

### DOM Implementation (ScrollList.dom.tsx)

```tsx
<div
  className="scroll-list"
  style={{ height, overflowY: 'auto' }}
  role="listbox"
>
  {items.map((item) => (
    <div
      key={item.id}
      role="option"
      aria-selected={item.id === selectedId}
      className={`scroll-list-item ${item.id === selectedId ? 'selected' : ''}`}
      style={{ height: itemHeight, paddingLeft: (item.indent ?? 0) * 12 }}
      onClick={() => onSelect(item.id)}
    >
      {item.icon && <span className="scroll-list-icon">{item.icon}</span>}
      <span className="scroll-list-label">{item.label}</span>
      {item.meta && <span className="scroll-list-meta">{item.meta}</span>}
    </div>
  ))}
</div>
```

CSS tokens match the existing design system (same colors as `InstrumentList`).

### GL Implementation (ScrollList.gl.tsx)

Pure Pixi — no DOM elements:

- `<pixiContainer>` with explicit `width` and `height` layout props
- Scissor rect via Pixi mask (`pixiGraphics` rect mask on the container)
- `onWheel` event updates `scrollOffset` (clamped to content height)
- Virtualized: only renders rows whose Y falls within the visible window
- Each row: `pixiGraphics` (selected background) + `pixiBitmapText` (label) +
  optional `pixiBitmapText` (meta, muted)
- Colors from `usePixiTheme()` — same token values as DOM CSS vars

### Design Tokens (shared)

Both renderers reference the same logical tokens:

| Token             | DOM CSS                        | GL (usePixiTheme)         |
|-------------------|-------------------------------|---------------------------|
| row height        | `itemHeight` prop (24px)      | `itemHeight` prop (24px)  |
| selected bg       | `--color-bg-selected`         | `theme.bgSelected.color`  |
| hover bg          | `--color-bg-hover`            | `theme.bgHover.color`     |
| label text        | `--color-text`                | `theme.text.color`        |
| meta text         | `--color-text-muted`          | `theme.textMuted.color`   |
| font              | `"JetBrains Mono", monospace` | `PIXI_FONTS.MONO` 11px    |

## Migration Plan (after ScrollList is implemented)

### PixiInstrumentPanel

**File:** `src/pixi/views/tracker/PixiInstrumentPanel.tsx`

Replace `PixiDOMOverlay` + lazy `InstrumentList` with `<ScrollList>`. The caller
(`PixiTrackerView`) provides instrument items mapped from store.

### PixiDJView browser panels

**File:** `src/pixi/views/PixiDJView.tsx`

The 280px browser panel overlay (playlists, modland, serato) becomes a `<ScrollList>`
per panel. The DJ store provides the file/directory item arrays.

## What Stays as DOM

These `PixiDOMOverlay` usages are NOT replaced (they legitimately need DOM):

| Component              | Reason                                              |
|------------------------|-----------------------------------------------------|
| `PixiTextInput`        | IME composition, clipboard, OS keyboard routing     |
| `PixiContextMenu`      | System context menu positioning semantics           |
| `WebGLModalBridge`     | Modals need to escape the GL stacking context       |
| `PixiVJView`           | Butterchurn has its own WebGL context               |

## Verification

After each migration step:
1. `tsc --noEmit` — no type errors
2. Visual parity check: DOM and GL ScrollList must be pixel-equivalent in layout
3. Interaction check: select, scroll, keyboard nav work in both renderers
4. 3D tilt: GL ScrollList remains visible during tilt (no PixiDOMOverlay hiding)
