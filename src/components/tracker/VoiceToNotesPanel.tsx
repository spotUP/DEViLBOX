/**
 * VoiceToNotesPanel - record a hummed or sung melody, preview it live, fine-tune
 * it, and write it into the pattern as one undo step.
 *
 * Glue only: capture lives in lib/voice/voiceRecorder + hooks/audio/useVoiceRecorder,
 * note extraction in lib/voice/pitchNotes, row snapping in lib/voice/quantise,
 * pattern writing in lib/voice/writeToPattern.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Mic, Square, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { Knob } from '@components/controls/Knob';
import { CustomSelect } from '@components/common/CustomSelect';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useCursorStore } from '@/stores/useCursorStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { notify } from '@/stores/useNotificationStore';
import { useVoiceRecorder, type VoiceRecorderDeps } from '@/hooks/audio/useVoiceRecorder';
import { basicPitchModel, type PitchModel } from '@/lib/voice/basicPitchModel';
import {
  DEFAULT_PITCH_SETTINGS,
  modelOutputToNotes,
  transposeNotes,
  type PitchModelOutput,
  type PitchSettings,
  type VoiceNote,
} from '@/lib/voice/pitchNotes';
import { quantiseNotes, rowSeconds } from '@/lib/voice/quantise';
import { writeNotesToPattern } from '@/lib/voice/writeToPattern';

export interface VoiceToNotesPanelProps {
  onClose: () => void;
  /** Test seam: the pitch model. Defaults to Basic Pitch. */
  model?: PitchModel;
  /** Test seam: microphone and capture backend. */
  deps?: VoiceRecorderDeps;
}

interface Finetune extends PitchSettings {
  transpose: number;
  swing: number;
  minLengthRows: number;
  latencyNudgeMs: number;
}

const DEFAULT_FINETUNE: Finetune = {
  ...DEFAULT_PITCH_SETTINGS,
  transpose: 0,
  swing: 0,
  minLengthRows: 1,
  latencyNudgeMs: 0,
};

const COUNT_IN_BEATS = 4;

const NoteRoll: React.FC<{ notes: readonly VoiceNote[]; seconds: number }> = ({ notes, seconds }) => {
  const span = Math.max(2, seconds);
  const lo = notes.length ? Math.min(...notes.map((n) => n.pitchMidi)) - 2 : 48;
  const hi = notes.length ? Math.max(...notes.map((n) => n.pitchMidi)) + 2 : 72;
  const rangeSize = Math.max(12, hi - lo);
  return (
    <svg
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      className="w-full h-20 bg-dark-bgTertiary border border-dark-borderLight rounded"
      role="img"
      aria-label="Detected notes"
    >
      {notes.map((n, i) => (
        <rect
          key={`${n.startTimeSeconds}-${i}`}
          data-testid="voice-ghost-note"
          x={(n.startTimeSeconds / span) * 100}
          y={40 - ((n.pitchMidi - lo + 1) / rangeSize) * 40}
          width={Math.max(0.5, (n.durationSeconds / span) * 100)}
          height={40 / rangeSize}
          className="fill-accent-primary"
        />
      ))}
    </svg>
  );
};

export const VoiceToNotesPanel: React.FC<VoiceToNotesPanelProps> = ({
  onClose,
  model = basicPitchModel,
  deps,
}) => {
  const [fine, setFine] = useState<Finetune>(DEFAULT_FINETUNE);
  const [deviceId, setDeviceId] = useState('');
  const [channelIndex, setChannelIndex] = useState(() => useCursorStore.getState().cursor.channelIndex);
  const [instrumentId, setInstrumentId] = useState<number>(() => useInstrumentStore.getState().currentInstrumentId ?? 1);
  const [startRow, setStartRow] = useState(0);
  const [output, setOutput] = useState<PitchModelOutput | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [takeSeconds, setTakeSeconds] = useState(0);

  const bpm = useTransportStore((s) => s.bpm);
  const speed = useTransportStore((s) => s.speed);
  const channelCount = useTrackerStore((s) => s.patterns[s.currentPatternIndex]?.channels.length ?? 0);
  const instruments = useInstrumentStore((s) => s.instruments);

  const recorder = useVoiceRecorder(model, fine, deps);

  const patch = useCallback(<K extends keyof Finetune>(key: K, value: Finetune[K]) => {
    setFine((prev) => ({ ...prev, [key]: value }));
  }, []);

  const finalNotes = useMemo(
    () => (output ? transposeNotes(modelOutputToNotes(output, fine, true), fine.transpose) : []),
    [output, fine],
  );

  const handleRecord = useCallback(async () => {
    setOutput(null);
    setStartRow(useCursorStore.getState().cursor.rowIndex);
    await recorder.start({
      deviceId: deviceId || undefined,
      countInBeats: COUNT_IN_BEATS,
      beatSeconds: 60 / useTransportStore.getState().bpm,
    });
  }, [recorder, deviceId]);

  const handleStop = useCallback(async () => {
    const take = recorder.stop();
    if (!take || take.length === 0) return;
    setTakeSeconds(take.length / 22050);
    setAnalysing(true);
    try {
      // Full-take pass: replaces the live preview
      setOutput(await model.evaluate(take));
    } catch (err) {
      notify.error(`Pitch detection failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setAnalysing(false);
    }
  }, [recorder, model]);

  const handleCommit = useCallback(() => {
    const rows = quantiseNotes(finalNotes, {
      bpm,
      speed,
      swing: fine.swing,
      minLengthRows: fine.minLengthRows,
      latencyNudgeMs: fine.latencyNudgeMs,
    });
    if (rows.length === 0) {
      notify.warning('No notes to write');
      return;
    }
    const result = writeNotesToPattern(rows, { channelIndex, startRow, instrumentId });
    // Notes only: the take is discarded after Commit
    setOutput(null);
    notify.success(
      `Wrote ${result.written} note${result.written === 1 ? '' : 's'}` +
        (result.dropped ? `, ${result.dropped} past the end of the pattern` : ''),
    );
  }, [finalNotes, bpm, speed, fine, channelIndex, startRow, instrumentId]);

  const recording = recorder.phase !== 'idle';
  const shownNotes = recording ? recorder.liveNotes : finalNotes;
  const rowLength = rowSeconds(bpm, speed);

  const deviceOptions = [
    { value: '', label: 'Default microphone' },
    ...recorder.devices.map((d) => ({ value: d.deviceId, label: d.label || 'Microphone' })),
  ];
  const channelOptions = Array.from({ length: channelCount }, (_, i) => ({
    value: String(i),
    label: `Channel ${i + 1}`,
  }));
  const instrumentOptions = instruments.map((i) => ({ value: String(i.id), label: `${i.id}. ${i.name}` }));

  return (
    <aside
      data-testid="voice-to-notes-panel"
      className="flex flex-col gap-2 w-72 shrink-0 p-2 overflow-y-auto bg-dark-bgSecondary border-l border-dark-border text-text-primary"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-text-secondary">Voice to Notes</span>
        <Button variant="ghost" size="icon" onClick={onClose} title="Close panel" aria-label="Close panel">
          <X size={12} />
        </Button>
      </div>

      <CustomSelect value={deviceId} onChange={setDeviceId} options={deviceOptions} title="Microphone" disabled={recording} />
      <CustomSelect
        value={String(channelIndex)}
        onChange={(v) => setChannelIndex(Number(v))}
        options={channelOptions}
        title="Target channel"
      />
      <CustomSelect
        value={String(instrumentId)}
        onChange={(v) => setInstrumentId(Number(v))}
        options={instrumentOptions}
        title="Instrument"
      />

      <div className="flex items-center gap-2">
        {!recording ? (
          <Button variant="primary" size="sm" icon={<Mic size={12} />} onClick={() => void handleRecord()} disabled={analysing}>
            Record
          </Button>
        ) : (
          <Button variant="danger" size="sm" icon={<Square size={12} />} onClick={() => void handleStop()}>
            Stop
          </Button>
        )}
        <span className="text-[10px] font-mono text-text-muted">
          {recorder.phase === 'countIn' ? 'Count-in' : recorder.phase === 'recording' ? 'Recording' : analysing ? 'Analysing' : 'Ready'}
        </span>
        {analysing && <Loader2 size={12} className="animate-spin text-accent-primary" />}
      </div>

      <div className="h-1 bg-dark-bgTertiary rounded overflow-hidden" aria-label="Input level">
        <div className="h-full bg-accent-success" style={{ width: `${Math.min(100, recorder.level * 300)}%` }} />
      </div>
      {recorder.error && <div className="text-[10px] font-mono text-accent-error">{recorder.error}</div>}

      <NoteRoll notes={shownNotes} seconds={takeSeconds || 4} />
      <div className="text-[9px] font-mono text-text-muted">
        {shownNotes.length} note{shownNotes.length === 1 ? '' : 's'} - row length {(rowLength * 1000).toFixed(0)} ms
      </div>

      <div className="text-[10px] font-mono text-text-secondary">Finetune</div>
      <div className="grid grid-cols-3 gap-2">
        <Knob label="Onset" value={fine.onsetThreshold} min={0.1} max={0.9} step={0.01} onChange={(v) => patch('onsetThreshold', v)} size="sm" />
        <Knob label="Sustain" value={fine.frameThreshold} min={0.1} max={0.9} step={0.01} onChange={(v) => patch('frameThreshold', v)} size="sm" />
        <Knob label="Min Length" unit="ms" value={fine.minNoteLengthMs} min={30} max={400} step={5} onChange={(v) => patch('minNoteLengthMs', v)} size="sm" />
        <Knob label="Lowest" value={fine.minMidiNote} min={21} max={108} step={1} onChange={(v) => patch('minMidiNote', v)} size="sm" />
        <Knob label="Highest" value={fine.maxMidiNote} min={21} max={108} step={1} onChange={(v) => patch('maxMidiNote', v)} size="sm" />
        <Knob label="Transpose" value={fine.transpose} min={-24} max={24} step={1} bipolar onChange={(v) => patch('transpose', Math.round(v))} size="sm" />
        <Knob label="Swing" value={fine.swing} min={0} max={1} step={0.01} onChange={(v) => patch('swing', v)} size="sm" />
        <Knob label="Min Rows" value={fine.minLengthRows} min={1} max={8} step={1} onChange={(v) => patch('minLengthRows', Math.round(v))} size="sm" />
        <Knob label="Latency" unit="ms" value={fine.latencyNudgeMs} min={-300} max={300} step={1} bipolar onChange={(v) => patch('latencyNudgeMs', Math.round(v))} size="sm" title="Move the notes earlier (positive) or later (negative) to match your microphone and output latency" />
      </div>

      <Button
        variant="primary"
        size="sm"
        icon={<Check size={12} />}
        onClick={handleCommit}
        disabled={recording || analysing || finalNotes.length === 0}
      >
        Commit
      </Button>
    </aside>
  );
};
