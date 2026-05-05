/**
 * useHelpDialog — shared state and computed values for the Help dialog.
 * Used by both HelpModal (DOM) and PixiHelpModal (Pixi GL).
 */

import { useState, useEffect, useMemo } from 'react';
import { CHIP_EFFECT_REFERENCE } from '../../data/ChipEffectReference';
import { useTrackerStore, useCursorStore, useInstrumentStore } from '../../stores';
import { FurnaceChipType } from '../../engine/chips/FurnaceChipEngine';
import type { HelpTab } from '../../data/helpContent';
import { TUTORIAL_STEPS } from '../../data/helpContent';
import type { ChipEffect } from '../../data/ChipEffectReference';
import { MANUAL_CHAPTERS, MANUAL_PARTS } from '../../data/manualChapters';

// ── typeMap: synthType string → FurnaceChipType ───────────────────────────────

const SYNTH_TYPE_MAP: Record<string, number> = {
  'FurnaceNES': FurnaceChipType.NES,
  'FurnaceGB': FurnaceChipType.GB,
  'FurnaceC64': FurnaceChipType.SID,
  'FurnaceSID6581': FurnaceChipType.SID_6581,
  'FurnaceSID8580': FurnaceChipType.SID_8580,
  'FurnaceOPL': FurnaceChipType.OPL3,
  'FurnaceOPL3': FurnaceChipType.OPL3,
  'FurnaceOPLL': FurnaceChipType.OPLL,
  'FurnaceOPN': FurnaceChipType.OPN,
  'FurnaceOPN2': FurnaceChipType.OPN2,
  'FurnaceOPM': FurnaceChipType.OPM,
  'FurnacePCE': FurnaceChipType.PCE,
  'FurnaceAY': FurnaceChipType.AY,
  'FurnaceSNES': FurnaceChipType.SNES,
  'FurnaceAmiga': FurnaceChipType.AMIGA,
};

// ── Hook params / return ──────────────────────────────────────────────────────

export interface UseHelpDialogParams {
  isOpen: boolean;
  initialTab?: HelpTab;
}

export interface UseHelpDialogResult {
  /** Active tab */
  activeTab: HelpTab;
  setActiveTab: (tab: HelpTab) => void;
  /** Tutorial step index (0-based) */
  tutorialStep: number;
  setTutorialStep: (step: number) => void;
  prevTutorialStep: () => void;
  nextTutorialStep: () => void;
  tutorialProgress: number;
  /** Chip detection */
  currentChip: number | null;
  chipEffects: ChipEffect[];
  chipName: string;
  /** Manual tab */
  manualChapterIndex: number;
  setManualChapterIndex: (index: number) => void;
  manualSearchQuery: string;
  setManualSearchQuery: (query: string) => void;
  filteredChapters: typeof MANUAL_CHAPTERS;
  manualParts: typeof MANUAL_PARTS;
}

// ── useHelpDialog ─────────────────────────────────────────────────────────────

export function useHelpDialog({ isOpen, initialTab = 'shortcuts' }: UseHelpDialogParams): UseHelpDialogResult {
  const [activeTab, setActiveTab] = useState<HelpTab>(initialTab);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [manualChapterIndex, setManualChapterIndex] = useState(0);
  const [manualSearchQuery, setManualSearchQuery] = useState('');

  // Sync tab when isOpen/initialTab changes
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Store subscriptions
  const cursor = useCursorStore((s) => s.cursor);
  const patterns = useTrackerStore((s) => s.patterns);
  const currentPatternIndex = useTrackerStore((s) => s.currentPatternIndex);
  const instruments = useInstrumentStore((s) => s.instruments);

  // Chip detection
  const currentChip = useMemo<number | null>(() => {
    const pattern = patterns[currentPatternIndex];
    if (!pattern) return null;
    const cell = pattern.channels[cursor.channelIndex]?.rows[cursor.rowIndex];
    if (!cell?.instrument) return null;
    const inst = instruments.find(i => i.id === cell.instrument);
    if (!inst || !inst.synthType.startsWith('Furnace')) return null;

    if (inst.furnace?.chipType !== undefined) {
      return inst.furnace.chipType;
    }

    return SYNTH_TYPE_MAP[inst.synthType] ?? null;
  }, [cursor, patterns, currentPatternIndex, instruments]);

  const chipEffects = useMemo(() => {
    if (currentChip === null) return [];
    return CHIP_EFFECT_REFERENCE[currentChip] || [];
  }, [currentChip]);

  const chipName = useMemo(() => {
    if (currentChip === null) return 'Selected Chip';
    const entry = Object.entries(FurnaceChipType).find(([, val]) => val === currentChip);
    return entry ? entry[0] : 'Selected Chip';
  }, [currentChip]);

  // Manual chapter filtering
  const filteredChapters = useMemo(() => {
    if (!manualSearchQuery.trim()) return MANUAL_CHAPTERS;
    const q = manualSearchQuery.toLowerCase();
    return MANUAL_CHAPTERS.filter(
      ch => ch.title.toLowerCase().includes(q) || ch.content.toLowerCase().includes(q)
    );
  }, [manualSearchQuery]);

  // Tutorial navigation helpers
  const prevTutorialStep = () => setTutorialStep(s => Math.max(0, s - 1));
  const nextTutorialStep = () => setTutorialStep(s => Math.min(TUTORIAL_STEPS.length - 1, s + 1));
  const tutorialProgress = Math.round((tutorialStep / (TUTORIAL_STEPS.length - 1)) * 100);

  return {
    activeTab,
    setActiveTab,
    tutorialStep,
    setTutorialStep,
    prevTutorialStep,
    nextTutorialStep,
    tutorialProgress,
    currentChip,
    chipEffects,
    chipName,
    manualChapterIndex,
    setManualChapterIndex,
    manualSearchQuery,
    setManualSearchQuery,
    filteredChapters,
    manualParts: MANUAL_PARTS,
  };
}
