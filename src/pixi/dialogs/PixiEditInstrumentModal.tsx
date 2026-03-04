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
  PixiModalFooter,
  PixiButton,
  PixiLabel,
  PixiList,
  PixiKnob,
  PixiSlider,
  PixiToggle,
  PixiSelect,
  type SelectOption,
} from '../components';
import { PixiPureTextInput } from '../input/PixiPureTextInput';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';
import { useInstrumentStore, notify } from '@stores';
import { ALL_SYNTH_TYPES, getSynthInfo, SYNTH_CATEGORIES } from '@constants/synthCategories';
import type { SynthType } from '@typedefs/instrument';
import type { InstrumentConfig, EffectConfig } from '@typedefs/instrument';

// ── Layout constants ────────────────────────────────────────────────────────

const MODAL_W = 800;
const MODAL_H = 550;
const LEFT_PANEL_W = 220;
const RIGHT_PANEL_W = MODAL_W - LEFT_PANEL_W;
const HEADER_H = 38;
const TAB_BAR_H = 32;
const FOOTER_H = 44;
const CONTENT_H = MODAL_H - HEADER_H - FOOTER_H;
const RIGHT_CONTENT_H = CONTENT_H - TAB_BAR_H;
const PAD = 16;
const KNOB_SIZE = 'sm' as const;

// ── Synth type palette (Tailwind class → hex) ──────────────────────────────

const TW_TO_HEX: Record<string, number> = {
  'text-blue-400':    0x60A5FA,
  'text-emerald-400': 0x34D399,
  'text-green-400':   0x4ADE80,
  'text-yellow-400':  0xFACC15,
  'text-red-400':     0xF87171,
  'text-purple-400':  0xC084FC,
  'text-orange-400':  0xFB923C,
  'text-cyan-400':    0x22D3EE,
  'text-pink-400':    0xF472B6,
  'text-neutral-400': 0xA3A3A3,
};
function twColor(tw: string): number {
  return TW_TO_HEX[tw] ?? 0xA3A3A3;
}

// ── Types ───────────────────────────────────────────────────────────────────

type ActiveTab = 'sound' | 'effects';

interface PixiEditInstrumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  createMode?: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Build PixiList items from the instrument array */
function instrumentListItems(instruments: InstrumentConfig[], currentId: number | null) {
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

/** Build SelectOption list for synth types */
function synthTypeOptions(): SelectOption[] {
  return ALL_SYNTH_TYPES.map((st) => {
    const info = getSynthInfo(st);
    return { value: st, label: info?.shortName ?? st };
  });
}

/** Synth type list items for the create-mode browser */
function synthTypeListItems() {
  return ALL_SYNTH_TYPES.map((st) => {
    const info = getSynthInfo(st);
    return {
      id: st,
      label: info?.shortName ?? st,
      sublabel: info?.description?.slice(0, 60) ?? '',
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

  // ── Store ───────────────────────────────────────────────────────────────
  const instruments = useInstrumentStore((s) => s.instruments);
  const currentInstrumentId = useInstrumentStore((s) => s.currentInstrumentId);
  const setCurrentInstrument = useInstrumentStore((s) => s.setCurrentInstrument);
  const createInstrument = useInstrumentStore((s) => s.createInstrument);
  const updateInstrument = useInstrumentStore((s) => s.updateInstrument);

  // ── Local state ─────────────────────────────────────────────────────────
  const [isCreating, setIsCreating] = useState(createMode);
  const [activeTab, setActiveTab] = useState<ActiveTab>('sound');
  const [selectedSynthType, setSelectedSynthType] = useState<SynthType>('Synth');
  const [newName, setNewName] = useState('New Instrument');
  const [synthSearch, setSynthSearch] = useState('');

  // Reset create mode when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsCreating(createMode);
      setActiveTab('sound');
      setSynthSearch('');
    }
  }, [isOpen, createMode]);

  // ── Derived ─────────────────────────────────────────────────────────────
  const currentInstrument = useMemo(
    () => instruments.find((i) => i.id === currentInstrumentId) ?? instruments[0] ?? null,
    [instruments, currentInstrumentId],
  );

  const instListItems = useMemo(() => instrumentListItems(instruments, currentInstrumentId), [instruments, currentInstrumentId]);

  const filteredSynthItems = useMemo(() => {
    const items = synthTypeListItems();
    if (!synthSearch) return items;
    const q = synthSearch.toLowerCase();
    return items.filter(
      (it) => it.label.toLowerCase().includes(q) || it.sublabel.toLowerCase().includes(q),
    );
  }, [synthSearch]);

  // ── Config ref for knob callbacks (avoid stale closures) ────────────────
  const instRef = useRef(currentInstrument);
  useEffect(() => { instRef.current = currentInstrument; }, [currentInstrument]);

  // ── Callbacks ───────────────────────────────────────────────────────────

  const handleSelectInstrument = useCallback((id: string) => {
    setCurrentInstrument(Number(id));
  }, [setCurrentInstrument]);

  const handleCreate = useCallback(() => {
    const inst = createInstrument();
    if (inst) {
      updateInstrument(inst.id, { name: newName, synthType: selectedSynthType });
      setCurrentInstrument(inst.id);
      notify.success(`Created ${newName}`);
    }
    setIsCreating(false);
  }, [createInstrument, updateInstrument, setCurrentInstrument, newName, selectedSynthType]);

  const handleRename = useCallback((name: string) => {
    if (!currentInstrument) return;
    updateInstrument(currentInstrument.id, { name });
  }, [currentInstrument, updateInstrument]);

  const handlePrev = useCallback(() => {
    const idx = instruments.findIndex((i) => i.id === currentInstrumentId);
    if (idx > 0) setCurrentInstrument(instruments[idx - 1].id);
  }, [instruments, currentInstrumentId, setCurrentInstrument]);

  const handleNext = useCallback(() => {
    const idx = instruments.findIndex((i) => i.id === currentInstrumentId);
    if (idx >= 0 && idx < instruments.length - 1) setCurrentInstrument(instruments[idx + 1].id);
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

  const toggleEffect = useCallback(
    (effectId: string, enabled: boolean) => {
      const inst = instRef.current;
      if (!inst) return;
      const effects = inst.effects.map((fx) =>
        fx.id === effectId ? { ...fx, enabled } : fx,
      );
      updateInstrument(inst.id, { effects });
    },
    [updateInstrument],
  );

  // ── Guard ───────────────────────────────────────────────────────────────

  if (!isOpen) return null;

  const synthInfo = currentInstrument ? getSynthInfo(currentInstrument.synthType) : null;
  const instIdx = instruments.findIndex((i) => i.id === currentInstrumentId);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <PixiModal isOpen={isOpen} onClose={onClose} width={MODAL_W} height={MODAL_H}>
      <PixiModalHeader
        title={isCreating ? 'Create Instrument' : 'Edit Instrument'}
        onClose={onClose}
      />

      {/* ── Body: left + right panels ────────────────────────────────────── */}
      <layoutContainer layout={{ flex: 1, flexDirection: 'row', width: MODAL_W }}>
        {/* ── LEFT PANEL ──────────────────────────────────────────────────── */}
        <layoutContainer
          layout={{
            width: LEFT_PANEL_W,
            flexDirection: 'column',
            backgroundColor: theme.bgSecondary.color,
            borderRightWidth: 1,
            borderColor: theme.border.color,
          }}
        >
          {isCreating ? (
            /* ── Synth type browser (create mode) ─────────────────────────── */
            <>
              <layoutContainer layout={{ padding: 6, gap: 4, flexDirection: 'column' }}>
                <PixiLabel text="SYNTH TYPE" size="xs" weight="bold" color="textMuted" />
                <PixiPureTextInput
                  value={synthSearch}
                  onChange={setSynthSearch}
                  placeholder="Search…"
                  width={LEFT_PANEL_W - 16}
                  height={24}
                />
              </layoutContainer>
              <PixiList
                items={filteredSynthItems}
                width={LEFT_PANEL_W}
                height={CONTENT_H - 90}
                itemHeight={36}
                selectedId={selectedSynthType}
                onSelect={(id) => setSelectedSynthType(id as SynthType)}
              />
              <layoutContainer layout={{ padding: 6, gap: 4, flexDirection: 'column' }}>
                <PixiPureTextInput
                  value={newName}
                  onChange={setNewName}
                  placeholder="Instrument name"
                  width={LEFT_PANEL_W - 16}
                  height={24}
                />
                <PixiButton label="Create" variant="primary" onClick={handleCreate} />
              </layoutContainer>
            </>
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
                <PixiLabel text="INSTRUMENTS" size="xs" weight="bold" color="textMuted" />
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
          {/* ── Nav + name row ────────────────────────────────────────────── */}
          {!isCreating && currentInstrument && (
            <layoutContainer
              layout={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingLeft: 8,
                paddingRight: 8,
                height: 32,
                borderBottomWidth: 1,
                borderColor: theme.border.color,
              }}
            >
              <PixiButton
                label="◀"
                variant="ghost"
                size="sm"
                disabled={instIdx <= 0}
                onClick={handlePrev}
              />
              <PixiButton
                label="▶"
                variant="ghost"
                size="sm"
                disabled={instIdx >= instruments.length - 1}
                onClick={handleNext}
              />
              <PixiPureTextInput
                value={currentInstrument.name}
                onChange={handleRename}
                width={180}
                height={22}
              />
              <layoutContainer layout={{ flex: 1 }} />
              {synthInfo && (
                <PixiLabel
                  text={synthInfo.shortName}
                  size="xs"
                  weight="semibold"
                  color="custom"
                  customColor={twColor(synthInfo.color)}
                />
              )}
            </layoutContainer>
          )}

          {/* ── Tab bar ──────────────────────────────────────────────────── */}
          <layoutContainer
            layout={{
              flexDirection: 'row',
              width: RIGHT_PANEL_W,
              height: TAB_BAR_H,
              borderBottomWidth: 1,
              borderColor: theme.border.color,
            }}
          >
            <TabButton
              label="Sound"
              active={activeTab === 'sound'}
              onSelect={() => setActiveTab('sound')}
              width={RIGHT_PANEL_W / 2}
            />
            <TabButton
              label="Effects"
              active={activeTab === 'effects'}
              onSelect={() => setActiveTab('effects')}
              width={RIGHT_PANEL_W / 2}
            />
          </layoutContainer>

          {/* ── Content area ──────────────────────────────────────────────── */}
          <layoutContainer layout={{ flex: 1, padding: PAD, gap: 8, flexDirection: 'column', overflow: 'hidden' }}>
            {activeTab === 'sound' && currentInstrument && (
              <SoundPanel instrument={currentInstrument} updateParam={updateParam} updateOsc={updateOsc} updateFilter={updateFilter} updateEnvelope={updateEnvelope} />
            )}
            {activeTab === 'effects' && currentInstrument && (
              <EffectsPanel effects={currentInstrument.effects} toggleEffect={toggleEffect} />
            )}
            {!currentInstrument && !isCreating && (
              <layoutContainer layout={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <PixiLabel text="No instrument selected" size="sm" color="textMuted" />
              </layoutContainer>
            )}
          </layoutContainer>
        </layoutContainer>
      </layoutContainer>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <PixiModalFooter align="right">
        <PixiButton label="Close" variant="default" onClick={onClose} />
      </PixiModalFooter>
    </PixiModal>
  );
};

// ── Sub-components ──────────────────────────────────────────────────────────

/** Simple tab toggle button (no close/new) */
const TabButton: React.FC<{
  label: string;
  active: boolean;
  onSelect: () => void;
  width: number;
}> = ({ label, active, onSelect, width }) => {
  const theme = usePixiTheme();
  return (
    <layoutContainer
      layout={{
        width,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active ? theme.accent.color : theme.bgSecondary.color,
        borderRightWidth: 1,
        borderColor: theme.border.color,
      }}
      eventMode="static"
      cursor="pointer"
      onPointerUp={onSelect}
    >
      <PixiLabel
        text={label}
        size="sm"
        weight="bold"
        color={active ? 'custom' : 'textSecondary'}
        customColor={active ? 0x000000 : undefined}
      />
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

interface EffectsPanelProps {
  effects: EffectConfig[];
  toggleEffect: (id: string, enabled: boolean) => void;
}

const EffectsPanel: React.FC<EffectsPanelProps> = ({ effects, toggleEffect }) => {
  const theme = usePixiTheme();

  if (!effects || effects.length === 0) {
    return (
      <layoutContainer layout={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <PixiLabel text="No effects on this instrument" size="sm" color="textMuted" />
      </layoutContainer>
    );
  }

  return (
    <layoutContainer layout={{ flexDirection: 'column', gap: 6 }}>
      <SectionHeading text="EFFECT CHAIN" />
      {effects.map((fx, i) => (
        <layoutContainer
          key={fx.id}
          layout={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            padding: 6,
            borderRadius: 4,
            backgroundColor: theme.bgTertiary.color,
            borderWidth: 1,
            borderColor: theme.border.color,
          }}
        >
          <PixiToggle
            label=""
            value={fx.enabled}
            onChange={(v) => toggleEffect(fx.id, v)}
            size="sm"
          />
          <PixiLabel text={`${i + 1}.`} size="xs" weight="bold" color="textMuted" />
          <PixiLabel text={fx.type} size="sm" weight="semibold" color="text" />
          <layoutContainer layout={{ flex: 1 }} />
          <PixiKnob
            value={fx.wet ?? 100}
            min={0}
            max={100}
            onChange={() => {}}
            label="Wet"
            unit="%"
            size="sm"
            disabled
          />
        </layoutContainer>
      ))}
      <PixiLabel text="Full effect editing available in DOM mode" size="xs" color="textMuted" />
    </layoutContainer>
  );
};

// ── Section heading helper ──────────────────────────────────────────────────

const SectionHeading: React.FC<{ text: string }> = ({ text }) => (
  <layoutContainer layout={{ paddingTop: 2, paddingBottom: 2 }}>
    <PixiLabel text={text} size="xs" weight="bold" color="textMuted" />
  </layoutContainer>
);
