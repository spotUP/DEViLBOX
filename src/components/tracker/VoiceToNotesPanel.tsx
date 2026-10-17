/**
 * VoiceToNotesPanel - record a hummed or sung melody, or beatboxed drums, see
 * the take as a waveform with every heard event marked, fine-tune it, and write
 * it into the pattern as one undo step.
 *
 * Glue only: capture lives in lib/voice/voiceRecorder + hooks/audio/useVoiceRecorder,
 * note extraction in lib/voice/pitchNotes, row snapping in lib/voice/quantise,
 * pattern writing in lib/voice/writeToPattern. Take, settings and training state
 * live in stores/useVoiceStore; this modal and the setup wizard only render it.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Mic, Square, Check, Loader2, Timer, Wand2 } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { Modal } from '@components/ui/Modal';
import { ModalHeader } from '@components/ui/ModalHeader';
import { ModalFooter } from '@components/ui/ModalFooter';
import { Knob } from '@components/controls/Knob';
import { Toggle } from '@components/controls/Toggle';
import { CustomSelect } from '@components/common/CustomSelect';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useCursorStore } from '@/stores/useCursorStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { notify } from '@/stores/useNotificationStore';
import { useVoiceStore, type Finetune, type VoiceEffectToggles, type VoiceMode, type VoiceTake } from '@/stores/useVoiceStore';
import { useVoiceRecorder, defaultVoiceRecorderDeps, type VoiceRecorderDeps } from '@/hooks/audio/useVoiceRecorder';
import { basicPitchModel, type PitchModel } from '@/lib/voice/basicPitchModel';
import { DEFAULT_PITCH_SETTINGS, PITCH_SAMPLE_RATE, noteName, type MelodyRange, type VoiceNote } from '@/lib/voice/pitchNotes';
import { quantiseNotes, rowSeconds, type QuantiseSettings, type QuantisedNote } from '@/lib/voice/quantise';
import { melodyPreview, drumPreview } from '@/lib/voice/takePreview';
import { useVoicePreviewStore } from '@/stores/useVoicePreviewStore';
import { commitVoiceNotes, shapeNotes } from '@/lib/voice/voiceToNotes';
import { SCALES, SCALE_LABELS, TONIC_NAMES, type ScaleName } from '@/lib/voice/scaleSnap';
import {
  markVoiceSetupSeen,
  measureLoopbackLatencyMs,
  shouldOpenVoiceSetup,
  storeLatencyMs,
} from '@/lib/voice/latencyCalibration';
import { VoiceLevelMeter, VoiceSetupWizard } from './VoiceSetupWizard';
import { VoiceTakeWaveform, type WaveformMarker } from './VoiceTakeWaveform';
import { DRUM_CLASSES, DRUM_CLASS_LABELS, classifyByRules, detectHits, type DrumClass, type DrumHit } from '@/lib/voice/drumHits';
import {
  clearTraining,
  countsByClass,
  describeTraining,
  modelClassifier,
  samplesFromTake,
  trainAndEvaluate,
  type TrainingSample,
} from '@/lib/voice/drumModel';
import { NEW_808_INSTRUMENT, commitDrumHits, defaultDrumMap, quantiseHits, usedDrumClasses, type DrumMap } from '@/lib/voice/drumToNotes';
import { currentTargetInstrument, drumMapAsWritten } from '@/lib/voice/voiceInstruments';

export interface VoiceToNotesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Test seam: the pitch model. Defaults to Basic Pitch. */
  model?: PitchModel;
  /** Test seam: microphone and capture backend. */
  deps?: VoiceRecorderDeps;
}

const COUNT_IN_BEATS = 4;

const MODE_OPTIONS = [
  { value: 'melody', label: 'Melody' },
  { value: 'drums', label: 'Drums' },
];

const EFFECT_LABELS: Record<keyof VoiceEffectToggles, string> = {
  volume: 'Volume',
  slides: 'Slides',
  vibrato: 'Vibrato',
  arpeggio: 'Arpeggio',
  flams: 'Flams',
};

const DRUM_NOTE_OPTIONS = Array.from({ length: 61 }, (_, i) => {
  const midi = 24 + i;
  return { value: String(midi), label: noteName(midi) };
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
      className="w-full h-24 bg-dark-bgTertiary border border-dark-borderLight rounded"
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

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[10px] font-mono text-text-secondary uppercase tracking-wide">{children}</div>
);

export const VoiceToNotesPanel: React.FC<VoiceToNotesPanelProps> = ({
  isOpen,
  onClose,
  model = basicPitchModel,
  deps,
}) => {
  const fine = useVoiceStore((s) => s.fine);
  const patchFine = useVoiceStore((s) => s.patchFine);
  const mode = useVoiceStore((s) => s.mode);
  const setMode = useVoiceStore((s) => s.setMode);
  const take = useVoiceStore((s) => s.take);
  const takes = useVoiceStore((s) => s.takes);
  const addTake = useVoiceStore((s) => s.addTake);
  const useTake = useVoiceStore((s) => s.useTake);
  const clearTake = useVoiceStore((s) => s.clearTake);
  const samples = useVoiceStore((s) => s.samples);
  const setSamples = useVoiceStore((s) => s.setSamples);
  const training = useVoiceStore((s) => s.training);
  const setTraining = useVoiceStore((s) => s.setTraining);
  const storedDrumMap = useVoiceStore((s) => s.drumMap);
  const setDrumMap = useVoiceStore((s) => s.setDrumMap);
  const trainingTake = useVoiceStore((s) => s.trainingTake);
  const setTrainingTake = useVoiceStore((s) => s.setTrainingTake);
  const deviceId = useVoiceStore((s) => s.deviceId);
  const setDeviceId = useVoiceStore((s) => s.setDeviceId);
  const channelIndex = useVoiceStore((s) => s.channelIndex);
  const setChannelIndex = useVoiceStore((s) => s.setChannelIndex);
  const startRow = useVoiceStore((s) => s.startRow);
  const setStartRow = useVoiceStore((s) => s.setStartRow);
  const calibratedMs = useVoiceStore((s) => s.calibratedMs);
  const setCalibratedMs = useVoiceStore((s) => s.setCalibratedMs);

  // Transient: what the microphone is doing right now, never part of a take
  const [trainClass, setTrainClass] = useState<DrumClass>('kick');
  const [recordingClass, setRecordingClass] = useState<DrumClass | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [levelCheck, setLevelCheck] = useState(false);
  const [wizardMelody, setWizardMelody] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(shouldOpenVoiceSetup);
  const backend = deps ?? defaultVoiceRecorderDeps;

  const bpm = useTransportStore((s) => s.bpm);
  const speed = useTransportStore((s) => s.speed);
  const channelCount = useTrackerStore((s) => s.patterns[s.currentPatternIndex]?.channels.length ?? 0);
  const rowCount = useTrackerStore((s) => s.patterns[s.currentPatternIndex]?.length ?? 0);
  const instruments = useInstrumentStore((s) => s.instruments);
  // The melody target is the song's current instrument, read live from the
  // store: the panel's Instrument select is that selection, not a private copy
  const currentInstrumentId = useInstrumentStore((s) => s.currentInstrumentId);
  const instrumentId = currentTargetInstrument(instruments, currentInstrumentId);
  const setInstrumentId = useInstrumentStore((s) => s.setCurrentInstrument);
  // The drum map follows the song's instruments until the user edits it
  const fallbackDrumMap = useMemo(() => defaultDrumMap(instruments), [instruments]);
  const drumMap: DrumMap = storedDrumMap ?? fallbackDrumMap;

  const drums = mode === 'drums';
  const recorder = useVoiceRecorder(model, fine, deps);
  const output = take?.output ?? null;
  const hits: readonly DrumHit[] = take?.hits ?? [];
  const takeSeconds = take?.seconds ?? 0;

  const patch = useCallback(<K extends keyof Finetune>(key: K, value: Finetune[K]) => {
    patchFine({ [key]: value } as Partial<Finetune>);
  }, [patchFine]);
  const patchEffect = useCallback((key: keyof VoiceEffectToggles, value: boolean) => {
    patchFine({ effects: { ...useVoiceStore.getState().fine.effects, [key]: value } });
  }, [patchFine]);

  const quantise = useMemo<QuantiseSettings>(() => ({
    bpm,
    speed,
    swing: fine.swing,
    minLengthRows: fine.minLengthRows,
    // Measured device latency plus the manual nudge on top
    latencyNudgeMs: calibratedMs + fine.latencyNudgeMs,
  }), [bpm, speed, fine.swing, fine.minLengthRows, fine.latencyNudgeMs, calibratedMs]);

  // A new take, or a change to how it lands, is pending again until committed.
  const [pending, setPending] = useState(false);
  useEffect(() => setPending(true), [take, fine, quantise, channelIndex, startRow, mode]);
  // Set when a take ends: the take lands on the grid without a Commit click.
  const [autoCommit, setAutoCommit] = useState(false);

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
    clearTake();
    setStartRow(useCursorStore.getState().cursor.rowIndex);
    await recorder.start({
      deviceId: deviceId || undefined,
      countInBeats: COUNT_IN_BEATS,
      beatSeconds: 60 / useTransportStore.getState().bpm,
      // Drum hits are found when the take stops; the pitch model is not needed
      livePreview: !drums,
    });
  }, [recorder, deviceId, drums, clearTake, setStartRow]);

  const handleRecordTraining = useCallback(async (drum: DrumClass) => {
    setRecordingClass(drum);
    await recorder.start({ deviceId: deviceId || undefined, countInBeats: 0, beatSeconds: 60 / useTransportStore.getState().bpm, livePreview: false });
  }, [recorder, deviceId]);

  /** A take only for the level meter; it is thrown away on stop. */
  const handleCheckLevel = useCallback(async () => {
    setLevelCheck(true);
    await recorder.start({ deviceId: deviceId || undefined, countInBeats: 0, beatSeconds: 60 / useTransportStore.getState().bpm, livePreview: false });
  }, [recorder, deviceId]);

  /** The wizard's scale take: heard with the pitch model, kept as the take, never written to the grid. */
  const handleRecordMelody = useCallback(async () => {
    setWizardMelody(true);
    clearTake();
    await recorder.start({ deviceId: deviceId || undefined, countInBeats: 0, beatSeconds: 60 / useTransportStore.getState().bpm, livePreview: true });
  }, [recorder, deviceId, clearTake]);

  const handleCloseWizard = useCallback(() => {
    markVoiceSetupSeen();
    setWizardOpen(false);
  }, []);

  const handleTrain = useCallback((all: TrainingSample[]) => {
    setTraining(trainAndEvaluate(all));
  }, [setTraining]);

  const handleClearTraining = useCallback(() => {
    clearTraining();
    setSamples([]);
    setTraining(null);
    setTrainingTake(null);
  }, [setSamples, setTraining, setTrainingTake]);

  const handleStop = useCallback(async () => {
    const audio = recorder.stop();
    const labelled = recordingClass;
    const forWizard = wizardMelody;
    setRecordingClass(null);
    setWizardMelody(false);
    if (levelCheck) {
      setLevelCheck(false);
      return;
    }
    if (!audio || audio.length === 0) return;
    if (labelled) {
      const added = samplesFromTake(audio, labelled);
      setTrainingTake({ drum: labelled, audio, hits: detectHits(audio) });
      if (added.length === 0) {
        notify.warning('No hit heard in that take');
        return;
      }
      const all = [...samples, ...added];
      setSamples(all);
      handleTrain(all);
      return;
    }
    if (drums && !forWizard) {
      addTake({ mode: 'drums', audio, output: null, hits: detectHits(audio, training?.useModel ? modelClassifier(training.model) : classifyByRules) });
      setAutoCommit(true);
      return;
    }
    setAnalysing(true);
    try {
      // Full-take pass: replaces the live preview
      const result = await model.evaluate(audio);
      addTake({ mode: 'melody', audio, output: result, hits: [] });
      if (!forWizard) setAutoCommit(true);
    } catch (err) {
      notify.error(`Pitch detection failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setAnalysing(false);
    }
  }, [recorder, model, drums, recordingClass, wizardMelody, levelCheck, samples, training, handleTrain, addTake, setSamples, setTrainingTake]);

  // The wizard's range step hears the scale with the full pitch range so the range can be derived from it
  const melodyForWizard = useMemo(
    () =>
      take?.mode === 'melody' && output
        ? {
            audio: take.audio,
            sampleRate: take.sampleRate,
            notes: shapeNotes(output, {
              ...fine,
              minMidiNote: DEFAULT_PITCH_SETTINGS.minMidiNote,
              maxMidiNote: DEFAULT_PITCH_SETTINGS.maxMidiNote,
              transpose: 0,
              keySnap: null,
            }),
          }
        : null,
    [take, output, fine],
  );
  const rangeInUse = useMemo<MelodyRange>(
    () => ({ minMidiNote: fine.minMidiNote, maxMidiNote: fine.maxMidiNote, transpose: fine.transpose }),
    [fine.minMidiNote, fine.maxMidiNote, fine.transpose],
  );

  const handleCommit = useCallback(() => {
    const target = { channelIndex, startRow, instrumentId };
    let result;
    if (drums) {
      result = commitDrumHits(hits, drumMap, quantise, target);
      if (result) setDrumMap(result.drumMap);
    } else {
      result = commitVoiceNotes(finalNotes, quantise, target);
      if (result) setInstrumentId(result.instrumentId);
    }
    if (!result) {
      notify.warning(drums ? 'No drum hits to write' : 'No notes to write');
      return;
    }
    setPending(false);
    notify.success(
      `Wrote ${result.written} note${result.written === 1 ? '' : 's'}` +
        (result.dropped ? `, ${result.dropped} past the end of the pattern` : ''),
    );
  }, [drums, hits, drumMap, finalNotes, quantise, channelIndex, startRow, instrumentId, setDrumMap, setInstrumentId]);

  // A finished take is written at once (owner kept forgetting Commit); Commit
  // stays for re-writing after a change. Runs once `pending` has seen the take.
  useEffect(() => {
    if (!autoCommit || !pending || analysing) return;
    setAutoCommit(false);
    if (drums ? hits.length === 0 : finalNotes.length === 0) return;
    handleCommit();
  }, [autoCommit, pending, analysing, drums, hits, finalNotes, handleCommit]);

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
  }, [backend, deviceId, setCalibratedMs]);

  const handleUseTake = useCallback((t: VoiceTake) => {
    useTake(t.id);
    setStartRow(useCursorStore.getState().cursor.rowIndex);
  }, [useTake, setStartRow]);

  const recording = recorder.phase !== 'idle';
  // Level checks and training takes are not takes for the pattern
  const takeRecording = recording && !levelCheck && recordingClass === null;
  const shownNotes = recording ? recorder.liveNotes : finalNotes;

  // The take shows in the pattern as ghost notes while recording and until it
  // is committed; built with the commit's own steps (lib/voice/takePreview).
  const preview = useMemo(() => {
    if (recording ? !takeRecording : !pending) return null;
    const target = { channelIndex, startRow, instrumentId };
    if (drums) return recording ? null : drumPreview(hits, drumMap, quantise, target, rowCount);
    return melodyPreview(shownNotes, quantise, target, rowCount);
  }, [recording, takeRecording, pending, drums, hits, drumMap, shownNotes, quantise, channelIndex, startRow, instrumentId, rowCount]);
  const setPreview = useVoicePreviewStore((s) => s.setPreview);
  useEffect(() => setPreview(isOpen ? preview : null), [preview, setPreview, isOpen]);
  useEffect(() => () => setPreview(null), [setPreview]);
  const rowLength = rowSeconds(bpm, speed);

  // The rows the commit writes, for the timing table and the waveform markers
  const written = useMemo<QuantisedNote[]>(() => {
    if (drums) return hits.length ? quantiseHits(hits, drumMapAsWritten(drumMap, usedDrumClasses(hits)), quantise) : [];
    return finalNotes.length ? quantiseNotes(finalNotes, quantise) : [];
  }, [drums, hits, drumMap, finalNotes, quantise]);

  const markers = useMemo<WaveformMarker[]>(() => {
    if (drums) {
      return hits.map((h, i) => ({ id: `hit-${i}`, timeSeconds: h.timeSeconds, label: DRUM_CLASS_LABELS[h.drum], kind: 'hit' as const }));
    }
    return shownNotes.map((n, i) => ({
      id: `note-${i}`,
      timeSeconds: n.startTimeSeconds,
      endSeconds: n.startTimeSeconds + n.durationSeconds,
      label: noteName(n.pitchMidi),
      kind: 'note' as const,
    }));
  }, [drums, hits, shownNotes]);

  const deviceOptions = [
    { value: '', label: 'Default microphone' },
    ...recorder.devices.map((d) => ({ value: d.deviceId, label: d.label || 'Microphone' })),
  ];
  const channelOptions = Array.from({ length: channelCount }, (_, i) => ({
    value: String(i),
    label: `Channel ${i + 1}`,
  }));
  const instrumentOptions = instruments.map((i) => ({ value: String(i.id), label: `${i.id}. ${i.name}` }));
  const drumInstrumentOptions = (drum: DrumClass) => [
    { value: String(NEW_808_INSTRUMENT), label: `TR-808 ${DRUM_CLASS_LABELS[drum]} (added on commit)` },
    ...instrumentOptions,
  ];
  const eventCount = drums ? hits.length : shownNotes.length;
  const eventWord = drums ? 'hit' : 'note';
  const phaseLabel = recorder.phase === 'countIn' ? 'Count-in' : recorder.phase === 'recording' ? 'Recording' : analysing ? 'Analysing' : 'Ready';

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="fullscreen" closeOnEnter={false} closeOnBackdropClick={false}>
      <ModalHeader title="Voice to Notes" subtitle={drums ? 'Beatbox a drum pattern' : 'Hum or sing a melody'} icon={<Mic size={16} />} onClose={onClose} />
      <VoiceSetupWizard
        isOpen={wizardOpen}
        onClose={handleCloseWizard}
        level={recorder.level}
        recording={recording}
        recordingClass={recordingClass}
        lastTrainingTake={trainingTake}
        error={recorder.error}
        onCheckLevel={() => void handleCheckLevel()}
        onStop={() => void handleStop()}
        calibratedMs={calibratedMs}
        calibrating={calibrating}
        onCalibrate={() => void handleCalibrate()}
        samples={samples}
        training={training}
        onRecordTraining={(drum) => void handleRecordTraining(drum)}
        melody={melodyForWizard}
        melodyRecording={wizardMelody && recording}
        onRecordMelody={() => void handleRecordMelody()}
        onMelodyRange={(range) => patchFine(range)}
        range={rangeInUse}
      />

      <div data-testid="voice-to-notes-panel" className="flex-1 min-h-0 flex gap-2 p-2 overflow-hidden text-text-primary">
        {/* Left: what to record and how it lands */}
        <div className="w-80 shrink-0 flex flex-col gap-2 overflow-y-auto pr-1">
          <SectionLabel>Source</SectionLabel>
          <CustomSelect value={mode} onChange={(v) => setMode(v as VoiceMode)} options={MODE_OPTIONS} title="Mode" disabled={recording} />
          <CustomSelect value={deviceId} onChange={setDeviceId} options={deviceOptions} title="Microphone" disabled={recording} />

          <SectionLabel>Target</SectionLabel>
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

          {drums ? (
            <>
              <SectionLabel>Drum map</SectionLabel>
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
                        onChange={(v) => setDrumMap({ ...drumMap, [drum]: { ...drumMap[drum], instrumentId: Number(v) } })}
                        options={drumInstrumentOptions(drum)}
                        title={`${DRUM_CLASS_LABELS[drum]} instrument`}
                      />
                      <CustomSelect
                        value={String(drumMap[drum].midi)}
                        onChange={(v) => setDrumMap({ ...drumMap, [drum]: { ...drumMap[drum], midi: Number(v) } })}
                        options={DRUM_NOTE_OPTIONS}
                        title={`${DRUM_CLASS_LABELS[drum]} note`}
                      />
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            <>
              <SectionLabel>Finetune</SectionLabel>
              <div className="grid grid-cols-3 gap-2">
                <Knob label="Onset" value={fine.onsetThreshold} min={0.1} max={0.9} step={0.01} onChange={(v) => patch('onsetThreshold', v)} size="sm" />
                <Knob label="Sustain" value={fine.frameThreshold} min={0.1} max={0.9} step={0.01} onChange={(v) => patch('frameThreshold', v)} size="sm" />
                <Knob label="Min Length" unit="ms" value={fine.minNoteLengthMs} min={30} max={400} step={5} onChange={(v) => patch('minNoteLengthMs', v)} size="sm" />
                <Knob label="Lowest" value={fine.minMidiNote} min={21} max={108} step={1} onChange={(v) => patch('minMidiNote', v)} size="sm" />
                <Knob label="Highest" value={fine.maxMidiNote} min={21} max={108} step={1} onChange={(v) => patch('maxMidiNote', v)} size="sm" />
                <Knob label="Transpose" value={fine.transpose} min={-24} max={24} step={1} bipolar onChange={(v) => patch('transpose', Math.round(v))} size="sm" />
              </div>

              <SectionLabel>Key</SectionLabel>
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

          <SectionLabel>Quantise</SectionLabel>
          <div className="grid grid-cols-3 gap-2">
            <Knob label="Strength" value={fine.strength} min={0} max={1} step={0.01} onChange={(v) => patch('strength', v)} size="sm" title="How far each note moves to its nearest row: 1 lands on the row, 0 keeps the timing you sang" />
            <Knob label="Tolerance" unit="rows" value={fine.toleranceRows} min={0} max={0.5} step={0.01} onChange={(v) => patch('toleranceRows', v)} size="sm" title="Notes closer than this to a row snap to it fully" />
            <Knob label="Swing" value={fine.swing} min={0} max={1} step={0.01} onChange={(v) => patch('swing', v)} size="sm" />
            <Knob label="Min Rows" value={fine.minLengthRows} min={1} max={8} step={1} onChange={(v) => patch('minLengthRows', Math.round(v))} size="sm" />
            <Knob label="Latency" unit="ms" value={fine.latencyNudgeMs} min={-300} max={300} step={1} bipolar onChange={(v) => patch('latencyNudgeMs', Math.round(v))} size="sm" title="Move the notes earlier (positive) or later (negative) to match your microphone and output latency" />
          </div>

          <SectionLabel>Effects</SectionLabel>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
            {(Object.keys(EFFECT_LABELS) as (keyof VoiceEffectToggles)[]).map((key) => (
              <Toggle key={key} label={EFFECT_LABELS[key]} value={fine.effects[key]} onChange={(v) => patchEffect(key, v)} size="sm" />
            ))}
          </div>
        </div>

        {/* Centre: the take */}
        <div className="flex-1 min-w-0 flex flex-col gap-2 overflow-y-auto">
          <SectionLabel>Take</SectionLabel>
          <VoiceTakeWaveform
            audio={take?.audio ?? null}
            sampleRate={take?.sampleRate ?? PITCH_SAMPLE_RATE}
            markers={markers}
            rowSeconds={rowLength}
          />
          {!drums && <NoteRoll notes={shownNotes} seconds={takeSeconds || 4} />}
          <div className="text-[9px] font-mono text-text-muted">
            {eventCount} {eventWord}{eventCount === 1 ? '' : 's'} - row length {(rowLength * 1000).toFixed(0)} ms
            {takeSeconds > 0 ? ` - take ${takeSeconds.toFixed(1)} s` : ''}
          </div>
          {recorder.error && <div className="text-[10px] font-mono text-accent-error">{recorder.error}</div>}

          <SectionLabel>Written rows</SectionLabel>
          <table data-testid="voice-timing" className="w-full text-[10px] font-mono text-text-primary border-collapse">
            <thead>
              <tr className="text-text-muted text-left">
                <th className="font-normal pr-2">Row</th>
                <th className="font-normal pr-2">Note</th>
                <th className="font-normal pr-2">Length</th>
                <th className="font-normal pr-2">Instrument</th>
              </tr>
            </thead>
            <tbody>
              {written.map((n, i) => (
                <tr key={i} className="border-t border-dark-borderLight">
                  <td className="pr-2">{startRow + n.row}</td>
                  <td className="pr-2">{noteName(n.midi)}</td>
                  <td className="pr-2">{n.lengthRows} row{n.lengthRows === 1 ? '' : 's'}</td>
                  <td className="pr-2">{n.instrumentId ?? instrumentId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right: takes, training, setup */}
        <div className="w-56 shrink-0 flex flex-col gap-2 overflow-y-auto">
          <SectionLabel>Takes</SectionLabel>
          {takes.length === 0 && <div className="text-[9px] font-mono text-text-muted">No takes yet</div>}
          <div className="flex flex-col gap-1">
            {takes.map((t, i) => (
              <Button
                key={t.id}
                variant={t.id === take?.id ? 'primary' : 'ghost'}
                size="sm"
                disabled={recording || analysing}
                onClick={() => handleUseTake(t)}
              >
                {`Take ${takes.length - i} (${t.seconds.toFixed(1)} s)`}
              </Button>
            ))}
          </div>

          <SectionLabel>Your voice</SectionLabel>
          <div className="flex gap-1">
            <CustomSelect
              value={trainClass}
              onChange={(v) => setTrainClass(v as DrumClass)}
              options={DRUM_CLASSES.map((d) => ({ value: d, label: DRUM_CLASS_LABELS[d] }))}
              title="Training class"
              disabled={recording}
            />
          </div>
          <Button variant="default" size="sm" icon={<Mic size={12} />} onClick={() => void handleRecordTraining(trainClass)} disabled={recording || analysing}>
            Record training take
          </Button>
          <div className="text-[9px] font-mono text-text-muted" data-testid="drum-training-status">
            {DRUM_CLASSES.map((d) => `${DRUM_CLASS_LABELS[d]} ${countsByClass(samples)[d]}`).join(', ')}
            {' - '}
            {describeTraining(training)}
          </div>
          {trainingTake && (
            <div className="text-[9px] font-mono text-text-muted">
              Last training take: {DRUM_CLASS_LABELS[trainingTake.drum]}, {trainingTake.hits.length} hit{trainingTake.hits.length === 1 ? '' : 's'}
            </div>
          )}
          {samples.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleClearTraining} disabled={recording}>
              Clear training
            </Button>
          )}

          <SectionLabel>Setup</SectionLabel>
          <Button variant="ghost" size="sm" icon={<Wand2 size={12} />} onClick={() => setWizardOpen(true)} disabled={recording} aria-label="Setup wizard">
            Setup wizard
          </Button>
          <Button variant="ghost" size="sm" icon={<Timer size={12} />} onClick={() => void handleCalibrate()} disabled={recording || analysing || calibrating}>
            Calibrate latency
          </Button>
          <span className="text-[9px] font-mono text-text-muted" data-testid="voice-calibrated-latency">{calibratedMs} ms measured</span>
        </div>
      </div>

      <ModalFooter align="between">
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
          <span className="text-[10px] font-mono text-text-muted">{phaseLabel}</span>
          {analysing && <Loader2 size={12} className="animate-spin text-accent-primary" />}
          <div className="w-32">
            <VoiceLevelMeter level={recorder.level} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            icon={<Check size={12} />}
            onClick={handleCommit}
            disabled={recording || analysing || !pending || (drums ? hits.length === 0 : finalNotes.length === 0)}
          >
            Commit
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </ModalFooter>
    </Modal>
  );
};
