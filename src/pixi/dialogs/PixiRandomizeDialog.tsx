/**
 * PixiRandomizeDialog — Pixi-native pattern randomizer dialog.
 * Simplified version matching DOM visual patterns from RandomizeDialog.tsx.
 */

import { useState, useCallback } from 'react';
import { PixiModal, PixiModalHeader, PixiModalFooter, PixiButton, PixiSlider, PixiKnob, PixiLabel } from '../components';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';
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
  const theme = usePixiTheme();
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
    <PixiModal isOpen={isOpen} onClose={onClose} width={360} height={380}>
      <PixiModalHeader title="Randomize" onClose={onClose} />

      {/* Body — matches DOM p-4 space-y-3 (padding:16, gap:12) */}
      <layoutContainer layout={{ flex: 1, padding: 16, flexDirection: 'column', gap: 12 }}>
        {/* Density slider — matches DOM slider row */}
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <layoutContainer layout={{ flexDirection: 'row', gap: 4 }}>
            <pixiBitmapText
              text="Density: "
              style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 14, fill: 0xffffff }}
              tint={theme.text.color}
              layout={{}}
            />
            <pixiBitmapText
              text={`${density}%`}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 14, fill: 0xffffff }}
              tint={theme.accent.color}
              layout={{}}
            />
          </layoutContainer>
          <PixiSlider
            value={density}
            min={0}
            max={100}
            onChange={setDensity}
            orientation="horizontal"
            length={328}
            handleWidth={16}
            handleHeight={16}
            thickness={6}
          />
        </layoutContainer>

        {/* Knob row */}
        <layoutContainer layout={{ flexDirection: 'row', gap: 24, justifyContent: 'center', paddingTop: 8 }}>
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
        </layoutContainer>

        {/* Info text — matches DOM bg area */}
        <layoutContainer
          layout={{
            padding: 12,
            borderRadius: 6,
            backgroundColor: theme.bgTertiary.color,
          }}
        >
          <PixiLabel text="Generates random notes in C minor scale" size="xs" color="textMuted" font="sans" />
        </layoutContainer>
      </layoutContainer>

      <PixiModalFooter align="right">
        <PixiButton label="Cancel" variant="ghost" onClick={onClose} />
        <PixiButton label="Randomize" variant="primary" onClick={handleApply} />
      </PixiModalFooter>
    </PixiModal>
  );
};
