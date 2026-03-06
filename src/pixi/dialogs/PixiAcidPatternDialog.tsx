/**
 * PixiAcidPatternDialog — TB-303 acid pattern generator.
 * Visually 1:1 with DOM AcidPatternGeneratorDialog:
 *   - Channel + Instrument selectors (row)
 *   - Scale + Root Note selectors (row)
 *   - 4 horizontal sliders with labels + descriptions
 *   - Overwrite confirmation sub-dialog
 */

import { useState, useCallback, useMemo } from 'react';
import { PixiModal, PixiModalHeader, PixiModalFooter, PixiButton, PixiLabel, PixiSelect, PixiSlider } from '../components';
import type { SelectOption } from '../components';
import { useTrackerStore, useInstrumentStore } from '@stores';
import { generateAcidPattern, ALL_SCALES, getScaleName, type Scale, type AcidPatternParams } from '@lib/generators/acidPatternGenerator';

interface PixiAcidPatternDialogProps {
  isOpen: boolean;
  onClose: () => void;
  channelIndex?: number;
}

const CREATE_NEW_303 = -1;
const SLIDER_W = 280;

export const PixiAcidPatternDialog: React.FC<PixiAcidPatternDialogProps> = ({ isOpen, onClose, channelIndex: initialChannelIndex = 0 }) => {
  const setChannelRows = useTrackerStore(s => s.setChannelRows);
  const patterns = useTrackerStore(s => s.patterns);
  const currentPatternIndex = useTrackerStore(s => s.currentPatternIndex);
  const instruments = useInstrumentStore(s => s.instruments);
  const createInstrument = useInstrumentStore(s => s.createInstrument);
  const currentPattern = patterns[currentPatternIndex];

  const [selectedChannel, setSelectedChannel] = useState(initialChannelIndex);
  const channel = currentPattern?.channels[selectedChannel];

  const existing303 = useMemo(
    () => instruments.find(inst => inst.synthType === 'TB303' || inst.synthType === 'Buzz3o3'),
    [instruments],
  );
  const [selectedInstrumentId, setSelectedInstrumentId] = useState<number>(
    existing303?.id ?? CREATE_NEW_303,
  );

  const [density, setDensity] = useState(60);
  const [spread, setSpread] = useState(60);
  const [accentsDensity, setAccentsDensity] = useState(50);
  const [slidesDensity, setSlidesDensity] = useState(40);
  const [scale, setScale] = useState<Scale>('MINOR');
  const [rootNote, setRootNote] = useState('C2');
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);

  // ── Options for selects ──────────────────────────────────────────────

  const channelOptions: SelectOption[] = useMemo(() => {
    if (!currentPattern) return [];
    return currentPattern.channels.map((ch, idx) => {
      const hasData = ch.rows.some(r => r.note !== 0 || r.instrument !== 0 || r.effTyp !== 0 || r.eff !== 0);
      return {
        value: String(idx),
        label: `${(idx + 1).toString().padStart(2, '0')}: ${ch.name}${hasData ? ' *' : ''}`,
      };
    });
  }, [currentPattern]);

  const instrumentOptions: SelectOption[] = useMemo(() => {
    const opts: SelectOption[] = [{ value: String(CREATE_NEW_303), label: '+ New TB-303' }];
    instruments.forEach(inst => {
      opts.push({ value: String(inst.id), label: `${inst.id}: ${inst.name} (${inst.synthType})` });
    });
    return opts;
  }, [instruments]);

  const scaleOptions: SelectOption[] = useMemo(() =>
    ALL_SCALES.map(s => ({ value: s, label: getScaleName(s) })), []);

  const rootNoteOptions: SelectOption[] = useMemo(() => {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const opts: SelectOption[] = [];
    for (let oct = 1; oct <= 3; oct++)
      for (const n of notes) opts.push({ value: `${n}${oct}`, label: `${n}${oct}` });
    return opts;
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────

  const channelHasData = useCallback(() => {
    if (!channel) return false;
    return channel.rows.some(r => r.note !== 0 || r.instrument !== 0 || r.effTyp !== 0 || r.eff !== 0);
  }, [channel]);

  const doGenerate = useCallback(() => {
    if (!currentPattern || !channel) return;

    let instrumentId = selectedInstrumentId;
    if (instrumentId === CREATE_NEW_303) {
      instrumentId = createInstrument({ name: 'TB-303', synthType: 'TB303' });
    }

    const params: AcidPatternParams = {
      patternLength: currentPattern.length,
      density,
      spread,
      accentsDensity,
      slidesDensity,
      scale,
      rootNote,
      instrumentId,
    };

    const rows = generateAcidPattern(params);
    setChannelRows(selectedChannel, rows);
  }, [currentPattern, channel, selectedInstrumentId, createInstrument, density, spread, accentsDensity, slidesDensity, scale, rootNote, selectedChannel, setChannelRows]);

  const handleGenerate = useCallback(() => {
    if (!channel) return;
    if (channelHasData()) {
      setShowOverwriteConfirm(true);
      return;
    }
    doGenerate();
    onClose();
  }, [channel, channelHasData, doGenerate, onClose]);

  const handleConfirmOverwrite = useCallback(() => {
    setShowOverwriteConfirm(false);
    doGenerate();
    onClose();
  }, [doGenerate, onClose]);

  const handleRandomize = useCallback(() => {
    setDensity(Math.floor(Math.random() * 60) + 40);
    setSpread(Math.floor(Math.random() * 60) + 40);
    setAccentsDensity(Math.floor(Math.random() * 60) + 20);
    setSlidesDensity(Math.floor(Math.random() * 60) + 20);
    setScale(ALL_SCALES[Math.floor(Math.random() * ALL_SCALES.length)]);
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const oct = Math.floor(Math.random() * 3) + 1;
    setRootNote(`${notes[Math.floor(Math.random() * notes.length)]}${oct}`);
  }, []);

  if (!isOpen || !currentPattern) return null;

  // ── Overwrite confirmation sub-dialog ────────────────────────────────

  if (showOverwriteConfirm) {
    return (
      <PixiModal isOpen={isOpen} onClose={() => setShowOverwriteConfirm(false)} width={380} height={180}>
        <PixiModalHeader title="Overwrite Channel?" onClose={() => setShowOverwriteConfirm(false)} />
        <layoutContainer layout={{ flex: 1, padding: 16, flexDirection: 'column', gap: 8 }}>
          <PixiLabel
            text={`Channel ${(selectedChannel + 1).toString().padStart(2, '0')} already contains note data.\nGenerating will replace all existing data in this channel.`}
            size="sm"
            color="textMuted"
          />
        </layoutContainer>
        <PixiModalFooter align="right">
          <PixiButton label="Cancel" variant="ghost" onClick={() => setShowOverwriteConfirm(false)} />
          <PixiButton label="Overwrite" variant="danger" onClick={handleConfirmOverwrite} />
        </PixiModalFooter>
      </PixiModal>
    );
  }

  // ── Main dialog ──────────────────────────────────────────────────────

  return (
    <PixiModal isOpen={isOpen} onClose={onClose} width={460} height={520}>
      <PixiModalHeader title="Acid Pattern Generator" onClose={onClose} />

      <layoutContainer layout={{ flex: 1, padding: 16, flexDirection: 'column', gap: 14 }}>
        {/* Row 1: Channel + Instrument */}
        <layoutContainer layout={{ flexDirection: 'row', gap: 12 }}>
          <layoutContainer layout={{ flexDirection: 'column', gap: 4, flex: 1 }}>
            <PixiLabel text="Channel" size="xs" />
            <PixiSelect
              options={channelOptions}
              value={String(selectedChannel)}
              onChange={(v) => setSelectedChannel(parseInt(v))}
              width={200}
            />
          </layoutContainer>
          <layoutContainer layout={{ flexDirection: 'column', gap: 4, flex: 1 }}>
            <PixiLabel text="Instrument" size="xs" />
            <PixiSelect
              options={instrumentOptions}
              value={String(selectedInstrumentId)}
              onChange={(v) => setSelectedInstrumentId(parseInt(v))}
              width={200}
            />
          </layoutContainer>
        </layoutContainer>

        {/* Row 2: Scale + Root Note */}
        <layoutContainer layout={{ flexDirection: 'row', gap: 12 }}>
          <layoutContainer layout={{ flexDirection: 'column', gap: 4, flex: 1 }}>
            <PixiLabel text="Scale" size="xs" />
            <PixiSelect
              options={scaleOptions}
              value={scale}
              onChange={(v) => setScale(v as Scale)}
              width={200}
            />
          </layoutContainer>
          <layoutContainer layout={{ flexDirection: 'column', gap: 4, flex: 1 }}>
            <PixiLabel text="Root Note" size="xs" />
            <PixiSelect
              options={rootNoteOptions}
              value={rootNote}
              onChange={setRootNote}
              width={200}
            />
          </layoutContainer>
        </layoutContainer>

        {/* Sliders — matching DOM layout: label with value, slider, description */}
        <layoutContainer layout={{ flexDirection: 'column', gap: 4 }}>
          <PixiLabel text={`Note Density: ${density}%`} size="sm" />
          <PixiSlider value={density} min={0} max={100} onChange={setDensity} orientation="horizontal" length={SLIDER_W} />
          <PixiLabel text="How many notes in the pattern (sparse - dense)" size="xs" color="textMuted" />
        </layoutContainer>

        <layoutContainer layout={{ flexDirection: 'column', gap: 4 }}>
          <PixiLabel text={`Note Spread: ${spread}%`} size="sm" />
          <PixiSlider value={spread} min={0} max={100} onChange={setSpread} orientation="horizontal" length={SLIDER_W} />
          <PixiLabel text="Note range variety (narrow - wide)" size="xs" color="textMuted" />
        </layoutContainer>

        <layoutContainer layout={{ flexDirection: 'column', gap: 4 }}>
          <PixiLabel text={`Accents: ${accentsDensity}%`} size="sm" />
          <PixiSlider value={accentsDensity} min={0} max={100} onChange={setAccentsDensity} orientation="horizontal" length={SLIDER_W} />
          <PixiLabel text="How many accented notes (subtle - punchy)" size="xs" color="textMuted" />
        </layoutContainer>

        <layoutContainer layout={{ flexDirection: 'column', gap: 4 }}>
          <PixiLabel text={`Slides: ${slidesDensity}%`} size="sm" />
          <PixiSlider value={slidesDensity} min={0} max={100} onChange={setSlidesDensity} orientation="horizontal" length={SLIDER_W} />
          <PixiLabel text="How many slides/portamento (few - many)" size="xs" color="textMuted" />
        </layoutContainer>
      </layoutContainer>

      <PixiModalFooter align="between">
        <PixiButton label="Randomize" icon="redo" variant="ghost" onClick={handleRandomize} />
        <layoutContainer layout={{ flexDirection: 'row', gap: 8 }}>
          <PixiButton label="Cancel" variant="ghost" onClick={onClose} />
          <PixiButton label="Generate Pattern" variant="primary" onClick={handleGenerate} />
        </layoutContainer>
      </PixiModalFooter>
    </PixiModal>
  );
};
