---
date: 2026-04-05
topic: pattern-editor-context-menu-bugs
tags: [context-menu, right-click, pattern-editor, dom]
status: draft
---

# Pattern Editor Right-Click Context Menu — 3 Bugs

## Bug 1: Browser native context menu shows on first right-click
- The canvas element and/or overlays intercept the right-click before React's synthetic event system
- `onContextMenuCapture` on the outer wrapper doesn't help — the native canvas element captures it first
- `canvas.oncontextmenu = preventDefault` was added but doesn't work — maybe the canvas isn't created yet, or there's another element on top
- Need to investigate: which DOM element actually receives the right-click event? Use DevTools "Event Listeners" panel on the canvas element

## Bug 2: Cursor/selection gets weird after left-click  
- Image 5: before left-click, cursor covers the note column correctly (wide orange highlight)
- Image 6: after left-click, cursor shrinks to a tiny square on the instrument column
- This suggests `handleMouseDown` is mapping the click to the wrong column type
- The `getCellFromCoords` function computes column type from x-position within the channel
- Need to verify: is the column width calculation matching the actual rendered column widths?

## Bug 3: Context menu opens at center of screen, not at mouse position
- `CellContextMenu.openMenu(e, rowIndex, channelIndex)` stores `{ x: e.clientX, y: e.clientY }`
- `ContextMenu` renders via `createPortal` to `document.body` with `position: fixed; left: x; top: y`
- But the menu appears centered — suggesting `e.clientX/clientY` is wrong
- Possible cause: the event `e` is being forwarded from `onContextMenuCapture` on the outer wrapper, but by the time it reaches `openMenu`, the coordinates might be stale or the event is synthetic
- Need to verify: add `console.log` inside `openMenu` to see actual x/y values received

## Bug 4: Wrong channel selected (Ch 3 instead of Ch 1)
- `getCellFromCoords` uses `channelOffsets` to find which channel the click is in
- `relativeX = clientX - rect.left + scrollLeft`
- When `scrollLeft = 0` and `rect.left = 0`, `relativeX = clientX` 
- With `channelOffsets = [40, ~220, ~400, ~580]`, clicking at x=88 should be channel 0
- But status bar shows Ch 3 — this means either `channelOffsets` are wrong, or the fallback path is used
- The fallback `cursorRef.current.channelIndex` is used when `getCellFromCoords` returns null
- Need to verify: is `getCellFromCoords` returning null for the right-click position?

## Files involved
- `src/components/tracker/PatternEditorCanvas.tsx` — main component, canvas creation, event handlers
- `src/components/tracker/CellContextMenu.tsx` — context menu component + useCellContextMenu hook
- `src/components/common/ContextMenu.tsx` — generic context menu renderer (createPortal)

## Debug logs currently in place
- `getCellFromCoords` logs: `relX`, `offsets`, `widths` (line ~462)
- These should appear in console on right-click

## Approach for next session
1. Open DevTools, right-click on pattern, check which element receives the event
2. Check if `getCellFromCoords` log fires — if not, the event isn't reaching `handleContextMenu`
3. If it fires, check if the returned channel matches the click position
4. For menu position: add log in `CellContextMenu.openMenu` to verify x/y
