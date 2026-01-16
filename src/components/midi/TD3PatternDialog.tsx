/**
 * TD3PatternDialog - Import/Export patterns to/from Behringer TD-3
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Upload, Download, AlertTriangle, Check, Loader2 } from 'lucide-react';
import { useMIDIStore } from '../../stores/useMIDIStore';
import { useTrackerStore } from '../../stores/useTrackerStore';
import { getMIDIManager } from '../../midi/MIDIManager';
import { encodePattern, encodePatternRequest, formatPatternLocation } from '../../midi/sysex/TD3SysExEncoder';
import { decodePattern, isTD3PatternResponse } from '../../midi/sysex/TD3SysExDecoder';
import {
  trackerPatternToTD3Steps,
  td3StepsToTrackerCells,
  validatePatternForTD3Export,
  suggestBaseOctave,
} from '../../midi/sysex/TD3PatternTranslator';
import type { TD3PatternData, MIDIMessage } from '../../midi/types';
import type { TrackerCell } from '@typedefs/tracker';

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

  // Handle export
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

    const cells = td3StepsToTrackerCells(receivedPattern.steps, baseOctave);
    const stepsToImport = Math.min(receivedPattern.activeSteps, cells.length);

    // Insert cells into the selected channel, starting at row 0
    for (let i = 0; i < stepsToImport; i++) {
      const cell = cells[i];
      setCell(selectedChannel, i, {
        note: cell.note,
        accent: cell.accent,
        slide: cell.slide,
        // Keep existing instrument, volume, and effect values
      });
    }

    setSendResult({
      success: true,
      message: `Imported ${stepsToImport} steps into channel ${selectedChannel + 1}`,
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
            Export to TD-3
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
            Import from TD-3
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto max-h-[400px]">
          {/* Device check */}
          {!selectedOutputId && activeTab === 'export' && (
            <div className="flex items-center gap-2 p-3 bg-accent-warning/10 border border-accent-warning/30 rounded-md">
              <AlertTriangle size={16} className="text-accent-warning flex-shrink-0" />
              <span className="text-sm text-text-secondary">
                No MIDI output device selected. Select a device in MIDI settings.
              </span>
            </div>
          )}

          {(!selectedOutputId || !selectedInputId) && activeTab === 'import' && (
            <div className="flex items-center gap-2 p-3 bg-accent-warning/10 border border-accent-warning/30 rounded-md">
              <AlertTriangle size={16} className="text-accent-warning flex-shrink-0" />
              <span className="text-sm text-text-secondary">
                Both MIDI input and output devices are required for pattern import.
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
            <div className="p-3 bg-dark-bgTertiary rounded-md">
              <h4 className="text-sm font-medium text-text-primary mb-2">
                Received Pattern: {formatPatternLocation(receivedPattern.group, receivedPattern.pattern)}
              </h4>
              <p className="text-xs text-text-muted">
                {receivedPattern.activeSteps} active steps
                {receivedPattern.triplet ? ' (triplet mode)' : ''}
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
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-dark-border bg-dark-bgTertiary">
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
              className="px-4 py-2 text-sm font-medium bg-accent-primary text-text-inverse rounded hover:bg-accent-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
              className="px-4 py-2 text-sm font-medium bg-accent-success text-text-inverse rounded hover:bg-accent-success/90 transition-colors flex items-center gap-2"
            >
              <Check size={14} />
              Insert into Pattern
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
