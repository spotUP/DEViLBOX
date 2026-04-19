/**
 * usePadContextMenu — Builds context menu items for drum pads.
 *
 * Shared between DOM (ContextMenu) and Pixi (PixiContextMenu) renderers.
 * Returns a MenuItemType[] array that can be rendered directly by the DOM
 * ContextMenu or mapped to PixiContextMenu's format.
 *
 * Designed for DJ live use: quick-assign DJ FX, scratches, one-shots,
 * synth voices, output routing, velocity curves, and pad config.
 */

import { createElement, useMemo } from 'react';
import type { MenuItemType } from '@/components/common/ContextMenu';
import { useDrumPadStore } from '@/stores/useDrumPadStore';
import { PAD_COLOR_PRESETS } from '@/constants/padColorPresets';
import { SYNTH_QUICK_PRESETS } from './useDJQuickAssignData';
import { PAD_INSTRUMENT_BASE, createDefaultPadFX } from '@/types/drumpad';
import type { DrumPad, OutputBus, VelocityCurve, ScratchActionId, DubActionId } from '@/types/drumpad';
import { getDubActionsByGroup, getDubActionLabel } from '@/engine/dub/DubActions';

/**
 * Default trigger note for a pad based on its synth type.
 *
 * DubSiren-based presets (air horn, ambulance, rave siren, dub siren, foghorn
 * etc.) expose their pitch via `oscillator.frequency` in the preset body, NOT
 * via MIDI note. The synth treats C3 as a "preset default — do not override"
 * sentinel and keeps its authored frequency. Passing C4 instead forces a
 * pitch override and plays every siren at the wrong octave.
 *
 * All other synth types get C4, the usual keyboard-middle note.
 */
function defaultNoteForSynth(synthType?: string): string {
  return synthType === 'DubSiren' ? 'C3' : 'C4';
}
import type { DrumMachineType, DrumType } from '@/types/instrument/drums';
import { getDjFxByCategory, type DjFxActionId } from '@/engine/drumpad/DjFxActions';
import { DEFAULT_SCRATCH_PADS } from '@/constants/djPadModeDefaults';
import { DJ_ONE_SHOT_PRESETS } from '@/constants/djOneShotPresets';
import { ONE_SHOT_PRESETS_BY_CATEGORY } from '@/constants/djOneShotPresetsByCategory';
import { SAMPLE_FX_PRESETS, type SampleFxPreset } from '@/constants/sampleFxPresets';
import { SYNTH_CATEGORIES, getSynthInfo } from '@/constants/synthCategories';
import type { SynthType, InstrumentPreset } from '@/types/instrument';
import { TB303_PRESETS } from '@/constants/tb303Presets';
import { DECTALK_PRESETS } from '@/constants/dectalkPresets';
import { getPresetsForSynthType } from '@/constants/synthPresets/allPresets';
import type { SynthPreset } from '@/constants/synthPresets/types';
import { getToneEngine } from '@/engine/ToneEngine';

// ── Types ───────────────────────────────────────────────────────────────────

interface PadContextMenuCallbacks {
  onEdit: (padId: number) => void;
  onPreview: (padId: number) => void;
  onRename?: (padId: number) => void;
  onLoadSample?: (padId: number) => void;
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
    const isLoaded = !!(pad.sample || pad.synthConfig || pad.instrumentId != null || pad.djFxAction || pad.scratchAction || pad.pttAction || pad.dubAction);
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
  pad: DrumPad,
  hasClipboard: boolean,
  store: ReturnType<typeof useDrumPadStore.getState>,
  callbacks: PadContextMenuCallbacks,
): MenuItemType[] {
  const items: MenuItemType[] = [];

  // ── Top actions ──────────────────────────────────────────────────────────
  items.push({
    id: 'edit', label: 'Edit Pad...', onClick: () => callbacks.onEdit(padId),
  });
  items.push({
    id: 'preview', label: 'Preview', shortcut: 'Space',
    onClick: () => callbacks.onPreview(padId),
  });
  if (callbacks.onRename) {
    items.push({
      id: 'rename', label: 'Rename...',
      onClick: () => callbacks.onRename!(padId),
    });
  }

  // Synth preset picker lives in the pad editor now — opening it here kept
  // the right-click menu cluttered with category trees the editor exposes
  // more cleanly. FX presets stay here because they're the quick-switch
  // path during a set.

  // ── FX Presets (for any pad — sample or synth) ──────────────────────────
  {
    const fxSubmenu = buildSampleFxPresetSubmenu(padId, pad, store);
    if (fxSubmenu.length > 0) {
      items.push({
        id: 'fx-presets', label: 'FX Presets',
        submenu: fxSubmenu,
      });
    }
  }
  items.push({ type: 'divider' });

  // ── Clipboard ────────────────────────────────────────────────────────────
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

  // ── DJ Assign section ────────────────────────────────────────────────────
  items.push({
    id: 'assign-djfx', label: 'Assign DJ FX',
    submenu: buildDjFxSubmenu(padId, pad.djFxAction, store),
  });
  items.push({
    id: 'assign-dub', label: 'Assign Dub Action',
    submenu: buildDubActionSubmenu(padId, pad.dubAction, store),
  });
  items.push({
    id: 'assign-scratch', label: 'Assign Scratch',
    submenu: buildScratchSubmenu(padId, pad.scratchAction, store),
  });
  items.push({
    id: 'assign-ptt', label: 'Vocoder PTT',
    radio: true, checked: !!pad.pttAction,
    onClick: () => store.updatePad(padId, {
      pttAction: !pad.pttAction,
      name: !pad.pttAction ? 'Vocoder PTT' : pad.name,
      color: !pad.pttAction ? '#22c55e' : undefined,
    }),
  });
  items.push({
    id: 'assign-oneshot', label: 'Assign One Shot',
    submenu: buildOneShotSubmenu(padId, store),
  });
  items.push({
    id: 'assign-synth', label: 'Assign Synth',
    submenu: buildQuickAssignSubmenu(padId, store),
  });
  if (callbacks.onLoadSample) {
    items.push({
      id: 'load-sample', label: 'Load Sample...',
      onClick: () => callbacks.onLoadSample!(padId),
    });
  }
  items.push({ type: 'divider' });

  // ── Pad config section ───────────────────────────────────────────────────
  items.push({
    id: 'mutegroup', label: 'Mute Group',
    submenu: buildMuteGroupSubmenu(padId, pad.muteGroup, store),
  });
  items.push({
    id: 'velocity-curve', label: 'Velocity Curve',
    submenu: buildVelocityCurveSubmenu(padId, pad.velocityCurve || 'linear', store),
  });
  items.push({
    id: 'output', label: 'Output Bus',
    submenu: buildOutputBusSubmenu(padId, pad.output, store),
  });
  items.push({
    id: 'color', label: 'Color',
    submenu: buildColorSubmenu(padId, pad.color, store),
  });
  items.push({ type: 'divider' });

  // ── Quick toggles ────────────────────────────────────────────────────────
  items.push({
    id: 'reverse', label: 'Reverse',
    checked: pad.reverse,
    onClick: () => store.updatePad(padId, { reverse: !pad.reverse }),
  });
  items.push({ type: 'divider' });

  // ── Danger zone ──────────────────────────────────────────────────────────
  items.push({
    id: 'clear', label: 'Clear Pad', danger: true,
    onClick: () => store.clearPad(padId),
  });
  
  // Get current bank letter for this pad
  const currentBank = store.currentBank;
  items.push({
    id: 'clear-bank', label: `Clear All Pads in Bank ${currentBank}`, danger: true,
    onClick: () => store.clearBankPads(currentBank),
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

  // Load Sample
  if (callbacks.onLoadSample) {
    items.push({
      id: 'load-sample', label: 'Load Sample...',
      onClick: () => callbacks.onLoadSample!(padId),
    });
    items.push({ type: 'divider' });
  }

  // Paste
  items.push({
    id: 'paste', label: 'Paste',
    disabled: !hasClipboard,
    onClick: () => store.pastePad(padId),
  });
  items.push({ type: 'divider' });

  // DJ-focused quick assign submenus
  items.push({
    id: 'assign-djfx', label: 'Assign DJ FX',
    submenu: buildDjFxSubmenu(padId, undefined, store),
  });
  items.push({
    id: 'assign-scratch', label: 'Assign Scratch',
    submenu: buildScratchSubmenu(padId, undefined, store),
  });
  items.push({
    id: 'assign-ptt', label: 'Vocoder PTT',
    radio: true, checked: false,
    onClick: () => store.updatePad(padId, {
      pttAction: true,
      name: 'Vocoder PTT',
      color: '#22c55e',
    }),
  });
  items.push({
    id: 'assign-oneshot', label: 'Assign One Shot',
    submenu: buildOneShotSubmenu(padId, store),
  });
  items.push({
    id: 'assign-synth', label: 'Assign Synth',
    submenu: buildQuickAssignSubmenu(padId, store),
  });

  return items;
}

// ── DJ FX submenu ───────────────────────────────────────────────────────────

function buildDjFxSubmenu(
  padId: number,
  currentAction: DjFxActionId | undefined,
  store: ReturnType<typeof useDrumPadStore.getState>,
): MenuItemType[] {
  const items: MenuItemType[] = [];
  const byCategory = getDjFxByCategory();

  // None option
  items.push({
    id: 'djfx-none', label: 'None',
    radio: true, checked: !currentAction,
    onClick: () => store.updatePad(padId, { djFxAction: undefined }),
  });
  items.push({ type: 'divider' });

  // Grouped by category
  const categoryLabels: Record<string, string> = {
    hotcue: 'Hot Cues',
    loop: 'Loop',
    transport: 'Transport',
    mixer: 'Mixer',
    channel: 'Channel Mute',
    deck: 'Deck FX',
    stutter: 'Stutter / Glitch',
    delay: 'Delay / Echo',
    filter: 'Filter',
    reverb: 'Reverb / Space',
    modulation: 'Modulation',
    distortion: 'Distortion',
    tape: 'Tape / Vinyl',
    oneshot: 'Sound FX',
  };

  // Auto-color by category for quick visual identification
  const categoryColors: Record<string, string> = {
    hotcue: '#E91E63',   // pink/red — matches standard hot cue palette
    loop: '#2196F3',     // blue
    transport: '#4CAF50', // green
    mixer: '#FF9800',    // orange
    channel: '#9C27B0',  // purple
  };

  // Hot cue pads use individual colors matching the DJ standard
  const hotCueColors = ['#E91E63', '#FF9800', '#2196F3', '#4CAF50', '#9C27B0', '#00BCD4', '#FFEB3B', '#F44336'];

  for (const [cat, actions] of Object.entries(byCategory)) {
    items.push({
      id: `djfx-cat-${cat}`, label: categoryLabels[cat] || cat,
      submenu: actions.map((a, i) => {
        const color = cat === 'hotcue' ? hotCueColors[i % hotCueColors.length] : categoryColors[cat];
        return {
          id: `djfx-${a.id}`,
          label: a.name,
          radio: true,
          checked: currentAction === a.id,
          onClick: () => store.updatePad(padId, {
            djFxAction: a.id,
            name: a.name,
            playMode: a.mode === 'momentary' ? 'sustain' : 'oneshot',
            ...(color ? { color } : {}),
          }),
        };
      }),
    });
  }

  return items;
}

// ── Dub Action submenu ──────────────────────────────────────────────────────
// Assigns a King Tubby-style dub action to the pad — Throw / Hold / Mute &
// Dub / Siren / Filter Drop. See DubActions.ts for the per-action behavior.
// Also enables the Dub Bus on selection so the user doesn't have to flip the
// panel toggle first.

function buildDubActionSubmenu(
  padId: number,
  currentAction: DubActionId | undefined,
  store: ReturnType<typeof useDrumPadStore.getState>,
): MenuItemType[] {
  const items: MenuItemType[] = [];
  items.push({
    id: 'dub-none', label: 'None',
    radio: true, checked: !currentAction,
    onClick: () => store.updatePad(padId, { dubAction: undefined }),
  });
  items.push({ type: 'divider' });

  const groups = getDubActionsByGroup();
  // Color hints per group — read at a glance which pads are dub moves.
  const groupColors: Record<string, string> = {
    Throw: '#ef4444',         // red — impulsive grab
    Hold: '#f59e0b',          // amber — sustained
    'Mute & Dub': '#8b5cf6',  // purple — the drop
    FX: '#06b6d4',            // cyan — bus FX
  };

  for (const [groupName, actions] of Object.entries(groups)) {
    if (actions.length === 0) continue;
    items.push({
      id: `dub-group-${groupName}`,
      label: groupName,
      submenu: actions.map((id) => ({
        id: `dub-${id}`,
        label: getDubActionLabel(id),
        radio: true,
        checked: currentAction === id,
        onClick: () => {
          // Enable the bus + assign the action + adopt a group color so the
          // pad grid shows the dub moves as a distinct visual cluster.
          store.setDubBus({ enabled: true });
          store.updatePad(padId, {
            dubAction: id,
            name: getDubActionLabel(id),
            color: groupColors[groupName],
            // Throws are fire-and-forget → oneshot; everything else holds.
            playMode: groupName === 'Throw' ? 'oneshot' : 'sustain',
          });
        },
      })),
    });
  }
  return items;
}

// ── Scratch submenu ─────────────────────────────────────────────────────────

function buildScratchSubmenu(
  padId: number,
  currentAction: ScratchActionId | undefined,
  store: ReturnType<typeof useDrumPadStore.getState>,
): MenuItemType[] {
  const items: MenuItemType[] = [];

  // None option
  items.push({
    id: 'scratch-none', label: 'None',
    radio: true, checked: !currentAction,
    onClick: () => store.updatePad(padId, { scratchAction: undefined }),
  });
  items.push({ type: 'divider' });

  // Group the scratch pads by category
  const groups = new Map<string, typeof DEFAULT_SCRATCH_PADS>();
  for (const sp of DEFAULT_SCRATCH_PADS) {
    if (!groups.has(sp.category)) groups.set(sp.category, []);
    groups.get(sp.category)!.push(sp);
  }

  for (const [cat, pads] of groups) {
    items.push({
      id: `scratch-cat-${cat}`, label: cat,
      submenu: pads.map((sp) => ({
        id: `scratch-${sp.actionId}`,
        label: sp.label,
        radio: true,
        checked: currentAction === sp.actionId,
        onClick: () => store.updatePad(padId, {
          scratchAction: sp.actionId,
          name: `Scratch: ${sp.label}`,
        }),
      })),
    });
  }

  return items;
}

// ── One Shot submenu ────────────────────────────────────────────────────────

function buildOneShotSubmenu(
  padId: number,
  store: ReturnType<typeof useDrumPadStore.getState>,
): MenuItemType[] {
  const items: MenuItemType[] = [];

  // Use the full categorized preset list (34 presets across 7 categories)
  for (const [categoryName, presets] of Object.entries(ONE_SHOT_PRESETS_BY_CATEGORY)) {
    items.push({
      id: `os-cat-${categoryName.replace(/\s+/g, '-').toLowerCase()}`,
      label: categoryName,
      submenu: presets.map((presetInfo) => {
        const preset = DJ_ONE_SHOT_PRESETS[presetInfo.index];
        return {
          id: `os-${presetInfo.index}`,
          label: presetInfo.name,
          onClick: () => {
            if (preset) {
              store.updatePad(padId, {
                name: presetInfo.name,
                synthConfig: {
                  id: PAD_INSTRUMENT_BASE + padId,
                  type: 'synth',
                  synthType: 'DubSiren',
                  effects: [],
                  volume: -6,
                  pan: 0,
                  ...preset,
                  name: presetInfo.name,
                } as import('@/types/instrument/defaults').InstrumentConfig,
                instrumentNote: defaultNoteForSynth('DubSiren'),
                playMode: 'oneshot',
                color: presetInfo.color,
              });
            }
          },
        };
      }),
    });
  }

  return items;
}

// ── Sample FX Presets submenu ─────────────────────────────────────────────────

function buildSampleFxPresetSubmenu(
  padId: number,
  pad: DrumPad,
  store: ReturnType<typeof useDrumPadStore.getState>,
): MenuItemType[] {
  const items: MenuItemType[] = [];
  const currentPresetName = pad.presetName;

  // "No FX" option
  items.push({
    id: 'fx-none',
    label: 'No FX',
    radio: true,
    checked: !pad.effects || pad.effects.length === 0,
    onClick: () => {
      store.updatePad(padId, { effects: undefined, presetName: undefined });
      // Also update effects chain in engine
      updatePadEngineEffects(padId, store);
    },
  });
  items.push({ type: 'divider' });

  // Group presets by category
  const categories = new Map<string, SampleFxPreset[]>();
  for (const preset of SAMPLE_FX_PRESETS) {
    if (!categories.has(preset.category)) categories.set(preset.category, []);
    categories.get(preset.category)!.push(preset);
  }

  const catKeys = [...categories.keys()];
  for (const [cat, presets] of categories) {
    items.push({ id: `fx-cat-${cat}`, label: `── ${cat} ──`, disabled: true });
    for (const preset of presets) {
      // Stamp unique IDs per application
      const stampedEffects = preset.effects.map(e => ({
        ...e,
        id: `${e.id}-${padId}-${Date.now()}`,
      }));
      items.push({
        id: `fx-${preset.name.replace(/\s/g, '-').toLowerCase()}`,
        label: preset.name,
        radio: true,
        checked: currentPresetName === preset.name,
        onClick: () => {
          store.updatePad(padId, {
            effects: stampedEffects,
            presetName: preset.name,
          });
          updatePadEngineEffects(padId, store);
        },
      });
    }
    if (cat !== catKeys[catKeys.length - 1]) {
      items.push({ type: 'divider' });
    }
  }

  return items;
}

/** Trigger effects chain rebuild in DrumPadEngine after FX preset change */
function updatePadEngineEffects(
  padId: number,
  store: ReturnType<typeof useDrumPadStore.getState>,
): void {
  // Import getDrumPadEngine lazily to avoid circular dependency
  import('./useMIDIPadRouting').then(({ getDrumPadEngine }) => {
    const engine = getDrumPadEngine();
    if (!engine) return;
    const program = store.programs.get(store.currentProgramId);
    if (!program) return;
    const pad = program.pads.find(p => p.id === padId);
    if (pad) {
      engine.updatePadEffects([pad]);
    }
  }).catch(() => {});
}

// ── Quick assign submenu (synth voices) ─────────────────────────────────────

// Helper to get presets for a synth type
function getPresetsForSynth(synthType: SynthType): InstrumentPreset['config'][] | null {
  switch (synthType) {
    case 'TB303':
      return TB303_PRESETS;
    case 'DECtalk':
      return DECTALK_PRESETS;
    case 'DubSiren':
      return DJ_ONE_SHOT_PRESETS;
    default:
      return null;
  }
}

function buildQuickAssignSubmenu(
  padId: number,
  store: ReturnType<typeof useDrumPadStore.getState>,
): MenuItemType[] {
  const items: MenuItemType[] = [];

  // Build categorized menu from SYNTH_CATEGORIES
  for (const category of SYNTH_CATEGORIES) {
    const synthItems = category.synths.map((synthInfo) => {
      // Prefer the broad SynthPreset library (22+ synth types, grouped by
      // sound category). Fall back to legacy InstrumentPreset-style presets
      // (TB-303 patches, DECtalk voices, DJ one-shots) for synths that
      // predate the new format.
      const synthPresets = getPresetsForSynthType(synthInfo.type);
      const legacyPresets = getPresetsForSynth(synthInfo.type);

      if (synthPresets.length > 0) {
        // Group presets by sound category (bass / lead / pad / …) so the
        // submenu isn't a flat wall of 20+ names.
        const byCategory = new Map<string, SynthPreset[]>();
        for (const p of synthPresets) {
          const cat = p.category || 'other';
          if (!byCategory.has(cat)) byCategory.set(cat, []);
          byCategory.get(cat)!.push(p);
        }

        const submenu: MenuItemType[] = [
          {
            id: `qa-${synthInfo.type.toLowerCase()}-default`,
            label: 'Default',
            onClick: () => assignGeneralSynth(padId, synthInfo.type, store),
          },
        ];

        const catKeys = [...byCategory.keys()].sort();
        for (const cat of catKeys) {
          submenu.push({ type: 'divider' });
          submenu.push({ id: `qa-${synthInfo.type}-cat-${cat}`, label: `── ${cat} ──`, disabled: true });
          for (const preset of byCategory.get(cat)!) {
            submenu.push({
              id: `qa-${synthInfo.type.toLowerCase()}-${preset.id}`,
              label: preset.name,
              onClick: () => assignSynthWithSynthPreset(padId, synthInfo.type, preset, store),
            });
          }
        }

        return {
          id: `qa-${synthInfo.type.toLowerCase()}`,
          label: synthInfo.name,
          submenu,
        };
      }

      if (legacyPresets && legacyPresets.length > 0) {
        return {
          id: `qa-${synthInfo.type.toLowerCase()}`,
          label: synthInfo.name,
          submenu: [
            {
              id: `qa-${synthInfo.type.toLowerCase()}-default`,
              label: 'Default',
              onClick: () => assignGeneralSynth(padId, synthInfo.type, store),
            },
            { type: 'divider' as const },
            ...legacyPresets.map((preset, idx) => ({
              id: `qa-${synthInfo.type.toLowerCase()}-preset-${idx}`,
              label: preset.name || `Preset ${idx + 1}`,
              onClick: () => assignSynthWithPreset(padId, synthInfo.type, preset, store),
            })),
          ],
        };
      }

      // No presets — direct assignment
      return {
        id: `qa-${synthInfo.type.toLowerCase()}`,
        label: synthInfo.name,
        onClick: () => assignGeneralSynth(padId, synthInfo.type, store),
      };
    });

    items.push({
      id: `qa-cat-${category.id}`,
      label: category.name,
      submenu: synthItems,
    });
  }

  return items;
}

/** Assign the synth's default config and overlay a SynthPreset's synth-specific
 *  params (envelope / filter / oscillator / etc.) on top. Used by the empty-pad
 *  context menu so picking "MonoSynth → Acid Bass" creates the pad in one
 *  click with the right character. */
function assignSynthWithSynthPreset(
  padId: number,
  synthType: SynthType,
  preset: SynthPreset,
  store: ReturnType<typeof useDrumPadStore.getState>,
): void {
  // 1. Assign the base synth (creates default config via assignGeneralSynth)
  assignGeneralSynth(padId, synthType, store);

  // 2. Merge the SynthPreset's config into the freshly-assigned synthConfig.
  //    Zustand's set() is synchronous so this read sees the write from step 1.
  const program = useDrumPadStore.getState().programs.get(useDrumPadStore.getState().currentProgramId);
  const pad = program?.pads.find((p) => p.id === padId);
  if (!pad?.synthConfig) return;

  const padInstId = PAD_INSTRUMENT_BASE + padId;
  try { getToneEngine().disposeInstrument(padInstId); } catch { /* ok */ }

  store.updatePad(padId, {
    name: preset.name,
    presetName: preset.name,
    synthConfig: {
      ...pad.synthConfig,
      ...preset.config,
      id: padInstId,
    } as any,
  });
}

function assignSynthWithPreset(
  padId: number,
  synthType: SynthType,
  preset: InstrumentPreset['config'],
  store: ReturnType<typeof useDrumPadStore.getState>,
): void {
  const padInstId = PAD_INSTRUMENT_BASE + padId;
  // Dispose cached synth so new preset takes effect
  try { getToneEngine().disposeInstrument(padInstId); } catch {}
  const presetConfig = {
    ...preset,
    id: padInstId,
    effects: preset.effects?.length ? preset.effects : createDefaultPadFX(),
  };

  store.updatePad(padId, {
    name: preset.name || synthType,
    presetName: preset.name || undefined,
    synthConfig: presetConfig as any,
    instrumentNote: defaultNoteForSynth(synthType as string),
    playMode: 'oneshot',
  });
}

function assignGeneralSynth(
  padId: number,
  synthType: SynthType,
  store: ReturnType<typeof useDrumPadStore.getState>,
): void {
  const synthInfo = getSynthInfo(synthType);
  const synthName = synthInfo?.name || synthType;

  // Special handling for speech synths - prompt for text
  if (synthType === 'Sam' || synthType === 'V2Speech' || synthType === 'DECtalk' || synthType === 'PinkTrombone') {
    return assignSpeechSynth(padId, synthType, store);
  }

  // Special handling for ROM speech synths
  if (synthType === 'MAMESP0250' || synthType === 'MAMETMS5220' || synthType === 'MAMEVotrax' || 
      synthType === 'MAMEMEA8000' || synthType === 'MAMES14001A' || synthType === 'MAMEVLM5030' || 
      synthType === 'MAMEHC55516') {
    return assignROMSpeech(padId, synthType, store);
  }

  // Special handling for TR-808/TR-909 - assign kick by default
  if (synthType === 'TR808') {
    return assignSynthPreset(padId, {
      label: '808 Kick',
      machine: '808',
      drumType: 'kick',
      subType: 'kick',
      note: 'C4',
    }, store);
  }
  if (synthType === 'TR909') {
    return assignSynthPreset(padId, {
      label: '909 Kick',
      machine: '909',
      drumType: 'kick',
      subType: 'kick',
      note: 'C4',
    }, store);
  }

  // Default: create basic synth config
  store.updatePad(padId, {
    name: synthName,
    presetName: undefined,
    synthConfig: {
      id: PAD_INSTRUMENT_BASE + padId,
      name: synthName,
      type: 'synth',
      synthType,
      effects: createDefaultPadFX(),
      volume: 0,
      pan: 0,
    },
    instrumentNote: defaultNoteForSynth(synthType as string),
    playMode: 'oneshot',
  });
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

function assignSpeechSynth(
  padId: number,
  synthType: 'Sam' | 'V2Speech' | 'DECtalk' | 'PinkTrombone',
  store: ReturnType<typeof useDrumPadStore.getState>,
): void {
  const synthNames = {
    Sam: 'SAM',
    V2Speech: 'V2 Speech',
    DECtalk: 'DECtalk',
    PinkTrombone: 'Pink Trombone',
  };
  
  const defaultText = 'HELLO WORLD';
  
  // Base config for all speech synths
  const baseConfig: any = {
    id: PAD_INSTRUMENT_BASE + padId,
    name: `${synthNames[synthType]}: ${defaultText}`,
    type: 'synth' as const,
    synthType,
    effects: [],
    volume: -6,
    pan: 0,
  };
  
  // Add synth-specific config with defaults
  if (synthType === 'Sam') {
    baseConfig.sam = {
      text: defaultText,
      pitch: 64,
      speed: 72,
      mouth: 128,
      throat: 128,
      singmode: true,
      phonetic: false,
      vowelSequence: [],
      vowelLoopSingle: true,
    };
  } else if (synthType === 'V2Speech') {
    baseConfig.v2Speech = {
      text: defaultText,
      speed: 1.0,
      pitch: 1.0,
      formantShift: 1.0,
      singMode: true,
      vowelSequence: [],
      vowelLoopSingle: true,
    };
  } else if (synthType === 'DECtalk') {
    baseConfig.dectalk = {
      text: defaultText,
      voice: 0,
      rate: 180,
      pitch: 0.5,
      volume: 0.8,
    };
  } else if (synthType === 'PinkTrombone') {
    baseConfig.parameters = {
      text: defaultText,
      voiceType: 'vowel',
    };
  }
  
  store.updatePad(padId, {
    name: synthNames[synthType],
    synthConfig: baseConfig,
    instrumentNote: 'C4',
    playMode: 'oneshot',
  });
}

function assignROMSpeech(
  padId: number,
  synthType: 'MAMESP0250' | 'MAMETMS5220' | 'MAMEVotrax' | 'MAMEMEA8000' | 'MAMES14001A' | 'MAMEVLM5030' | 'MAMEHC55516',
  store: ReturnType<typeof useDrumPadStore.getState>,
): void {
  const synthNames = {
    MAMESP0250: 'GI SP0250',
    MAMETMS5220: 'TI TMS5220',
    MAMEVotrax: 'Votrax SC-01',
    MAMEMEA8000: 'Philips MEA8000',
    MAMES14001A: 'S14001A',
    MAMEVLM5030: 'Sanyo VLM5030',
    MAMEHC55516: 'Harris HC55516',
  };
  
  const defaultSample = 'HELLO';
  
  store.updatePad(padId, {
    name: synthNames[synthType],
    synthConfig: {
      id: PAD_INSTRUMENT_BASE + padId,
      name: synthNames[synthType],
      type: 'synth',
      synthType,
      effects: [],
      volume: -6,
      pan: 0,
      parameters: {
        romSample: defaultSample,
        romsLoaded: true,
      },
    },
    instrumentNote: 'C4',
    playMode: 'oneshot',
  });
}

// ── Mute Group submenu ──────────────────────────────────────────────────────

function buildMuteGroupSubmenu(
  padId: number,
  current: number,
  store: ReturnType<typeof useDrumPadStore.getState>,
): MenuItemType[] {
  return [
    {
      id: 'mg-0', label: 'None',
      radio: true, checked: current === 0,
      onClick: () => store.updatePad(padId, { muteGroup: 0 }),
    },
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `mg-${i + 1}`,
      label: `Group ${i + 1}`,
      radio: true,
      checked: current === i + 1,
      onClick: () => store.updatePad(padId, { muteGroup: i + 1 }),
    })),
  ];
}

// ── Velocity Curve submenu ──────────────────────────────────────────────────

const VELOCITY_CURVES: { id: VelocityCurve; label: string }[] = [
  { id: 'linear',      label: 'Linear' },
  { id: 'exponential', label: 'Exponential (soft touch)' },
  { id: 'logarithmic', label: 'Logarithmic (hard touch)' },
  { id: 'scurve',      label: 'S-Curve' },
  { id: 'fixed',       label: 'Fixed (max velocity)' },
];

function buildVelocityCurveSubmenu(
  padId: number,
  current: VelocityCurve,
  store: ReturnType<typeof useDrumPadStore.getState>,
): MenuItemType[] {
  return VELOCITY_CURVES.map((vc) => ({
    id: `vc-${vc.id}`,
    label: vc.label,
    radio: true,
    checked: current === vc.id,
    onClick: () => store.updatePad(padId, { velocityCurve: vc.id }),
  }));
}

// ── Output Bus submenu ──────────────────────────────────────────────────────

const OUTPUT_BUSES: { id: OutputBus; label: string }[] = [
  { id: 'stereo', label: 'Stereo (Main)' },
  { id: 'out1',   label: 'Out 1' },
  { id: 'out2',   label: 'Out 2' },
  { id: 'out3',   label: 'Out 3' },
  { id: 'out4',   label: 'Out 4' },
];

function buildOutputBusSubmenu(
  padId: number,
  current: OutputBus,
  store: ReturnType<typeof useDrumPadStore.getState>,
): MenuItemType[] {
  return OUTPUT_BUSES.map((bus) => ({
    id: `out-${bus.id}`,
    label: bus.label,
    radio: true,
    checked: current === bus.id,
    onClick: () => store.updatePad(padId, { output: bus.id }),
  }));
}

// ── Color submenu ───────────────────────────────────────────────────────────

function buildColorSubmenu(
  padId: number,
  current: string | undefined,
  store: ReturnType<typeof useDrumPadStore.getState>,
): MenuItemType[] {
  return [
    {
      id: 'color-none', label: 'Default',
      radio: true, checked: !current,
      onClick: () => store.updatePad(padId, { color: undefined }),
    },
    ...PAD_COLOR_PRESETS.map((c) => ({
      id: `color-${c.id}`,
      label: c.label,
      radio: true,
      checked: current === c.hex,
      icon: colorSwatchIcon(c.hex),
      onClick: () => store.updatePad(padId, { color: c.hex }),
    })),
  ];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Tiny inline color swatch as a React element (DOM only) */
function colorSwatchIcon(hex: string): React.ReactNode {
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
