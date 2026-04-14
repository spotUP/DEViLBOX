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
import { PAD_INSTRUMENT_BASE } from '@/types/drumpad';
import type { DrumPad, OutputBus, VelocityCurve, ScratchActionId } from '@/types/drumpad';
import type { DrumMachineType, DrumType } from '@/types/instrument/drums';
import { getDjFxByCategory, type DjFxActionId } from '@/engine/drumpad/DjFxActions';
import { DEFAULT_SCRATCH_PADS } from '@/constants/djPadModeDefaults';
import { DJ_ONE_SHOT_PRESETS } from '@/constants/djOneShotPresets';
import { ONE_SHOT_PRESETS_BY_CATEGORY } from '@/constants/djOneShotPresetsByCategory';

// ── Types ───────────────────────────────────────────────────────────────────

interface PadContextMenuCallbacks {
  onEdit: (padId: number) => void;
  onWizard: (padId: number) => void;
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
    id: 'playmode', label: 'Play Mode',
    submenu: buildPlayModeSubmenu(padId, pad.playMode, store),
  });
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
  if (callbacks.onLoadSample) {
    items.push({
      id: 'load-sample', label: 'Load Sample...',
      onClick: () => callbacks.onLoadSample!(padId),
    });
  }
  items.push({ type: 'divider' });

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

// ── Quick assign submenu (synth voices) ─────────────────────────────────────

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

  // Add Speech options
  items.push({
    id: 'qa-group-speech', label: 'Speech',
    submenu: [
      {
        id: 'qa-sam',
        label: 'SAM (Commodore)...',
        onClick: () => assignSpeechSynth(padId, 'Sam', store),
      },
      {
        id: 'qa-v2speech',
        label: 'V2 Speech (Ronan/Lisa)...',
        onClick: () => assignSpeechSynth(padId, 'V2Speech', store),
      },
      {
        id: 'qa-dectalk',
        label: 'DECtalk (Stephen Hawking)...',
        onClick: () => assignSpeechSynth(padId, 'DECtalk', store),
      },
      {
        id: 'qa-pinktrombone',
        label: 'Pink Trombone (Vocal Tract)...',
        onClick: () => assignSpeechSynth(padId, 'PinkTrombone', store),
      },
      { id: 'qa-speech-divider-1', label: '─────', disabled: true },
      {
        id: 'qa-mamesp0250',
        label: 'GI SP0250 (Arcade)...',
        onClick: () => assignROMSpeech(padId, 'MAMESP0250', store),
      },
      {
        id: 'qa-mametms5220',
        label: 'TI TMS5220 (Speak & Spell)...',
        onClick: () => assignROMSpeech(padId, 'MAMETMS5220', store),
      },
      {
        id: 'qa-mamevotrax',
        label: 'Votrax SC-01 (Classic)...',
        onClick: () => assignROMSpeech(padId, 'MAMEVotrax', store),
      },
      {
        id: 'qa-mamemea8000',
        label: 'Philips MEA8000 (LPC)...',
        onClick: () => assignROMSpeech(padId, 'MAMEMEA8000', store),
      },
      {
        id: 'qa-mames14001a',
        label: 'S14001A (Berzerk)...',
        onClick: () => assignROMSpeech(padId, 'MAMES14001A', store),
      },
      {
        id: 'qa-mamevlm5030',
        label: 'Sanyo VLM5030 (Konami)...',
        onClick: () => assignROMSpeech(padId, 'MAMEVLM5030', store),
      },
      {
        id: 'qa-mamehc55516',
        label: 'Harris HC55516 (Sinistar)...',
        onClick: () => assignROMSpeech(padId, 'MAMEHC55516', store),
      },
    ],
  });

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
  
  const text = window.prompt(`Enter text for ${synthNames[synthType]}:`, 'HELLO WORLD');
  if (text === null) return; // User cancelled
  
  const finalText = text.trim() || 'HELLO WORLD';
  
  // Base config for all speech synths
  const baseConfig: any = {
    id: PAD_INSTRUMENT_BASE + padId,
    name: `${synthNames[synthType]}: ${finalText}`,
    type: 'synth' as const,
    synthType,
    effects: [],
    volume: -6,
    pan: 0,
  };
  
  // Add synth-specific config
  if (synthType === 'Sam') {
    baseConfig.sam = {
      text: finalText,
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
      text: finalText,
      speed: 1.0,
      pitch: 1.0,
      formantShift: 1.0,
      singMode: true,
      vowelSequence: [],
      vowelLoopSingle: true,
    };
  } else if (synthType === 'DECtalk') {
    baseConfig.parameters = {
      text: finalText,
      voice: 'paul',
      rate: 180,
      pitch: 100,
    };
  } else if (synthType === 'PinkTrombone') {
    baseConfig.parameters = {
      text: finalText,
      voiceType: 'vowel',
    };
  }
  
  store.updatePad(padId, {
    name: `${synthNames[synthType]}: ${finalText.substring(0, 20)}`,
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
  
  // Prompt for ROM sample/phrase to play
  const sample = window.prompt(
    `Enter ROM sample/phrase for ${synthNames[synthType]}:`,
    'HELLO'
  );
  if (sample === null) return; // User cancelled
  
  const finalSample = sample.trim() || 'HELLO';
  
  store.updatePad(padId, {
    name: `${synthNames[synthType]}: ${finalSample.substring(0, 20)}`,
    synthConfig: {
      id: PAD_INSTRUMENT_BASE + padId,
      name: `${synthNames[synthType]}: ${finalSample}`,
      type: 'synth',
      synthType,
      effects: [],
      volume: -6,
      pan: 0,
      parameters: {
        romSample: finalSample, // Store which sample to play
        romsLoaded: true,
      },
    },
    instrumentNote: 'C4',
    playMode: 'oneshot',
  });
}

// ── Play Mode submenu ───────────────────────────────────────────────────────

function buildPlayModeSubmenu(
  padId: number,
  current: string,
  store: ReturnType<typeof useDrumPadStore.getState>,
): MenuItemType[] {
  return [
    {
      id: 'pm-oneshot', label: 'One-shot',
      radio: true, checked: current === 'oneshot',
      onClick: () => store.updatePad(padId, { playMode: 'oneshot' }),
    },
    {
      id: 'pm-sustain', label: 'Sustain (hold to play)',
      radio: true, checked: current === 'sustain',
      onClick: () => store.updatePad(padId, { playMode: 'sustain' }),
    },
  ];
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
