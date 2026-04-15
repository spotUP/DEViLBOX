/**
 * PadEditor - Detailed pad parameter editor with tabs
 */

import React, { useState, useCallback, useMemo, useEffect, useRef, Suspense, lazy } from 'react';
import type { DrumPad, FilterType, OutputBus, ScratchActionId, VelocityCurve, SampleData } from '../../types/drumpad';
import type { DjFxActionId } from '../../engine/drumpad/DjFxActions';
import { DJ_FX_ACTIONS } from '../../engine/drumpad/DjFxActions';
import { PAD_INSTRUMENT_BASE } from '../../types/drumpad';
import type { InstrumentConfig } from '../../types/instrument/defaults';
import { DEFAULT_DECTALK } from '../../types/instrument/defaults';
import { DEFAULT_SAM } from '../../types/instrument/defaults';
import { DEFAULT_V2_SPEECH } from '../../types/instrument/defaults';
import type { SynthType } from '../../types/instrument/base';
import { useDrumPadStore } from '../../stores/useDrumPadStore';
import { getToneEngine } from '../../engine/ToneEngine';
import { getDevilboxAudioContext } from '@utils/audio-context';
import { SamplePackBrowser } from '../instruments/SamplePackBrowser';
import { getMIDIManager } from '../../midi/MIDIManager';
import { CustomSelect } from '@components/common/CustomSelect';
import { SYNTH_CATEGORIES } from '@constants/synthCategories';
import type { MIDIMessage } from '../../midi/types';

// Lazy-load the full synth editor — same one used by the instrument editor
const UnifiedInstrumentEditor = lazy(() => import('../instruments/editors/UnifiedInstrumentEditor'));

const SPEECH_SYNTH_TYPES = new Set(['Sam', 'DECtalk', 'PinkTrombone', 'V2Speech']);

const VELOCITY_CURVE_OPTIONS: { value: VelocityCurve; label: string; desc: string }[] = [
  { value: 'linear',      label: 'Linear',      desc: 'Default — velocity maps directly' },
  { value: 'exponential',  label: 'Exponential',  desc: 'Soft touch, hard hits for max' },
  { value: 'logarithmic',  label: 'Logarithmic',  desc: 'Reaches loud quickly' },
  { value: 'scurve',       label: 'S-Curve',       desc: 'Subtle extremes, steep middle' },
  { value: 'fixed',        label: 'Fixed (Max)',   desc: 'Always max velocity' },
];

const PAD_COLOR_PRESETS = [
  '#10b981', '#3b82f6', '#ef4444', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
];

/** Get speech text from a synth config */
function getSpeechText(config: InstrumentConfig): string | undefined {
  if (config.synthType === 'Sam') return (config as any).sam?.text;
  if (config.synthType === 'DECtalk') return (config as any).dectalk?.text;
  if (config.synthType === 'PinkTrombone') return (config as any).pinkTrombone?.text;
  if (config.synthType === 'V2Speech') return (config as any).v2Speech?.text;
  return undefined;
}

/** Set speech text on a synth config (mutates) */
function setSpeechTextField(config: InstrumentConfig, synthType: string, text: string): void {
  if (synthType === 'Sam') (config as any).sam = { ...(config as any).sam, text };
  else if (synthType === 'DECtalk') (config as any).dectalk = { ...(config as any).dectalk, text };
  else if (synthType === 'PinkTrombone') (config as any).pinkTrombone = { ...(config as any).pinkTrombone, text };
  else if (synthType === 'V2Speech') (config as any).v2Speech = { ...(config as any).v2Speech, text };
}

interface PadEditorProps {
  padId: number;
  onClose?: () => void;
  initialTab?: TabName;
  initialShowSampleBrowser?: boolean;
}

type TabName = 'sound' | 'main' | 'envelope' | 'velo' | 'layers' | 'dj';

// Must be higher than the modal overlay z-index (99990) so dropdown menus render above it
const MODAL_DROPDOWN_Z = 100000;


const SCRATCH_ACTION_OPTIONS: { value: ScratchActionId | ''; label: string }[] = [
  { value: '',                label: 'None' },
  // Basic patterns
  { value: 'scratch_baby',   label: 'Baby Scratch' },
  { value: 'scratch_trans',  label: 'Transformer' },
  { value: 'scratch_flare',  label: 'Flare' },
  { value: 'scratch_hydro',  label: 'Hydroplane' },
  { value: 'scratch_crab',   label: 'Crab' },
  { value: 'scratch_orbit',  label: 'Orbit' },
  // Extended patterns
  { value: 'scratch_chirp',  label: 'Chirp' },
  { value: 'scratch_stab',   label: 'Stab' },
  { value: 'scratch_scribble', label: 'Scribble' },
  { value: 'scratch_tear',   label: 'Tear' },
  // Advanced patterns
  { value: 'scratch_uzi',    label: 'Uzi' },
  { value: 'scratch_twiddle', label: 'Twiddle' },
  { value: 'scratch_8crab',  label: '8-Finger Crab' },
  { value: 'scratch_3flare', label: '3-Click Flare' },
  { value: 'scratch_laser',  label: 'Laser' },
  { value: 'scratch_phaser', label: 'Phaser' },
  { value: 'scratch_tweak',  label: 'Tweak' },
  { value: 'scratch_drag',   label: 'Drag' },
  { value: 'scratch_vibrato', label: 'Vibrato' },
  // Control
  { value: 'scratch_stop',   label: 'Stop Scratch' },
  { value: 'fader_lfo_off',        label: 'Fader LFO: Off' },
  { value: 'fader_lfo_1_4',         label: 'Fader LFO: ¼' },
  { value: 'fader_lfo_1_8',         label: 'Fader LFO: ⅛' },
  { value: 'fader_lfo_1_16',        label: 'Fader LFO: ⅟₁₆' },
  { value: 'fader_lfo_1_32',        label: 'Fader LFO: ⅟₃₂' },
];

const DJ_FX_OPTIONS: { value: DjFxActionId | ''; label: string; category: string }[] = [
  { value: '', label: 'None', category: '' },
  ...DJ_FX_ACTIONS.map(a => ({ value: a.id, label: a.name, category: a.category })),
];

const FX_CATEGORY_LABELS: Record<string, string> = {
  stutter: 'Stutter',
  delay: 'Delay / Echo',
  filter: 'Filter',
  reverb: 'Reverb',
  modulation: 'Modulation',
  distortion: 'Distortion',
  tape: 'Tape / Vinyl',
  oneshot: 'One-Shot Sounds',
};

export const PadEditor: React.FC<PadEditorProps> = ({ padId, onClose, initialTab = 'sound', initialShowSampleBrowser = false }) => {
  const [activeTab, setActiveTab] = useState<TabName>(initialTab);
  const [isLearning, setIsLearning] = useState(false);
  const [showLayerBrowser, setShowLayerBrowser] = useState(false);
  const [showSampleBrowser, setShowSampleBrowser] = useState(initialShowSampleBrowser);
  const learningRef = useRef(false);

  const {
    programs, currentProgramId, updatePad, clearPad,
    midiMappings, setMIDIMapping, clearMIDIMapping,
    addLayerToPad, removeLayerFromPad, updateLayerOnPad,
    clipboardPad, copyPad, pastePad, loadSampleToPad,
  } = useDrumPadStore();
  const currentProgram = programs.get(currentProgramId);
  const pad = currentProgram?.pads.find(p => p.id === padId);

  // MIDI mapping for this pad
  const midiMapping = midiMappings[String(padId)];

  const handleUpdate = useCallback((updates: Partial<DrumPad>) => {
    updatePad(padId, updates);
  }, [padId, updatePad]);

  // Preview: hold-to-sustain — press triggers, release stops
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const previewInstRef = useRef<{ instId: number; note: string; config: InstrumentConfig } | null>(null);

  const handlePreviewDown = useCallback(() => {
    if (!pad) return;
    const ctx = getDevilboxAudioContext();

    // Sample preview
    if (pad.sample?.audioBuffer) {
      try { previewSourceRef.current?.stop(); } catch { /* ignore */ }
      const src = ctx.createBufferSource();
      src.buffer = pad.sample.audioBuffer;
      if (pad.tune !== 0) {
        src.playbackRate.value = Math.pow(2, (pad.tune / 10) / 12);
      }
      src.connect(ctx.destination);
      src.start(ctx.currentTime);
      previewSourceRef.current = src;
    }

    // Synth preview
    if (pad.synthConfig || pad.instrumentId != null) {
      try {
        const engine = getToneEngine();
        const note = pad.instrumentNote || 'C4';
        let instId: number;
        let config: InstrumentConfig;
        if (pad.synthConfig) {
          instId = PAD_INSTRUMENT_BASE + pad.id;
          config = { ...pad.synthConfig, id: instId } as InstrumentConfig;
        } else {
          instId = pad.instrumentId!;
          config = { id: instId } as InstrumentConfig;
        }
        engine.triggerNoteAttack(instId, note, 0, 0.8, config);
        previewInstRef.current = { instId, note, config };
      } catch { /* ignore synth errors */ }
    }
  }, [pad]);

  const handlePreviewUp = useCallback(() => {
    // Stop sample
    try { previewSourceRef.current?.stop(); } catch { /* ignore */ }
    previewSourceRef.current = null;

    // Release synth note
    const inst = previewInstRef.current;
    if (inst) {
      try { getToneEngine().triggerNoteRelease(inst.instId, inst.note, 0, inst.config); } catch { /* ignore */ }
      previewInstRef.current = null;
    }
  }, []);

  // MIDI Learn handler
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

    // Auto-cancel after 10 seconds
    setTimeout(() => {
      if (learningRef.current) {
        setIsLearning(false);
        learningRef.current = false;
        manager.removeMessageHandler(handler);
      }
    }, 10000);
  }, [isLearning, padId, setMIDIMapping]);

  // Cleanup MIDI handler on unmount
  useEffect(() => {
    return () => { learningRef.current = false; };
  }, []);

  // Memoize ADSR visualization calculations for performance
  const adsrVisualization = useMemo(() => {
    if (!pad) return null;

    return (
      <div className="mt-6 p-4 bg-dark-surface border border-dark-border rounded">
        <div className="text-xs text-text-muted mb-2 text-center">ENVELOPE SHAPE</div>
        <div className="h-24 flex items-end justify-around">
          <div className="flex items-end space-x-1">
            <div
              className="w-8 bg-accent-primary"
              style={{ height: `${(pad.attack / 100) * 100}%` }}
              title="Attack"
            />
            <div
              className="w-8 bg-accent-secondary"
              style={{ height: `${(pad.decay / 2000) * 100}%` }}
              title="Decay"
            />
            <div
              className="w-8 bg-accent-success"
              style={{ height: `${pad.sustain}%` }}
              title="Sustain"
            />
            <div
              className="w-8 bg-accent-highlight"
              style={{ height: `${(pad.release / 5000) * 100}%` }}
              title="Release"
            />
          </div>
        </div>
      </div>
    );
  }, [pad?.attack, pad?.decay, pad?.sustain, pad?.release]);

  if (!pad) {
    return (
      <div className="p-4 text-text-muted text-center">
        Pad {padId} not found
      </div>
    );
  }

  const tabs: { id: TabName; label: string }[] = [
    { id: 'sound', label: 'Sound' },
    { id: 'main', label: 'Main' },
    { id: 'envelope', label: 'Envelope' },
    { id: 'velo', label: 'Velocity' },
    { id: 'layers', label: 'Layers' },
    { id: 'dj', label: 'DJ FX' },
  ];

  return (
    <div className="bg-dark-bg border border-dark-border rounded-lg overflow-hidden flex flex-col max-h-[95vh]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
        <div>
          <div className="text-sm font-bold text-text-primary">Pad {pad.id}: {pad.name}</div>
          <div className="text-xs text-text-muted">
            {pad.sample && pad.instrumentId != null
              ? 'Sample + Instrument'
              : pad.sample
                ? 'Sample loaded'
                : pad.instrumentId != null
                  ? `Instrument #${pad.instrumentId}`
                  : 'Empty — assign sample or instrument'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onMouseDown={handlePreviewDown}
            onMouseUp={handlePreviewUp}
            onMouseLeave={handlePreviewUp}
            disabled={!pad.sample && !pad.synthConfig && pad.instrumentId == null}
            className={`px-2 py-1 text-[10px] font-mono rounded transition-colors select-none ${
              pad.sample || pad.synthConfig || pad.instrumentId != null
                ? 'text-accent-primary hover:text-accent-primaryHover bg-dark-surface border border-accent-primary/30 active:bg-accent-primary/20'
                : 'text-text-muted/30 bg-dark-surface/50 border border-dark-border/50 cursor-not-allowed'
            }`}
            title="Hold to preview pad sound"
          >
            ▶ Preview
          </button>
          <button
            onClick={() => copyPad(padId)}
            className="px-2 py-1 text-[10px] font-mono text-text-muted hover:text-text-primary bg-dark-surface border border-dark-border rounded transition-colors"
            title="Copy pad settings"
          >
            Copy
          </button>
          <button
            onClick={() => pastePad(padId)}
            disabled={!clipboardPad}
            className={`px-2 py-1 text-[10px] font-mono rounded transition-colors ${
              clipboardPad
                ? 'text-text-muted hover:text-text-primary bg-dark-surface border border-dark-border'
                : 'text-text-muted/30 bg-dark-surface/50 border border-dark-border/50 cursor-not-allowed'
            }`}
            title={clipboardPad ? `Paste from Pad ${clipboardPad.id}` : 'Nothing to paste'}
          >
            Paste
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="text-xs text-text-muted hover:text-text-primary"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-dark-border">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex-1 px-3 py-2 text-xs font-mono font-bold transition-colors
              ${activeTab === tab.id
                ? 'text-accent-primary border-b-2 border-accent-primary bg-dark-bg'
                : 'text-text-muted hover:text-text-primary border-b-2 border-transparent'
              }
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-4 overflow-y-auto flex-1 min-h-0">
        {activeTab === 'sound' && (
          <div className="space-y-4">
            {/* Synth Type Picker */}
            <div className="border border-dark-border rounded-lg p-3 space-y-3">
              <div className="text-[10px] font-mono text-text-muted uppercase tracking-wider">Sound Source</div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Synth Type</label>
                <CustomSelect
                  value={pad.synthConfig?.synthType ?? ''}
                  onChange={(val) => {
                    const padInstId = PAD_INSTRUMENT_BASE + pad.id;
                    // Dispose cached synth so new type/config gets fresh instance
                    try { getToneEngine().disposeInstrument(padInstId); } catch {}
                    if (val === '') {
                      handleUpdate({ synthConfig: undefined, instrumentId: undefined, instrumentNote: undefined });
                    } else {
                      const synthType = val as SynthType;
                      // Auto-update name if it's still the default or matches the old synth type
                      const oldSynthType = pad.synthConfig?.synthType;
                      const isDefaultName = pad.name === `Pad ${pad.id}` || pad.name === oldSynthType || pad.name === '';
                      const newName = isDefaultName ? val : pad.name;
                      const newConfig: InstrumentConfig = {
                        id: padInstId,
                        name: newName,
                        type: 'synth',
                        synthType,
                        effects: [],
                        volume: 0,
                        pan: 0,
                      };
                      // Populate speech defaults so controls work immediately
                      if (synthType === 'DECtalk') (newConfig as any).dectalk = { ...DEFAULT_DECTALK };
                      else if (synthType === 'Sam') (newConfig as any).sam = { ...DEFAULT_SAM };
                      else if (synthType === 'V2Speech') (newConfig as any).v2Speech = { ...DEFAULT_V2_SPEECH };
                      if (SPEECH_SYNTH_TYPES.has(synthType) && pad.synthConfig) {
                        const oldText = getSpeechText(pad.synthConfig);
                        if (oldText) setSpeechTextField(newConfig, synthType, oldText);
                      }
                      handleUpdate({
                        synthConfig: newConfig,
                        instrumentId: undefined,
                        instrumentNote: pad.instrumentNote || 'C4',
                        name: newName,
                      });
                    }
                  }}
                  options={[
                    { value: '', label: 'None' },
                    ...SYNTH_CATEGORIES.map(cat => ({
                      label: cat.name,
                      options: cat.synths.map(s => ({
                        value: s.type,
                        label: s.name,
                      })),
                    })),
                  ]}
                  className="w-full bg-dark-surface border border-dark-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary font-mono"
                zIndex={MODAL_DROPDOWN_Z}
                />
              </div>

              {/* Trigger Note */}
              {(pad.synthConfig || pad.instrumentId != null) && (
                <div>
                  <label className="block text-xs text-text-muted mb-1">Trigger Note</label>
                  <CustomSelect
                    value={pad.instrumentNote || 'C4'}
                    onChange={(v) => handleUpdate({ instrumentNote: v })}
                    options={(() => {
                      const notes: { value: string; label: string }[] = [];
                      const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
                      for (let oct = 1; oct <= 7; oct++) {
                        for (const n of noteNames) {
                          const note = `${n}${oct}`;
                          notes.push({ value: note, label: note });
                        }
                      }
                      return notes;
                    })()}
                    className="w-full bg-dark-surface border border-dark-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary font-mono"
                  zIndex={MODAL_DROPDOWN_Z}
                  />
                </div>
              )}
            </div>

            {/* Sample loader */}
            <div className="border border-dark-border rounded-lg p-3 space-y-3">
              <div className="text-[10px] font-mono text-text-muted uppercase tracking-wider">Sample</div>
              {pad.sample ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 text-xs text-text-primary font-mono truncate">{pad.sample.name}</div>
                  <button
                    onClick={() => setShowSampleBrowser(true)}
                    className="px-2 py-1 text-[10px] font-mono text-text-muted hover:text-text-primary bg-dark-surface border border-dark-border rounded"
                  >
                    Replace
                  </button>
                  <button
                    onClick={() => handleUpdate({ sample: null as any })}
                    className="px-2 py-1 text-[10px] font-mono text-red-400 hover:text-red-300 bg-dark-surface border border-dark-border rounded"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowSampleBrowser(true)}
                    className="flex-1 px-3 py-2 text-xs font-mono text-text-muted hover:text-text-primary bg-dark-surface border border-dark-border rounded transition-colors"
                  >
                    Browse Sample Packs...
                  </button>
                  <label className="px-3 py-2 text-xs font-mono text-text-muted hover:text-text-primary bg-dark-surface border border-dark-border rounded transition-colors cursor-pointer">
                    Upload File...
                    <input type="file" accept="audio/*" className="hidden" onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const arrayBuf = await file.arrayBuffer();
                      const audioBuffer = await getDevilboxAudioContext().decodeAudioData(arrayBuf);
                      const sample: SampleData = {
                        id: `upload-${Date.now()}`,
                        name: file.name.replace(/\.[^.]+$/, ''),
                        audioBuffer,
                        duration: audioBuffer.duration,
                        sampleRate: audioBuffer.sampleRate,
                      };
                      loadSampleToPad(padId, sample);
                      e.target.value = '';
                    }} />
                  </label>
                </div>
              )}
            </div>

            {showSampleBrowser && (
              <SamplePackBrowser
                mode="drumpad"
                onSelectSample={(sample) => {
                  loadSampleToPad(padId, sample);
                  setShowSampleBrowser(false);
                }}
                onClose={() => setShowSampleBrowser(false)}
              />
            )}

            {/* Embed the real synth editor — same UI as the instrument editor, but isolated to this pad */}
            {pad.synthConfig && (
              <Suspense fallback={<div className="p-4 text-text-muted text-xs font-mono">Loading synth editor...</div>}>
                <UnifiedInstrumentEditor
                  instrument={{ ...pad.synthConfig, id: PAD_INSTRUMENT_BASE + pad.id }}
                  onChange={(updates) => {
                    const padInstId = PAD_INSTRUMENT_BASE + pad.id;
                    try { getToneEngine().disposeInstrument(padInstId); } catch {}
                    handleUpdate({
                      synthConfig: { ...pad.synthConfig!, ...updates },
                      ...(updates.name ? { name: updates.name } : {}),
                    });
                  }}
                />
              </Suspense>
            )}

          </div>
        )}

        {activeTab === 'main' && (
          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-xs text-text-muted mb-1">Name</label>
              <input
                type="text"
                value={pad.name}
                onChange={(e) => handleUpdate({ name: e.target.value })}
                className="w-full bg-dark-surface border border-dark-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
              />
            </div>

            {/* Level / Tune / Pan — 3-column grid */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-text-muted mb-1">Level: {pad.level}</label>
                <input type="range" min="0" max="127" value={pad.level}
                  onChange={(e) => handleUpdate({ level: parseInt(e.target.value) })}
                  className="w-full" />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">
                  Tune: {pad.tune > 0 ? '+' : ''}{(pad.tune / 10).toFixed(1)} st
                </label>
                <input type="range" min="-120" max="120" value={pad.tune}
                  onChange={(e) => handleUpdate({ tune: parseInt(e.target.value) })}
                  className="w-full" />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">
                  Pan: {pad.pan === 0 ? 'C' : pad.pan > 0 ? `R${pad.pan}` : `L${-pad.pan}`}
                </label>
                <input type="range" min="-64" max="63" value={pad.pan}
                  onChange={(e) => handleUpdate({ pan: parseInt(e.target.value) })}
                  className="w-full" />
              </div>
            </div>

            {/* MPC Controls — 2-column grid */}
            <div className="border-t border-dark-border pt-3">
              <div className="text-[10px] font-mono text-text-muted mb-2 uppercase">MPC</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-muted mb-1">Mute Group</label>
                  <CustomSelect
                    value={String(pad.muteGroup)}
                    onChange={(v) => handleUpdate({ muteGroup: parseInt(v) })}
                    options={[
                      { value: '0', label: 'Off' },
                      ...[1,2,3,4,5,6,7,8].map(g => ({ value: String(g), label: `Group ${g}` })),
                    ]}
                    className="w-full bg-dark-surface border border-dark-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
                  zIndex={MODAL_DROPDOWN_Z}
                  />
                </div>
              </div>

              <div className="mt-3 flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
                  <input type="checkbox" checked={pad.reverse}
                    onChange={(e) => handleUpdate({ reverse: e.target.checked })}
                    className="rounded border-dark-border bg-dark-surface text-accent-primary focus:ring-accent-primary" />
                  Reverse
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="block text-xs text-text-muted mb-1">
                    Start: {Math.round(pad.sampleStart * 100)}%
                  </label>
                  <input type="range" min="0" max="100" value={Math.round(pad.sampleStart * 100)}
                    onChange={(e) => handleUpdate({ sampleStart: parseInt(e.target.value) / 100 })}
                    className="w-full" />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">
                    End: {Math.round(pad.sampleEnd * 100)}%
                  </label>
                  <input type="range" min="0" max="100" value={Math.round(pad.sampleEnd * 100)}
                    onChange={(e) => handleUpdate({ sampleEnd: parseInt(e.target.value) / 100 })}
                    className="w-full" />
                </div>
              </div>
            </div>

            {/* Output + Velocity Curve — 2-column grid */}
            <div className="grid grid-cols-2 gap-3 border-t border-dark-border pt-3">
              <div>
                <label className="block text-xs text-text-muted mb-1">Output Bus</label>
                <CustomSelect
                  value={pad.output}
                  onChange={(v) => handleUpdate({ output: v as OutputBus })}
                  options={[
                    { value: 'stereo', label: 'Stereo Mix' },
                    { value: 'out1', label: 'Output 1' },
                    { value: 'out2', label: 'Output 2' },
                    { value: 'out3', label: 'Output 3' },
                    { value: 'out4', label: 'Output 4' },
                  ]}
                  className="w-full bg-dark-surface border border-dark-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
                zIndex={MODAL_DROPDOWN_Z}
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Velocity Curve</label>
                <CustomSelect
                  value={pad.velocityCurve || 'linear'}
                  onChange={(v) => handleUpdate({ velocityCurve: v as VelocityCurve })}
                  options={VELOCITY_CURVE_OPTIONS.map(opt => ({
                    value: opt.value,
                    label: opt.label,
                  }))}
                  className="w-full bg-dark-surface border border-dark-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary font-mono"
                zIndex={MODAL_DROPDOWN_Z}
                />
              </div>
            </div>

            {/* Color */}
            <div className="border-t border-dark-border pt-3">
              <label className="block text-xs text-text-muted mb-1">Pad Color</label>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => handleUpdate({ color: undefined })}
                  className={`w-6 h-6 rounded border-2 transition-all ${
                    !pad.color ? 'border-white ring-1 ring-white/50' : 'border-dark-border'
                  }`}
                  style={{ background: 'linear-gradient(135deg, #10b981 50%, #3b82f6 50%)' }}
                  title="Default (auto)"
                />
                {PAD_COLOR_PRESETS.map(color => (
                  <button
                    key={color}
                    onClick={() => handleUpdate({ color })}
                    className={`w-6 h-6 rounded border-2 transition-all ${
                      pad.color === color ? 'border-white ring-1 ring-white/50 scale-110' : 'border-dark-border'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
                <input type="color" value={pad.color || '#10b981'}
                  onChange={(e) => handleUpdate({ color: e.target.value })}
                  className="w-6 h-6 rounded border border-dark-border cursor-pointer"
                  title="Custom color" />
              </div>
            </div>

            {/* MIDI Trigger */}
            <div className="border-t border-dark-border pt-3">
              <label className="block text-xs text-text-muted mb-1">MIDI Trigger</label>
              <div className="flex items-center gap-3">
                {midiMapping ? (
                  <>
                    <span className="text-sm text-text-primary font-mono">Note {midiMapping.note}</span>
                    <button onClick={() => clearMIDIMapping(String(padId))}
                      className="text-xs text-accent-error hover:text-accent-error/80">Clear</button>
                  </>
                ) : (
                  <span className="text-xs text-text-muted">No MIDI note assigned</span>
                )}
                <button onClick={handleMIDILearn}
                  className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${
                    isLearning
                      ? 'animate-pulse bg-accent-warning text-text-primary'
                      : 'bg-dark-surface border border-dark-border text-text-muted hover:text-text-primary'
                  }`}>
                  {isLearning ? 'Hit a MIDI pad...' : 'MIDI Learn'}
                </button>
              </div>
            </div>

            {/* Clear */}
            <button onClick={() => clearPad(padId)}
              className="w-full px-4 py-2 bg-accent-error hover:bg-accent-error/80 text-text-primary text-xs font-bold rounded transition-colors">
              Clear Pad
            </button>
          </div>
        )}

        {activeTab === 'envelope' && (
          <div className="space-y-4">
            {/* ADSR */}
            <div className="text-[10px] font-mono text-text-muted uppercase tracking-wider">Amp Envelope</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-muted mb-1">Attack: {pad.attack}ms</label>
                <input type="range" min="0" max="100" value={pad.attack}
                  onChange={(e) => handleUpdate({ attack: parseInt(e.target.value) })} className="w-full" />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Decay: {pad.decay}ms</label>
                <input type="range" min="0" max="2000" value={pad.decay}
                  onChange={(e) => handleUpdate({ decay: parseInt(e.target.value) })} className="w-full" />
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-text-muted">Mode:</span>
                  <button onClick={() => handleUpdate({ decayMode: 'start' })}
                    className={`px-2 py-0.5 text-[10px] font-mono rounded ${
                      pad.decayMode === 'start' ? 'bg-accent-primary text-text-primary' : 'bg-dark-surface text-text-muted'
                    }`}>START</button>
                  <button onClick={() => handleUpdate({ decayMode: 'end' })}
                    className={`px-2 py-0.5 text-[10px] font-mono rounded ${
                      pad.decayMode === 'end' ? 'bg-accent-primary text-text-primary' : 'bg-dark-surface text-text-muted'
                    }`}>END</button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Sustain: {pad.sustain}%</label>
                <input type="range" min="0" max="100" value={pad.sustain}
                  onChange={(e) => handleUpdate({ sustain: parseInt(e.target.value) })} className="w-full" />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Release: {pad.release}ms</label>
                <input type="range" min="0" max="5000" value={pad.release}
                  onChange={(e) => handleUpdate({ release: parseInt(e.target.value) })} className="w-full" />
              </div>
            </div>

            {adsrVisualization}

            {/* Filter */}
            <div className="border-t border-dark-border pt-3">
              <div className="text-[10px] font-mono text-text-muted mb-2 uppercase tracking-wider">Filter</div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Filter Type</label>
                <CustomSelect
                  value={pad.filterType}
                  onChange={(v) => handleUpdate({ filterType: v as FilterType })}
                  options={[
                    { value: 'off', label: 'Off' },
                    { value: 'lpf', label: 'Low Pass' },
                    { value: 'hpf', label: 'High Pass' },
                    { value: 'bpf', label: 'Band Pass' },
                  ]}
                  className="w-full bg-dark-surface border border-dark-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
                zIndex={MODAL_DROPDOWN_Z}
                />
              </div>

              {pad.filterType !== 'off' && (
                <div className="space-y-3 mt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-text-muted mb-1">Cutoff: {pad.cutoff}Hz</label>
                      <input type="range" min="20" max="20000" value={pad.cutoff}
                        onChange={(e) => handleUpdate({ cutoff: parseInt(e.target.value) })} className="w-full" />
                    </div>
                    <div>
                      <label className="block text-xs text-text-muted mb-1">Resonance: {pad.resonance}%</label>
                      <input type="range" min="0" max="100" value={pad.resonance}
                        onChange={(e) => handleUpdate({ resonance: parseInt(e.target.value) })} className="w-full" />
                    </div>
                  </div>

                  {/* Filter Envelope */}
                  <div className="border-t border-dark-border pt-3">
                    <div className="text-[10px] font-mono text-text-muted mb-2 uppercase">Filter Envelope</div>
                    <div>
                      <label className="block text-xs text-text-muted mb-1">Env Amount: {pad.filterEnvAmount}%</label>
                      <input type="range" min="0" max="100" value={pad.filterEnvAmount}
                        onChange={(e) => handleUpdate({ filterEnvAmount: parseInt(e.target.value) })} className="w-full" />
                    </div>
                    {pad.filterEnvAmount > 0 && (
                      <div className="grid grid-cols-2 gap-3 mt-2">
                        <div>
                          <label className="block text-xs text-text-muted mb-1">F.Attack: {pad.filterAttack}</label>
                          <input type="range" min="0" max="100" value={pad.filterAttack}
                            onChange={(e) => handleUpdate({ filterAttack: parseInt(e.target.value) })} className="w-full" />
                        </div>
                        <div>
                          <label className="block text-xs text-text-muted mb-1">F.Decay: {pad.filterDecay}</label>
                          <input type="range" min="0" max="100" value={pad.filterDecay}
                            onChange={(e) => handleUpdate({ filterDecay: parseInt(e.target.value) })} className="w-full" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'velo' && (
          <div className="space-y-4">
            <div className="text-xs text-text-muted">
              Control how velocity affects each parameter. Higher values = more modulation.
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">
                Velocity → Level: {pad.veloToLevel}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={pad.veloToLevel}
                onChange={(e) => handleUpdate({ veloToLevel: parseInt(e.target.value) })}
                className="w-full"
              />
              <div className="text-[10px] text-text-muted">0% = fixed level, 100% = full velocity range</div>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">
                Velocity → Attack: {pad.veloToAttack}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={pad.veloToAttack}
                onChange={(e) => handleUpdate({ veloToAttack: parseInt(e.target.value) })}
                className="w-full"
              />
              <div className="text-[10px] text-text-muted">Soft hits get longer attack (transient softening)</div>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">
                Velocity → Start: {pad.veloToStart}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={pad.veloToStart}
                onChange={(e) => handleUpdate({ veloToStart: parseInt(e.target.value) })}
                className="w-full"
              />
              <div className="text-[10px] text-text-muted">Soft hits start later in sample (skip transient)</div>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">
                Velocity → Filter: {pad.veloToFilter}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={pad.veloToFilter}
                onChange={(e) => handleUpdate({ veloToFilter: parseInt(e.target.value) })}
                className="w-full"
              />
              <div className="text-[10px] text-text-muted">Hard hits open the filter more</div>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">
                Velocity → Pitch: {pad.veloToPitch}%
              </label>
              <input
                type="range"
                min="-100"
                max="100"
                value={pad.veloToPitch}
                onChange={(e) => handleUpdate({ veloToPitch: parseInt(e.target.value) })}
                className="w-full"
              />
              <div className="text-[10px] text-text-muted">Velocity-driven pitch bend</div>
            </div>
          </div>
        )}

        {activeTab === 'layers' && (
          <div className="space-y-4">
            <div className="text-xs text-text-muted">
              Layers allow velocity-sensitive sample switching.
            </div>
            {pad.layers.length === 0 ? (
              <div className="p-8 text-center text-text-muted border-2 border-dashed border-dark-border rounded">
                No layers configured
              </div>
            ) : (
              <div className="space-y-2">
                {pad.layers.map((layer, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-dark-surface border border-dark-border rounded"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-text-primary">{layer.sample.name}</div>
                      <button
                        onClick={() => removeLayerFromPad(padId, idx)}
                        className="text-xs text-accent-error hover:text-accent-error/80"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <div>
                        <label className="text-[10px] text-text-muted">Vel Min</label>
                        <input
                          type="number"
                          min="0"
                          max="127"
                          value={layer.velocityRange[0]}
                          onChange={(e) => updateLayerOnPad(padId, idx, {
                            velocityRange: [parseInt(e.target.value) || 0, layer.velocityRange[1]],
                          })}
                          className="w-full bg-dark-bg border border-dark-border rounded px-2 py-1 text-xs text-text-primary"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-text-muted">Vel Max</label>
                        <input
                          type="number"
                          min="0"
                          max="127"
                          value={layer.velocityRange[1]}
                          onChange={(e) => updateLayerOnPad(padId, idx, {
                            velocityRange: [layer.velocityRange[0], parseInt(e.target.value) || 127],
                          })}
                          className="w-full bg-dark-bg border border-dark-border rounded px-2 py-1 text-xs text-text-primary"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-text-muted">Level {layer.levelOffset}dB</label>
                        <input
                          type="range"
                          min="-24"
                          max="24"
                          value={layer.levelOffset}
                          onChange={(e) => updateLayerOnPad(padId, idx, {
                            levelOffset: parseInt(e.target.value),
                          })}
                          className="w-full"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowLayerBrowser(true)}
              className="w-full px-4 py-2 bg-accent-primary hover:bg-accent-primary/80 text-text-primary text-xs font-bold rounded transition-colors"
            >
              + Add Layer
            </button>

            {showLayerBrowser && (
              <SamplePackBrowser
                mode="drumpad"
                onSelectSample={(sample) => {
                  // Auto-calculate velocity range based on existing layers
                  const existingCount = pad.layers.length;
                  const rangeSize = Math.floor(128 / (existingCount + 1));
                  const min = existingCount * rangeSize;
                  const max = existingCount === 0 ? 127 : Math.min(min + rangeSize - 1, 127);
                  addLayerToPad(padId, sample, [min, max]);
                  setShowLayerBrowser(false);
                }}
                onClose={() => setShowLayerBrowser(false)}
              />
            )}
          </div>
        )}

        {activeTab === 'dj' && (
          <div className="space-y-4">
            <div className="text-xs text-text-muted">
              Assign a DJ scratch action to this pad. It fires on every hit, in addition to any loaded sample.
            </div>

            <div>
              <label className="block text-xs text-text-muted mb-1">Scratch / Fader Action</label>
              <CustomSelect
                value={pad.scratchAction ?? ''}
                onChange={(v) => handleUpdate({ scratchAction: (v as ScratchActionId) || undefined })}
                options={SCRATCH_ACTION_OPTIONS.map(({ value, label }) => ({
                  value,
                  label,
                }))}
                className="w-full bg-dark-surface border border-dark-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary font-mono"
              zIndex={MODAL_DROPDOWN_Z}
              />
            </div>

            {pad.scratchAction && (
              <div className="p-3 bg-dark-surface border border-dark-border rounded text-xs font-mono">
                <div className="text-text-muted mb-1">Active action:</div>
                <div className="text-accent-primary">
                  {SCRATCH_ACTION_OPTIONS.find(o => o.value === pad.scratchAction)?.label ?? pad.scratchAction}
                </div>
                <div className="text-text-muted mt-2">
                  Targets the active playing DJ deck (prefers A over B).
                </div>
              </div>
            )}

            {!pad.scratchAction && (
              <div className="p-3 bg-dark-surface border border-dark-border/50 rounded text-xs text-text-muted font-mono">
                No DJ action assigned. This pad will only trigger its sample (if loaded).
              </div>
            )}

            {/* DJ FX Actions */}
            <div className="mt-6 pt-4 border-t border-dark-border">
              <div className="text-xs text-text-muted mb-3 leading-relaxed">
                Assign a DJ effect to this pad. <strong>Momentary</strong> effects engage while held, <strong>one-shot</strong> effects fire once on press.
              </div>

              <div>
                <label className="block text-xs text-text-muted mb-1">DJ FX Action</label>
                <CustomSelect
                  value={pad.djFxAction ?? ''}
                  onChange={(v) => handleUpdate({ djFxAction: (v as DjFxActionId) || undefined })}
                  options={(() => {
                    const groups: { label: string; options: { value: string; label: string }[] }[] = [];
                    const topLevel: { value: string; label: string }[] = [];
                    let currentGroup: { label: string; options: { value: string; label: string }[] } | null = null;
                    let lastCategory = '';
                    for (const { value, label, category } of DJ_FX_OPTIONS) {
                      if (category === '') {
                        topLevel.push({ value, label });
                      } else if (category !== lastCategory) {
                        currentGroup = { label: FX_CATEGORY_LABELS[category] ?? category, options: [{ value, label }] };
                        groups.push(currentGroup);
                      } else {
                        currentGroup!.options.push({ value, label });
                      }
                      lastCategory = category;
                    }
                    return [...topLevel, ...groups];
                  })()}
                  className="w-full bg-dark-surface border border-dark-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary font-mono"
                zIndex={MODAL_DROPDOWN_Z}
                />
              </div>

              {pad.djFxAction && (
                <div className="p-3 mt-2 bg-dark-surface border border-dark-border rounded text-xs font-mono">
                  <div className="text-text-muted mb-1">Active FX:</div>
                  <div className="text-accent-primary">
                    {DJ_FX_ACTIONS.find(a => a.id === pad.djFxAction)?.name ?? pad.djFxAction}
                  </div>
                  <div className="text-text-muted mt-1">
                    {DJ_FX_ACTIONS.find(a => a.id === pad.djFxAction)?.mode === 'momentary'
                      ? 'Hold pad to engage, release to disengage'
                      : 'Press pad to fire (plays out automatically)'}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
