# DEViLBOX Design System

**Version:** 1.0
**Last Updated:** 2026-01-20

---

## 📋 Table of Contents

1. [Philosophy](#philosophy)
2. [Color System](#color-system)
3. [Typography](#typography)
4. [Spacing & Layout](#spacing--layout)
5. [Components](#components)
6. [Usage Rules](#usage-rules)
7. [Quick Reference](#quick-reference)

---

## Philosophy

**MANDATORY PROJECT RULE:**
When building any feature, you **MUST** use only the components, styles, and patterns defined in this design system. Never create inline styles or custom buttons. If you need something new, add it to this design system first, then use it.

### Core Principles

1. **Consistency First** - Use existing components, never reinvent
2. **Theme Support** - Always use CSS variables, never hardcode colors
3. **Accessibility** - All interactive elements must be keyboard accessible with ARIA labels
4. **Professional** - Clean, minimal, retro-inspired dark UI
5. **Monospace Where Appropriate** - Tracker data uses JetBrains Mono

---

## Color System

### CSS Variables (Theme-Aware)

All colors are defined as CSS variables in `src/index.css`. **NEVER hardcode hex colors.**

#### Base Colors

```css
--color-bg: #0b0909              /* Main background */
--color-bg-secondary: #131010     /* Secondary panels */
--color-bg-tertiary: #1d1818      /* Tertiary surfaces */
--color-bg-hover: #262020         /* Hover states */
--color-bg-active: #2f2828        /* Active/pressed states */
```

#### Borders

```css
--color-border: #2f2525           /* Default borders */
--color-border-light: #403535     /* Lighter borders */
```

#### Accent Colors

```css
--color-accent: #ef4444           /* Primary accent (red) */
--color-accent-secondary: #f97316 /* Secondary accent (orange) */
--color-accent-glow: rgba(239, 68, 68, 0.15) /* Glow effects */
```

#### Text Colors

```css
--color-text: #f2f0f0             /* Primary text */
--color-text-secondary: #a8a0a0   /* Secondary text */
--color-text-muted: #686060       /* Muted/disabled text */
--color-text-inverse: #0b0909     /* Text on accent backgrounds */
```

#### Semantic Colors

```css
--color-error: #ef4444            /* Errors, destructive actions */
--color-success: #10b981          /* Success states */
--color-warning: #f59e0b          /* Warnings */
```

#### Synth Control Colors (Semantic Grouping)

```css
--color-synth-filter: #00d4aa     /* Filter cutoff, resonance */
--color-synth-envelope: #7c3aed   /* Envelope mod, decay, attack */
--color-synth-accent: #f59e0b     /* Accent amount, sweep */
--color-synth-drive: #ef4444      /* Overdrive, distortion */
--color-synth-modulation: #3b82f6 /* FM, tracking, modulation */
--color-synth-volume: #22c55e     /* Volume controls */
--color-synth-pan: #3b82f6        /* Pan controls */
--color-synth-effects: #8b5cf6    /* Effects (delay, reverb) */
```

#### Tracker Colors

```css
--color-tracker-row-even: #0f0c0c
--color-tracker-row-odd: #131010
--color-tracker-row-highlight: #181414
--color-tracker-row-current: #2a1a1a
--color-tracker-row-cursor: #251010
--color-tracker-cursor: #00ffff   /* Playback cursor */
```

#### Cell Colors

```css
--color-cell-note: #f2f0f0        /* Note data */
--color-cell-instrument: #fbbf24  /* Instrument numbers */
--color-cell-volume: #34d399      /* Volume values */
--color-cell-effect: #f97316      /* Effect commands */
--color-cell-accent: #ef4444      /* Accent markers */
--color-cell-slide: #fb7185       /* Slide markers */
--color-cell-empty: #484040       /* Empty cells */
```

### Theme: Cyan Lineart

The app supports an alternate "cyan-lineart" theme. Check current theme:

```typescript
const currentThemeId = useThemeStore((state) => state.currentThemeId);
const isCyanTheme = currentThemeId === 'cyan-lineart';
```

---

## Typography

### Font Families

#### Primary Font (UI)
- **Font:** Inter
- **Weights:** 400 (regular), 500 (medium), 600 (semibold), 700 (bold)
- **Usage:** All UI text, buttons, labels

#### Monospace Font (Data)
- **Font:** JetBrains Mono
- **Weights:** 400, 500, 600, 700
- **Usage:** Tracker cells, code, numeric values
- **Features:** `font-feature-settings: 'tnum'` (tabular numbers)

### Text Sizes

```css
text-xs:   0.75rem  (12px)  /* Small labels, hints */
text-sm:   0.875rem (14px)  /* Default UI text */
text-base: 1rem     (16px)  /* Body text */
text-lg:   1.125rem (18px)  /* Headings */
text-xl:   1.25rem  (20px)  /* Large headings */
```

### Font Weight

```css
font-normal:   400
font-medium:   500
font-semibold: 600
font-bold:     700
```

---

## Spacing & Layout

### Spacing Scale (Tailwind)

```css
0:   0px
1:   0.25rem  (4px)
2:   0.5rem   (8px)
3:   0.75rem  (12px)
4:   1rem     (16px)
5:   1.25rem  (20px)
6:   1.5rem   (24px)
8:   2rem     (32px)
12:  3rem     (48px)
```

### Common Patterns

- **Gap between elements:** `gap-2` or `gap-3`
- **Button padding:** `px-4 py-2` (default)
- **Panel padding:** `p-4` or `p-6`
- **Modal padding:** `p-6`

### Border Radius

```css
rounded-sm:  0.125rem (2px)   /* Subtle rounding */
rounded:     0.25rem  (4px)   /* Default */
rounded-md:  0.375rem (6px)   /* Medium */
rounded-lg:  0.5rem   (8px)   /* Large */
```

---

## Components

### 1. Button

**Location:** `src/components/ui/Button.tsx`

**When to use:** All clickable actions (primary actions, secondary actions, icon buttons, etc.)

#### Variants

```typescript
variant?: 'primary' | 'default' | 'ghost' | 'icon' | 'ft2' | 'danger'
```

- **primary** - Main call-to-action (uses accent color)
- **default** - Secondary actions (neutral)
- **ghost** - Subtle actions, cancel buttons (transparent)
- **icon** - Icon-only buttons (compact)
- **ft2** - FastTracker II retro style
- **danger** - Destructive actions (red)

#### Sizes

```typescript
size?: 'sm' | 'md' | 'lg' | 'icon'
```

- **sm** - Compact buttons (dialogs, toolbars)
- **md** - Default size
- **lg** - Prominent actions (welcome screen)
- **icon** - Icon-only (fixed padding)

#### Examples

```tsx
// Primary action
<Button variant="primary" size="md" onClick={handleSave}>
  Save Project
</Button>

// Secondary action with icon
<Button variant="default" icon={<Download size={16} />}>
  Export
</Button>

// Ghost button (cancel)
<Button variant="ghost" onClick={handleCancel}>
  Cancel
</Button>

// Icon button (close)
<Button variant="icon" size="icon" aria-label="Close">
  <X size={20} />
</Button>

// Destructive action
<Button variant="danger" icon={<Trash2 size={14} />}>
  Delete All
</Button>

// With loading state
<Button variant="primary" loading={isLoading}>
  Processing...
</Button>
```

#### Props

```typescript
interface ButtonProps {
  variant?: 'primary' | 'default' | 'ghost' | 'icon' | 'ft2' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  color?: 'default' | 'red' | 'green' | 'yellow' | 'blue' | 'purple' | 'cyan' | 'amber';
  fullWidth?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  className?: string;
  disabled?: boolean;
  children?: React.ReactNode;
}
```

---

### 2. Modal / Dialog

**Location:** `src/components/ui/Modal.tsx`, `ModalHeader.tsx`, `ModalFooter.tsx`

#### Structure

```tsx
import { Modal } from '@components/ui/Modal';
import { ModalHeader } from '@components/ui/ModalHeader';
import { ModalFooter } from '@components/ui/ModalFooter';
import { Button } from '@components/ui/Button';

<Modal isOpen={isOpen} onClose={onClose} size="md">
  <ModalHeader
    title="Dialog Title"
    subtitle="Optional subtitle"
    icon={<Settings size={20} />}
    onClose={onClose}
  />

  <div className="p-6">
    {/* Content */}
  </div>

  <ModalFooter>
    <Button variant="ghost" onClick={onClose}>Cancel</Button>
    <Button variant="primary" onClick={handleSave}>Save</Button>
  </ModalFooter>
</Modal>
```

#### Modal Sizes

```typescript
size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
```

---

### 3. Knob (Rotary Control)

**Location:** `src/components/controls/Knob.tsx`

**When to use:** Continuous value controls (cutoff, resonance, volume, etc.)

#### Example

```tsx
import { Knob } from '@components/controls/Knob';

<Knob
  label="Cutoff"
  value={cutoff}
  min={50}
  max={18000}
  unit="Hz"
  onChange={handleCutoffChange}
  logarithmic
  defaultValue={800}
  color="var(--color-synth-filter)"
/>
```

#### Props

```typescript
interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (value: number) => void;
  logarithmic?: boolean;
  defaultValue?: number;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  displayValue?: number;    // For live display during playback
  isActive?: boolean;        // Highlight when live
  formatValue?: (v: number) => string;
}
```

---

### 4. Toggle (On/Off Switch)

**Location:** `src/components/controls/Toggle.tsx`

**When to use:** Boolean states (enable/disable features)

#### Example

```tsx
import { Toggle } from '@components/controls/Toggle';

<Toggle
  label="Enable Filter"
  value={filterEnabled}
  onChange={setFilterEnabled}
  color="var(--color-synth-filter)"
  size="sm"
/>
```

---

### 5. Switch3Way (Three-Position Switch)

**Location:** `src/components/controls/Switch3Way.tsx`

**When to use:** Three discrete options (fast/normal/slow, off/soft/hard, etc.)

#### Example

```tsx
import { Switch3Way } from '@components/controls/Switch3Way';

<Switch3Way
  label="Sweep Speed"
  value={sweepSpeed}
  options={['fast', 'normal', 'slow']}
  labels={['F', 'N', 'S']}
  onChange={handleSweepChange}
  color="var(--color-synth-accent)"
/>
```

---

### 6. Toast Notifications

**Location:** `src/components/ui/ToastNotification.tsx`, `src/stores/useNotificationStore.ts`

#### Usage

```tsx
import { notify } from '@stores/useNotificationStore';

// Success
notify.success('Project saved!', 2000);

// Error
notify.error('Failed to load file');

// Warning
notify.warning('Unsaved changes');

// Info
notify.info('Loading...');
```

---

## Usage Rules

### ✅ DO

1. **Always use the Button component**
   ```tsx
   ✅ <Button variant="primary">Save</Button>
   ❌ <button className="px-4 py-2 bg-red-500">Save</button>
   ```

2. **Always use CSS variables for colors**
   ```tsx
   ✅ style={{ color: 'var(--color-accent)' }}
   ❌ style={{ color: '#ef4444' }}
   ```

3. **Use semantic color variables**
   ```tsx
   ✅ color="var(--color-synth-filter)"  // For filter controls
   ❌ color="#00d4aa"
   ```

4. **Use existing modals/dialogs**
   ```tsx
   ✅ <Modal><ModalHeader>...</ModalHeader></Modal>
   ❌ <div className="fixed inset-0 bg-black/50">...</div>
   ```

5. **Add ARIA labels to all interactive elements**
   ```tsx
   ✅ <Button aria-label="Close dialog"><X /></Button>
   ❌ <button><X /></button>
   ```

6. **Use Knob for continuous values**
   ```tsx
   ✅ <Knob label="Volume" value={vol} onChange={setVol} />
   ❌ <input type="range" />
   ```

7. **Use Toggle for boolean states**
   ```tsx
   ✅ <Toggle label="Enable" value={enabled} onChange={setEnabled} />
   ❌ <input type="checkbox" />
   ```

### ❌ DON'T

1. **Don't create inline-styled buttons**
   ```tsx
   ❌ <button className="px-4 py-2 bg-accent-primary hover:bg-accent-secondary">
   ```

2. **Don't hardcode colors**
   ```tsx
   ❌ backgroundColor: '#ef4444'
   ❌ className="bg-red-500"
   ```

3. **Don't use raw `<input>` for controls**
   ```tsx
   ❌ <input type="range" />  // Use Knob instead
   ❌ <input type="checkbox" />  // Use Toggle instead
   ```

4. **Don't create custom modal overlays**
   ```tsx
   ❌ <div className="fixed inset-0 flex items-center justify-center">
   ```

5. **Don't skip accessibility**
   ```tsx
   ❌ <button onClick={handleClick}><X /></button>  // Missing aria-label
   ```

---

## Quick Reference

### Common Patterns

#### Dialog with Buttons
```tsx
<Modal isOpen={isOpen} onClose={onClose}>
  <ModalHeader title="Confirm Action" onClose={onClose} />
  <div className="p-6">
    <p>Are you sure?</p>
  </div>
  <ModalFooter>
    <Button variant="ghost" onClick={onClose}>Cancel</Button>
    <Button variant="danger" onClick={handleConfirm}>Delete</Button>
  </ModalFooter>
</Modal>
```

#### Control Panel
```tsx
<div className="space-y-4">
  <Knob
    label="Cutoff"
    value={cutoff}
    min={50}
    max={18000}
    onChange={setCutoff}
    color="var(--color-synth-filter)"
  />
  <Toggle
    label="Filter Enabled"
    value={enabled}
    onChange={setEnabled}
    color="var(--color-synth-filter)"
  />
</div>
```

#### Action Buttons
```tsx
<div className="flex gap-2">
  <Button variant="primary" icon={<Save size={16} />}>
    Save
  </Button>
  <Button variant="ghost">
    Cancel
  </Button>
</div>
```

---

## Component Checklist

Before creating any UI element, ask:

- [ ] Is there an existing component for this? (Check `src/components/ui/`)
- [ ] Am I using CSS variables for all colors?
- [ ] Does this need an ARIA label?
- [ ] Is this keyboard accessible?
- [ ] Does this follow the design system?
- [ ] If I need something new, did I add it to the design system first?

---

## Adding New Components

If you need a component not in this system:

1. **Check if you can compose existing components** first
2. If truly needed, create it in `src/components/ui/`
3. Use CSS variables for all colors
4. Add accessibility (ARIA labels, keyboard support)
5. **Document it in this file** with examples
6. Create a standard interface with proper TypeScript types

---

## File Locations

```
src/
├── components/
│   ├── ui/              ← Core UI components (Button, Modal, etc.)
│   ├── controls/        ← Input controls (Knob, Toggle, Switch3Way)
│   ├── dialogs/         ← Full dialog components
│   └── ...
├── index.css           ← CSS variables, base styles
└── stores/
    └── useNotificationStore.ts  ← Toast notifications
```

---

## Version History

- **1.0** (2026-01-20) - Initial design system documentation
  - Documented existing components (Button, Modal, Knob, Toggle, Switch3Way)
  - Established color system and CSS variables
  - Created usage rules and guidelines
  - Standardized buttons across App.tsx, ImportModuleDialog, PedalboardManager

---

**Remember:** This design system is mandatory. Always consult it before building UI.
