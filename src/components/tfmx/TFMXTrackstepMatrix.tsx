/**
 * TFMXTrackstepMatrix — Trackstep matrix editor for TFMX modules.
 * Uses the shared SongOrderMatrix for rendering.
 *
 * Displays the TFMX trackstep table: which patterns are assigned to which
 * voices per song step, with EFFE control commands shown as special rows.
 */

import React, { useMemo, useCallback } from 'react';
import { SongOrderMatrix, MATRIX_COLLAPSED_HEIGHT } from '@/components/shared/SongOrderMatrix';
import type { ColumnDef, FormatChannel, OnCellChange } from '@/components/shared/format-editor-types';
import { useFormatStore } from '@stores';
import type { TFMXNativeData } from '@/types/tfmxNative';

export const TFMX_MATRIX_HEIGHT = 200;
export const TFMX_MATRIX_COLLAPSED_HEIGHT = MATRIX_COLLAPSED_HEIGHT;

// Sentinel values encoded in the 'pat' field
const PAT_STOP = 0x100;
const PAT_HOLD = 0x101;
const PAT_EFFE = 0x102;
const PAT_EFFE_OTHER = 0x103;

function hex2(v: number): string {
  return v.toString(16).toUpperCase().padStart(2, '0');
}

interface TFMXTrackstepMatrixProps {
  width: number;
  height: number;
  native: TFMXNativeData;
  activeStep: number;
  selectedPattern: number;
  onSelectPattern: (patIdx: number) => void;
  onStepChange?: (stepIdx: number) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const TFMXTrackstepMatrix: React.FC<TFMXTrackstepMatrixProps> = ({
  width, height, native, activeStep, selectedPattern: _selectedPattern,
  onSelectPattern, onStepChange: _onStepChange, collapsed, onToggleCollapse,
}) => {
  const steps = native.tracksteps;
  const numVoices = native.numVoices;
  const setTrackstepVoice = useFormatStore(s => s.setTFMXTrackstepVoice);

  const formatColumns = useMemo<ColumnDef[]>(() => [{
    key: 'pat', label: 'Pat', charWidth: 2, type: 'hex' as const, hexDigits: 2,
    color: '#e0a050', emptyColor: '#505050', emptyValue: undefined,
    formatter: (v: number) => v === PAT_STOP ? '--' : v === PAT_HOLD ? 'HD' : v >= PAT_EFFE ? 'EF' : hex2(v),
  }, {
    key: 'trans', label: 'Tr', charWidth: 3, type: 'hex' as const, hexDigits: 2,
    color: '#e0a050', emptyColor: '#505050', emptyValue: undefined,
    formatter: (v: number) => v === 0xFFFF ? '...' : `${(v & 0x100) ? '-' : '+'}${hex2(v & 0xFF)}`,
  }], []);

  const formatChannels = useMemo<FormatChannel[]>(() => {
    const channels: FormatChannel[] = [];
    for (let v = 0; v < numVoices; v++) {
      const rows = steps.map(step => {
        if (step.isEFFE) return { pat: v === 0 ? PAT_EFFE : PAT_EFFE_OTHER, trans: 0xFFFF };
        const voice = step.voices[v];
        if (!voice) return { pat: PAT_STOP, trans: 0xFFFF };
        if (voice.isStop) return { pat: PAT_STOP, trans: 0xFFFF };
        if (voice.isHold) return { pat: PAT_HOLD, trans: 0xFFFF };
        const absT = Math.abs(voice.transpose);
        const signBit = voice.transpose < 0 ? 0x100 : 0;
        return { pat: voice.patternNum, trans: signBit | absT };
      });

      const patFormatter = (val: number) =>
        val === PAT_STOP ? '--' : val === PAT_HOLD ? 'HD' : val >= PAT_EFFE ? (v === 0 ? 'EF' : '..') : hex2(val);
      const transFormatter = (val: number) =>
        val === 0xFFFF ? '...' : `${(val & 0x100) ? '-' : '+'}${hex2(val & 0xFF)}`;

      channels.push({
        label: `Voice ${v}`,
        patternLength: steps.length,
        rows,
        columns: [
          { key: 'pat', label: `V${v}`, charWidth: 2, type: 'hex' as const, hexDigits: 2, color: '#e0a050', emptyColor: '#505050', emptyValue: undefined, formatter: patFormatter },
          { key: 'trans', label: 'Tr', charWidth: 3, type: 'hex' as const, hexDigits: 2, color: '#e0a050', emptyColor: '#505050', emptyValue: undefined, formatter: transFormatter },
        ],
      });
    }
    return channels;
  }, [steps, numVoices]);

  const handleCellChange = useCallback<OnCellChange>((channelIdx, rowIdx, columnKey, value) => {
    const step = steps[rowIdx];
    if (!step || step.isEFFE) return;
    const voice = step.voices[channelIdx];
    if (!voice || voice.isStop || voice.isHold) return;
    if (columnKey === 'pat') {
      setTrackstepVoice(step.stepIndex, channelIdx, value & 0xFF, voice.transpose);
      onSelectPattern(value & 0xFF);
    } else if (columnKey === 'trans') {
      const sign = (value & 0x100) ? -1 : 1;
      setTrackstepVoice(step.stepIndex, channelIdx, voice.patternNum, sign * (value & 0xFF));
    }
  }, [steps, setTrackstepVoice, onSelectPattern]);

  return (
    <SongOrderMatrix
      label="TRACKSTEPS"
      width={width}
      height={height}
      formatColumns={formatColumns}
      formatChannels={formatChannels}
      currentRow={activeStep}
      onCellChange={handleCellChange}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
    />
  );
};
