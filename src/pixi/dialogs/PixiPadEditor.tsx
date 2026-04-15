/**
 * PixiPadEditor — GL-native pad parameter editor panel.
 * Reference: src/components/drumpad/PadEditor.tsx
 *
 * Renders as a right-side panel with 6 tabs (Main, ADSR, Filter, Velo, Layers, DJ)
 * matching the DOM version pixel-for-pixel in controls and layout.
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useDrumPadStore } from '../../stores/useDrumPadStore';
import type { DrumPad, FilterType, OutputBus, PlayMode, ScratchActionId, SampleData } from '../../types/drumpad';
import { PixiButton, PixiCheckbox } from '../components';
import { PixiSelect, type SelectOption } from '../components/PixiSelect';
import { PixiSlider } from '../components/PixiSlider';
import { PixiPureTextInput } from '../input/PixiPureTextInput';
import { getMIDIManager } from '../../midi/MIDIManager';
import type { MIDIMessage } from '../../midi/types';
import { getAudioContext } from '../../audio/AudioContextSingleton';
import { usePixiTheme } from '../theme';
import { Div, Txt } from '../layout';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PixiPadEditorProps {
  padId: number;
  width: number;
  onClose: () => void;
}

type TabName = 'main' | 'adsr' | 'filter' | 'velo' | 'layers' | 'dj';

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS: { id: TabName; label: string }[] = [
  { id: 'main', label: 'Main' },
  { id: 'adsr', label: 'ADSR' },
  { id: 'filter', label: 'Filter' },
  { id: 'velo', label: 'Velo' },
  { id: 'layers', label: 'Layers' },
  { id: 'dj', label: 'DJ' },
];

const OUTPUT_OPTIONS: SelectOption[] = [
  { value: 'stereo', label: 'Stereo Mix' },
  { value: 'out1', label: 'Output 1' },
  { value: 'out2', label: 'Output 2' },
  { value: 'out3', label: 'Output 3' },
  { value: 'out4', label: 'Output 4' },
];

const MUTE_GROUP_OPTIONS: SelectOption[] = [
  { value: '0', label: 'Off' },
  ...Array.from({ length: 8 }, (_, i) => ({ value: String(i + 1), label: `Group ${i + 1}` })),
];

const PLAY_MODE_OPTIONS: SelectOption[] = [
  { value: 'oneshot', label: 'One-Shot' },
  { value: 'sustain', label: 'Sustain' },
];

const FILTER_TYPE_OPTIONS: SelectOption[] = [
  { value: 'off', label: 'Off' },
  { value: 'lpf', label: 'Low Pass' },
  { value: 'hpf', label: 'High Pass' },
  { value: 'bpf', label: 'Band Pass' },
];

const SCRATCH_ACTION_OPTIONS: SelectOption[] = [
  { value: '', label: 'None' },
  { value: 'scratch_baby', label: 'Baby Scratch' },
  { value: 'scratch_trans', label: 'Transformer' },
  { value: 'scratch_flare', label: 'Flare' },
  { value: 'scratch_hydro', label: 'Hydroplane' },
  { value: 'scratch_crab', label: 'Crab' },
  { value: 'scratch_orbit', label: 'Orbit' },
  { value: 'scratch_chirp', label: 'Chirp' },
  { value: 'scratch_stab', label: 'Stab' },
  { value: 'scratch_scribble', label: 'Scribble' },
  { value: 'scratch_tear', label: 'Tear' },
  { value: 'scratch_uzi', label: 'Uzi' },
  { value: 'scratch_twiddle', label: 'Twiddle' },
  { value: 'scratch_8crab', label: '8-Finger Crab' },
  { value: 'scratch_3flare', label: '3-Click Flare' },
  { value: 'scratch_laser', label: 'Laser' },
  { value: 'scratch_phaser', label: 'Phaser' },
  { value: 'scratch_tweak', label: 'Tweak' },
  { value: 'scratch_drag', label: 'Drag' },
  { value: 'scratch_vibrato', label: 'Vibrato' },
  { value: 'scratch_stop', label: 'Stop Scratch' },
  { value: 'fader_lfo_off', label: 'Fader LFO: Off' },
  { value: 'fader_lfo_1_4', label: 'Fader LFO: 1/4' },
  { value: 'fader_lfo_1_8', label: 'Fader LFO: 1/8' },
  { value: 'fader_lfo_1_16', label: 'Fader LFO: 1/16' },
  { value: 'fader_lfo_1_32', label: 'Fader LFO: 1/32' },
];

// ADSR bar colors
const ADSR_COLORS = {
  attack: 0x10b981,
  decay: 0xf59e0b,
  sustain: 0x059669,
  release: 0x2563eb,
} as const;

const MAX_BAR_H = 80;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatTune = (v: number) => `${v > 0 ? '+' : ''}${(v / 10).toFixed(1)} st`;
const formatPan = (v: number) => (v === 0 ? 'C' : v > 0 ? `R${v}` : `L${-v}`);

// ─── Component ────────────────────────────────────────────────────────────────

export const PixiPadEditor: React.FC<PixiPadEditorProps> = ({ padId, width, onClose }) => {
  const theme = usePixiTheme();
  const [activeTab, setActiveTab] = useState<TabName>('main');

  const programs = useDrumPadStore((s) => s.programs);
  const currentProgramId = useDrumPadStore((s) => s.currentProgramId);
  const updatePad = useDrumPadStore((s) => s.updatePad);
  const clearPad = useDrumPadStore((s) => s.clearPad);
  const clipboardPad = useDrumPadStore((s) => s.clipboardPad);
  const copyPad = useDrumPadStore((s) => s.copyPad);
  const pastePad = useDrumPadStore((s) => s.pastePad);
  const removeLayerFromPad = useDrumPadStore((s) => s.removeLayerFromPad);
  const updateLayerOnPad = useDrumPadStore((s) => s.updateLayerOnPad);
  const addLayerToPad = useDrumPadStore((s) => s.addLayerToPad);
  const midiMappings = useDrumPadStore((s) => s.midiMappings);
  const setMIDIMapping = useDrumPadStore((s) => s.setMIDIMapping);
  const clearMIDIMapping = useDrumPadStore((s) => s.clearMIDIMapping);

  const [isLearning, setIsLearning] = useState(false);
  const learningRef = useRef(false);

  const midiMapping = midiMappings[String(padId)];

  const pad = useMemo(() => {
    const program = programs.get(currentProgramId);
    return program?.pads.find((p) => p.id === padId) ?? null;
  }, [programs, currentProgramId, padId]);

  const handleUpdate = useCallback(
    (updates: Partial<DrumPad>) => updatePad(padId, updates),
    [padId, updatePad],
  );

  // ─── MIDI Learn ────────────────────────────────────────────────────────────
  const handleMIDILearn = useCallback(() => {
    if (isLearning) {
      setIsLearning(false);
      learningRef.current = false;
      return;
    }
    setIsLearning(true);
    learningRef.current = true;

    const manager = getMIDIManager();
    const handler = (message: MIDIMessage) => {
      if (!learningRef.current) return;
      if (message.type === 'noteOn' && message.note !== undefined) {
        setMIDIMapping(String(padId), { type: 'note', note: message.note });
        setIsLearning(false);
        learningRef.current = false;
        manager.removeMessageHandler(handler);
      }
    };
    manager.addMessageHandler(handler);

    setTimeout(() => {
      if (learningRef.current) {
        setIsLearning(false);
        learningRef.current = false;
        manager.removeMessageHandler(handler);
      }
    }, 10000);
  }, [isLearning, padId, setMIDIMapping]);

  useEffect(() => {
    return () => { learningRef.current = false; };
  }, []);

  // ─── Add Layer via file picker ─────────────────────────────────────────────
  const handleAddLayerFromFile = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*,.wav,.mp3,.ogg,.flac,.aiff,.aif';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file || !pad) return;
      try {
        const audioContext = getAudioContext();
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const sampleData: SampleData = {
          id: `layer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: file.name.replace(/\.[^/.]+$/, ''),
          audioBuffer,
          duration: audioBuffer.duration,
          sampleRate: audioBuffer.sampleRate,
        };
        const existingCount = pad.layers.length;
        const rangeSize = Math.floor(128 / (existingCount + 1));
        const min = existingCount * rangeSize;
        const max = existingCount === 0 ? 127 : Math.min(min + rangeSize - 1, 127);
        addLayerToPad(padId, sampleData, [min, max]);
      } catch {
        // silently fail — audio decode error
      }
    };
    input.click();
  }, [pad, padId, addLayerToPad]);

  // ─── ADSR visualization heights ──────────────────────────────────────────
  const adsrBars = useMemo(() => {
    if (!pad) return null;
    return {
      attack: Math.max(2, (pad.attack / 100) * MAX_BAR_H),
      decay: Math.max(2, (pad.decay / 2000) * MAX_BAR_H),
      sustain: Math.max(2, (pad.sustain / 100) * MAX_BAR_H),
      release: Math.max(2, (pad.release / 5000) * MAX_BAR_H),
    };
  }, [pad?.attack, pad?.decay, pad?.sustain, pad?.release]);

  if (!pad) {
    return (
      <Div className="flex-col items-center justify-center" layout={{ width, height: 120 }}>
        <Txt className="text-xs text-text-muted">{`Pad ${padId} not found`}</Txt>
      </Div>
    );
  }

  const innerW = width - 16; // horizontal padding

  return (
    <Div
      className="flex-col"
      layout={{
        width,
        backgroundColor: theme.bg.color,
        borderWidth: 1,
        borderColor: theme.border.color,
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <Div
        className="flex-row items-center justify-between"
        layout={{
          paddingLeft: 10,
          paddingRight: 10,
          paddingTop: 8,
          paddingBottom: 8,
          borderBottomWidth: 1,
          borderColor: theme.border.color,
        }}
      >
        <Div className="flex-col">
          <Txt className="text-sm font-bold text-text-primary">
            {`Pad ${pad.id}: ${pad.name}`}
          </Txt>
          <Txt className="text-xs text-text-muted">
            {pad.sample ? 'Sample loaded' : 'No sample'}
          </Txt>
        </Div>
        <Div className="flex-row items-center gap-2">
          <PixiButton label="Copy" variant="ghost" size="sm" onClick={() => copyPad(padId)} />
          <PixiButton
            label="Paste"
            variant="ghost"
            size="sm"
            disabled={!clipboardPad}
            onClick={() => pastePad(padId)}
          />
          <PixiButton label="Close" variant="ghost" size="sm" onClick={onClose} />
        </Div>
      </Div>

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <Div
        className="flex-row"
        layout={{ borderBottomWidth: 1, borderColor: theme.border.color }}
      >
        {TABS.map((tab) => (
          <PixiButton
            key={tab.id}
            label={tab.label}
            variant={activeTab === tab.id ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab(tab.id)}
            layout={{ flex: 1 }}
          />
        ))}
      </Div>

      {/* ── Tab content (scrollable) ─────────────────────────────────────── */}
      <Div className="flex-col gap-3" layout={{ padding: 8, overflow: 'scroll', flex: 1 }}>
        {/* ════════════════════════════════════════════════════════════════ */}
        {/*  MAIN TAB                                                      */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'main' && (
          <>
            {/* Pad name (editable) */}
            <Div className="flex-col gap-1">
              <Txt className="text-xs text-text-muted">Name</Txt>
              <PixiPureTextInput
                value={pad.name}
                onChange={(v) => handleUpdate({ name: v })}
                width={innerW}
                height={28}
                fontSize={12}
                font="sans"
              />
            </Div>

            {/* Level */}
            <PixiSlider
              label="Level"
              value={pad.level}
              min={0}
              max={127}
              step={1}
              showValue
              formatValue={(v) => String(Math.round(v))}
              onChange={(v) => handleUpdate({ level: Math.round(v) })}
              layout={{ width: innerW }}
            />

            {/* Tune */}
            <PixiSlider
              label="Tune"
              value={pad.tune}
              min={-120}
              max={120}
              step={1}
              showValue
              detent={0}
              detentRange={2}
              formatValue={formatTune}
              onChange={(v) => handleUpdate({ tune: Math.round(v) })}
              layout={{ width: innerW }}
            />

            {/* Pan */}
            <PixiSlider
              label="Pan"
              value={pad.pan}
              min={-64}
              max={63}
              step={1}
              showValue
              detent={0}
              detentRange={2}
              formatValue={formatPan}
              onChange={(v) => handleUpdate({ pan: Math.round(v) })}
              layout={{ width: innerW }}
            />

            {/* Output bus */}
            <Div className="flex-col gap-1">
              <Txt className="text-xs text-text-muted">Output Bus</Txt>
              <PixiSelect
                options={OUTPUT_OPTIONS}
                value={pad.output}
                onChange={(v) => handleUpdate({ output: v as OutputBus })}
                width={innerW}
              />
            </Div>

            {/* ── MPC section ──────────────────────────────────────────── */}
            <Div
              className="flex-col gap-3"
              layout={{
                borderTopWidth: 1,
                borderColor: theme.border.color,
                paddingTop: 8,
                marginTop: 4,
              }}
            >
              <Txt className="text-xs font-bold text-text-muted">MPC</Txt>

              <Div className="flex-row gap-3">
                <Div className="flex-col gap-1" layout={{ flex: 1 }}>
                  <Txt className="text-xs text-text-muted">Mute Group</Txt>
                  <PixiSelect
                    options={MUTE_GROUP_OPTIONS}
                    value={String(pad.muteGroup)}
                    onChange={(v) => handleUpdate({ muteGroup: parseInt(v) })}
                  />
                </Div>
                <Div className="flex-col gap-1" layout={{ flex: 1 }}>
                  <Txt className="text-xs text-text-muted">Play Mode</Txt>
                  <PixiSelect
                    options={PLAY_MODE_OPTIONS}
                    value={pad.playMode}
                    onChange={(v) => handleUpdate({ playMode: v as PlayMode })}
                  />
                </Div>
              </Div>

              <PixiCheckbox
                checked={pad.reverse}
                onChange={(checked) => handleUpdate({ reverse: checked })}
                label="Reverse"
              />

              <PixiSlider
                label="Sample Start"
                value={Math.round(pad.sampleStart * 100)}
                min={0}
                max={100}
                step={1}
                showValue
                formatValue={(v) => `${Math.round(v)}%`}
                onChange={(v) => handleUpdate({ sampleStart: Math.round(v) / 100 })}
                layout={{ width: innerW }}
              />

              <PixiSlider
                label="Sample End"
                value={Math.round(pad.sampleEnd * 100)}
                min={0}
                max={100}
                step={1}
                showValue
                formatValue={(v) => `${Math.round(v)}%`}
                onChange={(v) => handleUpdate({ sampleEnd: Math.round(v) / 100 })}
                layout={{ width: innerW }}
              />
            </Div>

            {/* Copy / Paste / Clear */}
            <Div className="flex-row gap-2" layout={{ marginTop: 4 }}>
              <PixiButton label="Copy" variant="default" size="sm" onClick={() => copyPad(padId)} layout={{ flex: 1 }} />
              <PixiButton
                label="Paste"
                variant="default"
                size="sm"
                disabled={!clipboardPad}
                onClick={() => pastePad(padId)}
                layout={{ flex: 1 }}
              />
            </Div>

            {/* MIDI Trigger */}
            <Div
              className="flex-col gap-2"
              layout={{
                borderTopWidth: 1,
                borderColor: theme.border.color,
                paddingTop: 8,
                marginTop: 4,
              }}
            >
              <Txt className="text-xs font-bold text-text-muted">MIDI TRIGGER</Txt>
              {midiMapping ? (
                <Div className="flex-row items-center gap-2">
                  <Txt className="text-sm font-mono text-text-primary">{`Note ${midiMapping.note}`}</Txt>
                  <PixiButton
                    label="Clear"
                    variant="ghost"
                    size="sm"
                    color="red"
                    onClick={() => clearMIDIMapping(String(padId))}
                  />
                </Div>
              ) : (
                <Txt className="text-xs text-text-muted">No MIDI note assigned</Txt>
              )}
              <PixiButton
                label={isLearning ? 'Hit a MIDI pad...' : 'MIDI Learn'}
                variant={isLearning ? 'primary' : 'default'}
                size="sm"
                onClick={handleMIDILearn}
                layout={{ width: innerW }}
              />
            </Div>

            <PixiButton
              label="Clear Pad"
              variant="danger"
              size="sm"
              onClick={() => clearPad(padId)}
              layout={{ width: innerW }}
            />
          </>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/*  ADSR TAB                                                      */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'adsr' && (
          <>
            <PixiSlider
              label="Attack"
              value={pad.attack}
              min={0}
              max={100}
              step={1}
              showValue
              formatValue={(v) => `${Math.round(v)}ms`}
              onChange={(v) => handleUpdate({ attack: Math.round(v) })}
              layout={{ width: innerW }}
            />

            <PixiSlider
              label="Decay"
              value={pad.decay}
              min={0}
              max={2000}
              step={1}
              showValue
              formatValue={(v) => `${Math.round(v)}ms`}
              onChange={(v) => handleUpdate({ decay: Math.round(v) })}
              layout={{ width: innerW }}
            />
            {/* Decay mode toggle */}
            <Div className="flex-row items-center gap-2">
              <Txt className="text-xs text-text-muted">Mode:</Txt>
              <PixiButton
                label="START"
                variant={pad.decayMode === 'start' ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => handleUpdate({ decayMode: 'start' })}
              />
              <PixiButton
                label="END"
                variant={pad.decayMode === 'end' ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => handleUpdate({ decayMode: 'end' })}
              />
            </Div>

            <PixiSlider
              label="Sustain"
              value={pad.sustain}
              min={0}
              max={100}
              step={1}
              showValue
              formatValue={(v) => `${Math.round(v)}%`}
              onChange={(v) => handleUpdate({ sustain: Math.round(v) })}
              layout={{ width: innerW }}
            />

            <PixiSlider
              label="Release"
              value={pad.release}
              min={0}
              max={5000}
              step={1}
              showValue
              formatValue={(v) => `${Math.round(v)}ms`}
              onChange={(v) => handleUpdate({ release: Math.round(v) })}
              layout={{ width: innerW }}
            />

            {/* ADSR visualization */}
            {adsrBars && (
              <Div
                layout={{
                  backgroundColor: theme.bgTertiary.color,
                  borderWidth: 1,
                  borderColor: theme.border.color,
                  borderRadius: 4,
                  padding: 10,
                  marginTop: 4,
                }}
                className="flex-col items-center"
              >
                <Txt className="text-xs text-text-muted">ENVELOPE SHAPE</Txt>
                <Div
                  className="flex-row items-end justify-center gap-2"
                  layout={{ height: MAX_BAR_H + 8, marginTop: 6 }}
                >
                  <Div layout={{ width: 24, height: adsrBars.attack, backgroundColor: ADSR_COLORS.attack, borderRadius: 2 }} />
                  <Div layout={{ width: 24, height: adsrBars.decay, backgroundColor: ADSR_COLORS.decay, borderRadius: 2 }} />
                  <Div layout={{ width: 24, height: adsrBars.sustain, backgroundColor: ADSR_COLORS.sustain, borderRadius: 2 }} />
                  <Div layout={{ width: 24, height: adsrBars.release, backgroundColor: ADSR_COLORS.release, borderRadius: 2 }} />
                </Div>
                <Div className="flex-row justify-center gap-2" layout={{ marginTop: 4 }}>
                  <Txt className="text-xs text-text-muted">A</Txt>
                  <Txt className="text-xs text-text-muted">D</Txt>
                  <Txt className="text-xs text-text-muted">S</Txt>
                  <Txt className="text-xs text-text-muted">R</Txt>
                </Div>
              </Div>
            )}
          </>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/*  FILTER TAB                                                    */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'filter' && (
          <>
            <Div className="flex-col gap-1">
              <Txt className="text-xs text-text-muted">Filter Type</Txt>
              <PixiSelect
                options={FILTER_TYPE_OPTIONS}
                value={pad.filterType}
                onChange={(v) => handleUpdate({ filterType: v as FilterType })}
                width={innerW}
              />
            </Div>

            {pad.filterType !== 'off' && (
              <>
                <PixiSlider
                  label="Cutoff"
                  value={pad.cutoff}
                  min={20}
                  max={20000}
                  step={1}
                  showValue
                  formatValue={(v) => `${Math.round(v)} Hz`}
                  onChange={(v) => handleUpdate({ cutoff: Math.round(v) })}
                  layout={{ width: innerW }}
                />

                <PixiSlider
                  label="Resonance"
                  value={pad.resonance}
                  min={0}
                  max={100}
                  step={1}
                  showValue
                  formatValue={(v) => `${Math.round(v)}%`}
                  onChange={(v) => handleUpdate({ resonance: Math.round(v) })}
                  layout={{ width: innerW }}
                />

                {/* Filter Envelope */}
                <Div
                  className="flex-col gap-3"
                  layout={{
                    borderTopWidth: 1,
                    borderColor: theme.border.color,
                    paddingTop: 8,
                    marginTop: 4,
                  }}
                >
                  <Txt className="text-xs font-bold text-text-muted">FILTER ENVELOPE</Txt>

                  <PixiSlider
                    label="Env Amount"
                    value={pad.filterEnvAmount}
                    min={0}
                    max={100}
                    step={1}
                    showValue
                    formatValue={(v) => `${Math.round(v)}%`}
                    onChange={(v) => handleUpdate({ filterEnvAmount: Math.round(v) })}
                    layout={{ width: innerW }}
                  />

                  {pad.filterEnvAmount > 0 && (
                    <>
                      <PixiSlider
                        label="F.Attack"
                        value={pad.filterAttack}
                        min={0}
                        max={100}
                        step={1}
                        showValue
                        formatValue={(v) => String(Math.round(v))}
                        onChange={(v) => handleUpdate({ filterAttack: Math.round(v) })}
                        layout={{ width: innerW }}
                      />

                      <PixiSlider
                        label="F.Decay"
                        value={pad.filterDecay}
                        min={0}
                        max={100}
                        step={1}
                        showValue
                        formatValue={(v) => String(Math.round(v))}
                        onChange={(v) => handleUpdate({ filterDecay: Math.round(v) })}
                        layout={{ width: innerW }}
                      />
                    </>
                  )}
                </Div>
              </>
            )}
          </>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/*  VELO TAB                                                      */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'velo' && (
          <>
            <Txt className="text-xs text-text-muted">
              Control how velocity affects each parameter. Higher values = more modulation.
            </Txt>

            <Div className="flex-col gap-1">
              <PixiSlider
                label="Velocity -> Level"
                value={pad.veloToLevel}
                min={0}
                max={100}
                step={1}
                showValue
                formatValue={(v) => `${Math.round(v)}%`}
                onChange={(v) => handleUpdate({ veloToLevel: Math.round(v) })}
                layout={{ width: innerW }}
              />
              <Txt className="text-xs text-text-muted">
                0% = fixed level, 100% = full velocity range
              </Txt>
            </Div>

            <Div className="flex-col gap-1">
              <PixiSlider
                label="Velocity -> Attack"
                value={pad.veloToAttack}
                min={0}
                max={100}
                step={1}
                showValue
                formatValue={(v) => `${Math.round(v)}%`}
                onChange={(v) => handleUpdate({ veloToAttack: Math.round(v) })}
                layout={{ width: innerW }}
              />
              <Txt className="text-xs text-text-muted">
                Soft hits get longer attack (transient softening)
              </Txt>
            </Div>

            <Div className="flex-col gap-1">
              <PixiSlider
                label="Velocity -> Start"
                value={pad.veloToStart}
                min={0}
                max={100}
                step={1}
                showValue
                formatValue={(v) => `${Math.round(v)}%`}
                onChange={(v) => handleUpdate({ veloToStart: Math.round(v) })}
                layout={{ width: innerW }}
              />
              <Txt className="text-xs text-text-muted">
                Soft hits start later in sample (skip transient)
              </Txt>
            </Div>

            <Div className="flex-col gap-1">
              <PixiSlider
                label="Velocity -> Filter"
                value={pad.veloToFilter}
                min={0}
                max={100}
                step={1}
                showValue
                formatValue={(v) => `${Math.round(v)}%`}
                onChange={(v) => handleUpdate({ veloToFilter: Math.round(v) })}
                layout={{ width: innerW }}
              />
              <Txt className="text-xs text-text-muted">
                Hard hits open the filter more
              </Txt>
            </Div>

            <Div className="flex-col gap-1">
              <PixiSlider
                label="Velocity -> Pitch"
                value={pad.veloToPitch}
                min={-100}
                max={100}
                step={1}
                showValue
                detent={0}
                detentRange={2}
                formatValue={(v) => `${Math.round(v)}%`}
                onChange={(v) => handleUpdate({ veloToPitch: Math.round(v) })}
                layout={{ width: innerW }}
              />
              <Txt className="text-xs text-text-muted">
                Velocity-driven pitch bend
              </Txt>
            </Div>
          </>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/*  LAYERS TAB                                                    */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'layers' && (
          <>
            <Txt className="text-xs text-text-muted">
              Velocity-sensitive sample switching.
            </Txt>

            {pad.layers.length === 0 ? (
              <Div
                className="flex-col items-center justify-center"
                layout={{
                  padding: 24,
                  borderWidth: 2,
                  borderColor: theme.border.color,
                  borderRadius: 4,
                }}
              >
                <Txt className="text-xs text-text-muted">No layers configured</Txt>
              </Div>
            ) : (
              <Div className="flex-col gap-2">
                {pad.layers.map((layer, idx) => (
                  <Div
                    key={idx}
                    className="flex-col gap-2"
                    layout={{
                      backgroundColor: theme.bgTertiary.color,
                      borderWidth: 1,
                      borderColor: theme.border.color,
                      borderRadius: 4,
                      padding: 8,
                    }}
                  >
                    <Div className="flex-row items-center justify-between">
                      <Txt className="text-sm text-text-primary">{layer.sample.name}</Txt>
                      <PixiButton
                        label="Remove"
                        variant="ghost"
                        size="sm"
                        color="red"
                        onClick={() => removeLayerFromPad(padId, idx)}
                      />
                    </Div>
                    <Div className="flex-row gap-3">
                      <Div className="flex-col gap-1" layout={{ flex: 1 }}>
                        <PixiSlider
                          label="Vel Min"
                          value={layer.velocityRange[0]}
                          min={0}
                          max={127}
                          step={1}
                          showValue
                          formatValue={(v) => String(Math.round(v))}
                          onChange={(v) =>
                            updateLayerOnPad(padId, idx, {
                              velocityRange: [Math.round(v), layer.velocityRange[1]],
                            })
                          }
                        />
                      </Div>
                      <Div className="flex-col gap-1" layout={{ flex: 1 }}>
                        <PixiSlider
                          label="Vel Max"
                          value={layer.velocityRange[1]}
                          min={0}
                          max={127}
                          step={1}
                          showValue
                          formatValue={(v) => String(Math.round(v))}
                          onChange={(v) =>
                            updateLayerOnPad(padId, idx, {
                              velocityRange: [layer.velocityRange[0], Math.round(v)],
                            })
                          }
                        />
                      </Div>
                    </Div>
                    <Div className="flex-col gap-1">
                      <PixiSlider
                          label="Level"
                          value={layer.levelOffset}
                          min={-24}
                          max={24}
                          step={1}
                          showValue
                          detent={0}
                          detentRange={1}
                          formatValue={(v) => `${Math.round(v)}dB`}
                          onChange={(v) =>
                            updateLayerOnPad(padId, idx, { levelOffset: Math.round(v) })
                          }
                        />
                    </Div>
                  </Div>
                ))}
              </Div>
            )}

            <PixiButton
              label="+ Add Layer (from file)"
              variant="primary"
              size="sm"
              onClick={handleAddLayerFromFile}
              layout={{ width: innerW }}
            />
          </>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/*  DJ TAB                                                        */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'dj' && (
          <>
            <Txt className="text-xs text-text-muted">
              Assign a DJ scratch action to this pad. It fires on every hit, in addition to any loaded sample.
            </Txt>

            <Div className="flex-col gap-1">
              <Txt className="text-xs text-text-muted">Scratch / Fader Action</Txt>
              <PixiSelect
                options={SCRATCH_ACTION_OPTIONS}
                value={pad.scratchAction ?? ''}
                onChange={(v) =>
                  handleUpdate({
                    scratchAction: (v as ScratchActionId) || undefined,
                  })
                }
                width={innerW}
              />
            </Div>

            {pad.scratchAction ? (
              <Div
                className="flex-col gap-1"
                layout={{
                  backgroundColor: theme.bgTertiary.color,
                  borderWidth: 1,
                  borderColor: theme.border.color,
                  borderRadius: 4,
                  padding: 8,
                }}
              >
                <Txt className="text-xs text-text-muted">Active action:</Txt>
                <Txt className="text-xs text-text-primary">
                  {SCRATCH_ACTION_OPTIONS.find((o) => o.value === pad.scratchAction)?.label ??
                    pad.scratchAction}
                </Txt>
                <Txt className="text-xs text-text-muted">
                  Targets the active playing DJ deck (prefers A over B).
                </Txt>
              </Div>
            ) : (
              <Div
                layout={{
                  backgroundColor: theme.bgTertiary.color,
                  borderWidth: 1,
                  borderColor: theme.border.color,
                  borderRadius: 4,
                  padding: 8,
                }}
              >
                <Txt className="text-xs text-text-muted">
                  No DJ action assigned. This pad will only trigger its sample (if loaded).
                </Txt>
              </Div>
            )}
          </>
        )}
      </Div>
    </Div>
  );
};
