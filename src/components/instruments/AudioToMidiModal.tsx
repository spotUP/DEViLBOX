/**
 * AudioToMidiModal.tsx — Audio-to-MIDI conversion using @spotify/basic-pitch
 *
 * Detects pitched notes in an audio sample and inserts them into the tracker
 * as a new pattern. Uses a lightweight CNN model (TF.js) that runs in the
 * browser with no server needed.
 *
 * Model: basic-pitch by Spotify (Apache-2.0)
 * Audio must be resampled to 22050 Hz mono before inference.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { X, Music, Play, Square, Loader2, ChevronDown, ChevronUp, Copy } from 'lucide-react';
import {
  BasicPitch,
  noteFramesToTime,
  addPitchBendsToNoteEvents,
  outputToNotesPoly,
} from '@spotify/basic-pitch';
import type { NoteEventTime } from '@spotify/basic-pitch';
import type { InstrumentConfig } from '../../types/instrument';
import type { Pattern, TrackerCell, ChannelData, ClipboardData } from '../../types/tracker';
import { midiToXMNote } from '../../lib/xmConversions';
import { useTrackerStore } from '../../stores/useTrackerStore';
import { useTransportStore } from '../../stores/useTransportStore';
import { notify } from '../../stores/useNotificationStore';

// ─── Constants ───────────────────────────────────────────────────────────────

const MODEL_URL = '/basic-pitch/model.json';
const ANNOTATIONS_FPS = Math.floor(22050 / 256); // 86 fps
const AUDIO_SAMPLE_RATE = 22050;

// ─── Types ───────────────────────────────────────────────────────────────────

interface AudioToMidiModalProps {
  isOpen: boolean;
  onClose: () => void;
  audioBuffer: AudioBuffer | null;
  instrument: InstrumentConfig;
}

interface ConversionSettings {
  onsetThreshold: number;
  frameThreshold: number;
  minNoteLengthMs: number;
  minMidiNote: number;
  maxMidiNote: number;
  rowsPerBeat: number; // 4 = 1/4 note, 8 = 1/8 note, 16 = 1/16 note
}

const DEFAULT_SETTINGS: ConversionSettings = {
  onsetThreshold: 0.55,
  frameThreshold: 0.45,
  minNoteLengthMs: 90,
  minMidiNote: 21, // A0
  maxMidiNote: 108, // C8
  rowsPerBeat: 4,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function generateId(prefix = 'id'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/** Resample an AudioBuffer to 22050 Hz mono using OfflineAudioContext */
async function resampleToMono22050(buffer: AudioBuffer): Promise<AudioBuffer> {
  const targetRate = AUDIO_SAMPLE_RATE;
  const targetLength = Math.ceil((buffer.length / buffer.sampleRate) * targetRate);
  const offlineCtx = new OfflineAudioContext(1, targetLength, targetRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(offlineCtx.destination);
  source.start(0);
  return await offlineCtx.startRendering();
}

/** Convert detected notes to tracker Pattern */
function notesToPattern(
  notes: NoteEventTime[],
  bpm: number,
  settings: ConversionSettings,
  instrumentId: number,
): Pattern {
  const rowsPerSecond = (bpm / 60) * settings.rowsPerBeat;

  // Find pattern length needed
  let maxRow = 0;
  for (const note of notes) {
    const endRow = Math.round((note.startTimeSeconds + note.durationSeconds) * rowsPerSecond);
    if (endRow > maxRow) maxRow = endRow;
  }

  // Round up to nearest 64 rows, minimum 64
  const patternLength = Math.min(256, Math.max(64, Math.ceil(maxRow / 64) * 64));

  // Build rows
  const rows: TrackerCell[] = Array.from({ length: patternLength }, () => ({
    note: 0,
    instrument: 0,
    volume: 0,
    effTyp: 0,
    eff: 0,
    effTyp2: 0,
    eff2: 0,
  }));

  for (const note of notes) {
    const startRow = Math.round(note.startTimeSeconds * rowsPerSecond);
    if (startRow < 0 || startRow >= patternLength) continue;

    const xmNote = midiToXMNote(note.pitchMidi);
    if (!xmNote) continue;

    // Only set if not already occupied (earlier note takes priority on same row)
    if (rows[startRow].note === 0) {
      rows[startRow].note = xmNote;
      rows[startRow].instrument = instrumentId;
      // Convert amplitude (0-1) to XM volume column (0x10–0x50)
      rows[startRow].volume = 0x10 + Math.round(note.amplitude * 64);
    }

    // Note-off at end
    const endRow = Math.round((note.startTimeSeconds + note.durationSeconds) * rowsPerSecond);
    if (endRow < patternLength && endRow > startRow && rows[endRow].note === 0) {
      rows[endRow].note = 97; // XM note-off
    }
  }

  const channel: ChannelData = {
    id: generateId('channel'),
    name: 'MIDI Ch 1',
    rows,
    muted: false,
    solo: false,
    collapsed: false,
    volume: 80,
    pan: 0,
    instrumentId,
    color: '#22c55e',
  };

  return {
    id: generateId('pattern'),
    name: 'Audio→MIDI',
    length: patternLength,
    channels: [channel],
  };
}

/** Convert detected notes to ClipboardData (single channel, exact row count) */
function notesToClipboard(
  notes: NoteEventTime[],
  bpm: number,
  settings: ConversionSettings,
  instrumentId: number,
): ClipboardData {
  const rowsPerSecond = (bpm / 60) * settings.rowsPerBeat;

  // Find exact row count needed
  let maxRow = 0;
  for (const note of notes) {
    const endRow = Math.round((note.startTimeSeconds + note.durationSeconds) * rowsPerSecond);
    if (endRow > maxRow) maxRow = endRow;
  }
  const rowCount = maxRow + 1;

  const cells: TrackerCell[] = Array.from({ length: rowCount }, () => ({
    note: 0,
    instrument: 0,
    volume: 0,
    effTyp: 0,
    eff: 0,
    effTyp2: 0,
    eff2: 0,
  }));

  for (const note of notes) {
    const startRow = Math.round(note.startTimeSeconds * rowsPerSecond);
    if (startRow < 0 || startRow >= rowCount) continue;

    const xmNote = midiToXMNote(note.pitchMidi);
    if (!xmNote) continue;

    if (cells[startRow].note === 0) {
      cells[startRow].note = xmNote;
      cells[startRow].instrument = instrumentId;
      cells[startRow].volume = 0x10 + Math.round(note.amplitude * 64);
    }

    const endRow = Math.round((note.startTimeSeconds + note.durationSeconds) * rowsPerSecond);
    if (endRow < rowCount && endRow > startRow && cells[endRow].note === 0) {
      cells[endRow].note = 97; // XM note-off
    }
  }

  return {
    channels: 1,
    rows: rowCount,
    data: [cells],
  };
}

// ─── Slider sub-component ──────────────────────────────────────────────────

const SettingSlider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}> = ({ label, value, min, max, step, format, onChange }) => (
  <div className="flex items-center gap-3">
    <span className="text-text-muted text-[10px] font-mono w-28 shrink-0">{label}</span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="flex-1 h-1 accent-emerald-400"
    />
    <span className="text-emerald-400 text-[10px] font-mono w-12 text-right">
      {format ? format(value) : value}
    </span>
  </div>
);

// ─── Main Component ──────────────────────────────────────────────────────────

export const AudioToMidiModal: React.FC<AudioToMidiModalProps> = ({
  isOpen,
  onClose,
  audioBuffer,
  instrument,
}) => {
  const [settings, setSettings] = useState<ConversionSettings>(DEFAULT_SETTINGS);
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [detectedNotes, setDetectedNotes] = useState<NoteEventTime[] | null>(null);
  const [showSettings, setShowSettings] = useState(true);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isPlayingSample, setIsPlayingSample] = useState(false);
  const basicPitchRef = useRef<BasicPitch | null>(null);
  const cancelRef = useRef(false);
  const previewStopRef = useRef<(() => void) | null>(null);
  const sampleStopRef = useRef<(() => void) | null>(null);

  const bpm = useTransportStore((s) => s.bpm);

  // Lazy-initialize BasicPitch (loads the TF.js model once)
  const getBasicPitch = useCallback(() => {
    if (!basicPitchRef.current) {
      basicPitchRef.current = new BasicPitch(MODEL_URL);
    }
    return basicPitchRef.current;
  }, []);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      cancelRef.current = true;
      previewStopRef.current?.();
      sampleStopRef.current?.();
      setIsConverting(false);
      setIsPreviewing(false);
      setIsPlayingSample(false);
      setProgress(0);
      setProgressLabel('');
      setDetectedNotes(null);
    } else {
      cancelRef.current = false;
    }
  }, [isOpen]);

  const updateSetting = useCallback(<K extends keyof ConversionSettings>(
    key: K,
    value: ConversionSettings[K],
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleConvert = useCallback(async () => {
    if (!audioBuffer) return;

    setIsConverting(true);
    setDetectedNotes(null);
    setProgress(0);
    cancelRef.current = false;

    try {
      // Step 1: Resample to 22050 Hz mono
      setProgressLabel('Resampling audio…');
      const monoBuffer = await resampleToMono22050(audioBuffer);

      if (cancelRef.current) return;

      // Step 2: Run inference
      setProgressLabel('Running neural pitch detection…');
      const bp = getBasicPitch();

      const allFrames: number[][] = [];
      const allOnsets: number[][] = [];
      const allContours: number[][] = [];

      await bp.evaluateModel(
        monoBuffer,
        (frames, onsets, contours) => {
          allFrames.push(...frames);
          allOnsets.push(...onsets);
          allContours.push(...contours);
        },
        (pct) => {
          if (!cancelRef.current) flushSync(() => setProgress(Math.round(pct * 100)));
        },
      );

      if (cancelRef.current) return;

      // Step 3: Convert frames to notes
      setProgressLabel('Extracting notes…');
      const minNoteFrames = Math.max(
        1,
        Math.round((settings.minNoteLengthMs / 1000) * ANNOTATIONS_FPS),
      );
      const minHz = midiToHz(settings.minMidiNote);
      const maxHz = midiToHz(settings.maxMidiNote);

      const noteEvents = outputToNotesPoly(
        allFrames,
        allOnsets,
        settings.onsetThreshold,
        settings.frameThreshold,
        minNoteFrames,
        true,
        maxHz,
        minHz,
      );
      const withBends = addPitchBendsToNoteEvents(allContours, noteEvents);
      const notes = noteFramesToTime(withBends);

      setDetectedNotes(notes);
      setProgress(100);
      setProgressLabel(`Found ${notes.length} note${notes.length !== 1 ? 's' : ''}`);
    } catch (err) {
      console.error('Audio-to-MIDI error:', err);
      notify.error(`Conversion failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setProgressLabel('Error during conversion');
    } finally {
      if (!cancelRef.current) setIsConverting(false);
    }
  }, [audioBuffer, settings, getBasicPitch]);

  const handleInsert = useCallback(() => {
    if (!detectedNotes || detectedNotes.length === 0) return;

    const pattern = notesToPattern(detectedNotes, bpm, settings, instrument.id);
    const newIndex = useTrackerStore.getState().importPattern(pattern);

    notify.success(`Pattern "${pattern.name}" added at position ${newIndex + 1}`);
    onClose();
  }, [detectedNotes, bpm, settings, instrument.id, onClose]);

  const handlePlaySample = useCallback(() => {
    if (sampleStopRef.current) {
      sampleStopRef.current();
      return;
    }
    if (!audioBuffer) return;

    const audioCtx = new AudioContext();
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);
    source.start();
    setIsPlayingSample(true);

    const stop = () => {
      try { source.stop(); } catch {}
      audioCtx.close();
      setIsPlayingSample(false);
      sampleStopRef.current = null;
    };
    sampleStopRef.current = stop;
    source.onended = stop;
  }, [audioBuffer]);

  const handlePreview = useCallback(() => {
    // Stop existing preview
    if (previewStopRef.current) {
      previewStopRef.current();
      return;
    }
    if (!detectedNotes || detectedNotes.length === 0) return;

    const audioCtx = new AudioContext();
    const oscs: OscillatorNode[] = [];

    detectedNotes.forEach((note) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.value = 440 * Math.pow(2, (note.pitchMidi - 69) / 12);
      filter.type = 'lowpass';
      filter.frequency.value = 2400;
      filter.Q.value = 1;

      const t0 = audioCtx.currentTime + note.startTimeSeconds;
      const t1 = t0 + Math.max(note.durationSeconds, 0.05);
      const vol = note.amplitude * 0.35;

      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(vol, t0 + 0.008);
      gain.gain.setValueAtTime(vol, t1 - 0.02);
      gain.gain.linearRampToValueAtTime(0, t1);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t1);
      oscs.push(osc);
    });

    setIsPreviewing(true);

    const stop = () => {
      oscs.forEach((o) => { try { o.stop(); } catch {} });
      audioCtx.close();
      setIsPreviewing(false);
      previewStopRef.current = null;
    };
    previewStopRef.current = stop;

    // Auto-stop after last note ends
    const endTime = detectedNotes.reduce(
      (max, n) => Math.max(max, n.startTimeSeconds + n.durationSeconds),
      0,
    );
    setTimeout(stop, (endTime + 0.15) * 1000);
  }, [detectedNotes]);

  const handleCopyNotes = useCallback(() => {
    if (!detectedNotes || detectedNotes.length === 0) return;

    const clipboardData = notesToClipboard(detectedNotes, bpm, settings, instrument.id);
    useTrackerStore.getState().setClipboard(clipboardData);

    notify.success(`${detectedNotes.length} note${detectedNotes.length !== 1 ? 's' : ''} copied — paste in the tracker with Ctrl+V`);
  }, [detectedNotes, bpm, settings, instrument.id]);

  if (!isOpen) return null;

  const durationSec = audioBuffer ? audioBuffer.duration : 0;
  const durationStr = durationSec < 60
    ? `${durationSec.toFixed(2)}s`
    : `${Math.floor(durationSec / 60)}:${(durationSec % 60).toFixed(0).padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-dark-bg border border-ft2-border rounded-lg shadow-2xl w-[520px] max-h-[90vh] overflow-y-auto">
        {/* ─── Header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-ft2-border bg-ft2-header">
          <div className="flex items-center gap-2">
            <Music size={14} className="text-emerald-400" />
            <span className="text-sm font-bold font-mono text-text-primary uppercase">
              Audio → MIDI
            </span>
            <span className="text-[10px] text-text-muted font-mono">basic-pitch</span>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* ─── Audio Info ───────────────────────────────────────── */}
          {audioBuffer ? (
            <div className="flex items-center gap-3 px-3 py-2 bg-dark-bgSecondary rounded border border-ft2-border/50">
              <button
                onClick={handlePlaySample}
                title={isPlayingSample ? 'Stop' : 'Play sample'}
                className={
                  'flex items-center justify-center w-5 h-5 rounded transition-colors shrink-0 ' +
                  (isPlayingSample
                    ? 'text-emerald-300 hover:text-red-400'
                    : 'text-text-muted hover:text-text-primary')
                }
              >
                {isPlayingSample ? <Square size={10} /> : <Play size={10} />}
              </button>
              <span className="text-[10px] font-mono text-text-secondary">
                {audioBuffer.sampleRate} Hz · {audioBuffer.numberOfChannels}ch ·{' '}
                {durationStr}
              </span>
              <span className="ml-auto text-[10px] font-mono text-text-muted">
                → resample to 22050 Hz mono
              </span>
            </div>
          ) : (
            <div className="text-text-muted text-xs font-mono text-center py-4">
              No audio loaded
            </div>
          )}

          {/* ─── Settings ─────────────────────────────────────────── */}
          <div className="border border-ft2-border/50 rounded">
            <button
              className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-mono text-text-secondary hover:text-text-primary transition-colors"
              onClick={() => setShowSettings((v) => !v)}
            >
              <span className="uppercase font-bold">Detection Settings</span>
              {showSettings ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>

            {showSettings && (
              <div className="px-3 pb-3 space-y-2.5 border-t border-ft2-border/50">
                <div className="pt-2 space-y-2.5">
                  <SettingSlider
                    label="Onset threshold"
                    value={settings.onsetThreshold}
                    min={0.1}
                    max={0.9}
                    step={0.05}
                    format={(v) => v.toFixed(2)}
                    onChange={(v) => updateSetting('onsetThreshold', v)}
                  />
                  <SettingSlider
                    label="Frame threshold"
                    value={settings.frameThreshold}
                    min={0.1}
                    max={0.9}
                    step={0.05}
                    format={(v) => v.toFixed(2)}
                    onChange={(v) => updateSetting('frameThreshold', v)}
                  />
                  <SettingSlider
                    label="Min note length"
                    value={settings.minNoteLengthMs}
                    min={10}
                    max={500}
                    step={5}
                    format={(v) => `${v}ms`}
                    onChange={(v) => updateSetting('minNoteLengthMs', v)}
                  />
                  <SettingSlider
                    label="Min MIDI note"
                    value={settings.minMidiNote}
                    min={21}
                    max={settings.maxMidiNote - 1}
                    step={1}
                    format={(v) => `${v}`}
                    onChange={(v) => updateSetting('minMidiNote', v)}
                  />
                  <SettingSlider
                    label="Max MIDI note"
                    value={settings.maxMidiNote}
                    min={settings.minMidiNote + 1}
                    max={108}
                    step={1}
                    format={(v) => `${v}`}
                    onChange={(v) => updateSetting('maxMidiNote', v)}
                  />
                </div>

                {/* Grid quantization */}
                <div className="flex items-center gap-3 pt-1">
                  <span className="text-text-muted text-[10px] font-mono w-28 shrink-0">
                    Grid (rows/beat)
                  </span>
                  <div className="flex gap-1">
                    {[4, 8, 16].map((rpb) => (
                      <button
                        key={rpb}
                        onClick={() => updateSetting('rowsPerBeat', rpb)}
                        className={
                          'px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ' +
                          (settings.rowsPerBeat === rpb
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                            : 'text-text-muted border-ft2-border hover:text-text-primary hover:border-ft2-border/80')
                        }
                      >
                        {rpb === 4 ? '1/4' : rpb === 8 ? '1/8' : '1/16'}
                      </button>
                    ))}
                  </div>
                  <span className="ml-auto text-[10px] font-mono text-text-muted">
                    BPM: {bpm}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* ─── iOS Warning ─────────────────────────────────────── */}
          {typeof navigator !== 'undefined' &&
            /iPhone|iPad|iPod/i.test(navigator.userAgent) &&
            /Safari/i.test(navigator.userAgent) && (
              <div className="px-3 py-2 rounded border border-amber-500/30 bg-amber-500/10 text-[10px] font-mono text-amber-400">
                ⚠ iOS Safari has known issues with this feature. Results may vary.
              </div>
            )}

          {/* ─── Accuracy Note ───────────────────────────────────── */}
          <div className="text-[10px] font-mono text-text-muted px-1">
            Works best on single-instrument monophonic audio (synth leads, bass, vocals).
            Polyphonic and percussive audio will produce fewer accurate results.
          </div>

          {/* ─── Progress ────────────────────────────────────────── */}
          {(isConverting || progress > 0) && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-mono text-text-muted">
                <span className="flex items-center gap-1.5">
                  {isConverting && <Loader2 size={10} className="animate-spin text-emerald-400" />}
                  {progressLabel}
                </span>
                <span className="text-emerald-400">{progress}%</span>
              </div>
              <div className="h-1 bg-dark-bgSecondary rounded overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* ─── Note Preview ────────────────────────────────────── */}
          {detectedNotes !== null && (
            <div className="border border-ft2-border/50 rounded">
              <div className="px-3 py-2 border-b border-ft2-border/50 flex items-center justify-between">
                <span className="text-[10px] font-mono text-text-secondary uppercase font-bold">
                  Detected Notes
                </span>
                <span className="text-[10px] font-mono text-emerald-400">
                  {detectedNotes.length} note{detectedNotes.length !== 1 ? 's' : ''}
                </span>
              </div>

              {detectedNotes.length === 0 ? (
                <div className="px-3 py-4 text-center text-[10px] font-mono text-text-muted">
                  No notes detected. Try lowering the thresholds.
                </div>
              ) : (
                <div className="max-h-36 overflow-y-auto px-3 py-2 space-y-0.5">
                  {detectedNotes.slice(0, 50).map((note, i) => {
                    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
                    const octave = Math.floor(note.pitchMidi / 12) - 1;
                    const noteName = noteNames[note.pitchMidi % 12];
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-3 text-[10px] font-mono text-text-secondary"
                      >
                        <span className="text-emerald-400 w-8">
                          {noteName}{octave}
                        </span>
                        <span className="text-text-muted">
                          {note.startTimeSeconds.toFixed(2)}s
                        </span>
                        <span className="text-text-muted">
                          {(note.durationSeconds * 1000).toFixed(0)}ms
                        </span>
                        <div
                          className="h-1 bg-emerald-500/60 rounded ml-auto"
                          style={{ width: `${Math.round(note.amplitude * 60)}px`, minWidth: '2px' }}
                        />
                      </div>
                    );
                  })}
                  {detectedNotes.length > 50 && (
                    <div className="text-[10px] font-mono text-text-muted text-center pt-1">
                      … and {detectedNotes.length - 50} more
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ─── Action Buttons ───────────────────────────────────── */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleConvert}
              disabled={!audioBuffer || isConverting}
              className={
                'flex-1 flex items-center justify-center gap-2 py-2 rounded text-[11px] font-mono font-bold uppercase transition-colors ' +
                (!audioBuffer || isConverting
                  ? 'opacity-40 cursor-not-allowed bg-dark-bgSecondary text-text-muted border border-ft2-border'
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30')
              }
            >
              {isConverting ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  Converting…
                </>
              ) : (
                <>
                  <Play size={12} />
                  Convert
                </>
              )}
            </button>

            <button
              onClick={handlePreview}
              disabled={!detectedNotes || detectedNotes.length === 0}
              title={isPreviewing ? 'Stop preview' : 'Preview detected notes with a synth'}
              className={
                'flex items-center justify-center gap-1.5 px-3 py-2 rounded text-[11px] font-mono font-bold uppercase transition-colors ' +
                (!detectedNotes || detectedNotes.length === 0
                  ? 'opacity-40 cursor-not-allowed bg-dark-bgSecondary text-text-muted border border-ft2-border'
                  : isPreviewing
                    ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/60'
                    : 'bg-dark-bgSecondary text-text-secondary border border-ft2-border hover:text-text-primary hover:border-ft2-border/80')
              }
            >
              {isPreviewing ? <Square size={12} /> : <Play size={12} />}
              {isPreviewing ? 'Stop' : 'Preview'}
            </button>

            <button
              onClick={handleInsert}
              disabled={!detectedNotes || detectedNotes.length === 0}
              className={
                'flex-1 flex items-center justify-center gap-2 py-2 rounded text-[11px] font-mono font-bold uppercase transition-colors ' +
                (!detectedNotes || detectedNotes.length === 0
                  ? 'opacity-40 cursor-not-allowed bg-dark-bgSecondary text-text-muted border border-ft2-border'
                  : 'bg-emerald-600 text-white border border-emerald-500 hover:bg-emerald-500')
              }
            >
              <Music size={12} />
              Insert into Tracker
            </button>

            <button
              onClick={handleCopyNotes}
              disabled={!detectedNotes || detectedNotes.length === 0}
              title="Copy notes to clipboard — paste anywhere in the tracker with Ctrl+V"
              className={
                'flex items-center justify-center gap-1.5 px-3 py-2 rounded text-[11px] font-mono font-bold uppercase transition-colors ' +
                (!detectedNotes || detectedNotes.length === 0
                  ? 'opacity-40 cursor-not-allowed bg-dark-bgSecondary text-text-muted border border-ft2-border'
                  : 'bg-dark-bgSecondary text-text-secondary border border-ft2-border hover:text-text-primary hover:border-ft2-border/80')
              }
            >
              <Copy size={12} />
              Copy
            </button>

            <button
              onClick={onClose}
              className="px-3 py-2 rounded text-[11px] font-mono text-text-muted border border-ft2-border hover:text-text-primary hover:border-ft2-border/80 transition-colors"
            >
              <Square size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
