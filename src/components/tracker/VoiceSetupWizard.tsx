/**
 * VoiceSetupWizard - first-use setup for Voice to Notes: microphone level,
 * latency calibration, one beatbox training step per drum class, one sung
 * scale for the melody range, and the result.
 *
 * Presentation only. Recording, calibration, training and storage are the
 * Voice to Notes panel's own handlers, passed in as props; the takes shown
 * here come from useVoiceStore through the panel.
 */
import React, { useMemo, useState } from 'react';
import { Mic, Square, Timer } from 'lucide-react';
import { Modal } from '@components/ui/Modal';
import { ModalHeader } from '@components/ui/ModalHeader';
import { ModalFooter } from '@components/ui/ModalFooter';
import { Button } from '@components/ui/Button';
import { DRUM_CLASSES, DRUM_CLASS_LABELS, type DrumClass } from '@/lib/voice/drumHits';
import {
  MIN_SAMPLES_PER_CLASS,
  countsByClass,
  describeTraining,
  type TrainingResult,
  type TrainingSample,
} from '@/lib/voice/drumModel';
import { PITCH_SAMPLE_RATE, melodyRange, noteName, type MelodyRange, type VoiceNote } from '@/lib/voice/pitchNotes';
import type { TrainingTake } from '@/stores/useVoiceStore';
import { VoiceTakeWaveform, type WaveformMarker } from './VoiceTakeWaveform';

/** Input level bar, shared by the panel and the wizard. */
export const VoiceLevelMeter: React.FC<{ level: number }> = ({ level }) => (
  <div className="h-1 bg-dark-bgTertiary rounded overflow-hidden" aria-label="Input level">
    <div className="h-full bg-accent-success" style={{ width: `${Math.min(100, level * 300)}%` }} />
  </div>
);

const STEPS = ['microphone', 'latency', ...DRUM_CLASSES, 'melody', 'result'] as const;
type Step = (typeof STEPS)[number];
const STEP_TITLES: Record<Step, string> = {
  microphone: 'Microphone level',
  latency: 'Latency calibration',
  kick: 'Train your kick',
  snare: 'Train your snare',
  hat: 'Train your hi-hat',
  clap: 'Train your clap',
  melody: 'Your singing range',
  result: 'Result',
};
const DRUM_PROMPTS: Record<DrumClass, string> = {
  kick: 'Say "boom" eight times, one per beat, with short gaps.',
  snare: 'Say "ka" or "pss" eight times, one per beat, with short gaps.',
  hat: 'Say "ts" eight times, one per beat, with short gaps.',
  clap: 'Clap, or say "pah", eight times, one per beat, with short gaps.',
};

function isDrumStep(step: Step): step is DrumClass {
  return (DRUM_CLASSES as readonly string[]).includes(step);
}

/** A recorded melody for the range step: the take's audio and what was heard in it. */
export interface WizardMelody {
  audio: Float32Array;
  sampleRate: number;
  notes: readonly VoiceNote[];
}

export interface VoiceSetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  /** Recorder state */
  level: number;
  recording: boolean;
  /** The class a training take is being recorded for, or null */
  recordingClass: DrumClass | null;
  /** The last training take, with the hits heard in it */
  lastTrainingTake: TrainingTake | null;
  error: string | null;
  onCheckLevel: () => void;
  onStop: () => void;
  calibratedMs: number;
  calibrating: boolean;
  onCalibrate: () => void;
  samples: readonly TrainingSample[];
  training: TrainingResult | null;
  onRecordTraining: (drum: DrumClass) => void;
  /** The melody take recorded in this wizard, or null */
  melody: WizardMelody | null;
  melodyRecording: boolean;
  onRecordMelody: () => void;
  /** Called on Next from the melody step with the range heard */
  onMelodyRange: (range: MelodyRange) => void;
  /** The range in use, shown on the result step */
  range: MelodyRange;
}

function describeRange(range: MelodyRange): string {
  const shift = range.transpose === 0 ? 'no transpose' : `transpose ${range.transpose > 0 ? '+' : ''}${range.transpose}`;
  return `${noteName(range.minMidiNote)} to ${noteName(range.maxMidiNote)}, ${shift}`;
}

export const VoiceSetupWizard: React.FC<VoiceSetupWizardProps> = ({
  isOpen,
  onClose,
  level,
  recording,
  recordingClass,
  lastTrainingTake,
  error,
  onCheckLevel,
  onStop,
  calibratedMs,
  calibrating,
  onCalibrate,
  samples,
  training,
  onRecordTraining,
  melody,
  melodyRecording,
  onRecordMelody,
  onMelodyRange,
  range,
}) => {
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex];
  const counts = countsByClass(samples);
  const last = stepIndex === STEPS.length - 1;

  const heardRange = useMemo(() => (melody ? melodyRange(melody.notes) : null), [melody]);
  const hitMarkers = useMemo<WaveformMarker[]>(
    () =>
      lastTrainingTake
        ? lastTrainingTake.hits.map((h, i) => ({ id: `hit-${i}`, timeSeconds: h.timeSeconds, label: '', kind: 'hit' as const }))
        : [],
    [lastTrainingTake],
  );
  const noteMarkers = useMemo<WaveformMarker[]>(
    () =>
      melody
        ? melody.notes.map((n, i) => ({
            id: `note-${i}`,
            timeSeconds: n.startTimeSeconds,
            endSeconds: n.startTimeSeconds + n.durationSeconds,
            label: noteName(n.pitchMidi),
            kind: 'note' as const,
          }))
        : [],
    [melody],
  );

  // Next is gated: a drum step needs its class trained, the melody step a heard range
  const nextBlocked =
    recording ||
    (isDrumStep(step) && counts[step] < MIN_SAMPLES_PER_CLASS) ||
    (step === 'melody' && heardRange === null);

  const close = () => {
    if (recording) onStop();
    setStepIndex(0);
    onClose();
  };
  const go = (delta: number) => {
    if (recording) onStop();
    if (delta > 0 && step === 'melody' && heardRange) onMelodyRange(heardRange);
    setStepIndex((i) => Math.max(0, Math.min(STEPS.length - 1, i + delta)));
  };

  return (
    <Modal isOpen={isOpen} onClose={close} size="xl" closeOnEnter={false}>
      <ModalHeader
        title="Voice to Notes setup"
        subtitle={`Step ${stepIndex + 1} of ${STEPS.length}: ${STEP_TITLES[step]}`}
        onClose={close}
      />
      <div className="flex flex-col gap-2 p-3 text-text-primary" data-testid={`voice-setup-step-${step}`}>
        {step === 'microphone' && (
          <>
            <p className="text-[10px] font-mono text-text-secondary">
              Hum or speak at your normal volume. The bar should move well past a quarter without reaching the end.
            </p>
            <VoiceLevelMeter level={level} />
            {!recording ? (
              <Button variant="primary" size="sm" icon={<Mic size={12} />} onClick={onCheckLevel}>
                Test microphone
              </Button>
            ) : (
              <Button variant="danger" size="sm" icon={<Square size={12} />} onClick={onStop}>
                Stop test
              </Button>
            )}
          </>
        )}

        {step === 'latency' && (
          <>
            <p className="text-[10px] font-mono text-text-secondary">
              Turn the speakers up and keep the microphone near them. A click plays and its round trip is measured, so
              notes land on the beat you sang them on.
            </p>
            <Button variant="primary" size="sm" icon={<Timer size={12} />} onClick={onCalibrate} disabled={calibrating}>
              {calibrating ? 'Measuring' : 'Calibrate latency'}
            </Button>
            <span className="text-[10px] font-mono text-text-muted" data-testid="voice-setup-latency">
              {calibratedMs} ms measured
            </span>
          </>
        )}

        {isDrumStep(step) && (
          <>
            <p className="text-[10px] font-mono text-text-secondary">
              {DRUM_PROMPTS[step]} {MIN_SAMPLES_PER_CLASS} hits per drum for at least two drums trains a model on your voice.
            </p>
            <div className="flex items-center gap-2" data-testid={`voice-setup-train-${step}`}>
              <span className="w-16 text-[10px] font-mono text-text-primary">{DRUM_CLASS_LABELS[step]}</span>
              <span className="w-16 text-[10px] font-mono text-text-muted">
                {counts[step]} hit{counts[step] === 1 ? '' : 's'}
              </span>
              {recordingClass === step ? (
                <Button variant="danger" size="sm" icon={<Square size={12} />} onClick={onStop}>
                  Stop
                </Button>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  icon={<Mic size={12} />}
                  onClick={() => onRecordTraining(step)}
                  disabled={recording}
                >
                  {lastTrainingTake?.drum === step ? 'Retake' : 'Record'}
                </Button>
              )}
            </div>
            {recording && <VoiceLevelMeter level={level} />}
            <VoiceTakeWaveform
              audio={lastTrainingTake?.drum === step ? lastTrainingTake.audio : null}
              sampleRate={PITCH_SAMPLE_RATE}
              markers={lastTrainingTake?.drum === step ? hitMarkers : []}
              placeholder={`Record your ${DRUM_CLASS_LABELS[step].toLowerCase()} to see the take`}
            />
            {lastTrainingTake?.drum === step && (
              <span className="text-[10px] font-mono text-text-muted" data-testid="voice-setup-heard">
                Heard {lastTrainingTake.hits.length} hit{lastTrainingTake.hits.length === 1 ? '' : 's'}
              </span>
            )}
          </>
        )}

        {step === 'melody' && (
          <>
            <p className="text-[10px] font-mono text-text-secondary">
              Sing eight notes up a scale at a comfortable pitch. The lowest and highest notes set the range Voice to
              Notes listens for; a low voice is written an octave up.
            </p>
            {melodyRecording ? (
              <Button variant="danger" size="sm" icon={<Square size={12} />} onClick={onStop}>
                Stop
              </Button>
            ) : (
              <Button variant="default" size="sm" icon={<Mic size={12} />} onClick={onRecordMelody} disabled={recording}>
                {melody ? 'Retake' : 'Record'}
              </Button>
            )}
            {recording && <VoiceLevelMeter level={level} />}
            <VoiceTakeWaveform
              audio={melody?.audio ?? null}
              sampleRate={melody?.sampleRate ?? PITCH_SAMPLE_RATE}
              markers={noteMarkers}
              placeholder="Record a scale to see the notes heard"
            />
            <span className="text-[10px] font-mono text-text-muted" data-testid="voice-setup-range">
              {heardRange ? `Heard ${melody?.notes.length ?? 0} notes: ${describeRange(heardRange)}` : 'No notes heard yet'}
            </span>
          </>
        )}

        {step === 'result' && (
          <>
            <span className="text-[10px] font-mono text-text-primary">Latency: {calibratedMs} ms</span>
            <span className="text-[10px] font-mono text-text-primary" data-testid="voice-setup-result">
              Drum training: {describeTraining(training)}
            </span>
            <span className="text-[10px] font-mono text-text-primary" data-testid="voice-setup-result-range">
              Melody range: {describeRange(range)}
            </span>
            <p className="text-[10px] font-mono text-text-secondary">
              Open this setup again from the Voice to Notes panel at any time.
            </p>
          </>
        )}

        {error && <div className="text-[10px] font-mono text-accent-error">{error}</div>}
      </div>
      <ModalFooter align="between">
        <Button variant="ghost" size="sm" onClick={() => go(-1)} disabled={stepIndex === 0}>
          Back
        </Button>
        {last ? (
          <Button variant="primary" size="sm" onClick={close}>
            Finish
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={() => go(1)} disabled={nextBlocked}>
            Next
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
};
