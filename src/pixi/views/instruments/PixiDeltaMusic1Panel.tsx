/**
 * PixiDeltaMusic1Panel — GL-native Delta Music 1.0 instrument editor.
 *
 * Mirrors the DOM editor at src/components/instruments/controls/DeltaMusic1Controls.tsx
 * 1:1 in structure:
 *   - Header: "Delta Music 1.0" + instrument name
 *   - Tabs: Envelope, Modulation, Arpeggio, Sample
 *   - Envelope: volume, attackStep/Delay, decayStep/Delay, sustain, releaseStep/Delay
 *   - Modulation: vibrato (wait, step, depth), bend rate, portamento, table delay
 *   - Arpeggio: read-only bar chart of arpTable (8 signed semitone offsets)
 *   - Sample: read-only waveform preview of sampleData
 *
 * Mutations flow through onUpdate(instrumentId, { deltaMusic1: { ... } }).
 * No UADE chip RAM writes — the Pixi panel is presentation-only; the store
 * handles chip RAM propagation if needed.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PixiKnob, PixiLabel, PixiButton } from '../../components';
import { usePixiTheme } from '../../theme';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { DeltaMusic1Config } from '@/types/instrument/exotic';
import type { Graphics } from 'pixi.js';

const KNOB_SIZE = 'sm' as const;

type DM1Tab = 'envelope' | 'modulation' | 'arpeggio' | 'sample';

interface Props {
  instrument: InstrumentConfig;
  onUpdate: (id: number, changes: Partial<InstrumentConfig>) => void;
}

const SectionHeading: React.FC<{ text: string }> = ({ text }) => (
  <layoutContainer layout={{ paddingTop: 2, paddingBottom: 2 }}>
    <PixiLabel text={text} size="xs" weight="bold" color="textMuted" />
  </layoutContainer>
);

// ── Bar chart dimensions ────────────────────────────────────────────────────

const ARP_W = 320;
const ARP_H = 80;
const SAMPLE_W = 320;
const SAMPLE_H = 120;

export const PixiDeltaMusic1Panel: React.FC<Props> = ({ instrument, onUpdate }) => {
  const theme = usePixiTheme();
  const dm = instrument.deltaMusic1!;
  const [activeTab, setActiveTab] = useState<DM1Tab>('envelope');

  // configRef pattern to avoid stale closures during rapid knob drags.
  const dmRef = useRef(dm);
  useEffect(() => { dmRef.current = dm; }, [dm]);
  const instrumentIdRef = useRef(instrument.id);
  useEffect(() => { instrumentIdRef.current = instrument.id; }, [instrument.id]);

  const upd = useCallback(
    <K extends keyof DeltaMusic1Config>(key: K, value: DeltaMusic1Config[K]) => {
      const cur = dmRef.current;
      onUpdate(instrumentIdRef.current, {
        deltaMusic1: { ...cur, [key]: value },
      });
    },
    [onUpdate],
  );

  // ── Arpeggio bar chart (read-only, bipolar signed semitones) ──────────────

  const drawArpeggio = useCallback(
    (g: Graphics) => {
      g.clear();
      const W = ARP_W;
      const H = ARP_H;
      const mid = H / 2;

      // Background
      g.rect(0, 0, W, H).fill({ color: theme.bg.color });
      // Zero line
      g.moveTo(0, mid).lineTo(W, mid).stroke({ color: theme.border.color, width: 1 });

      const arp = dm.arpeggio;
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
          g.rect(x, mid - scaled, w, scaled).fill({ color: theme.accent.color });
        } else {
          g.rect(x, mid, w, -scaled).fill({ color: theme.accent.color });
        }
      }
    },
    [dm.arpeggio, theme.bg.color, theme.border.color, theme.accent.color],
  );

  // ── Sample waveform preview (read-only) ───────────────────────────────────

  const drawSampleWaveform = useCallback(
    (g: Graphics) => {
      g.clear();
      const W = SAMPLE_W;
      const H = SAMPLE_H;
      const mid = H / 2;

      // Background
      g.rect(0, 0, W, H).fill({ color: theme.bg.color });
      // Center line
      g.moveTo(0, mid).lineTo(W, mid).stroke({ color: theme.border.color, width: 1 });

      const sd = dm.sampleData;
      if (!sd || sd.length === 0) return;

      g.moveTo(0, mid);
      const step = Math.max(1, Math.floor(sd.length / W));
      for (let x = 0; x < W; x++) {
        const i = Math.min(sd.length - 1, Math.floor((x / W) * sd.length));
        // Peak-pick across the bucket so dense samples remain visible
        let peak = 0;
        const end = Math.min(sd.length, i + step);
        for (let j = i; j < end; j++) {
          const v = sd[j];
          const signed = v > 127 ? v - 256 : v;
          if (Math.abs(signed) > Math.abs(peak)) peak = signed;
        }
        const y = mid - (peak / 128) * (mid - 2);
        if (x === 0) {
          g.moveTo(x, y);
        } else {
          g.lineTo(x, y);
        }
      }
      g.stroke({ color: theme.accent.color, width: 1 });
    },
    [dm.sampleData, theme.bg.color, theme.border.color, theme.accent.color],
  );

  // ── Tabs ──────────────────────────────────────────────────────────────────

  const hasSampleData = !!(dm.sampleData && dm.sampleData.length > 0);

  const tabs: { id: DM1Tab; label: string }[] = [
    { id: 'envelope', label: 'Envelope' },
    { id: 'modulation', label: 'Modulation' },
    { id: 'arpeggio', label: 'Arpeggio' },
    ...(hasSampleData ? [{ id: 'sample' as const, label: 'Sample' }] : []),
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
          text="Delta Music 1.0"
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

      {/* ═══════════ ENVELOPE TAB ═══════════ */}
      {activeTab === 'envelope' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <SectionHeading text="VOLUME" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <PixiKnob
              value={dm.volume}
              min={0}
              max={64}
              onChange={(v) => upd('volume', Math.round(v))}
              label="Volume"
              size={KNOB_SIZE}
              defaultValue={64}
            />
          </layoutContainer>

          <SectionHeading text="ATTACK" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <PixiKnob
              value={dm.attackStep}
              min={0}
              max={255}
              onChange={(v) => upd('attackStep', Math.round(v))}
              label="Step"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={dm.attackDelay}
              min={0}
              max={255}
              onChange={(v) => upd('attackDelay', Math.round(v))}
              label="Delay"
              size={KNOB_SIZE}
              defaultValue={0}
            />
          </layoutContainer>

          <SectionHeading text="DECAY" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <PixiKnob
              value={dm.decayStep}
              min={0}
              max={255}
              onChange={(v) => upd('decayStep', Math.round(v))}
              label="Step"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={dm.decayDelay}
              min={0}
              max={255}
              onChange={(v) => upd('decayDelay', Math.round(v))}
              label="Delay"
              size={KNOB_SIZE}
              defaultValue={0}
            />
          </layoutContainer>

          <SectionHeading text="SUSTAIN" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <PixiKnob
              value={dm.sustain}
              min={0}
              max={65535}
              onChange={(v) => upd('sustain', Math.round(v))}
              label="Length"
              size={KNOB_SIZE}
              defaultValue={0}
            />
          </layoutContainer>

          <SectionHeading text="RELEASE" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <PixiKnob
              value={dm.releaseStep}
              min={0}
              max={255}
              onChange={(v) => upd('releaseStep', Math.round(v))}
              label="Step"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={dm.releaseDelay}
              min={0}
              max={255}
              onChange={(v) => upd('releaseDelay', Math.round(v))}
              label="Delay"
              size={KNOB_SIZE}
              defaultValue={0}
            />
          </layoutContainer>
        </layoutContainer>
      )}

      {/* ═══════════ MODULATION TAB ═══════════ */}
      {activeTab === 'modulation' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <SectionHeading text="VIBRATO" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <PixiKnob
              value={dm.vibratoWait}
              min={0}
              max={255}
              onChange={(v) => upd('vibratoWait', Math.round(v))}
              label="Wait"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={dm.vibratoStep}
              min={0}
              max={255}
              onChange={(v) => upd('vibratoStep', Math.round(v))}
              label="Step"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={dm.vibratoLength}
              min={0}
              max={255}
              onChange={(v) => upd('vibratoLength', Math.round(v))}
              label="Depth"
              size={KNOB_SIZE}
              defaultValue={0}
            />
          </layoutContainer>

          <SectionHeading text="PITCH BEND" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <PixiKnob
              value={dm.bendRate}
              min={-128}
              max={127}
              onChange={(v) => upd('bendRate', Math.round(v))}
              label="Rate"
              size={KNOB_SIZE}
              defaultValue={0}
            />
          </layoutContainer>

          <SectionHeading text="PORTAMENTO" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <PixiKnob
              value={dm.portamento}
              min={0}
              max={255}
              onChange={(v) => upd('portamento', Math.round(v))}
              label="Speed"
              size={KNOB_SIZE}
              defaultValue={0}
            />
          </layoutContainer>

          {!dm.isSample && (
            <>
              <SectionHeading text="TABLE DELAY" />
              <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
                <PixiKnob
                  value={dm.tableDelay}
                  min={0}
                  max={127}
                  onChange={(v) => upd('tableDelay', Math.round(v))}
                  label="Delay"
                  size={KNOB_SIZE}
                  defaultValue={0}
                />
              </layoutContainer>
            </>
          )}
        </layoutContainer>
      )}

      {/* ═══════════ ARPEGGIO TAB ═══════════ */}
      {activeTab === 'arpeggio' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <SectionHeading text="ARPEGGIO TABLE (8 SEMITONE OFFSETS)" />
          <layoutContainer
            layout={{
              width: ARP_W,
              height: ARP_H,
              borderWidth: 1,
              borderColor: theme.border.color,
              borderRadius: 4,
            }}
          >
            <pixiGraphics draw={drawArpeggio} layout={{ width: ARP_W, height: ARP_H }} />
          </layoutContainer>
          <PixiLabel
            text={`${dm.arpeggio.length} steps`}
            size="xs"
            color="textMuted"
          />
        </layoutContainer>
      )}

      {/* ═══════════ SAMPLE TAB ═══════════ */}
      {activeTab === 'sample' && hasSampleData && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <SectionHeading text="RAW SAMPLE DATA (READ-ONLY)" />
          <layoutContainer
            layout={{
              width: SAMPLE_W,
              height: SAMPLE_H,
              borderWidth: 1,
              borderColor: theme.border.color,
              borderRadius: 4,
            }}
          >
            <pixiGraphics draw={drawSampleWaveform} layout={{ width: SAMPLE_W, height: SAMPLE_H }} />
          </layoutContainer>
          <PixiLabel
            text={`${dm.sampleData!.length.toLocaleString()} bytes -- ${dm.isSample ? 'PCM sample' : 'Synth waveform pool'}`}
            size="xs"
            color="textMuted"
          />
        </layoutContainer>
      )}
    </layoutContainer>
  );
};
