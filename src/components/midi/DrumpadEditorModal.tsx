import React, { useEffect, useState, useCallback } from 'react';
import { getPadMappingManager, type PadMapping } from '../../midi/PadMappingManager';
import { useInstrumentStore } from '../../stores';
import { detectControllerProfile } from '../../midi/controllerProfiles';
import { useMIDI } from '../../hooks/useMIDI';
import { getToneEngine } from '../../engine/ToneEngine';
import { X, Radio, Trash2, Zap, LayoutGrid, Disc, Piano, Play } from 'lucide-react';

interface DrumpadEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DrumpadEditorModal: React.FC<DrumpadEditorModalProps> = ({ isOpen, onClose }) => {
  const padManager = getPadMappingManager();
  const { instruments } = useInstrumentStore();
  const { devices, isEnabled } = useMIDI();

  const [mappings, setMappings] = useState<PadMapping[]>([]);
  const [selectedPadIndex, setSelectedPadIndex] = useState<number | null>(null);
  const [isLearning, setIsLearning] = useState(false);
  const [activeBank, setActiveBank] = useState<'A' | 'B'>('A');

  // Load General Preset
  const handleLoadPreset = (_type: 'auto' | '808' | '909' | 'drumnibus') => {
    // Clear existing for these notes
    // Standard Akai MPK Mini notes Ch 10
    const startNote = 36;
    const notes = Array.from({ length: 16 }, (_, i) => startNote + i);
    
    notes.forEach(n => {
      const mapping = padManager.getMapping(9, n);
      if (mapping) padManager.removeMapping(mapping.id);
    });

    // Helper to find instrument by keywords or synth type
    const findInst = (keywords: string[], synthType?: string) => {
      // 1. Try exact name match
      let found = instruments.find(inst => 
        keywords.some(k => inst.name.toLowerCase().includes(k.toLowerCase()))
      );
      
      // 2. Fallback to synth type match if keywords match synth name (e.g. "Synare", "DrumMachine")
      if (!found && synthType) {
        found = instruments.find(inst => inst.synthType === synthType);
      }

      // 3. Fallback to broader keyword search in metadata
      if (!found) {
        found = instruments.find(inst => 
          keywords.some(k => inst.synthType.toLowerCase().includes(k.toLowerCase()))
        );
      }

      return found;
    };

    // Define search patterns for drum slots
    const slots = [
      { keywords: ['Kick', 'BD', 'Bass Drum'], synthType: 'DrumMachine', note: 36 },
      { keywords: ['Snare', 'SD'], synthType: 'DrumMachine', note: 38 },
      { keywords: ['Clap', 'CP'], synthType: 'DrumMachine', note: 39 },
      { keywords: ['Closed Hat', 'CH', 'HH'], synthType: 'DrumMachine', note: 42 },
      { keywords: ['Open Hat', 'OH'], synthType: 'DrumMachine', note: 46 },
      { keywords: ['Rim', 'RS'], synthType: 'DrumMachine', note: 37 },
      { keywords: ['Tom', 'Low'], synthType: 'DrumMachine', note: 41 },
      { keywords: ['Tom', 'Hi'], synthType: 'DrumMachine', note: 43 },
      { keywords: ['Synare', 'Disco'], synthType: 'Synare', note: 40 },
      { keywords: ['Siren', 'Dub'], synthType: 'DubSiren', note: 48 }, // Pad 13 (Bank B start)
      { keywords: ['Laser', 'Zap'], synthType: 'SpaceLaser', note: 49 }, // Pad 14
    ];

    slots.forEach(slot => {
      const inst = findInst(slot.keywords);
      if (inst) {
        padManager.setMapping({
          id: `9-${slot.note}`,
          inputChannel: 9,
          inputNote: slot.note,
          type: 'instrument',
          targetInstrumentId: inst.id,
          targetNote: 60
        });
      }
    });

    refreshMappings();
  };

  // Initialize
  useEffect(() => {
    if (isOpen && isEnabled) {
      padManager.init();
      refreshMappings();
    }
  }, [isOpen, isEnabled]);

  const refreshMappings = useCallback(() => {
    setMappings(padManager.getAllMappings());
  }, [padManager]);

  // Auto-populate from profile if empty
  useEffect(() => {
    if (isOpen && mappings.length === 0 && devices.length > 0) {
      const profile = detectControllerProfile(devices[0].name || '');
      if (profile && profile.pads.length > 0) {
        // Only if we really want to auto-create empty mappings? 
        // Maybe better to just visualize them using the profile but only *create* mapping when edited.
        // For now, let's keep it manual or user-initiated.
      }
    }
  }, [isOpen, devices, mappings.length]);

  // MPK Mini MK3 Default Notes (Channel 10)
  // Bank A: 36, 37, 38, 39, 40, 41, 42, 43 (C1 - G1)
  // Bank B: 44, 45, 46, 47, 48, 49, 50, 51 (G#1 - D#2) -- typical chromatic extension
  const DEFAULT_PADS = Array.from({ length: 16 }, (_, i) => ({
    index: i,
    label: `Pad ${i + 1}`,
    defaultNote: 36 + i, 
    bank: i < 8 ? 'A' : 'B'
  }));

  const getMappingForPad = (padIndex: number) => {
    // Find mapping that matches the "logical" pad note
    // This assumes the user's controller matches the default chromatic layout
    // A more robust way is to just list *all* mappings and let user assign them to "slots"
    // But for a "Drumpad Editor", we usually visualize the hardware.
    
    // Let's rely on the inputNote to find the mapping.
    // We need to know which inputNote corresponds to "Pad 1".
    // Using the default 36+i assumption for visualization.
    const defaultNote = 36 + padIndex;
    // Check if we have a mapping for this note (on any channel for now, or preferably Ch 10)
    return mappings.find(m => m.inputNote === defaultNote);
  };

  const handlePadClick = (index: number) => {
    setSelectedPadIndex(index);
  };

  const previewInstrument = useCallback((id: number) => {
    const inst = instruments.find(i => i.id === id);
    if (inst) {
      const engine = getToneEngine();
      engine.triggerPolyNoteAttack(inst.id, 'C4', 1, inst);
      // Auto-release after 500ms
      setTimeout(() => {
        engine.triggerPolyNoteRelease(inst.id, 'C4', inst);
      }, 500);
    }
  }, [instruments]);

  const handleInstrumentChange = (instrumentId: number) => {
    if (selectedPadIndex === null) return;
    
    // Create or update mapping
    const existing = getMappingForPad(selectedPadIndex);
    const defaultNote = 36 + selectedPadIndex;
    
    const newMapping: PadMapping = {
      id: existing?.id || `10-${defaultNote}`, // Default to Ch 10
      inputChannel: existing?.inputChannel || 9, // Ch 10 (0-indexed = 9)
      inputNote: existing?.inputNote || defaultNote,
      type: 'instrument',
      targetInstrumentId: instrumentId,
      targetNote: existing?.targetNote || 60, // Default C4
    };
    
    padManager.setMapping(newMapping);
    refreshMappings();

    // Auto-preview on change
    previewInstrument(instrumentId);
  };

  const handleNoteChange = (note: number) => {
    if (selectedPadIndex === null) return;
    const existing = getMappingForPad(selectedPadIndex);
    if (!existing) return;

    padManager.setMapping({
      ...existing,
      targetNote: note
    });
    refreshMappings();
  };

  const startLearn = () => {
    if (selectedPadIndex === null) return;
    setIsLearning(true);
    
    padManager.startLearn((note, channel) => {
      // Update the mapping input source
      const existing = getMappingForPad(selectedPadIndex);
      
      // If we are creating a new one
      const targetId = existing?.targetInstrumentId ?? (instruments[0]?.id || 1);
      
      const newMapping: PadMapping = {
        id: `${channel}-${note}`,
        inputChannel: channel,
        inputNote: note,
        type: 'instrument',
        targetInstrumentId: targetId,
        targetNote: existing?.targetNote || 60
      };
      
      // Remove old mapping if ID changed (note/channel changed)
      if (existing && existing.id !== newMapping.id) {
        padManager.removeMapping(existing.id);
      }
      
      padManager.setMapping(newMapping);
      refreshMappings();
      setIsLearning(false);
    });
  };

  const removeMapping = () => {
    if (selectedPadIndex === null) return;
    const existing = getMappingForPad(selectedPadIndex);
    if (existing) {
      padManager.removeMapping(existing.id);
      refreshMappings();
    }
  };

  const getInstrumentName = (id: number) => {
    return instruments.find(i => i.id === id)?.name || `Inst ${id}`;
  };

  if (!isOpen) return null;

  const currentPadMapping = selectedPadIndex !== null ? getMappingForPad(selectedPadIndex) : null;

  // Filter pads by bank
  const visiblePads = DEFAULT_PADS.filter(p => p.bank === activeBank);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-dark-bg border border-dark-border rounded-lg w-[800px] h-[600px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-border">
          <div className="flex items-center gap-6">
            <h2 className="text-xl font-semibold text-text-primary flex items-center gap-3">
              <LayoutGrid size={24} />
              Drumpad Editor
            </h2>
            <div className="flex items-center gap-2 bg-dark-bgSecondary p-1 rounded-lg">
              <span className="text-[10px] font-bold text-text-muted uppercase px-2">Auto-Map:</span>
              <button 
                onClick={() => handleLoadPreset('auto')}
                className="px-3 py-1 text-[10px] font-bold bg-dark-bgActive hover:bg-accent-primary text-white rounded transition-colors uppercase"
              >
                Match Names
              </button>
            </div>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X size={24} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Pad Grid */}
          <div className="w-2/3 p-6 border-r border-dark-border flex flex-col">
            
            {/* Bank Selector */}
            <div className="flex justify-center mb-6 gap-4">
              <button 
                onClick={() => setActiveBank('A')}
                className={`px-6 py-2 rounded-full font-medium transition-all ${activeBank === 'A' ? 'bg-accent-primary text-white' : 'bg-dark-bgSecondary text-text-muted'}`}
              >
                Bank A
              </button>
              <button 
                onClick={() => setActiveBank('B')}
                className={`px-6 py-2 rounded-full font-medium transition-all ${activeBank === 'B' ? 'bg-accent-primary text-white' : 'bg-dark-bgSecondary text-text-muted'}`}
              >
                Bank B
              </button>
            </div>

            {/* Visual Grid 2x4 */}
            <div className="grid grid-cols-4 gap-4 flex-1">
              {visiblePads.map((pad) => {
                const mapping = getMappingForPad(pad.index);
                const isSelected = selectedPadIndex === pad.index;
                
                return (
                  <button
                    key={pad.index}
                    onClick={() => handlePadClick(pad.index)}
                    className={`
                      relative rounded-lg p-4 flex flex-col items-center justify-center border-2 transition-all
                      ${isSelected 
                        ? 'border-accent-primary bg-accent-primary/10' 
                        : mapping 
                          ? 'border-accent-success/50 bg-dark-bgSecondary' 
                          : 'border-dark-border bg-dark-bgSecondary/50 hover:bg-dark-bgSecondary'
                      }
                    `}
                  >
                    <span className="text-xs font-bold text-text-muted absolute top-2 left-2">
                      {pad.label}
                    </span>
                    
                    {mapping ? (
                      <>
                        <Zap size={24} className="text-accent-success mb-2" />
                        <div className="text-sm font-medium text-text-primary text-center truncate w-full">
                          {getInstrumentName(mapping.targetInstrumentId!)}
                        </div>
                        <div className="text-xs text-text-muted mt-1">
                          Note: {mapping.targetNote}
                        </div>
                      </>
                    ) : (
                      <span className="text-text-muted/50 text-sm">Unmapped</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sidebar - Edit Panel */}
          <div className="w-1/3 p-6 bg-dark-bgSecondary/30">
            {selectedPadIndex !== null ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-text-primary">
                    Pad {selectedPadIndex + 1}
                  </h3>
                  {currentPadMapping && (
                    <button 
                      onClick={removeMapping}
                      className="text-accent-error hover:bg-accent-error/10 p-2 rounded"
                      title="Remove Mapping"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>

                {/* Input Note (Learn) */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-text-secondary">Input Trigger</label>
                  <div className="flex gap-2">
                    <div className="flex-1 bg-dark-bg border border-dark-border rounded px-3 py-2 text-text-muted text-sm flex items-center">
                      {currentPadMapping 
                        ? `CH ${currentPadMapping.inputChannel + 1} | Note ${currentPadMapping.inputNote}`
                        : `Default: Note ${36 + selectedPadIndex}`
                      }
                    </div>
                    <button
                      onClick={startLearn}
                      className={`
                        px-3 py-2 rounded text-white transition-colors flex items-center gap-2
                        ${isLearning ? 'bg-accent-warning animate-pulse' : 'bg-dark-bgActive hover:bg-accent-primary'}
                      `}
                    >
                      {isLearning ? <Radio size={16} /> : <Zap size={16} />}
                      {isLearning ? 'Learning...' : 'Learn'}
                    </button>
                  </div>
                </div>

                {/* Target Instrument */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-text-secondary">Target Instrument</label>
                  <div className="flex gap-2">
                    <select
                      value={currentPadMapping?.targetInstrumentId || ''}
                      onChange={(e) => handleInstrumentChange(parseInt(e.target.value))}
                      className="flex-1 bg-dark-bg border border-dark-border rounded px-3 py-2 text-text-primary"
                    >
                      <option value="" disabled>Select Instrument...</option>
                      {instruments.map(inst => (
                        <option key={inst.id} value={inst.id}>
                          {inst.id.toString(16).toUpperCase().padStart(2, '0')} - {inst.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => currentPadMapping?.targetInstrumentId && previewInstrument(currentPadMapping.targetInstrumentId)}
                      disabled={!currentPadMapping?.targetInstrumentId}
                      className="p-2 bg-dark-bg border border-dark-border rounded text-text-secondary hover:text-accent-success hover:border-accent-success/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Preview Instrument"
                    >
                      <Play size={18} />
                    </button>
                  </div>
                </div>

                {/* Target Note */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-text-secondary">Target Note</label>
                  <div className="flex items-center gap-2">
                    <Piano size={16} className="text-text-muted" />
                    <input
                      type="number"
                      min="0"
                      max="127"
                      value={currentPadMapping?.targetNote || 60}
                      onChange={(e) => handleNoteChange(parseInt(e.target.value))}
                      className="flex-1 bg-dark-bg border border-dark-border rounded px-3 py-2 text-text-primary"
                    />
                    <span className="text-xs text-text-muted w-8">
                      {/* TODO: Note name helper */}
                    </span>
                  </div>
                  <p className="text-xs text-text-muted">
                    MIDI Note to trigger (60 = C-4)
                  </p>
                </div>

              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-text-muted">
                <Disc size={48} className="mb-4 opacity-50" />
                <p>Select a pad to edit</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
