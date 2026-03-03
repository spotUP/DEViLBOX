/**
 * ExportDialog - Export/Import Dialog Component
 * Provides UI for exporting songs, SFX, and instruments
 */

import React, { useState, useRef, useEffect } from 'react';
import { X, Download, Upload, FileMusic, Zap, Settings, Volume2, Music2, Cpu } from 'lucide-react';
import { useTrackerStore, useInstrumentStore, useProjectStore, useTransportStore, useAutomationStore, useAudioStore, notify } from '@stores';
import { useUIStore } from '@stores/useUIStore';
import { getToneEngine } from '@engine/ToneEngine';
import {
  exportSong,
  exportSFX,
  exportInstrument,
  importSong,
  importSFX,
  importInstrument,
  detectFileFormat,
  type ExportOptions,
} from './exporters';
import { NanoExporter } from './NanoExporter';
import type { AutomationCurve } from '@typedefs/automation';
import { AudioExportPanel } from './AudioExportPanel';
import { MidiExportPanel } from './MidiExportPanel';
import { ModuleExportPanel } from './ModuleExportPanel';
import { ChipExportPanel } from './ChipExportPanel';

type ExportMode = 'song' | 'sfx' | 'instrument' | 'audio' | 'midi' | 'xm' | 'mod' | 'chip' | 'nano';
type DialogMode = 'export' | 'import';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({ isOpen, onClose }) => {
  const { patterns, currentPatternIndex, importPattern, setCurrentPattern, loadPatterns } = useTrackerStore();
  const { instruments, currentInstrumentId, addInstrument, setCurrentInstrument, loadInstruments } = useInstrumentStore();
  const { metadata, setMetadata } = useProjectStore();
  const { bpm, setBPM, isPlaying, stop } = useTransportStore();
  const { curves, loadCurves } = useAutomationStore();
  const { masterEffects, setMasterEffects } = useAudioStore();

  const [dialogMode, setDialogMode] = useState<DialogMode>('export');
  const [exportMode, setExportMode] = useState<ExportMode>('song');
  const [options, setOptions] = useState<ExportOptions>({
    includeAutomation: true,
    compress: false,
    prettify: true,
  });

  const [sfxName, setSfxName] = useState('MySound');
  const [selectedPatternIndex, setSelectedPatternIndex] = useState(currentPatternIndex);
  const [selectedInstrumentId, setSelectedInstrumentId] = useState(currentInstrumentId || 0);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [chipExtension, setChipExtension] = useState('vgm');

  const modalData = useUIStore(s => s.modalData);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioHandlerRef = useRef<(() => Promise<false | void>) | null>(null);
  const midiHandlerRef = useRef<(() => Promise<false | void>) | null>(null);
  const moduleHandlerRef = useRef<(() => Promise<false | void>) | null>(null);
  const chipHandlerRef = useRef<(() => Promise<false | void>) | null>(null);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Auto-select arrangement scope when opened from arrangement toolbar
  useEffect(() => {
    if (isOpen && modalData?.audioScope === 'arrangement') {
      setExportMode('audio');
    }
  }, [isOpen, modalData]);

  if (!isOpen) return null;

  const handleExport = async () => {
    try {
      switch (exportMode) {
        case 'song': {
          const sequence = patterns.map((p) => p.id);
          // Convert automation curves to export format (nested structure for legacy compat)
          const automationData: Record<string, Record<number, Record<string, AutomationCurve>>> = {};
          patterns.forEach((pattern) => {
            pattern.channels.forEach((_channel, channelIndex) => {
              const channelCurves = curves.filter(
                (c) => c.patternId === pattern.id && c.channelIndex === channelIndex
              );
              if (channelCurves.length > 0) {
                if (!automationData[pattern.id]) {
                  automationData[pattern.id] = {};
                }
                automationData[pattern.id][channelIndex] = channelCurves.reduce(
                  (acc, curve) => {
                    acc[curve.parameter] = curve;
                    return acc;
                  },
                  {} as Record<string, AutomationCurve>
                );
              }
            });
          });
          // Export with both nested format and flat array
          exportSong(
            metadata,
            bpm,
            instruments,
            patterns,
            sequence,
            automationData,
            masterEffects,
            curves, // Pass the flat array of curves
            options
          );
          break;
        }

        case 'sfx': {
          const pattern = patterns[selectedPatternIndex];
          const instrument = instruments.find((i) => i.id === selectedInstrumentId);
          if (!pattern || !instrument) {
            notify.warning('Please select a valid pattern and instrument');
            return;
          }
          exportSFX(sfxName, instrument, pattern, bpm, options);
          break;
        }

        case 'instrument': {
          const instrument = instruments.find((i) => i.id === selectedInstrumentId);
          if (!instrument) {
            notify.warning('Please select a valid instrument');
            return;
          }
          exportInstrument(instrument, options);
          break;
        }

        case 'audio': {
          if (await audioHandlerRef.current?.() === false) return;
          break;
        }

        case 'midi': {
          if (await midiHandlerRef.current?.() === false) return;
          break;
        }

        case 'xm':
        case 'mod': {
          if (await moduleHandlerRef.current?.() === false) return;
          break;
        }

        case 'chip': {
          if (await chipHandlerRef.current?.() === false) return;
          break;
        }

        case 'nano': {
          // NanoExporter expects pattern indices (numbers)
          const sequence = patterns.map((_, idx) => idx);
          const nanoData = NanoExporter.export(
            instruments,
            patterns,
            sequence,
            bpm,
            6 // Speed default
          );

          // Fresh Uint8Array to ensure standard ArrayBuffer
          const blob = new Blob([new Uint8Array(nanoData)], { type: 'application/octet-stream' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${metadata.name || 'song'}.dbn`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

          notify.success(`Nano binary "${metadata.name || 'song'}.dbn" exported successfully! (${nanoData.length} bytes)`);
          onClose();
          break;
        }
      }

      // Only close if no warnings (warnings will show in dialog)
      if (exportMode !== 'xm' && exportMode !== 'mod') {
        onClose();
      }
    } catch (error) {
      console.error('Export failed:', error);
      notify.error('Export failed: ' + (error as Error).message);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // CRITICAL: Stop playback before loading new song to prevent audio glitches
    if (isPlaying) {
      stop();
      const engine = getToneEngine();
      engine.releaseAll(); // Release any held notes
    }

    try {
      const format = await detectFileFormat(file);

      switch (format) {
        case 'song': {
          const data = await importSong(file);
          if (data) {
            // Load song metadata
            setMetadata(data.metadata);
            setBPM(data.bpm);

            // Load patterns (replaces existing patterns)
            loadPatterns(data.patterns);

            // Load instruments (replaces existing instruments)
            loadInstruments(data.instruments);

            // Load automation curves - prefer flat array format, fall back to nested
            if (data.automationCurves && data.automationCurves.length > 0) {
              // New flat array format
              loadCurves(data.automationCurves);
            } else if (data.automation) {
              // Legacy nested format - extract curves from automation data structure
              const allCurves: AutomationCurve[] = [];
              Object.entries(data.automation).forEach(([, channels]) => {
                Object.entries(channels as Record<number, Record<string, AutomationCurve>>).forEach(([, params]) => {
                  Object.values(params).forEach((curve) => {
                    allCurves.push(curve);
                  });
                });
              });
              if (allCurves.length > 0) {
                loadCurves(allCurves);
              }
            }

            // Load master effects
            if (data.masterEffects && data.masterEffects.length > 0) {
              setMasterEffects(data.masterEffects);
            }

            notify.success(`Song "${data.metadata.name}" imported successfully!`);
          }
          break;
        }

        case 'sfx': {
          const data = await importSFX(file);
          if (data) {
            // Add the pattern and get its new index
            const patternIndex = importPattern(data.pattern);

            // Add the instrument
            addInstrument(data.instrument);

            // Set as current
            setCurrentPattern(patternIndex);
            setCurrentInstrument(data.instrument.id);

            notify.success(`SFX "${data.name}" imported successfully!`);
          }
          break;
        }

        case 'instrument': {
          const data = await importInstrument(file);
          if (data) {
            // Add instrument to store
            addInstrument(data.instrument);
            setCurrentInstrument(data.instrument.id);

            notify.success(`Instrument "${data.instrument.name}" imported successfully!`);
          }
          break;
        }

        default:
          notify.error('Unknown or invalid file format');
      }

      onClose();
    } catch (error) {
      console.error('Import failed:', error);
      notify.error('Import failed: ' + (error as Error).message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-dark-bg border border-dark-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-fade-in">
        {/* Header */}
        <div className="bg-dark-bgTertiary border-b border-dark-border px-5 py-4 flex items-center justify-between">
          <h2 className="font-mono text-lg font-bold text-text-primary">
            Export / Import
          </h2>
          <button
            onClick={onClose}
            className="btn-icon"
          >
            <X size={20} />
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="bg-dark-bgSecondary border-b border-dark-border flex">
          <button
            onClick={() => setDialogMode('export')}
            className={`
              flex-1 px-4 py-3 font-mono text-sm transition-all border-r border-dark-border flex items-center justify-center gap-2
              ${dialogMode === 'export'
                ? 'bg-accent-primary text-text-inverse font-bold'
                : 'text-text-secondary hover:bg-dark-bgHover'
              }
            `}
          >
            <Download size={16} />
            Export
          </button>
          <button
            onClick={() => setDialogMode('import')}
            className={`
              flex-1 px-4 py-3 font-mono text-sm transition-all flex items-center justify-center gap-2
              ${dialogMode === 'import'
                ? 'bg-accent-primary text-text-inverse font-bold'
                : 'text-text-secondary hover:bg-dark-bgHover'
              }
            `}
          >
            <Upload size={16} />
            Import
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-modern p-5">
          {dialogMode === 'export' ? (
            <>
              {/* Export Mode Selection */}
              <div className="mb-5">
                <label className="block text-xs font-mono text-text-muted mb-3">
                  EXPORT MODE
                </label>
                <div className="grid grid-cols-4 gap-3">
                  <button
                    onClick={() => setExportMode('song')}
                    className={`
                      p-4 rounded-lg border-2 transition-all text-center
                      ${exportMode === 'song'
                        ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                        : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                      }
                    `}
                  >
                    <FileMusic size={24} className="mx-auto mb-2" />
                    <div className="font-mono text-sm font-semibold">Song</div>
                  </button>
                  <button
                    onClick={() => setExportMode('sfx')}
                    className={`
                      p-4 rounded-lg border-2 transition-all text-center
                      ${exportMode === 'sfx'
                        ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                        : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                      }
                    `}
                  >
                    <Zap size={24} className="mx-auto mb-2" />
                    <div className="font-mono text-sm font-semibold">SFX</div>
                  </button>
                  <button
                    onClick={() => setExportMode('instrument')}
                    className={`
                      p-4 rounded-lg border-2 transition-all text-center
                      ${exportMode === 'instrument'
                        ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                        : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                      }
                    `}
                  >
                    <Settings size={24} className="mx-auto mb-2" />
                    <div className="font-mono text-sm font-semibold">Instrument</div>
                  </button>
                  <button
                    onClick={() => setExportMode('audio')}
                    className={`
                      p-4 rounded-lg border-2 transition-all text-center
                      ${exportMode === 'audio'
                        ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                        : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                      }
                    `}
                  >
                    <Volume2 size={24} className="mx-auto mb-2" />
                    <div className="font-mono text-sm font-semibold">Audio</div>
                  </button>
                  <button
                    onClick={() => setExportMode('midi')}
                    className={`
                      p-4 rounded-lg border-2 transition-all text-center
                      ${exportMode === 'midi'
                        ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                        : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                      }
                    `}
                  >
                    <Music2 size={24} className="mx-auto mb-2" />
                    <div className="font-mono text-sm font-semibold">MIDI</div>
                  </button>
                  <button
                    onClick={() => setExportMode('xm')}
                    className={`
                      p-4 rounded-lg border-2 transition-all text-center
                      ${exportMode === 'xm'
                        ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                        : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                      }
                    `}
                  >
                    <FileMusic size={24} className="mx-auto mb-2" />
                    <div className="font-mono text-sm font-semibold">XM</div>
                  </button>
                  <button
                    onClick={() => setExportMode('mod')}
                    className={`
                      p-4 rounded-lg border-2 transition-all text-center
                      ${exportMode === 'mod'
                        ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                        : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                      }
                    `}
                  >
                    <FileMusic size={24} className="mx-auto mb-2" />
                    <div className="font-mono text-sm font-semibold">MOD</div>
                  </button>
                  <button
                    onClick={() => setExportMode('chip')}
                    className={`
                      p-4 rounded-lg border-2 transition-all text-center
                      ${exportMode === 'chip'
                        ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                        : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                      }
                    `}
                  >
                    <Cpu size={24} className="mx-auto mb-2" />
                    <div className="font-mono text-sm font-semibold">Chip</div>
                  </button>
                  <button
                    onClick={() => setExportMode('nano')}
                    className={`
                      p-4 rounded-lg border-2 transition-all text-center
                      ${exportMode === 'nano'
                        ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                        : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                      }
                    `}
                  >
                    <Zap size={24} className="mx-auto mb-2" />
                    <div className="font-mono text-sm font-semibold">Nano</div>
                  </button>
                </div>
              </div>

              {/* Export Options based on mode */}
              {exportMode === 'song' && (
                <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4">
                  <h3 className="text-sm font-mono font-bold text-accent-primary mb-3">
                    Song Export
                  </h3>
                  <div className="space-y-2 text-sm font-mono text-text-primary">
                    <div>Project: <span className="text-accent-primary">{metadata.name}</span></div>
                    <div>Patterns: <span className="text-accent-primary">{patterns.length}</span></div>
                    <div>Instruments: <span className="text-accent-primary">{instruments.length}</span></div>
                    <div>BPM: <span className="text-accent-primary">{bpm}</span></div>
                  </div>
                </div>
              )}

              {exportMode === 'sfx' && (
                <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4">
                  <h3 className="text-sm font-mono font-bold text-accent-primary mb-3">
                    SFX Export
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-mono text-text-muted mb-1">
                        SFX Name
                      </label>
                      <input
                        type="text"
                        value={sfxName}
                        onChange={(e) => setSfxName(e.target.value)}
                        className="input w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-mono text-text-muted mb-1">
                        Pattern
                      </label>
                      <select
                        value={selectedPatternIndex}
                        onChange={(e) => setSelectedPatternIndex(Number(e.target.value))}
                        className="input w-full"
                      >
                        {patterns.map((pattern, index) => (
                          <option key={pattern.id} value={index}>
                            {index.toString().padStart(2, '0')} - {pattern.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-mono text-text-muted mb-1">
                        Instrument
                      </label>
                      <select
                        value={selectedInstrumentId}
                        onChange={(e) => setSelectedInstrumentId(Number(e.target.value))}
                        className="input w-full"
                      >
                        {instruments.map((instrument) => (
                          <option key={instrument.id} value={instrument.id}>
                            {instrument.id.toString(16).toUpperCase().padStart(2, '0')} - {instrument.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {exportMode === 'instrument' && (
                <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4">
                  <h3 className="text-sm font-mono font-bold text-accent-primary mb-3">
                    Instrument Export
                  </h3>
                  <div>
                    <label className="block text-xs font-mono text-text-muted mb-1">
                      Select Instrument
                    </label>
                    <select
                      value={selectedInstrumentId}
                      onChange={(e) => setSelectedInstrumentId(Number(e.target.value))}
                      className="input w-full"
                    >
                      {instruments.map((instrument) => (
                        <option key={instrument.id} value={instrument.id}>
                          {instrument.id.toString(16).toUpperCase().padStart(2, '0')} - {instrument.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {exportMode === 'audio' && (
                <AudioExportPanel
                  handlerRef={audioHandlerRef}
                  selectedPatternIndex={selectedPatternIndex}
                  setSelectedPatternIndex={setSelectedPatternIndex}
                  isRendering={isRendering}
                  setIsRendering={setIsRendering}
                  renderProgress={renderProgress}
                  setRenderProgress={setRenderProgress}
                  initialScope={modalData?.audioScope === 'arrangement' ? 'arrangement' : undefined}
                />
              )}

              {exportMode === 'midi' && (
                <MidiExportPanel
                  handlerRef={midiHandlerRef}
                  selectedPatternIndex={selectedPatternIndex}
                  setSelectedPatternIndex={setSelectedPatternIndex}
                />
              )}

              {(exportMode === 'xm' || exportMode === 'mod') && (
                <ModuleExportPanel
                  handlerRef={moduleHandlerRef}
                  exportMode={exportMode as 'xm' | 'mod'}
                  onClose={onClose}
                />
              )}

              {exportMode === 'chip' && (
                <ChipExportPanel
                  handlerRef={chipHandlerRef}
                  isRendering={isRendering}
                  setIsRendering={setIsRendering}
                  renderProgress={renderProgress}
                  setRenderProgress={setRenderProgress}
                  onClose={onClose}
                  onFormatChange={setChipExtension}
                />
              )}

              {exportMode === 'nano' && (
                <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4">
                  <h3 className="text-sm font-mono font-bold text-accent-primary mb-3">
                    Nano Binary Export (.dbn)
                  </h3>
                  <div className="space-y-3">
                    <div className="bg-dark-bg border border-dark-border rounded-lg p-3">
                      <p className="text-xs font-mono text-text-primary leading-relaxed">
                        Extreme binary compression for demoscene 4k intros.
                        Exports a strictly optimized <span className="text-accent-secondary">Uint8Array</span> containing only used instruments and bit-masked pattern data.
                      </p>
                    </div>

                    <div className="text-sm font-mono text-text-secondary space-y-1">
                      <div>Target Size: <span className="text-accent-primary">&lt; 4KB</span></div>
                      <div>Format: <span className="text-accent-primary">DBXN Binary</span></div>
                      <div>Used Instruments: <span className="text-accent-primary">
                        {(() => {
                          const used = new Set<number>();
                          patterns.forEach(pattern => {
                            pattern.channels.forEach(ch => {
                              ch.rows.forEach(cell => {
                                if (cell.instrument > 0) used.add(cell.instrument);
                              });
                            });
                          });
                          return used.size;
                        })()}
                      </span></div>
                    </div>
                  </div>
                </div>
              )}

              {/* Export Options */}
              <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-4">
                <h3 className="text-sm font-mono font-bold text-accent-primary mb-3">
                  Options
                </h3>
                <div className="space-y-2">
                  {exportMode === 'song' && (
                    <label className="flex items-center gap-3 text-sm font-mono text-text-primary cursor-pointer hover:text-accent-primary transition-colors">
                      <input
                        type="checkbox"
                        checked={options.includeAutomation}
                        onChange={(e) => setOptions({ ...options, includeAutomation: e.target.checked })}
                        className="w-4 h-4 rounded border-dark-border bg-dark-bg text-accent-primary focus:ring-accent-primary"
                      />
                      Include automation data
                    </label>
                  )}
                  <label className="flex items-center gap-3 text-sm font-mono text-text-primary cursor-pointer hover:text-accent-primary transition-colors">
                    <input
                      type="checkbox"
                      checked={options.prettify}
                      onChange={(e) => setOptions({ ...options, prettify: e.target.checked })}
                      className="w-4 h-4 rounded border-dark-border bg-dark-bg text-accent-primary focus:ring-accent-primary"
                    />
                    Prettify JSON (human-readable)
                  </label>
                  <label className="flex items-center gap-3 text-sm font-mono text-text-muted cursor-not-allowed">
                    <input
                      type="checkbox"
                      checked={options.compress}
                      disabled
                      className="w-4 h-4 rounded opacity-50"
                    />
                    Compress (coming soon)
                  </label>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Import Mode */}
              <div className="text-center py-10">
                <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-dark-bgSecondary border border-dark-border flex items-center justify-center">
                  <Upload size={32} className="text-accent-primary" />
                </div>
                <h3 className="text-xl font-mono font-bold text-text-primary mb-2">
                  Import File
                </h3>
                <p className="text-sm font-mono text-text-muted mb-6">
                  Select a .dbx, .sfx.json, or .dbi file
                </p>
                <button
                  onClick={handleImportClick}
                  className="btn-primary px-8 py-3"
                >
                  Choose File
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mt-4">
                <h4 className="text-xs font-mono font-bold text-accent-primary mb-3">
                  Supported Formats
                </h4>
                <ul className="text-sm font-mono text-text-secondary space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-accent-primary">•</span>
                    <span><strong>.song.json</strong> - Full song with all patterns and instruments</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-accent-primary">•</span>
                    <span><strong>.sfx.json</strong> - Single pattern with one instrument</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-accent-primary">•</span>
                    <span><strong>.dbi</strong> - Individual instrument preset</span>
                  </li>
                </ul>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-dark-bgSecondary border-t border-dark-border px-5 py-4 flex items-center justify-between">
          <div className="text-xs font-mono text-text-muted">
            {dialogMode === 'export'
              ? `Format: ${
                  exportMode === 'audio' ? '.wav'
                  : exportMode === 'midi' ? '.mid'
                  : exportMode === 'xm' ? '.xm'
                  : exportMode === 'mod' ? '.mod'
                  : exportMode === 'chip' ? `.${chipExtension}`
                  : exportMode === 'nano' ? '.dbn'
                  : `.${exportMode}.json`
                }`
              : 'Select a file to import'}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="btn"
              disabled={isRendering}
            >
              Cancel
            </button>
            {dialogMode === 'export' && (
              <button
                onClick={handleExport}
                className="btn-primary flex items-center gap-2"
                disabled={isRendering}
              >
                <Download size={16} />
                {isRendering ? 'Rendering...' : 'Export'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
