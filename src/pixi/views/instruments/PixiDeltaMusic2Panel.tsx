/**
 * PixiDeltaMusic2Panel — GL-native Delta Music 2.0 instrument editor.
 *
 * Mirrors the DOM editor at src/components/instruments/controls/DeltaMusic2Controls.tsx
 * 1:1 in structure:
 *   - Header: "Delta Music 2.0" + instrument name
 *   - Tabs: Envelope, Modulation, Table, Waveform
 *   - Envelope: 5-entry volume table (speed / level / sustain per entry)
 *   - Modulation: 5-entry vibrato table (speed / delay / sustain) + pitch bend
 *   - Table: read-only bar chart of wavetable sequence (48 bytes)
 *   - Waveform: read-only waveform preview of waveformPCM
 *
 * Mutations flow through onUpdate(instrumentId, { deltaMusic2: { ... } }).
 * No UADE chip RAM writes from this panel — the store handles propagation.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PixiKnob, PixiLabel, PixiButton } from '../../components';
import { usePixiTheme } from '../../theme';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { DeltaMusic2VolEntry, DeltaMusic2VibEntry } from '@/types/instrument/exotic';
import type { Graphics } from 'pixi.js';

const KNOB_SIZE = 'sm' as const;

type DM2Tab = 'envelope' | 'modulation' | 'table' | 'waveform';

interface Props {
  instrument: InstrumentConfig;
  onUpdate: (id: number, changes: Partial<InstrumentConfig>) => void;
}

const SectionHeading: React.FC<{ text: string }> = ({ text }) => (
  <layoutContainer layout={{ paddingTop: 2, paddingBottom: 2 }}>
    <PixiLabel text={text} size="xs" weight="bold" color="textMuted" />
  </layoutContainer>
);

// ── Chart dimensions ────────────────────────────────────────────────────────

const TABLE_W = 320;
const TABLE_H = 80;
const WAVE_W = 320;
const WAVE_H = 120;

export const PixiDeltaMusic2Panel: React.FC<Props> = ({ instrument, onUpdate }) => {
  const theme = usePixiTheme();
  const dm = instrument.deltaMusic2!;
  const [activeTab, setActiveTab] = useState<DM2Tab>('envelope');

  // configRef pattern to avoid stale closures during rapid knob drags.
  const dmRef = useRef(dm);
  useEffect(() => { dmRef.current = dm; }, [dm]);
  const instrumentIdRef = useRef(instrument.id);
  useEffect(() => { instrumentIdRef.current = instrument.id; }, [instrument.id]);

  // ── Volume table updater ──────────────────────────────────────────────────

  const updateVolEntry = useCallback(
    (entryIndex: number, field: 'speed' | 'level' | 'sustain', value: number) => {
      const cur = dmRef.current;
      const newTable: DeltaMusic2VolEntry[] = cur.volTable.map((e, idx) =>
        idx === entryIndex ? { ...e, [field]: value } : e,
      );
      onUpdate(instrumentIdRef.current, {
        deltaMusic2: { ...cur, volTable: newTable },
      });
    },
    [onUpdate],
  );

  // ── Vibrato table updater ─────────────────────────────────────────────────

  const updateVibEntry = useCallback(
    (entryIndex: number, field: 'speed' | 'delay' | 'sustain', value: number) => {
      const cur = dmRef.current;
      const newTable: DeltaMusic2VibEntry[] = cur.vibTable.map((e, idx) =>
        idx === entryIndex ? { ...e, [field]: value } : e,
      );
      onUpdate(instrumentIdRef.current, {
        deltaMusic2: { ...cur, vibTable: newTable },
      });
    },
    [onUpdate],
  );

  // ── Pitch bend updater ────────────────────────────────────────────────────

  const updatePitchBend = useCallback(
    (value: number) => {
      const cur = dmRef.current;
      onUpdate(instrumentIdRef.current, {
        deltaMusic2: { ...cur, pitchBend: value },
      });
    },
    [onUpdate],
  );

  // ── Wavetable sequence bar chart (read-only, unipolar 0-255) ──────────────

  const drawTable = useCallback(
    (g: Graphics) => {
      g.clear();
      const W = TABLE_W;
      const H = TABLE_H;

      g.rect(0, 0, W, H).fill({ color: theme.bg.color });
      g.moveTo(0, H - 1).lineTo(W, H - 1).stroke({ color: theme.border.color, width: 1 });

      const table = dm.table;
      if (!table || table.length === 0) return;

      const barW = W / table.length;
      for (let i = 0; i < table.length; i++) {
        const v = table[i];
        const isLoop = v === 0xFF;
        const color = isLoop ? theme.error.color : theme.accent.color;
        const h = isLoop ? H - 2 : (v / 255) * (H - 2);
        const x = i * barW;
        const w = Math.max(1, barW - 1);
        g.rect(x, H - h - 1, w, h).fill({ color });
      }
    },
    [dm.table, theme.bg.color, theme.border.color, theme.accent.color, theme.error.color],
  );

  // ── Waveform PCM preview (read-only) ──────────────────────────────────────

  const drawWaveform = useCallback(
    (g: Graphics) => {
      g.clear();
      const W = WAVE_W;
      const H = WAVE_H;
      const mid = H / 2;

      g.rect(0, 0, W, H).fill({ color: theme.bg.color });
      g.moveTo(0, mid).lineTo(W, mid).stroke({ color: theme.border.color, width: 1 });

      const wavePCM = dm.waveformPCM;
      if (!wavePCM || wavePCM.length === 0) return;

      g.moveTo(0, mid);
      for (let x = 0; x < W; x++) {
        const idx = Math.min(wavePCM.length - 1, Math.floor((x / W) * wavePCM.length));
        const v = wavePCM[idx];
        const signed = v > 127 ? v - 256 : v;
        const y = mid - (signed / 128) * (mid - 4);
        if (x === 0) {
          g.moveTo(x, y);
        } else {
          g.lineTo(x, y);
        }
      }
      g.stroke({ color: theme.accent.color, width: 1 });
    },
    [dm.waveformPCM, theme.bg.color, theme.border.color, theme.accent.color],
  );

  // ── Tabs ──────────────────────────────────────────────────────────────────

  const hasWaveformPCM = !dm.isSample && !!(dm.waveformPCM && dm.waveformPCM.length > 0);

  const tabs: { id: DM2Tab; label: string }[] = [
    { id: 'envelope', label: 'Envelope' },
    { id: 'modulation', label: 'Modulation' },
    ...(!dm.isSample ? [{ id: 'table' as const, label: 'Table' }] : []),
    ...(hasWaveformPCM ? [{ id: 'waveform' as const, label: 'Waveform' }] : []),
  ];

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
        <PixiLabel
          text="Delta Music 2.0"
          size="sm"
          weight="bold"
          color="custom"
          customColor={theme.accent.color}
        />
        <PixiLabel text={instrument.name} size="sm" color="textSecondary" />
        <layoutContainer layout={{ flex: 1 }} />
        <PixiLabel
          text={dm.isSample ? 'PCM' : 'SYNTH'}
          size="xs"
          color="textMuted"
        />
      </layoutContainer>

      {/* Tab bar */}
      <layoutContainer layout={{ flexDirection: 'row', gap: 4 }}>
        {tabs.map((t) => (
          <PixiButton
            key={t.id}
            label={t.label}
            variant={activeTab === t.id ? 'primary' : 'ghost'}
            onClick={() => setActiveTab(t.id)}
          />
        ))}
      </layoutContainer>

      {/* ═══════════ ENVELOPE TAB (volume table, 5 entries) ═══════════ */}
      {activeTab === 'envelope' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <SectionHeading text="VOLUME TABLE (5 ENTRIES)" />
          {dm.volTable.slice(0, 5).map((entry, idx) => (
            <layoutContainer key={idx} layout={{ flexDirection: 'column', gap: 4 }}>
              <PixiLabel
                text={`Entry ${idx + 1}`}
                size="xs"
                color="custom"
                customColor={theme.accent.color}
              />
              <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 2 }}>
                <PixiKnob
                  value={entry.speed}
                  min={0}
                  max={255}
                  onChange={(v) => updateVolEntry(idx, 'speed', Math.round(v))}
                  label="Speed"
                  size={KNOB_SIZE}
                  defaultValue={0}
                />
                <PixiKnob
                  value={entry.level}
                  min={0}
                  max={255}
                  onChange={(v) => updateVolEntry(idx, 'level', Math.round(v))}
                  label="Level"
                  size={KNOB_SIZE}
                  defaultValue={0}
                />
                <PixiKnob
                  value={entry.sustain}
                  min={0}
                  max={255}
                  onChange={(v) => updateVolEntry(idx, 'sustain', Math.round(v))}
                  label="Sustain"
                  size={KNOB_SIZE}
                  defaultValue={0}
                />
              </layoutContainer>
            </layoutContainer>
          ))}
        </layoutContainer>
      )}

      {/* ═══════════ MODULATION TAB (vibrato table + pitch bend) ═══════════ */}
      {activeTab === 'modulation' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <SectionHeading text="VIBRATO TABLE (5 ENTRIES)" />
          {dm.vibTable.slice(0, 5).map((entry, idx) => (
            <layoutContainer key={idx} layout={{ flexDirection: 'column', gap: 4 }}>
              <PixiLabel
                text={`Entry ${idx + 1}`}
                size="xs"
                color="custom"
                customColor={theme.accent.color}
              />
              <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 2 }}>
                <PixiKnob
                  value={entry.speed}
                  min={0}
                  max={255}
                  onChange={(v) => updateVibEntry(idx, 'speed', Math.round(v))}
                  label="Speed"
                  size={KNOB_SIZE}
                  defaultValue={0}
                />
                <PixiKnob
                  value={entry.delay}
                  min={0}
                  max={255}
                  onChange={(v) => updateVibEntry(idx, 'delay', Math.round(v))}
                  label="Delay"
                  size={KNOB_SIZE}
                  defaultValue={0}
                />
                <PixiKnob
                  value={entry.sustain}
                  min={0}
                  max={255}
                  onChange={(v) => updateVibEntry(idx, 'sustain', Math.round(v))}
                  label="Sustain"
                  size={KNOB_SIZE}
                  defaultValue={0}
                />
              </layoutContainer>
            </layoutContainer>
          ))}

          <SectionHeading text="PITCH BEND" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <PixiKnob
              value={dm.pitchBend}
              min={0}
              max={65535}
              onChange={(v) => updatePitchBend(Math.round(v))}
              label="Bend"
              size={KNOB_SIZE}
              defaultValue={0}
            />
          </layoutContainer>
        </layoutContainer>
      )}

      {/* ═══════════ TABLE TAB (wavetable sequence, read-only bar chart) ═══════════ */}
      {activeTab === 'table' && !dm.isSample && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <SectionHeading text="WAVETABLE SEQUENCE (48 BYTES)" />
          <layoutContainer
            layout={{
              width: TABLE_W,
              height: TABLE_H,
              borderWidth: 1,
              borderColor: theme.border.color,
              borderRadius: 4,
            }}
          >
            <pixiGraphics draw={drawTable} layout={{ width: TABLE_W, height: TABLE_H }} />
          </layoutContainer>
          <PixiLabel
            text={`${dm.table.length} entries -- 0-254 = waveform, 255 = loop/end`}
            size="xs"
            color="textMuted"
          />
        </layoutContainer>
      )}

      {/* ═══════════ WAVEFORM TAB (oscillator waveform, read-only) ═══════════ */}
      {activeTab === 'waveform' && hasWaveformPCM && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <SectionHeading text="OSCILLATOR WAVEFORM (READ-ONLY)" />
          <layoutContainer
            layout={{
              width: WAVE_W,
              height: WAVE_H,
              borderWidth: 1,
              borderColor: theme.border.color,
              borderRadius: 4,
            }}
          >
            <pixiGraphics draw={drawWaveform} layout={{ width: WAVE_W, height: WAVE_H }} />
          </layoutContainer>
          <PixiLabel
            text={`${dm.waveformPCM!.length} bytes -- signed 8-bit PCM`}
            size="xs"
            color="textMuted"
          />
        </layoutContainer>
      )}
    </layoutContainer>
  );
};
