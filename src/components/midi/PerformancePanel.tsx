/**
 * NKS Settings Panel Component
 *
 * Shows NKS2 knob assignments for the current synth, page navigation,
 * and Akai MPK Mini MK3 display control.
 *
 * Note: MPK Mini MK3 pad LEDs are hardware-driven (red/green on press only)
 * and cannot be controlled via MIDI. Only display text works via SysEx.
 */

import React from 'react';
import { useMIDIStore } from '@/stores/useMIDIStore';
import { sendMPKLCDDisplay } from '@/midi/performance/AkaiMIDIProtocol';

export const PerformancePanel: React.FC = () => {
  const nksKnobAssignments = useMIDIStore((s) => s.nksKnobAssignments);
  const nksKnobPage = useMIDIStore((s) => s.nksKnobPage);
  const nksKnobTotalPages = useMIDIStore((s) => s.nksKnobTotalPages);
  const nksActiveSynthType = useMIDIStore((s) => s.nksActiveSynthType);
  const nextKnobPage = useMIDIStore((s) => s.nextKnobPage);
  const prevKnobPage = useMIDIStore((s) => s.prevKnobPage);
  const outputDevices = useMIDIStore((s) => s.outputDevices);

  // Detect Akai MPK Mini via MIDI output (SysEx controls work over MIDI, not HID)
  const hasAkaiDevice = outputDevices.some(
    (d) => d.name?.toLowerCase().includes('mpk mini')
  );

  const handleTestText = async () => {
    // Send distinctive text so the user can see the display update
    await sendMPKLCDDisplay(' ** TEST ', '** READY');
    // Revert after 2 seconds
    setTimeout(() => {
      sendMPKLCDDisplay('DEViLBOX', ' Tracker ');
    }, 2000);
  };

  return (
    <div className="nks-settings-panel p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">NKS Performance</h3>
          {nksActiveSynthType && (
            <div className="text-xs text-accent-primary mt-0.5">{nksActiveSynthType}</div>
          )}
        </div>
        {nksKnobTotalPages > 1 && (
          <div className="text-xs text-text-muted font-mono">
            Page {nksKnobPage + 1}/{nksKnobTotalPages}
          </div>
        )}
      </div>

      {/* Knob Assignments */}
      {nksKnobAssignments.length > 0 ? (
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-1.5">
            {nksKnobAssignments.map((assignment, index) => (
              <div
                key={`${assignment.param}-${index}`}
                className="flex flex-col items-center p-1.5 rounded bg-dark-bgSecondary border border-dark-border"
              >
                <span className="text-[8px] font-mono text-text-muted">
                  K{index + 1}
                </span>
                <span className="text-[10px] font-bold text-accent-primary uppercase truncate w-full text-center">
                  {assignment.label}
                </span>
              </div>
            ))}
          </div>

          {/* Page Navigation */}
          {nksKnobTotalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={prevKnobPage}
                className="flex-1 px-2 py-1 bg-dark-bgSecondary hover:bg-dark-bgHover text-text-secondary rounded transition-colors text-xs"
              >
                Prev
              </button>
              <div className="px-3 py-1 bg-dark-bgSecondary rounded text-text-primary text-xs font-mono">
                {nksKnobPage + 1} / {nksKnobTotalPages}
              </div>
              <button
                onClick={nextKnobPage}
                className="flex-1 px-2 py-1 bg-dark-bgSecondary hover:bg-dark-bgHover text-text-secondary rounded transition-colors text-xs"
              >
                Next
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="text-xs text-text-muted py-2">
          Play a note to auto-detect synth and load knob assignments.
        </div>
      )}

      {/* Akai MPK Mini Display Control (only when device connected via MIDI) */}
      {hasAkaiDevice && (
        <div className="space-y-1.5 pt-2 border-t border-dark-border">
          <div className="text-[10px] font-medium text-text-muted uppercase">Display</div>
          <button
            onClick={handleTestText}
            className="w-full px-3 py-1.5 bg-accent-primary/20 hover:bg-accent-primary/30 text-accent-primary rounded transition-colors text-xs"
          >
            Test Display
          </button>
          <div className="text-[9px] text-text-muted">
            MK3 pad LEDs are hardware-only (not MIDI controllable)
          </div>
        </div>
      )}
    </div>
  );
};
