/**
 * PixiEditInstrumentModal — GL-native instrument editor modal.
 *
 * Two-panel layout:
 *   Left  – instrument list (edit mode) or synth type browser (create mode)
 *   Right – tab bar (Sound / Effects) + content area
 *
 * Sound tab shows a simplified parameter view with PixiKnob/PixiSlider for the
 * most common parameters.  Full editing defers to the DOM UnifiedInstrumentEditor.
 *
 * DOM reference: src/components/instruments/EditInstrumentModal.tsx
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  PixiModal,
  PixiModalHeader,
  PixiButton,
  PixiLabel,
  PixiList,
  PixiKnob,
  PixiToggle,
  PixiSelect,
  PixiSlider,
  PixiScrollView,
  PixiIcon,
  type SelectOption,
} from '../components';
import { PIXI_FONTS } from '../fonts';
import { PixiPureTextInput } from '../input/PixiPureTextInput';
import { usePixiTheme } from '../theme';
import { usePixiResponsive } from '../hooks/usePixiResponsive';
import { useInstrumentStore, notify } from '@stores';
import { usePresetStore, type PresetCategory } from '@stores/usePresetStore';
import { getSynthInfo, SYNTH_CATEGORIES } from '@constants/synthCategories';
import type { SynthInfo as SynthInfoType } from '@constants/synthCategories';
import { getPresetsForSynthType } from '@constants/synthPresets/allPresets';
import type { SynthType } from '@typedefs/instrument';
import type { InstrumentConfig, EffectConfig } from '@typedefs/instrument';
import { PixiModularSynthEditor } from '../views/instruments/PixiModularSynthEditor';
import { PixiAmigaSynthPanel } from '../views/instruments/PixiAmigaSynthPanel';
import { AMIGA_SYNTH_LAYOUTS } from '../views/instruments/amigaSynthLayouts';
import type { ModularPatchConfig } from '@typedefs/modular';
import { MODULAR_INIT_PATCH } from '@constants/modularPresets';
import { PixiSynthPanel } from '../views/instruments/PixiSynthPanel';
import { PixiDX7PatchBrowser } from '../views/instruments/PixiDX7PatchBrowser';
import { PixiTestKeyboard } from '../views/instruments/PixiTestKeyboard';
import { PixiPresetDropdown } from '../views/instruments/PixiPresetDropdown';
import { PixiDynamicParamPanel } from '../views/instruments/PixiDynamicParamPanel';
import { PixiHardwareUI, hasPixiHardwareUI } from '../views/instruments/PixiHardwareUI';
import { PixiFilterCurve } from '../views/instruments/PixiFilterCurve';
import { PixiADSRVisualizer } from '../views/instruments/PixiADSRVisualizer';
import { getSynthLayout } from '../views/instruments/layouts';

// ── Layout constants ────────────────────────────────────────────────────────

const LEFT_PANEL_W = 220;
const LEFT_PANEL_COLLAPSED_W = 32;
const HEADER_H = 38;
const PAD = 16;
const KNOB_SIZE = 'sm' as const;

// ── Preset category constants ───────────────────────────────────────────────

const PRESET_CATEGORIES: Array<'All' | PresetCategory> = ['All', 'Bass', 'Lead', 'Pad', 'Drum', 'FX', 'User'];

const SUGGESTED_TAGS = ['acid', 'deep', 'aggressive', 'soft', 'bright', 'dark', 'punchy', 'smooth', 'warm', 'cold', 'fat', 'thin', 'vintage', 'modern', 'ambient', 'percussive'];

// ── Synth type palette (Tailwind class → hex) ──────────────────────────────

const TW_TO_HEX: Record<string, number> = {
  'text-blue-400':    0x60A5FA,
  'text-emerald-400': 0x34D399,
  'text-green-400':   0x4ADE80,
  'text-yellow-400':  0xFACC15,
  'text-red-400':     0xF87171,
  'text-purple-400':  0xC084FC,
  'text-orange-400':  0xFB923C,
  'text-accent-highlight':    0x22D3EE,
  'text-pink-400':    0xF472B6,
  'text-neutral-400': 0xA3A3A3,
};
function twColor(tw: string): number {
  return TW_TO_HEX[tw] ?? 0xA3A3A3;
}

// ── Types ───────────────────────────────────────────────────────────────────

type ActiveTab = 'sound' | 'effects' | 'script' | 'controls';

interface PixiEditInstrumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  createMode?: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Build PixiList items from the instrument array */
function instrumentListItems(instruments: InstrumentConfig[]) {
  return instruments.map((inst) => {
    const info = getSynthInfo(inst.synthType);
    return {
      id: String(inst.id),
      label: `${inst.id.toString(16).toUpperCase().padStart(2, '0')} ${inst.name}`,
      sublabel: info?.shortName ?? inst.synthType,
      dotColor: twColor(info?.color ?? ''),
    };
  });
}



// ── Component ───────────────────────────────────────────────────────────────

export const PixiEditInstrumentModal: React.FC<PixiEditInstrumentModalProps> = ({
  isOpen,
  onClose,
  createMode = false,
}) => {
  const theme = usePixiTheme();
  const { width: screenW, height: screenH } = usePixiResponsive();

  // ── Fullscreen layout (dynamic) ────────────────────────────────────────
  const MODAL_W = screenW;
  const MODAL_H = screenH;
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const currentLeftW = leftPanelCollapsed ? LEFT_PANEL_COLLAPSED_W : LEFT_PANEL_W;
  const RIGHT_PANEL_W = MODAL_W - currentLeftW;
  const CONTENT_H = MODAL_H - HEADER_H;

  // ── Store ───────────────────────────────────────────────────────────────
  const instruments = useInstrumentStore((s) => s.instruments);
  const currentInstrumentId = useInstrumentStore((s) => s.currentInstrumentId);
  const setCurrentInstrument = useInstrumentStore((s) => s.setCurrentInstrument);
  const createInstrument = useInstrumentStore((s) => s.createInstrument);
  const updateInstrument = useInstrumentStore((s) => s.updateInstrument);

  // ── Local state ─────────────────────────────────────────────────────────
  const [isCreating, setIsCreating] = useState(createMode);
  const [activeTab, setActiveTab] = useState<ActiveTab>('sound');
  const newName = 'New Instrument';
  const [synthSearch, setSynthSearch] = useState('');
  const [createCategoryFilter, setCreateCategoryFilter] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [hardwareUIMode, setHardwareUIMode] = useState(false);

  // Preset state
  const [showSynthBrowser, setShowSynthBrowser] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [presetCategory, setPresetCategory] = useState<PresetCategory>('User');
  const [filterCategory, setFilterCategory] = useState<'All' | PresetCategory>('All');
  const [presetSearch, setPresetSearch] = useState('');
  const [presetExpanded, setPresetExpanded] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [presetTags, setPresetTags] = useState<string[]>([]);
  const [filterTags, setFilterTags] = useState<string[]>([]);

  // Reset create mode when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsCreating(createMode);
      setActiveTab('sound');
      setSynthSearch('');
      setCreateCategoryFilter(null);
      setExpandedCategories({});
      setShowSaveDialog(false);
      setShowSynthBrowser(false);
      setPresetName('');
      setPresetSearch('');
      setFilterCategory('All');
      setPresetExpanded(false);
      setSelectedPresetId(null);
      setPresetTags([]);
      setFilterTags([]);
    }
  }, [isOpen, createMode]);

  // ── Escape key to close ────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // ── Derived ─────────────────────────────────────────────────────────────
  const currentInstrument = useMemo(
    () => instruments.find((i) => i.id === currentInstrumentId) ?? instruments[0] ?? null,
    [instruments, currentInstrumentId],
  );

  // Switch to appropriate tab when instrument type changes
  useEffect(() => {
    if (currentInstrument?.synthType === 'SuperCollider') {
      if (activeTab === 'sound') setActiveTab('script');
    } else {
      if (activeTab === 'script' || activeTab === 'controls') setActiveTab('sound');
    }
  }, [currentInstrument?.synthType]); // eslint-disable-line react-hooks/exhaustive-deps

  const instListItems = useMemo(() => instrumentListItems(instruments), [instruments]);

  /** Categorized synth data for create mode browser */
  const filteredCategorySynths = useMemo(() => {
    const query = synthSearch.toLowerCase().trim();
    return SYNTH_CATEGORIES
      .filter(cat => !createCategoryFilter || cat.id === createCategoryFilter)
      .map(cat => ({
        ...cat,
        synths: cat.synths.filter(synth => {
          if (!synth || !synth.icon) return false;
          if (!query) return true;
          return (
            synth.name.toLowerCase().includes(query) ||
            synth.shortName.toLowerCase().includes(query) ||
            synth.description.toLowerCase().includes(query) ||
            synth.bestFor.some((tag: string) => tag.toLowerCase().includes(query))
          );
        }),
      }))
      .filter(cat => cat.synths.length > 0);
  }, [synthSearch, createCategoryFilter]);

  const totalAllSynths = useMemo(
    () => SYNTH_CATEGORIES.reduce((sum, cat) => sum + cat.synths.filter(s => s?.icon).length, 0),
    [],
  );

  // ── Config ref for knob callbacks (avoid stale closures) ────────────────
  const instRef = useRef(currentInstrument);
  useEffect(() => { instRef.current = currentInstrument; }, [currentInstrument]);

  // ── Presets ─────────────────────────────────────────────────────────────
  const userPresets = usePresetStore((s) => s.userPresets);

  /** Merged factory + user presets, filtered by category and search */
  const { allPresets, filteredPresets, presetOptions } = useMemo(() => {
    if (!currentInstrument) return { allPresets: [], filteredPresets: [], presetOptions: [] };

    const synthType = currentInstrument.synthType;
    const factory = getPresetsForSynthType(synthType).map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category ?? 'factory',
      isUser: false,
      tags: [] as string[],
    }));
    const user = userPresets
      .filter((p) => p.synthType === synthType)
      .map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category.toLowerCase(),
        isUser: true,
        tags: p.tags ?? [],
      }));
    const all = [...factory, ...user];

    // Category filter
    const catFiltered = filterCategory === 'All'
      ? all
      : all.filter((p) => p.category.toLowerCase() === filterCategory.toLowerCase() || (filterCategory === 'User' && p.isUser));

    // Tag filter
    const tagFiltered = filterTags.length > 0
      ? catFiltered.filter((p) => filterTags.every((t) => p.tags.includes(t)))
      : catFiltered;

    // Search filter
    const searched = presetSearch
      ? tagFiltered.filter((p) => p.name.toLowerCase().includes(presetSearch.toLowerCase()))
      : tagFiltered;

    const options: SelectOption[] = searched.map((p) => ({
      value: p.id,
      label: p.isUser ? `\u2605 ${p.name}` : p.name,
    }));

    return { allPresets: all, filteredPresets: searched, presetOptions: options };
  }, [currentInstrument?.synthType, userPresets, filterCategory, filterTags, presetSearch]);

  const handlePresetSelect = useCallback(
    (presetId: string) => {
      const inst = instRef.current;
      if (!inst) return;
      setSelectedPresetId(presetId);

      // Try factory presets first
      const factoryPresets = getPresetsForSynthType(inst.synthType);
      const factoryPreset = factoryPresets.find((p) => p.id === presetId);
      if (factoryPreset) {
        updateInstrument(inst.id, factoryPreset.config as any);
        notify.success(`Loaded preset: ${factoryPreset.name}`);
        return;
      }

      // Try user presets
      const userPreset = usePresetStore.getState().getPreset(presetId);
      if (userPreset) {
        updateInstrument(inst.id, userPreset.config as any);
        usePresetStore.getState().addToRecent(presetId);
        notify.success(`Loaded preset: ${userPreset.name}`);
      }
    },
    [updateInstrument],
  );

  const handleSavePreset = useCallback(() => {
    const inst = instRef.current;
    if (!inst || !presetName.trim()) return;
    usePresetStore.getState().savePreset(inst, presetName.trim(), presetCategory, presetTags);
    notify.success(`Saved preset: ${presetName.trim()}`);
    setShowSaveDialog(false);
    setPresetName('');
    setPresetTags([]);
  }, [presetName, presetCategory, presetTags]);

  const handleDeletePreset = useCallback(() => {
    if (!selectedPresetId) return;
    const preset = usePresetStore.getState().getPreset(selectedPresetId);
    if (!preset) {
      notify.error('Can only delete user presets');
      return;
    }
    usePresetStore.getState().deletePreset(selectedPresetId);
    setSelectedPresetId(null);
    notify.success(`Deleted preset: ${preset.name}`);
  }, [selectedPresetId]);

  const handleExportNKSF = useCallback(() => {
    const inst = instRef.current;
    if (!inst) return;
    // Save as user preset first, then export
    const name = presetName.trim() || inst.name || 'Untitled';
    const presetId = usePresetStore.getState().savePreset(inst, name, presetCategory, presetTags);
    usePresetStore.getState().exportPresetAsNKSF(presetId);
    notify.success(`Exported: ${name}.nksf`);
  }, [presetName, presetCategory, presetTags]);

  const addTag = useCallback((tag: string) => {
    const t = tag.trim().toLowerCase();
    if (t && !presetTags.includes(t) && presetTags.length < 5) {
      setPresetTags((prev) => [...prev, t]);
    }
  }, [presetTags]);

  const removeTag = useCallback((tag: string) => {
    setPresetTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  const toggleFilterTag = useCallback((tag: string) => {
    setFilterTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }, []);

  const isSelectedPresetUser = useMemo(() => {
    if (!selectedPresetId) return false;
    return filteredPresets.some((p) => p.id === selectedPresetId && p.isUser);
  }, [selectedPresetId, filteredPresets]);

  // ── Callbacks ───────────────────────────────────────────────────────────

  const handleSelectInstrument = useCallback((id: string) => {
    setCurrentInstrument(Number(id));
  }, [setCurrentInstrument]);

  /** Create with a specific synth type (for clicking items in the categorized browser) */
  const handleCreateWithType = useCallback((synthType: SynthType) => {
    const info = getSynthInfo(synthType);
    const name = newName === 'New Instrument' && info ? info.name : newName;
    const inst = createInstrument();
    if (inst != null) {
      updateInstrument(inst, { name, synthType });
      setCurrentInstrument(inst);
      notify.success(`Created ${name}`);
    }
    setIsCreating(false);
  }, [createInstrument, updateInstrument, setCurrentInstrument, newName]);

  const handleRename = useCallback((name: string) => {
    if (!currentInstrument) return;
    updateInstrument(currentInstrument.id, { name });
  }, [currentInstrument, updateInstrument]);

  const handlePrev = useCallback(() => {
    const idx = instruments.findIndex((i) => i.id === currentInstrumentId);
    const count = instruments.length;
    if (count === 0) return;
    const prevIdx = (idx - 1 + count) % count;
    setCurrentInstrument(instruments[prevIdx].id);
  }, [instruments, currentInstrumentId, setCurrentInstrument]);

  const handleNext = useCallback(() => {
    const idx = instruments.findIndex((i) => i.id === currentInstrumentId);
    const count = instruments.length;
    if (count === 0) return;
    const nextIdx = (idx + 1) % count;
    setCurrentInstrument(instruments[nextIdx].id);
  }, [instruments, currentInstrumentId, setCurrentInstrument]);

  const updateParam = useCallback(
    (key: string, value: number) => {
      const inst = instRef.current;
      if (!inst) return;
      updateInstrument(inst.id, { [key]: value });
    },
    [updateInstrument],
  );

  const updateOsc = useCallback(
    (key: string, value: number | string) => {
      const inst = instRef.current;
      if (!inst) return;
      updateInstrument(inst.id, { oscillator: { ...inst.oscillator, [key]: value } });
    },
    [updateInstrument],
  );

  const updateFilter = useCallback(
    (key: string, value: number | string) => {
      const inst = instRef.current;
      if (!inst) return;
      updateInstrument(inst.id, { filter: { ...inst.filter, [key]: value } });
    },
    [updateInstrument],
  );

  const updateEnvelope = useCallback(
    (key: string, value: number) => {
      const inst = instRef.current;
      if (!inst) return;
      updateInstrument(inst.id, { envelope: { ...inst.envelope, [key]: value } });
    },
    [updateInstrument],
  );

  const updateModularPatch = useCallback(
    (patch: ModularPatchConfig) => {
      const inst = instRef.current;
      if (!inst) return;
      updateInstrument(inst.id, { modularSynth: patch });
    },
    [updateInstrument],
  );

  const handlePopOut = useCallback(() => {
    const url = `${window.location.origin}${window.location.pathname}#instrument-editor`;
    window.open(url, '_blank', 'width=800,height=600,menubar=no,toolbar=no');
  }, []);

  const handleChangeSynthType = useCallback(
    (synthType: SynthType) => {
      const inst = instRef.current;
      if (!inst) return;
      updateInstrument(inst.id, { synthType });
      setShowSynthBrowser(false);
    },
    [updateInstrument],
  );

  const synthInfo = currentInstrument ? getSynthInfo(currentInstrument.synthType) : null;
  const instIdx = instruments.findIndex((i) => i.id === currentInstrumentId);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <PixiModal isOpen={isOpen} onClose={onClose} width={MODAL_W} height={MODAL_H} borderRadius={0} borderWidth={0}>
      {/* ── Unified header row (matches DOM) ─────────────────────────── */}
      {isCreating ? (
        <PixiModalHeader
          title="Add New Instrument"
          onClose={onClose}
        />
      ) : currentInstrument ? (
        <layoutContainer
          layout={{
            flexDirection: 'row',
            alignItems: 'center',
            height: HEADER_H,
            paddingLeft: 8,
            paddingRight: 8,
            gap: 6,
            backgroundColor: theme.bgSecondary.color,
            borderBottomWidth: 1,
            borderColor: theme.border.color,
          }}
        >
          {/* ── Left group: nav + icon + name + tabs ───────────────────── */}
          <PixiButton icon="prev" label="" variant="ghost" size="sm" onClick={handlePrev} />

          {/* Synth icon with color */}
          {synthInfo && (
            <layoutContainer
              layout={{
                width: 28,
                height: 28,
                borderRadius: 6,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.bg.color,
              }}
            >
              <PixiIcon
                name={synthInfo.icon === 'Music2' ? 'waveform' : 'preset-a'}
                size={16}
                color={twColor(synthInfo.color)}
                layout={{}}
              />
            </layoutContainer>
          )}

          {/* Instrument name input */}
          <PixiPureTextInput
            value={currentInstrument.name}
            onChange={handleRename}
            width={160}
            height={24}
            fontSize={13}
          />

          {/* Counter */}
          <PixiLabel
            text={`(${instIdx + 1}/${instruments.length})`}
            size="xs"
            color="textMuted"
          />

          {/* Synth type name (colored) */}
          {synthInfo && (
            <PixiLabel
              text={synthInfo.shortName}
              size="xs"
              weight="semibold"
              color="custom"
              customColor={twColor(synthInfo.color)}
            />
          )}

          <PixiButton icon="next" label="" variant="ghost" size="sm" onClick={handleNext} />

          {/* Divider */}
          <layoutContainer
            layout={{
              width: 1,
              height: 20,
              backgroundColor: theme.border.color,
              marginLeft: 4,
              marginRight: 4,
            }}
          />

          {/* Sound / Effects tabs — integrated in header */}
          {currentInstrument.synthType === 'SuperCollider' ? (
            <>
              <HeaderTab label="Script" active={activeTab === 'script'} onSelect={() => setActiveTab('script')} />
              <HeaderTab label="Controls" active={activeTab === 'controls'} onSelect={() => setActiveTab('controls')} />
              <HeaderTab label="Effects" active={activeTab === 'effects'} onSelect={() => setActiveTab('effects')} />
            </>
          ) : (
            <>
              <HeaderTab label="Sound" active={activeTab === 'sound'} onSelect={() => setActiveTab('sound')} />
              <HeaderTab label="Effects" active={activeTab === 'effects'} onSelect={() => setActiveTab('effects')} />
            </>
          )}

          {/* ── Spacer ─────────────────────────────────────────────────── */}
          <layoutContainer layout={{ flex: 1 }} />

          {/* ── Right group: hardware toggle + presets + action buttons ── */}
          {currentInstrument && hasPixiHardwareUI(currentInstrument.synthType) && (
            <PixiButton
              label={hardwareUIMode ? 'Simple' : 'Hardware'}
              variant={hardwareUIMode ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setHardwareUIMode(!hardwareUIMode)}
            />
          )}
          {currentInstrument && (
            <PixiPresetDropdown
              synthType={currentInstrument.synthType as SynthType}
              onChange={(updates) => {
                const inst = instRef.current;
                if (inst) updateInstrument(inst.id, updates);
              }}
              width={140}
            />
          )}
          <PixiButton
            label="Browse Synths"
            variant={showSynthBrowser ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setShowSynthBrowser(!showSynthBrowser)}
          />
          <PixiButton
            label="+ Add"
            variant="ghost"
            size="sm"
            onClick={() => setIsCreating(true)}
          />
          <PixiButton
            icon="save"
            label="Save"
            variant="ghost"
            size="sm"
            onClick={() => {
              if (currentInstrument) setPresetName(currentInstrument.name);
              setShowSaveDialog((v) => !v);
            }}
          />
          <PixiButton icon="open" label="" variant="ghost" size="sm" onClick={handlePopOut} />
          <PixiButton icon="close" label="" variant="ghost" size="sm" onClick={onClose} />
        </layoutContainer>
      ) : (
        <PixiModalHeader title="Edit Instrument" onClose={onClose} />
      )}

      {/* ── Synth type browser (reuses the categorized create-mode browser) ── */}
      {showSynthBrowser && !isCreating && currentInstrument && (
        <layoutContainer layout={{ flex: 1, flexDirection: 'column', width: MODAL_W }}>
          <PixiScrollView
            width={MODAL_W}
            height={CONTENT_H}
            contentHeight={
              140 + (filteredCategorySynths.length === 0
                ? 100
                : filteredCategorySynths.reduce((h, cat) => {
                    const rows = Math.ceil(cat.synths.length / 2);
                    return h + 50 + rows * 140 + 16;
                  }, 0))
            }
            bgColor={theme.bgSecondary.color}
          >
            <layoutContainer layout={{ width: MODAL_W - 16, flexDirection: 'column', padding: 16, gap: 16 }}>
              {/* Search bar */}
              <PixiPureTextInput
                value={synthSearch}
                onChange={setSynthSearch}
                placeholder="Search synths by name, description, or use case..."
                width={MODAL_W - 64}
                height={32}
                fontSize={12}
              />

              {/* Category filter chips */}
              <layoutContainer layout={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                <layoutContainer
                  eventMode="static"
                  cursor="pointer"
                  onPointerTap={() => setCreateCategoryFilter(null)}
                  layout={{
                    paddingLeft: 12, paddingRight: 12, height: 26, borderRadius: 13,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: createCategoryFilter === null ? 0xFB923C : (theme.bgTertiary?.color ?? 0x2a2a2a),
                    borderWidth: 1, borderColor: createCategoryFilter === null ? 0xFB923C : theme.border.color,
                  }}
                >
                  <pixiBitmapText
                    text={`All (${totalAllSynths})`}
                    style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: createCategoryFilter === null ? 0x000000 : theme.textSecondary.color }}
                    layout={{}}
                  />
                </layoutContainer>
                {SYNTH_CATEGORIES.map(cat => {
                  const count = cat.synths.filter(s => s?.icon).length;
                  const isActive = createCategoryFilter === cat.id;
                  return (
                    <layoutContainer
                      key={cat.id}
                      eventMode="static"
                      cursor="pointer"
                      onPointerTap={() => setCreateCategoryFilter(isActive ? null : cat.id)}
                      layout={{
                        paddingLeft: 12, paddingRight: 12, height: 26, borderRadius: 13,
                        alignItems: 'center', justifyContent: 'center',
                        backgroundColor: isActive ? 0xFB923C : (theme.bgTertiary?.color ?? 0x2a2a2a),
                        borderWidth: 1, borderColor: isActive ? 0xFB923C : theme.border.color,
                      }}
                    >
                      <pixiBitmapText
                        text={`${cat.name} (${count})`}
                        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: isActive ? 0x000000 : theme.textSecondary.color }}
                        layout={{}}
                      />
                    </layoutContainer>
                  );
                })}
              </layoutContainer>

              {/* Category sections with synth cards */}
              {filteredCategorySynths.length === 0 ? (
                <layoutContainer layout={{ padding: 24, alignItems: 'center', flexDirection: 'column', gap: 4 }}>
                  <pixiBitmapText text="No synths found" style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: theme.textMuted.color }} layout={{}} />
                </layoutContainer>
              ) : (
                filteredCategorySynths.map(category => {
                  const isCatExpanded = expandedCategories[category.id] !== false;
                  return (
                    <layoutContainer key={category.id} layout={{ flexDirection: 'column', marginBottom: 4 }}>
                      <layoutContainer
                        eventMode="static" cursor="pointer"
                        onPointerTap={() => setExpandedCategories(prev => ({ ...prev, [category.id]: !isCatExpanded }))}
                        layout={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, paddingLeft: 2, paddingRight: 4 }}
                      >
                        <layoutContainer layout={{ flexDirection: 'column', gap: 2 }}>
                          <pixiBitmapText text={category.name} style={{ fontFamily: PIXI_FONTS.SANS_SEMIBOLD, fontSize: 14, fill: 0xffffff }} layout={{}} />
                          <pixiBitmapText text={category.description} style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: theme.textMuted.color }} layout={{}} />
                        </layoutContainer>
                        <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <pixiBitmapText text={String(category.synths.length)} style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: theme.textMuted.color }} layout={{}} />
                          <PixiIcon name={isCatExpanded ? 'caret-down' : 'caret-right'} size={14} color={theme.textMuted.color} layout={{}} />
                        </layoutContainer>
                      </layoutContainer>

                      {isCatExpanded && (
                        <layoutContainer layout={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                          {category.synths.map((synth: SynthInfoType) => {
                            const cardW = Math.floor((MODAL_W - 32 - 32 - 12) / 2);
                            const isCurrentType = currentInstrument.synthType === synth.type;
                            return (
                              <layoutContainer
                                key={`${category.id}-${synth.type}-${synth.shortName}`}
                                eventMode="static" cursor="pointer"
                                onPointerTap={() => handleChangeSynthType(synth.type)}
                                layout={{
                                  width: cardW, flexDirection: 'column', padding: 16, borderRadius: 8,
                                  borderWidth: isCurrentType ? 2 : 1,
                                  borderColor: isCurrentType ? (theme.accent?.color ?? 0xFB923C) : theme.border.color,
                                  backgroundColor: theme.bgSecondary?.color ?? 0x1e1e1e, gap: 8,
                                }}
                              >
                                <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                                  <layoutContainer layout={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bgTertiary?.color ?? 0x2a2a2a, borderRadius: 6 }}>
                                    <PixiIcon name="waveform" size={18} color={twColor(synth.color)} layout={{}} />
                                  </layoutContainer>
                                  <layoutContainer layout={{ flexDirection: 'column', gap: 2, flex: 1, overflow: 'hidden' }}>
                                    <pixiBitmapText text={synth.name} style={{ fontFamily: PIXI_FONTS.SANS_SEMIBOLD, fontSize: 13, fill: 0xffffff }} layout={{}} />
                                    <pixiBitmapText text={synth.shortName} style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 11, fill: theme.textMuted.color }} layout={{}} />
                                  </layoutContainer>
                                </layoutContainer>
                                <pixiBitmapText
                                  text={synth.description.length > 70 ? synth.description.slice(0, 67) + '...' : synth.description}
                                  style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 11, fill: theme.textSecondary.color }}
                                  layout={{}}
                                />
                                {synth.bestFor.length > 0 && (
                                  <layoutContainer layout={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                                    {synth.bestFor.slice(0, 3).map(tag => (
                                      <layoutContainer key={tag} layout={{ paddingLeft: 8, paddingRight: 8, paddingTop: 2, paddingBottom: 2, borderRadius: 10, backgroundColor: theme.bgTertiary?.color ?? 0x2a2a2a }}>
                                        <pixiBitmapText text={tag} style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 10, fill: theme.textMuted.color }} layout={{}} />
                                      </layoutContainer>
                                    ))}
                                  </layoutContainer>
                                )}
                              </layoutContainer>
                            );
                          })}
                        </layoutContainer>
                      )}
                    </layoutContainer>
                  );
                })
              )}
            </layoutContainer>
          </PixiScrollView>
        </layoutContainer>
      )}

      {/* ── Body: left + right panels (hidden when synth browser is open) ─── */}
      {!(showSynthBrowser && !isCreating && currentInstrument) && (
      <layoutContainer layout={{ flex: 1, flexDirection: 'row', width: MODAL_W }}>
        {/* ── LEFT PANEL ──────────────────────────────────────────────────── */}
        <layoutContainer
          layout={{
            width: isCreating ? MODAL_W : currentLeftW,
            flexDirection: 'column',
            backgroundColor: theme.bgSecondary.color,
            borderRightWidth: isCreating ? 0 : 1,
            borderColor: theme.border.color,
          }}
        >
          {isCreating ? (
            /* ── Categorized synth browser (create mode) — full width ──────── */
            <PixiScrollView
              width={MODAL_W}
              height={CONTENT_H}
              contentHeight={
                /* sticky header (~90) + categories content */
                140 + (filteredCategorySynths.length === 0
                  ? 100
                  : filteredCategorySynths.reduce((h, cat) => {
                      const rows = Math.ceil(cat.synths.length / 2);
                      return h + 50 + rows * 140 + 16; // header + cards + gap
                    }, 0))
              }
              bgColor={theme.bgSecondary.color}
            >
              <layoutContainer layout={{ width: MODAL_W - 16, flexDirection: 'column', padding: 16, gap: 16 }}>
                {/* ── Sticky-style header: search + chips + results count ── */}
                <layoutContainer layout={{ flexDirection: 'column', gap: 12 }}>
                  {/* Search bar — uses PixiPureTextInput directly (it has its own border/bg) */}
                  <PixiPureTextInput
                    value={synthSearch}
                    onChange={setSynthSearch}
                    placeholder="Search synths by name, description, or use case..."
                    width={MODAL_W - 64}
                    height={32}
                    fontSize={12}
                  />

                  {/* Category filter chips */}
                  <layoutContainer layout={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    <layoutContainer
                      eventMode="static"
                      cursor="pointer"
                      onPointerTap={() => setCreateCategoryFilter(null)}
                      layout={{
                        paddingLeft: 12,
                        paddingRight: 12,
                        height: 26,
                        borderRadius: 13,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: createCategoryFilter === null ? 0xFB923C : (theme.bgTertiary?.color ?? 0x2a2a2a),
                        borderWidth: 1,
                        borderColor: createCategoryFilter === null ? 0xFB923C : (theme.border.color),
                      }}
                    >
                      <pixiBitmapText
                        text={`All (${totalAllSynths})`}
                        style={{
                          fontFamily: PIXI_FONTS.MONO,
                          fontSize: 11,
                          fill: createCategoryFilter === null ? 0x000000 : theme.textSecondary.color,
                        }}
                        layout={{}}
                      />
                    </layoutContainer>
                    {SYNTH_CATEGORIES.map(cat => {
                      const count = cat.synths.filter(s => s?.icon).length;
                      const isActive = createCategoryFilter === cat.id;
                      return (
                        <layoutContainer
                          key={cat.id}
                          eventMode="static"
                          cursor="pointer"
                          onPointerTap={() => setCreateCategoryFilter(isActive ? null : cat.id)}
                          layout={{
                            paddingLeft: 12,
                            paddingRight: 12,
                            height: 26,
                            borderRadius: 13,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: isActive ? 0xFB923C : (theme.bgTertiary?.color ?? 0x2a2a2a),
                            borderWidth: 1,
                            borderColor: isActive ? 0xFB923C : (theme.border.color),
                          }}
                        >
                          <pixiBitmapText
                            text={`${cat.name} (${count})`}
                            style={{
                              fontFamily: PIXI_FONTS.MONO,
                              fontSize: 11,
                              fill: isActive ? 0x000000 : theme.textSecondary.color,
                            }}
                            layout={{}}
                          />
                        </layoutContainer>
                      );
                    })}
                  </layoutContainer>

                  {/* Results count when filtering */}
                  {(synthSearch || createCategoryFilter) && (
                    <pixiBitmapText
                      text={`Showing ${filteredCategorySynths.reduce((n, c) => n + c.synths.length, 0)} synth${filteredCategorySynths.reduce((n, c) => n + c.synths.length, 0) !== 1 ? 's' : ''}${synthSearch ? ` matching "${synthSearch}"` : ''}${createCategoryFilter ? ` in ${SYNTH_CATEGORIES.find(c => c.id === createCategoryFilter)?.name ?? ''}` : ''}`}
                      style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: theme.textMuted.color }}
                    layout={{}}
                    />
                  )}
                </layoutContainer>

                {/* ── Category sections ─────────────────────────────────── */}
                {filteredCategorySynths.length === 0 ? (
                  <layoutContainer layout={{ padding: 24, alignItems: 'center', flexDirection: 'column', gap: 4 }}>
                    <pixiBitmapText
                      text="No synths found"
                      style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: theme.textMuted.color }}
                    layout={{}}
                    />
                    <pixiBitmapText
                      text="Try a different search term or category"
                      style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: theme.textMuted.color }}
                    layout={{}}
                    />
                    <layoutContainer
                      eventMode="static"
                      cursor="pointer"
                      onPointerTap={() => { setSynthSearch(''); setCreateCategoryFilter(null); }}
                      layout={{
                        marginTop: 8,
                        paddingLeft: 12,
                        paddingRight: 12,
                        height: 24,
                        borderRadius: 6,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: theme.bgTertiary?.color ?? 0x2a2a2a,
                        borderWidth: 1,
                        borderColor: theme.border.color,
                      }}
                    >
                      <pixiBitmapText
                        text="Clear filters"
                        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: theme.textSecondary.color }}
                      layout={{}}
                      />
                    </layoutContainer>
                  </layoutContainer>
                ) : (
                  filteredCategorySynths.map(category => {
                    const isCatExpanded = expandedCategories[category.id] !== false;
                    return (
                      <layoutContainer key={category.id} layout={{ flexDirection: 'column', marginBottom: 4 }}>
                        {/* Category header — clickable to expand/collapse */}
                        <layoutContainer
                          eventMode="static"
                          cursor="pointer"
                          onPointerTap={() =>
                            setExpandedCategories(prev => ({ ...prev, [category.id]: !isCatExpanded }))
                          }
                          layout={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: 6,
                            paddingLeft: 2,
                            paddingRight: 4,
                          }}
                        >
                          <layoutContainer layout={{ flexDirection: 'column', gap: 2 }}>
                            <pixiBitmapText
                              text={category.name}
                              style={{ fontFamily: PIXI_FONTS.SANS_SEMIBOLD, fontSize: 14, fill: 0xffffff }}
                            layout={{}}
                            />
                            <pixiBitmapText
                              text={category.description}
                              style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: theme.textMuted.color }}
                            layout={{}}
                            />
                          </layoutContainer>
                          <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <pixiBitmapText
                              text={String(category.synths.length)}
                              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: theme.textMuted.color }}
                            layout={{}}
                            />
                            <PixiIcon
                              name={isCatExpanded ? 'caret-down' : 'caret-right'}
                              size={14}
                              color={theme.textMuted.color}
                              layout={{}}
                            />
                          </layoutContainer>
                        </layoutContainer>

                        {/* 2-column synth card grid */}
                        {isCatExpanded && (
                          <layoutContainer layout={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                            {category.synths.map((synth: SynthInfoType) => {
                              const cardW = Math.floor((MODAL_W - 32 - 32 - 12) / 2); // padding + gap
                              return (
                                <layoutContainer
                                  key={`${category.id}-${synth.type}-${synth.shortName}`}
                                  eventMode="static"
                                  cursor="pointer"
                                  onPointerTap={() => handleCreateWithType(synth.type)}
                                  layout={{
                                    width: cardW,
                                    flexDirection: 'column',
                                    padding: 16,
                                    borderRadius: 8,
                                    borderWidth: 1,
                                    borderColor: theme.border.color,
                                    backgroundColor: theme.bgSecondary?.color ?? 0x1e1e1e,
                                    gap: 8,
                                  }}
                                >
                                  {/* Icon + Name row */}
                                  <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                                    <layoutContainer
                                      layout={{
                                        width: 34,
                                        height: 34,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        backgroundColor: theme.bgTertiary?.color ?? 0x2a2a2a,
                                        borderRadius: 6,
                                      }}
                                    >
                                      <PixiIcon name="waveform" size={18} color={twColor(synth.color)} layout={{}} />
                                    </layoutContainer>
                                    <layoutContainer layout={{ flexDirection: 'column', gap: 2, flex: 1, overflow: 'hidden' }}>
                                      <pixiBitmapText
                                        text={synth.name}
                                        style={{ fontFamily: PIXI_FONTS.SANS_SEMIBOLD, fontSize: 13, fill: 0xffffff }}
                                      layout={{}}
                                      />
                                      <pixiBitmapText
                                        text={synth.shortName}
                                        style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 11, fill: theme.textMuted.color }}
                                      layout={{}}
                                      />
                                    </layoutContainer>
                                  </layoutContainer>

                                  {/* Description */}
                                  <pixiBitmapText
                                    text={synth.description.length > 70 ? synth.description.slice(0, 67) + '...' : synth.description}
                                    style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 11, fill: theme.textSecondary.color }}
                                  layout={{}}
                                  />

                                  {/* Tags */}
                                  {synth.bestFor.length > 0 && (
                                    <layoutContainer layout={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                                      {synth.bestFor.slice(0, 3).map(tag => (
                                        <layoutContainer
                                          key={tag}
                                          layout={{
                                            paddingLeft: 8,
                                            paddingRight: 8,
                                            paddingTop: 2,
                                            paddingBottom: 2,
                                            borderRadius: 10,
                                            backgroundColor: theme.bgTertiary?.color ?? 0x2a2a2a,
                                          }}
                                        >
                                          <pixiBitmapText
                                            text={tag}
                                            style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 10, fill: theme.textMuted.color }}
                                          layout={{}}
                                          />
                                        </layoutContainer>
                                      ))}
                                    </layoutContainer>
                                  )}
                                </layoutContainer>
                              );
                            })}
                          </layoutContainer>
                        )}
                      </layoutContainer>
                    );
                  })
                )}
              </layoutContainer>
            </PixiScrollView>
          ) : leftPanelCollapsed ? (
            /* ── Collapsed left panel — narrow strip with expand button ───── */
            <layoutContainer
              layout={{
                width: LEFT_PANEL_COLLAPSED_W,
                flexDirection: 'column',
                alignItems: 'center',
                paddingTop: 6,
              }}
            >
              <layoutContainer
                eventMode="static"
                cursor="pointer"
                onPointerTap={() => setLeftPanelCollapsed(false)}
                layout={{
                  width: 24,
                  height: 24,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 4,
                  backgroundColor: theme.bgTertiary?.color ?? 0x2a2a2a,
                }}
              >
                <PixiIcon name="next" size={12} color={theme.textSecondary.color} layout={{}} />
              </layoutContainer>
            </layoutContainer>
          ) : (
            /* ── Instrument list (edit mode) ──────────────────────────────── */
            <>
              <layoutContainer
                layout={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 6,
                  borderBottomWidth: 1,
                  borderColor: theme.border.color,
                }}
              >
                <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <layoutContainer
                    eventMode="static"
                    cursor="pointer"
                    onPointerTap={() => setLeftPanelCollapsed(true)}
                    layout={{
                      width: 20,
                      height: 20,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 3,
                    }}
                  >
                    <PixiIcon name="prev" size={10} color={theme.textMuted.color} layout={{}} />
                  </layoutContainer>
                  <PixiLabel text="INSTRUMENTS" size="xs" weight="bold" color="textMuted" />
                </layoutContainer>
                <PixiButton
                  label="+ New"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsCreating(true)}
                />
              </layoutContainer>
              <PixiList
                items={instListItems}
                width={LEFT_PANEL_W}
                height={CONTENT_H - 38}
                itemHeight={32}
                selectedId={currentInstrumentId != null ? String(currentInstrumentId) : null}
                onSelect={handleSelectInstrument}
              />
            </>
          )}
        </layoutContainer>

        {/* ── RIGHT PANEL ─────────────────────────────────────────────────── */}
        <layoutContainer layout={{ flex: 1, flexDirection: 'column' }}>
          {/* ── Preset selector row ─────────────────────────────────────── */}
          {!isCreating && currentInstrument && (
            <layoutContainer
              layout={{
                flexDirection: 'column',
                borderBottomWidth: 1,
                borderColor: theme.border.color,
              }}
            >
              {/* Preset header with expand toggle + save/delete buttons */}
              <layoutContainer
                layout={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingLeft: 8,
                  paddingRight: 8,
                  height: 30,
                }}
              >
                <PixiButton
                  icon={presetExpanded ? 'caret-down' : 'caret-right'}
                  label=""
                  variant="ghost"
                  size="sm"
                  onClick={() => setPresetExpanded((v) => !v)}
                />
                <PixiLabel text="PRESETS" size="xs" weight="bold" color="textMuted" />
                <PixiLabel
                  text={`${filteredPresets.length} of ${allPresets.length}`}
                  size="xs"
                  color="textMuted"
                />
                <layoutContainer layout={{ flex: 1 }} />
                <PixiButton
                  icon="save"
                  label="Save"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPresetName(currentInstrument.name);
                    setShowSaveDialog((v) => !v);
                  }}
                />
                {isSelectedPresetUser && (
                  <PixiButton
                    icon="close"
                    label="Del"
                    variant="ghost"
                    size="sm"
                    onClick={handleDeletePreset}
                  />
                )}
              </layoutContainer>

              {/* Expanded preset browser area */}
              {presetExpanded && (
                <layoutContainer
                  layout={{
                    flexDirection: 'column',
                    gap: 4,
                    paddingLeft: 8,
                    paddingRight: 8,
                    paddingBottom: 6,
                  }}
                >
                  {/* Category filter row */}
                  <layoutContainer layout={{ flexDirection: 'row', gap: 3, flexWrap: 'wrap' }}>
                    {PRESET_CATEGORIES.map((cat) => (
                      <PixiButton
                        key={cat}
                        label={cat}
                        variant={filterCategory === cat ? 'primary' : 'ghost'}
                        size="sm"
                        onClick={() => setFilterCategory(cat)}
                      />
                    ))}
                  </layoutContainer>

                  {/* Search input */}
                  <PixiPureTextInput
                    value={presetSearch}
                    onChange={setPresetSearch}
                    placeholder="Search presets..."
                    width={RIGHT_PANEL_W - 24}
                    height={22}
                  />

                  {/* Tag filter row */}
                  {filterTags.length > 0 && (
                    <layoutContainer layout={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
                      {filterTags.map((tag) => (
                        <PixiButton
                          key={tag}
                          label={tag}
                          variant="primary"
                          size="sm"
                          onClick={() => toggleFilterTag(tag)}
                        />
                      ))}
                      <PixiButton label="Clear" variant="ghost" size="sm" onClick={() => setFilterTags([])} />
                    </layoutContainer>
                  )}
                  <layoutContainer layout={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
                    {SUGGESTED_TAGS.filter((t) => !filterTags.includes(t)).slice(0, 8).map((tag) => (
                      <PixiButton
                        key={tag}
                        label={tag}
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleFilterTag(tag)}
                      />
                    ))}
                  </layoutContainer>
                </layoutContainer>
              )}

              {/* Preset dropdown (always visible) */}
              {presetOptions.length > 0 && (
                <layoutContainer
                  layout={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    paddingLeft: 8,
                    paddingRight: 8,
                    paddingBottom: 6,
                  }}
                >
                  <PixiSelect
                    options={presetOptions}
                    value={selectedPresetId ?? ''}
                    onChange={handlePresetSelect}
                    width={RIGHT_PANEL_W - 24}
                    placeholder="Load preset..."
                  />
                </layoutContainer>
              )}

              {/* Save dialog (inline) */}
              {showSaveDialog && (
                <layoutContainer
                  layout={{
                    flexDirection: 'column',
                    gap: 4,
                    paddingLeft: 8,
                    paddingRight: 8,
                    paddingBottom: 8,
                    backgroundColor: theme.bgTertiary.color,
                    borderTopWidth: 1,
                    borderColor: theme.border.color,
                  }}
                >
                  <PixiLabel text="SAVE PRESET" size="xs" weight="bold" color="textMuted" layout={{ paddingTop: 4 }} />
                  <PixiLabel
                    text={`Synth: ${currentInstrument.synthType} \u00b7 Effects: ${currentInstrument.effects?.length ?? 0}`}
                    size="xs"
                    font="mono"
                    color="textMuted"
                  />
                  <PixiPureTextInput
                    value={presetName}
                    onChange={setPresetName}
                    onSubmit={handleSavePreset}
                    placeholder="Preset name"
                    width={RIGHT_PANEL_W - 24}
                    height={22}
                  />
                  <layoutContainer layout={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                    <PixiLabel text="Category:" size="xs" color="textMuted" />
                    <PixiSelect
                      options={[
                        { value: 'User', label: 'User' },
                        { value: 'Bass', label: 'Bass' },
                        { value: 'Lead', label: 'Lead' },
                        { value: 'Pad', label: 'Pad' },
                        { value: 'Drum', label: 'Drum' },
                        { value: 'FX', label: 'FX' },
                      ]}
                      value={presetCategory}
                      onChange={(v) => setPresetCategory(v as PresetCategory)}
                      width={100}
                    />
                  </layoutContainer>

                  {/* Current tags */}
                  <layoutContainer layout={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, width: RIGHT_PANEL_W - 24 }}>
                    {presetTags.map((tag) => (
                      <layoutContainer
                        key={tag}
                        layout={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 2,
                          padding: 4,
                          paddingLeft: 8,
                          paddingRight: 4,
                          borderRadius: 12,
                          backgroundColor: theme.accent?.color ?? 0x4488ff,
                        }}
                      >
                        <PixiLabel text={tag} size="xs" color="text" />
                        <PixiButton label="x" variant="ghost" width={18} height={18} onClick={() => removeTag(tag)} />
                      </layoutContainer>
                    ))}
                    {presetTags.length < 5 && (
                      <PixiLabel text={`${presetTags.length}/5 tags`} size="xs" color="textMuted" />
                    )}
                  </layoutContainer>

                  {/* Suggested tags */}
                  <layoutContainer layout={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, width: RIGHT_PANEL_W - 24 }}>
                    {SUGGESTED_TAGS.filter((t) => !presetTags.includes(t)).slice(0, 10).map((tag) => (
                      <PixiButton key={tag} label={tag} variant="ghost" width={70} height={22} onClick={() => addTag(tag)} />
                    ))}
                  </layoutContainer>

                  <layoutContainer layout={{ flexDirection: 'row', gap: 4 }}>
                    <PixiButton
                      icon="save"
                      label="Save"
                      variant="primary"
                      size="sm"
                      disabled={!presetName.trim()}
                      onClick={handleSavePreset}
                    />
                    <PixiButton
                      label="Export .nksf"
                      variant="ghost"
                      size="sm"
                      disabled={!presetName.trim()}
                      onClick={handleExportNKSF}
                    />
                    <PixiButton
                      label="Cancel"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowSaveDialog(false)}
                    />
                  </layoutContainer>
                </layoutContainer>
              )}
            </layoutContainer>
          )}

          {/* ── Content area ──────────────────────────────────────────────── */}
          <layoutContainer layout={{ flex: 1, padding: PAD, gap: 8, flexDirection: 'column', overflow: 'scroll' }}>
            {/* SC Script tab — read-only source display */}
            {activeTab === 'script' && currentInstrument?.synthType === 'SuperCollider' && (
              <SCScriptPanel source={currentInstrument.superCollider?.source ?? ''} />
            )}
            {/* SC Controls tab — param sliders */}
            {activeTab === 'controls' && currentInstrument?.synthType === 'SuperCollider' && (
              <SCControlsPanel instrument={currentInstrument} onUpdate={updateInstrument} panelWidth={RIGHT_PANEL_W} />
            )}
            {activeTab === 'sound' && currentInstrument && currentInstrument.synthType === 'ModularSynth' && (
              <PixiModularSynthEditor
                config={currentInstrument.modularSynth || MODULAR_INIT_PATCH}
                onChange={updateModularPatch}
                width={RIGHT_PANEL_W - PAD * 2}
                height={CONTENT_H - PAD * 2}
              />
            )}
            {activeTab === 'sound' && currentInstrument && currentInstrument.synthType === 'SunVoxModular' && (
              <PixiModularSynthEditor
                config={currentInstrument.sunvoxModular || MODULAR_INIT_PATCH}
                onChange={(patch) => { const inst = instRef.current; if (inst) updateInstrument(inst.id, { sunvoxModular: { ...patch, backend: 'sunvox' } }); }}
                width={RIGHT_PANEL_W - PAD * 2}
                height={CONTENT_H - PAD * 2}
              />
            )}
            {/* Hardware UI mode — renders WASM framebuffer as Pixi Sprite */}
            {activeTab === 'sound' && currentInstrument && hardwareUIMode && hasPixiHardwareUI(currentInstrument.synthType) && (
              <PixiHardwareUI
                synthType={currentInstrument.synthType}
                instrumentId={currentInstrument.id}
                width={RIGHT_PANEL_W - PAD * 2}
                height={CONTENT_H - PAD * 2}
              />
            )}
            {/* Simple/knob mode (default) */}
            {activeTab === 'sound' && currentInstrument && !(hardwareUIMode && hasPixiHardwareUI(currentInstrument.synthType)) && currentInstrument.synthType !== 'ModularSynth' && currentInstrument.synthType !== 'SunVoxModular' && (
              currentInstrument.synthType === 'DX7' ? (
                <PixiDX7PatchBrowser instrument={currentInstrument} onChange={(updates) => {
                  const inst = instRef.current;
                  if (!inst) return;
                  updateInstrument(inst.id, updates);
                }} />
              ) : isNativeWASMSynth(currentInstrument.synthType) && (SONG_ENGINE_SYNTH_TYPES.has(currentInstrument.synthType ?? '') || (!currentInstrument.sample?.url && !(currentInstrument.parameters as Record<string, unknown>)?.sampleUrl)) ? (
                <NativeInstrumentPanel instrument={currentInstrument} onUpdate={updateInstrument} />
              ) : (() => {
                // Use declarative layout descriptor if one exists (matches DOM's DOMSynthPanel fallback)
                const declLayout = getSynthLayout(currentInstrument.synthType);
                if (declLayout) {
                  const configKey = declLayout.configKey;
                  const config = configKey
                    ? { [configKey]: (currentInstrument as unknown as Record<string, unknown>)[configKey] ?? currentInstrument.parameters ?? {} }
                    : currentInstrument as unknown as Record<string, unknown>;
                  return (
                    <PixiSynthPanel
                      layout={declLayout}
                      config={config}
                      onChange={(updates) => {
                        const inst = instRef.current;
                        if (!inst) return;
                        updateInstrument(inst.id, updates as Partial<InstrumentConfig>);
                      }}
                      synthType={currentInstrument.synthType}
                    />
                  );
                }
                // Dynamic parameter panel for synths with runtime-discoverable params
                // (Buzzmachines, MAME chips, VSTBridge, WAM, etc.)
                if (isDynamicParamSynth(currentInstrument.synthType)) {
                  return <PixiDynamicParamPanel
                    instrument={currentInstrument}
                    onChange={(updates) => {
                      const inst = instRef.current;
                      if (inst) updateInstrument(inst.id, updates);
                    }}
                    title={currentInstrument.synthType}
                  />;
                }
                // Final fallback: generic oscillator/filter/envelope knobs
                return <SoundPanel instrument={currentInstrument} updateParam={updateParam} updateOsc={updateOsc} updateFilter={updateFilter} updateEnvelope={updateEnvelope} />;
              })()
            )}
            {/* Filter curve + ADSR visualizer — shown for synths with filter/envelope */}
            {activeTab === 'sound' && currentInstrument && !isNativeWASMSynth(currentInstrument.synthType) && !(hardwareUIMode && hasPixiHardwareUI(currentInstrument.synthType)) && (
              <pixiContainer layout={{ display: 'flex', flexDirection: 'row', gap: 4, width: RIGHT_PANEL_W - PAD * 2 }}>
                {currentInstrument.filter && (
                  <PixiFilterCurve
                    cutoff={currentInstrument.filter.frequency ?? 2000}
                    resonance={currentInstrument.filter.Q ?? 1}
                    type={(currentInstrument.filter.type as 'lowpass' | 'highpass' | 'bandpass' | 'notch') ?? 'lowpass'}
                    width={(RIGHT_PANEL_W - PAD * 2 - 4) / 2}
                    height={70}
                  />
                )}
                {currentInstrument.envelope && (
                  <PixiADSRVisualizer
                    attack={currentInstrument.envelope.attack ?? 0.01}
                    decay={currentInstrument.envelope.decay ?? 0.1}
                    sustain={currentInstrument.envelope.sustain ?? 0.8}
                    release={currentInstrument.envelope.release ?? 0.3}
                    width={(RIGHT_PANEL_W - PAD * 2 - 4) / 2}
                    height={70}
                  />
                )}
              </pixiContainer>
            )}
            {/* Test Keyboard — shown at bottom of sound tab for all non-modular synths */}
            {activeTab === 'sound' && currentInstrument && !isNativeWASMSynth(currentInstrument.synthType) && currentInstrument.synthType !== 'ModularSynth' && currentInstrument.synthType !== 'SunVoxModular' && (
              <PixiTestKeyboard instrument={currentInstrument} width={RIGHT_PANEL_W - PAD * 2} />
            )}
            {activeTab === 'effects' && currentInstrument && (
              <EffectsPanel instrumentId={currentInstrument.id} effects={currentInstrument.effects} />
            )}
            {!currentInstrument && !isCreating && (
              <layoutContainer layout={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <PixiLabel text="No instrument selected" size="sm" color="textMuted" />
              </layoutContainer>
            )}
          </layoutContainer>
        </layoutContainer>
      </layoutContainer>
      )}

      {/* Footer removed — close button is in the unified header */}
    </PixiModal>
  );
};

// ── Sub-components ──────────────────────────────────────────────────────────


/** Compact header-integrated tab (pill style, matching DOM's inline tabs) */
const HeaderTab: React.FC<{
  label: string;
  active: boolean;
  onSelect: () => void;
}> = ({ label, active, onSelect }) => {
  const theme = usePixiTheme();
  return (
    <layoutContainer
      layout={{
        paddingLeft: 12,
        paddingRight: 12,
        height: 26,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active ? theme.bg.color : 0x00000000,
        borderWidth: 1,
        borderColor: active ? theme.accent.color : 0x00000000,
      }}
      eventMode="static"
      cursor="pointer"
      onPointerUp={onSelect}
      onClick={onSelect}
    >
      <PixiLabel
        text={label}
        size="sm"
        weight="semibold"
        color={active ? 'accent' : 'textMuted'}
      />
    </layoutContainer>
  );
};

// ── SuperCollider panels ─────────────────────────────────────────────────────

/** SC Script tab — read-only source display in a scrollable container */
const SCScriptPanel: React.FC<{ source: string }> = ({ source }) => {
  const theme = usePixiTheme();
  const lines = source ? source.split('\n') : [];
  const displayLines = lines.slice(0, 80); // cap at 80 lines for GL perf
  return (
    <layoutContainer layout={{ flex: 1, flexDirection: 'column', gap: 4, overflow: 'scroll' }}>
      <PixiLabel text="SuperCollider Source" size="sm" weight="bold" color="textSecondary" />
      <layoutContainer
        layout={{
          flexDirection: 'column',
          gap: 1,
          padding: 8,
          backgroundColor: theme.bgTertiary?.color ?? 0x1a1a1a,
          borderRadius: 4,
          borderWidth: 1,
          borderColor: theme.border.color,
        }}
      >
        {displayLines.map((line, i) => (
          <PixiLabel key={i} text={`${String(i + 1).padStart(3, ' ')}  ${line}`} size="xs" color="textMuted" />
        ))}
        {lines.length > 80 && (
          <PixiLabel text={`... ${lines.length - 80} more lines (edit in DOM editor)`} size="xs" color="textMuted" />
        )}
        {lines.length === 0 && (
          <PixiLabel text="No source code. Open the full editor to write SC code." size="xs" color="textMuted" />
        )}
      </layoutContainer>
    </layoutContainer>
  );
};

/** SC Controls tab — param sliders extracted from compiled SynthDef */
const SCControlsPanel: React.FC<{
  instrument: InstrumentConfig;
  onUpdate: (id: number, changes: Partial<InstrumentConfig>) => void;
  panelWidth?: number;
}> = ({ instrument, onUpdate, panelWidth = 580 }) => {
  const scConfig = instrument.superCollider;
  const params = scConfig?.params ?? [];
  const synthDefName = scConfig?.synthDefName ?? 'unknown';

  const handleParamChange = useCallback((paramName: string, value: number) => {
    if (!scConfig) return;
    const updatedParams = scConfig.params.map(p =>
      p.name === paramName ? { ...p, value } : p
    );
    onUpdate(instrument.id, {
      superCollider: { ...scConfig, params: updatedParams },
    });
  }, [instrument.id, scConfig, onUpdate]);

  if (!scConfig?.binary) {
    return (
      <layoutContainer layout={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <PixiLabel text="Compile SynthDef first (use DOM editor)" size="sm" color="textMuted" />
      </layoutContainer>
    );
  }

  return (
    <layoutContainer layout={{ flex: 1, flexDirection: 'column', gap: 8, overflow: 'scroll' }}>
      <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <PixiLabel text={`\\${synthDefName}`} size="sm" weight="bold" color="text" />
        <PixiLabel text={`${params.length} params`} size="xs" color="textMuted" />
      </layoutContainer>

      {params.length === 0 ? (
        <PixiLabel text="No controllable parameters extracted" size="xs" color="textMuted" />
      ) : (
        <layoutContainer layout={{ flexDirection: 'column', gap: 12 }}>
          {params.map((param) => (
            <layoutContainer key={param.name} layout={{ flexDirection: 'column', gap: 2 }}>
              <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <PixiLabel text={param.name} size="xs" color="textSecondary" />
                <PixiLabel text={String(Number(param.value.toPrecision(3)))} size="xs" color="textMuted" />
              </layoutContainer>
              <PixiSlider
                value={param.value}
                min={param.min}
                max={param.max}
                step={(param.max - param.min) / 200}
                onChange={(v) => handleParamChange(param.name, v)}
                orientation="horizontal"
                length={panelWidth - PAD * 2 - 16}
                thickness={6}
                showValue={false}
              />
            </layoutContainer>
          ))}
        </layoutContainer>
      )}
    </layoutContainer>
  );
};

// ── Native WASM synth types (no oscillator/envelope/filter editor) ───────────

const NATIVE_WASM_SYNTH_TYPES = new Set([
  'HivelySynth', 'UADESynth', 'SymphonieSynth', 'MusicLineSynth',
  'JamCrackerSynth', 'FuturePlayerSynth', 'SonicArrangerSynth',
  'InStereo2Synth', 'InStereo1Synth',
  'SoundMonSynth', 'SidMonSynth', 'DigMugSynth', 'FCSynth', 'FredSynth',
  'TFMXSynth', 'OctaMEDSynth', 'SidMon1Synth', 'HippelCoSoSynth',
  'RobHubbardSynth', 'SteveTurnerSynth', 'DavidWhittakerSynth', 'SunVoxSynth',
  'DeltaMusic1Synth', 'DeltaMusic2Synth', 'StartrekkerAMSynth',
  // Autonomous replayer engines (no synth param UI)
  'KlysSynth', 'Sc68Synth', 'GTUltraSynth', 'FredEditorReplayerSynth', 'ChiptuneModule',
]);

// Whole-song engine types — always show NativeInstrumentPanel even if sample data present
const SONG_ENGINE_SYNTH_TYPES = new Set([
  'SymphonieSynth', 'UADESynth', 'MusicLineSynth', 'SonicArrangerSynth',
  'InStereo2Synth', 'InStereo1Synth',
  'SoundMonSynth', 'SidMonSynth', 'DigMugSynth', 'FCSynth', 'FredSynth',
  'TFMXSynth', 'OctaMEDSynth', 'SidMon1Synth', 'HippelCoSoSynth',
  'RobHubbardSynth', 'SteveTurnerSynth', 'DavidWhittakerSynth', 'JamCrackerSynth',
  'FuturePlayerSynth', 'DeltaMusic1Synth', 'DeltaMusic2Synth', 'StartrekkerAMSynth',
  'HivelySynth', 'SunVoxSynth',
  'KlysSynth', 'Sc68Synth', 'GTUltraSynth', 'FredEditorReplayerSynth', 'ChiptuneModule',
]);

function isNativeWASMSynth(synthType?: string): boolean {
  return NATIVE_WASM_SYNTH_TYPES.has(synthType ?? '');
}

// Synth types that use runtime-discovered parameters (no static layout possible)
function isDynamicParamSynth(synthType?: string): boolean {
  if (!synthType) return false;
  // Buzzmachines (except Buzz3o3 which uses TB303 layout)
  if (synthType === 'Buzzmachine' || (synthType.startsWith('Buzz') && synthType !== 'Buzz3o3')) return true;
  // MAME chip synths
  if (synthType.startsWith('MAME') || synthType === 'CZ101' || synthType === 'CEM3394' ||
      synthType === 'SCSP' || synthType === 'D50' || synthType === 'VFX') return true;
  // WAM plugins
  if (synthType === 'WAM' || synthType.startsWith('WAM')) return true;
  // VSTBridge synths without static layouts (Helm, Sorcer, OBXf, Open303, Melodica, TonewheelOrgan)
  if (synthType === 'Helm' || synthType === 'Sorcer' || synthType === 'OBXf' ||
      synthType === 'Open303' || synthType === 'Melodica' || synthType === 'TonewheelOrgan') return true;
  // SuperCollider without script tab
  if (synthType === 'SuperCollider') return true;
  return false;
}

const NativeInstrumentPanel: React.FC<{
  instrument: InstrumentConfig;
  onUpdate: (id: number, changes: Partial<InstrumentConfig>) => void;
}> = ({ instrument, onUpdate }) => {
  // Route to format-specific panels
  if (instrument.synthType === 'JamCrackerSynth' && instrument.jamCracker) {
    return <JamCrackerPanel instrument={instrument} onUpdate={onUpdate} />;
  }
  if (instrument.synthType === 'FuturePlayerSynth') {
    return <FuturePlayerPanel instrument={instrument} />;
  }
  // Generic Amiga synth panel for all formats with layout descriptors
  const amigaLayout = instrument.synthType ? AMIGA_SYNTH_LAYOUTS[instrument.synthType] : undefined;
  if (amigaLayout) {
    return <PixiAmigaSynthPanel layout={amigaLayout} instrument={instrument} onUpdate={onUpdate} />;
  }
  return <GenericNativePanel instrument={instrument} />;
};

// ── JamCracker Panel ────────────────────────────────────────────────────────

const JamCrackerPanel: React.FC<{
  instrument: InstrumentConfig;
  onUpdate: (id: number, changes: Partial<InstrumentConfig>) => void;
}> = ({ instrument, onUpdate }) => {
  const theme = usePixiTheme();
  const jc = instrument.jamCracker!;

  const updateJC = useCallback(
    (key: string, value: number) => {
      onUpdate(instrument.id, {
        jamCracker: { ...instrument.jamCracker!, [key]: value },
      });
    },
    [instrument.id, instrument.jamCracker, onUpdate],
  );

  // Draw AM waveform using Pixi Graphics
  const drawWaveform = useCallback(
    (g: import('pixi.js').Graphics) => {
      g.clear();
      const W = 320;
      const H = 100;
      const mid = H / 2;

      // Background
      g.rect(0, 0, W, H).fill({ color: theme.bg.color });

      // Center line
      g.moveTo(0, mid).lineTo(W, mid).stroke({ color: theme.border.color, width: 1 });

      const waveformData = jc.waveformData;
      if (!waveformData || waveformData.length < 64) {
        return;
      }

      const WAVE_SIZE = 64;

      // Raw waveform (dim)
      g.moveTo(0, mid);
      for (let x = 0; x < W; x++) {
        const idx = Math.floor((x / W) * WAVE_SIZE) % WAVE_SIZE;
        const s = waveformData[idx] > 127 ? waveformData[idx] - 256 : waveformData[idx];
        const y = mid - (s / 128) * (mid - 4);
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke({ color: theme.success.color, alpha: 0.25, width: 1 });

      // Blended waveform (bright)
      let phase = 0;
      g.moveTo(0, mid);
      for (let x = 0; x < W; x++) {
        const idx = Math.floor((x / W) * WAVE_SIZE) % WAVE_SIZE;
        const phaseIdx = (idx + Math.floor(phase / 4)) % WAVE_SIZE;
        const s1 = waveformData[idx] > 127 ? waveformData[idx] - 256 : waveformData[idx];
        const s2 = waveformData[phaseIdx] > 127 ? waveformData[phaseIdx] - 256 : waveformData[phaseIdx];
        const blended = (s1 + s2) / 2;
        const y = mid - (blended / 128) * (mid - 4);
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
        phase = (phase + Math.floor(jc.phaseDelta * WAVE_SIZE / W)) & 0xFF;
      }
      g.stroke({ color: theme.success.color, width: 2 });
    },
    [jc.waveformData, jc.phaseDelta],
  );

  return (
    <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
      {/* Header */}
      <layoutContainer
        layout={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          padding: 6,
          borderRadius: 4,
          backgroundColor: theme.bgTertiary.color,
        }}
      >
        <PixiLabel text="JamCracker Pro" size="sm" weight="bold" color="custom" customColor={0x00DDFF} />
        <PixiLabel text={jc.name} size="sm" color="textSecondary" />
        <layoutContainer layout={{ flex: 1 }} />
        {jc.isAM && <PixiLabel text="AM SYNTH" size="xs" weight="bold" color="custom" customColor={0xC084FC} />}
        {jc.hasLoop && <PixiLabel text="LOOP" size="xs" weight="bold" color="custom" customColor={0x4ADE80} />}
        {!jc.isAM && <PixiLabel text={`PCM ${jc.sampleSize}b`} size="xs" weight="bold" color="custom" customColor={0x60A5FA} />}
      </layoutContainer>

      {/* AM Waveform */}
      {jc.isAM && (
        <>
          <SectionHeading text="AM WAVEFORM (64-BYTE PHASE MODULATION)" />
          <layoutContainer
            layout={{
              width: 320,
              height: 100,
              borderWidth: 1,
              borderColor: theme.border.color,
              borderRadius: 4,
            }}
          >
            <pixiGraphics draw={drawWaveform} layout={{ width: 320, height: 100 }} />
          </layoutContainer>
        </>
      )}

      {/* Controls */}
      <SectionHeading text="PARAMETERS" />
      <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
        <PixiKnob
          value={jc.volume}
          min={0}
          max={64}
          onChange={(v) => updateJC('volume', Math.round(v))}
          label="Volume"
          size={KNOB_SIZE}
          defaultValue={64}
        />
        {jc.isAM && (
          <PixiKnob
            value={jc.phaseDelta}
            min={0}
            max={255}
            onChange={(v) => updateJC('phaseDelta', Math.round(v))}
            label="Phase Δ"
            size={KNOB_SIZE}
            defaultValue={0}
          />
        )}
      </layoutContainer>

      {/* Info */}
      <layoutContainer layout={{ paddingTop: 4 }}>
        <PixiLabel
          text={`Flags: 0x${jc.flags.toString(16).padStart(2, '0')}${jc.isAM ? ' — AM synthesis with 64-byte waveform loop' : ' — PCM sample playback'}`}
          size="xs"
          color="textMuted"
        />
      </layoutContainer>
    </layoutContainer>
  );
};

// ── Future Player Panel ─────────────────────────────────────────────────────

const FuturePlayerPanel: React.FC<{ instrument: InstrumentConfig }> = ({ instrument }) => {
  const theme = usePixiTheme();
  const meta = instrument.metadata;
  const sample = instrument.sample;
  const isWavetable = sample?.fpIsWavetable ?? false;
  const sampleSize = sample?.fpSampleSize ?? 0;
  const instrPtr = meta?.fpInstrPtr ?? sample?.fpInstrPtr;

  return (
    <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
      {/* Header */}
      <layoutContainer
        layout={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          padding: 6,
          borderRadius: 4,
          backgroundColor: theme.bgTertiary.color,
        }}
      >
        <PixiLabel text="Future Player" size="sm" weight="bold" color="custom" customColor={0xFACC15} />
        <PixiLabel text={instrument.name} size="sm" color="textSecondary" />
        <layoutContainer layout={{ flex: 1 }} />
        {isWavetable ? (
          <PixiLabel text="WAVETABLE" size="xs" weight="bold" color="custom" customColor={0xC084FC} />
        ) : (
          <PixiLabel text={`SAMPLE ${sampleSize}b`} size="xs" weight="bold" color="custom" customColor={0x60A5FA} />
        )}
      </layoutContainer>

      <SectionHeading text="INSTRUMENT INFO" />

      <layoutContainer layout={{ flexDirection: 'column', gap: 4, paddingLeft: 4 }}>
        <PixiLabel
          text={isWavetable ? 'Wavetable synthesis instrument — sound generated by the replayer engine' : `PCM sample instrument — ${sampleSize} bytes`}
          size="sm"
          color="textSecondary"
        />
        {instrPtr != null && (
          <PixiLabel text={`Module offset: 0x${instrPtr.toString(16).toUpperCase()}`} size="xs" color="textMuted" />
        )}
      </layoutContainer>

      <SectionHeading text="PLAYBACK" />
      <layoutContainer layout={{ flexDirection: 'column', gap: 4, paddingLeft: 4 }}>
        <PixiLabel
          text="Future Player instruments are rendered by the native WASM replayer. Click an instrument in the list to preview it at different notes."
          size="xs"
          color="textMuted"
        />
        <PixiLabel
          text="Pattern data drives note playback through the original Amiga replayer code."
          size="xs"
          color="textMuted"
        />
      </layoutContainer>
    </layoutContainer>
  );
};

// ── Generic fallback for other native WASM synths ───────────────────────────

const GenericNativePanel: React.FC<{ instrument: InstrumentConfig }> = ({ instrument }) => {
  const theme = usePixiTheme();
  const info = getSynthInfo(instrument.synthType);
  return (
    <layoutContainer layout={{ flexDirection: 'column', gap: 10 }}>
      <layoutContainer
        layout={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          padding: 6,
          borderRadius: 4,
          backgroundColor: theme.bgTertiary.color,
        }}
      >
        <PixiLabel text={info?.shortName ?? instrument.synthType} size="sm" weight="bold" color="custom" customColor={twColor(info?.color ?? '')} />
        <PixiLabel text={info?.description?.slice(0, 80) ?? ''} size="xs" color="textMuted" />
      </layoutContainer>
      <SectionHeading text="NATIVE INSTRUMENT" />
      <PixiLabel text="This is a native WASM instrument. Sound is generated by the original replayer engine." size="sm" color="textSecondary" />
    </layoutContainer>
  );
};

// ── Sound Panel ─────────────────────────────────────────────────────────────

interface SoundPanelProps {
  instrument: InstrumentConfig;
  updateParam: (key: string, value: number) => void;
  updateOsc: (key: string, value: number | string) => void;
  updateFilter: (key: string, value: number | string) => void;
  updateEnvelope: (key: string, value: number) => void;
}

const WAVEFORM_OPTIONS: SelectOption[] = [
  { value: 'sine', label: 'Sine' },
  { value: 'square', label: 'Square' },
  { value: 'sawtooth', label: 'Sawtooth' },
  { value: 'triangle', label: 'Triangle' },
];

const SoundPanel: React.FC<SoundPanelProps> = ({
  instrument,
  updateParam,
  updateOsc,
  updateFilter,
  updateEnvelope,
}) => {
  const theme = usePixiTheme();
  const info = getSynthInfo(instrument.synthType);

  return (
    <layoutContainer layout={{ flexDirection: 'column', gap: 10 }}>
      {/* ── Synth type badge ──────────────────────────────────────────────── */}
      <layoutContainer
        layout={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          padding: 6,
          borderRadius: 4,
          backgroundColor: theme.bgTertiary.color,
        }}
      >
        <PixiLabel
          text={info?.shortName ?? instrument.synthType}
          size="sm"
          weight="bold"
          color="custom"
          customColor={twColor(info?.color ?? '')}
        />
        <PixiLabel
          text={info?.description?.slice(0, 80) ?? ''}
          size="xs"
          color="textMuted"
        />
      </layoutContainer>

      {/* ── Common parameters: Volume + Pan ──────────────────────────────── */}
      <SectionHeading text="MIXER" />
      <layoutContainer layout={{ flexDirection: 'row', gap: 16 }}>
        <PixiKnob
          value={instrument.volume ?? -6}
          min={-60}
          max={0}
          onChange={(v) => updateParam('volume', v)}
          label="Volume"
          unit="dB"
          size={KNOB_SIZE}
          defaultValue={-6}
        />
        <PixiKnob
          value={instrument.pan ?? 0}
          min={-100}
          max={100}
          onChange={(v) => updateParam('pan', v)}
          label="Pan"
          size={KNOB_SIZE}
          bipolar
          defaultValue={0}
        />
      </layoutContainer>

      {/* ── Oscillator (for Tone.js-family synths) ───────────────────────── */}
      {instrument.oscillator && (
        <>
          <SectionHeading text="OSCILLATOR" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 12, alignItems: 'flex-end' }}>
            <layoutContainer layout={{ flexDirection: 'column', gap: 4 }}>
              <PixiLabel text="Wave" size="xs" color="textMuted" />
              <PixiSelect
                options={WAVEFORM_OPTIONS}
                value={instrument.oscillator.type ?? 'sine'}
                onChange={(v) => updateOsc('type', v)}
                width={110}
              />
            </layoutContainer>
            <PixiKnob
              value={instrument.oscillator.detune ?? 0}
              min={-100}
              max={100}
              onChange={(v) => updateOsc('detune', v)}
              label="Detune"
              unit="ct"
              size={KNOB_SIZE}
              bipolar
              defaultValue={0}
            />
          </layoutContainer>
        </>
      )}

      {/* ── Filter ───────────────────────────────────────────────────────── */}
      {instrument.filter && (
        <>
          <SectionHeading text="FILTER" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16 }}>
            <PixiKnob
              value={instrument.filter.frequency ?? 2000}
              min={20}
              max={20000}
              onChange={(v) => updateFilter('frequency', v)}
              label="Cutoff"
              unit="Hz"
              size={KNOB_SIZE}
              logarithmic
              defaultValue={2000}
            />
            <PixiKnob
              value={instrument.filter.Q ?? 1}
              min={0}
              max={100}
              onChange={(v) => updateFilter('Q', v)}
              label="Reso"
              size={KNOB_SIZE}
              defaultValue={1}
            />
          </layoutContainer>
        </>
      )}

      {/* ── Envelope ─────────────────────────────────────────────────────── */}
      {instrument.envelope && (
        <>
          <SectionHeading text="ENVELOPE" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 12 }}>
            <PixiKnob
              value={instrument.envelope.attack ?? 10}
              min={0}
              max={2000}
              onChange={(v) => updateEnvelope('attack', v)}
              label="Atk"
              unit="ms"
              size={KNOB_SIZE}
              defaultValue={10}
            />
            <PixiKnob
              value={instrument.envelope.decay ?? 100}
              min={0}
              max={2000}
              onChange={(v) => updateEnvelope('decay', v)}
              label="Dec"
              unit="ms"
              size={KNOB_SIZE}
              defaultValue={100}
            />
            <PixiKnob
              value={instrument.envelope.sustain ?? 70}
              min={0}
              max={100}
              onChange={(v) => updateEnvelope('sustain', v)}
              label="Sus"
              unit="%"
              size={KNOB_SIZE}
              defaultValue={70}
            />
            <PixiKnob
              value={instrument.envelope.release ?? 200}
              min={0}
              max={5000}
              onChange={(v) => updateEnvelope('release', v)}
              label="Rel"
              unit="ms"
              size={KNOB_SIZE}
              defaultValue={200}
            />
          </layoutContainer>
        </>
      )}

      {/* ── TB303-specific summary ───────────────────────────────────────── */}
      {instrument.tb303 && (
        <>
          <SectionHeading text="TB-303" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 12 }}>
            <PixiKnob
              value={instrument.tb303.filter?.cutoff ?? 0.5}
              min={0}
              max={1}
              onChange={(v) => updateParam('tb303', v)}
              label="Cutoff"
              size={KNOB_SIZE}
              step={0.01}
              formatValue={(v) => `${(v * 100).toFixed(0)}%`}
            />
            <PixiKnob
              value={instrument.tb303.filter?.resonance ?? 0.5}
              min={0}
              max={1}
              onChange={() => {}}
              label="Reso"
              size={KNOB_SIZE}
              disabled
              formatValue={(v) => `${(v * 100).toFixed(0)}%`}
            />
            <PixiKnob
              value={instrument.tb303.filterEnvelope?.envMod ?? 0.5}
              min={0}
              max={1}
              onChange={() => {}}
              label="EnvMod"
              size={KNOB_SIZE}
              disabled
              formatValue={(v) => `${(v * 100).toFixed(0)}%`}
            />
            <PixiKnob
              value={instrument.tb303.filterEnvelope?.decay ?? 0.5}
              min={0}
              max={1}
              onChange={() => {}}
              label="Decay"
              size={KNOB_SIZE}
              disabled
              formatValue={(v) => `${(v * 100).toFixed(0)}%`}
            />
          </layoutContainer>
          <PixiLabel text="Full TB-303 editing available in DOM mode" size="xs" color="textMuted" />
        </>
      )}

      {/* ── Furnace chip summary ─────────────────────────────────────────── */}
      {instrument.synthType.startsWith('Furnace') && !instrument.tb303 && (
        <>
          <SectionHeading text="FURNACE CHIP" />
          <PixiLabel
            text={`Chip: ${info?.shortName ?? instrument.synthType}`}
            size="xs"
            color="text"
          />
          <PixiLabel text="Full chip editing available in DOM mode" size="xs" color="textMuted" />
        </>
      )}

      {/* ── Sampler summary ──────────────────────────────────────────────── */}
      {instrument.sample && (
        <>
          <SectionHeading text="SAMPLE" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 12 }}>
            <PixiKnob
              value={instrument.sample.playbackRate ?? 1}
              min={0.25}
              max={4}
              onChange={() => {}}
              label="Speed"
              size={KNOB_SIZE}
              disabled
              formatValue={(v) => `${v.toFixed(2)}x`}
            />
          </layoutContainer>
          <PixiLabel
            text={`Base: ${instrument.sample.baseNote ?? 'C-4'} | Loop: ${instrument.sample.loop ? 'On' : 'Off'}`}
            size="xs"
            color="textMuted"
          />
        </>
      )}
    </layoutContainer>
  );
};

// ── Effects Panel ───────────────────────────────────────────────────────────

const AVAILABLE_FX: EffectConfig['type'][] = [
  'Distortion', 'Reverb', 'Delay', 'Chorus', 'Phaser', 'Tremolo', 'Vibrato',
  'AutoFilter', 'AutoPanner', 'AutoWah', 'BitCrusher', 'Compressor', 'EQ3',
  'Filter', 'PingPongDelay', 'PitchShift', 'FeedbackDelay', 'JCReverb',
  'StereoWidener', 'SpaceEcho', 'BiPhase', 'DubFilter',
];

interface EffectsPanelProps {
  instrumentId: number;
  effects: EffectConfig[];
}

const EffectsPanel: React.FC<EffectsPanelProps> = ({ instrumentId, effects }) => {
  const theme = usePixiTheme();
  const [showAddMenu, setShowAddMenu] = useState(false);
  const addEffect = useInstrumentStore((s) => s.addEffect);
  const removeEffect = useInstrumentStore((s) => s.removeEffect);
  const updateEffect = useInstrumentStore((s) => s.updateEffect);

  return (
    <layoutContainer layout={{ flexDirection: 'column', gap: 6 }}>
      {/* Header with Add button */}
      <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionHeading text="EFFECT CHAIN" />
        <PixiButton
          label="+ Add Effect"
          variant={showAddMenu ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => setShowAddMenu(!showAddMenu)}
        />
      </layoutContainer>

      {/* Add effect menu */}
      {showAddMenu && (
        <layoutContainer
          layout={{
            flexDirection: 'row', flexWrap: 'wrap', gap: 4, padding: 8,
            backgroundColor: theme.bgTertiary.color, borderRadius: 6,
            borderWidth: 1, borderColor: theme.accent?.color ?? 0xFB923C,
          }}
        >
          {AVAILABLE_FX.map((fxType) => (
            <PixiButton
              key={fxType}
              label={fxType}
              variant="ghost"
              size="sm"
              onClick={() => { addEffect(instrumentId, fxType); setShowAddMenu(false); }}
            />
          ))}
        </layoutContainer>
      )}

      {/* Effect list */}
      {(!effects || effects.length === 0) ? (
        <layoutContainer layout={{ padding: 24, alignItems: 'center', justifyContent: 'center' }}>
          <PixiLabel text="No effects. Click + Add Effect to get started." size="sm" color="textMuted" />
        </layoutContainer>
      ) : (
        effects.map((fx, i) => (
          <layoutContainer
            key={fx.id}
            layout={{
              flexDirection: 'row', alignItems: 'center', gap: 8, padding: 6, borderRadius: 4,
              backgroundColor: theme.bgTertiary.color, borderWidth: 1, borderColor: theme.border.color,
            }}
          >
            <PixiToggle
              label=""
              value={fx.enabled}
              onChange={(v) => updateEffect(instrumentId, fx.id, { enabled: v })}
              size="sm"
            />
            <PixiLabel text={`${i + 1}.`} size="xs" weight="bold" color="textMuted" />
            <PixiLabel text={fx.type} size="sm" weight="semibold" color={fx.enabled ? 'text' : 'textMuted'} />
            <layoutContainer layout={{ flex: 1 }} />
            <PixiKnob
              value={fx.wet ?? 100}
              min={0}
              max={100}
              onChange={(v) => updateEffect(instrumentId, fx.id, { wet: Math.round(v) })}
              label="Wet"
              unit="%"
              size="sm"
            />
            <PixiButton
              icon="close"
              label=""
              variant="ghost"
              size="sm"
              onClick={() => removeEffect(instrumentId, fx.id)}
            />
          </layoutContainer>
        ))
      )}
    </layoutContainer>
  );
};

// ── Section heading helper ──────────────────────────────────────────────────

const SectionHeading: React.FC<{ text: string }> = ({ text }) => (
  <layoutContainer layout={{ paddingTop: 2, paddingBottom: 2 }}>
    <PixiLabel text={text} size="xs" weight="bold" color="textMuted" />
  </layoutContainer>
);
