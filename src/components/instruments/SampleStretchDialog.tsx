/**
 * SampleStretchDialog - change a sample's speed. Keep Pitch on runs the DJ Key Lock
 * stretcher offline (length changes, pitch stays); off is a tape-style speed change.
 */
import React, { useState } from 'react';
import { Modal } from '@components/ui/Modal';
import { ModalHeader } from '@components/ui/ModalHeader';
import { ModalFooter } from '@components/ui/ModalFooter';
import { Button } from '@components/ui/Button';
import { Knob } from '@components/controls/Knob';
import { Toggle } from '@components/controls/Toggle';

export interface SampleStretchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (speedPercent: number, keepPitch: boolean) => void;
}

export const SampleStretchDialog: React.FC<SampleStretchDialogProps> = ({ isOpen, onClose, onApply }) => {
  const [speed, setSpeed] = useState(100);
  const [keepPitch, setKeepPitch] = useState(true);
  const apply = () => onApply(Math.round(speed), keepPitch);
  return (
    <Modal isOpen={isOpen} onClose={onClose} onConfirm={apply} size="sm">
      <ModalHeader title="Speed" onClose={onClose} />
      <div className="p-4 flex items-center justify-center gap-6">
        <Knob label="Speed" unit="%" value={speed} min={25} max={400} defaultValue={100} onChange={setSpeed}
          formatValue={(v) => `${Math.round(v)}%`} title="Playback speed: 100% leaves the sample unchanged" />
        <Toggle label="Keep Pitch" value={keepPitch} onChange={setKeepPitch} />
      </div>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={apply}>Apply</Button>
      </ModalFooter>
    </Modal>
  );
};
