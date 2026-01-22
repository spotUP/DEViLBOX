# TrackerView Layout Redesign - CSS Grid Implementation

**Date:** January 21, 2026
**Status:** ✅ Implemented - Ready for Testing

---

## Problem Statement

The previous nested Flexbox layout failed to constrain channels properly:
- Channels pushed out the InstrumentPanel regardless of width constraints
- No horizontal scrollbars appeared when channels exceeded available width
- Window resizing didn't trigger responsive behavior
- Multiple cascading width constraints (`w-full`, `max-w-full`, `min-w-0`) fought each other

---

## Solution: CSS Grid Layout

Replaced nested Flexbox with **CSS Grid** for explicit column control.

### Key Concept

**CSS Grid allows explicit column sizing that Flexbox cannot achieve:**

```
Grid Template: [PatternEditor] [Toggle] [InstrumentPanel]
Column Sizes:  1fr (flexible)  24px    256px (fixed)
```

- **`1fr`** = PatternEditor takes remaining space after fixed columns
- **Grid cells cannot push siblings** - they're constrained to their column width
- **Overflow naturally triggers scrollbars** within constrained cells

---

## Implementation Details

### 1. TrackerView Main Content Area

**File:** `/src/components/tracker/TrackerView.tsx` (line 549-586)

**Before (Flexbox):**
```tsx
<div className="flex-1 flex min-h-0 overflow-hidden relative z-10">
  <div className="flex-1 min-w-0 max-w-full h-full overflow-hidden">
    <PatternEditor />
  </div>
  <button className="flex-shrink-0 w-6">...</button>
  {showInstrumentPanel && <div className="flex-shrink-0 w-64">...</div>}
</div>
```

**After (Grid):**
```tsx
<div
  className="flex-1 min-h-0 relative z-10 grid"
  style={{
    gridTemplateColumns: showInstrumentPanel
      ? '1fr 24px 256px'
      : '1fr 24px',
    overflow: 'hidden',
  }}
>
  <div className="min-w-0 h-full overflow-hidden">
    <PatternEditor />
  </div>
  <button>...</button>
  {showInstrumentPanel && <div>...</div>}
</div>
```

**Why This Works:**
- `1fr` column **cannot exceed available space** (unlike `flex-1`)
- Fixed `24px` and `256px` columns **never change size**
- InstrumentPanel stays at exactly 256px regardless of window size
- PatternEditor gets remaining space and **must work within it**

---

### 2. PatternEditor Root Simplification

**File:** `/src/components/tracker/PatternEditor.tsx` (line 582)

**Before:**
```tsx
<div className="flex-1 w-full flex flex-col bg-dark-bg overflow-hidden">
```

**After:**
```tsx
<div className="h-full w-full flex flex-col bg-dark-bg overflow-hidden">
```

**Changes:**
- Removed `flex-1` (no longer needed - Grid cell provides sizing)
- Kept `h-full w-full` to fill Grid cell
- Kept `flex-col` for internal vertical layout
- Kept `overflow-hidden` to clip children

---

### 3. Desktop Header Cleanup

**File:** `/src/components/tracker/PatternEditor.tsx` (line 676-677)

**Before:**
```tsx
<div className="flex-shrink-0 w-full max-w-full bg-dark-bgTertiary ... overflow-hidden">
  <div className="flex min-w-0 max-w-full">
```

**After:**
```tsx
<div className="flex-shrink-0 bg-dark-bgTertiary ... overflow-hidden">
  <div className="flex">
```

**Removed:**
- `w-full`, `max-w-full` (redundant - parent already constrained by Grid)
- `min-w-0`, `max-w-full` from flex wrapper (unnecessary)

**Kept:**
- `overflow-hidden` on outer div (clips channel headers)
- `flex` on inner wrapper (horizontal layout for ROW + scrollable)

---

### 4. Scrollable Containers - Inline Layout

**File:** `/src/components/tracker/PatternEditor.tsx` (lines 687, 934, 1010)

**Channel Header Scrollable:**
```tsx
<div className="flex-1 overflow-x-auto scrollbar-modern">
  <div className="inline-flex">
    {/* Channel headers with w-[260px] */}
  </div>
</div>
```

**Pattern Content Scrollable:**
```tsx
<div className="h-full overflow-x-auto overflow-y-hidden scrollbar-modern">
  <div className="relative inline-block" style={{ height }}>
    {/* Rows with inline-flex */}
  </div>
</div>
```

**Why `inline-flex` and `inline-block`:**
- Regular `flex`/`block` elements try to fill parent width (100%)
- `inline-flex`/`inline-block` size to fit content naturally
- Content wider than parent → scrollbar appears ✓

---

## How It Works

### Width Constraint Flow

```
1. Grid Container (TrackerView)
   └─ Column 1: 1fr (remaining space after 24px + 256px)
      └─ PatternEditor (h-full w-full)
         └─ Desktop Header (overflow-hidden)
            └─ Flex wrapper (ROW column + scrollable)
               └─ Scrollable container (flex-1 overflow-x-auto)
                  └─ inline-flex wrapper
                     └─ Channel headers (each w-[260px])
```

**When channels total width > Grid column 1 width:**
- `inline-flex` wrapper is wider than scrollable container
- `overflow-x-auto` triggers horizontal scrollbar ✓

---

## Expected Behavior

### ✅ Adding Channels
1. User clicks "Add Channel" (+) button
2. New 260px channel header appears
3. `inline-flex` wrapper grows wider
4. **If total width > Grid cell → scrollbar appears**
5. **InstrumentPanel stays at 256px** (Grid constraint)

### ✅ Narrowing Window
1. User drags browser window narrower
2. Grid recalculates: `1fr` column gets smaller
3. PatternEditor shrinks to fit Grid cell
4. **Scrollbar appears when channels > available width**
5. **InstrumentPanel stays at 256px** (fixed Grid column)

### ✅ Widening Window
1. User drags browser window wider
2. Grid recalculates: `1fr` column gets larger
3. PatternEditor grows to fit Grid cell
4. **Scrollbar disappears when all channels fit**
5. **InstrumentPanel stays at 256px** (fixed Grid column)

---

## Testing Checklist

### Basic Functionality
- [ ] Add multiple channels (5+) → scrollbar appears
- [ ] Remove channels → scrollbar disappears when all fit
- [ ] Scroll horizontally with mouse wheel
- [ ] Scroll header and content stay synchronized

### Responsive Behavior
- [ ] Narrow window → InstrumentPanel stays 256px wide
- [ ] Narrow window → Channels show scrollbar, don't push InstrumentPanel
- [ ] Widen window → Scrollbar disappears when channels fit
- [ ] Toggle InstrumentPanel → Grid reflows correctly

### Edge Cases
- [ ] Single channel → no scrollbar
- [ ] 16 channels (max) → scrollbar appears
- [ ] Mobile view → unchanged (uses separate layout)
- [ ] Grid/Piano Roll views → unchanged

---

## Technical Advantages

### CSS Grid vs Flexbox for This Use Case

| Aspect | Flexbox (Previous) | CSS Grid (New) |
|--------|-------------------|----------------|
| **Column Width Control** | Indirect (`flex-1`, `min-w-0`) | Direct (`1fr`, `256px`) |
| **Width Constraints** | Cascading, can be overridden | Absolute, cannot be broken |
| **Overflow Behavior** | Unpredictable with nested flex | Predictable within Grid cells |
| **Sibling Interaction** | Can push each other | Cannot affect sibling columns |
| **Responsive Recalc** | Complex constraint resolution | Simple column recalculation |

### Why This Succeeds

1. **Explicit Column Sizing** - Grid defines exact widths, no guessing
2. **Isolated Cells** - PatternEditor cannot push InstrumentPanel
3. **Natural Overflow** - `inline-flex`/`inline-block` size to content
4. **Simple Constraints** - One Grid definition replaces 10+ Flexbox constraints

---

## Files Modified

### Core Layout (2 files)
1. `/src/components/tracker/TrackerView.tsx`
   - Converted main content area from Flexbox to CSS Grid
   - Defined explicit grid columns: `1fr 24px 256px`

2. `/src/components/tracker/PatternEditor.tsx`
   - Simplified root container (removed flex-1, simplified constraints)
   - Cleaned up Desktop Header (removed redundant width classes)
   - Changed scrollable children to `inline-flex`/`inline-block`
   - Kept channel headers at exact `w-[260px]`

### No Breaking Changes
- Mobile layout unchanged (uses separate rendering path)
- Grid/Piano Roll/TB-303 views unchanged (different components)
- Keyboard shortcuts unchanged
- Scroll synchronization unchanged (scroll handlers preserved)

---

## Rollback Plan

If this approach fails, revert both files:

```bash
git checkout HEAD -- src/components/tracker/TrackerView.tsx
git checkout HEAD -- src/components/tracker/PatternEditor.tsx
```

Then explore alternative solutions:
- JavaScript-based width calculations with ResizeObserver
- Virtual scrolling library (react-window, react-virtualized)
- Complete pattern editor rewrite with proven layout framework

---

## Next Steps

1. **User Testing** - Ask user to test with hard browser refresh
2. **Visual Verification** - Confirm scrollbars appear and InstrumentPanel stays fixed
3. **Performance Check** - Ensure smooth scrolling with many channels
4. **Mobile Verification** - Confirm mobile view still works (separate code path)

---

**Implementation Status:** ✅ Complete
**Ready for Testing:** Yes
**Breaking Changes:** None
**Requires:** Hard browser refresh (`Cmd+Shift+R`)
