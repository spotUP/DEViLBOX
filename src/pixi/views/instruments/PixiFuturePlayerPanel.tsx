/**
 * PixiFuturePlayerPanel — GL-native Future Player instrument editor.
 *
 * Mirrors src/components/instruments/controls/FuturePlayerControls.tsx 1:1:
 *   - Header row with Future Player label, instrument name, type badge, sample size
 *   - Three tabs: Envelope, Pitch Mod, Sample Mod
 *   - Knobs for every FuturePlayerConfig parameter
 *
 * Every knob edit flows two ways:
 *   1. onUpdate(id, { futurePlayer: {...} }) — persists to the store
 *   2. FuturePlayerEngine.writeByte(detailPtr + offset, value) — live-writes
 *      into the running WASM replayer so the change is audible on the next
 *      tick without a reload. The offset map (FP_DETAIL_OFFSET) lives in
 *      src/lib/futureplayer/detailOffsets.ts and is shared with the DOM
 *      editor so read/write offsets can't drift.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PixiKnob, PixiLabel, PixiButton } from '../../components';
import { usePixiTheme } from '../../theme';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { FuturePlayerConfig } from '@/types/instrument/exotic';
import { FuturePlayerEngine } from '@/engine/futureplayer/FuturePlayerEngine';
import { FP_DETAIL_OFFSET, FP_NEGATE_OFFSET } from '@/lib/futureplayer/detailOffsets';

const KNOB_SIZE = 'sm' as const;

type FPTab = 'envelope' | 'pitchMod' | 'sampleMod';

interface Props {
  instrument: InstrumentConfig;
  onUpdate: (id: number, changes: Partial<InstrumentConfig>) => void;
}

const SectionHeading: React.FC<{ text: string }> = ({ text }) => (
  <layoutContainer layout={{ paddingTop: 2, paddingBottom: 2 }}>
    <PixiLabel text={text} size="xs" weight="bold" color="textMuted" />
  </layoutContainer>
);

export const PixiFuturePlayerPanel: React.FC<Props> = ({ instrument, onUpdate }) => {
  const theme = usePixiTheme();
  const fp = instrument.futurePlayer!;
  const [activeTab, setActiveTab] = useState<FPTab>('envelope');

  // configRef pattern to avoid stale-closure writes during rapid knob drags.
  const fpRef = useRef(fp);
  useEffect(() => { fpRef.current = fp; }, [fp]);
  const instrumentIdRef = useRef(instrument.id);
  useEffect(() => { instrumentIdRef.current = instrument.id; }, [instrument.id]);

  const upd = useCallback(
    <K extends keyof FuturePlayerConfig>(key: K, value: FuturePlayerConfig[K]) => {
      const cur = fpRef.current;
      onUpdate(instrumentIdRef.current, {
        futurePlayer: { ...cur, [key]: value },
      });

      // Live-write to the running WASM replayer (same policy as the DOM editor).
      if (cur.detailPtr !== undefined && FuturePlayerEngine.hasInstance()) {
        const offset = FP_DETAIL_OFFSET[key];
        if (offset !== undefined && typeof value === 'number') {
          FuturePlayerEngine.getInstance().writeByte(cur.detailPtr + offset, value & 0xFF);
        } else if (key === 'pitchMod1Negate' && typeof value === 'boolean') {
          FuturePlayerEngine.getInstance().writeByte(
            cur.detailPtr + FP_NEGATE_OFFSET.pitchMod1Negate, value ? 1 : 0,
          );
        } else if (key === 'pitchMod2Negate' && typeof value === 'boolean') {
          FuturePlayerEngine.getInstance().writeByte(
            cur.detailPtr + FP_NEGATE_OFFSET.pitchMod2Negate, value ? 1 : 0,
          );
        }
      }
    },
    [onUpdate],
  );

  // ── Tabs ─────────────────────────────────────────────────────────────────

  const tabs: { id: FPTab; label: string }[] = [
    { id: 'envelope', label: 'Envelope' },
    { id: 'pitchMod', label: 'Pitch Mod' },
    { id: 'sampleMod', label: 'Sample Mod' },
  ];

  // ── Small helpers ────────────────────────────────────────────────────────

  const Badge: React.FC<{ text: string; color: number; bg?: number }> = ({ text, color, bg }) => (
    <layoutContainer
      layout={{
        paddingLeft: 6, paddingRight: 6, paddingTop: 2, paddingBottom: 2,
        borderRadius: 3,
        backgroundColor: bg ?? theme.bgTertiary.color,
      }}
    >
      <PixiLabel text={text} size="xs" weight="bold" color="custom" customColor={color} />
    </layoutContainer>
  );

  const ReadOnlyField: React.FC<{ label: string; value: string; highlight?: boolean }> = ({ label, value, highlight }) => (
    <layoutContainer layout={{ flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 48 }}>
      <PixiLabel text={label} size="xs" color="textMuted" />
      {highlight ? (
        <PixiLabel text={value} size="xs" color="custom" customColor={theme.error.color} />
      ) : (
        <PixiLabel text={value} size="xs" color="text" />
      )}
    </layoutContainer>
  );

  const pitchModModeText = (m: number): string =>
    m === 0 ? 'Loop' : m === 1 ? 'Continue' : 'One-shot';
  const sampleModModeText = (m: number): string =>
    m === 0 ? 'Loop' : (m & 0x80) ? 'One-shot' : 'Continue';

  // ── Render ───────────────────────────────────────────────────────────────

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
        {fp.isWavetable ? (
          <Badge text="WAVETABLE" color={0xC084FC} />
        ) : (
          <Badge text="PCM" color={0x60A5FA} />
        )}
        {fp.sampleSize > 0 && (
          <PixiLabel text={`${fp.sampleSize} bytes`} size="xs" color="textMuted" />
        )}
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
              value={fp.volume}
              min={0}
              max={255}
              onChange={(v) => upd('volume', Math.round(v))}
              label="Volume"
              size={KNOB_SIZE}
              defaultValue={255}
            />
          </layoutContainer>

          <SectionHeading text="ENVELOPE (ADSR)" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4, flexWrap: 'wrap' }}>
            <PixiKnob
              value={fp.attackRate}
              min={0}
              max={255}
              onChange={(v) => upd('attackRate', Math.round(v))}
              label="Atk Rate"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={fp.attackPeak}
              min={0}
              max={255}
              onChange={(v) => upd('attackPeak', Math.round(v))}
              label="Atk Peak"
              size={KNOB_SIZE}
              defaultValue={255}
            />
            <PixiKnob
              value={fp.decayRate}
              min={0}
              max={255}
              onChange={(v) => upd('decayRate', Math.round(v))}
              label="Dec Rate"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={fp.sustainLevel}
              min={0}
              max={255}
              onChange={(v) => upd('sustainLevel', Math.round(v))}
              label="Sus Level"
              size={KNOB_SIZE}
              defaultValue={255}
            />
          </layoutContainer>
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4, flexWrap: 'wrap' }}>
            <PixiKnob
              value={fp.sustainRate & 0x7F}
              min={0}
              max={127}
              onChange={(v) => upd('sustainRate', (fpRef.current.sustainRate & 0x80) | (Math.round(v) & 0x7F))}
              label="Sus Rate"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={fp.sustainTarget}
              min={0}
              max={255}
              onChange={(v) => upd('sustainTarget', Math.round(v))}
              label="Sus Target"
              size={KNOB_SIZE}
              defaultValue={255}
            />
            <PixiKnob
              value={fp.releaseRate}
              min={0}
              max={255}
              onChange={(v) => upd('releaseRate', Math.round(v))}
              label="Rel Rate"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <layoutContainer layout={{ flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 56 }}>
              <PixiLabel text="Sus Dir" size="xs" color="textMuted" />
              <PixiButton
                label={(fp.sustainRate & 0x80) ? 'Down' : 'Up'}
                variant={(fp.sustainRate & 0x80) ? 'danger' : 'primary'}
                onClick={() => upd('sustainRate', fpRef.current.sustainRate ^ 0x80)}
              />
            </layoutContainer>
          </layoutContainer>
        </layoutContainer>
      )}

      {/* ═══════════ PITCH MOD TAB ═══════════ */}
      {activeTab === 'pitchMod' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          {/* Pitch Mod 1 */}
          <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <PixiLabel text="PITCH MOD 1" size="xs" weight="bold" color="textMuted" />
            <Badge
              text={fp.hasPitchMod1 ? 'Active' : 'None'}
              color={fp.hasPitchMod1 ? theme.success.color : theme.textMuted.color}
            />
          </layoutContainer>
          {fp.hasPitchMod1 && (
            <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              <PixiKnob
                value={fp.pitchMod1Delay}
                min={0}
                max={255}
                onChange={(v) => upd('pitchMod1Delay', Math.round(v))}
                label="Delay"
                size={KNOB_SIZE}
                defaultValue={0}
              />
              <PixiKnob
                value={fp.pitchMod1Shift}
                min={0}
                max={7}
                step={1}
                onChange={(v) => upd('pitchMod1Shift', Math.round(v))}
                label="Shift"
                size={KNOB_SIZE}
                defaultValue={0}
              />
              <ReadOnlyField label="Mode" value={pitchModModeText(fp.pitchMod1Mode)} />
              <ReadOnlyField label="Negate" value={fp.pitchMod1Negate ? 'Yes' : 'No'} highlight={fp.pitchMod1Negate} />
            </layoutContainer>
          )}

          {/* Pitch Mod 2 */}
          <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 6 }}>
            <PixiLabel text="PITCH MOD 2" size="xs" weight="bold" color="textMuted" />
            <Badge
              text={fp.hasPitchMod2 ? 'Active' : 'None'}
              color={fp.hasPitchMod2 ? theme.success.color : theme.textMuted.color}
            />
          </layoutContainer>
          {fp.hasPitchMod2 && (
            <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              <PixiKnob
                value={fp.pitchMod2Delay}
                min={0}
                max={255}
                onChange={(v) => upd('pitchMod2Delay', Math.round(v))}
                label="Delay"
                size={KNOB_SIZE}
                defaultValue={0}
              />
              <PixiKnob
                value={fp.pitchMod2Shift}
                min={0}
                max={7}
                step={1}
                onChange={(v) => upd('pitchMod2Shift', Math.round(v))}
                label="Shift"
                size={KNOB_SIZE}
                defaultValue={0}
              />
              <ReadOnlyField label="Mode" value={pitchModModeText(fp.pitchMod2Mode)} />
              <ReadOnlyField label="Negate" value={fp.pitchMod2Negate ? 'Yes' : 'No'} highlight={fp.pitchMod2Negate} />
            </layoutContainer>
          )}
        </layoutContainer>
      )}

      {/* ═══════════ SAMPLE MOD TAB ═══════════ */}
      {activeTab === 'sampleMod' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          {/* Sample Mod 1 */}
          <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <PixiLabel text="SAMPLE MOD 1" size="xs" weight="bold" color="textMuted" />
            <Badge
              text={fp.hasSampleMod1 ? 'Active' : 'None'}
              color={fp.hasSampleMod1 ? theme.success.color : theme.textMuted.color}
            />
          </layoutContainer>
          {fp.hasSampleMod1 && (
            <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              <PixiKnob
                value={fp.sampleMod1Delay}
                min={0}
                max={255}
                onChange={(v) => upd('sampleMod1Delay', Math.round(v))}
                label="Delay"
                size={KNOB_SIZE}
                defaultValue={0}
              />
              <PixiKnob
                value={fp.sampleMod1Shift}
                min={0}
                max={7}
                step={1}
                onChange={(v) => upd('sampleMod1Shift', Math.round(v))}
                label="Shift"
                size={KNOB_SIZE}
                defaultValue={0}
              />
              <ReadOnlyField label="Mode" value={sampleModModeText(fp.sampleMod1Mode)} />
            </layoutContainer>
          )}

          {/* Sample Mod 2 */}
          <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 6 }}>
            <PixiLabel text="SAMPLE MOD 2" size="xs" weight="bold" color="textMuted" />
            <Badge
              text={fp.hasSampleMod2 ? 'Active' : 'None'}
              color={fp.hasSampleMod2 ? theme.success.color : theme.textMuted.color}
            />
          </layoutContainer>
          {fp.hasSampleMod2 && (
            <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              <PixiKnob
                value={fp.sampleMod2Delay}
                min={0}
                max={255}
                onChange={(v) => upd('sampleMod2Delay', Math.round(v))}
                label="Delay"
                size={KNOB_SIZE}
                defaultValue={0}
              />
              <PixiKnob
                value={fp.sampleMod2Shift}
                min={0}
                max={7}
                step={1}
                onChange={(v) => upd('sampleMod2Shift', Math.round(v))}
                label="Shift"
                size={KNOB_SIZE}
                defaultValue={0}
              />
              <ReadOnlyField label="Mode" value={sampleModModeText(fp.sampleMod2Mode)} />
            </layoutContainer>
          )}
        </layoutContainer>
      )}
    </layoutContainer>
  );
};
