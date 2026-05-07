/**
 * AddInstrumentDialog — Unified dialog for adding instruments.
 *
 * Four tabs:
 *   Synth   — Browse synth types (CategorizedSynthSelector)
 *   Preset  — Browse factory/user presets (LoadPresetModal embedded)
 *   Sample  — Browse sample packs (SamplePackBrowser embedded)
 *   Library — Browse NKS/DEViLBOX preset library (NKSLibraryBrowser)
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Music2, FolderOpen, Package, Library } from 'lucide-react';
import { CategorizedSynthSelector } from './shared/CategorizedSynthSelector';
import { LoadPresetModal } from './presets';
import { SamplePackBrowser } from './SamplePackBrowser';
import { NKSLibraryBrowser, type PresetLoadEvent } from '@components/midi/NKSLibraryBrowser';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { notify } from '@stores/useNotificationStore';
import { setPendingPresetData } from '@lib/pendingPresetData';
import type { InstrumentConfig, SynthType } from '@typedefs/instrument';

type AddTab = 'synth' | 'preset' | 'sample' | 'library';

interface AddInstrumentDialogProps {
  onClose: () => void;
  onCreateWithSynthType: (synthType: SynthType) => void;
}

const TABS: { id: AddTab; label: string; icon: React.ReactNode }[] = [
  { id: 'synth', label: 'Synth', icon: <Music2 size={14} /> },
  { id: 'preset', label: 'Preset', icon: <FolderOpen size={14} /> },
  { id: 'sample', label: 'Sample', icon: <Package size={14} /> },
  { id: 'library', label: 'Library', icon: <Library size={14} /> },
];

export const AddInstrumentDialog: React.FC<AddInstrumentDialogProps> = ({
  onClose,
  onCreateWithSynthType,
}) => {
  const [activeTab, setActiveTab] = useState<AddTab>('synth');

  const currentInstrumentId = useInstrumentStore((s) => s.currentInstrumentId);
  const instruments = useInstrumentStore((s) => s.instruments);
  const updateInstrument = useInstrumentStore((s) => s.updateInstrument);
  const createInstrument = useInstrumentStore((s) => s.createInstrument);

  const handleLibraryLoad = ({ preset, data }: PresetLoadEvent) => {
    // DEViLBOX-native synth presets (Helm, Surge, Dexed, etc.)
    if ('synth' in preset && preset.synth) {
      const synthTypeMap: Record<string, string> = {
        helm: 'Helm', surge: 'Surge', obxf: 'OBXf', odin2: 'Odin2', dexed: 'DX7',
      };
      const synthType = synthTypeMap[preset.synth];
      if (synthType) {
        const hasCurrentInstrument = currentInstrumentId !== null &&
          instruments.some(i => i.id === currentInstrumentId);
        if (hasCurrentInstrument) {
          updateInstrument(currentInstrumentId!, {
            name: preset.name,
            synthType: synthType as InstrumentConfig['synthType'],
          });
        } else {
          createInstrument({
            name: preset.name,
            synthType: synthType as InstrumentConfig['synthType'],
          });
        }
        if (data) {
          const presetType = preset.synth === 'helm' ? 'helm' : 'dexed';
          setPendingPresetData(presetType as 'helm' | 'dexed', data);
        }
        notify.success(`Loaded: ${preset.name}`);
        onClose();
        return;
      }
    }

    // NKS presets (Kontakt, Massive, FM8, etc.) — route MIDI through bridge
    if ('vendor' in preset && 'product' in preset) {
      const presetName = `${(preset as { product: string }).product}: ${preset.name}`;
      createInstrument({
        name: presetName,
        synthType: 'Kontakt' as InstrumentConfig['synthType'],
      });
      notify.success(`Loaded: ${presetName}`);
      onClose();
      return;
    }

    notify.success(`Loaded: ${preset.name}`);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[99990] bg-black/80 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-dark-bg border border-dark-border rounded-lg shadow-2xl w-[95%] max-w-5xl h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with tabs */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border flex-shrink-0">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <Music2 size={20} className="text-accent-primary" />
              Add Instrument
            </h3>
            <div className="flex bg-dark-bgSecondary rounded overflow-hidden border border-dark-border">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-all ${
                    activeTab === tab.id
                      ? 'bg-accent-primary text-text-inverse'
                      : 'text-text-muted hover:text-text-primary hover:bg-dark-bgHover'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-dark-bgHover text-text-muted hover:text-text-primary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
          {activeTab === 'synth' && (
            <div className="flex-1 overflow-y-auto p-4">
              <CategorizedSynthSelector
                onSelect={(type) => onCreateWithSynthType(type)}
                createMode
              />
            </div>
          )}
          {activeTab === 'preset' && (
            <LoadPresetModal onClose={onClose} embedded />
          )}
          {activeTab === 'sample' && (
            <SamplePackBrowser onClose={onClose} embedded />
          )}
          {activeTab === 'library' && (
            <div className="flex-1 min-h-0">
              <NKSLibraryBrowser onLoadPreset={handleLibraryLoad} />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
