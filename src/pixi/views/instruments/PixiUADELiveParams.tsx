/**
 * PixiUADELiveParams — GL (PixiJS) live Volume and Finetune knobs.
 *
 * Standalone component using PixiKnob directly (not SynthPanelLayout, which
 * does not support async chip RAM side effects).
 * Reads initial values from chip RAM on mount; writes back on each knob change.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { PixiKnob } from '../../components';
import { UADEChipEditor } from '../../../engine/uade/UADEChipEditor';
import { UADEEngine } from '../../../engine/uade/UADEEngine';

interface PixiUADELiveParamsProps {
  instrumentId: string;          // re-seeds when instrument changes
  sections: Record<string, number>;
}

export const PixiUADELiveParams: React.FC<PixiUADELiveParamsProps> = ({
  instrumentId,
  sections,
}) => {
  const [volume, setVolume] = useState(64);
  const [finetune, setFinetune] = useState(0);
  const basePeriodRef = useRef(0);

  const chipEditorRef = useRef<UADEChipEditor | null>(null);
  const getEditor = useCallback((): UADEChipEditor => {
    if (!chipEditorRef.current) {
      chipEditorRef.current = new UADEChipEditor(UADEEngine.getInstance());
    }
    return chipEditorRef.current;
  }, []);

  // Seed from chip RAM when instrument changes
  useEffect(() => {
    const editor = getEditor();
    basePeriodRef.current = 0;
    if (sections['volume'] != null) {
      editor.readBytes(sections['volume'], 1)
        .then((b) => setVolume(b[0]))
        .catch(() => { /* default 64 */ });
    }
    if (sections['period'] != null) {
      editor.readU16(sections['period'])
        .then((p) => { basePeriodRef.current = p; })
        .catch(() => { /* basePeriod stays 0 */ });
    }
    setFinetune(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instrumentId]);

  const handleVolumeChange = useCallback((v: number) => {
    const rounded = Math.round(v);
    setVolume(rounded);
    if (sections['volume'] != null) {
      getEditor().writeU8(sections['volume'], rounded).catch(console.error);
    }
  }, [sections, getEditor]);

  const handleFinetuneChange = useCallback((f: number) => {
    const rounded = Math.round(f);
    setFinetune(rounded);
    if (sections['period'] != null && basePeriodRef.current > 0) {
      const newPeriod = Math.round(basePeriodRef.current * Math.pow(2, -rounded / 1200));
      getEditor().writeU16(sections['period'], newPeriod).catch(console.error);
    }
  }, [sections, getEditor]);

  const fmtVolume = useCallback((v: number) => Math.round(v).toString(), []);
  const fmtFinetune = useCallback((v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}ct`, []);

  const hasVolume = sections['volume'] != null;
  const hasPeriod = sections['period'] != null;

  return (
    <pixiContainer
      layout={{
        flexDirection: 'row',
        gap: 12,
        flexWrap: 'wrap',
        paddingTop: 8,
        paddingLeft: 8,
        paddingRight: 8,
        paddingBottom: 8,
      }}
    >
      {hasVolume && (
        <PixiKnob
          value={volume}
          min={0}
          max={64}
          defaultValue={64}
          label="VOLUME"
          size="sm"
          formatValue={fmtVolume}
          onChange={handleVolumeChange}
        />
      )}
      {hasPeriod && (
        <PixiKnob
          value={finetune}
          min={-128}
          max={127}
          defaultValue={0}
          label="FINETUNE"
          size="sm"
          bipolar
          formatValue={fmtFinetune}
          onChange={handleFinetuneChange}
        />
      )}
    </pixiContainer>
  );
};
