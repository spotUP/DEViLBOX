/**
 * PixiRandomizeDialog — Pixi-native pattern randomizer dialog.
 * Simplified version: density knob + scale selector + Apply/Cancel.
 */

import { useState, useCallback } from 'react';
import { PixiModal, PixiModalHeader, PixiModalFooter, PixiButton, PixiKnob, PixiLabel } from '../components';
import { useTrackerStore } from '@stores';
import { midiToXMNote } from '@lib/xmConversions';
import { noteNameToMidi } from '@lib/generators/acidPatternGenerator';
import type { TrackerCell } from '@typedefs/tracker';

interface PixiRandomizeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  channelIndex?: number;
}

const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const PixiRandomizeDialog: React.FC<PixiRandomizeDialogProps> = ({ isOpen, onClose, channelIndex = 0 }) => {
  const setChannelRows = useTrackerStore(s => s.setChannelRows);
  const patterns = useTrackerStore(s => s.patterns);
  const currentPatternIndex = useTrackerStore(s => s.currentPatternIndex);

  const [density, setDensity] = useState(50);
  const [octaveRange, setOctaveRange] = useState(3);
  const [accentDensity, setAccentDensity] = useState(30);

  const handleApply = useCallback(() => {
    const pattern = patterns[currentPatternIndex];
    if (!pattern) return;

    const rootMidi = noteNameToMidi('C0');
    const rows: TrackerCell[] = [];

    for (let i = 0; i < pattern.length; i++) {
      if (Math.random() * 100 >= density) {
        rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
        continue;
      }

      const octave = randomInt(2, 2 + octaveRange);
      const degree = randomInt(0, MINOR_SCALE.length - 1);
      const midiNote = rootMidi + MINOR_SCALE[degree] + octave * 12;
      const note = midiToXMNote(Math.max(0, Math.min(127, midiNote)));
      const flag1 = Math.random() * 100 < accentDensity ? 1 : undefined;

      rows.push({
        note,
        instrument: 0,
        volume: 0,
        effTyp: 0,
        eff: 0,
        effTyp2: 0,
        eff2: 0,
        flag1,
      });
    }

    setChannelRows(channelIndex, rows);
    onClose();
  }, [patterns, currentPatternIndex, density, octaveRange, accentDensity, channelIndex, setChannelRows, onClose]);

  if (!isOpen) return null;

  return (
    <PixiModal isOpen={isOpen} onClose={onClose} width={300} height={320}>
      <PixiModalHeader title="Randomize" onClose={onClose} />

      <pixiContainer layout={{ flex: 1, padding: 12, flexDirection: 'column', gap: 16, alignItems: 'center' }}>
        <pixiContainer layout={{ flexDirection: 'row', gap: 16, justifyContent: 'center' }}>
          <PixiKnob
            value={density}
            min={0}
            max={100}
            defaultValue={50}
            label="DENSITY"
            size="md"
            formatValue={(v) => `${Math.round(v)}%`}
            onChange={setDensity}
          />
          <PixiKnob
            value={octaveRange}
            min={1}
            max={5}
            defaultValue={3}
            label="OCTAVES"
            size="md"
            formatValue={(v) => `${Math.round(v)}`}
            onChange={setOctaveRange}
          />
        </pixiContainer>

        <PixiKnob
          value={accentDensity}
          min={0}
          max={100}
          defaultValue={30}
          label="ACCENTS"
          size="md"
          formatValue={(v) => `${Math.round(v)}%`}
          onChange={setAccentDensity}
        />

        <PixiLabel text="Generates random notes in C minor scale" size="xs" color="textMuted" />
      </pixiContainer>

      <PixiModalFooter>
        <PixiButton label="Cancel" variant="ghost" onClick={onClose} />
        <PixiButton label="Randomize" variant="primary" onClick={handleApply} />
      </PixiModalFooter>
    </PixiModal>
  );
};
