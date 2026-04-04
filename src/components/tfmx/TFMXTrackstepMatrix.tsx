/**
 * TFMXTrackstepMatrix — Trackstep matrix editor for TFMX modules.
 * Uses PatternEditorCanvas in format mode for visual consistency with the pattern editor.
 *
 * Displays the TFMX trackstep table: which patterns are assigned to which
 * voices per song step, with EFFE control commands shown as special rows.
 */

import React, { useMemo, useCallback } from 'react';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import type { ColumnDef, FormatChannel, OnCellChange } from '@/components/shared/format-editor-types';
import { useFormatStore } from '@stores';
import type { TFMXNativeData } from '@/types/tfmxNative';
// effeCommandToString available from ./tfmxAdapter if EFFE text display is needed

export const TFMX_MATRIX_HEIGHT = 200;
export const TFMX_MATRIX_COLLAPSED_HEIGHT = 28;

// Sentinel values encoded in the 'pat' field
const PAT_STOP = 0x100;
const PAT_HOLD = 0x101;
const PAT_EFFE = 0x102;
const PAT_EFFE_OTHER = 0x103; // non-first voice on EFFE row

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

  // Global formatColumns (used as fallback, per-voice columns override)
  const formatColumns = useMemo<ColumnDef[]>(() => [{
    key: 'pat',
    label: 'Pat',
    charWidth: 2,
    type: 'hex' as const,
    hexDigits: 2,
    color: '#e0a050',
    emptyColor: '#505050',
    emptyValue: undefined,
    formatter: (v: number) => {
      if (v === PAT_STOP) return '--';
      if (v === PAT_HOLD) return 'HD';
      if (v >= PAT_EFFE) return 'EF';
      return hex2(v);
    },
  }, {
    key: 'trans',
    label: 'Tr',
    charWidth: 3,
    type: 'hex' as const,
    hexDigits: 2,
    color: '#e0a050',
    emptyColor: '#505050',
    emptyValue: undefined,
    formatter: (v: number) => {
      // Stored as: sign in high byte (0=+, 1=-), abs value in low byte
      if (v === 0xFFFF) return '...'; // EFFE/stop/hold
      const sign = (v & 0x100) ? '-' : '+';
      const abs = v & 0xFF;
      return `${sign}${hex2(abs)}`;
    },
  }], []);

  // Build FormatChannel[] — one per voice
  const formatChannels = useMemo<FormatChannel[]>(() => {
    const channels: FormatChannel[] = [];
    for (let v = 0; v < numVoices; v++) {
      const rows = steps.map(step => {
        if (step.isEFFE) {
          return { pat: v === 0 ? PAT_EFFE : PAT_EFFE_OTHER, trans: 0xFFFF };
        }
        const voice = step.voices[v];
        if (!voice) return { pat: PAT_STOP, trans: 0xFFFF };
        if (voice.isStop) return { pat: PAT_STOP, trans: 0xFFFF };
        if (voice.isHold) return { pat: PAT_HOLD, trans: 0xFFFF };

        const absT = Math.abs(voice.transpose);
        const signBit = voice.transpose < 0 ? 0x100 : 0;
        return { pat: voice.patternNum, trans: signBit | absT };
      });

      // Per-voice columns with custom formatters that can reference effeTexts for voice 0
      const voiceCols: ColumnDef[] = v === 0 ? [{
        key: 'pat',
        label: `V${v}`,
        charWidth: 2,
        type: 'hex' as const,
        hexDigits: 2,
        color: '#e0a050',
        emptyColor: '#505050',
        emptyValue: undefined,
        formatter: (val: number) => {
          if (val === PAT_STOP) return '--';
          if (val === PAT_HOLD) return 'HD';
          if (val >= PAT_EFFE) return 'EF';
          return hex2(val);
        },
      }, {
        key: 'trans',
        label: 'Tr',
        charWidth: 3,
        type: 'hex' as const,
        hexDigits: 2,
        color: '#e0a050',
        emptyColor: '#505050',
        emptyValue: undefined,
        formatter: (val: number) => {
          if (val === 0xFFFF) return '...';
          const sign = (val & 0x100) ? '-' : '+';
          const abs = val & 0xFF;
          return `${sign}${hex2(abs)}`;
        },
      }] : [{
        key: 'pat',
        label: `V${v}`,
        charWidth: 2,
        type: 'hex' as const,
        hexDigits: 2,
        color: '#e0a050',
        emptyColor: '#505050',
        emptyValue: undefined,
        formatter: (val: number) => {
          if (val === PAT_STOP) return '--';
          if (val === PAT_HOLD) return 'HD';
          if (val >= PAT_EFFE) return '..';
          return hex2(val);
        },
      }, {
        key: 'trans',
        label: 'Tr',
        charWidth: 3,
        type: 'hex' as const,
        hexDigits: 2,
        color: '#e0a050',
        emptyColor: '#505050',
        emptyValue: undefined,
        formatter: (val: number) => {
          if (val === 0xFFFF) return '...';
          const sign = (val & 0x100) ? '-' : '+';
          const abs = val & 0xFF;
          return `${sign}${hex2(abs)}`;
        },
      }];

      channels.push({
        label: `Voice ${v}`,
        patternLength: steps.length,
        rows,
        columns: voiceCols,
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
      const abs = value & 0xFF;
      setTrackstepVoice(step.stepIndex, channelIdx, voice.patternNum, sign * abs);
    }
  }, [steps, setTrackstepVoice, onSelectPattern]);

  if (collapsed) {
    return (
      <div
        style={{ height: TFMX_MATRIX_COLLAPSED_HEIGHT, display: 'flex', alignItems: 'center', cursor: 'pointer', paddingLeft: 8, fontSize: 11, color: '#888', background: 'var(--color-bg-secondary)' }}
        onClick={onToggleCollapse}
      >
        TRACKSTEPS [click to expand]
      </div>
    );
  }

  return (
    <div style={{ width, height, position: 'relative' }}>
      {onToggleCollapse && (
        <div
          style={{ position: 'absolute', top: 0, right: 8, zIndex: 1, cursor: 'pointer', fontSize: 11, color: '#888', lineHeight: '20px' }}
          onClick={onToggleCollapse}
        >
          [collapse]
        </div>
      )}
      <PatternEditorCanvas
        formatColumns={formatColumns}
        formatChannels={formatChannels}
        formatCurrentRow={activeStep}
        formatIsPlaying={false}
        onFormatCellChange={handleCellChange}
        hideVUMeters={true}
      />
    </div>
  );
};
