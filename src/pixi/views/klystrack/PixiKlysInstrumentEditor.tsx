/**
 * PixiKlysInstrumentEditor — MAXIMIZED Pixi-native instrument editor for klystrack.
 *
 * Visual 1:1 mirror of `KlysInstrumentEditor` (DOM). Same shared store
 * (`useFormatStore.klysNative`), same WASM bridge (`KlysEngine`), same
 * constants (`klysParams.ts`). NEVER duplicates logic — only renders.
 *
 * Exposes every field of the C `MusInstrument` struct
 * (klystrack-wasm/common/music.h:42-90) including bitfield breakouts:
 *   - flags     (MUS_INST_*)  — 12 checkboxes
 *   - cydflags  (CYD_CHN_*)   — 16 checkboxes
 *   - fm.flags  (CYD_FM_*)    — 4  checkboxes
 *
 * See CLAUDE.md "DOM/Pixi UI Architecture Rules": single source of truth via
 * the format store; design tokens via `usePixiTheme()`.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFormatStore } from '@stores';
import { KlysEngine } from '@/engine/klystrack/KlysEngine';
import { usePixiTheme } from '@/pixi/theme';
import { PIXI_FONTS } from '@/pixi/fonts';
import { PixiKnob } from '@/pixi/components/PixiKnob';
import { PixiCheckbox } from '@/pixi/components/PixiCheckbox';
import { PixiPureTextInput } from '@/pixi/input/PixiPureTextInput';
import {
  KLYS_PARAM_IDS,
  MUS_INST_FLAGS,
  CYD_CHN_FLAGS,
  CYD_FM_FLAGS,
  KLYS_FILTER_TYPES,
  KLYS_SHAPE_NAMES,
  type KlysParamKey,
} from '@/engine/klystrack/klysParams';
import type { KlysNativeInstrument } from '@/types/tracker';

interface Props {
  instrumentIndex: number;
  width: number;
  height: number;
}

const SectionLabel: React.FC<{ text: string; color: number }> = ({ text, color }) => (
  <pixiBitmapText
    eventMode="none"
    text={text.toUpperCase()}
    style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
    tint={color}
    layout={{ marginTop: 6, marginBottom: 2 }}
  />
);

export const PixiKlysInstrumentEditor: React.FC<Props> = ({ instrumentIndex, width, height }) => {
  const theme = usePixiTheme();
  const nativeData = useFormatStore(s => s.klysNative);

  const inst: KlysNativeInstrument | null = useMemo(() => {
    if (!nativeData || instrumentIndex < 0 || instrumentIndex >= nativeData.instruments.length) return null;
    return nativeData.instruments[instrumentIndex];
  }, [nativeData, instrumentIndex]);

  // Stale-state guard
  const instRef = useRef(inst);
  useEffect(() => { instRef.current = inst; }, [inst]);

  const writeStore = useCallback((updated: KlysNativeInstrument) => {
    const native = useFormatStore.getState().klysNative;
    if (!native) return;
    const instruments = [...native.instruments];
    instruments[instrumentIndex] = updated;
    useFormatStore.setState({ klysNative: { ...native, instruments } });
  }, [instrumentIndex]);

  const handleParam = useCallback((paramKey: KlysParamKey, value: number) => {
    const cur = instRef.current;
    if (!cur) return;
    const v = Math.round(value);
    const paramId = KLYS_PARAM_IDS[paramKey];
    if (paramId !== undefined && KlysEngine.hasInstance()) {
      KlysEngine.getInstance().setInstrumentParam(instrumentIndex, paramId, v);
    }
    const updated: KlysNativeInstrument = { ...cur };
    if (paramKey.startsWith('adsr.')) {
      updated.adsr = { ...updated.adsr, [paramKey.split('.')[1] as 'a' | 'd' | 's' | 'r']: v };
    } else if (paramKey.startsWith('fm.adsr.')) {
      updated.fm = { ...updated.fm, adsr: { ...updated.fm.adsr, [paramKey.split('.')[2] as 'a' | 'd' | 's' | 'r']: v } };
    } else if (paramKey.startsWith('fm.')) {
      const sub = paramKey.split('.')[1];
      updated.fm = { ...updated.fm, [sub]: v };
    } else {
      (updated as unknown as Record<string, number>)[paramKey] = v;
    }
    writeStore(updated);
  }, [instrumentIndex, writeStore]);

  const handleNameChange = useCallback((name: string) => {
    const cur = instRef.current;
    if (!cur) return;
    if (KlysEngine.hasInstance()) {
      KlysEngine.getInstance().setInstrumentName(instrumentIndex, name);
    }
    writeStore({ ...cur, name });
  }, [instrumentIndex, writeStore]);

  const [showFM, setShowFM] = useState(true);

  if (!inst) {
    return (
      <pixiContainer layout={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
        <pixiBitmapText
          text="No instrument selected"
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
          tint={theme.textMuted.color}
        />
      </pixiContainer>
    );
  }

  const KNOB_SIZE: 'sm' = 'sm';
  const knobRow = (children: React.ReactNode) => (
    <pixiContainer layout={{ width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
      {children}
    </pixiContainer>
  );

  const checkboxGrid = (
    bits: { bit: number; label: string; desc?: string }[],
    value: number,
    paramKey: KlysParamKey,
  ) => (
    <pixiContainer layout={{ width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
      {bits.map(b => (
        <PixiCheckbox
          key={b.bit}
          checked={(value & b.bit) !== 0}
          label={b.label}
          onChange={(checked) => handleParam(paramKey, checked ? value | b.bit : value & ~b.bit)}
          layout={{ width: '48%' }}
        />
      ))}
    </pixiContainer>
  );

  return (
    <pixiContainer
      layout={{
        width,
        height,
        flexDirection: 'column',
        padding: 8,
        gap: 2,
        backgroundColor: theme.bg.color,
      }}
    >
      <pixiContainer layout={{ width: '100%', height: 'auto', overflow: 'scroll', flexDirection: 'column', gap: 2 }}>
        {/* Header / name */}
        <pixiContainer layout={{ width: '100%', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <pixiBitmapText
            eventMode="none"
            text={instrumentIndex.toString(16).toUpperCase().padStart(2, '0')}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 14, fill: 0xffffff }}
            tint={theme.accent.color}
          />
          <PixiPureTextInput
            value={inst.name}
            onChange={handleNameChange}
            onBlur={handleNameChange}
            width={width - 60}
            height={20}
            fontSize={11}
            font="mono"
            placeholder="Instrument name"
          />
        </pixiContainer>

        {/* Envelope */}
        <SectionLabel text="Envelope (ADSR)" color={theme.textMuted.color} />
        {knobRow(<>
          <PixiKnob label="Attack"  value={inst.adsr.a} min={0} max={32} size={KNOB_SIZE} onChange={v => handleParam('adsr.a', v)} />
          <PixiKnob label="Decay"   value={inst.adsr.d} min={0} max={32} size={KNOB_SIZE} onChange={v => handleParam('adsr.d', v)} />
          <PixiKnob label="Sustain" value={inst.adsr.s} min={0} max={32} size={KNOB_SIZE} onChange={v => handleParam('adsr.s', v)} />
          <PixiKnob label="Release" value={inst.adsr.r} min={0} max={32} size={KNOB_SIZE} onChange={v => handleParam('adsr.r', v)} />
        </>)}

        {/* Core */}
        <SectionLabel text="Core" color={theme.textMuted.color} />
        {knobRow(<>
          <PixiKnob label="Volume"   value={inst.volume}     min={0} max={128} size={KNOB_SIZE} onChange={v => handleParam('volume', v)} />
          <PixiKnob label="Base"     value={inst.baseNote}   min={0} max={95}  size={KNOB_SIZE} onChange={v => handleParam('baseNote', v)} />
          <PixiKnob label="Finetune" value={inst.finetune}   min={-128} max={127} size={KNOB_SIZE} bipolar onChange={v => handleParam('finetune', v)} />
          <PixiKnob label="Slide"    value={inst.slideSpeed} min={0} max={255} size={KNOB_SIZE} onChange={v => handleParam('slideSpeed', v)} />
          <PixiKnob label="PW"       value={inst.pw}         min={0} max={4095} size={KNOB_SIZE} onChange={v => handleParam('pw', v)} />
        </>)}

        {/* Oscillator flags */}
        <SectionLabel text="Oscillator (CYD_CHN_*)" color={theme.textMuted.color} />
        {checkboxGrid(CYD_CHN_FLAGS, inst.cydflags, 'cydflags')}

        {/* Instrument flags */}
        <SectionLabel text="Instrument Flags (MUS_INST_*)" color={theme.textMuted.color} />
        {checkboxGrid(MUS_INST_FLAGS, inst.flags, 'flags')}

        {/* Filter */}
        <SectionLabel text="Filter" color={theme.textMuted.color} />
        {knobRow(<>
          <PixiKnob label="Cutoff" value={inst.cutoff}    min={0} max={4095} size={KNOB_SIZE} onChange={v => handleParam('cutoff', v)} />
          <PixiKnob label="Reso"   value={inst.resonance} min={0} max={3}    size={KNOB_SIZE} onChange={v => handleParam('resonance', v)} />
          <PixiKnob label={`Type (${KLYS_FILTER_TYPES[inst.flttype] ?? '?'})`} value={inst.flttype} min={0} max={KLYS_FILTER_TYPES.length - 1} size={KNOB_SIZE} onChange={v => handleParam('flttype', v)} />
        </>)}

        {/* Modulation */}
        <SectionLabel text="Modulation" color={theme.textMuted.color} />
        {knobRow(<>
          <PixiKnob label="Vib Spd"   value={inst.vibratoSpeed} min={0} max={255} size={KNOB_SIZE} onChange={v => handleParam('vibratoSpeed', v)} />
          <PixiKnob label="Vib Dpt"   value={inst.vibratoDepth} min={0} max={255} size={KNOB_SIZE} onChange={v => handleParam('vibratoDepth', v)} />
          <PixiKnob label="Vib Dly"   value={inst.vibDelay}     min={0} max={255} size={KNOB_SIZE} onChange={v => handleParam('vibDelay', v)} />
          <PixiKnob label={`Vib(${KLYS_SHAPE_NAMES[inst.vibShape] ?? '?'})`} value={inst.vibShape} min={0} max={KLYS_SHAPE_NAMES.length - 1} size={KNOB_SIZE} onChange={v => handleParam('vibShape', v)} />
          <PixiKnob label="PWM Spd"   value={inst.pwmSpeed} min={0} max={255} size={KNOB_SIZE} onChange={v => handleParam('pwmSpeed', v)} />
          <PixiKnob label="PWM Dpt"   value={inst.pwmDepth} min={0} max={255} size={KNOB_SIZE} onChange={v => handleParam('pwmDepth', v)} />
          <PixiKnob label={`PWM(${KLYS_SHAPE_NAMES[inst.pwmShape] ?? '?'})`} value={inst.pwmShape} min={0} max={KLYS_SHAPE_NAMES.length - 1} size={KNOB_SIZE} onChange={v => handleParam('pwmShape', v)} />
        </>)}

        {/* Buzz / YM */}
        <SectionLabel text="Buzz / YM" color={theme.textMuted.color} />
        {knobRow(<>
          <PixiKnob label="YM Env"    value={inst.ymEnvShape} min={0} max={15} size={KNOB_SIZE} onChange={v => handleParam('ymEnvShape', v)} />
          <PixiKnob label="Buzz Off"  value={inst.buzzOffset} min={-128} max={127} bipolar size={KNOB_SIZE} onChange={v => handleParam('buzzOffset', v)} />
        </>)}

        {/* FM (collapsible) */}
        <pixiContainer
          eventMode="static"
          cursor="pointer"
          onPointerTap={() => setShowFM(!showFM)}
          layout={{ width: '100%', marginTop: 6 }}
        >
          <pixiBitmapText
            text={`[${showFM ? '-' : '+'}] FM SYNTHESIS`}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
            tint={theme.textMuted.color}
          />
        </pixiContainer>
        {showFM && (
          <>
            <SectionLabel text="FM Operator Flags" color={theme.textMuted.color} />
            {checkboxGrid(CYD_FM_FLAGS, inst.fm.flags, 'fm.flags')}
            {knobRow(<>
              <PixiKnob label="Mod"      value={inst.fm.modulation}  min={0} max={255} size={KNOB_SIZE} onChange={v => handleParam('fm.modulation', v)} />
              <PixiKnob label="Fbk"      value={inst.fm.feedback}    min={0} max={15}  size={KNOB_SIZE} onChange={v => handleParam('fm.feedback', v)} />
              <PixiKnob label="Wave"     value={inst.fm.wave}        min={0} max={255} size={KNOB_SIZE} onChange={v => handleParam('fm.wave', v)} />
              <PixiKnob label="Harm"     value={inst.fm.harmonic}    min={0} max={255} size={KNOB_SIZE} onChange={v => handleParam('fm.harmonic', v)} />
              <PixiKnob label="FM Atk"   value={inst.fm.adsr.a}      min={0} max={32}  size={KNOB_SIZE} onChange={v => handleParam('fm.adsr.a', v)} />
              <PixiKnob label="FM Dec"   value={inst.fm.adsr.d}      min={0} max={32}  size={KNOB_SIZE} onChange={v => handleParam('fm.adsr.d', v)} />
              <PixiKnob label="FM Sus"   value={inst.fm.adsr.s}      min={0} max={32}  size={KNOB_SIZE} onChange={v => handleParam('fm.adsr.s', v)} />
              <PixiKnob label="FM Rel"   value={inst.fm.adsr.r}      min={0} max={32}  size={KNOB_SIZE} onChange={v => handleParam('fm.adsr.r', v)} />
              <PixiKnob label="Atk Strt" value={inst.fm.attackStart} min={0} max={255} size={KNOB_SIZE} onChange={v => handleParam('fm.attackStart', v)} />
            </>)}
          </>
        )}

        {/* Routing */}
        <SectionLabel text="Routing" color={theme.textMuted.color} />
        {knobRow(<>
          <PixiKnob label="FX Bus"   value={inst.fxBus}          min={0} max={3}   size={KNOB_SIZE} onChange={v => handleParam('fxBus', v)} />
          <PixiKnob label="Ring"     value={inst.ringMod}        min={0} max={255} size={KNOB_SIZE} onChange={v => handleParam('ringMod', v)} />
          <PixiKnob label="Sync"     value={inst.syncSource}     min={0} max={255} size={KNOB_SIZE} onChange={v => handleParam('syncSource', v)} />
          <PixiKnob label="LFSR"     value={inst.lfsrType}       min={0} max={255} size={KNOB_SIZE} onChange={v => handleParam('lfsrType', v)} />
          <PixiKnob label="Wave Ent" value={inst.wavetableEntry} min={0} max={255} size={KNOB_SIZE} onChange={v => handleParam('wavetableEntry', v)} />
          <PixiKnob label="Prog Per" value={inst.progPeriod}     min={0} max={255} size={KNOB_SIZE} onChange={v => handleParam('progPeriod', v)} />
        </>)}
      </pixiContainer>
    </pixiContainer>
  );
};
