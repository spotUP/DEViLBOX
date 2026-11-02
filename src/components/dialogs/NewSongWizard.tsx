/**
 * NewSongWizard — Multi-step wizard for creating a new song.
 *
 * Step 1: "Start From" — Empty Song or Format / System
 * Step 2: Browser — "Formats" group first (a real song in that format, opened
 *         from its template through openSong), then the system preset groups
 * Step 3: Starter Instruments — system presets that have them only
 *
 * On Finish: startNewSong with the chosen request.
 *
 * Shared logic lives in: src/hooks/dialogs/useNewSongWizard.ts
 */

import React, { useState, useMemo } from 'react';
import { X, Music2, Cpu, ChevronRight, ChevronLeft, Check, Search } from 'lucide-react';
import { newSongFormatMatches, type NewSongFormat } from '@/lib/formats/EditableFormatRegistry';
import { SYSTEM_PRESETS } from '@constants/systemPresets';
import { getInstrumentPresetsForSystem } from '@constants/uadeInstrumentPresets';
import { useModalClose } from '@hooks/useDialogKeyboard';
import { useNewSongWizard, GROUPED_PRESETS, NEW_SONG_FORMATS } from '@hooks/dialogs/useNewSongWizard';
import type { StartMode, WizardSelection } from '@hooks/dialogs/useNewSongWizard';

export const NewSongWizard: React.FC = () => {
  const {
    isOpen,
    close,
    step,
    startMode,
    setStartMode,
    selection,
    setSelection,
    withPresetInstruments,
    setWithPresetInstruments,
    selectedPreset,
    starterInstruments,
    stepCount,
    nextLabel,
    handleNext,
    handleBack,
    handleCancel,
    handleFinish,
  } = useNewSongWizard();

  useModalClose({ isOpen, onClose: close });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[99990] p-4 backdrop-blur-sm">
      <div className="bg-dark-bgSecondary border border-dark-border rounded-lg shadow-2xl w-full max-w-2xl flex flex-col" style={{ height: 'min(92vh, 700px)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border shrink-0">
          <div className="flex items-center gap-3">
            <Music2 size={18} className="text-accent-primary" />
            <h2 className="text-sm font-semibold text-text-primary">New Song</h2>
            <span className="text-xs text-text-muted">
              Step {step} of {stepCount}
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
              selection={selection}
              onSelect={setSelection}
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
            : 'border-dark-border bg-dark-bg text-text-muted hover:border-dark-borderLight hover:text-text-primary'
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
        onClick={() => onSelectMode('browse')}
        className={`flex flex-col items-center gap-3 p-6 rounded-lg border-2 transition-all ${
          startMode === 'browse'
            ? 'border-accent-primary bg-accent-primary/10 text-text-primary'
            : 'border-dark-border bg-dark-bg text-text-muted hover:border-dark-borderLight hover:text-text-primary'
        }`}
      >
        <Cpu size={28} className={startMode === 'browse' ? 'text-accent-primary' : ''} />
        <div className="text-center">
          <div className="text-sm font-semibold">Song Format or System</div>
          <div className="text-xs text-text-muted mt-1">
            A song in a tracker format, or hardware-specific channels
          </div>
        </div>
      </button>
    </div>
  </div>
);

/* ──────────────────────── Step 2: Preset Browser ────────────────────────── */

interface StepPresetBrowserProps {
  selection: WizardSelection;
  onSelect: (selection: WizardSelection) => void;
}

const FORMATS_GROUP_LABEL = 'Song Formats';

const StepPresetBrowser: React.FC<StepPresetBrowserProps> = ({
  selection,
  onSelect,
}) => {
  const [filter, setFilter] = useState('');
  const selectedPresetId = selection.kind === 'preset' ? selection.presetId : '';
  const selected = SYSTEM_PRESETS.find((p) => p.id === selectedPresetId);
  const selectedFormat: NewSongFormat | undefined = selection.kind === 'format'
    ? NEW_SONG_FORMATS.find((f) => f.formatId === selection.formatId)
    : undefined;
  const hasPresetInstruments =
    (getInstrumentPresetsForSystem(selectedPresetId).length) > 0;

  const q = filter.trim().toLowerCase();
  const filteredFormats = q && !FORMATS_GROUP_LABEL.toLowerCase().includes(q)
    ? NEW_SONG_FORMATS.filter((f) => newSongFormatMatches(f, q))
    : NEW_SONG_FORMATS;

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

  const rowClass = (active: boolean) => `w-full text-left px-3 py-2 text-xs transition-colors ${
    active
      ? 'bg-accent-primary/20 text-text-primary border-l-2 border-accent-primary'
      : 'text-text-muted hover:bg-dark-border hover:text-text-primary'
  }`;
  const groupHeaderClass = 'px-3 py-1.5 text-[10px] font-bold text-text-muted uppercase tracking-wider bg-dark-bg border-b border-dark-border sticky top-0';

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
              placeholder="Filter formats and systems..."
              className="w-full pl-7 pr-2 py-1.5 text-xs bg-dark-bg border border-dark-border rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary"
              autoFocus
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {filteredFormats.length > 0 && (
            <div>
              <div className={groupHeaderClass}>{FORMATS_GROUP_LABEL}</div>
              {filteredFormats.map((format) => (
                <button
                  key={format.formatId}
                  onClick={() => onSelect({ kind: 'format', formatId: format.formatId })}
                  className={rowClass(selectedFormat?.formatId === format.formatId)}
                >
                  {format.name}
                </button>
              ))}
            </div>
          )}
          {filteredGroups.map((group) => (
            <div key={group.label}>
              <div className={groupHeaderClass}>
                {group.label}
              </div>
              {group.presets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => onSelect({ kind: 'preset', presetId: preset.id })}
                  className={rowClass(selectedPresetId === preset.id)}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          ))}
          {filteredGroups.length === 0 && filteredFormats.length === 0 && (
            <div className="text-xs text-text-muted text-center py-6">No matches</div>
          )}
        </div>
      </div>

      {/* Right: Preset details */}
      <div className="flex-1 p-5 overflow-y-auto">
        {selectedFormat ? (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">{selectedFormat.name}</h3>
              <p className="text-xs text-text-muted mt-1">
                A blank song in this format. It opens in the format's own editor, plays on its own
                player and exports back to a native {selectedFormat.name} file.
              </p>
            </div>
          </div>
        ) : selected ? (
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
            Select a format or system
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
            : 'border-dark-border bg-dark-bg hover:border-dark-borderLight'
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
            : 'border-dark-border bg-dark-bg hover:border-dark-borderLight'
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
