/**
 * SampleValueDialog - one number prompt for the sample editor operations that need an amount
 * (amplify, resize, insert silence, resample).
 */
import React, { useState } from 'react';
import { Modal } from '@components/ui/Modal';
import { ModalHeader } from '@components/ui/ModalHeader';
import { ModalFooter } from '@components/ui/ModalFooter';
import { Button } from '@components/ui/Button';

export type SampleValueKind = 'amplify' | 'resize' | 'insertSilence' | 'resample';

export interface SampleValueDialogProps {
  kind: SampleValueKind | null;
  frames: number;
  sampleRate: number;
  onClose: () => void;
  onApply: (kind: SampleValueKind, value: number) => void;
}

const COPY: Record<SampleValueKind, { title: string; label: string }> = {
  amplify: { title: 'Amplify', label: 'Amount in percent (100 leaves the sample unchanged)' },
  resize: { title: 'Resize', label: 'New length in frames' },
  insertSilence: { title: 'Insert Silence', label: 'Frames of silence to insert' },
  resample: { title: 'Resample', label: 'New sample rate in Hz' },
};

const defaultValue = (kind: SampleValueKind, frames: number, rate: number): number =>
  kind === 'amplify' ? 100 : kind === 'resize' ? frames : kind === 'resample' ? rate : 1000;

export const SampleValueDialog: React.FC<SampleValueDialogProps> = ({ kind, frames, sampleRate, onClose, onApply }) => {
  // Remount per open so the field starts at the default for that operation.
  return kind ? (
    <Body key={kind} kind={kind} initial={defaultValue(kind, frames, sampleRate)} onClose={onClose} onApply={onApply} />
  ) : null;
};

const Body: React.FC<{
  kind: SampleValueKind;
  initial: number;
  onClose: () => void;
  onApply: SampleValueDialogProps['onApply'];
}> = ({ kind, initial, onClose, onApply }) => {
  const [value, setValue] = useState(initial);
  const valid = Number.isFinite(value) && (kind === 'amplify' ? value >= 0 : Number.isInteger(value) && value >= 1);
  return (
    <Modal isOpen onClose={onClose} onConfirm={() => valid && onApply(kind, value)} confirmDisabled={!valid} size="sm">
      <ModalHeader title={COPY[kind].title} onClose={onClose} />
      <div className="p-4 flex flex-col gap-2">
        <label className="text-[10px] font-mono text-text-secondary" htmlFor="sample-value-input">{COPY[kind].label}</label>
        <input
          id="sample-value-input"
          type="number"
          autoFocus
          value={value}
          min={kind === 'amplify' ? 0 : 1}
          onChange={(e) => setValue(Number(e.target.value))}
          className="bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary font-mono text-xs px-2 py-1 focus:ring-1 focus:ring-accent-primary"
        />
      </div>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!valid} onClick={() => onApply(kind, value)}>Apply</Button>
      </ModalFooter>
    </Modal>
  );
};
