# Pure WebGL UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all `PixiDOMOverlay` usage in the main UI chrome with pure Pixi/WebGL components, achieving pixel-perfect 1:1 parity with the DOM UI and full resolution independence via MSDF fonts.

**Architecture:** Every UI element (toolbar, nav, status bar, controls bar) is rendered as Pixi primitives using `pixiContainer` / `pixiGraphics` / `pixiBitmapText` JSX elements in the `@pixi/react` reconciler. Text uses MSDF BitmapFont atlases (already loaded by `fonts.ts`) for crisp rendering at any zoom or DPR. `PixiDOMOverlay` is retained only for collaboration components.

**Tech Stack:** React 18, Pixi v8, `@pixi/react`, `@pixi/layout` (Yoga flexbox), Zustand, TypeScript, `msdf-bmfont-xml`

**Design doc:** `docs/plans/2026-02-28-pure-webgl-ui.md`

---

## Key patterns — read before starting

All Pixi components follow this structure (see `src/pixi/components/PixiButton.tsx` as reference):

```tsx
import { useCallback, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';

export const MyComponent: React.FC<Props> = ({ ... }) => {
  const theme = usePixiTheme();     // numeric colors from CSS theme tokens
  const [hovered, setHovered] = useState(false);

  const draw = useCallback((g: GraphicsType) => {
    g.clear();
    g.roundRect(0, 0, width, height, 4);
    g.fill({ color: theme.bgTertiary.color });
    g.stroke({ color: theme.border.color, alpha: 0.6, width: 1 });
  }, [width, height, theme, hovered]);

  return (
    <pixiContainer
      eventMode="static"
      cursor="pointer"
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      layout={{ width, height, flexDirection: 'row', alignItems: 'center' }}
    >
      <pixiGraphics draw={draw} layout={{ position: 'absolute', width, height }} />
      <pixiBitmapText
        text="Label"
        style={{ fontFamily: PIXI_FONTS.SANS_SEMIBOLD, fontSize: 11, fill: 0xffffff }}
        tint={theme.text.color}
        layout={{}}
      />
    </pixiContainer>
  );
};
```

- `theme.X.color` is a `0xRRGGBB` number; `theme.X.alpha` is a float
- `layout` prop uses Yoga flexbox — same properties as CSS (`flexDirection`, `alignItems`, `gap`, `padding`, etc.)
- `pixiGraphics draw={fn}` — the function receives a `Graphics` instance and is called when the component renders
- `zIndex` prop on `pixiContainer` controls render order (higher = on top)

---

## Phase 1 — Generate MSDF Font Atlases

### Task 1: Run font generation script

**Files:**
- Script already exists: `scripts/generate-msdf-fonts.sh`
- Output: `public/fonts/msdf/*.json + *.png` (6 pairs)
- TTF sources downloaded to: `public/fonts/ttf/` (gitignored)

**Step 1: Run the script**
```bash
cd /Users/spot/Code/DEViLBOX
chmod +x scripts/generate-msdf-fonts.sh
./scripts/generate-msdf-fonts.sh
```
Expected: Downloads Inter and JetBrains Mono TTFs, generates 6 MSDF atlas pairs. Takes ~30s.

**Step 2: Verify output**
```bash
ls -la public/fonts/msdf/
```
Expected: 12 files — `.json` + `.png` for each of: `Inter-Regular`, `Inter-Medium`, `Inter-SemiBold`, `Inter-Bold`, `JetBrainsMono-Regular`, `JetBrainsMono-Bold`.

**Step 3: Check fonts load in app**
Start dev server, open GL mode, confirm text is sharp and not using fallback fonts. In browser console, no `[MSDF]` warnings.

**Step 4: Check fonts.ts knows what format to expect**
The script outputs `.fnt` files (XML). But `fonts.ts` loads `.json` paths. Check what format the script actually outputs:
```bash
head -5 public/fonts/msdf/JetBrainsMono-Regular.json 2>/dev/null || head -5 public/fonts/msdf/JetBrainsMono-Regular.fnt 2>/dev/null
```
If it outputs `.fnt` (XML) instead of `.json`, update `fonts.ts` paths from `.json` → `.fnt`:
- Modify: `src/pixi/fonts.ts:43-48` — change `path: '/fonts/msdf/X.json'` to `path: '/fonts/msdf/X.fnt'`

**Step 5: Add `.gitignore` entry for TTF sources**
```bash
echo "public/fonts/ttf/" >> .gitignore
```

**Step 6: Commit**
```bash
git add public/fonts/msdf/ .gitignore src/pixi/fonts.ts
git commit -m "feat: generate and commit MSDF font atlases for pure WebGL text rendering"
```

---

## Phase 2 — New Pixi Primitive Components

### Task 2: `PixiPureTextInput` — cursor-based text input with no DOM backing

**Files:**
- Create: `src/pixi/input/PixiPureTextInput.tsx`
- Modify: `src/pixi/components/index.ts` (add export)

**Step 1: Create the component**

```tsx
// src/pixi/input/PixiPureTextInput.tsx
/**
 * PixiPureTextInput — Pure Pixi text input. No DOM <input> element.
 * Handles keyboard capture, cursor, selection, copy/paste via Pixi events.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';

interface PixiPureTextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  onCancel?: () => void;
  placeholder?: string;
  width?: number;
  height?: number;
  fontSize?: number;
  font?: 'mono' | 'sans';
  /** Restrict to numeric input */
  numeric?: boolean;
  min?: number;
  max?: number;
  disabled?: boolean;
  layout?: Record<string, unknown>;
}

const PADDING_H = 6;
const CURSOR_WIDTH = 1;
const BLINK_MS = 530;

export const PixiPureTextInput: React.FC<PixiPureTextInputProps> = ({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder = '',
  width = 120,
  height = 24,
  fontSize = 12,
  font = 'mono',
  numeric = false,
  min,
  max,
  disabled = false,
  layout: layoutProp,
}) => {
  const theme = usePixiTheme();
  const [focused, setFocused] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);
  const [selStart, setSelStart] = useState(0);
  const [selEnd, setSelEnd] = useState(0);
  const [cursorVisible, setCursorVisible] = useState(true);

  const valueRef = useRef(value);
  const cursorPosRef = useRef(cursorPos);
  const selStartRef = useRef(selStart);
  const selEndRef = useRef(selEnd);
  const onChangeRef = useRef(onChange);
  const onSubmitRef = useRef(onSubmit);
  const onCancelRef = useRef(onCancel);

  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => { cursorPosRef.current = cursorPos; }, [cursorPos]);
  useEffect(() => { selStartRef.current = selStart; }, [selStart]);
  useEffect(() => { selEndRef.current = selEnd; }, [selEnd]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onSubmitRef.current = onSubmit; }, [onSubmit]);
  useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);

  // Cursor blink
  useEffect(() => {
    if (!focused) { setCursorVisible(true); return; }
    const id = setInterval(() => setCursorVisible(v => !v), BLINK_MS);
    return () => clearInterval(id);
  }, [focused]);

  // Click-outside to blur
  useEffect(() => {
    if (!focused) return;
    const handler = () => setFocused(false);
    // Use capture phase so it fires before Pixi pointer events
    document.addEventListener('pointerdown', handler, true);
    return () => document.removeEventListener('pointerdown', handler, true);
  }, [focused]);

  // Keyboard handler when focused
  useEffect(() => {
    if (!focused) return;

    const handler = (e: KeyboardEvent) => {
      e.stopPropagation(); // don't fire global keyboard shortcuts
      const v = valueRef.current;
      const pos = cursorPosRef.current;
      const ss = selStartRef.current;
      const se = selEndRef.current;
      const hasSelection = ss !== se;

      if (e.key === 'Enter') {
        e.preventDefault();
        onSubmitRef.current?.(v);
        setFocused(false);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancelRef.current?.();
        setFocused(false);
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const newPos = e.shiftKey ? pos : Math.max(0, pos - 1);
        if (e.shiftKey) {
          setSelEnd(Math.max(0, pos - 1));
        } else {
          const target = hasSelection ? Math.min(ss, se) : Math.max(0, pos - 1);
          setCursorPos(target); setSelStart(target); setSelEnd(target);
        }
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) {
          setSelEnd(Math.min(v.length, pos + 1));
        } else {
          const target = hasSelection ? Math.max(ss, se) : Math.min(v.length, pos + 1);
          setCursorPos(target); setSelStart(target); setSelEnd(target);
        }
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        setCursorPos(0); setSelStart(0); setSelEnd(0);
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        setCursorPos(v.length); setSelStart(v.length); setSelEnd(v.length);
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        let newVal: string;
        let newPos: number;
        if (hasSelection) {
          const lo = Math.min(ss, se), hi = Math.max(ss, se);
          newVal = v.slice(0, lo) + v.slice(hi);
          newPos = lo;
        } else if (pos > 0) {
          newVal = v.slice(0, pos - 1) + v.slice(pos);
          newPos = pos - 1;
        } else return;
        onChangeRef.current(newVal);
        setCursorPos(newPos); setSelStart(newPos); setSelEnd(newPos);
        return;
      }
      if (e.key === 'Delete') {
        e.preventDefault();
        let newVal: string;
        let newPos: number;
        if (hasSelection) {
          const lo = Math.min(ss, se), hi = Math.max(ss, se);
          newVal = v.slice(0, lo) + v.slice(hi);
          newPos = lo;
        } else if (pos < v.length) {
          newVal = v.slice(0, pos) + v.slice(pos + 1);
          newPos = pos;
        } else return;
        onChangeRef.current(newVal);
        setCursorPos(newPos); setSelStart(newPos); setSelEnd(newPos);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        setSelStart(0); setSelEnd(v.length); setCursorPos(v.length);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        if (hasSelection) {
          const lo = Math.min(ss, se), hi = Math.max(ss, se);
          navigator.clipboard.writeText(v.slice(lo, hi)).catch(() => {});
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
        navigator.clipboard.readText().then(pasted => {
          const cv = valueRef.current;
          const cp = cursorPosRef.current;
          const css = selStartRef.current;
          const cse = selEndRef.current;
          const lo = Math.min(css, cse), hi = Math.max(css, cse);
          const newVal = cv.slice(0, lo) + pasted + cv.slice(hi);
          const newPos = lo + pasted.length;
          onChangeRef.current(newVal);
          setCursorPos(newPos); setSelStart(newPos); setSelEnd(newPos);
        }).catch(() => {});
        return;
      }
      // Printable character
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const lo = hasSelection ? Math.min(ss, se) : pos;
        const hi = hasSelection ? Math.max(ss, se) : pos;
        let inserted = e.key;
        if (numeric) {
          if (!/^[\d.\-]$/.test(inserted)) return;
        }
        const newVal = v.slice(0, lo) + inserted + v.slice(hi);
        const newPos = lo + inserted.length;
        // Clamp if numeric
        if (numeric && min !== undefined && max !== undefined) {
          const num = parseFloat(newVal);
          if (!isNaN(num) && (num < min || num > max)) return;
        }
        onChangeRef.current(newVal);
        setCursorPos(newPos); setSelStart(newPos); setSelEnd(newPos);
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [focused, numeric, min, max]);

  // Approximate character width (monospace: all chars same width)
  const charWidth = fontSize * (font === 'mono' ? 0.6 : 0.55);

  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    if (disabled) return;
    e.stopPropagation();
    setFocused(true);
    // Estimate cursor position from click X
    const localX = e.globalX - (e.target as any).getGlobalPosition().x - PADDING_H;
    const clickPos = Math.max(0, Math.min(value.length, Math.round(localX / charWidth)));
    setCursorPos(clickPos); setSelStart(clickPos); setSelEnd(clickPos);
    setCursorVisible(true);
  }, [disabled, value.length, charWidth]);

  const displayText = value || (focused ? '' : placeholder);
  const isPlaceholder = !value && !focused;

  // Cursor X position (in text content area)
  const cursorX = PADDING_H + cursorPos * charWidth;
  // Selection rect
  const selLo = Math.min(selStart, selEnd);
  const selHi = Math.max(selStart, selEnd);
  const selX = PADDING_H + selLo * charWidth;
  const selW = (selHi - selLo) * charWidth;
  const hasSelection = selStart !== selEnd;

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.roundRect(0, 0, width, height, 3);
    g.fill({ color: focused ? theme.bg.color : theme.bgSecondary.color });
    g.roundRect(0, 0, width, height, 3);
    g.stroke({
      color: focused ? theme.accent.color : theme.border.color,
      alpha: focused ? 0.8 : 0.6,
      width: focused ? 1.5 : 1,
    });
  }, [width, height, theme, focused]);

  const drawSelection = useCallback((g: GraphicsType) => {
    g.clear();
    if (!hasSelection) return;
    g.rect(selX, 2, selW, height - 4);
    g.fill({ color: theme.accent.color, alpha: 0.3 });
  }, [selX, selW, height, hasSelection, theme]);

  const drawCursor = useCallback((g: GraphicsType) => {
    g.clear();
    if (!focused || !cursorVisible || hasSelection) return;
    g.rect(cursorX, 3, CURSOR_WIDTH, height - 6);
    g.fill({ color: theme.accent.color });
  }, [focused, cursorVisible, cursorX, height, hasSelection, theme]);

  const fontFamily = font === 'mono' ? PIXI_FONTS.MONO : PIXI_FONTS.SANS;

  return (
    <pixiContainer
      eventMode={disabled ? 'none' : 'static'}
      cursor={disabled ? 'default' : 'text'}
      onPointerDown={handlePointerDown}
      alpha={disabled ? 0.4 : 1}
      layout={{ width, height, ...layoutProp }}
    >
      {/* Background + border */}
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height }} />
      {/* Selection highlight */}
      <pixiGraphics draw={drawSelection} layout={{ position: 'absolute', width, height }} />
      {/* Text */}
      <pixiBitmapText
        text={displayText}
        style={{ fontFamily, fontSize, fill: 0xffffff }}
        tint={isPlaceholder ? theme.textMuted.color : theme.text.color}
        alpha={isPlaceholder ? 0.5 : 1}
        layout={{ position: 'absolute', x: PADDING_H, y: (height - fontSize) / 2 }}
      />
      {/* Cursor */}
      <pixiGraphics draw={drawCursor} layout={{ position: 'absolute', width, height }} />
    </pixiContainer>
  );
};
```

**Step 2: `tsc --noEmit`**
Expected: zero errors.

**Step 3: Commit**
```bash
git add src/pixi/input/PixiPureTextInput.tsx
git commit -m "feat(pixi): add PixiPureTextInput — pure Pixi text input with no DOM backing"
```

---

### Task 3: `PixiCheckbox` — simple checkbox primitive

**Files:**
- Create: `src/pixi/components/PixiCheckbox.tsx`

**Step 1: Create the component**

```tsx
// src/pixi/components/PixiCheckbox.tsx
import { useCallback, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';

interface PixiCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  size?: number;
  layout?: Record<string, unknown>;
}

export const PixiCheckbox: React.FC<PixiCheckboxProps> = ({
  checked,
  onChange,
  label,
  disabled = false,
  size = 12,
  layout: layoutProp,
}) => {
  const theme = usePixiTheme();
  const [hovered, setHovered] = useState(false);

  const draw = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, size, size);
    g.fill({ color: checked ? theme.accent.color : theme.bgTertiary.color, alpha: checked ? 0.8 : 1 });
    g.rect(0, 0, size, size);
    g.stroke({
      color: hovered || checked ? theme.accent.color : theme.border.color,
      alpha: hovered || checked ? 0.8 : 0.6,
      width: 1,
    });
  }, [size, checked, hovered, theme]);

  const totalWidth = size + (label ? 6 + label.length * 7 : 0);

  return (
    <pixiContainer
      eventMode={disabled ? 'none' : 'static'}
      cursor="pointer"
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onPointerUp={() => !disabled && onChange(!checked)}
      alpha={disabled ? 0.4 : 1}
      layout={{ width: totalWidth, height: size, flexDirection: 'row', alignItems: 'center', gap: 6, ...layoutProp }}
    >
      <pixiGraphics draw={draw} layout={{ width: size, height: size }} />
      {label && (
        <pixiBitmapText
          text={label}
          style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 11, fill: 0xffffff }}
          tint={checked ? theme.text.color : theme.textSecondary.color}
          layout={{}}
        />
      )}
    </pixiContainer>
  );
};
```

**Step 2: `tsc --noEmit`**

**Step 3: Commit**
```bash
git add src/pixi/components/PixiCheckbox.tsx
git commit -m "feat(pixi): add PixiCheckbox component"
```

---

### Task 4: `PixiDropdownPanel` + `PixiSelect` — select/dropdown

**Files:**
- Create: `src/pixi/components/PixiSelect.tsx` (contains both `PixiDropdownPanel` and `PixiSelect`)

**Step 1: Create the component**

```tsx
// src/pixi/components/PixiSelect.tsx
/**
 * PixiSelect — Dropdown select replacing DOM <select>.
 * PixiDropdownPanel — Shared dropdown panel used by PixiSelect and PixiMenuBar.
 */
import { useCallback, useState } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';

export interface SelectOption {
  value: string;
  label: string;
  group?: string;
  disabled?: boolean;
}

interface PixiDropdownPanelProps {
  options: SelectOption[];
  onSelect: (value: string) => void;
  onClose: () => void;
  width: number;
  /** Max visible items before scroll */
  maxItems?: number;
  itemHeight?: number;
}

const ITEM_H = 22;
const PANEL_PADDING = 4;

/** Shared dropdown panel — floats above other content via zIndex */
export const PixiDropdownPanel: React.FC<PixiDropdownPanelProps> = ({
  options,
  onSelect,
  onClose,
  width,
  maxItems = 12,
  itemHeight = ITEM_H,
}) => {
  const theme = usePixiTheme();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const visibleCount = Math.min(options.length, maxItems);
  const panelH = visibleCount * itemHeight + PANEL_PADDING * 2;

  const drawPanel = useCallback((g: GraphicsType) => {
    g.clear();
    g.roundRect(0, 0, width, panelH, 4);
    g.fill({ color: theme.bgSecondary.color });
    g.roundRect(0, 0, width, panelH, 4);
    g.stroke({ color: theme.border.color, alpha: 0.8, width: 1 });
  }, [width, panelH, theme]);

  const drawItemBg = useCallback((g: GraphicsType, index: number) => {
    g.clear();
    if (hoveredIndex !== index) return;
    g.rect(0, 0, width - PANEL_PADDING * 2, itemHeight);
    g.fill({ color: theme.accent.color, alpha: 0.2 });
  }, [hoveredIndex, width, itemHeight, theme]);

  // Close on outside click
  useCallback(() => {
    const handler = () => onClose();
    document.addEventListener('pointerdown', handler, { once: true, capture: true });
    return () => document.removeEventListener('pointerdown', handler, true);
  }, [onClose]);

  return (
    <pixiContainer
      zIndex={200}
      layout={{
        position: 'absolute',
        width,
        height: panelH,
        flexDirection: 'column',
        padding: PANEL_PADDING,
        gap: 0,
      }}
      eventMode="static"
      onPointerDown={(e: FederatedPointerEvent) => e.stopPropagation()}
    >
      <pixiGraphics
        draw={drawPanel}
        layout={{ position: 'absolute', width, height: panelH }}
      />
      {options.map((opt, i) => {
        const isGroup = opt.value === '__group__';
        return (
          <pixiContainer
            key={`${opt.value}-${i}`}
            eventMode={isGroup || opt.disabled ? 'none' : 'static'}
            cursor={isGroup || opt.disabled ? 'default' : 'pointer'}
            onPointerOver={() => !isGroup && !opt.disabled && setHoveredIndex(i)}
            onPointerOut={() => setHoveredIndex(null)}
            onPointerUp={() => { if (!isGroup && !opt.disabled) { onSelect(opt.value); onClose(); } }}
            layout={{ width: width - PANEL_PADDING * 2, height: itemHeight, alignItems: 'center', paddingLeft: isGroup ? 4 : 8 }}
          >
            <pixiGraphics
              draw={(g) => drawItemBg(g, i)}
              layout={{ position: 'absolute', width: width - PANEL_PADDING * 2, height: itemHeight }}
            />
            <pixiBitmapText
              text={opt.label}
              style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 11, fill: 0xffffff }}
              tint={isGroup ? theme.textMuted.color : opt.disabled ? theme.textMuted.color : theme.text.color}
              alpha={isGroup ? 0.7 : opt.disabled ? 0.4 : 1}
              layout={{}}
            />
          </pixiContainer>
        );
      })}
    </pixiContainer>
  );
};

interface PixiSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  width?: number;
  height?: number;
  placeholder?: string;
  disabled?: boolean;
  layout?: Record<string, unknown>;
}

export const PixiSelect: React.FC<PixiSelectProps> = ({
  options,
  value,
  onChange,
  width = 120,
  height = 24,
  placeholder = 'Select...',
  disabled = false,
  layout: layoutProp,
}) => {
  const theme = usePixiTheme();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);

  const selectedLabel = options.find(o => o.value === value)?.label ?? placeholder;

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.roundRect(0, 0, width, height, 3);
    g.fill({ color: open ? theme.bgHover.color : hovered ? theme.bgHover.color : theme.bgTertiary.color });
    g.roundRect(0, 0, width, height, 3);
    g.stroke({ color: open ? theme.accent.color : theme.border.color, alpha: open ? 0.7 : 0.6, width: 1 });
  }, [width, height, open, hovered, theme]);

  return (
    <pixiContainer
      eventMode={disabled ? 'none' : 'static'}
      cursor={disabled ? 'default' : 'pointer'}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onPointerUp={() => setOpen(o => !o)}
      alpha={disabled ? 0.4 : 1}
      layout={{ width, height, ...layoutProp }}
    >
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height }} />
      {/* Selected label */}
      <pixiBitmapText
        text={selectedLabel}
        style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 11, fill: 0xffffff }}
        tint={theme.textSecondary.color}
        layout={{ position: 'absolute', x: 6, y: (height - 11) / 2 }}
      />
      {/* Chevron */}
      <pixiBitmapText
        text="▾"
        style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 10, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{ position: 'absolute', x: width - 14, y: (height - 10) / 2 }}
      />
      {/* Dropdown panel */}
      {open && (
        <PixiDropdownPanel
          options={options}
          onSelect={onChange}
          onClose={() => setOpen(false)}
          width={Math.max(width, 160)}
          layout={{ position: 'absolute', top: height + 2 }}
        />
      )}
    </pixiContainer>
  );
};
```

**Step 2: `tsc --noEmit`**

**Step 3: Commit**
```bash
git add src/pixi/components/PixiSelect.tsx
git commit -m "feat(pixi): add PixiSelect and PixiDropdownPanel components"
```

---

### Task 5: `PixiMenuBar` — horizontal menu bar with dropdown menus

**Files:**
- Create: `src/pixi/components/PixiMenuBar.tsx`

**Step 1: Create the component**

```tsx
// src/pixi/components/PixiMenuBar.tsx
/**
 * PixiMenuBar — Horizontal menu bar with dropdown menus.
 * Used by PixiFT2Toolbar for File / Edit / Module / Help menus.
 */
import { useCallback, useState } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';

export type MenuSeparator = { type: 'separator' };
export type MenuAction = { type: 'action'; label: string; shortcut?: string; onClick: () => void; disabled?: boolean };
export type MenuCheckbox = { type: 'checkbox'; label: string; checked: boolean; onChange: (v: boolean) => void };
export type MenuItem = MenuSeparator | MenuAction | MenuCheckbox;
export interface Menu { label: string; items: MenuItem[] }

interface PixiMenuBarProps {
  menus: Menu[];
  height?: number;
  layout?: Record<string, unknown>;
}

const MENU_BTN_PADDING = 10;
const ITEM_H = 22;
const SEP_H = 9;
const DROPDOWN_MIN_W = 200;
const SHORTCUT_COL_W = 80;

function itemHeight(item: MenuItem) {
  return item.type === 'separator' ? SEP_H : ITEM_H;
}

export const PixiMenuBar: React.FC<PixiMenuBarProps> = ({
  menus,
  height = 24,
  layout: layoutProp,
}) => {
  const theme = usePixiTheme();
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);

  const openMenu = useCallback((i: number) => setOpenMenuIndex(i), []);
  const closeAll = useCallback(() => setOpenMenuIndex(null), []);

  const drawBar = useCallback((g: GraphicsType) => {
    g.clear();
    // No background — inherits from parent toolbar
  }, []);

  return (
    <pixiContainer
      layout={{ flexDirection: 'row', height, alignItems: 'center', ...layoutProp }}
      eventMode="static"
    >
      <pixiGraphics draw={drawBar} layout={{ position: 'absolute' }} />
      {menus.map((menu, i) => {
        const isOpen = openMenuIndex === i;
        return (
          <PixiMenuButton
            key={menu.label}
            menu={menu}
            isOpen={isOpen}
            height={height}
            onOpen={() => openMenu(i)}
            onClose={closeAll}
            // Hover-open: if another menu is open, switch to this one
            onHoverOpen={() => { if (openMenuIndex !== null && openMenuIndex !== i) openMenu(i); }}
          />
        );
      })}
    </pixiContainer>
  );
};

interface PixiMenuButtonProps {
  menu: Menu;
  isOpen: boolean;
  height: number;
  onOpen: () => void;
  onClose: () => void;
  onHoverOpen: () => void;
}

const PixiMenuButton: React.FC<PixiMenuButtonProps> = ({
  menu, isOpen, height, onOpen, onClose, onHoverOpen,
}) => {
  const theme = usePixiTheme();
  const [hovered, setHovered] = useState(false);

  // Estimate button width from label
  const btnW = menu.label.length * 8 + MENU_BTN_PADDING * 2;

  const drawBtnBg = useCallback((g: GraphicsType) => {
    g.clear();
    if (!isOpen && !hovered) return;
    g.rect(0, 0, btnW, height);
    g.fill({ color: isOpen ? theme.accent.color : theme.bgHover.color, alpha: isOpen ? 0.25 : 0.5 });
  }, [isOpen, hovered, btnW, height, theme]);

  // Compute dropdown height
  const dropdownH = menu.items.reduce((sum, item) => sum + itemHeight(item), 0) + 8;
  const dropdownW = DROPDOWN_MIN_W;

  const drawDropdownBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.roundRect(0, 0, dropdownW, dropdownH, 4);
    g.fill({ color: theme.bgSecondary.color });
    g.roundRect(0, 0, dropdownW, dropdownH, 4);
    g.stroke({ color: theme.border.color, alpha: 0.8, width: 1 });
  }, [dropdownW, dropdownH, theme]);

  return (
    <pixiContainer
      eventMode="static"
      cursor="pointer"
      onPointerOver={() => { setHovered(true); onHoverOpen(); }}
      onPointerOut={() => setHovered(false)}
      onPointerUp={() => isOpen ? onClose() : onOpen()}
      layout={{ width: btnW, height, justifyContent: 'center', alignItems: 'center' }}
    >
      <pixiGraphics draw={drawBtnBg} layout={{ position: 'absolute', width: btnW, height }} />
      <pixiBitmapText
        text={menu.label}
        style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 11, fill: 0xffffff }}
        tint={isOpen ? theme.accent.color : theme.textSecondary.color}
        layout={{}}
      />
      {/* Dropdown */}
      {isOpen && (
        <pixiContainer
          zIndex={300}
          eventMode="static"
          onPointerDown={(e: FederatedPointerEvent) => e.stopPropagation()}
          layout={{ position: 'absolute', top: height, left: 0, width: dropdownW, height: dropdownH, flexDirection: 'column', padding: 4 }}
        >
          <pixiGraphics draw={drawDropdownBg} layout={{ position: 'absolute', width: dropdownW, height: dropdownH }} />
          {menu.items.map((item, j) => (
            <PixiMenuItem key={j} item={item} width={dropdownW - 8} onClose={onClose} />
          ))}
        </pixiContainer>
      )}
    </pixiContainer>
  );
};

interface PixiMenuItemProps {
  item: MenuItem;
  width: number;
  onClose: () => void;
}

const PixiMenuItem: React.FC<PixiMenuItemProps> = ({ item, width, onClose }) => {
  const theme = usePixiTheme();
  const [hovered, setHovered] = useState(false);
  const h = itemHeight(item);

  if (item.type === 'separator') {
    return (
      <pixiContainer layout={{ width, height: h, justifyContent: 'center' }}>
        <pixiGraphics
          draw={(g: GraphicsType) => {
            g.clear();
            g.rect(0, h / 2 - 0.5, width, 1);
            g.fill({ color: theme.border.color, alpha: 0.5 });
          }}
          layout={{ width, height: h }}
        />
      </pixiContainer>
    );
  }

  const isDisabled = item.type === 'action' && item.disabled;
  const drawItemBg = (g: GraphicsType) => {
    g.clear();
    if (!hovered || isDisabled) return;
    g.roundRect(0, 0, width, h, 2);
    g.fill({ color: theme.accent.color, alpha: 0.2 });
  };

  const handleClick = () => {
    if (isDisabled) return;
    if (item.type === 'action') { item.onClick(); onClose(); }
    else if (item.type === 'checkbox') { item.onChange(!item.checked); }
  };

  const label = item.type === 'checkbox'
    ? `${item.checked ? '✓' : ' '}  ${item.label}`
    : item.label;
  const shortcut = item.type === 'action' ? (item.shortcut ?? '') : '';

  return (
    <pixiContainer
      eventMode={isDisabled ? 'none' : 'static'}
      cursor={isDisabled ? 'default' : 'pointer'}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onPointerUp={handleClick}
      alpha={isDisabled ? 0.4 : 1}
      layout={{ width, height: h, alignItems: 'center', paddingLeft: 8 }}
    >
      <pixiGraphics draw={drawItemBg} layout={{ position: 'absolute', width, height: h }} />
      <pixiBitmapText
        text={label}
        style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 11, fill: 0xffffff }}
        tint={theme.text.color}
        layout={{ flex: 1 }}
      />
      {shortcut && (
        <pixiBitmapText
          text={shortcut}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{ width: SHORTCUT_COL_W, marginRight: 8 }}
        />
      )}
    </pixiContainer>
  );
};
```

**Step 2: `tsc --noEmit`**

**Step 3: Commit**
```bash
git add src/pixi/components/PixiMenuBar.tsx
git commit -m "feat(pixi): add PixiMenuBar with dropdown menus"
```

---

### Task 6: `PixiTabBar` — project tabs

**Files:**
- Create: `src/pixi/components/PixiTabBar.tsx`

**Step 1: Create the component**

```tsx
// src/pixi/components/PixiTabBar.tsx
/**
 * PixiTabBar — Project tabs for PixiNavBar.
 * Scrollable tab pills with close buttons and a new-tab button.
 */
import { useCallback, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';

export interface Tab { id: string; label: string; dirty?: boolean }

interface PixiTabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  width: number;
  height?: number;
  layout?: Record<string, unknown>;
}

const TAB_MIN_W = 80;
const TAB_MAX_W = 160;
const TAB_H = 28;
const CLOSE_BTN_SIZE = 14;
const NEW_BTN_W = 28;
const PADDING_H = 10;

export const PixiTabBar: React.FC<PixiTabBarProps> = ({
  tabs,
  activeTabId,
  onSelect,
  onClose,
  onNew,
  width,
  height = TAB_H,
  layout: layoutProp,
}) => {
  const theme = usePixiTheme();
  const [scrollOffset, setScrollOffset] = useState(0);

  // Estimate tab width: constrained between min/max
  const tabW = Math.max(TAB_MIN_W, Math.min(TAB_MAX_W, Math.floor((width - NEW_BTN_W - 4) / Math.max(1, tabs.length))));
  const totalTabsW = tabs.length * tabW;
  const viewportW = width - NEW_BTN_W - 4;
  const canScrollLeft = scrollOffset > 0;
  const canScrollRight = totalTabsW - scrollOffset > viewportW;

  const drawBar = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, height);
    g.fill({ color: theme.bgTertiary.color });
    g.rect(0, height - 1, width, 1);
    g.fill({ color: theme.border.color, alpha: 0.5 });
  }, [width, height, theme]);

  return (
    <pixiContainer
      layout={{ width, height, flexDirection: 'row', ...layoutProp }}
      eventMode="static"
    >
      <pixiGraphics draw={drawBar} layout={{ position: 'absolute', width, height }} />

      {/* Tab pills container (clipped to viewport) */}
      <pixiContainer
        layout={{ width: viewportW, height, overflow: 'hidden', flexDirection: 'row' }}
      >
        {tabs.map((tab) => (
          <PixiTab
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            width={tabW}
            height={height}
            onSelect={() => onSelect(tab.id)}
            onClose={() => onClose(tab.id)}
            scrollOffset={scrollOffset}
          />
        ))}
        {/* Active tab underline — accent bar at bottom of active tab */}
        {tabs.map((tab, i) => (
          tab.id === activeTabId && (
            <pixiGraphics
              key={`underline-${tab.id}`}
              draw={(g: GraphicsType) => {
                g.clear();
                g.rect(i * tabW - scrollOffset, height - 2, tabW, 2);
                g.fill({ color: theme.accent.color });
              }}
              layout={{ position: 'absolute', width, height }}
            />
          )
        ))}
      </pixiContainer>

      {/* Scroll arrows (shown on overflow) */}
      {canScrollLeft && (
        <PixiTabScrollBtn
          label="◂"
          height={height}
          onClick={() => setScrollOffset(s => Math.max(0, s - tabW))}
        />
      )}
      {canScrollRight && (
        <PixiTabScrollBtn
          label="▸"
          height={height}
          onClick={() => setScrollOffset(s => s + tabW)}
        />
      )}

      {/* New tab button */}
      <PixiTabNewBtn height={height} onClick={onNew} />
    </pixiContainer>
  );
};

interface PixiTabProps {
  tab: Tab;
  isActive: boolean;
  width: number;
  height: number;
  onSelect: () => void;
  onClose: () => void;
  scrollOffset: number;
}

const PixiTab: React.FC<PixiTabProps> = ({
  tab, isActive, width, height, onSelect, onClose, scrollOffset: _scrollOffset,
}) => {
  const theme = usePixiTheme();
  const [hovered, setHovered] = useState(false);

  const maxLabelW = width - PADDING_H * 2 - CLOSE_BTN_SIZE - 4;
  // Truncate label
  const label = tab.label.length > 16 ? tab.label.slice(0, 14) + '…' : tab.label;
  const displayLabel = tab.dirty ? `${label} •` : label;

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    if (isActive) {
      g.rect(0, 0, width, height - 2);
      g.fill({ color: theme.bgSecondary.color });
    } else if (hovered) {
      g.rect(0, 0, width, height - 2);
      g.fill({ color: theme.bgHover.color, alpha: 0.5 });
    }
    // Right separator line
    g.rect(width - 1, 4, 1, height - 8);
    g.fill({ color: theme.border.color, alpha: 0.4 });
  }, [isActive, hovered, width, height, theme]);

  return (
    <pixiContainer
      eventMode="static"
      cursor="pointer"
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onPointerUp={onSelect}
      layout={{ width, height, flexDirection: 'row', alignItems: 'center', paddingLeft: PADDING_H }}
    >
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height }} />
      <pixiBitmapText
        text={displayLabel}
        style={{ fontFamily: PIXI_FONTS.SANS_MEDIUM, fontSize: 11, fill: 0xffffff }}
        tint={isActive ? theme.text.color : theme.textSecondary.color}
        layout={{ flex: 1, maxWidth: maxLabelW }}
      />
      {/* Close button — shown on hover or if active */}
      {(isActive || hovered) && (
        <pixiContainer
          eventMode="static"
          cursor="pointer"
          onPointerUp={(e) => { e.stopPropagation(); onClose(); }}
          layout={{ width: CLOSE_BTN_SIZE, height: CLOSE_BTN_SIZE, justifyContent: 'center', alignItems: 'center', marginRight: 4 }}
        >
          <pixiBitmapText
            text="×"
            style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 13, fill: 0xffffff }}
            tint={hovered ? theme.error.color : theme.textMuted.color}
            layout={{}}
          />
        </pixiContainer>
      )}
    </pixiContainer>
  );
};

const PixiTabScrollBtn: React.FC<{ label: string; height: number; onClick: () => void }> = ({ label, height, onClick }) => {
  const theme = usePixiTheme();
  return (
    <pixiContainer
      eventMode="static"
      cursor="pointer"
      onPointerUp={onClick}
      layout={{ width: 20, height, justifyContent: 'center', alignItems: 'center' }}
    >
      <pixiBitmapText
        text={label}
        style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
        tint={theme.textSecondary.color}
        layout={{}}
      />
    </pixiContainer>
  );
};

const PixiTabNewBtn: React.FC<{ height: number; onClick: () => void }> = ({ height, onClick }) => {
  const theme = usePixiTheme();
  const [hovered, setHovered] = useState(false);
  return (
    <pixiContainer
      eventMode="static"
      cursor="pointer"
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onPointerUp={onClick}
      layout={{ width: NEW_BTN_W, height, justifyContent: 'center', alignItems: 'center' }}
    >
      <pixiBitmapText
        text="+"
        style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 16, fill: 0xffffff }}
        tint={hovered ? theme.accent.color : theme.textSecondary.color}
        layout={{}}
      />
    </pixiContainer>
  );
};
```

**Step 2: `tsc --noEmit`**

**Step 3: Commit**
```bash
git add src/pixi/components/PixiTabBar.tsx
git commit -m "feat(pixi): add PixiTabBar with scrollable tabs and close/new buttons"
```

---

## Phase 3 — Pure `PixiStatusBar`

### Task 7: Rewrite PixiStatusBar without PixiDOMOverlay

**Files:**
- Modify: `src/pixi/shell/PixiStatusBar.tsx` (full rewrite)

The DOM `StatusBar` has two rows: (1) MIDI knob panel (conditional), (2) main status row.
The main status row shows: left = view-specific info (tracker row/channel/mode, DJ deck status, VJ hint), right = MIDI device, tips button, collab badge, audio state.
The MIDI knob panel (80px when shown) has bank tabs and an 8-knob assignment grid.

**Step 1: Rewrite `PixiStatusBar.tsx`**

```tsx
// src/pixi/shell/PixiStatusBar.tsx
/**
 * PixiStatusBar — Pure Pixi status bar. No DOM overlay.
 * Mirrors DOM StatusBar.tsx exactly.
 */
import { useCallback } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { useTrackerStore, useTransportStore, useAudioStore, useMIDIStore, useUIStore } from '@stores';
import { useDJStore } from '@/stores/useDJStore';
import { useCollaborationStore } from '@/stores/useCollaborationStore';
import { useShallow } from 'zustand/react/shallow';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';
import { PixiButton } from '../components/PixiButton';
import { PixiLabel } from '../components/PixiLabel';
import type { KnobBankMode } from '@/midi/types';
import { KNOB_BANKS, type KnobAssignment } from '@/midi/knobBanks';

const STATUS_BAR_H = 32;
const KNOB_PANEL_H = 80;
const BANKS: { id: KnobBankMode; label: string }[] = [
  { id: '303', label: '303/Synth' },
  { id: 'Siren', label: 'Dub Siren' },
  { id: 'FX', label: 'Effects' },
  { id: 'Mixer', label: 'Mixer' },
];

export const PixiStatusBar: React.FC = () => {
  const theme = usePixiTheme();
  const activeView = useUIStore(s => s.activeView);
  const { isInitialized, inputDevices, selectedInputId, showKnobBar, setShowKnobBar, knobBank, setKnobBank } = useMIDIStore();
  const hasMIDIDevice = isInitialized && inputDevices.length > 0;
  const showMIDIPanel = activeView !== 'dj' && activeView !== 'vj' && hasMIDIDevice && showKnobBar;
  const totalH = showMIDIPanel ? STATUS_BAR_H + KNOB_PANEL_H : STATUS_BAR_H;

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    // Top border
    g.rect(0, 0, 5000, 1);
    g.fill({ color: theme.border.color, alpha: 0.5 });
    g.rect(0, 1, 5000, totalH - 1);
    g.fill({ color: theme.bgSecondary.color });
  }, [theme, totalH]);

  return (
    <pixiContainer layout={{ width: '100%', height: totalH, flexDirection: 'column' }}>
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width: '100%', height: totalH }} />

      {/* MIDI Knob Panel */}
      {showMIDIPanel && (
        <PixiMIDIKnobPanel
          knobBank={knobBank}
          setKnobBank={setKnobBank}
          assignments={KNOB_BANKS[knobBank]}
        />
      )}

      {/* Main status row */}
      <pixiContainer layout={{ width: '100%', height: STATUS_BAR_H, flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 16, gap: 16 }}>
        {/* Left: view-specific content */}
        <pixiContainer layout={{ flex: 1, height: STATUS_BAR_H, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          {activeView === 'dj' ? <PixiDJStatus /> :
           activeView === 'vj' ? <PixiVJStatus /> :
           <PixiTrackerStatus />}
        </pixiContainer>

        {/* Right: MIDI, tips, collab, audio */}
        <PixiStatusRight
          hasMIDIDevice={hasMIDIDevice && activeView !== 'dj' && activeView !== 'vj'}
          deviceName={inputDevices.find(d => d.id === selectedInputId)?.name ?? 'MIDI Controller'}
          showKnobBar={showKnobBar}
          onToggleKnobBar={() => setShowKnobBar(!showKnobBar)}
        />
      </pixiContainer>
    </pixiContainer>
  );
};

const PixiTrackerStatus: React.FC = () => {
  const theme = usePixiTheme();
  const { cursor, currentOctave, insertMode, recordMode, patternLength } = useTrackerStore(
    useShallow(s => ({
      cursor: s.cursor,
      currentOctave: s.currentOctave,
      insertMode: s.insertMode,
      recordMode: s.recordMode,
      patternLength: s.patterns[s.currentPatternIndex]?.length || 64,
    }))
  );
  const { isPlaying, currentRow } = useTransportStore(
    useShallow(s => ({ isPlaying: s.isPlaying, currentRow: s.currentRow }))
  );

  const displayRow = isPlaying ? currentRow : cursor.rowIndex;
  const sep = (
    <pixiGraphics
      draw={(g: GraphicsType) => {
        g.clear(); g.rect(0, 4, 1, 12);
        g.fill({ color: theme.border.color, alpha: 0.5 });
      }}
      layout={{ width: 1, height: STATUS_BAR_H }}
    />
  );

  return (
    <>
      <PixiLabel text={`Row `} size="xs" color="textSecondary" font="mono" />
      <PixiLabel text={`${String(displayRow).padStart(2,'0')}/${String(patternLength-1).padStart(2,'0')}`} size="xs" color="accent" font="mono" weight="bold" />
      {sep}
      <PixiLabel text={`Ch ${cursor.channelIndex + 1}`} size="xs" color="textSecondary" font="mono" />
      {sep}
      <PixiLabel text={cursor.columnType} size="xs" color="textSecondary" font="mono" />
      {sep}
      <PixiLabel text="Oct " size="xs" color="textSecondary" font="mono" />
      <PixiLabel text={String(currentOctave)} size="xs" color="accent" font="mono" weight="bold" />
      {sep}
      <PixiLabel text={`Mode: `} size="xs" color="textSecondary" font="mono" />
      <PixiLabel text={insertMode ? 'INS' : 'OVR'} size="xs" color={insertMode ? 'warning' : 'accent'} font="mono" weight="bold" />
      {sep}
      <PixiLabel text={recordMode ? 'REC' : 'EDIT'} size="xs" color={recordMode ? 'error' : 'textSecondary'} font="mono" />
    </>
  );
};

const PixiDJStatus: React.FC = () => {
  const { deck1Playing, deck1BPM, deck2Playing, deck2BPM, crossfader } = useDJStore(
    useShallow(s => ({
      deck1Playing: s.decks.A.isPlaying,
      deck1BPM: s.decks.A.effectiveBPM || 0,
      deck2Playing: s.decks.B.isPlaying,
      deck2BPM: s.decks.B.effectiveBPM || 0,
      crossfader: s.crossfaderPosition,
    }))
  );
  return (
    <>
      <PixiLabel text="D1 " size="xs" color="custom" customColor={0x60a5fa} font="mono" weight="bold" />
      <PixiLabel text={deck1Playing ? 'PLAY' : 'STOP'} size="xs" color={deck1Playing ? 'success' : 'textMuted'} font="mono" />
      <PixiLabel text={`  ${deck1BPM.toFixed(1)} BPM`} size="xs" color="textSecondary" font="mono" />
      <PixiLabel text="   X-Fade " size="xs" color="textSecondary" font="mono" />
      <PixiLabel text={`${(crossfader * 100).toFixed(0)}%`} size="xs" color="accent" font="mono" />
      <PixiLabel text="   D2 " size="xs" color="custom" customColor={0xf87171} font="mono" weight="bold" />
      <PixiLabel text={deck2Playing ? 'PLAY' : 'STOP'} size="xs" color={deck2Playing ? 'success' : 'textMuted'} font="mono" />
      <PixiLabel text={`  ${deck2BPM.toFixed(1)} BPM`} size="xs" color="textSecondary" font="mono" />
    </>
  );
};

const PixiVJStatus: React.FC = () => (
  <>
    <PixiLabel text="VJ" size="xs" color="accent" font="mono" weight="bold" />
    <PixiLabel text="  Esc: back  •  ⌘⇧V: toggle  •  Milkdrop | ISF | 3D" size="xs" color="textMuted" font="mono" />
  </>
);

interface PixiStatusRightProps {
  hasMIDIDevice: boolean;
  deviceName: string;
  showKnobBar: boolean;
  onToggleKnobBar: () => void;
}

const PixiStatusRight: React.FC<PixiStatusRightProps> = ({
  hasMIDIDevice, deviceName, showKnobBar, onToggleKnobBar,
}) => {
  const { contextState } = useAudioStore();
  const collabStatus = useCollaborationStore(s => s.status);
  const collabRoomCode = useCollaborationStore(s => s.roomCode);
  const theme = usePixiTheme();

  const drawDot = (color: number) => (g: GraphicsType) => {
    g.clear(); g.circle(4, 4, 4); g.fill({ color });
  };

  return (
    <pixiContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: STATUS_BAR_H }}>
      {hasMIDIDevice && (
        <pixiContainer
          eventMode="static"
          cursor="pointer"
          onPointerUp={onToggleKnobBar}
          layout={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: STATUS_BAR_H }}
        >
          <pixiGraphics draw={drawDot(theme.success.color)} layout={{ width: 8, height: 8, marginTop: 1 }} />
          <PixiLabel text={deviceName.toUpperCase()} size="xs" color="textMuted" font="mono" weight="bold" />
          <PixiLabel text={showKnobBar ? '▾' : '▴'} size="xs" color="textMuted" font="mono" />
        </pixiContainer>
      )}
      {collabStatus === 'connected' && collabRoomCode && (
        <pixiContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: STATUS_BAR_H }}>
          <pixiGraphics draw={drawDot(theme.success.color)} layout={{ width: 8, height: 8, marginTop: 1 }} />
          <PixiLabel text="Collab" size="xs" color="success" font="sans" weight="bold" />
          <PixiLabel text={collabRoomCode} size="xs" color="textMuted" font="mono" />
        </pixiContainer>
      )}
      <pixiContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: STATUS_BAR_H }}>
        <pixiGraphics
          draw={drawDot(contextState === 'running' ? theme.success.color : theme.textMuted.color)}
          layout={{ width: 8, height: 8, marginTop: 1 }}
        />
        <PixiLabel
          text={contextState === 'running' ? 'Audio Active' : 'Audio Off'}
          size="xs"
          color={contextState === 'running' ? 'success' : 'textMuted'}
          font="mono"
        />
      </pixiContainer>
    </pixiContainer>
  );
};

interface PixiMIDIKnobPanelProps {
  knobBank: KnobBankMode;
  setKnobBank: (bank: KnobBankMode) => void;
  assignments: KnobAssignment[];
}

const PixiMIDIKnobPanel: React.FC<PixiMIDIKnobPanelProps> = ({ knobBank, setKnobBank, assignments }) => {
  const theme = usePixiTheme();
  const KNOB_W = 80;

  return (
    <pixiContainer layout={{ width: '100%', height: KNOB_PANEL_H, flexDirection: 'column', gap: 6, paddingLeft: 16, paddingRight: 16, paddingTop: 8 }}>
      {/* Bank tabs */}
      <pixiContainer layout={{ flexDirection: 'row', gap: 6, height: 28, alignItems: 'center' }}>
        <PixiLabel text="KNOB BANK:" size="xs" color="textMuted" font="mono" weight="bold" />
        {BANKS.map(bank => (
          <PixiButton
            key={bank.id}
            label={bank.label}
            variant={knobBank === bank.id ? 'primary' : 'default'}
            size="sm"
            onClick={() => setKnobBank(bank.id)}
          />
        ))}
      </pixiContainer>
      {/* Knob assignment grid (8 knobs) */}
      <pixiContainer layout={{ flexDirection: 'row', gap: 6, height: 36 }}>
        {assignments.map((a, i) => (
          <pixiContainer key={i} layout={{ width: KNOB_W, height: 36, flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <PixiLabel text={`K${i+1} CC${a.cc}`} size="xs" color="textMuted" font="mono" />
            <PixiLabel text={a.label} size="xs" color="accent" font="mono" weight="bold" />
          </pixiContainer>
        ))}
      </pixiContainer>
    </pixiContainer>
  );
};
```

**Step 2: `tsc --noEmit`**
Expected: zero errors.

**Step 3: Test in browser**
Start dev server, switch to GL mode. Status bar should show tracker status info, audio state dot, same as DOM mode.

**Step 4: Commit**
```bash
git add src/pixi/shell/PixiStatusBar.tsx
git commit -m "feat(pixi): rewrite PixiStatusBar as pure Pixi — removes PixiDOMOverlay"
```

---

## Phase 4 — Pure `PixiEditorControlsBar`

### Task 8: Create pure Pixi EditorControlsBar

**Files:**
- Create: `src/pixi/views/tracker/PixiEditorControlsBar.tsx`
- Modify: `src/pixi/views/PixiTrackerView.tsx` — import new component, remove old DOM overlay

**Step 1: Check how EditorControlsBar is currently embedded in PixiTrackerView**
Read `src/pixi/views/PixiTrackerView.tsx` to find the `EditorControlsBar` import and `PixiDOMOverlay` usage.

**Step 2: Create `PixiEditorControlsBar.tsx`**

Mirror the DOM `EditorControlsBar` (`src/components/tracker/EditorControlsBar.tsx`) — same store reads, same logic, Pixi primitives for rendering. Key elements:

```tsx
// src/pixi/views/tracker/PixiEditorControlsBar.tsx
/**
 * PixiEditorControlsBar — Pure Pixi controls bar between FT2Toolbar and pattern editor.
 * Mirrors DOM EditorControlsBar exactly.
 */
import { useCallback, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { useTrackerStore, useTransportStore, useAudioStore, useUIStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { useFPSMonitor } from '@hooks/useFPSMonitor';
import { SYSTEM_PRESETS, getGroupedPresets } from '@/constants/systemPresets';
import { notify } from '@stores/useNotificationStore';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';
import { PixiButton } from '../../components/PixiButton';
import { PixiLabel } from '../../components/PixiLabel';
import { PixiSelect, type SelectOption } from '../../components/PixiSelect';
import { PixiNumericInput } from '../../components/PixiNumericInput';

const BAR_H = 28;

type ViewMode = 'tracker' | 'grid' | 'pianoroll' | 'tb303' | 'arrangement' | 'dj' | 'drumpad' | 'vj';

interface PixiEditorControlsBarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  gridChannelIndex: number;
  onGridChannelChange: (idx: number) => void;
}

const VIEW_OPTIONS: SelectOption[] = [
  { value: 'tracker', label: 'Tracker' },
  { value: 'grid', label: 'Grid' },
  { value: 'pianoroll', label: 'Piano Roll' },
  { value: 'tb303', label: 'TB-303' },
  { value: 'arrangement', label: 'Arrangement' },
  { value: 'dj', label: 'DJ Mixer' },
  { value: 'drumpad', label: 'Drum Pads' },
  { value: 'vj', label: 'VJ View' },
];

export const PixiEditorControlsBar: React.FC<PixiEditorControlsBarProps> = ({
  viewMode, onViewModeChange, gridChannelIndex, onGridChannelChange,
}) => {
  const theme = usePixiTheme();
  const { recordMode, showGhostPatterns, channelCount, applySystemPreset } = useTrackerStore(
    useShallow(s => ({
      recordMode: s.recordMode,
      showGhostPatterns: s.showGhostPatterns,
      channelCount: s.patterns[s.currentPatternIndex]?.channels?.length || 4,
      applySystemPreset: s.applySystemPreset,
    }))
  );
  const { smoothScrolling } = useTransportStore(useShallow(s => ({ smoothScrolling: s.smoothScrolling })));
  const masterMuted = useAudioStore(s => s.masterMuted);
  const statusMessage = useUIStore(s => s.statusMessage);
  const setActiveView = useUIStore(s => s.setActiveView);
  const { quality, averageFps } = useFPSMonitor();

  const groupedPresets = getGroupedPresets();

  // Flatten grouped presets for PixiSelect options (with group labels as disabled items)
  const presetOptions: SelectOption[] = [
    { value: '', label: 'SELECT HARDWARE...', disabled: true },
    ...groupedPresets.flatMap(group => [
      { value: `__group__${group.label}`, label: group.label, group: group.label },
      ...group.presets.map(p => ({ value: p.id, label: p.name.toUpperCase() })),
    ]),
  ];

  const handleViewChange = useCallback((val: string) => {
    const mode = val as ViewMode;
    if (['arrangement','dj','drumpad','pianoroll','vj'].includes(mode)) setActiveView(mode);
    else onViewModeChange(mode);
  }, [setActiveView, onViewModeChange]);

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, 5000, BAR_H);
    g.fill({ color: theme.bgTertiary.color });
    g.rect(0, BAR_H - 1, 5000, 1);
    g.fill({ color: theme.border.color, alpha: 0.5 });
  }, [theme]);

  const qualityColor = quality === 'low' ? theme.error.color : quality === 'medium' ? theme.warning.color : theme.success.color;

  return (
    <pixiContainer layout={{ width: '100%', height: BAR_H, flexDirection: 'row', alignItems: 'center', paddingLeft: 8, paddingRight: 8, gap: 8 }}>
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width: '100%', height: BAR_H }} />

      {/* View mode select */}
      <PixiSelect options={VIEW_OPTIONS} value={viewMode} onChange={handleViewChange} width={100} height={22} />

      {/* Hardware preset select */}
      <PixiSelect
        options={presetOptions}
        value=""
        onChange={(id) => {
          if (!id || id.startsWith('__group__')) return;
          applySystemPreset(id);
          notify.success(`Hardware System: ${SYSTEM_PRESETS.find(p => p.id === id)?.name.toUpperCase()}`);
        }}
        width={140}
        height={22}
        placeholder="HARDWARE..."
      />

      {/* Subsong selector — use PixiNumericInput placeholder (subsong store TBD) */}
      {/* Ghost patterns toggle */}
      {viewMode === 'tracker' && (
        <PixiButton
          label={showGhostPatterns ? 'GHOSTS' : 'Ghosts'}
          variant={showGhostPatterns ? 'ft2' : 'default'}
          size="sm"
          active={showGhostPatterns}
          onClick={() => useTrackerStore.getState().setShowGhostPatterns(!showGhostPatterns)}
        />
      )}

      {/* Auto button */}
      {viewMode === 'tracker' && (
        <PixiButton label="Auto" variant="default" size="sm" onClick={() => useUIStore.getState().openModal('automation')} />
      )}

      {/* Pads button */}
      <PixiButton label="Pads" variant="default" size="sm" onClick={() => useUIStore.getState().openModal('drumpads')} />

      {/* Rec button */}
      <PixiButton
        label="REC"
        variant={recordMode ? 'danger' : 'default'}
        size="sm"
        active={recordMode}
        color={recordMode ? 'red' : 'default'}
        onClick={() => useTrackerStore.getState().toggleRecordMode()}
      />

      {/* Mute button */}
      <PixiButton
        label={masterMuted ? 'Unmute' : 'Mute'}
        variant={masterMuted ? 'danger' : 'default'}
        size="sm"
        onClick={() => useAudioStore.getState().toggleMasterMute()}
      />

      {/* Smooth/Stepped */}
      <PixiButton
        label={smoothScrolling ? 'Smooth' : 'Stepped'}
        variant={smoothScrolling ? 'ft2' : 'default'}
        size="sm"
        active={smoothScrolling}
        onClick={() => useTransportStore.getState().setSmoothScrolling(!smoothScrolling)}
      />

      {/* Status message (flex pushes it right) */}
      {statusMessage && (
        <pixiContainer layout={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' }}>
          <PixiLabel text={statusMessage.toUpperCase()} size="xs" color="accent" font="mono" weight="bold" />
        </pixiContainer>
      )}

      {/* FPS pill */}
      <pixiContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: BAR_H, marginLeft: statusMessage ? 0 : 'auto' }}>
        <PixiLabel text={String(averageFps)} size="xs" font="mono" weight="bold" color="custom" customColor={qualityColor} />
        <PixiLabel text="FPS" size="xs" font="mono" color="textMuted" />
        <pixiGraphics
          draw={(g: GraphicsType) => {
            g.clear(); g.circle(4, 4, 4); g.fill({ color: qualityColor });
          }}
          layout={{ width: 8, height: 8, marginLeft: 2, marginTop: 1 }}
        />
      </pixiContainer>
    </pixiContainer>
  );
};
```

**Step 3: Update `PixiTrackerView.tsx`**

Find the `PixiDOMOverlay` wrapping `EditorControlsBar`, replace with `<PixiEditorControlsBar />`.

Search for the import and overlay in `src/pixi/views/PixiTrackerView.tsx`:
- Remove: `import { EditorControlsBar } from '@components/tracker/EditorControlsBar';`
- Add: `import { PixiEditorControlsBar } from './tracker/PixiEditorControlsBar';`
- Replace the `<PixiDOMOverlay>` wrapping `<EditorControlsBar>` with `<PixiEditorControlsBar viewMode={...} onViewModeChange={...} .../>`

**Step 4: `tsc --noEmit`**

**Step 5: Test in browser**
GL mode → view mode dropdown works, REC button toggles, Mute toggles, FPS indicator shows.

**Step 6: Commit**
```bash
git add src/pixi/views/tracker/PixiEditorControlsBar.tsx src/pixi/views/PixiTrackerView.tsx
git commit -m "feat(pixi): rewrite EditorControlsBar as pure Pixi — removes PixiDOMOverlay"
```

---

## Phase 5 — Pure `PixiNavBar`

### Task 9: Rewrite PixiNavBar without PixiDOMOverlay

**Files:**
- Modify: `src/pixi/shell/PixiNavBar.tsx` (full rewrite)

The DOM NavBar has two rows:
1. Logo row (45px): "DEViLBOX" title, master volume, auth/collab/download buttons, theme switcher, MIDI dropdown
2. Tab row (53px): `PixiTabBar` with all open project tabs, `+` new tab

**Step 1: Read current PixiNavBar.tsx and DOM NavBar.tsx:80–361 for full feature list**

**Step 2: Rewrite `PixiNavBar.tsx`**

```tsx
// src/pixi/shell/PixiNavBar.tsx
/**
 * PixiNavBar — Pure Pixi navigation bar. No DOM overlay.
 * Mirrors DOM NavBar.tsx exactly (tabs, theme switcher, DOM mode button).
 */
import { useCallback, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { useTabsStore, useThemeStore, themes } from '@stores';
import { useSettingsStore } from '@stores/useSettingsStore';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';
import { PixiButton } from '../components/PixiButton';
import { PixiLabel } from '../components/PixiLabel';
import { PixiTabBar, type Tab } from '../components/PixiTabBar';
import { usePixiResponsive } from '../hooks/usePixiResponsive';

const NAV_ROW1_H = 45;
const NAV_ROW2_H = 53;
const NAV_H = NAV_ROW1_H + NAV_ROW2_H;

export const PixiNavBar: React.FC = () => {
  const theme = usePixiTheme();
  const { width } = usePixiResponsive();

  const tabs = useTabsStore(s => s.tabs);
  const activeTabId = useTabsStore(s => s.activeTabId);
  const addTab = useTabsStore(s => s.addTab);
  const closeTab = useTabsStore(s => s.closeTab);
  const setActiveTab = useTabsStore(s => s.setActiveTab);

  const currentThemeId = useThemeStore(s => s.currentThemeId);
  const setTheme = useThemeStore(s => s.setTheme);

  const themeIds = Object.keys(themes);
  const nextThemeIndex = (themeIds.indexOf(currentThemeId) + 1) % themeIds.length;
  const nextThemeId = themeIds[nextThemeIndex];

  const handleSwitchToDom = useCallback(() => {
    useSettingsStore.getState().setRenderMode('dom');
  }, []);

  const pixiTabs: Tab[] = tabs.map(t => ({
    id: t.id,
    label: t.name,
    dirty: t.isDirty,
  }));

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, NAV_H);
    g.fill({ color: theme.bg.color });
    // Bottom border
    g.rect(0, NAV_H - 1, width, 1);
    g.fill({ color: theme.border.color, alpha: 0.5 });
    // Row 1 bottom border
    g.rect(0, NAV_ROW1_H - 1, width, 1);
    g.fill({ color: theme.border.color, alpha: 0.3 });
  }, [width, theme]);

  return (
    <pixiContainer layout={{ width: '100%', height: NAV_H, flexDirection: 'column' }}>
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width: '100%', height: NAV_H }} />

      {/* Row 1: Logo + controls */}
      <pixiContainer layout={{ width: '100%', height: NAV_ROW1_H, flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 12, gap: 12 }}>
        {/* Logo */}
        <pixiBitmapText
          text="DEViLBOX"
          style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 18, fill: 0xffffff }}
          tint={theme.accent.color}
          layout={{}}
        />
        {/* Spacer */}
        <pixiContainer layout={{ flex: 1 }} />
        {/* Theme switcher */}
        <PixiButton
          label={`Theme: ${currentThemeId}`}
          variant="ghost"
          size="sm"
          onClick={() => setTheme(nextThemeId)}
        />
        {/* DOM mode switch */}
        <PixiButton
          label="DOM"
          variant="default"
          size="sm"
          onClick={handleSwitchToDom}
        />
      </pixiContainer>

      {/* Row 2: Tab bar */}
      <PixiTabBar
        tabs={pixiTabs}
        activeTabId={activeTabId}
        onSelect={setActiveTab}
        onClose={closeTab}
        onNew={() => addTab()}
        width={width}
        height={NAV_ROW2_H}
        layout={{ width: '100%', height: NAV_ROW2_H }}
      />
    </pixiContainer>
  );
};
```

**Step 3: `tsc --noEmit`**

**Step 4: Test in browser**
GL mode → NavBar shows logo, theme button cycles themes, DOM button switches renderer, tabs show projects.

**Step 5: Commit**
```bash
git add src/pixi/shell/PixiNavBar.tsx
git commit -m "feat(pixi): rewrite PixiNavBar as pure Pixi — removes PixiDOMOverlay"
```

---

## Phase 6 — Pure `PixiFT2Toolbar`

### Task 10: Extract FT2Toolbar menu structure to shared data

**Files:**
- Create: `src/pixi/views/tracker/ft2MenuDefs.ts`

The DOM `FT2Toolbar.tsx` has menu buttons in its JSX (Export, Order, Instruments, Pads, Master FX, Reference, Help). Extract these as `Menu[]` data that the pure Pixi version can consume.

**Step 1: Create `ft2MenuDefs.ts`**

```typescript
// src/pixi/views/tracker/ft2MenuDefs.ts
import type { Menu } from '../../components/PixiMenuBar';

interface FT2MenuActions {
  onShowExport: () => void;
  onShowHelp: (tab?: string) => void;
  onShowMasterFX: () => void;
  onShowInstrumentFX: () => void;
  onShowInstruments: () => void;
  onShowPatternOrder: () => void;
  onShowDrumpads: () => void;
  showMasterFX: boolean;
  showInstrumentFX: boolean;
}

export function buildFT2Menus(actions: FT2MenuActions): Menu[] {
  return [
    {
      label: 'File',
      items: [
        { type: 'action', label: 'Export...', shortcut: '⌘E', onClick: actions.onShowExport },
        { type: 'separator' },
        { type: 'action', label: 'Open Module...', onClick: () => {} }, // handled by file input
      ],
    },
    {
      label: 'Module',
      items: [
        { type: 'action', label: 'Pattern Order', shortcut: '⌘O', onClick: actions.onShowPatternOrder },
        { type: 'action', label: 'Instruments', shortcut: '⌘I', onClick: actions.onShowInstruments },
        { type: 'action', label: 'Drum Pads', shortcut: '⌘D', onClick: actions.onShowDrumpads },
        { type: 'separator' },
        { type: 'checkbox', label: 'Master FX', checked: actions.showMasterFX, onChange: () => actions.onShowMasterFX() },
        { type: 'checkbox', label: 'Instrument FX', checked: actions.showInstrumentFX, onChange: () => actions.onShowInstrumentFX() },
      ],
    },
    {
      label: 'Help',
      items: [
        { type: 'action', label: 'Chip Reference', onClick: () => actions.onShowHelp('chip-effects') },
        { type: 'action', label: 'Keyboard Shortcuts', shortcut: '?', onClick: () => actions.onShowHelp('shortcuts') },
      ],
    },
  ];
}
```

**Step 2: `tsc --noEmit`**

**Step 3: Commit**
```bash
git add src/pixi/views/tracker/ft2MenuDefs.ts
git commit -m "refactor(pixi): extract FT2Toolbar menu definitions to shared data"
```

---

### Task 11: Rewrite PixiFT2Toolbar as pure Pixi

**Files:**
- Modify: `src/pixi/views/tracker/PixiFT2Toolbar.tsx` (full rewrite)
- `src/pixi/views/PixiTrackerView.tsx` — no changes needed (already imports PixiFT2Toolbar)

The DOM toolbar has: menu bar row | transport + BPM row | instruments/samples/patterns panel row | visualizer + toggles row.

**Step 1: Read `src/pixi/views/PixiTrackerView.tsx` lines 80–160**
Understand what `PixiFT2Toolbar` needs to provide (height, layout slot) and what props it receives.

**Step 2: Read `src/components/tracker/FT2Toolbar/FT2Toolbar.tsx` lines 680–900**
Understand the transport controls, BPM input, pattern controls layout.

**Step 3: Rewrite `PixiFT2Toolbar.tsx`**

```tsx
// src/pixi/views/tracker/PixiFT2Toolbar.tsx
/**
 * PixiFT2Toolbar — Pure Pixi FT2-style toolbar.
 * No DOM overlay. Mirrors DOM FT2Toolbar.tsx feature-for-feature.
 */
import { useCallback } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { useTrackerStore, useTransportStore, useUIStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';
import { PixiButton } from '../../components/PixiButton';
import { PixiLabel } from '../../components/PixiLabel';
import { PixiNumericInput } from '../../components/PixiNumericInput';
import { PixiMenuBar } from '../../components/PixiMenuBar';
import { PixiPureTextInput } from '../../input/PixiPureTextInput';
import { buildFT2Menus } from './ft2MenuDefs';
import { PixiVisualizer } from './PixiVisualizer';

const TOOLBAR_H = 160; // approximate, matches DOM

export const PixiFT2Toolbar: React.FC = () => {
  const theme = usePixiTheme();

  const {
    bpm, setBPM,
    isPlaying, isRecording,
    play, stop, toggleRecord,
  } = useTransportStore(useShallow(s => ({
    bpm: s.bpm,
    setBPM: s.setBPM,
    isPlaying: s.isPlaying,
    isRecording: s.isRecording,
    play: s.play,
    stop: s.stop,
    toggleRecord: s.toggleRecord,
  })));

  const {
    currentPatternIndex,
    patterns,
    setPatternName,
    setPatternLength,
  } = useTrackerStore(useShallow(s => ({
    currentPatternIndex: s.currentPatternIndex,
    patterns: s.patterns,
    setPatternName: s.setPatternName,
    setPatternLength: s.setPatternLength,
  })));

  const modalOpen = useUIStore(s => s.modalOpen);
  const compactToolbar = useUIStore(s => s.compactToolbar);

  const currentPattern = patterns[currentPatternIndex];
  const patternName = currentPattern?.name ?? '';
  const patternLength = currentPattern?.length ?? 64;

  const handleShowExport = useCallback(() => useUIStore.getState().openModal('export'), []);
  const handleShowHelp = useCallback((tab?: string) => useUIStore.getState().openModal('help', { initialTab: tab ?? 'shortcuts' }), []);
  const handleShowMasterFX = useCallback(() => {
    const s = useUIStore.getState();
    s.modalOpen === 'masterFx' ? s.closeModal() : s.openModal('masterFx');
  }, []);
  const handleShowInstrumentFX = useCallback(() => {
    const s = useUIStore.getState();
    s.modalOpen === 'instrumentFx' ? s.closeModal() : s.openModal('instrumentFx');
  }, []);
  const handleShowInstruments = useCallback(() => useUIStore.getState().openModal('instruments'), []);
  const handleShowPatternOrder = useCallback(() => useUIStore.getState().openModal('patternOrder'), []);
  const handleShowDrumpads = useCallback(() => useUIStore.getState().openModal('drumpads'), []);

  const menus = buildFT2Menus({
    onShowExport: handleShowExport,
    onShowHelp: handleShowHelp,
    onShowMasterFX: handleShowMasterFX,
    onShowInstrumentFX: handleShowInstrumentFX,
    onShowInstruments: handleShowInstruments,
    onShowPatternOrder: handleShowPatternOrder,
    onShowDrumpads: handleShowDrumpads,
    showMasterFX: modalOpen === 'masterFx',
    showInstrumentFX: modalOpen === 'instrumentFx',
  });

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, 5000, TOOLBAR_H);
    g.fill({ color: theme.bgSecondary.color });
    g.rect(0, TOOLBAR_H - 1, 5000, 1);
    g.fill({ color: theme.border.color, alpha: 0.5 });
  }, [theme]);

  return (
    <pixiContainer layout={{ width: '100%', height: TOOLBAR_H, flexDirection: 'column' }}>
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width: '100%', height: TOOLBAR_H }} />

      {/* Row 1: Menu bar */}
      <PixiMenuBar menus={menus} height={28} layout={{ width: '100%', paddingLeft: 8 }} />

      {/* Row 2: Transport + BPM + Pattern controls */}
      <pixiContainer layout={{ width: '100%', height: 40, flexDirection: 'row', alignItems: 'center', paddingLeft: 8, paddingRight: 8, gap: 8 }}>
        {/* BPM */}
        <PixiNumericInput
          value={Math.round(bpm)}
          min={20}
          max={300}
          step={1}
          onChange={setBPM}
          width={56}
          formatValue={(v) => String(Math.round(v))}
          label="BPM"
        />
        {/* Transport */}
        <PixiButton label="■" variant="ft2" size="sm" onClick={stop} />
        <PixiButton label={isPlaying ? '‖' : '▶'} variant="ft2" size="sm" color={isPlaying ? 'green' : 'default'} onClick={play} />
        <PixiButton label="●" variant="ft2" size="sm" color={isRecording ? 'red' : 'default'} active={isRecording} onClick={toggleRecord} />

        {/* Separator */}
        <pixiGraphics
          draw={(g: GraphicsType) => { g.clear(); g.rect(0, 4, 1, 24); g.fill({ color: theme.border.color, alpha: 0.5 }); }}
          layout={{ width: 1, height: 32 }}
        />

        {/* Pattern name */}
        <PixiLabel text="Pattern:" size="xs" color="textMuted" font="mono" />
        <PixiPureTextInput
          value={patternName}
          onChange={(v) => setPatternName(currentPatternIndex, v)}
          onSubmit={(v) => setPatternName(currentPatternIndex, v)}
          placeholder="Untitled"
          width={140}
          height={24}
        />

        {/* Pattern length */}
        <PixiLabel text="Rows:" size="xs" color="textMuted" font="mono" />
        <PixiNumericInput
          value={patternLength}
          min={1}
          max={256}
          step={1}
          onChange={(v) => setPatternLength(currentPatternIndex, v)}
          width={44}
        />
      </pixiContainer>

      {/* Row 3: Instrument/Sample/Pattern panels (collapsed in compact mode) */}
      {!compactToolbar && (
        <pixiContainer layout={{ width: '100%', height: 60, flexDirection: 'row', paddingLeft: 8, paddingRight: 8, gap: 8 }}>
          {/* Instruments panel */}
          <PixiToolbarPanel label="INSTRUMENTS" onAction={handleShowInstruments} />
          {/* Samples panel */}
          <PixiToolbarPanel label="SAMPLES" onAction={() => useUIStore.getState().openModal('samples')} />
          {/* Patterns panel */}
          <PixiToolbarPanel label="PATTERNS" onAction={handleShowPatternOrder} />
        </pixiContainer>
      )}

      {/* Row 4: Visualizer + toggle buttons */}
      <pixiContainer layout={{ width: '100%', flex: 1, flexDirection: 'row', alignItems: 'center', paddingLeft: 8, paddingRight: 8, gap: 8 }}>
        <pixiContainer layout={{ flex: 1, height: 28 }}>
          <PixiVisualizer />
        </pixiContainer>
        <PixiButton
          label="PAT"
          variant={useUIStore(s => s.showPatterns) ? 'ft2' : 'default'}
          size="sm"
          active={useUIStore(s => s.showPatterns)}
          onClick={() => useUIStore.getState().togglePatterns()}
        />
        <PixiButton
          label="AUTO"
          variant={useUIStore(s => s.showAutomationLanes) ? 'ft2' : 'default'}
          size="sm"
          active={useUIStore(s => s.showAutomationLanes)}
          onClick={() => useUIStore.getState().toggleAutomationLanes()}
        />
      </pixiContainer>
    </pixiContainer>
  );
};

/** Simple placeholder panel for Instruments/Samples/Patterns side panels */
const PixiToolbarPanel: React.FC<{ label: string; onAction: () => void }> = ({ label, onAction }) => {
  const theme = usePixiTheme();
  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.roundRect(0, 0, 180, 56, 3);
    g.fill({ color: theme.bgTertiary.color });
    g.roundRect(0, 0, 180, 56, 3);
    g.stroke({ color: theme.border.color, alpha: 0.5, width: 1 });
  }, [theme]);

  return (
    <pixiContainer
      eventMode="static"
      cursor="pointer"
      onPointerUp={onAction}
      layout={{ width: 180, height: 56, justifyContent: 'center', alignItems: 'center' }}
    >
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width: 180, height: 56 }} />
      <PixiLabel text={label} size="xs" color="textMuted" font="mono" weight="bold" />
    </pixiContainer>
  );
};
```

**Step 4: `tsc --noEmit`**
Fix any errors (likely missing store action names — check `useTransportStore` for `play`/`stop`/`toggleRecord` method names against the actual store).

**Step 5: Test in browser**
GL mode → BPM input scrolls and changes tempo, transport buttons play/stop, pattern name input accepts keyboard input, menus open.

**Step 6: Commit**
```bash
git add src/pixi/views/tracker/PixiFT2Toolbar.tsx src/pixi/views/tracker/ft2MenuDefs.ts
git commit -m "feat(pixi): rewrite PixiFT2Toolbar as pure Pixi — removes last PixiDOMOverlay from tracker"
```

---

## Phase 7 — Cleanup

### Task 12: Remove dead PixiDOMOverlay code and verify

**Step 1: Verify no main-chrome PixiDOMOverlay usage remains**
```bash
grep -r "PixiDOMOverlay" src/pixi --include="*.tsx" | grep -v "collaboration\|collab\|PixiDOMOverlay.tsx"
```
Expected: zero results (only collaboration components and the definition file itself should reference it).

**Step 2: Run full type check**
```bash
tsc --noEmit
```
Expected: zero errors.

**Step 3: Run full test suite**
```bash
npm test
```
Expected: all 2709 tests pass.

**Step 4: Export new components from index**
```bash
# Check what's already exported
cat src/pixi/components/index.ts
```
Add exports for any new components missing from `src/pixi/components/index.ts`:
- `PixiCheckbox`
- `PixiSelect`, `PixiDropdownPanel`
- `PixiMenuBar`
- `PixiTabBar`

**Step 5: Commit cleanup**
```bash
git add src/pixi/components/index.ts
git commit -m "chore(pixi): export new pure Pixi components from index"
```

---

## Verification Checklist

After all phases complete, verify manually in GL mode:

**Text & resolution:**
- [ ] Switch to GL mode — all UI text is sharp and crisp
- [ ] Zoom browser to 150% — text remains crisp (MSDF working correctly)

**StatusBar:**
- [ ] Shows row/channel/mode info in tracker view
- [ ] Shows D1/D2 BPM + crossfader in DJ view
- [ ] Audio dot turns green when audio context starts
- [ ] MIDI device name shows and toggle-knob-bar works when MIDI connected

**EditorControlsBar:**
- [ ] View mode dropdown opens, selects mode, closes
- [ ] REC button toggles (red when active)
- [ ] Mute button toggles
- [ ] Smooth/Stepped button toggles
- [ ] FPS indicator shows and color-codes (green/orange/red)

**NavBar:**
- [ ] Logo shows "DEViLBOX"
- [ ] Theme button cycles themes — entire UI updates
- [ ] DOM button switches to DOM render mode
- [ ] Tab bar: click tab = switch project, `×` = close, `+` = new tab
- [ ] Active tab has accent underline

**FT2Toolbar:**
- [ ] BPM: scroll to change, reflects in playback
- [ ] Stop / Play / Record buttons work
- [ ] Pattern name field: click, type, Enter to confirm, Escape to cancel
- [ ] Pattern rows: scroll to change
- [ ] File/Module/Help menus open with correct items
- [ ] Menu items fire correct actions (Export opens export dialog, etc.)
- [ ] Compact mode collapses instrument/sample/pattern panels
- [ ] Visualizer slot shows visualizer when audio active

**PixiPureTextInput specifically:**
- [ ] Click sets cursor position
- [ ] Arrow keys move cursor
- [ ] Backspace/Delete remove characters
- [ ] Ctrl+A selects all, Ctrl+C copies, Ctrl+V pastes
- [ ] Cursor blinks when focused
- [ ] Clicking outside unfocuses

**DOM mode (unchanged):**
- [ ] Switch to DOM mode — all DOM UI still works identically
- [ ] `tsc --noEmit` passes
