/**
 * CustomSelect — Drop-in replacement for native <select> using DropdownButton + ContextMenu.
 *
 * Supports flat options, grouped options (optgroups rendered as submenus),
 * and auto-sizes the trigger button to the selected label.
 */

import React, { useMemo } from 'react';
import { DropdownButton, type MenuItemType } from './ContextMenu';

/* ── Public types ───────────────────────────────────────────────────────── */

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectOptionGroup {
  label: string;
  options: SelectOption[];
}

export type SelectOptions = (SelectOption | SelectOptionGroup)[];

export interface CustomSelectProps {
  /** Currently selected value */
  value: string;
  /** Called with the new value when user picks an option */
  onChange: (value: string) => void;
  /** Flat or grouped options */
  options: SelectOptions;
  /** Placeholder when no value matches */
  placeholder?: string;
  /** Extra classes on the trigger button */
  className?: string;
  /** Inline styles on the trigger button */
  style?: React.CSSProperties;
  /** Disable the selector */
  disabled?: boolean;
  /** Tooltip title */
  title?: string;
  /** Custom z-index for dropdown menu (default: 100) */
  zIndex?: number;
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

function isGroup(opt: SelectOption | SelectOptionGroup): opt is SelectOptionGroup {
  return 'options' in opt;
}

function findLabel(options: SelectOptions, value: string): string | undefined {
  for (const opt of options) {
    if (isGroup(opt)) {
      const found = opt.options.find(o => o.value === value);
      if (found) return found.label;
    } else if (opt.value === value) {
      return opt.label;
    }
  }
  return undefined;
}

/* ── Component ──────────────────────────────────────────────────────────── */

export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  className,
  style,
  disabled = false,
  title,
  zIndex,
}) => {
  const menuItems = useMemo<MenuItemType[]>(() => {
    return options.map((opt, i) => {
      if (isGroup(opt)) {
        return {
          id: `group:${opt.label}:${i}`,
          label: opt.label,
          submenu: opt.options.map(o => ({
            id: o.value,
            label: o.label,
            radio: true,
            checked: o.value === value,
            disabled: o.disabled,
            onClick: () => onChange(o.value),
          })),
        };
      }
      return {
        id: opt.value,
        label: opt.label,
        radio: true,
        checked: opt.value === value,
        disabled: opt.disabled,
        onClick: () => onChange(opt.value),
      };
    });
  }, [options, value, onChange]);

  const selectedLabel = useMemo(
    () => findLabel(options, value) ?? placeholder,
    [options, value, placeholder],
  );

  const defaultClassName =
    'h-6 px-2 whitespace-nowrap bg-dark-bgSecondary text-text-secondary text-[10px] font-mono border border-dark-border rounded cursor-pointer hover:text-text-primary hover:border-accent-highlight/50 transition-colors';

  return (
    <DropdownButton
      items={menuItems}
      className={className ?? defaultClassName}
      style={style}
      disabled={disabled}
      zIndex={zIndex}
    >
      <span className="whitespace-nowrap" title={title}>{selectedLabel} ▾</span>
    </DropdownButton>
  );
};
