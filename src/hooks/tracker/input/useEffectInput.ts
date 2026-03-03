/**
 * useEffectInput - Effect type entry, effect parameter input, volume effects.
 * Handles instrument column, volume column (VOL1/VOL2), effect type/param,
 * effect2 type/param, flag columns, and probability column.
 */

import { useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTrackerStore, useCursorStore, useTransportStore } from '@stores';
import {
  HEX_DIGITS_ALL,
  VOL1_KEY_MAP,
  EFFECT_TYPE_KEY_MAP,
  type TrackerInputRefs,
} from './inputConstants';

export const useEffectInput = (refs: TrackerInputRefs) => {
  const { cursorRef } = refs;

  const {
    patterns,
    currentPatternIndex,
    recordMode,
    editStep,
  } = useTrackerStore(useShallow((state) => ({
    patterns: state.patterns,
    currentPatternIndex: state.currentPatternIndex,
    recordMode: state.recordMode,
    editStep: state.editStep,
  })));

  const setCell = useTrackerStore((state) => state.setCell);
  const moveCursorToRow = useCursorStore((state) => state.moveCursorToRow);

  const isPlaying = useTransportStore((state) => state.isPlaying);

  const pattern = patterns[currentPatternIndex];

  // Advance cursor by editStep (shared helper)
  const advanceByEditStep = useCallback(() => {
    if (editStep > 0 && !isPlaying) {
      moveCursorToRow((cursorRef.current.rowIndex + editStep) % pattern.length);
    }
  }, [editStep, isPlaying, moveCursorToRow, cursorRef, pattern]);

  // Handle effect/data entry keydown events. Returns true if handled.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent): boolean => {
      if (!recordMode) return false;

      const key = e.key;
      const keyLower = key.toLowerCase();
      if (e.altKey || e.ctrlKey || e.metaKey) return false;

      const currentCell = pattern.channels[cursorRef.current.channelIndex].rows[cursorRef.current.rowIndex];

      // ---------- INSTRUMENT COLUMN (hex digits only) ----------
      if (cursorRef.current.columnType === 'instrument' && HEX_DIGITS_ALL.includes(key)) {
        e.preventDefault();
        const hexDigit = parseInt(key, 16);
        const currentValue = currentCell.instrument || 0;

        let newValue: number;
        if (cursorRef.current.digitIndex === 0) {
          newValue = (hexDigit << 4) | (currentValue & 0x0F);
        } else {
          newValue = (currentValue & 0xF0) | hexDigit;
        }

        if (newValue > 128) newValue = 128;
        setCell(cursorRef.current.channelIndex, cursorRef.current.rowIndex, { instrument: newValue });
        advanceByEditStep();
        return true;
      }

      // ---------- VOLUME COLUMN (FT2 VOL1 special keys + VOL2 hex) ----------
      if (cursorRef.current.columnType === 'volume') {
        const currentValue = currentCell.volume || 0;

        if (cursorRef.current.digitIndex === 0) {
          const vol1Key = VOL1_KEY_MAP[keyLower];
          if (vol1Key !== undefined) {
            e.preventDefault();
            let newValue = (vol1Key << 4) | (currentValue & 0x0F);
            if (newValue >= 0x51 && newValue <= 0x5F) newValue = 0x50;
            setCell(cursorRef.current.channelIndex, cursorRef.current.rowIndex, { volume: newValue });
            advanceByEditStep();
            return true;
          }
        } else {
          if (HEX_DIGITS_ALL.includes(key)) {
            e.preventDefault();
            const hexDigit = parseInt(key, 16);
            let newValue: number;

            if (currentValue < 0x10) {
              newValue = 0x10 + hexDigit;
            } else {
              newValue = (currentValue & 0xF0) | hexDigit;
            }

            if (newValue >= 0x51 && newValue <= 0x5F) newValue = 0x50;
            setCell(cursorRef.current.channelIndex, cursorRef.current.rowIndex, { volume: newValue });
            advanceByEditStep();
            return true;
          }
        }
      }

      // ---------- EFFECT TYPE (EFX0): FT2 effect command keys (0-9, A-Z) ----------
      if (cursorRef.current.columnType === 'effTyp') {
        const effKey = EFFECT_TYPE_KEY_MAP[keyLower];
        if (effKey !== undefined) {
          e.preventDefault();
          const effChar = effKey < 10 ? effKey.toString() : String.fromCharCode(55 + effKey);
          const effParam = currentCell.eff || 0;
          const effectString = effChar + effParam.toString(16).padStart(2, '0').toUpperCase();
          setCell(cursorRef.current.channelIndex, cursorRef.current.rowIndex, {
            effTyp: effKey,
            effect: effectString
          });
          advanceByEditStep();
          return true;
        }
      }

      // ---------- EFFECT PARAMETER (EFX1/EFX2): Hex digits only ----------
      if (cursorRef.current.columnType === 'effParam' && HEX_DIGITS_ALL.includes(key)) {
        e.preventDefault();
        const hexDigit = parseInt(key, 16);
        const currentValue = currentCell.eff || 0;

        let newValue: number;
        if (cursorRef.current.digitIndex === 0) {
          newValue = (hexDigit << 4) | (currentValue & 0x0F);
        } else {
          newValue = (currentValue & 0xF0) | hexDigit;
        }

        const effTyp = currentCell.effTyp || 0;
        const effChar = effTyp < 10 ? effTyp.toString() : String.fromCharCode(55 + effTyp);
        const effectString = effChar + newValue.toString(16).padStart(2, '0').toUpperCase();

        setCell(cursorRef.current.channelIndex, cursorRef.current.rowIndex, {
          eff: newValue,
          effect: effectString
        });
        advanceByEditStep();
        return true;
      }

      // ---------- EFFECT2 TYPE (EFX2_0): FT2 effect command keys (0-9, A-Z) ----------
      if (cursorRef.current.columnType === 'effTyp2') {
        const effKey = EFFECT_TYPE_KEY_MAP[keyLower];
        if (effKey !== undefined) {
          e.preventDefault();
          const effChar = effKey < 10 ? effKey.toString() : String.fromCharCode(55 + effKey);
          const effParam = currentCell.eff2 || 0;
          const effectString = effChar + effParam.toString(16).padStart(2, '0').toUpperCase();
          setCell(cursorRef.current.channelIndex, cursorRef.current.rowIndex, {
            effTyp2: effKey,
            effect2: effectString
          });
          advanceByEditStep();
          return true;
        }
      }

      // ---------- FLAG COLUMNS: 'A' for accent, 'S' for slide, 'M' for mute, 'H' for hammer, '0'/'.' to clear ----------
      if (cursorRef.current.columnType === 'flag1' || cursorRef.current.columnType === 'flag2') {
        const flagField = cursorRef.current.columnType;

        if (keyLower === 'a') {
          e.preventDefault();
          setCell(cursorRef.current.channelIndex, cursorRef.current.rowIndex, { [flagField]: 1 });
          advanceByEditStep();
          return true;
        }
        if (keyLower === 's') {
          e.preventDefault();
          setCell(cursorRef.current.channelIndex, cursorRef.current.rowIndex, { [flagField]: 2 });
          advanceByEditStep();
          return true;
        }
        if (keyLower === 'm') {
          e.preventDefault();
          setCell(cursorRef.current.channelIndex, cursorRef.current.rowIndex, { [flagField]: 3 });
          advanceByEditStep();
          return true;
        }
        if (keyLower === 'h') {
          e.preventDefault();
          setCell(cursorRef.current.channelIndex, cursorRef.current.rowIndex, { [flagField]: 4 });
          advanceByEditStep();
          return true;
        }
        if (key === '0' || key === '.') {
          e.preventDefault();
          setCell(cursorRef.current.channelIndex, cursorRef.current.rowIndex, { [flagField]: 0 });
          advanceByEditStep();
          return true;
        }
      }

      // ---------- EFFECT2 PARAMETER (EFX2_1/EFX2_2): Hex digits only ----------
      if (cursorRef.current.columnType === 'effParam2' && HEX_DIGITS_ALL.includes(key)) {
        e.preventDefault();
        const hexDigit = parseInt(key, 16);
        const currentValue = currentCell.eff2 || 0;

        let newValue: number;
        if (cursorRef.current.digitIndex === 0) {
          newValue = (hexDigit << 4) | (currentValue & 0x0F);
        } else {
          newValue = (currentValue & 0xF0) | hexDigit;
        }

        const effTyp2 = currentCell.effTyp2 || 0;
        const effChar = effTyp2 < 10 ? effTyp2.toString() : String.fromCharCode(55 + effTyp2);
        const effectString = effChar + newValue.toString(16).padStart(2, '0').toUpperCase();

        setCell(cursorRef.current.channelIndex, cursorRef.current.rowIndex, {
          eff2: newValue,
          effect2: effectString
        });
        advanceByEditStep();
        return true;
      }

      // ---------- PROBABILITY COLUMN: Decimal digits 0-9 (percentage 0-99) ----------
      if (cursorRef.current.columnType === 'probability' && /^[0-9]$/.test(key)) {
        e.preventDefault();
        const digit = parseInt(key, 10);
        const currentValue = currentCell.probability || 0;

        let newValue: number;
        if (cursorRef.current.digitIndex === 0) {
          newValue = (digit * 10) + (currentValue % 10);
        } else {
          newValue = (Math.floor(currentValue / 10) * 10) + digit;
        }

        newValue = Math.min(99, Math.max(0, newValue));

        setCell(cursorRef.current.channelIndex, cursorRef.current.rowIndex, { probability: newValue });
        advanceByEditStep();
        return true;
      }

      return false;
    },
    [recordMode, pattern, setCell, advanceByEditStep, cursorRef]
  );

  return useMemo(() => ({ handleKeyDown }), [handleKeyDown]);
};
