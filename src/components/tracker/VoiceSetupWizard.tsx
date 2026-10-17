/**
 * VoiceSetupWizard - first-use setup for Voice to Notes: microphone level,
 * latency calibration, beatbox training per drum class, and the result.
 *
 * Presentation only. Recording, calibration, training and storage are the
 * Voice to Notes panel's own handlers, passed in as props.
 */
import React, { useState } from 'react';
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

/** Input level bar, shared by the panel and the wizard. */
export const VoiceLevelMeter: React.FC<{ level: number }> = ({ level }) => (
  <div className="h-1 bg-dark-bgTertiary rounded overflow-hidden" aria-label="Input level">
    <div className="h-full bg-accent-success" style={{ width: `${Math.min(100, level * 300)}%` }} />
  </div>
);

const STEPS = ['microphone', 'latency', 'drums', 'result'] as const;
type Step = (typeof STEPS)[number];
const STEP_TITLES: Record<Step, string> = {
  microphone: 'Microphone level',
  latency: 'Latency calibration',
  drums: 'Train on your voice',
  result: 'Result',
};

export interface VoiceSetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  /** Recorder state */
  level: number;
  recording: boolean;
  /** The class a training take is being recorded for, or null */
  trainingTake: DrumClass | null;
  error: string | null;
  onCheckLevel: () => void;
  onStop: () => void;
  calibratedMs: number;
  calibrating: boolean;
  onCalibrate: () => void;
  samples: readonly TrainingSample[];
  training: TrainingResult | null;
  onRecordTraining: (drum: DrumClass) => void;
}

export const VoiceSetupWizard: React.FC<VoiceSetupWizardProps> = ({
  isOpen,
  onClose,
  level,
  recording,
  trainingTake,
  error,
  onCheckLevel,
  onStop,
  calibratedMs,
  calibrating,
  onCalibrate,
  samples,
  training,
  onRecordTraining,
}) => {
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex];
  const counts = countsByClass(samples);
  const last = stepIndex === STEPS.length - 1;

  const close = () => {
    if (recording) onStop();
    setStepIndex(0);
    onClose();
  };
  const go = (delta: number) => {
    if (recording) onStop();
    setStepIndex((i) => Math.max(0, Math.min(STEPS.length - 1, i + delta)));
  };

  return (
    <Modal isOpen={isOpen} onClose={close} size="md" closeOnEnter={false}>
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

        {step === 'drums' && (
          <>
            <p className="text-[10px] font-mono text-text-secondary">
              For each drum, record a take of the sound you make for it, a few hits with short gaps. {MIN_SAMPLES_PER_CLASS}{' '}
              hits per drum for at least two drums trains a model on your voice. Skip this step to use the built-in rules.
            </p>
            {DRUM_CLASSES.map((drum) => (
              <div key={drum} className="flex items-center gap-2" data-testid={`voice-setup-train-${drum}`}>
                <span className="w-16 text-[10px] font-mono text-text-primary">{DRUM_CLASS_LABELS[drum]}</span>
                <span className="w-16 text-[10px] font-mono text-text-muted">
                  {counts[drum]} hit{counts[drum] === 1 ? '' : 's'}
                </span>
                {trainingTake === drum ? (
                  <Button variant="danger" size="sm" icon={<Square size={12} />} onClick={onStop}>
                    Stop
                  </Button>
                ) : (
                  <Button
                    variant="default"
                    size="sm"
                    icon={<Mic size={12} />}
                    onClick={() => onRecordTraining(drum)}
                    disabled={recording}
                  >
                    Record
                  </Button>
                )}
              </div>
            ))}
            {recording && <VoiceLevelMeter level={level} />}
          </>
        )}

        {step === 'result' && (
          <>
            <span className="text-[10px] font-mono text-text-primary">Latency: {calibratedMs} ms</span>
            <span className="text-[10px] font-mono text-text-primary" data-testid="voice-setup-result">
              Drum training: {describeTraining(training)}
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
          <Button variant="primary" size="sm" onClick={() => go(1)}>
            Next
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
};
