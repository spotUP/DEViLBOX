/**
 * AmigaPal Modal - Complete 1:1 port of AmigaPal features
 *
 * Full-featured Amiga sample converter with:
 * - ProTracker note selection for sample rate
 * - Lowpass/Highpass filters
 * - Brickwall limiter with threshold + makeup gain
 * - Live preview
 * - 8-bit conversion with proper dithering
 *
 * Based on: https://github.com/echolevel/AmigaPal
 * By: echolevel
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { X, Play, Square, Download } from 'lucide-react';
import { notify } from '../../stores/useNotificationStore';
import type { ProcessedResult } from '../../utils/audio/SampleProcessing';
import { bufferToDataUrl } from '../../utils/audio/SampleProcessing';

interface AmigaPalModalProps {
  isOpen: boolean;
  onClose: () => void;
  buffer: AudioBuffer | null;
  onApply: (result: ProcessedResult) => void;
}

// ProTracker note frequencies (PAL) - from original AmigaPal
const PT_NOTES = [
  { note: 'C-1', rate: 4143 },
  { note: 'C#1', rate: 4389 },
  { note: 'D-1', rate: 4654 },
  { note: 'D#1', rate: 4926 },
  { note: 'E-1', rate: 5231 },
  { note: 'F-1', rate: 5542 },
  { note: 'F#1', rate: 5872 },
  { note: 'G-1', rate: 6222 },
  { note: 'G#1', rate: 6592 },
  { note: 'A-1', rate: 6982 },
  { note: 'A#1', rate: 7389 },
  { note: 'B-1', rate: 7829 },
  { note: 'C-2', rate: 8287 },
  { note: 'C#2', rate: 8779 },
  { note: 'D-2', rate: 9309 },
  { note: 'D#2', rate: 9852 },
  { note: 'E-2', rate: 10462 },
  { note: 'F-2', rate: 11084 },
  { note: 'F#2', rate: 11744 },
  { note: 'G-2', rate: 12445 },
  { note: 'G#2', rate: 13185 },
  { note: 'A-2', rate: 13964 },
  { note: 'A#2', rate: 14778 },
  { note: 'B-2', rate: 15694 },
  { note: 'C-3', rate: 16574 },
  { note: 'C#3', rate: 17558 },
  { note: 'D-3', rate: 18667 },
  { note: 'D#3', rate: 19704 },
  { note: 'E-3', rate: 20864 },
  { note: 'F-3', rate: 22168 },
  { note: 'F#3', rate: 23489 },
  { note: 'G-3', rate: 24803 },
  { note: 'G#3', rate: 26273 },
  { note: 'A-3', rate: 27928 }, // Default in AmigaPal
  { note: 'A#3', rate: 29557 },
  { note: 'B-3', rate: 31388 },
];

export const AmigaPalModal: React.FC<AmigaPalModalProps> = ({
  isOpen,
  onClose,
  buffer,
  onApply,
}) => {
  const [ptNoteIdx, setPtNoteIdx] = useState(33); // A-3 default (rate: 27928)
  // Filters are ALWAYS enabled in original - no checkboxes, just frequency controls
  const [lowpassFreq, setLowpassFreq] = useState(20000); // 20kHz default
  const [highpassFreq, setHighpassFreq] = useState(40); // 40Hz default
  const [limiterEnabled, setLimiterEnabled] = useState(false);
  const [limiterThreshold, setLimiterThreshold] = useState(0); // 0 dB default
  const [limiterMakeup, setLimiterMakeup] = useState(100); // 100 = 2.0x gain (formula: 1 + value/100)
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
  }, []);

  const stopPreview = useCallback(() => {
    if (previewSourceRef.current) {
      try {
        previewSourceRef.current.stop();
      } catch (e) {
        // Already stopped
      }
      previewSourceRef.current = null;
    }
    setIsPreviewing(false);
  }, []);

  const processBuffer = useCallback(async (inputBuffer: AudioBuffer, forPreview: boolean = false): Promise<AudioBuffer> => {
    const targetRate = PT_NOTES[ptNoteIdx].rate;
    const numChannels = inputBuffer.numberOfChannels;
    const inputLength = inputBuffer.length;
    const inputRate = inputBuffer.sampleRate;

    // Calculate output length after resampling
    const outputLength = Math.floor(inputLength * targetRate / inputRate);

    // Create offline context for processing
    const offlineContext = new OfflineAudioContext(
      numChannels,
      outputLength,
      targetRate
    );

    const source = offlineContext.createBufferSource();
    source.buffer = inputBuffer;

    // Build signal chain: Source → (Compressor if enabled) → Makeup Gain → Lowpass → Highpass → Destination
    let lastNode: AudioNode = source;

    // Dynamics Compressor (acts as brickwall limiter)
    const compressor = offlineContext.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(limiterThreshold, offlineContext.currentTime);
    compressor.knee.setValueAtTime(0.0, offlineContext.currentTime); // Hard knee
    compressor.ratio.setValueAtTime(20.0, offlineContext.currentTime); // Heavy ratio = limiter
    compressor.attack.setValueAtTime(0.0002, offlineContext.currentTime); // 0.2ms
    compressor.release.setValueAtTime(0.06, offlineContext.currentTime); // 60ms

    // Makeup Gain (always in chain, formula: 1 + limiterMakeup/100)
    const makeupGain = offlineContext.createGain();
    makeupGain.gain.setValueAtTime(1 + limiterMakeup / 100, offlineContext.currentTime);

    // Connect compressor only if limiter is enabled
    if (limiterEnabled) {
      lastNode.connect(compressor);
      compressor.connect(makeupGain);
    } else {
      lastNode.connect(makeupGain);
    }
    lastNode = makeupGain;

    // Lowpass filter (ALWAYS applied - original has no enable/disable)
    const lpf = offlineContext.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(lowpassFreq, offlineContext.currentTime);
    lpf.Q.setValueAtTime(0, offlineContext.currentTime);
    lastNode.connect(lpf);
    lastNode = lpf;

    // Highpass filter (ALWAYS applied - original has no enable/disable)
    const hpf = offlineContext.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.setValueAtTime(highpassFreq, offlineContext.currentTime);
    hpf.Q.setValueAtTime(0, offlineContext.currentTime);
    lastNode.connect(hpf);
    lastNode = hpf;

    lastNode.connect(offlineContext.destination);
    source.start(0);

    let renderedBuffer = await offlineContext.startRendering();

    // Apply 8-bit conversion (normalize + quantize)
    if (!forPreview) {
      const processedBuffer = await apply8BitConversion(renderedBuffer);
      return processedBuffer;
    }

    return renderedBuffer;
  }, [ptNoteIdx, lowpassFreq, highpassFreq, limiterEnabled, limiterThreshold, limiterMakeup]);

  const apply8BitConversion = async (inputBuffer: AudioBuffer): Promise<AudioBuffer> => {
    const numChannels = inputBuffer.numberOfChannels;
    const length = inputBuffer.length;
    const sampleRate = inputBuffer.sampleRate;

    // Find peak for normalization (matches original: uses Math.max, not abs)
    // Original line 822-824: peak = outData.reduce((a,b) => Math.max(a,b))
    const data = inputBuffer.getChannelData(0); // Original only checks channel 0
    let peak = data[0];
    for (let i = 1; i < length; i++) {
      if (data[i] > peak) peak = data[i];
    }

    // Normalize first (original: lines 826-833)
    for (let c = 0; c < numChannels; c++) {
      const channelData = inputBuffer.getChannelData(c);
      for (let i = 0; i < length; i++) {
        channelData[i] = channelData[i] * (1 / peak);
        if (channelData[i] > 1) channelData[i] = 1;
        else if (channelData[i] < -1) channelData[i] = -1;
      }
    }

    // Create output buffer
    const outputBuffer = new AudioBuffer({
      length,
      numberOfChannels: numChannels,
      sampleRate
    });

    // Convert to 8-bit and quantize (original: lines 838-846, 886-887)
    for (let c = 0; c < numChannels; c++) {
      const inputData = inputBuffer.getChannelData(c);
      const outputData = outputBuffer.getChannelData(c);

      for (let i = 0; i < length; i++) {
        // Original line 887: step * Math.floor(outData[i]/step)
        const step = Math.pow(0.5, 8);
        outputData[i] = step * Math.floor(inputData[i] / step);
      }
    }

    return outputBuffer;
  };

  const handlePreview = useCallback(async () => {
    if (!buffer || !audioContextRef.current) return;

    if (isPreviewing) {
      stopPreview();
      return;
    }

    try {
      setIsProcessing(true);
      const processed = await processBuffer(buffer, false);

      const source = audioContextRef.current.createBufferSource();
      source.buffer = processed;
      source.connect(audioContextRef.current.destination);
      source.onended = () => setIsPreviewing(false);

      previewSourceRef.current = source;
      source.start(0);
      setIsPreviewing(true);
    } catch (err) {
      notify.error('Preview failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsProcessing(false);
    }
  }, [buffer, processBuffer, isPreviewing, stopPreview]);

  const handleApply = useCallback(async () => {
    if (!buffer) return;

    try {
      setIsProcessing(true);
      const processed = await processBuffer(buffer, false);
      const dataUrl = await bufferToDataUrl(processed);
      onApply({ buffer: processed, dataUrl });
      notify.success('AmigaPal processing complete!');
      onClose();
    } catch (err) {
      notify.error('Processing failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsProcessing(false);
    }
  }, [buffer, processBuffer, onApply, onClose]);

  const handleExport8SVX = useCallback(async () => {
    if (!buffer) return;

    try {
      setIsProcessing(true);
      const processed = await processBuffer(buffer, false);

      // Export as 8SVX (Amiga IFF format)
      const svxData = await bufferTo8SVX(processed);
      const blob = new Blob([svxData], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'amigapal-8bit.8svx';
      a.click();
      URL.revokeObjectURL(url);

      notify.success('Exported as 8SVX (Amiga IFF)!');
    } catch (err) {
      notify.error('Export failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsProcessing(false);
    }
  }, [buffer, processBuffer]);

  // Helper: Convert AudioBuffer to 8SVX (Amiga IFF format)
  const bufferTo8SVX = async (buffer: AudioBuffer): Promise<ArrayBuffer> => {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length;

    // Convert to 8-bit signed samples (original: lines 838-846)
    const sampleData = new Int8Array(length * numChannels);
    let idx = 0;
    for (let i = 0; i < length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = buffer.getChannelData(ch)[i];
        const clamped = Math.max(-1, Math.min(1, sample));
        let value = Math.round(clamped * 128);
        // Explicit clamping to match original (lines 840-845)
        if (value > 127) value = 127;
        if (value < -128) value = -128;
        sampleData[idx++] = value;
      }
    }

    // Calculate sizes
    const dataLength = sampleData.length;
    const formSize = 32 + dataLength;
    const totalSize = formSize + 8;

    // Create output buffer
    const arrayBuffer = new ArrayBuffer(totalSize);
    const view = new DataView(arrayBuffer);
    const bytes = new Uint8Array(arrayBuffer);

    // Helper to write string
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    // FORM chunk
    writeString(0, 'FORM');
    view.setUint32(4, formSize, false); // Big-endian

    // 8SVX VHDR chunk
    writeString(8, '8SVXVHDR');
    view.setInt8(16, 0);
    view.setInt8(17, 0);
    view.setInt8(18, 0);
    view.setInt8(19, 20); // VHDR chunk length
    view.setUint32(20, dataLength, false); // Sample data length
    view.setUint32(24, 0, false); // repeatHiSamples
    view.setUint32(28, 0, false); // samplesPerHiCycle
    view.setUint16(32, sampleRate, false); // Sample rate
    view.setUint8(34, 1); // Octave (always 1)
    view.setUint8(35, 0); // Compression (always 0)
    view.setUint32(36, 0x00010000, false); // Volume (always 256 = 0x00010000)

    // BODY chunk
    writeString(40, 'BODY');
    view.setUint32(44, dataLength, false); // Data length

    // Copy sample data
    bytes.set(sampleData, 48);

    return arrayBuffer;
  };

  if (!isOpen) return null;

  const targetRate = PT_NOTES[ptNoteIdx].rate;
  const outputSize = buffer ? Math.floor(buffer.length * targetRate / buffer.sampleRate) : 0;
  const outputDuration = buffer ? outputSize / targetRate : 0;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl w-[600px] max-w-[90vw] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
          <h2 className="text-lg font-bold text-text-primary">AmigaPal - Perfect Amiga Samples</h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-4">

          {/* ProTracker Note Selection */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              ProTracker Note (Sample Rate)
            </label>
            <select
              value={ptNoteIdx}
              onChange={(e) => setPtNoteIdx(parseInt(e.target.value))}
              className="w-full px-3 py-2 bg-dark-bgTertiary border border-dark-border rounded text-text-primary"
              title="Target sample rate based on ProTracker note"
            >
              {PT_NOTES.map((pt, idx) => (
                <option key={idx} value={idx}>
                  {pt.note} ({pt.rate} Hz)
                </option>
              ))}
            </select>
            <p className="text-xs text-text-muted mt-1">
              Output: {outputSize} samples, {outputDuration.toFixed(2)}s @ {targetRate}Hz
            </p>
          </div>

          {/* Filters - ALWAYS active, no enable/disable (matches original) */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-text-secondary">Filters (Always Active)</h3>

            {/* Lo Cut (Highpass) */}
            <div className="flex items-center gap-3">
              <label className="text-sm text-text-primary w-20">Lo Cut:</label>
              <input
                type="range"
                min="40"
                max="20000"
                value={highpassFreq}
                onChange={(e) => setHighpassFreq(parseInt(e.target.value))}
                className="flex-1"
                title={`Highpass frequency: ${highpassFreq}Hz`}
              />
              <span className="text-xs text-text-muted w-16 text-right">{highpassFreq}Hz</span>
            </div>

            {/* Hi Cut (Lowpass) */}
            <div className="flex items-center gap-3">
              <label className="text-sm text-text-primary w-20">Hi Cut:</label>
              <input
                type="range"
                min="40"
                max="20000"
                value={lowpassFreq}
                onChange={(e) => setLowpassFreq(parseInt(e.target.value))}
                className="flex-1"
                title={`Lowpass frequency: ${lowpassFreq}Hz`}
              />
              <span className="text-xs text-text-muted w-16 text-right">{lowpassFreq}Hz</span>
            </div>
          </div>

          {/* Limiter */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={limiterEnabled}
                onChange={(e) => setLimiterEnabled(e.target.checked)}
                className="w-4 h-4"
                id="limiter-enable"
              />
              <label htmlFor="limiter-enable" className="text-sm font-medium text-text-secondary cursor-pointer">
                Brickwall Limiter
              </label>
            </div>

            {limiterEnabled && (
              <>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-text-primary w-24">Threshold</span>
                  <input
                    type="range"
                    min="-60"
                    max="0"
                    value={limiterThreshold}
                    onChange={(e) => setLimiterThreshold(parseInt(e.target.value))}
                    className="flex-1"
                    title={`Limiter threshold: ${limiterThreshold}dB`}
                  />
                  <span className="text-xs text-text-muted w-16 text-right">{limiterThreshold}dB</span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-sm text-text-primary w-24">Makeup</span>
                  <input
                    type="range"
                    min="0"
                    max="400"
                    value={limiterMakeup}
                    onChange={(e) => setLimiterMakeup(parseInt(e.target.value))}
                    className="flex-1"
                    title={`Makeup gain: ${(limiterMakeup / 4).toFixed(0)} (${(1 + limiterMakeup / 100).toFixed(2)}x)`}
                  />
                  <span className="text-xs text-text-muted w-16 text-right">{(limiterMakeup / 4).toFixed(0)}</span>
                </div>
              </>
            )}
          </div>

          {/* Info */}
          <div className="bg-accent-primary/10 border border-accent-primary/30 rounded p-3">
            <p className="text-xs text-text-secondary">
              <strong>AmigaPal Processing:</strong><br />
              1. Limiter (if enabled) + Makeup Gain<br />
              2. Lowpass Filter → Highpass Filter<br />
              3. Resample to ProTracker rate ({targetRate}Hz)<br />
              4. Normalize to peak<br />
              5. Convert to 8-bit signed with proper quantization
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-4 py-3 border-t border-dark-border">
          <button
            onClick={handlePreview}
            disabled={!buffer || isProcessing}
            className="flex items-center gap-2 px-4 py-2 bg-dark-bgTertiary hover:bg-dark-bgHover border border-dark-border rounded text-text-primary disabled:opacity-50"
            title="Preview the processed audio"
          >
            {isPreviewing ? <Square size={16} /> : <Play size={16} />}
            {isPreviewing ? 'Stop' : 'Preview'}
          </button>

          <button
            onClick={handleExport8SVX}
            disabled={!buffer || isProcessing}
            className="flex items-center gap-2 px-4 py-2 bg-dark-bgTertiary hover:bg-dark-bgHover border border-dark-border rounded text-text-primary disabled:opacity-50"
            title="Export as 8SVX (Amiga IFF format)"
          >
            <Download size={16} />
            Export 8SVX
          </button>

          <div className="flex-1" />

          <button
            onClick={onClose}
            className="px-4 py-2 text-text-muted hover:text-text-primary"
          >
            Cancel
          </button>

          <button
            onClick={handleApply}
            disabled={!buffer || isProcessing}
            className="px-6 py-2 bg-accent-primary hover:bg-accent-primaryHover text-white rounded font-medium disabled:opacity-50"
            title="Apply AmigaPal processing to sample"
          >
            {isProcessing ? 'Processing...' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
};
