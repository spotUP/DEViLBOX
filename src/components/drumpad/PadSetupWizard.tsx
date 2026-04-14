/**
 * PadSetupWizard — Step-by-step wizard for setting up a drum pad.
 *
 * Step 1: Choose source type (Sample, Synth, DJ FX, One Shot, Scratch, Clipboard)
 * Step 2: Choose sound (varies by source type)
 * Step 3: Quick config (name, color, play mode, mute group)
 *
 * Shared logic: src/hooks/drumpad/usePadSetupWizard.ts
 */

import React, { useState } from 'react';
import { X, ChevronLeft, ChevronDown, ChevronRight } from 'lucide-react';
import { usePadSetupWizard, type SourceType } from '@/hooks/drumpad/usePadSetupWizard';
import { PAD_COLOR_PRESETS } from '@/constants/padColorPresets';
import {
  DEFAULT_DJFX_PADS,
  DEFAULT_ONESHOT_PADS,
  DEFAULT_SCRATCH_PADS,
} from '@/constants/djPadModeDefaults';
import { ONE_SHOT_PRESETS_BY_CATEGORY } from '@/constants/djOneShotPresetsByCategory';

// ── Source type icons (text-based, no emoji per project rules) ──────────────

const SOURCE_ICONS: Record<SourceType, string> = {
  sample: 'WAV',
  synth: '808',
  djfx: 'FX',
  oneshot: 'SFX',
  scratch: 'SCR',
  clipboard: 'CPY',
};

// ── Component ───────────────────────────────────────────────────────────────

interface PadSetupWizardProps {
  wizard: ReturnType<typeof usePadSetupWizard>;
}

export const PadSetupWizard: React.FC<PadSetupWizardProps> = ({ wizard }) => {
  if (!wizard.isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[99990] p-4 backdrop-blur-sm">
      <div className="bg-dark-bgSecondary border border-dark-border rounded-lg shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border shrink-0">
          <div className="flex items-center gap-3">
            {wizard.step > 1 && (
              <button onClick={wizard.handleBack} className="p-1 text-text-muted hover:text-text-primary transition-colors">
                <ChevronLeft size={16} />
              </button>
            )}
            <h2 className="text-sm font-mono font-bold text-text-primary">Setup Pad {wizard.padId}</h2>
            <span className="text-xs font-mono text-text-muted">
              Step {wizard.step} of {wizard.stepCount}
            </span>
          </div>
          <button onClick={wizard.close} className="p-1 text-text-muted hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {wizard.step === 1 && <StepSourceType wizard={wizard} />}
          {wizard.step === 2 && wizard.sourceType === 'sample' && <StepSampleCategory wizard={wizard} />}
          {wizard.step === 2 && wizard.sourceType === 'synth' && <StepSynthVoice wizard={wizard} />}
          {wizard.step === 2 && wizard.sourceType === 'djfx' && <StepDjFx wizard={wizard} />}
          {wizard.step === 2 && wizard.sourceType === 'oneshot' && <StepOneShot wizard={wizard} />}
          {wizard.step === 2 && wizard.sourceType === 'scratch' && <StepScratch wizard={wizard} />}
          {wizard.step === 3 && <StepQuickConfig wizard={wizard} />}
        </div>

        {/* Footer */}
        {wizard.step === 3 && (
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-dark-border shrink-0">
            <button
              onClick={wizard.skip}
              className="px-3 py-1.5 text-xs font-mono text-text-muted hover:text-text-primary transition-colors"
            >
              Skip
            </button>
            <button
              onClick={wizard.finish}
              className="px-4 py-1.5 text-xs font-mono font-bold text-dark-bg bg-accent-primary hover:bg-accent-primaryHover rounded transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Step 1: Source Type ──────────────────────────────────────────────────────

const StepSourceType: React.FC<{ wizard: ReturnType<typeof usePadSetupWizard> }> = ({ wizard }) => (
  <div className="grid grid-cols-3 gap-3">
    {wizard.sourceTypeOptions.map((opt) => (
      <button
        key={opt.type}
        disabled={!opt.available}
        onClick={() => wizard.selectSourceType(opt.type)}
        className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-all ${
          opt.available
            ? 'border-dark-borderLight bg-dark-bgTertiary hover:border-accent-primary hover:bg-accent-primary/10 cursor-pointer'
            : 'border-dark-border bg-dark-bg opacity-30 cursor-not-allowed'
        }`}
      >
        <span className="text-lg font-mono font-bold text-accent-primary">
          {SOURCE_ICONS[opt.type]}
        </span>
        <span className="text-xs font-mono font-bold text-text-primary">{opt.label}</span>
        <span className="text-[10px] font-mono text-text-muted text-center">{opt.description}</span>
      </button>
    ))}
  </div>
);

// ── Step 2: Sample Category ─────────────────────────────────────────────────

const StepSampleCategory: React.FC<{ wizard: ReturnType<typeof usePadSetupWizard> }> = ({ wizard }) => (
  <div className="flex flex-col gap-3">
    <p className="text-xs font-mono text-text-muted">Pick a sample category:</p>
    <div className="grid grid-cols-4 gap-2">
      {wizard.sampleCategories.map((cat) => (
        <button
          key={cat.category}
          onClick={() => wizard.selectSampleCategory(cat.category)}
          className="px-3 py-3 rounded-lg border border-dark-borderLight bg-dark-bgTertiary hover:border-accent-primary hover:bg-accent-primary/10 transition-all text-center"
        >
          <span className="text-xs font-mono font-bold text-text-primary">{cat.label}</span>
        </button>
      ))}
    </div>
  </div>
);

// ── Step 2: Synth Voice ─────────────────────────────────────────────────────

const StepSynthVoice: React.FC<{ wizard: ReturnType<typeof usePadSetupWizard> }> = ({ wizard }) => (
  <div className="flex flex-col gap-4">
    {Array.from(wizard.synthPresetsByMachine.entries()).map(([machine, presets]) => (
      <div key={machine} className="flex flex-col gap-2">
        <span className="text-xs font-mono font-bold text-accent-primary">{machine}</span>
        <div className="grid grid-cols-4 gap-2">
          {presets.map((preset) => (
            <button
              key={preset.label}
              onClick={() => wizard.selectSynthPreset(preset)}
              className="px-2 py-2 rounded border border-dark-borderLight bg-dark-bgTertiary hover:border-accent-primary hover:bg-accent-primary/10 transition-all text-center"
            >
              <span className="text-[11px] font-mono text-text-primary">
                {preset.label.replace(/^(808|909)\s/, '')}
              </span>
            </button>
          ))}
        </div>
      </div>
    ))}
  </div>
);

// ── Step 2: DJ FX ───────────────────────────────────────────────────────────

const StepDjFx: React.FC<{ wizard: ReturnType<typeof usePadSetupWizard> }> = ({ wizard }) => (
  <div className="flex flex-col gap-2">
    <p className="text-xs font-mono text-text-muted">Pick an effect (applies immediately):</p>
    <div className="grid grid-cols-4 gap-2">
      {DEFAULT_DJFX_PADS.map((fx) => (
        <button
          key={fx.actionId}
          onClick={() => wizard.selectDjFx(fx.actionId, fx.label, fx.category)}
          className="px-2 py-2 rounded border transition-all text-center hover:brightness-125"
          style={{
            borderColor: fx.color,
            backgroundColor: `${fx.color}15`,
            color: fx.color,
          }}
        >
          <span className="text-[10px] font-mono font-bold">{fx.label}</span>
        </button>
      ))}
    </div>
  </div>
);

// ── Step 2: One Shot ────────────────────────────────────────────────────────

const StepOneShot: React.FC<{ wizard: ReturnType<typeof usePadSetupWizard> }> = ({ wizard }) => {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const toggleCategory = (category: string) => {
    const next = new Set(expandedCategories);
    if (next.has(category)) {
      next.delete(category);
    } else {
      next.add(category);
    }
    setExpandedCategories(next);
  };

  if (showAll) {
    // Full preset browser view
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-mono text-text-muted">Browse all one-shot presets:</p>
          <button
            onClick={() => setShowAll(false)}
            className="text-[10px] font-mono text-accent-primary hover:text-accent-highlight transition-colors"
          >
            Quick View
          </button>
        </div>
        <div className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto pr-2">
          {Object.entries(ONE_SHOT_PRESETS_BY_CATEGORY).map(([categoryName, presets]) => {
            const isExpanded = expandedCategories.has(categoryName);
            return (
              <div key={categoryName} className="border border-dark-border rounded">
                <button
                  onClick={() => toggleCategory(categoryName)}
                  className="w-full px-3 py-2 flex items-center justify-between bg-dark-bgTertiary hover:bg-dark-surface transition-colors"
                >
                  <span className="text-[11px] font-mono font-bold text-text-primary">{categoryName} ({presets.length})</span>
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {isExpanded && (
                  <div className="grid grid-cols-3 gap-1.5 p-2">
                    {presets.map((preset) => (
                      <button
                        key={preset.index}
                        onClick={() => wizard.selectOneShot(preset.index, preset.name, preset.category)}
                        className="px-2 py-2 rounded border transition-all text-center hover:brightness-125"
                        style={{
                          borderColor: preset.color,
                          backgroundColor: `${preset.color}15`,
                          color: preset.color,
                        }}
                      >
                        <span className="text-[9px] font-mono font-bold">{preset.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Quick access view (original 16 options)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-mono text-text-muted">Quick access one-shots:</p>
        <button
          onClick={() => { setShowAll(true); setExpandedCategories(new Set(Object.keys(ONE_SHOT_PRESETS_BY_CATEGORY))); }}
          className="text-[10px] font-mono text-accent-primary hover:text-accent-highlight transition-colors"
        >
          Browse All ({Object.values(ONE_SHOT_PRESETS_BY_CATEGORY).flat().length})
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {DEFAULT_ONESHOT_PADS.map((os) => (
          <button
            key={os.presetIndex}
            onClick={() => wizard.selectOneShot(os.presetIndex, os.label, os.category)}
            className="px-2 py-2 rounded border transition-all text-center hover:brightness-125"
            style={{
              borderColor: os.color,
              backgroundColor: `${os.color}15`,
              color: os.color,
            }}
          >
            <span className="text-[10px] font-mono font-bold">{os.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

// ── Step 2: Scratch ─────────────────────────────────────────────────────────

const StepScratch: React.FC<{ wizard: ReturnType<typeof usePadSetupWizard> }> = ({ wizard }) => (
  <div className="flex flex-col gap-2">
    <p className="text-xs font-mono text-text-muted">Pick a scratch pattern (applies immediately):</p>
    <div className="grid grid-cols-4 gap-2">
      {DEFAULT_SCRATCH_PADS.map((sc) => (
        <button
          key={sc.actionId}
          onClick={() => wizard.selectScratch(sc.actionId, sc.label, sc.color)}
          className="px-2 py-2 rounded border transition-all text-center hover:brightness-125"
          style={{
            borderColor: sc.color,
            backgroundColor: `${sc.color}15`,
            color: sc.color,
          }}
        >
          <span className="text-[10px] font-mono font-bold">{sc.label}</span>
        </button>
      ))}
    </div>
  </div>
);

// ── Step 3: Quick Config ────────────────────────────────────────────────────

const StepQuickConfig: React.FC<{ wizard: ReturnType<typeof usePadSetupWizard> }> = ({ wizard }) => (
  <div className="flex flex-col gap-4">
    {/* Name */}
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-mono text-text-muted">Pad Name</span>
      <input
        value={wizard.padName}
        onChange={(e) => wizard.setPadName(e.target.value)}
        className="px-2 py-1.5 text-xs font-mono bg-dark-bg border border-dark-borderLight rounded text-text-primary"
        autoFocus
      />
    </label>

    {/* Color */}
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-mono text-text-muted">Color</span>
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => wizard.setPadColor(undefined)}
          className={`w-6 h-6 rounded border-2 transition-all ${
            !wizard.padColor
              ? 'border-accent-primary ring-1 ring-accent-primary/40'
              : 'border-dark-borderLight hover:border-text-muted'
          }`}
          style={{ backgroundColor: '#1e293b' }}
          title="Default"
        />
        {PAD_COLOR_PRESETS.map((c) => (
          <button
            key={c.id}
            onClick={() => wizard.setPadColor(c.hex)}
            className={`w-6 h-6 rounded border-2 transition-all ${
              wizard.padColor === c.hex
                ? 'border-white ring-1 ring-white/40'
                : 'border-transparent hover:border-white/30'
            }`}
            style={{ backgroundColor: c.hex }}
            title={c.label}
          />
        ))}
      </div>
    </div>

    {/* Play Mode */}
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-mono text-text-muted">Play Mode</span>
      <div className="flex gap-2">
        <button
          onClick={() => wizard.setPlayMode('oneshot')}
          className={`px-3 py-1.5 text-xs font-mono rounded border transition-all ${
            wizard.playMode === 'oneshot'
              ? 'border-accent-primary bg-accent-primary/10 text-accent-primary'
              : 'border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:border-text-muted'
          }`}
        >
          One-shot
        </button>
        <button
          onClick={() => wizard.setPlayMode('sustain')}
          className={`px-3 py-1.5 text-xs font-mono rounded border transition-all ${
            wizard.playMode === 'sustain'
              ? 'border-accent-primary bg-accent-primary/10 text-accent-primary'
              : 'border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:border-text-muted'
          }`}
        >
          Sustain
        </button>
      </div>
    </div>

    {/* Mute Group */}
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-mono text-text-muted">Mute Group</span>
      <div className="flex gap-1 flex-wrap">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((g) => (
          <button
            key={g}
            onClick={() => wizard.setMuteGroup(g)}
            className={`w-7 h-7 text-[10px] font-mono rounded border transition-all ${
              wizard.muteGroup === g
                ? 'border-accent-primary bg-accent-primary/10 text-accent-primary font-bold'
                : 'border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:border-text-muted'
            }`}
          >
            {g === 0 ? '-' : g}
          </button>
        ))}
      </div>
    </div>
  </div>
);
