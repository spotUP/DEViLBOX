/**
 * NKS Settings Panel Component
 *
 * Shows NKS2 knob assignments for the current synth, page navigation,
 * and Akai MPK Mini hardware controls (pad LEDs, OLED display).
 */

import React, { useRef } from 'react';
import { useMIDIStore } from '@/stores/useMIDIStore';
import {
  sendMPKLCDDisplay,
  setMPKRainbowPattern,
  clearMPKPadLEDs,
  sendMPKOLEDBitmap,
  sendMPKTestPattern,
  canvasToBitmap,
} from '@/midi/nks/AkaiMIDIProtocol';

export const NKSSettingsPanel: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, 128, 64);

      const scale = Math.min(128 / img.width, 64 / img.height);
      const x = (128 - img.width * scale) / 2;
      const y = (64 - img.height * scale) / 2;
      ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

      const bitmap = canvasToBitmap(canvas);
      await sendMPKOLEDBitmap(bitmap);
    };

    img.src = URL.createObjectURL(file);
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

      {/* Akai MPK Mini Controls (only when device connected via MIDI) */}
      {hasAkaiDevice && (
        <>
          {/* Pad LEDs */}
          <div className="space-y-1.5 pt-2 border-t border-dark-border">
            <div className="text-[10px] font-medium text-text-muted uppercase">Pad LEDs</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMPKRainbowPattern()}
                className="px-3 py-1.5 bg-gradient-to-r from-red-500 via-yellow-500 to-blue-500 hover:opacity-80 text-white rounded transition-colors text-xs font-medium"
              >
                Rainbow
              </button>
              <button
                onClick={() => clearMPKPadLEDs()}
                className="px-3 py-1.5 bg-dark-bgSecondary hover:bg-dark-bgHover text-text-secondary rounded transition-colors text-xs"
              >
                Clear LEDs
              </button>
            </div>
          </div>

          {/* OLED Display */}
          <div className="space-y-1.5 pt-2 border-t border-dark-border">
            <div className="text-[10px] font-medium text-text-muted uppercase">OLED Display</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => sendMPKLCDDisplay('  DEViLBOX  ', '  Tracker DAW  ')}
                className="px-3 py-1.5 bg-accent-primary/20 hover:bg-accent-primary/30 text-accent-primary rounded transition-colors text-xs"
              >
                Test Text
              </button>
              <button
                onClick={() => sendMPKTestPattern()}
                className="px-3 py-1.5 bg-accent-primary/20 hover:bg-accent-primary/30 text-accent-primary rounded transition-colors text-xs"
              >
                Test Pattern
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full px-3 py-1.5 bg-dark-bgSecondary hover:bg-dark-bgHover text-text-secondary rounded transition-colors text-xs"
            >
              Upload Image (128x64)
            </button>
          </div>
        </>
      )}
    </div>
  );
};
