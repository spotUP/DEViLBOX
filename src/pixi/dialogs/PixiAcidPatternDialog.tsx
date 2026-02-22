/**
 * PixiAcidPatternDialog — TB-303 acid pattern generator with Pixi knobs.
 */

import { useState, useCallback } from 'react';
import { PixiModal, PixiModalHeader, PixiModalFooter, PixiButton, PixiKnob, PixiLabel } from '../components';
import { useTrackerStore, useInstrumentStore } from '@stores';
import { generateAcidPattern, type Scale, type AcidPatternParams } from '@lib/generators/acidPatternGenerator';

interface PixiAcidPatternDialogProps {
  isOpen: boolean;
  onClose: () => void;
  channelIndex?: number;
}

export const PixiAcidPatternDialog: React.FC<PixiAcidPatternDialogProps> = ({ isOpen, onClose, channelIndex = 0 }) => {
  const setChannelRows = useTrackerStore(s => s.setChannelRows);
  const patterns = useTrackerStore(s => s.patterns);
  const currentPatternIndex = useTrackerStore(s => s.currentPatternIndex);
  const instruments = useInstrumentStore(s => s.instruments);
  const createInstrument = useInstrumentStore(s => s.createInstrument);

  const [density, setDensity] = useState(60);
  const [spread, setSpread] = useState(60);
  const [accentsDensity, setAccentsDensity] = useState(50);
  const [slidesDensity, setSlidesDensity] = useState(40);

  const existing303 = instruments.find(inst => inst.synthType === 'TB303' || inst.synthType === 'Buzz3o3');

  const handleGenerate = useCallback(() => {
    const pattern = patterns[currentPatternIndex];
    if (!pattern) return;

    let instrumentId = existing303?.id;
    if (!instrumentId) {
      instrumentId = createInstrument({ name: 'TB-303', synthType: 'TB303' });
    }

    const params: AcidPatternParams = {
      patternLength: pattern.length,
      density,
      spread,
      accentsDensity,
      slidesDensity,
      scale: 'MINOR' as Scale,
      rootNote: 'C2',
      instrumentId,
    };

    const rows = generateAcidPattern(params);
    setChannelRows(channelIndex, rows);
    onClose();
  }, [patterns, currentPatternIndex, existing303, createInstrument, density, spread, accentsDensity, slidesDensity, channelIndex, setChannelRows, onClose]);

  const handleRandomize = useCallback(() => {
    setDensity(Math.floor(Math.random() * 60) + 40);
    setSpread(Math.floor(Math.random() * 60) + 40);
    setAccentsDensity(Math.floor(Math.random() * 60) + 20);
    setSlidesDensity(Math.floor(Math.random() * 60) + 20);
  }, []);

  if (!isOpen) return null;

  return (
    <PixiModal isOpen={isOpen} onClose={onClose} width={340} height={380}>
      <PixiModalHeader title="Acid Pattern Generator" onClose={onClose} />

      <pixiContainer layout={{ flex: 1, padding: 12, flexDirection: 'column', gap: 12, alignItems: 'center' }}>
        <pixiContainer layout={{ flexDirection: 'row', gap: 16, justifyContent: 'center' }}>
          <PixiKnob
            value={density}
            min={0}
            max={100}
            defaultValue={60}
            label="DENSITY"
            size="md"
            color={0xff6600}
            formatValue={(v) => `${Math.round(v)}%`}
            onChange={setDensity}
          />
          <PixiKnob
            value={spread}
            min={0}
            max={100}
            defaultValue={60}
            label="SPREAD"
            size="md"
            color={0x33ccff}
            formatValue={(v) => `${Math.round(v)}%`}
            onChange={setSpread}
          />
        </pixiContainer>

        <pixiContainer layout={{ flexDirection: 'row', gap: 16, justifyContent: 'center' }}>
          <PixiKnob
            value={accentsDensity}
            min={0}
            max={100}
            defaultValue={50}
            label="ACCENTS"
            size="md"
            color={0xff0066}
            formatValue={(v) => `${Math.round(v)}%`}
            onChange={setAccentsDensity}
          />
          <PixiKnob
            value={slidesDensity}
            min={0}
            max={100}
            defaultValue={40}
            label="SLIDES"
            size="md"
            color={0x9966ff}
            formatValue={(v) => `${Math.round(v)}%`}
            onChange={setSlidesDensity}
          />
        </pixiContainer>

        <PixiLabel
          text={existing303 ? `Using: ${existing303.name}` : 'Will create new TB-303'}
          size="xs"
          color="textMuted"
        />
      </pixiContainer>

      <PixiModalFooter>
        <PixiButton label="Random" variant="ghost" onClick={handleRandomize} />
        <PixiButton label="Cancel" variant="ghost" onClick={onClose} />
        <PixiButton label="Generate" variant="primary" onClick={handleGenerate} />
      </PixiModalFooter>
    </PixiModal>
  );
};
