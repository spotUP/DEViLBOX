# DEViLBOX Development Guidelines

This document outlines important development standards and best practices for the DEViLBOX project.

## Component Consistency

**CRITICAL: Always use existing components instead of creating duplicate implementations.**

### The Problem
Creating multiple versions of the same UI component leads to:
- Inconsistent user experience across the application
- Increased maintenance burden
- Difficulty applying theme changes globally
- Code duplication and bloat

### The Solution
**Before creating a new component, always check if one already exists:**

1. Search the codebase for similar functionality
2. Check `src/components/controls/` for reusable UI controls
3. Check `src/components/ui/` for shared UI elements
4. Reuse and extend existing components rather than duplicating

### Examples of Component Reuse

#### ✅ CORRECT: Using Existing Toggle Component
```tsx
import { Toggle } from '@components/controls/Toggle';

// In your component
<Toggle
  label="Feature Name"
  value={isEnabled}
  onChange={setIsEnabled}
  size="sm"
/>
```

#### ❌ INCORRECT: Creating Custom Toggle
```tsx
// DON'T DO THIS - creates inconsistency
const CustomToggle = ({ checked, onChange }) => {
  return (
    <button onClick={() => onChange(!checked)}>
      {/* Custom implementation */}
    </button>
  );
};
```

### Common Reusable Components

Located in `src/components/controls/`:
- **Toggle** - Hardware-style on/off switches (Devil Fish panel style)
- **Knob** - Rotary knobs with value display
- **Switch3Way** - Three-position switches

Located in `src/components/ui/`:
- **ADSREnvelope** - ADSR envelope visualizer
- **FilterCurve** - Filter response curve display
- **Knob** - Alternative knob implementation

### Historical Example: Toggle Switch Duplication

**Issue Found:** The settings modal initially created a custom inline toggle switch, while the Devil Fish panel used the existing `Toggle` component. This created visual inconsistency.

**Resolution:** Removed the custom toggle and replaced with the existing `Toggle` component, ensuring consistent appearance and behavior across the application.

## Theme Consistency

- Always use theme color variables (e.g., `text-ft2-highlight`, `bg-ft2-bg`)
- Never hardcode colors that should respond to theme changes
- Test UI changes in both FT2 Blue and Cyan Lineart themes
- Use `focus:outline-none` with theme-appropriate focus states

## Code Standards

### Imports
- Use path aliases (`@components`, `@stores`, `@typedefs`, etc.)
- Group imports logically (React, third-party, local components, types)

### Styling
- Prefer Tailwind utility classes over inline styles
- Use theme variables for colors
- Remove unnecessary `rounded` classes for FT2 aesthetic (sharp corners)
- Add `focus:outline-none` to interactive elements

### Component Structure
- Keep components focused and single-purpose
- Extract reusable logic into custom hooks
- Use TypeScript interfaces for props
- Add display names to memoized components

## When to Create New Components

Only create a new component when:
1. No existing component provides the needed functionality
2. The component is truly generic and reusable
3. It follows the established design system
4. It's properly documented and themed

## Remember

**Consistency over customization.** The user experience benefits from familiar, consistent UI patterns throughout the application.
