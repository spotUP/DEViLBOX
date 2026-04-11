/**
 * PixiFCPanel -- GL-native Future Composer 1.3/1.4 instrument editor.
 *
 * Mirrors the DOM editor at src/components/instruments/controls/FCControls.tsx:
 *   - Header: "Future Composer" + instrument name + waveNumber badge
 *   - Envelope section: knobs for synthSpeed, atkLength, atkVolume, decLength,
 *     decVolume, sustVolume, relLength, vibDelay, vibSpeed, vibDepth
 *   - Waveform select (0-46, named options from FC_WAVE_NAMES)
 *   - Synth macro table display (read-only row list: waveNum + transposition)
 *   - Arpeggio table display (read-only bar chart)
 *   - volMacroSpeed knob + volMacroData hex preview (read-only)
 *
 * Data shape: instrument.fc (FCConfig). Mutations flow through
 * onUpdate(instrumentId, { fc: { ...prev, [key]: value } }).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PixiKnob, PixiLabel, PixiButton, PixiSelect } from '../../components';
import type { SelectOption } from '../../components';
import { usePixiTheme } from '../../theme';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { FCConfig } from '@/types/instrument/exotic';
import type { Graphics } from 'pixi.js';

const KNOB_SIZE = 'sm' as const;

interface Props {
  instrument: InstrumentConfig;
  onUpdate: (id: number, changes: Partial<InstrumentConfig>) => void;
}

const SectionHeading: React.FC<{ text: string }> = ({ text }) => (
  <layoutContainer layout={{ paddingTop: 2, paddingBottom: 2 }}>
    <PixiLabel text={text} size="xs" weight="bold" color="textMuted" />
  </layoutContainer>
);

// FC waveform names (0-46)
const FC_WAVE_NAMES: Record<number, string> = {
  0: 'Sawtooth', 1: 'Square', 2: 'Triangle', 3: 'Noise',
  4: 'Saw+Sq', 5: 'Saw+Tri', 6: 'Sq+Tri', 7: 'Pulse 1', 8: 'Pulse 2',
  9: 'Pulse 3', 10: 'Pulse 4', 11: 'Pulse 5',
};

function waveLabel(n: number): string {
  return FC_WAVE_NAMES[n] ?? `Wave ${n}`;
}

const WAVE_OPTIONS: SelectOption[] = Array.from({ length: 47 }, (_, i) => ({
  value: String(i),
  label: `${i}: ${waveLabel(i)}`,
}));

const DISPLAY_W = 300;
const BAR_H = 60;

type FCTab = 'envelope' | 'synth' | 'arpeggio' | 'rawvol';

export const PixiFCPanel: React.FC<Props> = ({ instrument, onUpdate }) => {
  const theme = usePixiTheme();
  const fc = instrument.fc!;
  const [activeTab, setActiveTab] = useState<FCTab>('envelope');
  const [rawVolExpanded, setRawVolExpanded] = useState(false);

  // Ref pattern to avoid stale closures during rapid knob drags
  const fcRef = useRef(fc);
  useEffect(() => { fcRef.current = fc; }, [fc]);
  const instrumentIdRef = useRef(instrument.id);
  useEffect(() => { instrumentIdRef.current = instrument.id; }, [instrument.id]);

  const updFC = useCallback(
    <K extends keyof FCConfig>(key: K, value: FCConfig[K]) => {
      onUpdate(instrumentIdRef.current, {
        fc: { ...fcRef.current, [key]: value },
      });
    },
    [onUpdate],
  );

  // Tab definitions
  const tabs: { id: FCTab; label: string }[] = [
    { id: 'envelope', label: 'Envelope' },
    { id: 'synth', label: 'Synth Macro' },
    { id: 'arpeggio', label: 'Arpeggio' },
    { id: 'rawvol', label: 'Raw Vol' },
  ];

  // -- Arpeggio bar chart (read-only) --
  const drawArpBars = useCallback(
    (g: Graphics) => {
      g.clear();
      const W = DISPLAY_W;
      const H = BAR_H;
      const mid = H / 2;

      g.rect(0, 0, W, H).fill({ color: theme.bg.color });
      g.moveTo(0, mid).lineTo(W, mid).stroke({ color: theme.border.color, width: 1 });

      const arp = fc.arpTable;
      if (!arp || arp.length === 0) return;

      let maxMag = 1;
      for (const v of arp) {
        const a = Math.abs(v);
        if (a > maxMag) maxMag = a;
      }
      if (maxMag < 12) maxMag = 12;

      const barW = W / arp.length;
      for (let i = 0; i < arp.length; i++) {
        const v = arp[i];
        const scaled = (v / maxMag) * (mid - 2);
        const x = i * barW;
        const w = Math.max(1, barW - 1);
        if (scaled >= 0) {
          g.rect(x, mid - scaled, w, Math.max(1, scaled)).fill({ color: theme.success.color });
        } else {
          g.rect(x, mid, w, Math.max(1, -scaled)).fill({ color: theme.success.color });
        }
      }
    },
    [fc.arpTable, theme.bg.color, theme.border.color, theme.success.color],
  );

  // -- Synth macro table draw (read-only row display) --
  const drawSynthMacro = useCallback(
    (g: Graphics) => {
      g.clear();
      const W = DISPLAY_W;
      const entries = fc.synthTable ?? [];
      const rowH = 14;
      const H = Math.max(rowH, entries.length * rowH);

      g.rect(0, 0, W, H).fill({ color: theme.bg.color });

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const y = i * rowH;

        // Alternating row background
        if (i % 2 === 1) {
          g.rect(0, y, W, rowH).fill({ color: theme.bgSecondary.color });
        }

        // Wave bar (proportional to waveNum / 46)
        const waveBarW = Math.max(1, (entry.waveNum / 46) * (W * 0.4));
        g.rect(2, y + 2, waveBarW, rowH - 4).fill({ color: theme.accent.color, alpha: 0.5 });

        // Transposition indicator (small bar at the right)
        if (entry.transposition !== 0) {
          const tMid = W * 0.7;
          const tScale = (entry.transposition / 24) * (W * 0.15);
          if (tScale >= 0) {
            g.rect(tMid, y + 3, Math.max(1, tScale), rowH - 6).fill({ color: theme.warning.color });
          } else {
            g.rect(tMid + tScale, y + 3, Math.max(1, -tScale), rowH - 6).fill({ color: theme.error.color });
          }
        }
      }
    },
    [fc.synthTable, theme.bg.color, theme.bgSecondary.color, theme.accent.color, theme.warning.color, theme.error.color],
  );

  const synthTableHeight = Math.max(14, (fc.synthTable?.length ?? 0) * 14);

  // -- Vol macro hex string (read-only) --
  const volMacroHex = (fc.volMacroData ?? [])
    .slice(0, 59)
    .map((b) => (b & 0xFF).toString(16).padStart(2, '0').toUpperCase())
    .join(' ');

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
          text="Future Composer"
          size="sm"
          weight="bold"
          color="custom"
          customColor={theme.accent.color}
        />
        <PixiLabel text={instrument.name} size="sm" color="textSecondary" />
        <layoutContainer layout={{ flex: 1 }} />
        <layoutContainer
          layout={{
            paddingLeft: 6, paddingRight: 6, paddingTop: 2, paddingBottom: 2,
            borderRadius: 3,
            backgroundColor: theme.bgTertiary.color,
          }}
        >
          <PixiLabel
            text={`Wave #${fc.waveNumber}`}
            size="xs"
            weight="bold"
            color="custom"
            customColor={theme.accent.color}
          />
        </layoutContainer>
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

      {/* ═══════════ ENVELOPE TAB ═══════════ */}
      {activeTab === 'envelope' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          {/* Base waveform selector */}
          <SectionHeading text="BASE WAVEFORM" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <PixiSelect
              options={WAVE_OPTIONS}
              value={String(fc.waveNumber)}
              onChange={(v) => updFC('waveNumber', parseInt(v))}
              width={160}
            />
            <PixiLabel text="Initial waveform (overridden by synth macro)" size="xs" color="textMuted" />
          </layoutContainer>

          {/* ADSR knobs */}
          <SectionHeading text="VOLUME ENVELOPE" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4, flexWrap: 'wrap' }}>
            <PixiKnob
              value={fc.atkLength}
              min={0}
              max={255}
              onChange={(v) => updFC('atkLength', Math.round(v))}
              label="Atk Len"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={fc.atkVolume}
              min={0}
              max={64}
              onChange={(v) => updFC('atkVolume', Math.round(v))}
              label="Atk Vol"
              size={KNOB_SIZE}
              defaultValue={64}
            />
            <PixiKnob
              value={fc.decLength}
              min={0}
              max={255}
              onChange={(v) => updFC('decLength', Math.round(v))}
              label="Dec Len"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={fc.decVolume}
              min={0}
              max={64}
              onChange={(v) => updFC('decVolume', Math.round(v))}
              label="Dec Vol"
              size={KNOB_SIZE}
              defaultValue={0}
            />
          </layoutContainer>
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4, flexWrap: 'wrap' }}>
            <PixiKnob
              value={fc.sustVolume}
              min={0}
              max={64}
              onChange={(v) => updFC('sustVolume', Math.round(v))}
              label="Sus Vol"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={fc.relLength}
              min={0}
              max={255}
              onChange={(v) => updFC('relLength', Math.round(v))}
              label="Rel Len"
              size={KNOB_SIZE}
              defaultValue={0}
            />
          </layoutContainer>

          {/* Vibrato */}
          <SectionHeading text="VIBRATO" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <PixiKnob
              value={fc.vibDelay}
              min={0}
              max={255}
              onChange={(v) => updFC('vibDelay', Math.round(v))}
              label="Delay"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={fc.vibSpeed}
              min={0}
              max={63}
              onChange={(v) => updFC('vibSpeed', Math.round(v))}
              label="Speed"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={fc.vibDepth}
              min={0}
              max={63}
              onChange={(v) => updFC('vibDepth', Math.round(v))}
              label="Depth"
              size={KNOB_SIZE}
              defaultValue={0}
            />
          </layoutContainer>
        </layoutContainer>
      )}

      {/* ═══════════ SYNTH MACRO TAB ═══════════ */}
      {activeTab === 'synth' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <SectionHeading text="SYNTH MACRO SEQUENCER" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4, alignItems: 'center' }}>
            <PixiKnob
              value={fc.synthSpeed}
              min={0}
              max={15}
              onChange={(v) => updFC('synthSpeed', Math.round(v))}
              label="Speed"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiLabel text="Ticks per macro step (0 = disabled)" size="xs" color="textMuted" />
          </layoutContainer>

          {/* Synth table visual (read-only) */}
          <layoutContainer
            layout={{
              width: DISPLAY_W,
              height: synthTableHeight,
              borderWidth: 1,
              borderColor: theme.border.color,
              borderRadius: 4,
            }}
          >
            <pixiGraphics draw={drawSynthMacro} layout={{ width: DISPLAY_W, height: synthTableHeight }} />
          </layoutContainer>

          {/* Row labels */}
          {(fc.synthTable ?? []).map((entry, i) => (
            <layoutContainer key={i} layout={{ flexDirection: 'row', gap: 8 }}>
              <PixiLabel
                text={`${String(i).padStart(2, '0')}: wave=${entry.waveNum} trans=${entry.transposition > 0 ? '+' : ''}${entry.transposition}`}
                size="xs"
                color="text"
              />
            </layoutContainer>
          ))}
        </layoutContainer>
      )}

      {/* ═══════════ ARPEGGIO TAB ═══════════ */}
      {activeTab === 'arpeggio' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <SectionHeading text="ARPEGGIO TABLE (SEMITONE OFFSETS)" />
          <layoutContainer
            layout={{
              width: DISPLAY_W,
              height: BAR_H,
              borderWidth: 1,
              borderColor: theme.border.color,
              borderRadius: 4,
            }}
          >
            <pixiGraphics draw={drawArpBars} layout={{ width: DISPLAY_W, height: BAR_H }} />
          </layoutContainer>
          <PixiLabel
            text={`${fc.arpTable?.length ?? 0} entries`}
            size="xs"
            color="textMuted"
          />
        </layoutContainer>
      )}

      {/* ═══════════ RAW VOL MACRO TAB ═══════════ */}
      {activeTab === 'rawvol' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <SectionHeading text="VOL MACRO SPEED" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4, alignItems: 'center' }}>
            <PixiKnob
              value={fc.volMacroSpeed ?? fc.synthSpeed ?? 0}
              min={0}
              max={15}
              onChange={(v) => updFC('volMacroSpeed', Math.round(v))}
              label="Speed"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiLabel text="Ticks per vol macro step (aliases synthSpeed)" size="xs" color="textMuted" />
          </layoutContainer>

          <SectionHeading text="RAW VOL MACRO BYTES (59)" />
          <PixiButton
            label={rawVolExpanded ? 'Hide hex' : 'Show hex'}
            variant="ghost"
            onClick={() => setRawVolExpanded((v) => !v)}
          />
          {rawVolExpanded && (
            <layoutContainer layout={{ padding: 4 }}>
              <PixiLabel
                text={volMacroHex || '(no data)'}
                size="xs"
                color="text"
              />
              <PixiLabel
                text={fc.volMacroData ? 'custom override' : 'derived from ADSR'}
                size="xs"
                color="textMuted"
              />
            </layoutContainer>
          )}
        </layoutContainer>
      )}
    </layoutContainer>
  );
};
