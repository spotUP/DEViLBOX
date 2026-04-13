/**
 * usePadContextMenu — Builds context menu items for drum pads.
 *
 * Shared between DOM (ContextMenu) and Pixi (PixiContextMenu) renderers.
 * Returns a MenuItemType[] array that can be rendered directly by the DOM
 * ContextMenu or mapped to PixiContextMenu's format.
 */

import { useMemo } from 'react';
import type { MenuItemType } from '@/components/common/ContextMenu';
import { useDrumPadStore } from '@/stores/useDrumPadStore';
import { PAD_COLOR_PRESETS } from '@/constants/padColorPresets';
import { SYNTH_QUICK_PRESETS } from './useDJQuickAssignData';
import { PAD_INSTRUMENT_BASE } from '@/types/drumpad';
import type { DrumMachineType, DrumType } from '@/types/instrument/drums';

// ── Types ───────────────────────────────────────────────────────────────────

interface PadContextMenuCallbacks {
  onEdit: (padId: number) => void;
  onWizard: (padId: number) => void;
  onPreview: (padId: number) => void;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function usePadContextMenu(
  padId: number | null,
  callbacks: PadContextMenuCallbacks,
): MenuItemType[] {
  const programs = useDrumPadStore((s) => s.programs);
  const currentProgramId = useDrumPadStore((s) => s.currentProgramId);
  const clipboardPad = useDrumPadStore((s) => s.clipboardPad);

  return useMemo(() => {
    if (padId === null) return [];

    const program = programs.get(currentProgramId);
    const pad = program?.pads.find((p) => p.id === padId);
    if (!pad) return [];

    const store = useDrumPadStore.getState();
    const isLoaded = !!(pad.sample || pad.synthConfig || pad.instrumentId != null || pad.djFxAction || pad.scratchAction);
    const hasClipboard = clipboardPad !== null;

    if (isLoaded) {
      return buildLoadedPadMenu(padId, pad, hasClipboard, store, callbacks);
    } else {
      return buildEmptyPadMenu(padId, hasClipboard, store, callbacks);
    }
  }, [padId, programs, currentProgramId, clipboardPad, callbacks]);
}

// ── Loaded pad menu ─────────────────────────────────────────────────────────

function buildLoadedPadMenu(
  padId: number,
  pad: { name: string; playMode: string; muteGroup: number; color?: string },
  hasClipboard: boolean,
  store: ReturnType<typeof useDrumPadStore.getState>,
  callbacks: PadContextMenuCallbacks,
): MenuItemType[] {
  const items: MenuItemType[] = [];

  // Edit
  items.push({
    id: 'edit', label: 'Edit Pad...', onClick: () => callbacks.onEdit(padId),
  });
  items.push({
    id: 'preview', label: 'Preview', onClick: () => callbacks.onPreview(padId),
  });
  items.push({ type: 'divider' });

  // Clipboard
  items.push({
    id: 'copy', label: 'Copy', shortcut: 'Ctrl+C',
    onClick: () => store.copyPad(padId),
  });
  items.push({
    id: 'paste', label: 'Paste', shortcut: 'Ctrl+V',
    disabled: !hasClipboard,
    onClick: () => store.pastePad(padId),
  });
  items.push({
    id: 'swap', label: 'Swap with Clipboard',
    disabled: !hasClipboard,
    onClick: () => store.swapPad(padId),
  });
  items.push({ type: 'divider' });

  // Play Mode submenu
  items.push({
    id: 'playmode', label: 'Play Mode',
    submenu: [
      {
        id: 'pm-oneshot', label: 'One-shot',
        radio: true, checked: pad.playMode === 'oneshot',
        onClick: () => store.updatePad(padId, { playMode: 'oneshot' }),
      },
      {
        id: 'pm-sustain', label: 'Sustain',
        radio: true, checked: pad.playMode === 'sustain',
        onClick: () => store.updatePad(padId, { playMode: 'sustain' }),
      },
    ],
  });

  // Mute Group submenu
  items.push({
    id: 'mutegroup', label: 'Mute Group',
    submenu: [
      {
        id: 'mg-0', label: 'None',
        radio: true, checked: pad.muteGroup === 0,
        onClick: () => store.updatePad(padId, { muteGroup: 0 }),
      },
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `mg-${i + 1}`,
        label: `Group ${i + 1}`,
        radio: true,
        checked: pad.muteGroup === i + 1,
        onClick: () => store.updatePad(padId, { muteGroup: i + 1 }),
      })),
    ],
  });

  // Color submenu
  items.push({
    id: 'color', label: 'Color',
    submenu: [
      {
        id: 'color-none', label: 'Default',
        radio: true, checked: !pad.color,
        onClick: () => store.updatePad(padId, { color: undefined }),
      },
      ...PAD_COLOR_PRESETS.map((c) => ({
        id: `color-${c.id}`,
        label: c.label,
        radio: true,
        checked: pad.color === c.hex,
        icon: colorSwatchIcon(c.hex),
        onClick: () => store.updatePad(padId, { color: c.hex }),
      })),
    ],
  });

  items.push({ type: 'divider' });

  // Clear
  items.push({
    id: 'clear', label: 'Clear Pad', danger: true,
    onClick: () => store.clearPad(padId),
  });

  return items;
}

// ── Empty pad menu ──────────────────────────────────────────────────────────

function buildEmptyPadMenu(
  padId: number,
  hasClipboard: boolean,
  store: ReturnType<typeof useDrumPadStore.getState>,
  callbacks: PadContextMenuCallbacks,
): MenuItemType[] {
  const items: MenuItemType[] = [];

  // Wizard
  items.push({
    id: 'setup', label: 'Setup Pad...',
    onClick: () => callbacks.onWizard(padId),
  });
  items.push({ type: 'divider' });

  // Paste
  items.push({
    id: 'paste', label: 'Paste',
    disabled: !hasClipboard,
    onClick: () => store.pastePad(padId),
  });
  items.push({ type: 'divider' });

  // Quick Assign submenu — synth voices
  items.push({
    id: 'quick-assign', label: 'Quick Assign',
    submenu: buildQuickAssignSubmenu(padId, store),
  });

  return items;
}

// ── Quick assign submenu ────────────────────────────────────────────────────

function buildQuickAssignSubmenu(
  padId: number,
  store: ReturnType<typeof useDrumPadStore.getState>,
): MenuItemType[] {
  const items: MenuItemType[] = [];

  // Group synth presets by machine
  const groups = new Map<string, typeof SYNTH_QUICK_PRESETS>();
  for (const preset of SYNTH_QUICK_PRESETS) {
    const key = preset.machine === '808' ? 'TR-808' : 'TR-909';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(preset);
  }

  for (const [groupLabel, presets] of groups) {
    items.push({
      id: `qa-group-${groupLabel}`, label: groupLabel,
      submenu: presets.map((p) => ({
        id: `qa-${p.label.replace(/\s+/g, '-').toLowerCase()}`,
        label: p.label.replace(/^(808|909)\s/, ''),
        onClick: () => assignSynthPreset(padId, p, store),
      })),
    });
  }

  return items;
}

function assignSynthPreset(
  padId: number,
  preset: (typeof SYNTH_QUICK_PRESETS)[number],
  store: ReturnType<typeof useDrumPadStore.getState>,
): void {
  const synthType = preset.machine === '808' ? 'TR808' : 'TR909';
  const paramKey = preset.machine === '808' ? 'io808Type' : 'tr909Type';
  store.updatePad(padId, {
    name: preset.label,
    synthConfig: {
      id: PAD_INSTRUMENT_BASE + padId,
      name: preset.label,
      type: 'synth',
      synthType,
      drumMachine: {
        drumType: preset.drumType as DrumType,
        machineType: preset.machine as DrumMachineType,
        noteMode: 'pitch',
      },
      effects: [],
      volume: 0,
      pan: 0,
      parameters: { [paramKey]: preset.subType },
    },
    instrumentNote: preset.note,
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Tiny inline color swatch as a React element (DOM only) */
function colorSwatchIcon(hex: string): React.ReactNode {
  // Using createElement to avoid JSX in a .ts file
  const { createElement } = require('react');
  return createElement('span', {
    style: {
      display: 'inline-block',
      width: 10,
      height: 10,
      borderRadius: 2,
      backgroundColor: hex,
    },
  });
}
