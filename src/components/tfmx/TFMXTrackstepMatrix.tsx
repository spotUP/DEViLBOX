/**
 * TFMXTrackstepMatrix — Canvas-based trackstep matrix editor with keyboard editing.
 *
 * Displays the TFMX trackstep table: which patterns are assigned to which
 * voices per song step, with EFFE control commands as full-width rows.
 *
 * Keyboard editing follows the HivelyPositionEditor pattern:
 *   Arrow keys: navigate rows/digits, Tab: next voice
 *   Hex digits: edit pattern number or transpose
 *   +/-: toggle transpose sign
 *   Insert/Ctrl+Backspace: insert/delete trackstep
 */

import React, { useCallback, useState } from 'react';
import {
  SequenceMatrixEditor,
  MATRIX_CHAR_W, MATRIX_ROW_H, MATRIX_HEADER_H,
  MATRIX_HEIGHT, MATRIX_COLLAPSED_HEIGHT,
  type MatrixRenderContext,
} from '@/components/shared/SequenceMatrixEditor';
import { useFormatStore } from '@stores';
import type { TFMXNativeData, TFMXTrackstepEntry } from '@/types/tfmxNative';
import { effeCommandToString } from './tfmxAdapter';

export { MATRIX_HEIGHT as TFMX_MATRIX_HEIGHT, MATRIX_COLLAPSED_HEIGHT as TFMX_MATRIX_COLLAPSED_HEIGHT };

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

const STEP_COL_W = 4 * MATRIX_CHAR_W;
const VOICE_COL_W = 8 * MATRIX_CHAR_W;

// Digit columns per voice: pat_hi(0), pat_lo(1), sign(2), trans_hi(3), trans_lo(4)
const DIGIT_COLS = 5;
const HEX = '0123456789abcdef';

function hex2(v: number): string {
  return v.toString(16).toUpperCase().padStart(2, '0');
}

/** Character offset within voice column for each digit position */
function digitCharX(d: number): number {
  // "PP:+TT" → P=chars 0,1  :=2  +=3  T=chars 4,5
  if (d <= 1) return d + 1; // skip "P" prefix
  if (d === 2) return 3;    // sign
  return d + 1;             // transpose digits at 4,5
}

function renderStep(
  ctx: CanvasRenderingContext2D, step: TFMXTrackstepEntry,
  y: number, isActive: boolean, selectedPat: number, width: number,
) {
  const x0 = STEP_COL_W;

  ctx.fillStyle = '#808080';
  ctx.fillText(hex2(step.stepIndex), 4, y);

  if (step.isEFFE) {
    ctx.fillStyle = isActive ? 'rgba(180, 80, 40, 0.3)' : 'rgba(120, 60, 30, 0.2)';
    ctx.fillRect(x0 - 2, y - 12, width - x0, MATRIX_ROW_H);
    ctx.fillStyle = '#e08040';
    ctx.fillText(`EFFE: ${effeCommandToString(step.effeCommand ?? 0, step.effeParam ?? 0)}`, x0, y);
    return;
  }

  for (let v = 0; v < step.voices.length; v++) {
    const voice = step.voices[v];
    const vx = x0 + v * VOICE_COL_W;

    if (voice.isStop) {
      ctx.fillStyle = '#505050';
      ctx.fillText('  ---  ', vx, y);
    } else if (voice.isHold) {
      ctx.fillStyle = '#707050';
      ctx.fillText(' HOLD  ', vx, y);
    } else {
      const isSelected = voice.patternNum === selectedPat;
      const trans = voice.transpose;
      const sign = trans >= 0 ? '+' : '-';
      ctx.fillStyle = isSelected ? '#ffd060' : '#e0a050';
      ctx.fillText(`P${voice.patternNum.toString().padStart(2, '0')}:${sign}${hex2(Math.abs(trans))}`, vx, y);
    }
  }
}

export const TFMXTrackstepMatrix: React.FC<TFMXTrackstepMatrixProps> = ({
  width, height, native, activeStep, selectedPattern,
  onSelectPattern, onStepChange, collapsed, onToggleCollapse,
}) => {
  const steps = native.tracksteps;
  const numVoices = native.numVoices;
  const setTrackstepVoice = useFormatStore(s => s.setTFMXTrackstepVoice);
  const insertTrackstep = useFormatStore(s => s.insertTFMXTrackstep);
  const deleteTrackstep = useFormatStore(s => s.deleteTFMXTrackstep);

  const [curVoice, setCurVoice] = useState(0);
  const [curDigit, setCurDigit] = useState(0);

  const onRender = useCallback((rc: MatrixRenderContext) => {
    const { ctx, width: w, theme, visibleRows, scrollOffset } = rc;

    // Header
    ctx.fillStyle = theme.bgHighlight;
    ctx.fillRect(0, 0, w, MATRIX_HEADER_H);
    ctx.font = '12px "JetBrains Mono", "Fira Code", monospace';
    ctx.fillStyle = '#808080';
    ctx.fillText('Step', 4, 16);
    const x0 = STEP_COL_W;
    for (let v = 0; v < numVoices; v++) {
      ctx.fillText(`Voice ${v}`, x0 + v * VOICE_COL_W, 16);
    }

    // Rows
    ctx.font = '13px "JetBrains Mono", "Fira Code", monospace';
    for (let i = 0; i < visibleRows; i++) {
      const dataIdx = scrollOffset + i;
      if (dataIdx >= steps.length) break;

      const step = steps[dataIdx];
      const y = MATRIX_HEADER_H + i * MATRIX_ROW_H + 14;
      const isActive = dataIdx === activeStep;

      // Row background
      ctx.fillStyle = isActive ? theme.bgCurrent : (i % 2 === 0 ? theme.bgEven : theme.bgOdd);
      ctx.fillRect(0, MATRIX_HEADER_H + i * MATRIX_ROW_H, w, MATRIX_ROW_H);

      if (isActive) {
        ctx.fillStyle = theme.accent + '33';
        ctx.fillRect(0, MATRIX_HEADER_H + i * MATRIX_ROW_H, w, MATRIX_ROW_H);
      }

      // Cursor highlight on active row's current voice/digit
      if (isActive && !step.isEFFE) {
        const cx = x0 + curVoice * VOICE_COL_W + digitCharX(curDigit) * MATRIX_CHAR_W;
        ctx.fillStyle = '#ffff8844';
        ctx.fillRect(cx, MATRIX_HEADER_H + i * MATRIX_ROW_H, MATRIX_CHAR_W, MATRIX_ROW_H);
      }

      renderStep(ctx, step, y, isActive, selectedPattern, w);
    }
  }, [steps, activeStep, selectedPattern, numVoices, curVoice, curDigit]);

  const onClick = useCallback((x: number, y: number, rc: MatrixRenderContext) => {
    const row = Math.floor((y - MATRIX_HEADER_H) / MATRIX_ROW_H);
    const dataIdx = rc.scrollOffset + row;
    if (dataIdx < 0 || dataIdx >= steps.length) return;

    const step = steps[dataIdx];
    onStepChange?.(dataIdx);

    if (step.isEFFE) return;

    const vx = x - STEP_COL_W;
    if (vx < 0) return;

    const voiceIdx = Math.floor(vx / VOICE_COL_W);
    if (voiceIdx >= 0 && voiceIdx < numVoices) {
      setCurVoice(voiceIdx);
      // Determine digit from x position within voice column
      const rel = vx - voiceIdx * VOICE_COL_W;
      const charIdx = Math.floor(rel / MATRIX_CHAR_W);
      if (charIdx <= 2) setCurDigit(Math.min(1, charIdx));
      else if (charIdx === 3) setCurDigit(2);
      else setCurDigit(charIdx <= 4 ? 3 : 4);

      const voice = step.voices[voiceIdx];
      if (voice && voice.patternNum >= 0) {
        onSelectPattern(voice.patternNum);
      }
    }
  }, [steps, numVoices, onSelectPattern, onStepChange]);

  const onKeyDown = useCallback((e: React.KeyboardEvent, _rc: MatrixRenderContext): boolean => {
    const { key } = e;

    // Navigation
    if (key === 'ArrowUp') {
      const prev = Math.max(0, activeStep - 1);
      onStepChange?.(prev);
      return true;
    }
    if (key === 'ArrowDown') {
      const next = Math.min(steps.length - 1, activeStep + 1);
      onStepChange?.(next);
      return true;
    }
    if (key === 'ArrowRight') {
      const nd = curDigit + 1;
      if (nd < DIGIT_COLS) setCurDigit(nd);
      else if (curVoice < numVoices - 1) { setCurVoice(v => v + 1); setCurDigit(0); }
      return true;
    }
    if (key === 'ArrowLeft') {
      const pd = curDigit - 1;
      if (pd >= 0) setCurDigit(pd);
      else if (curVoice > 0) { setCurVoice(v => v - 1); setCurDigit(DIGIT_COLS - 1); }
      return true;
    }
    if (key === 'Tab') {
      if (e.shiftKey) {
        if (curVoice > 0) { setCurVoice(v => v - 1); setCurDigit(0); }
      } else {
        if (curVoice < numVoices - 1) { setCurVoice(v => v + 1); setCurDigit(0); }
      }
      return true;
    }

    // Insert/Delete trackstep
    if (key === 'Insert') { insertTrackstep(activeStep); return true; }
    if (e.ctrlKey && key === 'Backspace') { deleteTrackstep(activeStep); return true; }

    // Get current step
    const step = steps[activeStep];
    if (!step || step.isEFFE) return false;
    const voice = step.voices[curVoice];
    if (!voice) return false;

    // Sign toggle on sign column
    if (curDigit === 2) {
      if (key === '+' || key === '=' || key === '-') {
        const cur = voice.transpose;
        const newTrans = key === '-' ? -Math.abs(cur || 1) : Math.abs(cur);
        setTrackstepVoice(step.stepIndex, curVoice, voice.patternNum, newTrans);
        return true;
      }
    }

    // Hex digit entry
    const hexIdx = HEX.indexOf(key.toLowerCase());
    if (hexIdx < 0) return false;

    if (curDigit === 0 || curDigit === 1) {
      // Edit pattern number
      const cur = voice.patternNum >= 0 ? voice.patternNum : 0;
      const newVal = curDigit === 0
        ? (hexIdx << 4) | (cur & 0x0F)
        : (cur & 0xF0) | hexIdx;
      setTrackstepVoice(step.stepIndex, curVoice, newVal, voice.transpose);
      // Auto-select the edited pattern in the pattern editor
      onSelectPattern(newVal);
    } else if (curDigit === 3 || curDigit === 4) {
      // Edit transpose
      const cur = voice.transpose;
      const sign = cur < 0 ? -1 : 1;
      const abs = Math.abs(cur);
      const ni = curDigit - 3;
      const newAbs = ni === 0
        ? (hexIdx << 4) | (abs & 0x0F)
        : (abs & 0xF0) | hexIdx;
      setTrackstepVoice(step.stepIndex, curVoice, voice.patternNum, sign * newAbs);
    }

    // Auto-advance cursor after typing (skip sign column)
    const nd = curDigit + 1;
    if (nd < DIGIT_COLS) {
      setCurDigit(nd === 2 ? 3 : nd);
    } else if (curVoice < numVoices - 1) {
      setCurVoice(v => v + 1);
      setCurDigit(0);
    }
    return true;
  }, [activeStep, steps, numVoices, curVoice, curDigit, setTrackstepVoice, insertTrackstep, deleteTrackstep, onStepChange, onSelectPattern]);

  return (
    <SequenceMatrixEditor
      label="TRACKSTEPS"
      width={width}
      height={height}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      totalRows={steps.length}
      activeRow={activeStep}
      onRender={onRender}
      onClick={onClick}
      onKeyDown={onKeyDown}
      renderDeps={[steps, activeStep, selectedPattern, curVoice, curDigit]}
    />
  );
};
