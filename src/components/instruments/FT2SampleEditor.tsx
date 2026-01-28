/**
 * FT2SampleEditor - Full-featured sample editor inspired by FastTracker 2
 *
 * Features:
 * - Waveform display with zoom/scroll
 * - Range selection with visual feedback
 * - Draggable loop pins
 * - Loop types: Off, Forward, Pingpong
 * - Cut/Copy/Paste operations
 * - Sample effects: Volume, Echo, Resample, Reverse, Normalize, Cross-fade, DC Fix
 * - 8-bit/16-bit display
 * - Multiple playback modes: Wave, Display, Range
 * - Save/Export range
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  Upload, Play, Square, ChevronLeft, ChevronRight,
  ZoomIn, Scissors, Copy, ClipboardPaste, Crop,
  Repeat, RotateCcw, Maximize2, Volume2, Waves, Sparkles,
  Save, Trash2, Music, ArrowLeft, ArrowRight,
  FlipHorizontal, Settings2, Zap, Undo2, Redo2, Wand2
} from 'lucide-react';
import { useInstrumentStore, notify } from '../../stores';
import type { InstrumentConfig, SampleConfig } from '../../types/instrument';
import * as Tone from 'tone';
import { SamplePlaybackCursor } from '@components/visualization';
import { BeatSlicerPanel } from './BeatSlicerPanel';
import { SampleEnhancerPanel } from './SampleEnhancerPanel';
import type { ProcessedResult } from '../../utils/audio/SampleProcessing';
import { SampleUndoManager } from '../../lib/audio/SampleUndoManager';

// ============================================================================
// TYPES
// ============================================================================

interface FT2SampleEditorProps {
  instrument: InstrumentConfig;
  onChange?: (updates: Partial<InstrumentConfig>) => void;
}

type LoopType = 'off' | 'forward' | 'pingpong';

interface SampleState {
  audioBuffer: AudioBuffer | null;
  rawBuffer: ArrayBuffer | null;  // For destructive editing
  displayStart: number;  // View start (0-1 normalized)
  displayEnd: number;    // View end (0-1 normalized)
  rangeStart: number;    // Selection start (sample index)
  rangeEnd: number;      // Selection end (sample index)
  loopStart: number;     // Loop start (sample index)
  loopEnd: number;       // Loop end (sample index)
  loopType: LoopType;
  copyBuffer: Float32Array | null;
  copyBufferChannels: number;
}

interface DragState {
  type: 'none' | 'range' | 'loopStart' | 'loopEnd' | 'scroll' | 'draw';
  startX: number;
  startSample: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const WAVEFORM_HEIGHT = 180;
const WAVEFORM_BG = '#0a0808';
const WAVEFORM_GRID = '#1a1414';
const WAVEFORM_CENTER = '#2a2020';
const WAVEFORM_COLOR = '#ef4444';
const WAVEFORM_RANGE = 'rgba(59, 130, 246, 0.3)';
const LOOP_COLOR = '#3b82f6';
const LOOP_PIN_COLOR = '#60a5fa';
const PLAYBACK_COLOR = '#fbbf24';
const SLICE_COLOR = '#22c55e';
const SLICE_SELECTED_COLOR = '#4ade80';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// ============================================================================
// COMPONENT
// ============================================================================

export const FT2SampleEditor: React.FC<FT2SampleEditorProps> = ({ instrument, onChange }) => {
  const { updateInstrument: storeUpdateInstrument, updateSampleBuffer } = useInstrumentStore();

  // Update helper
  const updateInstrument = useCallback((id: number, updates: Partial<InstrumentConfig>) => {
    if (onChange) {
      onChange(updates);
    } else {
      storeUpdateInstrument(id, updates);
    }
  }, [onChange, storeUpdateInstrument]);

  // ============================================================================
  // REFS
  // ============================================================================

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<Tone.Player | null>(null);
  const animationRef = useRef<number | null>(null);
  const undoManagerRef = useRef<SampleUndoManager>(new SampleUndoManager(20));

  // ============================================================================
  // STATE
  // ============================================================================

  const [sampleState, setSampleState] = useState<SampleState>({
    audioBuffer: null,
    rawBuffer: null,
    displayStart: 0,
    displayEnd: 1,
    rangeStart: 0,
    rangeEnd: 0,
    loopStart: 0,
    loopEnd: 0,
    loopType: 'off',
    copyBuffer: null,
    copyBufferChannels: 1,
  });

  const [dragState, setDragState] = useState<DragState>({
    type: 'none',
    startX: 0,
    startSample: 0,
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [playNote, setPlayNote] = useState(48); // C4 = MIDI 60, but we use C3 = 48 for samples
  const [showEffects, setShowEffects] = useState(false);
  const [showBeatSlicer, setShowBeatSlicer] = useState(false);
  const [showEnhancer, setShowEnhancer] = useState(false);
  const [selectedSliceId, setSelectedSliceId] = useState<string | null>(null);
  // Counter to trigger re-renders when undo/redo stack changes
  const [, setUndoRedoVersion] = useState(0);

  // Get sample URL from instrument
  const sampleUrl = instrument.sample?.url || instrument.parameters?.sampleUrl || null;

  // ============================================================================
  // DERIVED VALUES
  // ============================================================================

  const totalSamples = sampleState.audioBuffer?.length || 0;
  const sampleRate = sampleState.audioBuffer?.sampleRate || 44100;

  const visibleStartSample = Math.floor(sampleState.displayStart * totalSamples);
  const visibleEndSample = Math.floor(sampleState.displayEnd * totalSamples);

  const hasRange = sampleState.rangeEnd > sampleState.rangeStart;
  const hasLoop = sampleState.loopType !== 'off' && sampleState.loopEnd > sampleState.loopStart;

  // Undo/Redo state
  const canUndo = undoManagerRef.current.canUndo();
  const canRedo = undoManagerRef.current.canRedo();

  // ============================================================================
  // UNDO/REDO HELPERS
  // ============================================================================

  // Save state before a destructive operation
  const saveUndoState = useCallback((label: string) => {
    if (!sampleState.audioBuffer) return;

    undoManagerRef.current.pushState({
      buffer: SampleUndoManager.cloneBuffer(sampleState.audioBuffer),
      label,
      loopStart: sampleState.loopStart,
      loopEnd: sampleState.loopEnd,
      loopType: sampleState.loopType,
    });
    setUndoRedoVersion(v => v + 1);
  }, [sampleState.audioBuffer, sampleState.loopStart, sampleState.loopEnd, sampleState.loopType]);

  // Undo handler
  const handleUndo = useCallback(async () => {
    if (!sampleState.audioBuffer || !canUndo) return;

    const currentState = {
      buffer: SampleUndoManager.cloneBuffer(sampleState.audioBuffer),
      label: 'Current',
      loopStart: sampleState.loopStart,
      loopEnd: sampleState.loopEnd,
      loopType: sampleState.loopType,
    };

    const prevState = undoManagerRef.current.undo(currentState);
    if (!prevState) return;

    setSampleState(prev => ({
      ...prev,
      audioBuffer: prevState.buffer,
      loopStart: prevState.loopStart,
      loopEnd: prevState.loopEnd,
      loopType: prevState.loopType,
    }));

    if (playerRef.current) {
      playerRef.current.buffer = new Tone.ToneAudioBuffer(prevState.buffer);
    }

    // Persist to store
    await updateSampleBuffer(instrument.id, prevState.buffer);
    setUndoRedoVersion(v => v + 1);
    notify.success(`Undo: ${prevState.label}`);
  }, [sampleState, canUndo, instrument.id, updateSampleBuffer]);

  // Redo handler
  const handleRedo = useCallback(async () => {
    if (!sampleState.audioBuffer || !canRedo) return;

    const currentState = {
      buffer: SampleUndoManager.cloneBuffer(sampleState.audioBuffer),
      label: 'Current',
      loopStart: sampleState.loopStart,
      loopEnd: sampleState.loopEnd,
      loopType: sampleState.loopType,
    };

    const nextState = undoManagerRef.current.redo(currentState);
    if (!nextState) return;

    setSampleState(prev => ({
      ...prev,
      audioBuffer: nextState.buffer,
      loopStart: nextState.loopStart,
      loopEnd: nextState.loopEnd,
      loopType: nextState.loopType,
    }));

    if (playerRef.current) {
      playerRef.current.buffer = new Tone.ToneAudioBuffer(nextState.buffer);
    }

    // Persist to store
    await updateSampleBuffer(instrument.id, nextState.buffer);
    setUndoRedoVersion(v => v + 1);
    notify.success(`Redo: ${nextState.label}`);
  }, [sampleState, canRedo, instrument.id, updateSampleBuffer]);

  // Handle enhancer panel results
  const handleEnhancerResult = useCallback(async (result: ProcessedResult) => {
    if (!sampleState.audioBuffer) return;

    // Save undo state
    saveUndoState('Enhancement');

    setSampleState(prev => ({
      ...prev,
      audioBuffer: result.buffer,
    }));

    if (playerRef.current) {
      playerRef.current.buffer = new Tone.ToneAudioBuffer(result.buffer);
    }

    // Persist to store
    await updateSampleBuffer(instrument.id, result.buffer);
  }, [sampleState.audioBuffer, saveUndoState, instrument.id, updateSampleBuffer]);

  // ============================================================================
  // LOAD SAMPLE
  // ============================================================================

  useEffect(() => {
    if (!sampleUrl) {
      setSampleState(prev => ({ ...prev, audioBuffer: null, rawBuffer: null }));
      return;
    }

    const loadBuffer = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(sampleUrl);
        const arrayBuffer = await response.arrayBuffer();
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const buffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));

        // Initialize loop points from instrument if available
        const loopStart = instrument.sample?.loopStart || 0;
        const loopEnd = instrument.sample?.loopEnd || buffer.length;
        // Properly restore loop type including pingpong
        const savedLoopType = instrument.sample?.loopType;
        const loopType: LoopType = !instrument.sample?.loop ? 'off' :
          savedLoopType === 'pingpong' ? 'pingpong' : 'forward';

        setSampleState(prev => ({
          ...prev,
          audioBuffer: buffer,
          rawBuffer: arrayBuffer,
          loopStart,
          loopEnd,
          loopType,
          displayStart: 0,
          displayEnd: 1,
          rangeStart: 0,
          rangeEnd: 0,
        }));

        // Create player for preview
        if (playerRef.current) {
          playerRef.current.dispose();
        }
        playerRef.current = new Tone.Player(sampleUrl).toDestination();
      } catch (err) {
        console.error('[FT2SampleEditor] Failed to load audio:', err);
        notify.error('Failed to load audio file');
      } finally {
        setIsLoading(false);
      }
    };

    loadBuffer();

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [sampleUrl]);

  // ============================================================================
  // DRAW WAVEFORM
  // ============================================================================

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const midY = height / 2;

    // Clear with background
    ctx.fillStyle = WAVEFORM_BG;
    ctx.fillRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = WAVEFORM_GRID;
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (height / 4) * i);
      ctx.lineTo(width, (height / 4) * i);
      ctx.stroke();
    }

    // Center line
    ctx.strokeStyle = WAVEFORM_CENTER;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.stroke();

    const { audioBuffer, displayStart, displayEnd, rangeStart, rangeEnd, loopStart, loopEnd, loopType } = sampleState;

    if (!audioBuffer) {
      // Placeholder text
      ctx.fillStyle = '#666';
      ctx.font = 'bold 16px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Drop sample or click to load', width / 2, midY - 10);
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.fillStyle = '#444';
      ctx.fillText('WAV, MP3, OGG, FLAC', width / 2, midY + 15);
      return;
    }

    const channelData = audioBuffer.getChannelData(0);
    const samples = audioBuffer.length;

    const viewStart = Math.floor(displayStart * samples);
    const viewEnd = Math.floor(displayEnd * samples);
    const viewLength = viewEnd - viewStart;
    const samplesPerPixel = viewLength / width;

    // Helper to convert sample index to X position
    const sampleToX = (sampleIdx: number): number => {
      return ((sampleIdx - viewStart) / viewLength) * width;
    };

    // Draw range selection background
    if (rangeEnd > rangeStart) {
      const rangeStartX = sampleToX(rangeStart);
      const rangeEndX = sampleToX(rangeEnd);
      ctx.fillStyle = WAVEFORM_RANGE;
      ctx.fillRect(rangeStartX, 0, rangeEndX - rangeStartX, height);
    }

    // Draw loop region
    if (loopType !== 'off' && loopEnd > loopStart) {
      const loopStartX = sampleToX(loopStart);
      const loopEndX = sampleToX(loopEnd);

      // Loop region fill
      ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
      ctx.fillRect(loopStartX, 0, loopEndX - loopStartX, height);

      // Loop boundary lines
      ctx.strokeStyle = LOOP_COLOR;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);

      ctx.beginPath();
      ctx.moveTo(loopStartX, 0);
      ctx.lineTo(loopStartX, height);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(loopEndX, 0);
      ctx.lineTo(loopEndX, height);
      ctx.stroke();

      ctx.setLineDash([]);

      // Loop pins (triangles)
      ctx.fillStyle = LOOP_PIN_COLOR;

      // Left pin (pointing right)
      ctx.beginPath();
      ctx.moveTo(loopStartX, 0);
      ctx.lineTo(loopStartX + 10, 10);
      ctx.lineTo(loopStartX, 20);
      ctx.closePath();
      ctx.fill();

      // Right pin (pointing left)
      ctx.beginPath();
      ctx.moveTo(loopEndX, 0);
      ctx.lineTo(loopEndX - 10, 10);
      ctx.lineTo(loopEndX, 20);
      ctx.closePath();
      ctx.fill();

      // Loop type indicator
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = LOOP_COLOR;
      ctx.textAlign = 'left';
      ctx.fillText(loopType === 'pingpong' ? '↔' : '→', loopStartX + 3, height - 4);
    }

    // Draw waveform
    ctx.strokeStyle = WAVEFORM_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();

    if (samplesPerPixel <= 1) {
      // Zoomed in: draw individual samples as lines
      for (let x = 0; x < width; x++) {
        const sampleIdx = viewStart + Math.floor((x / width) * viewLength);
        if (sampleIdx >= 0 && sampleIdx < samples) {
          const val = channelData[sampleIdx];
          const y = midY - val * midY * 0.9;
          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
      }
    } else {
      // Zoomed out: draw min/max peaks
      for (let x = 0; x < width; x++) {
        const startSample = viewStart + Math.floor((x / width) * viewLength);
        const endSample = viewStart + Math.floor(((x + 1) / width) * viewLength);

        let min = 1, max = -1;
        for (let i = startSample; i < endSample && i < samples; i++) {
          if (i >= 0) {
            const val = channelData[i];
            if (val < min) min = val;
            if (val > max) max = val;
          }
        }

        const minY = midY - min * midY * 0.9;
        const maxY = midY - max * midY * 0.9;

        if (x === 0) {
          ctx.moveTo(x, minY);
        }
        ctx.lineTo(x, minY);
        ctx.lineTo(x, maxY);
      }
    }
    ctx.stroke();

    // Draw slice markers
    const slices = instrument.sample?.slices || [];
    if (slices.length > 0) {
      slices.forEach((slice, index) => {
        const isSelected = slice.id === selectedSliceId;
        const sliceStartX = sampleToX(slice.startFrame);

        // Only draw if visible in current view
        if (sliceStartX >= 0 && sliceStartX <= width) {
          // Slice line
          ctx.strokeStyle = isSelected ? SLICE_SELECTED_COLOR : SLICE_COLOR;
          ctx.lineWidth = isSelected ? 2 : 1;
          ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.moveTo(sliceStartX, 0);
          ctx.lineTo(sliceStartX, height);
          ctx.stroke();
          ctx.setLineDash([]);

          // Slice number badge
          ctx.fillStyle = isSelected ? SLICE_SELECTED_COLOR : SLICE_COLOR;
          ctx.beginPath();
          ctx.arc(sliceStartX, height - 12, 8, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#000';
          ctx.font = 'bold 8px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(index + 1), sliceStartX, height - 12);
        }
      });
    }

    // Draw playback position
    if (isPlaying && playbackPosition > 0) {
      const posX = sampleToX(playbackPosition);
      if (posX >= 0 && posX <= width) {
        ctx.strokeStyle = PLAYBACK_COLOR;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(posX, 0);
        ctx.lineTo(posX, height);
        ctx.stroke();
      }
    }

  }, [sampleState, isPlaying, playbackPosition, instrument.sample?.slices, selectedSliceId]);

  // Redraw on state changes
  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);

  // ============================================================================
  // MOUSE HANDLERS
  // ============================================================================

  const xToSample = useCallback((clientX: number): number => {
    const canvas = canvasRef.current;
    if (!canvas || !sampleState.audioBuffer) return 0;

    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const viewStart = Math.floor(sampleState.displayStart * totalSamples);
    const viewEnd = Math.floor(sampleState.displayEnd * totalSamples);
    const viewLength = viewEnd - viewStart;

    return Math.max(0, Math.min(totalSamples, Math.floor(viewStart + x * viewLength)));
  }, [sampleState.displayStart, sampleState.displayEnd, totalSamples]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!sampleState.audioBuffer) {
      fileInputRef.current?.click();
      return;
    }

    const sample = xToSample(e.clientX);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if clicking on loop pins (top 20 pixels)
    if (y < 25 && sampleState.loopType !== 'off') {
      const viewStart = Math.floor(sampleState.displayStart * totalSamples);
      const viewEnd = Math.floor(sampleState.displayEnd * totalSamples);
      const viewLength = viewEnd - viewStart;

      const loopStartX = ((sampleState.loopStart - viewStart) / viewLength) * canvas.width;
      const loopEndX = ((sampleState.loopEnd - viewStart) / viewLength) * canvas.width;

      if (Math.abs(x - loopStartX) < 15) {
        setDragState({ type: 'loopStart', startX: e.clientX, startSample: sampleState.loopStart });
        return;
      }
      if (Math.abs(x - loopEndX) < 15) {
        setDragState({ type: 'loopEnd', startX: e.clientX, startSample: sampleState.loopEnd });
        return;
      }
    }

    // Right click = draw/paint waveform
    if (e.button === 2) {
      setDragState({ type: 'draw', startX: e.clientX, startSample: sample });
      return;
    }

    // Left click = range selection
    setDragState({ type: 'range', startX: e.clientX, startSample: sample });
    setSampleState(prev => ({ ...prev, rangeStart: sample, rangeEnd: sample }));

  }, [sampleState, xToSample, totalSamples]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragState.type === 'none') return;

    const sample = xToSample(e.clientX);

    switch (dragState.type) {
      case 'range':
        setSampleState(prev => ({
          ...prev,
          rangeStart: Math.min(dragState.startSample, sample),
          rangeEnd: Math.max(dragState.startSample, sample),
        }));
        break;

      case 'loopStart':
        setSampleState(prev => ({
          ...prev,
          loopStart: Math.max(0, Math.min(sample, prev.loopEnd - 1)),
        }));
        break;

      case 'loopEnd':
        setSampleState(prev => ({
          ...prev,
          loopEnd: Math.min(totalSamples, Math.max(sample, prev.loopStart + 1)),
        }));
        break;

      case 'draw':
        // TODO: Implement waveform drawing
        break;
    }
  }, [dragState, xToSample, totalSamples]);

  const handleMouseUp = useCallback(() => {
    if (dragState.type === 'loopStart' || dragState.type === 'loopEnd') {
      // Save loop points to instrument
      updateInstrument(instrument.id, {
        sample: {
          ...instrument.sample,
          loopStart: sampleState.loopStart,
          loopEnd: sampleState.loopEnd,
        } as SampleConfig,
      });
    }
    setDragState({ type: 'none', startX: 0, startSample: 0 });
  }, [dragState.type, sampleState.loopStart, sampleState.loopEnd, instrument, updateInstrument]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();

    if (!sampleState.audioBuffer) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) / rect.width;

    const zoomFactor = e.deltaY > 0 ? 1.2 : 0.8;

    const currentRange = sampleState.displayEnd - sampleState.displayStart;
    const newRange = Math.max(0.001, Math.min(1, currentRange * zoomFactor));

    // Zoom centered on mouse position
    const mousePos = sampleState.displayStart + mouseX * currentRange;
    let newStart = mousePos - mouseX * newRange;
    let newEnd = mousePos + (1 - mouseX) * newRange;

    // Clamp to valid range
    if (newStart < 0) {
      newEnd -= newStart;
      newStart = 0;
    }
    if (newEnd > 1) {
      newStart -= (newEnd - 1);
      newEnd = 1;
    }

    setSampleState(prev => ({
      ...prev,
      displayStart: Math.max(0, newStart),
      displayEnd: Math.min(1, newEnd),
    }));
  }, [sampleState]);

  // ============================================================================
  // PLAYBACK
  // ============================================================================

  const stopPlayback = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.stop();
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    setIsPlaying(false);
    setPlaybackPosition(0);
  }, []);

  const playWave = useCallback(async () => {
    if (!playerRef.current || !sampleState.audioBuffer) return;

    await Tone.start();
    stopPlayback();

    const hasLoop = sampleState.loopType !== 'off' && sampleState.loopEnd > sampleState.loopStart;

    // Configure player for looping
    if (hasLoop) {
      playerRef.current.loop = true;
      playerRef.current.loopStart = sampleState.loopStart / sampleRate;
      playerRef.current.loopEnd = sampleState.loopEnd / sampleRate;
    } else {
      playerRef.current.loop = false;
    }

    playerRef.current.start();
    setIsPlaying(true);

    const startTime = Tone.now();

    const animate = () => {
      const elapsed = Tone.now() - startTime;
      let pos = Math.floor(elapsed * sampleRate);

      if (hasLoop) {
        const loopLen = sampleState.loopEnd - sampleState.loopStart;
        // Calculate position within loop
        if (pos >= sampleState.loopStart) {
          const loopTime = pos - sampleState.loopStart;
          const loopsElapsed = Math.floor(loopTime / loopLen);

          if (sampleState.loopType === 'pingpong') {
            // Pingpong: alternate direction each loop
            const isReverse = loopsElapsed % 2 === 1;
            const posInLoop = loopTime % loopLen;
            if (isReverse) {
              pos = sampleState.loopEnd - posInLoop;
            } else {
              pos = sampleState.loopStart + posInLoop;
            }
          } else {
            // Forward loop
            pos = sampleState.loopStart + (loopTime % loopLen);
          }
        }
      } else {
        // No loop - stop at end
        if (pos >= totalSamples) {
          stopPlayback();
          return;
        }
      }

      setPlaybackPosition(pos);
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();
  }, [sampleState, sampleRate, totalSamples, stopPlayback]);

  const playRange = useCallback(async () => {
    if (!playerRef.current || !sampleState.audioBuffer || !hasRange) return;

    await Tone.start();
    stopPlayback();

    const startOffset = sampleState.rangeStart / sampleRate;
    const duration = (sampleState.rangeEnd - sampleState.rangeStart) / sampleRate;

    playerRef.current.start(Tone.now(), startOffset, duration);
    setIsPlaying(true);

    const startTime = Tone.now();
    const animate = () => {
      const elapsed = Tone.now() - startTime;
      const pos = sampleState.rangeStart + Math.floor(elapsed * sampleRate);

      if (pos >= sampleState.rangeEnd) {
        stopPlayback();
        return;
      }

      setPlaybackPosition(pos);
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();
  }, [sampleState, sampleRate, hasRange, stopPlayback]);

  const playDisplay = useCallback(async () => {
    if (!playerRef.current || !sampleState.audioBuffer) return;

    await Tone.start();
    stopPlayback();

    const startOffset = (sampleState.displayStart * totalSamples) / sampleRate;
    const duration = ((sampleState.displayEnd - sampleState.displayStart) * totalSamples) / sampleRate;

    playerRef.current.start(Tone.now(), startOffset, duration);
    setIsPlaying(true);

    const startSample = Math.floor(sampleState.displayStart * totalSamples);
    const endSample = Math.floor(sampleState.displayEnd * totalSamples);
    const startTime = Tone.now();

    const animate = () => {
      const elapsed = Tone.now() - startTime;
      const pos = startSample + Math.floor(elapsed * sampleRate);

      if (pos >= endSample) {
        stopPlayback();
        return;
      }

      setPlaybackPosition(pos);
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();
  }, [sampleState, sampleRate, totalSamples, stopPlayback]);

  // ============================================================================
  // NAVIGATION
  // ============================================================================

  const scrollLeft = useCallback(() => {
    const scrollAmount = (sampleState.displayEnd - sampleState.displayStart) / 4;
    setSampleState(prev => ({
      ...prev,
      displayStart: Math.max(0, prev.displayStart - scrollAmount),
      displayEnd: Math.max(scrollAmount, prev.displayEnd - scrollAmount),
    }));
  }, [sampleState]);

  const scrollRight = useCallback(() => {
    const scrollAmount = (sampleState.displayEnd - sampleState.displayStart) / 4;
    setSampleState(prev => ({
      ...prev,
      displayStart: Math.min(1 - scrollAmount, prev.displayStart + scrollAmount),
      displayEnd: Math.min(1, prev.displayEnd + scrollAmount),
    }));
  }, [sampleState]);

  const showAll = useCallback(() => {
    setSampleState(prev => ({ ...prev, displayStart: 0, displayEnd: 1 }));
  }, []);

  const showRange = useCallback(() => {
    if (!hasRange) return;
    const padding = (sampleState.rangeEnd - sampleState.rangeStart) * 0.1 / totalSamples;
    setSampleState(prev => ({
      ...prev,
      displayStart: Math.max(0, prev.rangeStart / totalSamples - padding),
      displayEnd: Math.min(1, prev.rangeEnd / totalSamples + padding),
    }));
  }, [sampleState, totalSamples, hasRange]);

  const rangeAll = useCallback(() => {
    setSampleState(prev => ({
      ...prev,
      rangeStart: visibleStartSample,
      rangeEnd: visibleEndSample,
    }));
  }, [visibleStartSample, visibleEndSample]);

  const clearRange = useCallback(() => {
    setSampleState(prev => ({ ...prev, rangeStart: 0, rangeEnd: 0 }));
  }, []);

  // ============================================================================
  // LOOP CONTROLS
  // ============================================================================

  const setLoopType = useCallback((type: LoopType) => {
    let loopStart = sampleState.loopStart;
    let loopEnd = sampleState.loopEnd;

    // Initialize loop points if enabling loop for first time
    if (type !== 'off' && loopEnd <= loopStart) {
      loopStart = 0;
      loopEnd = totalSamples;
    }

    setSampleState(prev => ({
      ...prev,
      loopType: type,
      loopStart,
      loopEnd,
    }));

    updateInstrument(instrument.id, {
      sample: {
        ...instrument.sample,
        loop: type !== 'off',
        loopType: type === 'pingpong' ? 'pingpong' : 'forward',
        loopStart,
        loopEnd,
      } as SampleConfig,
    });

    // Update player loop settings immediately
    if (playerRef.current && type !== 'off') {
      playerRef.current.loop = true;
      playerRef.current.loopStart = loopStart / sampleRate;
      playerRef.current.loopEnd = loopEnd / sampleRate;
    } else if (playerRef.current) {
      playerRef.current.loop = false;
    }
  }, [instrument, sampleState, totalSamples, sampleRate, updateInstrument]);

  // ============================================================================
  // FILE HANDLING
  // ============================================================================

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.type.startsWith('audio/') && !file.name.match(/\.(wav|mp3|ogg|flac|webm|aiff?)$/i)) {
      notify.error('Invalid file type');
      return;
    }

    setIsLoading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      updateInstrument(instrument.id, {
        sample: {
          ...instrument.sample,
          url: dataUrl,
          loop: false,
          loopStart: 0,
          loopEnd: 0,
        } as SampleConfig,
        parameters: {
          ...instrument.parameters,
          sampleUrl: dataUrl,
          sampleInfo: {
            name: file.name,
            size: file.size,
          },
        },
      });
    } catch (err) {
      notify.error('Failed to load audio file');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [instrument, updateInstrument]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const clearSample = useCallback(() => {
    stopPlayback();
    updateInstrument(instrument.id, {
      sample: undefined,
      parameters: {
        ...instrument.parameters,
        sampleUrl: null,
        sampleInfo: null,
      },
    });
  }, [instrument, updateInstrument, stopPlayback]);

  // ============================================================================
  // EDIT OPERATIONS
  // ============================================================================

  const handleCopy = useCallback(() => {
    if (!sampleState.audioBuffer || !hasRange) return;

    const channels = sampleState.audioBuffer.numberOfChannels;
    const rangeLength = sampleState.rangeEnd - sampleState.rangeStart;

    // Create interleaved copy buffer
    const copyData = new Float32Array(rangeLength * channels);

    for (let ch = 0; ch < channels; ch++) {
      const channelData = sampleState.audioBuffer.getChannelData(ch);
      for (let i = 0; i < rangeLength; i++) {
        copyData[i * channels + ch] = channelData[sampleState.rangeStart + i];
      }
    }

    setSampleState(prev => ({
      ...prev,
      copyBuffer: copyData,
      copyBufferChannels: channels,
    }));

    notify.success(`Copied ${rangeLength} samples`);
  }, [sampleState, hasRange]);

  const handleCut = useCallback(async () => {
    if (!sampleState.audioBuffer || !hasRange) return;

    // Save undo state
    saveUndoState('Cut');

    // First copy, then delete
    handleCopy();

    const channels = sampleState.audioBuffer.numberOfChannels;
    const newLength = totalSamples - (sampleState.rangeEnd - sampleState.rangeStart);

    // Create new audio buffer without the range
    const newBuffer = Tone.context.createBuffer(
      channels,
      newLength,
      sampleState.audioBuffer.sampleRate
    );

    for (let ch = 0; ch < channels; ch++) {
      const oldData = sampleState.audioBuffer.getChannelData(ch);
      const newData = newBuffer.getChannelData(ch);

      // Copy before range
      for (let i = 0; i < sampleState.rangeStart; i++) {
        newData[i] = oldData[i];
      }
      // Copy after range
      for (let i = sampleState.rangeEnd; i < totalSamples; i++) {
        newData[i - (sampleState.rangeEnd - sampleState.rangeStart)] = oldData[i];
      }
    }

    // Update state and player
    setSampleState(prev => ({
      ...prev,
      audioBuffer: newBuffer,
      rangeStart: 0,
      rangeEnd: 0,
      loopEnd: Math.min(prev.loopEnd, newLength),
    }));

    if (playerRef.current) {
      playerRef.current.buffer = new Tone.ToneAudioBuffer(newBuffer);
    }

    // Persist to store and update ToneEngine
    await updateSampleBuffer(instrument.id, newBuffer);

    notify.success(`Cut ${sampleState.rangeEnd - sampleState.rangeStart} samples`);
  }, [sampleState, hasRange, totalSamples, handleCopy, instrument.id, updateSampleBuffer, saveUndoState]);

  const handlePaste = useCallback(async () => {
    if (!sampleState.audioBuffer || !sampleState.copyBuffer) return;

    // Save undo state
    saveUndoState('Paste');

    const channels = sampleState.audioBuffer.numberOfChannels;
    const copyChannels = sampleState.copyBufferChannels;
    const copyLength = sampleState.copyBuffer.length / copyChannels;
    const insertPos = hasRange ? sampleState.rangeStart : 0;

    const newLength = totalSamples + copyLength;

    const newBuffer = Tone.context.createBuffer(
      channels,
      newLength,
      sampleState.audioBuffer.sampleRate
    );

    for (let ch = 0; ch < channels; ch++) {
      const oldData = sampleState.audioBuffer.getChannelData(ch);
      const newData = newBuffer.getChannelData(ch);
      const srcCh = Math.min(ch, copyChannels - 1);

      // Copy before insert point
      for (let i = 0; i < insertPos; i++) {
        newData[i] = oldData[i];
      }
      // Insert paste data
      for (let i = 0; i < copyLength; i++) {
        newData[insertPos + i] = sampleState.copyBuffer[i * copyChannels + srcCh];
      }
      // Copy after insert point
      for (let i = insertPos; i < totalSamples; i++) {
        newData[i + copyLength] = oldData[i];
      }
    }

    setSampleState(prev => ({
      ...prev,
      audioBuffer: newBuffer,
      rangeStart: insertPos,
      rangeEnd: insertPos + copyLength,
    }));

    if (playerRef.current) {
      playerRef.current.buffer = new Tone.ToneAudioBuffer(newBuffer);
    }

    // Persist to store and update ToneEngine
    await updateSampleBuffer(instrument.id, newBuffer);

    notify.success(`Pasted ${copyLength} samples`);
  }, [sampleState, hasRange, totalSamples, instrument.id, updateSampleBuffer, saveUndoState]);

  const handleCrop = useCallback(async () => {
    if (!sampleState.audioBuffer || !hasRange) return;

    // Save undo state
    saveUndoState('Crop');

    const channels = sampleState.audioBuffer.numberOfChannels;
    const cropLength = sampleState.rangeEnd - sampleState.rangeStart;

    const newBuffer = Tone.context.createBuffer(
      channels,
      cropLength,
      sampleState.audioBuffer.sampleRate
    );

    for (let ch = 0; ch < channels; ch++) {
      const oldData = sampleState.audioBuffer.getChannelData(ch);
      const newData = newBuffer.getChannelData(ch);

      for (let i = 0; i < cropLength; i++) {
        newData[i] = oldData[sampleState.rangeStart + i];
      }
    }

    setSampleState(prev => ({
      ...prev,
      audioBuffer: newBuffer,
      displayStart: 0,
      displayEnd: 1,
      rangeStart: 0,
      rangeEnd: 0,
      loopStart: 0,
      loopEnd: cropLength,
    }));

    if (playerRef.current) {
      playerRef.current.buffer = new Tone.ToneAudioBuffer(newBuffer);
    }

    // Persist to store and update ToneEngine
    await updateSampleBuffer(instrument.id, newBuffer);

    notify.success(`Cropped to ${cropLength} samples`);
  }, [sampleState, hasRange, instrument.id, updateSampleBuffer]);

  const handleReverse = useCallback(async () => {
    if (!sampleState.audioBuffer) return;

    // Save undo state
    saveUndoState('Reverse');

    const channels = sampleState.audioBuffer.numberOfChannels;
    const start = hasRange ? sampleState.rangeStart : 0;
    const end = hasRange ? sampleState.rangeEnd : totalSamples;

    // Clone the buffer
    const newBuffer = Tone.context.createBuffer(
      channels,
      totalSamples,
      sampleState.audioBuffer.sampleRate
    );

    for (let ch = 0; ch < channels; ch++) {
      const oldData = sampleState.audioBuffer.getChannelData(ch);
      const newData = newBuffer.getChannelData(ch);

      // Copy all data
      for (let i = 0; i < totalSamples; i++) {
        newData[i] = oldData[i];
      }

      // Reverse the selected region
      const rangeLen = end - start;
      for (let i = 0; i < rangeLen; i++) {
        newData[start + i] = oldData[end - 1 - i];
      }
    }

    setSampleState(prev => ({
      ...prev,
      audioBuffer: newBuffer,
    }));

    if (playerRef.current) {
      playerRef.current.buffer = new Tone.ToneAudioBuffer(newBuffer);
    }

    // Persist to store and update ToneEngine
    await updateSampleBuffer(instrument.id, newBuffer);

    notify.success(hasRange ? 'Reversed selection' : 'Reversed sample');
  }, [sampleState, hasRange, totalSamples, instrument.id, updateSampleBuffer, saveUndoState]);

  const handleNormalize = useCallback(async () => {
    if (!sampleState.audioBuffer) return;

    const channels = sampleState.audioBuffer.numberOfChannels;
    const start = hasRange ? sampleState.rangeStart : 0;
    const end = hasRange ? sampleState.rangeEnd : totalSamples;

    // Find peak
    let peak = 0;
    for (let ch = 0; ch < channels; ch++) {
      const data = sampleState.audioBuffer.getChannelData(ch);
      for (let i = start; i < end; i++) {
        peak = Math.max(peak, Math.abs(data[i]));
      }
    }

    if (peak === 0 || peak >= 0.999) {
      notify.warning('Sample already normalized or silent');
      return;
    }

    // Save undo state (after validation, before modification)
    saveUndoState('Normalize');

    const gain = 1.0 / peak;

    // Clone and normalize
    const newBuffer = Tone.context.createBuffer(
      channels,
      totalSamples,
      sampleState.audioBuffer.sampleRate
    );

    for (let ch = 0; ch < channels; ch++) {
      const oldData = sampleState.audioBuffer.getChannelData(ch);
      const newData = newBuffer.getChannelData(ch);

      for (let i = 0; i < totalSamples; i++) {
        if (i >= start && i < end) {
          newData[i] = oldData[i] * gain;
        } else {
          newData[i] = oldData[i];
        }
      }
    }

    setSampleState(prev => ({
      ...prev,
      audioBuffer: newBuffer,
    }));

    if (playerRef.current) {
      playerRef.current.buffer = new Tone.ToneAudioBuffer(newBuffer);
    }

    // Persist to store and update ToneEngine
    await updateSampleBuffer(instrument.id, newBuffer);

    notify.success(`Normalized (peak was ${(peak * 100).toFixed(1)}%)`);
  }, [sampleState, hasRange, totalSamples, instrument.id, updateSampleBuffer, saveUndoState]);

  const handleSaveRange = useCallback(async () => {
    if (!sampleState.audioBuffer || !hasRange) return;

    const channels = sampleState.audioBuffer.numberOfChannels;
    const rangeLength = sampleState.rangeEnd - sampleState.rangeStart;

    // Create offline context to render WAV
    const offlineCtx = new OfflineAudioContext(
      channels,
      rangeLength,
      sampleState.audioBuffer.sampleRate
    );

    const source = offlineCtx.createBufferSource();
    const rangeBuffer = offlineCtx.createBuffer(
      channels,
      rangeLength,
      sampleState.audioBuffer.sampleRate
    );

    for (let ch = 0; ch < channels; ch++) {
      const src = sampleState.audioBuffer.getChannelData(ch);
      const dst = rangeBuffer.getChannelData(ch);
      for (let i = 0; i < rangeLength; i++) {
        dst[i] = src[sampleState.rangeStart + i];
      }
    }

    source.buffer = rangeBuffer;
    source.connect(offlineCtx.destination);
    source.start();

    const rendered = await offlineCtx.startRendering();

    // Convert to WAV
    const wavData = audioBufferToWav(rendered);
    const blob = new Blob([wavData], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);

    // Download
    const a = document.createElement('a');
    a.href = url;
    a.download = `sample_${Date.now()}.wav`;
    a.click();
    URL.revokeObjectURL(url);

    notify.success('Saved range to WAV');
  }, [sampleState, hasRange]);

  // Helper: Convert AudioBuffer to WAV format
  const audioBufferToWav = (buffer: AudioBuffer): ArrayBuffer => {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitsPerSample = 16;

    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;

    const data = new Float32Array(buffer.length * numChannels);
    for (let ch = 0; ch < numChannels; ch++) {
      const channelData = buffer.getChannelData(ch);
      for (let i = 0; i < buffer.length; i++) {
        data[i * numChannels + ch] = channelData[i];
      }
    }

    const dataLength = data.length * bytesPerSample;
    const wavBuffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(wavBuffer);

    // RIFF header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, 'WAVE');

    // fmt chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // data chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    // Write samples
    let offset = 44;
    for (let i = 0; i < data.length; i++) {
      const sample = Math.max(-1, Math.min(1, data[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }

    return wavBuffer;
  };

  const writeString = (view: DataView, offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // ============================================================================
  // FORMAT HELPERS
  // ============================================================================

  const formatSamplePos = (samples: number): string => {
    return samples.toString(16).toUpperCase().padStart(8, '0');
  };

  const formatTime = (samples: number): string => {
    const seconds = samples / sampleRate;
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(3);
    return `${mins}:${secs.padStart(6, '0')}`;
  };

  const noteName = NOTE_NAMES[playNote % 12] + Math.floor(playNote / 12);

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="flex flex-col bg-ft2-bg border border-ft2-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-ft2-header border-b border-ft2-border">
        <div className="flex items-center gap-2">
          <Music size={14} className="text-ft2-highlight" />
          <span className="text-ft2-highlight text-xs font-bold tracking-wide">SAMPLE EDITOR</span>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-ft2-textDim">
          {sampleState.audioBuffer && (
            <>
              <span>{(sampleRate / 1000).toFixed(1)}kHz</span>
              <span>|</span>
              <span>{sampleState.audioBuffer.numberOfChannels === 1 ? 'Mono' : 'Stereo'}</span>
              <span>|</span>
              <span>{formatTime(totalSamples)}</span>
            </>
          )}
        </div>
      </div>

      {/* Waveform Display */}
      <div
        className="relative"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <canvas
          ref={canvasRef}
          width={800}
          height={WAVEFORM_HEIGHT}
          className="w-full cursor-crosshair"
          style={{ height: WAVEFORM_HEIGHT, imageRendering: 'pixelated' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          onContextMenu={(e) => e.preventDefault()}
        />

        {/* Live Playback Cursor Overlay */}
        <SamplePlaybackCursor
          instrumentId={instrument.id}
          waveformWidth={800}
          waveformHeight={WAVEFORM_HEIGHT}
          displayStart={sampleState.displayStart}
          displayEnd={sampleState.displayEnd}
          loopStart={hasLoop ? sampleState.loopStart : undefined}
          loopEnd={hasLoop ? sampleState.loopEnd : undefined}
          totalSamples={totalSamples}
          cursorColor={PLAYBACK_COLOR}
          loopColor={LOOP_COLOR}
        />

        {isLoading && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <div className="animate-spin w-8 h-8 border-2 border-ft2-highlight border-t-transparent rounded-full" />
          </div>
        )}
      </div>

      {/* Info Bar */}
      <div className="flex items-center gap-4 px-3 py-1.5 bg-ft2-shadow border-y border-ft2-border text-[10px] font-mono">
        <div className="flex items-center gap-1">
          <span className="text-ft2-textDim">Display:</span>
          <span className="text-ft2-text">{formatSamplePos(visibleStartSample)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-ft2-textDim">Length:</span>
          <span className="text-ft2-text">{formatSamplePos(totalSamples)}</span>
        </div>
        {hasRange && (
          <>
            <div className="flex items-center gap-1">
              <span className="text-ft2-textDim">Range:</span>
              <span className="text-blue-400">{formatSamplePos(sampleState.rangeStart)}</span>
              <span className="text-ft2-textDim">-</span>
              <span className="text-blue-400">{formatSamplePos(sampleState.rangeEnd)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-ft2-textDim">Size:</span>
              <span className="text-blue-400">{formatSamplePos(sampleState.rangeEnd - sampleState.rangeStart)}</span>
            </div>
          </>
        )}
        {hasLoop && (
          <>
            <div className="flex items-center gap-1">
              <span className="text-ft2-textDim">Loop:</span>
              <span className="text-ft2-highlight">{formatSamplePos(sampleState.loopStart)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-ft2-textDim">Len:</span>
              <span className="text-ft2-highlight">{formatSamplePos(sampleState.loopEnd - sampleState.loopStart)}</span>
            </div>
          </>
        )}
      </div>

      {/* Control Panels */}
      <div className="grid grid-cols-[auto_auto_1fr_auto] gap-px bg-ft2-border">

        {/* Play Section */}
        <div className="bg-ft2-header p-2 space-y-1">
          <div className="text-[9px] text-ft2-textDim font-bold mb-1">PLAY</div>
          <div className="flex gap-1">
            <button
              onClick={() => setPlayNote(Math.max(0, playNote - 1))}
              className="ft2-btn p-1"
              title="Note Down"
            >
              <ArrowLeft size={12} />
            </button>
            <span className="ft2-display w-8 text-center text-[10px]">{noteName}</span>
            <button
              onClick={() => setPlayNote(Math.min(127, playNote + 1))}
              className="ft2-btn p-1"
              title="Note Up"
            >
              <ArrowRight size={12} />
            </button>
          </div>
          <div className="flex gap-1">
            <button onClick={stopPlayback} className="ft2-btn p-1.5" title="Stop">
              <Square size={12} />
            </button>
            <button onClick={playWave} className="ft2-btn p-1.5 flex-1" title="Play Wave" disabled={!sampleState.audioBuffer}>
              <Play size={12} />
              <span className="text-[9px] ml-1">Wave</span>
            </button>
          </div>
          <div className="flex gap-1">
            <button onClick={playRange} className="ft2-btn p-1.5 flex-1" title="Play Range" disabled={!hasRange}>
              <Play size={12} />
              <span className="text-[9px] ml-1">Rng</span>
            </button>
            <button onClick={playDisplay} className="ft2-btn p-1.5 flex-1" title="Play Display" disabled={!sampleState.audioBuffer}>
              <Play size={12} />
              <span className="text-[9px] ml-1">Dsp</span>
            </button>
          </div>
        </div>

        {/* Navigation Section */}
        <div className="bg-ft2-header p-2 space-y-1">
          <div className="text-[9px] text-ft2-textDim font-bold mb-1">VIEW</div>
          <div className="flex gap-1">
            <button onClick={scrollLeft} className="ft2-btn p-1.5" title="Scroll Left">
              <ChevronLeft size={12} />
            </button>
            <button onClick={scrollRight} className="ft2-btn p-1.5" title="Scroll Right">
              <ChevronRight size={12} />
            </button>
            <button onClick={showAll} className="ft2-btn p-1.5 flex-1" title="Show All">
              <Maximize2 size={12} />
            </button>
          </div>
          <div className="flex gap-1">
            <button onClick={showRange} className="ft2-btn p-1.5 flex-1" title="Zoom to Range" disabled={!hasRange}>
              <ZoomIn size={12} />
              <span className="text-[9px] ml-1">Rng</span>
            </button>
            <button onClick={rangeAll} className="ft2-btn p-1.5 flex-1" title="Select Display">
              Rng All
            </button>
          </div>
          <button onClick={clearRange} className="ft2-btn p-1.5 w-full" title="Clear Range" disabled={!hasRange}>
            Clr Rng
          </button>
        </div>

        {/* Edit Section */}
        <div className="bg-ft2-header p-2 space-y-1">
          <div className="text-[9px] text-ft2-textDim font-bold mb-1">EDIT</div>
          {/* Undo/Redo Row */}
          <div className="flex gap-1 mb-1">
            <button
              onClick={handleUndo}
              className="ft2-btn p-1.5 flex-1"
              title={canUndo ? `Undo: ${undoManagerRef.current.getUndoLabel()}` : 'Nothing to undo'}
              disabled={!canUndo}
            >
              <Undo2 size={12} />
              <span className="text-[9px] ml-1">Undo</span>
            </button>
            <button
              onClick={handleRedo}
              className="ft2-btn p-1.5 flex-1"
              title={canRedo ? `Redo: ${undoManagerRef.current.getRedoLabel()}` : 'Nothing to redo'}
              disabled={!canRedo}
            >
              <Redo2 size={12} />
              <span className="text-[9px] ml-1">Redo</span>
            </button>
          </div>
          <div className="flex gap-1 flex-wrap">
            <button onClick={handleCut} className="ft2-btn p-1.5" title="Cut" disabled={!hasRange}>
              <Scissors size={12} />
              <span className="text-[9px] ml-1">Cut</span>
            </button>
            <button onClick={handleCopy} className="ft2-btn p-1.5" title="Copy" disabled={!hasRange}>
              <Copy size={12} />
              <span className="text-[9px] ml-1">Copy</span>
            </button>
            <button onClick={handlePaste} className="ft2-btn p-1.5" title="Paste" disabled={!sampleState.copyBuffer}>
              <ClipboardPaste size={12} />
              <span className="text-[9px] ml-1">Paste</span>
            </button>
            <button onClick={handleCrop} className="ft2-btn p-1.5" title="Crop to Range" disabled={!hasRange}>
              <Crop size={12} />
              <span className="text-[9px] ml-1">Crop</span>
            </button>
          </div>
          <div className="flex gap-1 flex-wrap">
            <button onClick={handleReverse} className="ft2-btn p-1.5" title="Reverse" disabled={!sampleState.audioBuffer}>
              <FlipHorizontal size={12} />
            </button>
            <button onClick={handleNormalize} className="ft2-btn p-1.5" title="Normalize" disabled={!sampleState.audioBuffer}>
              <Maximize2 size={12} />
            </button>
            <button
              onClick={() => setShowEffects(!showEffects)}
              className={`ft2-btn p-1.5 ${showEffects ? 'bg-ft2-highlight text-ft2-bg' : ''}`}
              title="Effects"
            >
              <Sparkles size={12} />
              <span className="text-[9px] ml-1">FX</span>
            </button>
            <button
              onClick={() => setShowBeatSlicer(!showBeatSlicer)}
              className={`ft2-btn p-1.5 ${showBeatSlicer ? 'bg-green-500 text-ft2-bg' : ''}`}
              title="Beat Slicer"
              disabled={!sampleState.audioBuffer}
            >
              <Zap size={12} />
              <span className="text-[9px] ml-1">Slice</span>
            </button>
            <button
              onClick={() => setShowEnhancer(!showEnhancer)}
              className={`ft2-btn p-1.5 ${showEnhancer ? 'bg-purple-500 text-ft2-bg' : ''}`}
              title="Sample Enhancement (Neural Upscaling, DSP)"
              disabled={!sampleState.audioBuffer}
            >
              <Wand2 size={12} />
              <span className="text-[9px] ml-1">Enhance</span>
            </button>
            <button className="ft2-btn p-1.5" title="Volume Envelope" disabled={!sampleState.audioBuffer}>
              <Volume2 size={12} />
            </button>
          </div>
        </div>

        {/* Loop & Sample Section */}
        <div className="bg-ft2-header p-2 space-y-1">
          <div className="text-[9px] text-ft2-textDim font-bold mb-1">LOOP</div>
          <div className="flex gap-1">
            <button
              onClick={() => setLoopType('off')}
              className={`ft2-btn p-1.5 flex-1 ${sampleState.loopType === 'off' ? 'bg-ft2-cursor text-ft2-bg' : ''}`}
            >
              Off
            </button>
            <button
              onClick={() => setLoopType('forward')}
              className={`ft2-btn p-1.5 flex-1 ${sampleState.loopType === 'forward' ? 'bg-ft2-cursor text-ft2-bg' : ''}`}
            >
              Fwd
            </button>
            <button
              onClick={() => setLoopType('pingpong')}
              className={`ft2-btn p-1.5 flex-1 ${sampleState.loopType === 'pingpong' ? 'bg-ft2-cursor text-ft2-bg' : ''}`}
            >
              ↔
            </button>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="ft2-btn p-1.5 flex-1"
              title="Load Sample"
            >
              <Upload size={12} />
              <span className="text-[9px] ml-1">Load</span>
            </button>
            <button
              onClick={clearSample}
              className="ft2-btn p-1.5 text-red-400"
              title="Clear Sample"
              disabled={!sampleState.audioBuffer}
            >
              <Trash2 size={12} />
            </button>
          </div>
          <button onClick={handleSaveRange} className="ft2-btn p-1.5 w-full" title="Save Range" disabled={!hasRange}>
            <Save size={12} />
            <span className="text-[9px] ml-1">Save Rng</span>
          </button>
        </div>
      </div>

      {/* Effects Panel (collapsible) */}
      {showEffects && (
        <div className="bg-ft2-shadow border-t border-ft2-border p-3">
          <div className="text-[9px] text-ft2-textDim font-bold mb-2">SAMPLE EFFECTS</div>
          <div className="grid grid-cols-4 gap-2">
            <button onClick={() => notify.info('Volume adjust coming soon')} className="ft2-btn p-2 flex flex-col items-center gap-1" disabled={!sampleState.audioBuffer}>
              <Volume2 size={14} />
              <span className="text-[9px]">Volume</span>
            </button>
            <button onClick={() => notify.info('Echo effect coming soon')} className="ft2-btn p-2 flex flex-col items-center gap-1" disabled={!sampleState.audioBuffer}>
              <Waves size={14} />
              <span className="text-[9px]">Echo</span>
            </button>
            <button onClick={() => notify.info('Resample coming soon')} className="ft2-btn p-2 flex flex-col items-center gap-1" disabled={!sampleState.audioBuffer}>
              <RotateCcw size={14} />
              <span className="text-[9px]">Resample</span>
            </button>
            <button onClick={() => notify.info('Crossfade coming soon')} className="ft2-btn p-2 flex flex-col items-center gap-1" disabled={!sampleState.audioBuffer}>
              <Repeat size={14} />
              <span className="text-[9px]">X-Fade</span>
            </button>
            <button onClick={() => notify.info('DC offset fix coming soon')} className="ft2-btn p-2 flex flex-col items-center gap-1" disabled={!sampleState.audioBuffer}>
              <Settings2 size={14} />
              <span className="text-[9px]">DC Fix</span>
            </button>
            <button onClick={handleReverse} className="ft2-btn p-2 flex flex-col items-center gap-1" disabled={!sampleState.audioBuffer}>
              <FlipHorizontal size={14} />
              <span className="text-[9px]">Reverse</span>
            </button>
            <button onClick={handleNormalize} className="ft2-btn p-2 flex flex-col items-center gap-1" disabled={!sampleState.audioBuffer}>
              <Maximize2 size={14} />
              <span className="text-[9px]">Normalize</span>
            </button>
            <button onClick={() => notify.info('Mix paste coming soon')} className="ft2-btn p-2 flex flex-col items-center gap-1" disabled={!sampleState.audioBuffer}>
              <Sparkles size={14} />
              <span className="text-[9px]">Mix</span>
            </button>
          </div>
        </div>
      )}

      {/* Beat Slicer Panel */}
      {showBeatSlicer && sampleState.audioBuffer && (
        <div className="border-t border-ft2-border">
          <BeatSlicerPanel
            instrument={instrument}
            audioBuffer={sampleState.audioBuffer}
            selectedSliceId={selectedSliceId}
            onSliceSelect={setSelectedSliceId}
            onClose={() => setShowBeatSlicer(false)}
          />
        </div>
      )}

      {/* Sample Enhancer Panel */}
      {showEnhancer && sampleState.audioBuffer && (
        <div className="border-t border-ft2-border">
          <SampleEnhancerPanel
            audioBuffer={sampleState.audioBuffer}
            onBufferProcessed={handleEnhancerResult}
            isLoading={isLoading}
          />
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,.wav,.mp3,.ogg,.flac,.aiff,.aif"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelect(file);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }}
        className="hidden"
      />

      {/* Help */}
      <div className="px-3 py-1.5 bg-ft2-header border-t border-ft2-border text-[9px] text-ft2-textDim">
        <span className="text-ft2-text">LMB</span> Select range |
        <span className="text-ft2-text"> Wheel</span> Zoom |
        <span className="text-ft2-text"> Drag pins</span> Adjust loop
      </div>
    </div>
  );
};

export default FT2SampleEditor;
