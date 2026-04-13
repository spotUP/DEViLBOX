/**
 * PixiPadSetupWizard — GL-native drum pad setup wizard.
 *
 * Port of src/components/drumpad/PadSetupWizard.tsx using Pixi layout primitives.
 * Shared logic: src/hooks/drumpad/usePadSetupWizard.ts
 */

import React from 'react';
import { PixiModal, PixiModalHeader, PixiModalFooter } from '../components/PixiModal';
import { PixiButton } from '../components/PixiButton';
import { PixiLabel } from '../components/PixiLabel';
import { usePixiTheme } from '../theme';
import { Div, Txt } from '../layout';
import { usePadSetupWizard, type SourceType } from '@/hooks/drumpad/usePadSetupWizard';
import { PAD_COLOR_PRESETS } from '@/constants/padColorPresets';
import {
  DEFAULT_DJFX_PADS,
  DEFAULT_ONESHOT_PADS,
  DEFAULT_SCRATCH_PADS,
} from '@/constants/djPadModeDefaults';

// ── Source type labels ──────────────────────────────────────────────────────

const SOURCE_LABELS: Record<SourceType, { label: string; desc: string }> = {
  sample:    { label: 'Sample',    desc: 'Pick category' },
  synth:     { label: 'Synth',     desc: '808/909 voices' },
  djfx:      { label: 'DJ FX',    desc: 'Momentary FX' },
  oneshot:   { label: 'One Shot',  desc: 'Sound effects' },
  scratch:   { label: 'Scratch',   desc: 'DJ patterns' },
  clipboard: { label: 'Clipboard', desc: 'Paste pad' },
};

// ── Component ───────────────────────────────────────────────────────────────

interface Props {
  wizard: ReturnType<typeof usePadSetupWizard>;
}

export const PixiPadSetupWizard: React.FC<Props> = ({ wizard }) => {
  const theme = usePixiTheme();

  if (!wizard.isOpen) return null;

  const MODAL_W = 460;
  const MODAL_H = 420;

  return (
    <PixiModal
      isOpen={wizard.isOpen}
      onClose={wizard.close}
      width={MODAL_W}
      height={MODAL_H}
    >
      {/* Header */}
      <PixiModalHeader
        title={`Setup Pad ${wizard.padId ?? ''}`}
        subtitle={`Step ${wizard.step} of ${wizard.stepCount}`}
        onClose={wizard.close}
      />

      {/* Body */}
      <Div
        layout={{
          flex: 1,
          padding: 12,
          gap: 8,
          flexDirection: 'column',
          overflow: 'scroll',
        }}
      >
        {wizard.step === 1 && <PixiStepSourceType wizard={wizard} />}
        {wizard.step === 2 && wizard.sourceType === 'sample' && <PixiStepSample wizard={wizard} />}
        {wizard.step === 2 && wizard.sourceType === 'synth' && <PixiStepSynth wizard={wizard} />}
        {wizard.step === 2 && wizard.sourceType === 'djfx' && <PixiStepDjFx wizard={wizard} />}
        {wizard.step === 2 && wizard.sourceType === 'oneshot' && <PixiStepOneShot wizard={wizard} />}
        {wizard.step === 2 && wizard.sourceType === 'scratch' && <PixiStepScratch wizard={wizard} />}
        {wizard.step === 3 && <PixiStepConfig wizard={wizard} theme={theme} />}
      </Div>

      {/* Footer */}
      {wizard.step > 1 && (
        <PixiModalFooter>
          <PixiButton label="Back" variant="ghost" size="sm" onClick={wizard.handleBack} width={60} />
          <Div layout={{ flex: 1 }} />
          {wizard.step === 3 && (
            <>
              <PixiButton label="Skip" variant="ghost" size="sm" onClick={wizard.skip} width={50} />
              <PixiButton label="Done" variant="primary" size="sm" onClick={wizard.finish} width={60} />
            </>
          )}
        </PixiModalFooter>
      )}
    </PixiModal>
  );
};

// ── Step 1: Source Type Grid ────────────────────────────────────────────────

const PixiStepSourceType: React.FC<Props> = ({ wizard }) => {
  const theme = usePixiTheme();
  return (
    <Div layout={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {wizard.sourceTypeOptions.map((opt) => (
        <Div
          key={opt.type}
          eventMode={opt.available ? 'static' : 'none'}
          cursor={opt.available ? 'pointer' : undefined}
          alpha={opt.available ? 1 : 0.3}
          onPointerUp={opt.available ? () => wizard.selectSourceType(opt.type) : undefined}
          layout={{
            width: 130,
            height: 72,
            backgroundColor: theme.bgTertiary.color,
            borderWidth: 1,
            borderColor: theme.borderLight.color,
            borderRadius: 6,
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
          }}
        >
          <Txt className="text-sm font-bold text-accent-primary">
            {SOURCE_LABELS[opt.type].label}
          </Txt>
          <Txt className="text-[10px] text-text-muted">
            {SOURCE_LABELS[opt.type].desc}
          </Txt>
        </Div>
      ))}
    </Div>
  );
};

// ── Step 2: Sample Categories ───────────────────────────────────────────────

const PixiStepSample: React.FC<Props> = ({ wizard }) => {
  const theme = usePixiTheme();
  return (
    <Div layout={{ flexDirection: 'column', gap: 8 }}>
      <PixiLabel text="Pick a sample category:" size="xs" color="textMuted" />
      <Div layout={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {wizard.sampleCategories.map((cat) => (
          <Div
            key={cat.category}
            eventMode="static"
            cursor="pointer"
            onPointerUp={() => wizard.selectSampleCategory(cat.category)}
            layout={{
              width: 96,
              height: 40,
              backgroundColor: theme.bgTertiary.color,
              borderWidth: 1,
              borderColor: theme.borderLight.color,
              borderRadius: 4,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Txt className="text-xs font-bold text-text-primary">{cat.label}</Txt>
          </Div>
        ))}
      </Div>
    </Div>
  );
};

// ── Step 2: Synth Voices ────────────────────────────────────────────────────

const PixiStepSynth: React.FC<Props> = ({ wizard }) => (
  <Div layout={{ flexDirection: 'column', gap: 10 }}>
    {Array.from(wizard.synthPresetsByMachine.entries()).map(([machine, presets]) => (
      <Div key={machine} layout={{ flexDirection: 'column', gap: 6 }}>
        <PixiLabel text={machine} size="xs" weight="bold" color="accent" />
        <Div layout={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          {presets.map((p) => (
            <PixiButton
              key={p.label}
              label={p.label.replace(/^(808|909)\s/, '')}
              variant="ft2"
              size="sm"
              height={28}
              width={90}
              onClick={() => wizard.selectSynthPreset(p)}
            />
          ))}
        </Div>
      </Div>
    ))}
  </Div>
);

// ── Step 2: DJ FX ───────────────────────────────────────────────────────────

const PixiStepDjFx: React.FC<Props> = ({ wizard }) => (
  <Div layout={{ flexDirection: 'column', gap: 6 }}>
    <PixiLabel text="Pick an effect:" size="xs" color="textMuted" />
    <Div layout={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
      {DEFAULT_DJFX_PADS.map((fx) => (
        <PixiButton
          key={fx.actionId}
          label={fx.label}
          variant="ft2"
          size="sm"
          height={28}
          width={96}
          onClick={() => wizard.selectDjFx(fx.actionId, fx.label, fx.category)}
        />
      ))}
    </Div>
  </Div>
);

// ── Step 2: One Shot ────────────────────────────────────────────────────────

const PixiStepOneShot: React.FC<Props> = ({ wizard }) => (
  <Div layout={{ flexDirection: 'column', gap: 6 }}>
    <PixiLabel text="Pick a one-shot sound:" size="xs" color="textMuted" />
    <Div layout={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
      {DEFAULT_ONESHOT_PADS.map((os) => (
        <PixiButton
          key={os.presetIndex}
          label={os.label}
          variant="ft2"
          size="sm"
          height={28}
          width={96}
          onClick={() => wizard.selectOneShot(os.presetIndex, os.label, os.category)}
        />
      ))}
    </Div>
  </Div>
);

// ── Step 2: Scratch ─────────────────────────────────────────────────────────

const PixiStepScratch: React.FC<Props> = ({ wizard }) => (
  <Div layout={{ flexDirection: 'column', gap: 6 }}>
    <PixiLabel text="Pick a scratch pattern:" size="xs" color="textMuted" />
    <Div layout={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
      {DEFAULT_SCRATCH_PADS.map((sc) => (
        <PixiButton
          key={sc.actionId}
          label={sc.label}
          variant="ft2"
          size="sm"
          height={28}
          width={80}
          onClick={() => wizard.selectScratch(sc.actionId, sc.label, sc.color)}
        />
      ))}
    </Div>
  </Div>
);

// ── Step 3: Quick Config ────────────────────────────────────────────────────

const PixiStepConfig: React.FC<Props & { theme: ReturnType<typeof usePixiTheme> }> = ({ wizard, theme }) => (
  <Div layout={{ flexDirection: 'column', gap: 12 }}>
    {/* Color swatches */}
    <Div layout={{ flexDirection: 'column', gap: 4 }}>
      <PixiLabel text="Color" size="xs" color="textMuted" />
      <Div layout={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
        {/* Default (no color) */}
        <Div
          eventMode="static"
          cursor="pointer"
          onPointerUp={() => wizard.setPadColor(undefined)}
          layout={{
            width: 20,
            height: 20,
            backgroundColor: theme.bgTertiary.color,
            borderWidth: !wizard.padColor ? 2 : 1,
            borderColor: !wizard.padColor ? theme.accent.color : theme.borderLight.color,
            borderRadius: 3,
          }}
        />
        {PAD_COLOR_PRESETS.map((c) => {
          const num = parseInt(c.hex.slice(1), 16);
          const selected = wizard.padColor === c.hex;
          return (
            <Div
              key={c.id}
              eventMode="static"
              cursor="pointer"
              onPointerUp={() => wizard.setPadColor(c.hex)}
              layout={{
                width: 20,
                height: 20,
                backgroundColor: num,
                borderWidth: selected ? 2 : 1,
                borderColor: selected ? 0xffffff : theme.borderLight.color,
                borderRadius: 3,
              }}
            />
          );
        })}
      </Div>
    </Div>

    {/* Play Mode */}
    <Div layout={{ flexDirection: 'column', gap: 4 }}>
      <PixiLabel text="Play Mode" size="xs" color="textMuted" />
      <Div layout={{ flexDirection: 'row', gap: 6 }}>
        <PixiButton
          label="One-shot"
          variant={wizard.playMode === 'oneshot' ? 'primary' : 'default'}
          size="sm"
          height={26}
          width={80}
          onClick={() => wizard.setPlayMode('oneshot')}
        />
        <PixiButton
          label="Sustain"
          variant={wizard.playMode === 'sustain' ? 'primary' : 'default'}
          size="sm"
          height={26}
          width={80}
          onClick={() => wizard.setPlayMode('sustain')}
        />
      </Div>
    </Div>

    {/* Mute Group */}
    <Div layout={{ flexDirection: 'column', gap: 4 }}>
      <PixiLabel text="Mute Group" size="xs" color="textMuted" />
      <Div layout={{ flexDirection: 'row', gap: 3 }}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((g) => (
          <PixiButton
            key={g}
            label={g === 0 ? '-' : String(g)}
            variant={wizard.muteGroup === g ? 'primary' : 'default'}
            size="sm"
            height={24}
            width={24}
            onClick={() => wizard.setMuteGroup(g)}
          />
        ))}
      </Div>
    </Div>
  </Div>
);

export default PixiPadSetupWizard;
