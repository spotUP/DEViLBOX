/**
 * HippelCoSoControls.tsx — Chris Hülsbeck (Hippel CoSo) instrument editor
 *
 * Exposes all HippelCoSoConfig parameters: timing, vibrato, and editable
 * frequency/volume sequences using the shared SequenceEditor component.
 *
 * When loaded via UADE (uadeChipRam present), scalar params that map directly
 * to bytes in the volseq header are written back to chip RAM so UADE picks them
 * up on the next note trigger. An export button is also shown.
 *
 * HippelCoSo volseq header byte layout (offset from instrBase):
 *   +0  : volSpeed  (uint8)      ✓ written
 *   +1  : fseqIdx   (int8)       — skip (index into fseq table, not a user param)
 *   +2  : vibSpeed  (int8)       ✓ written via writeS8
 *   +3  : vibDepth  (int8 mag)   ✓ written (stored as negative depth in hardware)
 *   +4  : vibDelay  (uint8)      ✓ written
 *   +5..: vseq data (variable)   — skip (variable-length sequence data)
 */

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import type { HippelCoSoConfig, UADEChipRamInfo } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { SectionLabel, SequenceEditor, SampleBrowserPane } from '@components/instruments/shared';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import type { SequencePreset } from '@components/instruments/shared';
import { UADEChipEditor } from '@/engine/uade/UADEChipEditor';
import { UADEEngine } from '@/engine/uade/UADEEngine';
import { useTrackerStore } from '@stores/useTrackerStore';
import { Download } from 'lucide-react';
import { HippelCoSoSynth } from '@/engine/hippelcoso/HippelCoSoSynth';
import { HippelCoSoEngine } from '@/engine/hippelcoso/HippelCoSoEngine';

interface HippelCoSoControlsProps {
  config: HippelCoSoConfig;
  onChange: (updates: Partial<HippelCoSoConfig>) => void;
  fseqPlaybackPosition?: number;
  vseqPlaybackPosition?: number;
  /** Present when this instrument was loaded via UADE's native HippelCoSo parser. */
  uadeChipRam?: UADEChipRamInfo;
  /** Runtime id of the instrument being edited — used by Find Usage to scan patterns. */
  instrumentId?: number;
}

type HCSTab = 'main' | 'sequences';

// ── Presets ────────────────────────────────────────────────────────────────────

const FSEQ_PRESETS: SequencePreset[] = [
  { name: 'Vibrato',    data: [0, 3, 5, 3, 0, -3, -5, -3], loop: 0 },
  { name: 'Slide Up',   data: [-12, -9, -6, -3, 0], loop: 4 },
  { name: 'Slide Dn',   data: [12, 9, 6, 3, 0], loop: 4 },
  { name: 'Tremolo',    data: [0, 6, 12, 6], loop: 0 },
  { name: 'Flat',       data: [0] },
];

const VSEQ_PRESETS: SequencePreset[] = [
  { name: 'Attack-Dec', data: [0, 16, 32, 48, 63, 48, 32, 20, 12, 8, 4, 2, 1, 0] },
  { name: 'Organ',      data: [63, 63, 50, 40, 38, 35, 33, 30], loop: 7 },
  { name: 'Pluck',      data: [63, 50, 40, 30, 22, 16, 10, 6, 3, 1, 0] },
  { name: 'Pad',        data: [0, 8, 18, 30, 42, 54, 63], loop: 6 },
  { name: 'Full',       data: [63], loop: 0 },
];

// ── Component ──────────────────────────────────────────────────────────────────

export const HippelCoSoControls: React.FC<HippelCoSoControlsProps> = ({
  config,
  onChange,
  fseqPlaybackPosition,
  vseqPlaybackPosition,
  uadeChipRam,
  instrumentId,
}) => {
  const [activeTab, setActiveTab] = useState<HCSTab>('main');
  const [showSamplePane, setShowSamplePane] = useState(false);

  // ── Sample browser rows — pulled from the parser-populated sampleBank on
  // the config. The bank is shared across every HC instrument in the song,
  // so we simply render what this instrument carries. ───────────────────────
  const sampleRows = useMemo(() => {
    return (config.sampleBank ?? []).map((s) => ({
      index: s.index,
      pointer: s.pointer,
      length: s.length,
      loopStart: s.loopStart,
      repeatLength: s.repeatLength,
      hasLoop: s.repeatLength > 2,
    }));
  }, [config.sampleBank]);

  // ── Find Usage — scan tracker patterns for any cell referencing this
  // instrument's runtime id, find the song position of the first pattern that
  // contains such a cell, and seek the player there. Mirrors TFMX macro editor
  // seekToUsage. Returns false when the instrument is unused. ─────────────────
  const findUsage = useCallback((): boolean => {
    if (instrumentId === undefined) return false;
    const store = useTrackerStore.getState();
    const patterns = store.patterns;
    const order = store.patternOrder;
    // Find the first pattern index that contains the instrument
    const usingPatternIdx = new Set<number>();
    for (let p = 0; p < patterns.length; p++) {
      const pat = patterns[p];
      if (!pat) continue;
      outer: for (const ch of pat.channels) {
        for (const row of ch.rows) {
          if (row && row.instrument === instrumentId) {
            usingPatternIdx.add(p);
            break outer;
          }
        }
      }
    }
    if (usingPatternIdx.size === 0) return false;
    // Walk the song order to find the first position that references one
    // of the using patterns.
    for (let i = 0; i < order.length; i++) {
      if (usingPatternIdx.has(order[i])) {
        store.setCurrentPosition(i, false);
        return true;
      }
    }
    return false;
  }, [instrumentId]);

  // ── Preview synth — dedicated instance for audition ──────────────────────
  const [previewNote, setPreviewNote] = useState(48); // C-3
  const previewSynthRef = useRef<HippelCoSoSynth | null>(null);

  // Dispose preview synth on unmount
  useEffect(() => {
    return () => {
      previewSynthRef.current?.dispose();
      previewSynthRef.current = null;
    };
  }, []);

  const handlePreview = useCallback(async () => {
    let synth = previewSynthRef.current;
    if (!synth) {
      synth = new HippelCoSoSynth();
      previewSynthRef.current = synth;
      synth.output.connect(synth.output.context.destination);
    }
    await synth.setInstrument(config);
    synth.triggerAttack(previewNote);
    // Auto-release after 800ms so the note doesn't ring forever
    setTimeout(() => synth!.triggerRelease(), 800);
  }, [config, previewNote]);

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const chipEditorRef = useRef<UADEChipEditor | null>(null);
  function getEditor(): UADEChipEditor | null {
    if (!uadeChipRam) return null;
    if (!chipEditorRef.current) {
      chipEditorRef.current = new UADEChipEditor(UADEEngine.getInstance());
    }
    return chipEditorRef.current;
  }

  const { isCyan, accent, knob, dim, panelBg, panelStyle } = useInstrumentColors('#44aaff', { knob: '#66bbff', dim: '#001833' });

  /**
   * Like `upd`, but also writes a single byte to chip RAM when a UADE context is
   * active. byteOffset is relative to instrBase (the volseq header address).
   */
  const updU8WithChipRam = useCallback(
    (key: keyof HippelCoSoConfig, value: HippelCoSoConfig[keyof HippelCoSoConfig], byteOffset: number) => {
      onChange({ [key]: value } as Partial<HippelCoSoConfig>);
      // Push to WASM engine if running
      if (HippelCoSoEngine.hasInstance() && typeof value === 'number') {
        HippelCoSoEngine.getInstance().setInstrumentParam(0, key, value);
      }
      if (uadeChipRam && typeof value === 'number') {
        const editor = getEditor();
        if (editor) {
          void editor.writeU8(uadeChipRam.instrBase + byteOffset, value & 0xFF);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onChange, uadeChipRam],
  );

  /**
   * Like updU8WithChipRam but writes a signed byte (two's complement).
   */
  const updS8WithChipRam = useCallback(
    (key: keyof HippelCoSoConfig, value: HippelCoSoConfig[keyof HippelCoSoConfig], byteOffset: number) => {
      onChange({ [key]: value } as Partial<HippelCoSoConfig>);
      // Push to WASM engine if running
      if (HippelCoSoEngine.hasInstance() && typeof value === 'number') {
        HippelCoSoEngine.getInstance().setInstrumentParam(0, key, value);
      }
      if (uadeChipRam && typeof value === 'number') {
        const editor = getEditor();
        if (editor) {
          void editor.writeU8(uadeChipRam.instrBase + byteOffset, value < 0 ? (256 + value) : value);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onChange, uadeChipRam],
  );

  const upd = useCallback(<K extends keyof HippelCoSoConfig>(key: K, value: HippelCoSoConfig[K]) => {
    onChange({ [key]: value } as Partial<HippelCoSoConfig>);
    // Push to WASM engine if running (sequences are arrays, only push numeric scalars)
    if (HippelCoSoEngine.hasInstance() && typeof value === 'number') {
      HippelCoSoEngine.getInstance().setInstrumentParam(0, key, value);
    }
  }, [onChange]);

  /**
   * Encode a sequence as signed-int8 bytes plus a -31 sentinel terminator.
   * Returns a Uint8Array. The terminator matches both fseq (FSEQ_END = -31) and
   * vseq (vseq end sentinel range -31..-25, we always emit -31 as the canonical
   * end byte).
   */
  function encodeSequence(values: number[]): Uint8Array {
    /* Strip any existing trailing sentinel(s) so we don't double-terminate. */
    let end = values.length;
    while (end > 0) {
      const v = values[end - 1];
      if (v >= -31 && v <= -25) end--;
      else break;
    }
    const out = new Uint8Array(end + 1);
    for (let i = 0; i < end; i++) {
      const v = values[i] | 0;
      out[i] = v < 0 ? (256 + v) & 0xFF : v & 0xFF;
    }
    out[end] = 256 + (-31); /* 0xE1 */
    return out;
  }

  /**
   * Write a sequence body (fseq or vseq) into chip RAM, enforcing the original
   * byte budget. If the encoded length would overflow the budget the edit is
   * REJECTED with a console warning (no chip RAM is touched). Trailing bytes
   * within the budget are zero-filled so stale sequence data can never sneak in.
   */
  const writeSeqToChipRam = useCallback((kind: 'fseq' | 'vseq', values: number[]) => {
    if (!uadeChipRam) return;
    const sections = uadeChipRam.sections as {
      vseqBodyAddr?: number; vseqBodyMaxLen?: number;
      fseqBodyAddr?: number; fseqBodyMaxLen?: number;
    };
    const addr   = kind === 'fseq' ? sections.fseqBodyAddr   : sections.vseqBodyAddr;
    const budget = kind === 'fseq' ? sections.fseqBodyMaxLen : sections.vseqBodyMaxLen;
    if (addr === undefined || budget === undefined) return;
    /* fseqBodyAddr === 0xFFFFFFFF means this instrument has no resolvable fseq
     * (fseqIdx === -128). Silently skip — the user can still edit the in-memory
     * config but there's nowhere to write it. */
    if (addr === 0xFFFFFFFF || budget === 0) return;

    const encoded = encodeSequence(values);
    if (encoded.length > budget) {
      console.warn(
        `[HippelCoSo] ${kind} sequence overflow — edit rejected ` +
        `(encoded ${encoded.length} bytes > budget ${budget} bytes)`,
      );
      return;
    }
    const editor = getEditor();
    if (!editor) return;

    /* Pad with zeros to fill the original budget so stale bytes (e.g. an
     * earlier longer sequence) can't be re-interpreted as live data. */
    const padded = new Uint8Array(budget);
    padded.set(encoded, 0);
    void editor.writeBytes(addr, padded);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uadeChipRam]);

  const writeFseqToChipRam = useCallback((values: number[]) => {
    writeSeqToChipRam('fseq', values);
  }, [writeSeqToChipRam]);

  const writeVseqToChipRam = useCallback((values: number[]) => {
    writeSeqToChipRam('vseq', values);
  }, [writeSeqToChipRam]);

  // ── MAIN TAB ──────────────────────────────────────────────────────────────
  const renderMain = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      {/* Timing */}
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Timing" />
        <div className="flex gap-4">
          <Knob
            value={config.volSpeed}
            min={1} max={16} step={1}
            onChange={(v) => updU8WithChipRam('volSpeed', Math.round(v), 0)}
            label="Vol Speed" color={knob}
            formatValue={(v) => Math.round(v).toString()}
          />
        </div>
        <span className="text-[10px] text-text-muted mt-1 block">ticks per vseq step</span>
      </div>

      {/* Vibrato */}
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Vibrato" />
        <div className="flex gap-4">
          <Knob
            value={config.vibDelay}
            min={0} max={255} step={1}
            onChange={(v) => updU8WithChipRam('vibDelay', Math.round(v), 4)}
            label="Delay" color={knob}
            formatValue={(v) => Math.round(v).toString()}
          />
          <Knob
            value={config.vibSpeed}
            min={-128} max={127} step={1}
            onChange={(v) => updS8WithChipRam('vibSpeed', Math.round(v), 2)}
            label="Speed" color={knob}
            formatValue={(v) => Math.round(v).toString()}
          />
          <Knob
            value={config.vibDepth}
            min={0} max={255} step={1}
            onChange={(v) => updU8WithChipRam('vibDepth', Math.round(v), 3)}
            label="Depth" color={knob}
            formatValue={(v) => Math.round(v).toString()}
          />
        </div>
      </div>
    </div>
  );

  // ── SEQUENCES TAB ─────────────────────────────────────────────────────────
  const renderSequences = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>

      {/* Frequency Sequence — relative pitch offsets (semitones) */}
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Frequency Sequence" />
        <SequenceEditor
          label="fseq"
          data={config.fseq}
          onChange={(d) => { upd('fseq', d); writeFseqToChipRam(d); }}
          min={-127} max={127}
          bipolar
          showNoteNames
          presets={FSEQ_PRESETS}
          playbackPosition={fseqPlaybackPosition}
          color={accent}
          height={80}
        />
        <p className="text-[9px] text-text-muted mt-1">
          Relative pitch offsets per step (semitones). Use the loop marker (L) to set loop point.
        </p>
      </div>

      {/* Volume Sequence — 0-63 volume levels */}
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Volume Sequence" />
        <SequenceEditor
          label="vseq"
          data={config.vseq.map(v => Math.max(0, v))}  // clamp -128 loop markers for display
          onChange={(d) => { upd('vseq', d); writeVseqToChipRam(d); }}
          min={0} max={63}
          presets={VSEQ_PRESETS}
          playbackPosition={vseqPlaybackPosition}
          color={knob}
          height={80}
        />
        <p className="text-[9px] text-text-muted mt-1">
          Volume level per step (0–63). Sequence loops at the loop point.
        </p>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center border-b" style={{ borderColor: dim }}>
        {([['main', 'Parameters'], ['sequences', 'Sequences']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
            style={{
              color: activeTab === id ? accent : '#666',
              borderBottom: activeTab === id ? `2px solid ${accent}` : '2px solid transparent',
              background: activeTab === id ? (isCyan ? '#041510' : '#000e1a') : 'transparent',
            }}
          >
            {label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1 mr-2">
          <input
            type="number"
            min={0}
            max={95}
            value={previewNote}
            onChange={(e) => setPreviewNote(Math.max(0, Math.min(95, parseInt(e.target.value) || 0)))}
            title="MIDI note (0-95) for preview audition"
            style={{
              width: '40px', fontSize: '10px', padding: '3px 4px',
              background: 'var(--color-bg)', color: '#c084fc',
              border: '1px solid #c084fc', borderRadius: '3px',
              fontFamily: 'inherit', textAlign: 'center',
            }}
          />
          <button
            onClick={() => void handlePreview()}
            title="Play a preview note using this instrument"
            style={{
              fontSize: '10px', padding: '4px 8px', cursor: 'pointer',
              background: 'rgba(192,132,252,0.15)', color: '#c084fc',
              border: '1px solid #c084fc', borderRadius: '3px',
              fontFamily: 'inherit', whiteSpace: 'nowrap',
            }}
          >
            &#9834; Preview
          </button>
          {instrumentId !== undefined && (
            <button
              onClick={() => {
                const ok = findUsage();
                if (!ok) {
                  console.warn('[HippelCoSo] instrument is unused — nothing to seek to');
                }
              }}
              title="Find a song position where this instrument is used and seek the player there"
              className="px-2 py-1 text-[10px] font-mono bg-dark-bg hover:bg-dark-bgSecondary border border-dark-border rounded text-accent-primary hover:border-accent-primary/60 transition-colors"
            >
              ▶ Find Usage
            </button>
          )}
          <button
            onClick={() => setShowSamplePane((v) => !v)}
            title={`${showSamplePane ? 'Hide' : 'Show'} sample browser`}
            className={`px-2 py-1 text-[10px] font-mono border rounded transition-colors ${
              showSamplePane
                ? 'bg-accent-primary/20 text-accent-primary border-accent-primary/60'
                : 'bg-dark-bg text-text-secondary border-dark-border hover:text-accent-primary hover:border-accent-primary/50'
            }`}
          >
            SMP
          </button>
          {uadeChipRam && (
            <button
              onClick={() => {
                const editor = getEditor();
                if (editor && uadeChipRam) {
                  editor.exportModule(uadeChipRam.moduleBase, uadeChipRam.moduleSize, 'module.hipc')
                    .catch(console.error);
                }
              }}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono bg-dark-bgSecondary hover:bg-dark-bg border border-dark-border rounded transition-colors"
              title="Export module with current edits"
              style={{ color: accent }}
            >
              <Download size={10} />
              Export .hipc
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0">
          {activeTab === 'main'      && renderMain()}
          {activeTab === 'sequences' && renderSequences()}
        </div>
        {showSamplePane && (
          <SampleBrowserPane
            width={240}
            entries={sampleRows.map((s) => ({
              id: s.index,
              name: `${String(s.index).padStart(2, '0')}. sample`,
              sizeBytes: s.length,
            }))}
            emptyMessage="No sample bank — this song carries no COSO sample headers."
            renderEntry={(entry) => {
              const s = sampleRows.find((r) => r.index === entry.id)!;
              return (
                <>
                  <div className="font-mono truncate text-text-primary">
                    {String(s.index).padStart(2, '0')}. sample
                  </div>
                  <div className="text-text-muted mt-0.5">
                    {s.length} bytes
                    {s.hasLoop && <span className="ml-1 text-accent-success">·loop</span>}
                  </div>
                  <div className="mt-0.5 text-[9px] text-text-muted font-mono">
                    ptr 0x{s.pointer.toString(16)}
                    {s.hasLoop && ` · rep ${s.repeatLength}`}
                  </div>
                </>
              );
            }}
          />
        )}
      </div>
    </div>
  );
};
