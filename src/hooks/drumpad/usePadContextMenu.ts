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
import type { DrumPad, OutputBus, VelocityCurve, ScratchActionId } from '@/types/drumpad';
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
import { FACTORY_PRESETS } from '@/constants/factoryPresets';
import { getPresetsForSynthType } from '@/constants/synthPresets/allPresets';
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

  // ── Synth Presets (if pad has a synth assigned) ──────────────────────────
  if (pad.synthConfig?.synthType) {
    const presetSubmenu = buildSynthPresetSubmenu(padId, pad, store);
    if (presetSubmenu.length > 0) {
      items.push({
        id: 'presets', label: `Presets (${pad.synthConfig.synthType})`,
        submenu: presetSubmenu,
      });
    }
  }

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
    id: 'assign-scratch', label: 'Assign Scratch',
    submenu: buildScratchSubmenu(padId, pad.scratchAction, store),
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
    onClick: () => {
      // Get all pad IDs in current bank and clear them
      const bankPads = store.getCurrentBankPads();
      bankPads.forEach(pad => store.clearPad(pad.id));
    },
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

  for (const [cat, actions] of Object.entries(byCategory)) {
    items.push({
      id: `djfx-cat-${cat}`, label: categoryLabels[cat] || cat,
      submenu: actions.map((a) => ({
        id: `djfx-${a.id}`,
        label: a.name,
        radio: true,
        checked: currentAction === a.id,
        onClick: () => store.updatePad(padId, {
          djFxAction: a.id,
          name: a.name,
          playMode: a.mode === 'momentary' ? 'sustain' : 'oneshot',
        }),
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
                instrumentNote: 'C4',
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

// ── Synth Preset submenu (for pads with a synth assigned) ───────────────────

function buildSynthPresetSubmenu(
  padId: number,
  pad: DrumPad,
  store: ReturnType<typeof useDrumPadStore.getState>,
): MenuItemType[] {
  const synthType = pad.synthConfig?.synthType;
  if (!synthType) return [];

  const items: MenuItemType[] = [];

  // 1. Factory presets (full InstrumentConfig — includes effects, volume, etc.)
  const factoryPresets = FACTORY_PRESETS.filter(p => p.synthType === synthType);

  // 2. Synth presets (synth-specific config only — lighter, more focused)
  const synthPresets = getPresetsForSynthType(synthType);

  // 3. DJ One-Shot presets (for DubSiren specifically)
  const djPresets = getPresetsForSynth(synthType);

  // Group by category for synth presets
  if (synthPresets.length > 0) {
    const categories = new Map<string, typeof synthPresets>();
    for (const p of synthPresets) {
      const cat = p.category || 'other';
      if (!categories.has(cat)) categories.set(cat, []);
      categories.get(cat)!.push(p);
    }

    for (const [cat, presets] of categories) {
      for (const preset of presets) {
        items.push({
          id: `preset-synth-${preset.id}`,
          label: preset.name,
          radio: true,
          checked: pad.presetName === preset.name,
          onClick: () => applySynthPresetToPad(padId, pad, preset.name, preset.config, store),
        });
      }
      if (cat !== [...categories.keys()].pop()) {
        items.push({ type: 'divider' });
      }
    }
  }

  // Add factory presets
  if (factoryPresets.length > 0) {
    if (items.length > 0) items.push({ type: 'divider' });
    for (const preset of factoryPresets) {
      items.push({
        id: `preset-factory-${preset.name?.replace(/\s/g, '-').toLowerCase()}`,
        label: preset.name || 'Unnamed',
        radio: true,
        checked: pad.presetName === preset.name,
        onClick: () => {
          const padInstId = PAD_INSTRUMENT_BASE + padId;
          try { getToneEngine().disposeInstrument(padInstId); } catch {}
          store.updatePad(padId, {
            presetName: preset.name,
            synthConfig: {
              ...preset,
              id: padInstId,
              effects: preset.effects?.length ? preset.effects : createDefaultPadFX(),
            } as any,
          });
        },
      });
    }
  }

  // Add DJ one-shot presets for DubSiren
  if (djPresets && djPresets.length > 0 && synthType === 'DubSiren') {
    if (items.length > 0) items.push({ type: 'divider' });
    items.push({ id: 'preset-dj-header', label: '── DJ One-Shots ──', disabled: true });
    for (const preset of djPresets) {
      if (preset.synthType !== 'DubSiren') continue;
      items.push({
        id: `preset-dj-${preset.name?.replace(/\s/g, '-').toLowerCase()}`,
        label: preset.name || 'Unnamed',
        radio: true,
        checked: pad.presetName === preset.name,
        onClick: () => assignSynthWithPreset(padId, synthType, preset, store),
      });
    }
  }

  return items;
}

/** Apply a SynthPreset's config to an existing pad (merges into synthConfig) */
function applySynthPresetToPad(
  padId: number,
  pad: DrumPad,
  presetName: string,
  presetConfig: Record<string, unknown>,
  store: ReturnType<typeof useDrumPadStore.getState>,
): void {
  if (!pad.synthConfig) return;
  const padInstId = PAD_INSTRUMENT_BASE + padId;
  // Dispose cached synth so new config takes effect
  try { getToneEngine().disposeInstrument(padInstId); } catch {}
  // Merge preset config into existing synthConfig (preserve id, effects, etc.)
  store.updatePad(padId, {
    presetName,
    synthConfig: {
      ...pad.synthConfig,
      ...presetConfig,
      id: padInstId,
    } as any,
  });
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
      const presets = getPresetsForSynth(synthInfo.type);
      
      // If synth has presets, show them in a submenu
      if (presets && presets.length > 0) {
        return {
          id: `qa-${synthInfo.type.toLowerCase()}`,
          label: synthInfo.name,
          submenu: [
            {
              id: `qa-${synthInfo.type.toLowerCase()}-default`,
              label: 'Default',
              onClick: () => assignGeneralSynth(padId, synthInfo.type, store),
            },
            { id: `qa-${synthInfo.type.toLowerCase()}-div`, label: '─────', disabled: true },
            ...presets.map((preset, idx) => ({
              id: `qa-${synthInfo.type.toLowerCase()}-preset-${idx}`,
              label: preset.name || `Preset ${idx + 1}`,
              onClick: () => assignSynthWithPreset(padId, synthInfo.type, preset, store),
            })),
          ],
        };
      }
      
      // No presets - direct assignment
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
    instrumentNote: 'C4',
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
    instrumentNote: 'C4',
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
