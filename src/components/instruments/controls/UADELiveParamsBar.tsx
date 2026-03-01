/**
 * UADELiveParamsBar — Live Volume and Finetune knobs for UADE enhanced-scan instruments.
 *
 * Appears when UADEFormatAnalyzer has discovered chip RAM addresses for volume and/or period.
 * All edits are live chip RAM writes — not persisted to InstrumentConfig.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { InstrumentConfig } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { useThemeStore } from '@stores';
import { UADEChipEditor } from '@/engine/uade/UADEChipEditor';
import { UADEEngine } from '@/engine/uade/UADEEngine';

interface UADELiveParamsBarProps {
  instrument: InstrumentConfig;
}

export const UADELiveParamsBar: React.FC<UADELiveParamsBarProps> = ({ instrument }) => {
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

  const sections = instrument.uadeChipRam?.sections;

  // Seed initial values from chip RAM on mount / instrument change
  useEffect(() => {
    if (!sections) return;
    const editor = getEditor();
    if (sections['volume'] != null) {
      editor.readBytes(sections['volume'], 1)
        .then((b) => setVolume(b[0]))
        .catch(() => { /* default 64 */ });
    }
    basePeriodRef.current = 0;
    if (sections['period'] != null) {
      editor.readU16(sections['period'])
        .then((p) => { basePeriodRef.current = p; })
        .catch(() => { /* basePeriod stays 0 */ });
    }
    setFinetune(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instrument.id]);

  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const isCyan = currentThemeId === 'cyan-lineart';

  const accent  = isCyan ? '#00ffff' : '#44aaff';
  const knob    = isCyan ? '#00ffff' : '#66bbff';
  const dim     = isCyan ? '#004444' : '#001833';
  const panelBg = isCyan ? 'bg-[#041510] border-cyan-900/50' : 'bg-[#000e1a] border-blue-900/30';

  if (!sections || (sections['volume'] == null && sections['period'] == null)) return null;

  const handleVolumeChange = useCallback((v: number) => {
    const rounded = Math.round(v);
    setVolume(rounded);
    if (sections['volume'] != null) {
      getEditor().writeU8(sections['volume'], rounded).catch(console.error);
    }
  }, [sections, getEditor]);

  const handleFinetuneChange = useCallback((f: number) => {
    setFinetune(f);
    if (sections['period'] != null && basePeriodRef.current > 0) {
      const newPeriod = Math.round(basePeriodRef.current * Math.pow(2, -f / 1200));
      getEditor().writeU16(sections['period'], newPeriod).catch(console.error);
    }
  }, [sections, getEditor]);

  return (
    <div className={`rounded-lg border p-3 ${panelBg} flex items-center gap-6`}>
      <div className="text-[10px] font-bold uppercase tracking-widest"
        style={{ color: accent, opacity: 0.7, minWidth: 60 }}>
        Live Params
      </div>
      <div className="flex items-center gap-4">
        {sections['volume'] != null && (
          <Knob
            value={volume}
            min={0}
            max={64}
            step={1}
            label="Volume"
            color={knob}
            size="sm"
            formatValue={(v) => Math.round(v).toString()}
            onChange={handleVolumeChange}
          />
        )}
        {sections['period'] != null && (
          <Knob
            value={finetune}
            min={-128}
            max={127}
            step={1}
            label="Finetune"
            color={knob}
            size="sm"
            bipolar
            formatValue={(v) => `${v > 0 ? '+' : ''}${Math.round(v)} ct`}
            onChange={(v) => handleFinetuneChange(Math.round(v))}
          />
        )}
      </div>
      <div className="text-[9px] font-mono ml-auto"
        style={{ color: dim === '#004444' ? '#006666' : '#224466' }}>
        chip RAM live
      </div>
    </div>
  );
};
