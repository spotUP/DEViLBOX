/**
 * PixiInstrumentEditor — Instrument editor for WebGL mode.
 * Uses the generic PixiSynthPanel renderer with per-synth layout configs.
 */

import { useCallback } from 'react';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';
import { PixiLabel } from '../components';
import { PixiSynthPanel } from './instruments/PixiSynthPanel';
import { PixiEnvelopeEditor } from './instruments/PixiEnvelopeEditor';
import { getSynthLayout } from './instruments/layouts';
import type { InstrumentConfig, EnvelopeConfig } from '@/types/instrument';
import { PixiUADELiveParams } from './instruments/PixiUADELiveParams';
import { PixiUADEDebuggerPanel } from './instruments/PixiUADEDebuggerPanel';
import { useInstrumentStore } from '@stores/useInstrumentStore';

interface PixiInstrumentEditorProps {
  synthType: string;
  config: Record<string, unknown>;
  onChange: (updates: Record<string, unknown>) => void;
  instrumentName?: string;
}

// ─── Envelope section sub-component ─────────────────────────────────────────

interface PixiEnvelopeSectionProps {
  envelope: EnvelopeConfig;
  config: Record<string, unknown>;
  onChange: (updates: Record<string, unknown>) => void;
}

const PixiEnvelopeSection: React.FC<PixiEnvelopeSectionProps> = ({ envelope, config, onChange }) => {
  const theme = usePixiTheme();

  const configRef = useCallback(() => config, [config]);

  const handleEnvelopeChange = useCallback((param: 'attack' | 'decay' | 'sustain' | 'release', value: number) => {
    const current = (configRef() as unknown as InstrumentConfig).envelope ?? {};
    onChange({ envelope: { ...current, [param]: value } });
  }, [configRef, onChange]);

  // Normalize envelope values to 0-1 for the editor.
  // EnvelopeConfig uses raw ms/% values; normalize against max ranges:
  // attack 0-2000ms, decay 0-2000ms, sustain 0-100%, release 0-5000ms
  const attackNorm = Math.max(0, Math.min(1, (envelope.attack ?? 0) / 2000));
  const decayNorm = Math.max(0, Math.min(1, (envelope.decay ?? 0) / 2000));
  const sustainNorm = Math.max(0, Math.min(1, (envelope.sustain ?? 0) / 100));
  const releaseNorm = Math.max(0, Math.min(1, (envelope.release ?? 0) / 5000));

  const handleChange = useCallback((param: 'attack' | 'decay' | 'sustain' | 'release', normValue: number) => {
    // Denormalize back to raw values
    const denorm: Record<'attack' | 'decay' | 'sustain' | 'release', number> = {
      attack: Math.round(normValue * 2000),
      decay: Math.round(normValue * 2000),
      sustain: Math.round(normValue * 100),
      release: Math.round(normValue * 5000),
    };
    handleEnvelopeChange(param, denorm[param]);
  }, [handleEnvelopeChange]);

  return (
    <pixiContainer
      layout={{
        width: '100%',
        flexDirection: 'column',
        gap: 6,
        padding: 8,
        paddingTop: 4,
      }}
    >
      {/* Section divider */}
      <pixiContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <pixiBitmapText
          text="ENVELOPE"
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 11, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{}}
        />
        <layoutContainer alpha={0.15} layout={{ flex: 1, height: 1, backgroundColor: theme.border.color }} />
      </pixiContainer>

      <PixiEnvelopeEditor
        attack={attackNorm}
        decay={decayNorm}
        sustain={sustainNorm}
        release={releaseNorm}
        onChange={handleChange}
        width={300}
        height={100}
      />
    </pixiContainer>
  );
};

// ─── Main editor ──────────────────────────────────────────────────────────────

export const PixiInstrumentEditor: React.FC<PixiInstrumentEditorProps> = ({
  synthType,
  config,
  onChange,
  instrumentName,
}) => {
  const theme = usePixiTheme();

  const layout = getSynthLayout(synthType);

  const instrConfig = config as unknown as InstrumentConfig;
  const uadeChipRam = instrConfig.uadeChipRam;
  const hasSections = uadeChipRam?.sections?.['volume'] != null
                   || uadeChipRam?.sections?.['period'] != null;
  const instrumentId = String(instrConfig.id ?? '');
  const isUADE = uadeChipRam != null;
  const allInstruments = useInstrumentStore((s) => s.instruments);

  return (
    <pixiContainer
      layout={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <layoutContainer
        layout={{
          width: '100%',
          height: 40,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 12,
          paddingRight: 12,
          gap: 12,
          backgroundColor: theme.bgSecondary.color,
          borderBottomWidth: 1,
          borderColor: theme.border.color,
        }}
      >

        <PixiLabel text="INSTRUMENT EDITOR" size="sm" weight="bold" color="accent" />

        {instrumentName && (
          <PixiLabel text={instrumentName} size="sm" color="textSecondary" />
        )}

        <pixiContainer layout={{ flex: 1 }} />

        <PixiLabel text={synthType} size="xs" color="textMuted" />
      </layoutContainer>

      {/* Content area */}
      <pixiContainer
        layout={{
          flex: 1,
          width: '100%',
          overflow: 'hidden',
        }}
      >
        {layout ? (
          <pixiContainer layout={{ flex: 1, width: '100%', flexDirection: 'column', overflow: 'hidden' }}>
            <PixiSynthPanel
              layout={layout}
              config={config}
              onChange={onChange}
              synthType={synthType}
            />

            {/* Envelope editor — shown for Sampler/Player with an envelope config */}
            {(synthType === 'Sampler' || synthType === 'Player') && instrConfig.envelope && (
              <PixiEnvelopeSection
                envelope={instrConfig.envelope}
                onChange={onChange}
                config={config}
              />
            )}
          </pixiContainer>
        ) : (
          <pixiContainer
            layout={{
              flex: 1,
              width: '100%',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <pixiBitmapText
              text={`No PixiJS layout for "${synthType}"`}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
              tint={theme.textMuted.color}
              layout={{}}
            />
            <pixiBitmapText
              text="Add layout config to src/pixi/views/instruments/layouts/"
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
              tint={theme.textMuted.color}
              layout={{ marginTop: 4 }}
            />
          </pixiContainer>
        )}
      </pixiContainer>

      {/* UADE live params (enhanced-scan instruments only) */}
      {hasSections && (
        <PixiUADELiveParams
          instrumentId={instrumentId}
          sections={uadeChipRam!.sections}
        />
      )}

      {/* UADE Paula debugger (all UADE instruments) */}
      {isUADE && (
        <PixiUADEDebuggerPanel instruments={allInstruments} />
      )}
    </pixiContainer>
  );
};
