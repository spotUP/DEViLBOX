/**
 * TD3PatternDialog - Import/Export patterns to/from Behringer TD-3
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Upload, Download, AlertTriangle, Check, Loader2, FileUp, FileDown } from 'lucide-react';
import { useMIDIStore } from '../../stores/useMIDIStore';
import { useTrackerStore } from '../../stores/useTrackerStore';
import { useInstrumentStore } from '../../stores/useInstrumentStore';
import { createDefaultTB303Instrument } from '../../lib/instrumentFactory';
import { getMIDIManager } from '../../midi/MIDIManager';
import { encodePattern, encodePatternRequest, formatPatternLocation } from '../../midi/sysex/TD3SysExEncoder';
import { decodePattern, isTD3PatternResponse } from '../../midi/sysex/TD3SysExDecoder';
import {
  trackerPatternToTD3Steps,
  td3StepsToTrackerCells,
  validatePatternForTD3Export,
  suggestBaseOctave,
} from '../../midi/sysex/TD3PatternTranslator';
import { parseTD3File } from '../../lib/import/TD3PatternLoader';
import type { TD3PatternData, MIDIMessage } from '../../midi/types';
import type { TrackerCell } from '@typedefs/tracker';
import * as FileSaver from 'file-saver';
import { exportTD3PatternToSeq } from '../../lib/export/TD3PatternExporter';

interface TD3PatternDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'export' | 'import';

const GROUP_NAMES = ['A', 'B', 'C', 'D'];

export const TD3PatternDialog: React.FC<TD3PatternDialogProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabType>('export');
  const [selectedGroup, setSelectedGroup] = useState(0);
  const [selectedPattern, setSelectedPattern] = useState(0);
  const [selectedChannel, setSelectedChannel] = useState(0);
  const [baseOctave, setBaseOctave] = useState(2);
  const [isSending, setIsSending] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);
  const [receivedPattern, setReceivedPattern] = useState<TD3PatternData | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const requestTimeoutRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { selectedOutputId, selectedInputId } = useMIDIStore();
  const { patterns, currentPatternIndex, cursor, setCell } = useTrackerStore();

  const currentPattern = patterns[currentPatternIndex];
  const channels = currentPattern?.channels || [];

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSendResult(null);
      setReceivedPattern(null);
      setWarnings([]);
      setSelectedChannel(cursor.channelIndex);

      // Suggest base octave based on pattern content
      if (currentPattern && currentPattern.channels[cursor.channelIndex]) {
        const cells = currentPattern.channels[cursor.channelIndex].rows;
        setBaseOctave(suggestBaseOctave(cells));
      }
    }
  }, [isOpen, cursor.channelIndex, currentPattern]);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (requestTimeoutRef.current !== null) {
        clearTimeout(requestTimeoutRef.current);
        requestTimeoutRef.current = null;
      }
    };
  }, []);

  // Listen for SysEx responses when importing
  useEffect(() => {
    if (!isOpen || activeTab !== 'import' || !isRequesting) return;

    const manager = getMIDIManager();

    const handleMessage = (message: MIDIMessage) => {
      if (message.type === 'sysex' && isTD3PatternResponse(message.data)) {
        const decoded = decodePattern(message.data);
        if (decoded) {
          // Clear timeout since we got a response
          if (requestTimeoutRef.current !== null) {
            clearTimeout(requestTimeoutRef.current);
            requestTimeoutRef.current = null;
          }
          setReceivedPattern(decoded);
          setIsRequesting(false);
        }
      }
    };

    manager.addMessageHandler(handleMessage);
    return () => manager.removeMessageHandler(handleMessage);
  }, [isOpen, activeTab, isRequesting]);

  // Get current channel cells for export preview
  const getExportCells = useCallback((): TrackerCell[] => {
    if (!currentPattern || !currentPattern.channels[selectedChannel]) {
      return [];
    }
    return currentPattern.channels[selectedChannel].rows;
  }, [currentPattern, selectedChannel]);

  // Validate export
  const validation = validatePatternForTD3Export(getExportCells(), baseOctave);

  // Handle export via SysEx
  const handleExport = async () => {
    if (!selectedOutputId) return;

    const cells = getExportCells();
    const { steps, warnings: exportWarnings } = trackerPatternToTD3Steps(cells, baseOctave);
    setWarnings(exportWarnings);

    const patternData: TD3PatternData = {
      group: selectedGroup,
      pattern: selectedPattern,
      steps,
      triplet: false,
      activeSteps: Math.min(16, cells.length),
    };

    const sysex = encodePattern(patternData);

    setIsSending(true);
    setSendResult(null);

    try {
      getMIDIManager().sendSysEx(sysex);
      setSendResult({
        success: true,
        message: `Pattern sent to ${formatPatternLocation(selectedGroup, selectedPattern)}`,
      });
    } catch (error) {
      setSendResult({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to send pattern',
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleExportFile = () => {
    const cells = getExportCells();
    const { steps } = trackerPatternToTD3Steps(cells, baseOctave);
    
    const patternData = {
      name: `Pattern ${formatPatternLocation(selectedGroup, selectedPattern)}`,
      steps: steps.map(s => ({
        note: s.note ? s.note.value : null,
        octave: s.note ? s.note.octave : 0,
        upperC: s.note ? s.note.upperC : false,
        flag1: s.accent ? 1 : undefined,
        flag2: s.slide ? 2 : undefined,
        tie: s.tie
      })),
      activeSteps: Math.min(16, cells.length)
    };

    const blob = new Blob([JSON.stringify(patternData, null, 2)], { type: 'application/json' });
    FileSaver.saveAs(blob, `td3-pattern-${formatPatternLocation(selectedGroup, selectedPattern).replace(' ', '')}.json`);
    
    setSendResult({
      success: true,
      message: 'Pattern exported to JSON file',
    });
  };

  const handleExportSeq = () => {
    const cells = getExportCells();
    const { steps } = trackerPatternToTD3Steps(cells, baseOctave);
    
    const patternData: TD3PatternData = {
      group: selectedGroup,
      pattern: selectedPattern,
      steps,
      triplet: false,
      activeSteps: Math.min(16, cells.length),
    };

    try {
      const bytes = exportTD3PatternToSeq(patternData);
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
      FileSaver.saveAs(blob, `td3-pattern-${formatPatternLocation(selectedGroup, selectedPattern).replace(' ', '')}.seq`);
      
      setSendResult({
        success: true,
        message: 'Pattern exported to .seq file',
      });
    } catch {
      setSendResult({
        success: false,
        message: 'Failed to export .seq file',
      });
    }
  };

  // Handle file import
  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      
      if (file.name.toLowerCase().endsWith('.sqs')) {
        const td3File = await parseTD3File(buffer);
        if (td3File.patterns.length > 0) {
          // Take the first pattern from the .sqs/ .seq file
          const firstPatt = td3File.patterns[0];
          
          setReceivedPattern({
            group: 0,
            pattern: 0,
            steps: firstPatt.steps,
            triplet: firstPatt.triplet || false,
            activeSteps: firstPatt.length
          });
          
          setSendResult({
            success: true,
            message: `Loaded pattern "${firstPatt.name}" from .sqs file`,
          });
        }
      } else {
        // Assume JSON
        const text = new TextDecoder().decode(buffer);
        const data = JSON.parse(text);
        
        // Map notes if they are in the flat format
        const mappedSteps = data.steps.map((s: { note: number | null; octave: number; upperC?: boolean; accent?: boolean; slide?: boolean; tie?: boolean }) => ({
          note: s.note === null ? null : { value: s.note, octave: s.octave, upperC: s.upperC || false },
          flag1: s.accent ? 1 : undefined,
          flag2: s.slide ? 2 : undefined,
          tie: s.tie
        }));

        setReceivedPattern({
          group: data.group || 0,
          pattern: data.pattern || 0,
          steps: mappedSteps,
          triplet: data.triplet || false,
          activeSteps: data.activeSteps || 16
        });

        setSendResult({
          success: true,
          message: 'Loaded pattern from JSON file',
        });
      }
    } catch {
      setSendResult({
        success: false,
        message: 'Failed to parse pattern file',
      });
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle import request
  const handleRequestPattern = () => {
    if (!selectedOutputId || !selectedInputId) return;

    const sysex = encodePatternRequest(selectedGroup, selectedPattern);

    setIsRequesting(true);
    setReceivedPattern(null);
    setSendResult(null);

    try {
      getMIDIManager().sendSysEx(sysex);

      // Clear any existing timeout
      if (requestTimeoutRef.current !== null) {
        clearTimeout(requestTimeoutRef.current);
      }

      // Timeout after 5 seconds
      requestTimeoutRef.current = window.setTimeout(() => {
        requestTimeoutRef.current = null;
        setIsRequesting(false);
        setSendResult({
          success: false,
          message: 'No response from TD-3. Make sure it is connected and in the correct mode.',
        });
      }, 5000);
    } catch (error) {
      setIsRequesting(false);
      setSendResult({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to send request',
      });
    }
  };

  // Handle import into pattern
  const handleImportIntoPattern = () => {
    if (!receivedPattern) return;

    // Find or create TB-303 instrument
    const { instruments, addInstrument } = useInstrumentStore.getState();
    let tb303Instrument = instruments.find(inst => inst.synthType === 'TB303');
    if (!tb303Instrument) {
      // Auto-create TB-303 instrument
      const newInst = createDefaultTB303Instrument();
      addInstrument(newInst);
      tb303Instrument = newInst;
      console.log('[TD3Import] Auto-created TB-303 instrument:', newInst.id);
    }
    
    // Get instrument index (1-based for tracker)
    const instrumentIndex = instruments.findIndex(i => i.id === tb303Instrument!.id) + 1;

    const cells = td3StepsToTrackerCells(receivedPattern.steps, baseOctave);
    const stepsToImport = Math.min(receivedPattern.activeSteps, cells.length);

    // Insert cells into the selected channel, starting at row 0
    for (let i = 0; i < stepsToImport; i++) {
      const cell = cells[i];
      setCell(selectedChannel, i, {
        note: cell.note,
        instrument: cell.note ? instrumentIndex : undefined, // Set instrument for notes
        flag1: cell.flag1,
        flag2: cell.flag2,
      });
    }

    setSendResult({
      success: true,
      message: `Imported ${stepsToImport} steps into channel ${selectedChannel + 1} with TB-303`,
    });

    // Clear received pattern to allow another import
    setReceivedPattern(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl w-[480px] max-h-[80vh] overflow-hidden animate-slide-in-up">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
          <h2 className="text-lg font-bold text-text-primary">TD-3 Pattern Transfer</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-dark-bgHover text-text-muted hover:text-text-primary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-dark-border">
          <button
            onClick={() => setActiveTab('export')}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-2
              ${activeTab === 'export'
                ? 'text-text-primary border-b-2 border-accent-primary bg-dark-bgActive'
                : 'text-text-secondary hover:text-text-primary'
              }`}
          >
            <Upload size={14} />
            Export
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-2
              ${activeTab === 'import'
                ? 'text-text-primary border-b-2 border-accent-primary bg-dark-bgActive'
                : 'text-text-secondary hover:text-text-primary'
              }`}
          >
            <Download size={14} />
            Import
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto max-h-[400px]">
          {/* Device check */}
          {!selectedOutputId && activeTab === 'export' && (
            <div className="flex items-center gap-2 p-3 bg-accent-warning/10 border border-accent-warning/30 rounded-md">
              <AlertTriangle size={16} className="text-accent-warning flex-shrink-0" />
              <span className="text-sm text-text-secondary">
                No MIDI output selected. You can still export to file.
              </span>
            </div>
          )}

          {(!selectedOutputId || !selectedInputId) && activeTab === 'import' && !receivedPattern && (
            <div className="flex items-center gap-2 p-3 bg-dark-bgTertiary border border-dark-border rounded-md">
              <AlertTriangle size={16} className="text-text-muted flex-shrink-0" />
              <span className="text-sm text-text-muted">
                MIDI transfer requires hardware. Use "Load File" for .sqs or .json patterns.
              </span>
            </div>
          )}

          {/* Pattern Location */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1">
                Group
              </label>
              <div className="flex gap-1">
                {GROUP_NAMES.map((name, idx) => (
                  <button
                    key={name}
                    onClick={() => setSelectedGroup(idx)}
                    className={`flex-1 py-2 rounded font-medium text-sm transition-colors
                      ${selectedGroup === idx
                        ? 'bg-accent-primary text-text-inverse'
                        : 'bg-dark-bgTertiary text-text-secondary hover:text-text-primary hover:bg-dark-bgActive'
                      }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1">
                Pattern (1-16)
              </label>
              <select
                value={selectedPattern}
                onChange={(e) => setSelectedPattern(Number(e.target.value))}
                className="w-full px-3 py-2 rounded bg-dark-bgTertiary border border-dark-border text-text-primary"
              >
                {Array.from({ length: 16 }, (_, i) => (
                  <option key={i} value={i}>
                    {i < 8 ? `A${i + 1}` : `B${i - 7}`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Export-specific options */}
          {activeTab === 'export' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1">
                    Source Channel
                  </label>
                  <select
                    value={selectedChannel}
                    onChange={(e) => setSelectedChannel(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded bg-dark-bgTertiary border border-dark-border text-text-primary"
                  >
                    {channels.map((ch, idx) => (
                      <option key={idx} value={idx}>
                        {ch.name || `Channel ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1">
                    Base Octave
                  </label>
                  <select
                    value={baseOctave}
                    onChange={(e) => setBaseOctave(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded bg-dark-bgTertiary border border-dark-border text-text-primary"
                  >
                    <option value={1}>C1 - C4</option>
                    <option value={2}>C2 - C5</option>
                    <option value={3}>C3 - C6</option>
                    <option value={4}>C4 - C7</option>
                  </select>
                </div>
              </div>

              {/* Warnings */}
              {(validation.warnings.length > 0 || warnings.length > 0) && (
                <div className="space-y-1">
                  {[...validation.warnings, ...warnings].map((warning, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-xs text-accent-warning"
                    >
                      <AlertTriangle size={12} />
                      <span>{warning}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Pattern info */}
              <div className="text-xs text-text-muted">
                <p>
                  Exporting {Math.min(16, getExportCells().length)} steps from{' '}
                  {channels[selectedChannel]?.name || `Channel ${selectedChannel + 1}`} to{' '}
                  <span className="text-text-primary font-mono">
                    {formatPatternLocation(selectedGroup, selectedPattern)}
                  </span>
                </p>
              </div>
            </>
          )}

          {/* Import-specific content */}
          {activeTab === 'import' && receivedPattern && (
            <div className="p-3 bg-dark-bgTertiary rounded-md border border-accent-primary/20">
              <h4 className="text-sm font-medium text-text-primary mb-2 flex items-center gap-2">
                <Check size={14} className="text-accent-success" />
                Pattern Loaded
              </h4>
              <p className="text-xs text-text-muted">
                {receivedPattern.activeSteps} active steps detected.
              </p>

              <div className="mt-3">
                <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1">
                  Target Channel
                </label>
                <select
                  value={selectedChannel}
                  onChange={(e) => setSelectedChannel(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded bg-dark-bg border border-dark-border text-text-primary"
                >
                  {channels.map((ch, idx) => (
                    <option key={idx} value={idx}>
                      {ch.name || `Channel ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Result message */}
          {sendResult && (
            <div
              className={`flex items-center gap-2 p-3 rounded-md ${
                sendResult.success
                  ? 'bg-accent-success/10 border border-accent-success/30'
                  : 'bg-accent-error/10 border border-accent-error/30'
              }`}
            >
              {sendResult.success ? (
                <Check size={16} className="text-accent-success" />
              ) : (
                <AlertTriangle size={16} className="text-accent-error" />
              )}
              <span className="text-sm text-text-secondary">{sendResult.message}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-dark-border bg-dark-bgTertiary">
          <div className="flex gap-2">
            {activeTab === 'import' && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.sqs"
                  className="hidden"
                  onChange={handleFileImport}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-2 text-xs font-bold bg-dark-bg border border-dark-border text-text-secondary hover:text-text-primary rounded transition-colors flex items-center gap-2"
                >
                  <FileUp size={14} />
                  LOAD FILE
                </button>
              </>
            )}
            {activeTab === 'export' && (
              <>
                <button
                  onClick={handleExportFile}
                  className="px-3 py-2 text-xs font-bold bg-dark-bg border border-dark-border text-text-secondary hover:text-text-primary rounded transition-colors flex items-center gap-2"
                >
                  <FileDown size={14} />
                  SAVE AS JSON
                </button>
                <button
                  onClick={handleExportSeq}
                  className="px-3 py-2 text-xs font-bold bg-dark-bg border border-dark-border text-text-secondary hover:text-text-primary rounded transition-colors flex items-center gap-2"
                >
                  <FileDown size={14} />
                  SAVE AS .SEQ
                </button>
              </>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              Close
            </button>

            {activeTab === 'export' && (
              <button
                onClick={handleExport}
                disabled={!selectedOutputId || isSending || !validation.valid}
                className="px-4 py-2 text-sm font-medium bg-accent-primary text-text-inverse rounded hover:bg-accent-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-glow-sm"
              >
                {isSending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Upload size={14} />
                    Send to TD-3
                  </>
                )}
              </button>
            )}

            {activeTab === 'import' && !receivedPattern && (
              <button
                onClick={handleRequestPattern}
                disabled={!selectedOutputId || !selectedInputId || isRequesting}
                className="px-4 py-2 text-sm font-medium bg-accent-primary text-text-inverse rounded hover:bg-accent-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isRequesting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Requesting...
                  </>
                ) : (
                  <>
                    <Download size={14} />
                    Request from TD-3
                  </>
                )}
              </button>
            )}

            {activeTab === 'import' && receivedPattern && (
              <button
                onClick={handleImportIntoPattern}
                className="px-4 py-2 text-sm font-medium bg-accent-success text-text-inverse rounded hover:bg-accent-success/90 transition-colors flex items-center gap-2 shadow-glow-sm"
              >
                <Check size={14} />
                Insert into Pattern
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
