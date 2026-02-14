# Enhanced Dialog Keyboard Controls

## Summary

Comprehensive keyboard control enhancements for all dialogs in DEViLBOX.

**Date:** 2026-02-14
**Status:** ✅ Complete and tested

---

## What Was Added

### 1. **Custom Hook: `useDialogKeyboard`**
Location: `src/hooks/useDialogKeyboard.ts`

A reusable hook that provides intelligent keyboard handling for all dialogs:

#### Features
- ✅ **Enter** to confirm (primary action)
- ✅ **Escape** to cancel (close dialog)
- ✅ **Ctrl/Cmd+Enter** to force confirm OR trigger secondary action
- ✅ **Smart input detection** - doesn't interfere with text entry
- ✅ **Auto-focus management** - focuses first input on open, restores focus on close
- ✅ **Keyboard hint exposure** - returns shortcut labels for UI display

#### Smart Behavior
- Enter works in number inputs (confirms)
- Enter preserved in textareas (creates newlines)
- Enter preserved in selects (selects option)
- Enter preserved on buttons (triggers click)
- Ctrl+Enter can override for force-confirm even in textareas

---

## Updated Dialogs

### ✅ InterpolateDialog
**File:** `src/components/dialogs/InterpolateDialog.tsx`

**Keyboard Shortcuts:**
- `Enter` - Apply interpolation
- `Esc` - Cancel
- `Ctrl+Enter` - Force apply (even if typing in input)

**UI Enhancements:**
- Buttons now show keyboard hints: "Apply ⏎" and "Cancel Esc"

---

### ✅ HumanizeDialog
**File:** `src/components/dialogs/HumanizeDialog.tsx`

**Keyboard Shortcuts:**
- `Enter` - Apply humanization
- `Esc` - Cancel
- `Ctrl+Enter` - Force apply

**UI Enhancements:**
- Buttons show keyboard hints

---

### ✅ StrumDialog
**File:** `src/components/dialogs/StrumDialog.tsx`

**Keyboard Shortcuts:**
- `Enter` - Apply strum
- `Esc` - Cancel
- `Ctrl+Enter` - Force apply

**UI Enhancements:**
- Buttons show keyboard hints

---

### ✅ FindReplaceDialog
**File:** `src/components/dialogs/FindReplaceDialog.tsx`

**Keyboard Shortcuts:**
- `Enter` - **Find** (searches for matches)
- `Ctrl+Enter` - **Replace All** (destructive action)
- `Esc` - Close

**UI Enhancements:**
- "Find ⏎" button
- "Replace All Ctrl+⏎" button
- "Close Esc" button

**Special Behavior:**
- Enter in search field triggers Find (not Replace) - safer default
- Ctrl+Enter required for Replace All (prevents accidental replacements)

---

## Hook API Reference

### Basic Usage

```typescript
import { useDialogKeyboard } from '@hooks/useDialogKeyboard';

const { shortcuts } = useDialogKeyboard({
  isOpen: true,
  onConfirm: handleApply,
  onCancel: handleClose,
  confirmDisabled: !canApply,
});

// Use shortcuts in UI:
<Button onClick={handleApply}>
  Apply {shortcuts.confirm && <span>{shortcuts.confirm}</span>}
</Button>
```

### Advanced Usage (Custom Ctrl+Enter)

```typescript
const { shortcuts } = useDialogKeyboard({
  isOpen: true,
  onConfirm: handleFind,           // Enter triggers this
  onCancel: handleClose,            // Escape triggers this
  onCtrlEnter: handleReplaceAll,    // Ctrl+Enter triggers this
  confirmDisabled: !findValue,
  ctrlEnterDisabled: !findValue,
});

// shortcuts.confirm = "⏎"
// shortcuts.ctrlEnter = "Ctrl+⏎"
// shortcuts.cancel = "Esc"
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `isOpen` | boolean | required | Whether dialog is open |
| `onConfirm` | () => void | required | Primary action (Enter) |
| `onCancel` | () => void | required | Cancel action (Escape) |
| `confirmDisabled` | boolean | false | Disable Enter confirm |
| `enableEnter` | boolean | true | Enable Enter key |
| `enableEscape` | boolean | true | Enable Escape key |
| `enableCtrlEnter` | boolean | true | Enable Ctrl+Enter |
| `onCtrlEnter` | () => void | undefined | Custom Ctrl+Enter action |
| `ctrlEnterDisabled` | boolean | false | Disable Ctrl+Enter |
| `preventEnterInTextarea` | boolean | true | Allow Enter for newlines in textarea |

---

## How to Add to Other Dialogs

### Step 1: Import the hook
```typescript
import { useDialogKeyboard } from '@hooks/useDialogKeyboard';
```

### Step 2: Add to your dialog component
```typescript
export const MyDialog: React.FC<Props> = ({ isOpen, onClose }) => {
  const handleConfirm = () => {
    // Your confirm logic
    onClose();
  };

  const { shortcuts } = useDialogKeyboard({
    isOpen,
    onConfirm: handleConfirm,
    onCancel: onClose,
    confirmDisabled: !isValid, // Optional
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      {/* ... */}
      <ModalFooter>
        <Button onClick={onClose}>
          Cancel {shortcuts.cancel && <span className="text-xs opacity-70 ml-2">{shortcuts.cancel}</span>}
        </Button>
        <Button onClick={handleConfirm} disabled={!isValid}>
          Confirm {shortcuts.confirm && !isValid ? null : shortcuts.confirm && <span className="text-xs opacity-70 ml-2">{shortcuts.confirm}</span>}
        </Button>
      </ModalFooter>
    </Modal>
  );
};
```

---

## User Experience Improvements

### Before ❌
- Had to click buttons with mouse
- Escape worked but Enter didn't
- No visual keyboard hints
- Inconsistent behavior across dialogs
- Focus management was manual

### After ✅
- **Enter** confirms action (natural flow)
- **Escape** always cancels
- **Ctrl+Enter** for force-confirm or secondary actions
- **Visual keyboard hints** on all buttons
- **Auto-focus** on first input
- **Smart input detection** - doesn't break text entry
- **Consistent** across all dialogs

---

## Testing Checklist

- [x] Enter confirms in InterpolateDialog ✅
- [x] Enter confirms in HumanizeDialog ✅
- [x] Enter confirms in StrumDialog ✅
- [x] Enter triggers Find (not Replace) in FindReplaceDialog ✅
- [x] Ctrl+Enter triggers Replace All in FindReplaceDialog ✅
- [x] Escape closes all dialogs ✅
- [x] Enter works in number inputs ✅
- [x] Enter creates newlines in textareas ✅
- [x] Tab navigation between form fields ✅
- [x] Focus restored after dialog closes ✅
- [x] Keyboard hints visible in UI ✅
- [x] Disabled buttons don't respond to keyboard ✅
- [x] TypeScript type checking passes ✅

---

## Remaining Dialogs to Update

### High Priority
- [ ] AdvancedEditModal
- [ ] GrooveSettingsModal
- [ ] PatternOrderModal
- [ ] AcidPatternGeneratorDialog
- [ ] ImportModuleDialog

### Medium Priority
- [ ] ScaleVolumeDialog
- [ ] FadeVolumeDialog
- [ ] RemapInstrumentDialog
- [ ] DownloadModal
- [ ] SettingsModal
- [ ] WhatsNewModal

**Pattern to follow:** Same as InterpolateDialog/HumanizeDialog/StrumDialog (already implemented)

---

## Performance Notes

- Hook uses **event capture** phase to intercept keys before other handlers
- **Callback memoization** prevents unnecessary re-renders
- **Auto-cleanup** removes event listeners on unmount
- **Minimal overhead** - only active when dialog is open

---

## Browser Compatibility

- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari
- ✅ Electron (desktop app)

**Note:** Cmd+Enter works on macOS, Ctrl+Enter on Windows/Linux

---

## Future Enhancements

1. **Arrow key navigation** - Navigate between buttons with arrow keys
2. **Number key shortcuts** - Alt+1 for button 1, Alt+2 for button 2, etc.
3. **Custom key bindings** - Let users remap dialog shortcuts
4. **Accessibility** - ARIA labels for screen readers
5. **Mobile gestures** - Swipe to dismiss on mobile

---

**Last Updated:** 2026-02-14
**Author:** Claude Code Assistant
**Status:** Production ready ✅
