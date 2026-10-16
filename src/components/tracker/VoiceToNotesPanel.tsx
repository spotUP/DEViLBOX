/**
 * VoiceToNotesPanel - record a hummed or sung melody, preview it live, fine-tune
 * it, and write it into the pattern as one undo step.
 *
 * Glue only: capture lives in lib/voice/voiceRecorder + hooks/audio/useVoiceRecorder,
 * note extraction in lib/voice/pitchNotes, row snapping in lib/voice/quantise,
 * pattern writing in lib/voice/writeToPattern.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Mic, Square, Check, X, Loader2, Timer } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { Knob } from '@components/controls/Knob';
import { Toggle } from '@components/controls/Toggle';
import { CustomSelect } from '@components/common/CustomSelect';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useCursorStore } from '@/stores/useCursorStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { notify } from '@/stores/useNotificationStore';
import { useVoiceRecorder, defaultVoiceRecorderDeps, type VoiceRecorderDeps } from '@/hooks/audio/useVoiceRecorder';
import { basicPitchModel, type PitchModel } from '@/lib/voice/basicPitchModel';
import {
  DEFAULT_PITCH_SETTINGS,
  type PitchModelOutput,
  type PitchSettings,
  type VoiceNote,
} from '@/lib/voice/pitchNotes';
import { rowSeconds } from '@/lib/voice/quantise';
import { commitVoiceNotes, shapeNotes } from '@/lib/voice/voiceToNotes';
import { SCALES, SCALE_LABELS, TONIC_NAMES, type ScaleName } from '@/lib/voice/scaleSnap';
import { getStoredLatencyMs, measureLoopbackLatencyMs, storeLatencyMs } from '@/lib/voice/latencyCalibration';
import { addTake, listTakes, type Take } from '@/lib/voice/takeHistory';
import { DRUM_CLASSES, DRUM_CLASS_LABELS, classifyByRules, detectHits, type DrumClass, type DrumHit } from '@/lib/voice/drumHits';
import {
  MIN_SAMPLES_PER_CLASS,
  clearTraining,
  countsByClass,
  loadSamples,
  loadTrainingResult,
  modelClassifier,
  samplesFromTake,
  saveSamples,
  saveTrainingResult,
  trainAndEvaluate,
  type TrainingResult,
  type TrainingSample,
} from '@/lib/voice/drumModel';
import { commitDrumHits, defaultDrumMap, type DrumMap } from '@/lib/voice/drumToNotes';

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
  keySnapOn: boolean;
  /** Pitch class 0..11, 0 = C */
  keyTonic: number;
  keyScale: ScaleName;
}

const DEFAULT_FINETUNE: Finetune = {
  ...DEFAULT_PITCH_SETTINGS,
  transpose: 0,
  swing: 0,
  minLengthRows: 1,
  latencyNudgeMs: 0,
  keySnapOn: false,
  keyTonic: 0,
  keyScale: 'major',
};

const COUNT_IN_BEATS = 4;

type VoiceMode = 'melody' | 'drums';
const MODE_OPTIONS = [
  { value: 'melody', label: 'Melody' },
  { value: 'drums', label: 'Drums' },
];

/** Drum mode never needs the pitch model; the live preview runs against this empty one. */
const NO_PITCH_MODEL: PitchModel = {
  evaluate: async () => ({ frames: [], onsets: [], contours: [] }),
};

const DRUM_NOTE_OPTIONS = Array.from({ length: 61 }, (_, i) => {
  const midi = 24 + i;
  return { value: String(midi), label: `${TONIC_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}` };
});

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
  const [mode, setMode] = useState<VoiceMode>('melody');
  const [hits, setHits] = useState<readonly DrumHit[]>([]);
  const [trainClass, setTrainClass] = useState<DrumClass>('kick');
  const [trainingTake, setTrainingTake] = useState<DrumClass | null>(null);
  const [samples, setSamples] = useState<TrainingSample[]>(() => loadSamples());
  const [training, setTraining] = useState<TrainingResult | null>(() => loadTrainingResult());
  const [drumMap, setDrumMap] = useState<DrumMap>(() =>
    defaultDrumMap(useInstrumentStore.getState().instruments, useInstrumentStore.getState().currentInstrumentId ?? 1),
  );
  const [deviceId, setDeviceId] = useState('');
  const [channelIndex, setChannelIndex] = useState(() => useCursorStore.getState().cursor.channelIndex);
  const [instrumentId, setInstrumentId] = useState<number>(() => useInstrumentStore.getState().currentInstrumentId ?? 1);
  const [startRow, setStartRow] = useState(0);
  const [output, setOutput] = useState<PitchModelOutput | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [takeSeconds, setTakeSeconds] = useState(0);
  const [calibratedMs, setCalibratedMs] = useState(() => getStoredLatencyMs(''));
  const [calibrating, setCalibrating] = useState(false);
  const [takes, setTakes] = useState<readonly Take[]>(() => listTakes());
  const [activeTakeId, setActiveTakeId] = useState<number | null>(null);
  const backend = deps ?? defaultVoiceRecorderDeps;

  useEffect(() => {
    setCalibratedMs(getStoredLatencyMs(deviceId));
  }, [deviceId]);

  const bpm = useTransportStore((s) => s.bpm);
  const speed = useTransportStore((s) => s.speed);
  const channelCount = useTrackerStore((s) => s.patterns[s.currentPatternIndex]?.channels.length ?? 0);
  const instruments = useInstrumentStore((s) => s.instruments);

  const drums = mode === 'drums';
  const recorder = useVoiceRecorder(drums ? NO_PITCH_MODEL : model, fine, deps);

  const patch = useCallback(<K extends keyof Finetune>(key: K, value: Finetune[K]) => {
    setFine((prev) => ({ ...prev, [key]: value }));
  }, []);

  const finalNotes = useMemo(
    () =>
      output
        ? shapeNotes(output, {
            ...fine,
            keySnap: fine.keySnapOn ? { tonic: fine.keyTonic, scale: fine.keyScale } : null,
          })
        : [],
    [output, fine],
  );

  const handleRecord = useCallback(async () => {
    setOutput(null);
    setHits([]);
    setStartRow(useCursorStore.getState().cursor.rowIndex);
    await recorder.start({
      deviceId: deviceId || undefined,
      countInBeats: COUNT_IN_BEATS,
      beatSeconds: 60 / useTransportStore.getState().bpm,
    });
  }, [recorder, deviceId]);

  const handleRecordTraining = useCallback(async () => {
    setTrainingTake(trainClass);
    await recorder.start({ deviceId: deviceId || undefined, countInBeats: 0, beatSeconds: 60 / useTransportStore.getState().bpm });
  }, [recorder, deviceId, trainClass]);

  const handleTrain = useCallback((all: TrainingSample[]) => {
    const result = trainAndEvaluate(all);
    setTraining(result);
    saveTrainingResult(result);
  }, []);

  const handleClearTraining = useCallback(() => {
    clearTraining();
    setSamples([]);
    setTraining(null);
  }, []);

  const handleStop = useCallback(async () => {
    const take = recorder.stop();
    const labelled = trainingTake;
    setTrainingTake(null);
    if (!take || take.length === 0) return;
    if (labelled) {
      const added = samplesFromTake(take, labelled);
      if (added.length === 0) {
        notify.warning('No hit heard in that take');
        return;
      }
      const all = [...samples, ...added];
      setSamples(all);
      saveSamples(all);
      handleTrain(all);
      return;
    }
    setTakeSeconds(take.length / 22050);
    if (drums) {
      setHits(detectHits(take, training?.useModel ? modelClassifier(training.model) : classifyByRules));
      return;
    }
    setAnalysing(true);
    try {
      // Full-take pass: replaces the live preview
      const result = await model.evaluate(take);
      setOutput(result);
      setActiveTakeId(addTake(result, take.length / 22050).id);
      setTakes(listTakes());
    } catch (err) {
      notify.error(`Pitch detection failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setAnalysing(false);
    }
  }, [recorder, model, drums, trainingTake, samples, training, handleTrain]);

  const handleCommit = useCallback(() => {
    const quantise = {
      bpm,
      speed,
      swing: fine.swing,
      minLengthRows: fine.minLengthRows,
      // Measured device latency plus the manual nudge on top
      latencyNudgeMs: calibratedMs + fine.latencyNudgeMs,
    };
    const target = { channelIndex, startRow, instrumentId };
    const result = drums
      ? commitDrumHits(hits, drumMap, quantise, target)
      : commitVoiceNotes(finalNotes, quantise, target);
    if (!result) {
      notify.warning(drums ? 'No drum hits to write' : 'No notes to write');
      return;
    }
    notify.success(
      `Wrote ${result.written} note${result.written === 1 ? '' : 's'}` +
        (result.dropped ? `, ${result.dropped} past the end of the pattern` : ''),
    );
  }, [drums, hits, drumMap, finalNotes, bpm, speed, fine, calibratedMs, channelIndex, startRow, instrumentId]);

  const handleCalibrate = useCallback(async () => {
    setCalibrating(true);
    try {
      const stream = await backend.getStream(deviceId || undefined);
      const ms = await measureLoopbackLatencyMs(backend.createCapture(stream));
      if (ms === null) {
        notify.warning('The click did not reach the microphone. Turn the speakers up or move the microphone closer.');
        return;
      }
      storeLatencyMs(deviceId, ms);
      setCalibratedMs(ms);
      notify.success(`Measured latency ${ms} ms`);
    } catch (err) {
      notify.error(`Calibration failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setCalibrating(false);
    }
  }, [backend, deviceId]);

  const handleUseTake = useCallback((take: Take) => {
    setOutput(take.output);
    setTakeSeconds(take.seconds);
    setActiveTakeId(take.id);
    setStartRow(useCursorStore.getState().cursor.rowIndex);
  }, []);

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

      <CustomSelect value={mode} onChange={(v) => setMode(v as VoiceMode)} options={MODE_OPTIONS} title="Mode" disabled={recording} />
      <CustomSelect value={deviceId} onChange={setDeviceId} options={deviceOptions} title="Microphone" disabled={recording} />
      <CustomSelect
        value={String(channelIndex)}
        onChange={(v) => setChannelIndex(Number(v))}
        options={channelOptions}
        title="Target channel"
      />
      {!drums && (
        <CustomSelect
          value={String(instrumentId)}
          onChange={(v) => setInstrumentId(Number(v))}
          options={instrumentOptions}
          title="Instrument"
        />
      )}

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

      {drums ? (
        <>
          <div className="text-[10px] font-mono text-text-secondary">Drum map</div>
          {DRUM_CLASSES.map((drum) => {
            const count = hits.filter((h) => h.drum === drum).length;
            return (
              <div key={drum} className="flex flex-col gap-1" data-testid={`drum-map-${drum}`}>
                <span className="text-[10px] font-mono text-text-muted">
                  {DRUM_CLASS_LABELS[drum]} - {count} hit{count === 1 ? '' : 's'}
                </span>
                <div className="flex gap-1">
                  <CustomSelect
                    value={String(drumMap[drum].instrumentId)}
                    onChange={(v) => setDrumMap((m) => ({ ...m, [drum]: { ...m[drum], instrumentId: Number(v) } }))}
                    options={instrumentOptions}
                    title={`${DRUM_CLASS_LABELS[drum]} instrument`}
                  />
                  <CustomSelect
                    value={String(drumMap[drum].midi)}
                    onChange={(v) => setDrumMap((m) => ({ ...m, [drum]: { ...m[drum], midi: Number(v) } }))}
                    options={DRUM_NOTE_OPTIONS}
                    title={`${DRUM_CLASS_LABELS[drum]} note`}
                  />
                </div>
              </div>
            );
          })}
          <div className="text-[10px] font-mono text-text-secondary">Train on your voice</div>
          <div className="flex gap-1">
            <CustomSelect
              value={trainClass}
              onChange={(v) => setTrainClass(v as DrumClass)}
              options={DRUM_CLASSES.map((d) => ({ value: d, label: DRUM_CLASS_LABELS[d] }))}
              title="Training class"
              disabled={recording}
            />
            <Button variant="default" size="sm" icon={<Mic size={12} />} onClick={() => void handleRecordTraining()} disabled={recording || analysing}>
              Record training take
            </Button>
          </div>
          <div className="text-[9px] font-mono text-text-muted" data-testid="drum-training-status">
            {DRUM_CLASSES.map((d) => `${DRUM_CLASS_LABELS[d]} ${countsByClass(samples)[d]}`).join(', ')}
            {' - '}
            {training
              ? `held out ${training.heldOut}: model ${Math.round(training.modelAccuracy * 100)} percent, rules ${Math.round(training.rulesAccuracy * 100)} percent, using ${training.useModel ? 'your model' : 'the rules'}`
              : `needs ${MIN_SAMPLES_PER_CLASS} hits for at least two classes`}
          </div>
          {samples.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleClearTraining} disabled={recording}>
              Clear training
            </Button>
          )}
          <div className="text-[9px] font-mono text-text-muted">
            {hits.length} hit{hits.length === 1 ? '' : 's'} - row length {(rowLength * 1000).toFixed(0)} ms
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Knob label="Swing" value={fine.swing} min={0} max={1} step={0.01} onChange={(v) => patch('swing', v)} size="sm" />
            <Knob label="Latency" unit="ms" value={fine.latencyNudgeMs} min={-300} max={300} step={1} bipolar onChange={(v) => patch('latencyNudgeMs', Math.round(v))} size="sm" title="Move the hits earlier (positive) or later (negative) to match your microphone and output latency" />
          </div>
        </>
      ) : (
      <>
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

      <div className="text-[10px] font-mono text-text-secondary">Key</div>
      <Toggle label="Snap to key" value={fine.keySnapOn} onChange={(v) => patch('keySnapOn', v)} size="sm" />
      {fine.keySnapOn && (
        <div className="flex gap-2">
          <CustomSelect
            value={String(fine.keyTonic)}
            onChange={(v) => patch('keyTonic', Number(v))}
            options={TONIC_NAMES.map((n, i) => ({ value: String(i), label: n }))}
            title="Key"
          />
          <CustomSelect
            value={fine.keyScale}
            onChange={(v) => patch('keyScale', v as ScaleName)}
            options={(Object.keys(SCALES) as ScaleName[]).map((k) => ({ value: k, label: SCALE_LABELS[k] }))}
            title="Scale"
          />
        </div>
      )}
      </>
      )}

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" icon={<Timer size={12} />} onClick={() => void handleCalibrate()} disabled={recording || analysing || calibrating}>
          Calibrate latency
        </Button>
        <span className="text-[9px] font-mono text-text-muted" data-testid="voice-calibrated-latency">{calibratedMs} ms measured</span>
      </div>

      {!drums && takes.length > 0 && (
        <>
          <div className="text-[10px] font-mono text-text-secondary">Takes</div>
          <div className="flex flex-col gap-1">
            {takes.map((t, i) => (
              <Button
                key={t.id}
                variant={t.id === activeTakeId ? 'primary' : 'ghost'}
                size="sm"
                disabled={recording || analysing}
                onClick={() => handleUseTake(t)}
              >
                {`Take ${takes.length - i} (${t.seconds.toFixed(1)} s)`}
              </Button>
            ))}
          </div>
        </>
      )}

      <Button
        variant="primary"
        size="sm"
        icon={<Check size={12} />}
        onClick={handleCommit}
        disabled={recording || analysing || (drums ? hits.length === 0 : finalNotes.length === 0)}
      >
        Commit
      </Button>
    </aside>
  );
};
