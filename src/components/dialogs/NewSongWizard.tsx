/**
 * NewSongWizard — Multi-step wizard for creating a new song.
 *
 * Step 1: "Start From" — Empty Song or System Preset
 * Step 2: Preset Browser — grouped system preset selection
 * Step 3: Starter Instruments — load preset or start empty
 *
 * On Finish: resets stores, applies preset + Amiga settings,
 * optionally loads starter instruments, tracks active system.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { X, Music2, Cpu, ChevronRight, ChevronLeft, Check, Search } from 'lucide-react';
import { useUIStore } from '@stores/useUIStore';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { useTabsStore } from '@stores/useTabsStore';
import { getGroupedPresets, SYSTEM_PRESETS } from '@constants/systemPresets';
import type { SystemPreset } from '@constants/systemPresets';
import { AMIGA_UADE_PRESET_IDS, getInstrumentPresetsForSystem } from '@constants/uadeInstrumentPresets';
import { useModalClose } from '@hooks/useDialogKeyboard';

type WizardStep = 1 | 2 | 3;
type StartMode = 'empty' | 'preset';

const GROUPED_PRESETS = getGroupedPresets();

export const NewSongWizard: React.FC = () => {
  const isOpen = useUIStore((s) => s.newSongWizardOpen);
  const close = useUIStore((s) => s.closeNewSongWizard);
  useModalClose({ isOpen, onClose: close });

  const [step, setStep] = useState<WizardStep>(1);
  const [startMode, setStartMode] = useState<StartMode>('empty');
  const [selectedPresetId, setSelectedPresetId] = useState<string>('amiga_protracker');
  const [withPresetInstruments, setWithPresetInstruments] = useState(true);

  // useCallback must be called before any early return to keep hook order stable
  const finish = useCallback(
    (mode: StartMode, loadInstruments: boolean) => {
      const presetId = selectedPresetId;
      // 1. addTab() saves current project state and resets stores to blank
      // NOTE: addTab → restoreState → loadInstruments uses queueMicrotask to
      // defer the instrument state reset. We must defer our work too, otherwise
      // the microtask overwrites any instruments we create synchronously here.
      useTabsStore.getState().addTab();

      // Defer preset application so it runs AFTER loadInstruments' microtask
      queueMicrotask(() => {
        // 2. Apply system preset (channel names, colors, count)
        if (mode === 'preset' && presetId) {
          useTrackerStore.getState().applySystemPreset(presetId);

          // 3. Apply Amiga song settings (hard-panning + BPM) if Amiga format
          if (AMIGA_UADE_PRESET_IDS.has(presetId)) {
            useTrackerStore.getState().applyAmigaSongSettings(presetId);
          }
        }

        // 4. Load starter instruments
        if (mode === 'preset' && loadInstruments && presetId) {
          const presets = getInstrumentPresetsForSystem(presetId);
          presets.forEach((inst) => {
            useInstrumentStore.getState().createInstrument(inst);
          });
        }

        // 5. Track active system for filtering
        useUIStore.getState().setActiveSystemPreset(
          mode === 'preset' ? presetId : null
        );

        useUIStore.getState().setStatusMessage('New project', false, 1500);
      });

      setStep(1);
      setStartMode('empty');
      setSelectedPresetId('amiga_protracker');
      setWithPresetInstruments(true);
      close();
    },
    [selectedPresetId, close]
  );

  if (!isOpen) return null;

  const selectedPreset: SystemPreset | undefined = SYSTEM_PRESETS.find(
    (p) => p.id === selectedPresetId
  );

  const hasStarterInstruments =
    selectedPresetId !== '' &&
    (getInstrumentPresetsForSystem(selectedPresetId).length) > 0;

  const starterInstruments = getInstrumentPresetsForSystem(selectedPresetId);

  // --- Navigation ---
  const handleNext = () => {
    if (step === 1) {
      if (startMode === 'empty') {
        finish('empty', false);
      } else {
        setStep(2);
      }
    } else if (step === 2) {
      if (hasStarterInstruments) {
        setStep(3);
      } else {
        finish('preset', false);
      }
    }
  };

  const handleBack = () => {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  };

  const handleCancel = () => {
    setStep(1);
    setStartMode('empty');
    setSelectedPresetId('amiga_protracker');
    setWithPresetInstruments(true);
    close();
  };

  const handleFinish = () => {
    finish('preset', withPresetInstruments);
  };

  const nextLabel =
    step === 1
      ? 'Next'
      : step === 2
        ? hasStarterInstruments
          ? 'Next'
          : 'Finish'
        : 'Finish';

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999] p-4 backdrop-blur-sm">
      <div className="bg-dark-bgSecondary border border-dark-border rounded-lg shadow-2xl w-full max-w-2xl flex flex-col" style={{ height: 'min(92vh, 700px)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border shrink-0">
          <div className="flex items-center gap-3">
            <Music2 size={18} className="text-accent-primary" />
            <h2 className="text-sm font-semibold text-text-primary">New Song</h2>
            <span className="text-xs text-text-muted">
              Step {step} of {startMode === 'preset' ? (hasStarterInstruments ? 3 : 2) : 1}
            </span>
          </div>
          <button
            onClick={handleCancel}
            className="p-1 rounded hover:bg-dark-border text-text-muted hover:text-text-primary transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden min-h-0">
          {step === 1 && (
            <StepStart
              startMode={startMode}
              onSelectMode={setStartMode}
            />
          )}
          {step === 2 && (
            <StepPresetBrowser
              selectedPresetId={selectedPresetId}
              onSelectPreset={setSelectedPresetId}
            />
          )}
          {step === 3 && (
            <StepInstruments
              presetName={selectedPreset?.name ?? ''}
              instruments={starterInstruments.map((i) => i.name ?? '')}
              withInstruments={withPresetInstruments}
              onToggle={setWithPresetInstruments}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-dark-border shrink-0">
          <button
            onClick={handleCancel}
            className="text-xs text-text-muted hover:text-text-primary transition-colors px-3 py-1.5 rounded hover:bg-dark-border"
          >
            Cancel
          </button>
          <div className="flex gap-2">
            {step > 1 && (
              <button
                onClick={handleBack}
                className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors px-3 py-1.5 rounded hover:bg-dark-border"
              >
                <ChevronLeft size={14} />
                Back
              </button>
            )}
            <button
              onClick={step === 3 ? handleFinish : handleNext}
              className="flex items-center gap-1.5 text-xs bg-accent-primary text-black font-semibold px-4 py-1.5 rounded hover:bg-accent-primary/90 transition-colors"
            >
              {nextLabel === 'Finish' ? (
                <>
                  <Check size={14} />
                  Finish
                </>
              ) : (
                <>
                  {nextLabel}
                  <ChevronRight size={14} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────── Step 1: Start From ─────────────────────────── */

interface StepStartProps {
  startMode: StartMode;
  onSelectMode: (mode: StartMode) => void;
}

const StepStart: React.FC<StepStartProps> = ({ startMode, onSelectMode }) => (
  <div className="p-6 flex flex-col gap-4">
    <p className="text-sm text-text-muted">How do you want to start?</p>

    <div className="grid grid-cols-2 gap-4">
      <button
        onClick={() => onSelectMode('empty')}
        className={`flex flex-col items-center gap-3 p-6 rounded-lg border-2 transition-all ${
          startMode === 'empty'
            ? 'border-accent-primary bg-accent-primary/10 text-text-primary'
            : 'border-dark-border bg-dark-bg text-text-muted hover:border-dark-borderHover hover:text-text-primary'
        }`}
      >
        <Music2 size={28} className={startMode === 'empty' ? 'text-accent-primary' : ''} />
        <div className="text-center">
          <div className="text-sm font-semibold">Empty Song</div>
          <div className="text-xs text-text-muted mt-1">
            4 blank channels, default BPM
          </div>
        </div>
      </button>

      <button
        onClick={() => onSelectMode('preset')}
        className={`flex flex-col items-center gap-3 p-6 rounded-lg border-2 transition-all ${
          startMode === 'preset'
            ? 'border-accent-primary bg-accent-primary/10 text-text-primary'
            : 'border-dark-border bg-dark-bg text-text-muted hover:border-dark-borderHover hover:text-text-primary'
        }`}
      >
        <Cpu size={28} className={startMode === 'preset' ? 'text-accent-primary' : ''} />
        <div className="text-center">
          <div className="text-sm font-semibold">System Preset</div>
          <div className="text-xs text-text-muted mt-1">
            Hardware-specific channels and format
          </div>
        </div>
      </button>
    </div>
  </div>
);

/* ──────────────────────── Step 2: Preset Browser ────────────────────────── */

interface StepPresetBrowserProps {
  selectedPresetId: string;
  onSelectPreset: (id: string) => void;
}

const StepPresetBrowser: React.FC<StepPresetBrowserProps> = ({
  selectedPresetId,
  onSelectPreset,
}) => {
  const [filter, setFilter] = useState('');
  const selected = SYSTEM_PRESETS.find((p) => p.id === selectedPresetId);
  const hasPresetInstruments =
    (getInstrumentPresetsForSystem(selectedPresetId).length) > 0;

  const filteredGroups = useMemo(() => {
    const sorted = GROUPED_PRESETS.map((group) => ({
      ...group,
      presets: [...group.presets].sort((a, b) => a.name.localeCompare(b.name)),
    }));
    if (!filter.trim()) return sorted;
    const q = filter.toLowerCase();
    return sorted
      .map((group) => ({
        ...group,
        presets: group.presets.filter(
          (p) => p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q) || group.label.toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.presets.length > 0);
  }, [filter]);

  return (
    <div className="flex h-full min-h-0">
      {/* Left: Search + Group + preset list */}
      <div className="w-64 shrink-0 border-r border-dark-border flex flex-col min-h-0">
        <div className="px-2 py-2 border-b border-dark-border shrink-0">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter presets..."
              className="w-full pl-7 pr-2 py-1.5 text-xs bg-dark-bg border border-dark-border rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary"
              autoFocus
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {filteredGroups.map((group) => (
            <div key={group.label}>
              <div className="px-3 py-1.5 text-[10px] font-bold text-text-muted uppercase tracking-wider bg-dark-bg border-b border-dark-border sticky top-0">
                {group.label}
              </div>
              {group.presets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => onSelectPreset(preset.id)}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                    selectedPresetId === preset.id
                      ? 'bg-accent-primary/20 text-text-primary border-l-2 border-accent-primary'
                      : 'text-text-muted hover:bg-dark-border hover:text-text-primary'
                  }`}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          ))}
          {filteredGroups.length === 0 && (
            <div className="text-xs text-text-muted text-center py-6">No matches</div>
          )}
        </div>
      </div>

      {/* Right: Preset details */}
      <div className="flex-1 p-5 overflow-y-auto">
        {selected ? (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">{selected.name}</h3>
              <p className="text-xs text-text-muted mt-1">{selected.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-dark-bg rounded p-3 border border-dark-border">
                <div className="text-text-muted mb-1">Channels</div>
                <div className="text-text-primary font-semibold">{selected.channels}</div>
              </div>
              <div className="bg-dark-bg rounded p-3 border border-dark-border">
                <div className="text-text-muted mb-1">BPM</div>
                <div className="text-text-primary font-semibold">
                  {selected.defaultBpm ?? 125}
                </div>
              </div>
            </div>

            {selected.compatibleSynthTypes && (
              <div className="bg-dark-bg rounded p-3 border border-dark-border text-xs">
                <div className="text-text-muted mb-2">Compatible Synths</div>
                <div className="flex flex-wrap gap-1">
                  {selected.compatibleSynthTypes.map((t) => (
                    <span
                      key={t}
                      className="px-2 py-0.5 bg-accent-primary/20 text-accent-primary rounded text-[11px]"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {selected.channelDefs.length > 0 && (
              <div className="text-xs">
                <div className="text-text-muted mb-2">Channel Layout</div>
                <div className="space-y-1">
                  {selected.channelDefs.map((ch, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 py-1 px-2 bg-dark-bg rounded border border-dark-border"
                    >
                      <span className="text-text-muted w-6 text-right shrink-0">{i + 1}</span>
                      <span className="text-text-primary">{ch.name}</span>
                      <span className="ml-auto text-text-muted font-mono">{ch.shortName}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {hasPresetInstruments && (
              <div className="flex items-center gap-2 p-3 bg-accent-primary/10 rounded border border-accent-primary/30 text-xs text-accent-primary">
                <Check size={12} />
                Includes {getInstrumentPresetsForSystem(selectedPresetId).length} starter instruments
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">
            Select a preset
          </div>
        )}
      </div>
    </div>
  );
};

/* ─────────────────────── Step 3: Starter Instruments ────────────────────── */

interface StepInstrumentsProps {
  presetName: string;
  instruments: string[];
  withInstruments: boolean;
  onToggle: (v: boolean) => void;
}

const StepInstruments: React.FC<StepInstrumentsProps> = ({
  presetName,
  instruments,
  withInstruments,
  onToggle,
}) => (
  <div className="p-6 space-y-4">
    <p className="text-sm text-text-muted">
      <span className="text-text-primary font-medium">{presetName}</span> includes starter
      instruments. Would you like to load them?
    </p>

    <div className="grid grid-cols-2 gap-4">
      <button
        onClick={() => onToggle(true)}
        className={`flex flex-col items-start gap-2 p-4 rounded-lg border-2 transition-all ${
          withInstruments
            ? 'border-accent-primary bg-accent-primary/10'
            : 'border-dark-border bg-dark-bg hover:border-dark-borderHover'
        }`}
      >
        <div className="flex items-center gap-2">
          {withInstruments && <Check size={14} className="text-accent-primary" />}
          <span className="text-sm font-semibold text-text-primary">Load Preset Instruments</span>
        </div>
        <span className="text-xs text-text-muted">
          Add {instruments.length} named instruments ready to use
        </span>
      </button>

      <button
        onClick={() => onToggle(false)}
        className={`flex flex-col items-start gap-2 p-4 rounded-lg border-2 transition-all ${
          !withInstruments
            ? 'border-accent-primary bg-accent-primary/10'
            : 'border-dark-border bg-dark-bg hover:border-dark-borderHover'
        }`}
      >
        <div className="flex items-center gap-2">
          {!withInstruments && <Check size={14} className="text-accent-primary" />}
          <span className="text-sm font-semibold text-text-primary">Start Empty</span>
        </div>
        <span className="text-xs text-text-muted">No instruments — add your own</span>
      </button>
    </div>

    {withInstruments && instruments.length > 0 && (
      <div className="text-xs">
        <div className="text-text-muted mb-2">Instruments to be added:</div>
        <div className="grid grid-cols-2 gap-1">
          {instruments.map((name, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-2 py-1 bg-dark-bg rounded border border-dark-border"
            >
              <span className="text-text-muted w-4 text-right shrink-0 font-mono">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="text-text-primary">{name}</span>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
);
