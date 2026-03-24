/**
 * PixiCMIKnobPanel — Pixi/WebGL renderer for the Fairlight CMI panel.
 *
 * ALL logic lives in useCMIPanel (shared hook). This file is ONLY rendering.
 * The DOM version (CMIControls.tsx) uses the same hook — zero duplication.
 */

import React, { useCallback } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';
import { PixiKnob, PixiButton } from '../../components';
import {
  useCMIPanel,
  CMI_TAB_DEFS, CMI_COLLAPSED_H, CMI_EXPANDED_H,
  CMI_HEADER_H, CMI_TAB_BAR_H, CMI_CONTENT_H,
  NUM_HARMONICS, WAVE_SAMPLES, WAVE_NAMES,
  cutoffToHz, filterResponseDb, formatCutoffHz,
  fmtInt, fmtWave, fmtCutoff, fmtTrack,
} from '@engine/cmi/useCMIPanel';

export { CMI_COLLAPSED_H as CMI_PANEL_COLLAPSED_H, CMI_EXPANDED_H as CMI_PANEL_EXPANDED_H };

// ─── Colors ──────────────────────────────────────────────────────────────────

const G = 0x22c55e;
const G_DIM = 0x166534;
const G_BRIGHT = 0x4ade80;
const G_FAINT = 0x0d3320;
const BG = 0x0a0a0a;

// ─── Visualization sizes ─────────────────────────────────────────────────────

const VIS_W = 480;
const BAR_H = 160;
const WAVE_PREVIEW_H = 70;
const CURVE_H = 180;

// ─── Props ───────────────────────────────────────────────────────────────────

interface PixiCMIKnobPanelProps {
  width: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const PixiCMIKnobPanel: React.FC<PixiCMIKnobPanelProps> = ({ width }) => {
  const theme = usePixiTheme();
  const cmi = useCMIPanel();

  // ── Pixi-specific pointer adapters (convert pixel coords → normalized) ───

  const handleBarPointerDown = useCallback((e: FederatedPointerEvent) => {
    const local = e.getLocalPosition(e.currentTarget);
    cmi.startHarmonicDrag(local.x / VIS_W, local.y / BAR_H);
  }, [cmi]);

  const handleBarPointerMove = useCallback((e: FederatedPointerEvent) => {
    if (!cmi.harmonicDragActive.current) return;
    const local = e.getLocalPosition(e.currentTarget);
    cmi.updateHarmonicAt(local.x / VIS_W, local.y / BAR_H);
  }, [cmi]);

  const handleBarPointerUp = useCallback(() => {
    cmi.endHarmonicDrag();
  }, [cmi]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Draw callbacks (computation from shared hook, rendering is Pixi-specific)
  // ═══════════════════════════════════════════════════════════════════════════

  const drawHarmonicBars = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, VIS_W, BAR_H); g.fill({ color: BG });

    // Grid
    for (let y = 0; y <= 4; y++) { g.moveTo(0, (y / 4) * BAR_H).lineTo(VIS_W, (y / 4) * BAR_H); }
    g.stroke({ width: 0.5, color: G_FAINT });

    // Bars
    const barW = VIS_W / NUM_HARMONICS;
    for (let i = 0; i < NUM_HARMONICS; i++) {
      const amp = Math.max(0, Math.min(1, cmi.harmonics[i] || 0));
      if (amp > 0.001) {
        g.rect(i * barW + 1, BAR_H - amp * BAR_H, barW - 2, amp * BAR_H);
      }
    }
    g.fill({ color: G });

    // Bright tops
    for (let i = 0; i < NUM_HARMONICS; i++) {
      const amp = cmi.harmonics[i] || 0;
      if (amp > 0.01) g.rect(i * barW + 1, BAR_H - amp * BAR_H, barW - 2, 2);
    }
    g.fill({ color: G_BRIGHT });

    g.rect(0, 0, VIS_W, BAR_H); g.stroke({ width: 1, color: G_DIM });
  }, [cmi.harmonics]);

  const drawWavePreview = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, VIS_W, WAVE_PREVIEW_H); g.fill({ color: BG });
    const mid = WAVE_PREVIEW_H / 2;
    g.moveTo(0, mid).lineTo(VIS_W, mid); g.stroke({ width: 0.5, color: G_FAINT });

    if (cmi.customWaveform.length > 0) {
      const amp = mid - 4;
      g.moveTo(0, mid - cmi.customWaveform[0] * amp);
      for (let i = 1; i < WAVE_SAMPLES; i++) {
        g.lineTo((i / (WAVE_SAMPLES - 1)) * VIS_W, mid - cmi.customWaveform[i] * amp);
      }
      g.stroke({ width: 1.5, color: G });
    }
    g.rect(0, 0, VIS_W, WAVE_PREVIEW_H); g.stroke({ width: 1, color: G_DIM });
  }, [cmi.customWaveform]);

  const drawWaveDisplay = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, VIS_W, CURVE_H); g.fill({ color: BG });

    const mid = CURVE_H / 2;
    g.moveTo(0, mid).lineTo(VIS_W, mid);
    for (let q = 1; q < 4; q++) g.moveTo((q / 4) * VIS_W, 0).lineTo((q / 4) * VIS_W, CURVE_H);
    g.stroke({ width: 0.5, color: G_FAINT });

    const s = cmi.builtinWaveform;
    if (s.length > 0) {
      const amp = mid - 6;
      g.moveTo(0, mid - s[0] * amp);
      for (let i = 1; i < s.length; i++) g.lineTo((i / (s.length - 1)) * VIS_W, mid - s[i] * amp);
      g.stroke({ width: 2, color: G });
    }
    g.rect(0, 0, VIS_W, CURVE_H); g.stroke({ width: 1, color: G_DIM });
  }, [cmi.builtinWaveform]);

  const drawFilterCurve = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, VIS_W, CURVE_H); g.fill({ color: BG });

    const fc = cutoffToHz(cmi.cutoff);
    const logMin = Math.log10(20), logMax = Math.log10(20000);
    const dbRange = 60;

    for (const f of [100, 1000, 10000]) {
      const x = ((Math.log10(f) - logMin) / (logMax - logMin)) * VIS_W;
      g.moveTo(x, 0).lineTo(x, CURVE_H);
    }
    for (const db of [-6, -12, -24, -48]) {
      g.moveTo(0, (-db / dbRange) * CURVE_H).lineTo(VIS_W, (-db / dbRange) * CURVE_H);
    }
    g.stroke({ width: 0.5, color: G_FAINT });

    g.moveTo(0, 0);
    for (let px = 0; px < VIS_W; px++) {
      const f = Math.pow(10, logMin + (px / VIS_W) * (logMax - logMin));
      const y = Math.min(CURVE_H, (-filterResponseDb(f, fc) / dbRange) * CURVE_H);
      if (px === 0) g.moveTo(px, y); else g.lineTo(px, y);
    }
    g.stroke({ width: 2, color: G });

    const cx = ((Math.log10(Math.max(20, fc)) - logMin) / (logMax - logMin)) * VIS_W;
    g.moveTo(cx, 0).lineTo(cx, CURVE_H); g.stroke({ width: 1, color: G_BRIGHT });

    g.rect(0, 0, VIS_W, CURVE_H); g.stroke({ width: 1, color: G_DIM });
  }, [cmi.cutoff]);

  const drawEnvelopeCurve = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, VIS_W, CURVE_H); g.fill({ color: BG });

    for (let q = 1; q <= 4; q++) {
      g.moveTo(0, CURVE_H - (q / 4) * CURVE_H).lineTo(VIS_W, CURVE_H - (q / 4) * CURVE_H);
    }
    g.stroke({ width: 0.5, color: G_FAINT });

    const c = cmi.envelopeCurve;
    if (c.length > 0) {
      g.moveTo(c[0].x * VIS_W, CURVE_H - c[0].y * CURVE_H);
      for (let i = 1; i < c.length; i++) g.lineTo(c[i].x * VIS_W, CURVE_H - c[i].y * CURVE_H);
      g.stroke({ width: 2, color: G });
    }
    g.rect(0, 0, VIS_W, CURVE_H); g.stroke({ width: 1, color: G_DIM });
  }, [cmi.envelopeCurve]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════════════

  if (!cmi.found) return <pixiContainer layout={{ width: 0, height: 0 }} />;

  if (cmi.collapsed) {
    return (
      <layoutContainer layout={{ width, height: CMI_COLLAPSED_H, flexDirection: 'column', backgroundColor: 0x1a1a1a, borderTopWidth: 1, borderColor: theme.border.color }}>
        <pixiContainer layout={{ width, height: CMI_COLLAPSED_H, flexDirection: 'row', alignItems: 'center', paddingLeft: 8, paddingRight: 4, gap: 6 }}>
          <pixiBitmapText text="FAIRLIGHT CMI" style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 12, fill: 0xffffff }} tint={G} layout={{}} />
          <pixiBitmapText text={cmi.chLabel} style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }} tint={theme.textMuted.color} layout={{}} />
          <pixiBitmapText text={cmi.instrumentName} style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }} tint={theme.textSecondary.color} layout={{}} />
          <pixiContainer layout={{ flex: 1 }} />
          <PixiButton label="EXPAND" variant="ghost" size="sm" onClick={cmi.toggleCollapsed} />
        </pixiContainer>
      </layoutContainer>
    );
  }

  return (
    <layoutContainer layout={{ width, height: CMI_EXPANDED_H, flexDirection: 'column', backgroundColor: 0x1a1a1a, borderTopWidth: 1, borderColor: theme.border.color }}>

      {/* Header */}
      <layoutContainer layout={{ width, height: CMI_HEADER_H, flexDirection: 'column', backgroundColor: 0x141414, borderBottomWidth: 1, borderColor: theme.border.color }}>
        <pixiContainer layout={{ width, height: CMI_HEADER_H, flexDirection: 'row', alignItems: 'center', paddingLeft: 10, paddingRight: 6, gap: 8 }}>
          <pixiBitmapText text="FAIRLIGHT CMI IIx" style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 14, fill: 0xffffff }} tint={G} layout={{}} />
          <pixiBitmapText text="16-VOICE SAMPLING SYNTH" style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }} tint={theme.textMuted.color} layout={{}} />
          <pixiBitmapText text={cmi.chLabel} style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }} tint={theme.textMuted.color} layout={{}} />
          <pixiBitmapText text={cmi.instrumentName} style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }} tint={theme.textSecondary.color} layout={{}} />
          <pixiContainer layout={{ flex: 1 }} />
          <PixiButton label="COLLAPSE" variant="ghost" size="sm" onClick={cmi.toggleCollapsed} />
        </pixiContainer>
      </layoutContainer>

      {/* Tab bar */}
      <layoutContainer layout={{ width, height: CMI_TAB_BAR_H, flexDirection: 'column', backgroundColor: 0x111111, borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.border.color }}>
        <pixiContainer layout={{ width, height: CMI_TAB_BAR_H, flexDirection: 'row', alignItems: 'center', paddingLeft: 10, paddingRight: 10, gap: 4 }}>
          {CMI_TAB_DEFS.map((tab) => (
            <PixiButton key={tab.id} label={`${tab.pageNum} ${tab.label}`} variant={cmi.activeTab === tab.id ? 'ft2' : 'ghost'} size="sm" active={cmi.activeTab === tab.id} onClick={() => cmi.setActiveTab(tab.id)} />
          ))}
        </pixiContainer>
      </layoutContainer>

      {/* Tab content */}
      <layoutContainer layout={{ width, height: CMI_CONTENT_H, flexDirection: 'column', backgroundColor: 0x161616 }}>

        {/* Page 7: HARMONIC */}
        {cmi.activeTab === 'harmonic' && (
          <pixiContainer layout={{ width, height: CMI_CONTENT_H, flexDirection: 'row', paddingLeft: 12, paddingTop: 8, gap: 12 }}>
            <pixiContainer layout={{ width: VIS_W, flexDirection: 'column', gap: 4 }}>
              <pixiContainer eventMode="static" cursor="crosshair" onPointerDown={handleBarPointerDown} onPointerMove={handleBarPointerMove} onPointerUp={handleBarPointerUp} onPointerUpOutside={handleBarPointerUp} layout={{ width: VIS_W, height: BAR_H }}>
                <pixiGraphics draw={drawHarmonicBars} layout={{ width: VIS_W, height: BAR_H }} />
              </pixiContainer>
              <pixiGraphics draw={drawWavePreview} layout={{ width: VIS_W, height: WAVE_PREVIEW_H }} />
            </pixiContainer>
            <pixiContainer layout={{ flexDirection: 'column', gap: 4, paddingTop: 2 }}>
              <pixiBitmapText text="PRESETS" style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }} tint={G_DIM} layout={{}} />
              {WAVE_NAMES.map((name, i) => (
                <PixiButton key={i} label={name.toUpperCase()} variant={cmi.waveBank === i ? 'ft2' : 'ghost'} size="sm" active={cmi.waveBank === i} onClick={() => cmi.selectWavePreset(i)} />
              ))}
            </pixiContainer>
          </pixiContainer>
        )}

        {/* Page 5: WAVE */}
        {cmi.activeTab === 'wave' && (
          <pixiContainer layout={{ width, height: CMI_CONTENT_H, flexDirection: 'row', paddingLeft: 12, paddingTop: 8, gap: 16 }}>
            <pixiContainer layout={{ width: VIS_W, flexDirection: 'column', gap: 4 }}>
              <pixiBitmapText text={`BANK ${cmi.waveBank}: ${WAVE_NAMES[cmi.waveBank] ?? '?'}`} style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 11, fill: 0xffffff }} tint={G} layout={{}} />
              <pixiGraphics draw={drawWaveDisplay} layout={{ width: VIS_W, height: CURVE_H }} />
              <pixiBitmapText text={`${WAVE_SAMPLES} samples | 8-bit unsigned PCM | 16KB/voice`} style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }} tint={G_DIM} layout={{}} />
            </pixiContainer>
            <pixiContainer layout={{ flexDirection: 'column', gap: 12, paddingTop: 16 }}>
              <PixiKnob value={cmi.waveSelect} min={0} max={7} defaultValue={0} onChange={(v) => cmi.handleParamChange('wave_select', v)} label="WAVE" size="sm" color={G} formatValue={fmtWave} />
              <PixiKnob value={cmi.volume} min={0} max={255} defaultValue={200} onChange={(v) => cmi.handleParamChange('volume', v)} label="VOLUME" size="sm" color={G} formatValue={fmtInt} />
            </pixiContainer>
          </pixiContainer>
        )}

        {/* Page 6: CONTROL */}
        {cmi.activeTab === 'control' && (
          <pixiContainer layout={{ width, height: CMI_CONTENT_H, flexDirection: 'column', paddingLeft: 12, paddingTop: 8, gap: 8 }}>
            <pixiContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <PixiKnob value={cmi.volume} min={0} max={255} defaultValue={200} onChange={(v) => cmi.handleParamChange('volume', v)} label="VOLUME" size="sm" color={G} formatValue={fmtInt} />
              <PixiKnob value={cmi.waveSelect} min={0} max={7} defaultValue={0} onChange={(v) => cmi.handleParamChange('wave_select', v)} label="WAVE" size="sm" color={G} formatValue={fmtWave} />
              <PixiKnob value={cmi.cutoff} min={0} max={255} defaultValue={200} onChange={(v) => cmi.handleParamChange('filter_cutoff', v)} label="CUTOFF" size="sm" color={G} formatValue={fmtCutoff} />
              <PixiKnob value={cmi.filterTrack} min={0} max={255} defaultValue={128} onChange={(v) => cmi.handleParamChange('filter_track', v)} label="KEY TRACK" size="sm" color={G} formatValue={fmtTrack} />
              <PixiKnob value={cmi.attackTime} min={0} max={255} defaultValue={10} onChange={(v) => cmi.handleParamChange('attack_time', v)} label="ATTACK" size="sm" color={G} formatValue={fmtInt} />
              <PixiKnob value={cmi.releaseTime} min={0} max={255} defaultValue={80} onChange={(v) => cmi.handleParamChange('release_time', v)} label="RELEASE" size="sm" color={G} formatValue={fmtInt} />
              <PixiKnob value={cmi.envRate} min={0} max={255} defaultValue={200} onChange={(v) => cmi.handleParamChange('envelope_rate', v)} label="ENV RATE" size="sm" color={G} formatValue={fmtInt} />
            </pixiContainer>
            <pixiContainer layout={{ flexDirection: 'row', gap: 12 }}>
              <pixiContainer layout={{ flexDirection: 'column', gap: 2 }}>
                <pixiBitmapText text="ENVELOPE" style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 9, fill: 0xffffff }} tint={G_DIM} layout={{}} />
                <pixiGraphics draw={drawEnvelopeCurve} layout={{ width: Math.floor(VIS_W / 2), height: CMI_CONTENT_H - 100 }} />
              </pixiContainer>
              <pixiContainer layout={{ flexDirection: 'column', gap: 2 }}>
                <pixiBitmapText text="FILTER RESPONSE" style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 9, fill: 0xffffff }} tint={G_DIM} layout={{}} />
                <pixiGraphics draw={drawFilterCurve} layout={{ width: Math.floor(VIS_W / 2), height: CMI_CONTENT_H - 100 }} />
              </pixiContainer>
            </pixiContainer>
          </pixiContainer>
        )}

        {/* Page F: FILTER */}
        {cmi.activeTab === 'filter' && (
          <pixiContainer layout={{ width, height: CMI_CONTENT_H, flexDirection: 'row', paddingLeft: 12, paddingTop: 8, gap: 16 }}>
            <pixiContainer layout={{ width: VIS_W, flexDirection: 'column', gap: 4 }}>
              <pixiBitmapText text="SSM2045 x2 CASCADED LOWPASS (-24dB/oct)" style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }} tint={G} layout={{}} />
              <pixiGraphics draw={drawFilterCurve} layout={{ width: VIS_W, height: CURVE_H }} />
              <pixiBitmapText text={`Cutoff: ${formatCutoffHz(cmi.cutoff)}Hz | Max: 14kHz`} style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }} tint={G_DIM} layout={{}} />
            </pixiContainer>
            <pixiContainer layout={{ flexDirection: 'column', gap: 12, paddingTop: 16 }}>
              <PixiKnob value={cmi.cutoff} min={0} max={255} defaultValue={200} onChange={(v) => cmi.handleParamChange('filter_cutoff', v)} label="CUTOFF" size="md" color={G} formatValue={fmtCutoff} />
              <PixiKnob value={cmi.filterTrack} min={0} max={255} defaultValue={128} onChange={(v) => cmi.handleParamChange('filter_track', v)} label="KEY TRACK" size="md" color={G} formatValue={fmtTrack} />
            </pixiContainer>
          </pixiContainer>
        )}

        {/* Page E: ENVELOPE */}
        {cmi.activeTab === 'envelope' && (
          <pixiContainer layout={{ width, height: CMI_CONTENT_H, flexDirection: 'row', paddingLeft: 12, paddingTop: 8, gap: 16 }}>
            <pixiContainer layout={{ width: VIS_W, flexDirection: 'column', gap: 4 }}>
              <pixiBitmapText text="HARDWARE ENVELOPE GENERATOR" style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }} tint={G} layout={{}} />
              <pixiGraphics draw={drawEnvelopeCurve} layout={{ width: VIS_W, height: CURVE_H }} />
              <pixiBitmapText text="8-bit up/down counter | 6-bit divider chain | PTM6840 timer-driven" style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }} tint={G_DIM} layout={{}} />
            </pixiContainer>
            <pixiContainer layout={{ flexDirection: 'column', gap: 12, paddingTop: 16 }}>
              <PixiKnob value={cmi.attackTime} min={0} max={255} defaultValue={10} onChange={(v) => cmi.handleParamChange('attack_time', v)} label="ATTACK" size="md" color={G} formatValue={fmtInt} />
              <PixiKnob value={cmi.releaseTime} min={0} max={255} defaultValue={80} onChange={(v) => cmi.handleParamChange('release_time', v)} label="RELEASE" size="md" color={G} formatValue={fmtInt} />
              <PixiKnob value={cmi.envRate} min={0} max={255} defaultValue={200} onChange={(v) => cmi.handleParamChange('envelope_rate', v)} label="RATE" size="md" color={G} formatValue={fmtInt} />
            </pixiContainer>
          </pixiContainer>
        )}
      </layoutContainer>
    </layoutContainer>
  );
};

PixiCMIKnobPanel.displayName = 'PixiCMIKnobPanel';
export default PixiCMIKnobPanel;
