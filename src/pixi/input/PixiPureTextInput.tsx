/**
 * PixiPureTextInput — Pure Pixi text input. No DOM <input> element.
 * Handles keyboard capture, cursor, selection, copy/paste via Pixi events.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';

interface PixiPureTextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  onCancel?: () => void;
  placeholder?: string;
  width?: number;
  height?: number;
  fontSize?: number;
  font?: 'mono' | 'sans';
  /** Restrict to numeric input */
  numeric?: boolean;
  min?: number;
  max?: number;
  disabled?: boolean;
  layout?: Record<string, unknown>;
}

const PADDING_H = 6;
const CURSOR_WIDTH = 1;
const BLINK_MS = 530;

export const PixiPureTextInput: React.FC<PixiPureTextInputProps> = ({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder = '',
  width = 120,
  height = 24,
  fontSize = 12,
  font = 'mono',
  numeric = false,
  min,
  max,
  disabled = false,
  layout: layoutProp,
}) => {
  const theme = usePixiTheme();
  const [focused, setFocused] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);
  const [selStart, setSelStart] = useState(0);
  const [selEnd, setSelEnd] = useState(0);
  const [cursorVisible, setCursorVisible] = useState(true);

  const valueRef = useRef(value);
  const cursorPosRef = useRef(cursorPos);
  const selStartRef = useRef(selStart);
  const selEndRef = useRef(selEnd);
  const onChangeRef = useRef(onChange);
  const onSubmitRef = useRef(onSubmit);
  const onCancelRef = useRef(onCancel);

  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => { cursorPosRef.current = cursorPos; }, [cursorPos]);
  useEffect(() => { selStartRef.current = selStart; }, [selStart]);
  useEffect(() => { selEndRef.current = selEnd; }, [selEnd]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onSubmitRef.current = onSubmit; }, [onSubmit]);
  useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);

  // Cursor blink
  useEffect(() => {
    if (!focused) { setCursorVisible(true); return; }
    const id = setInterval(() => setCursorVisible(v => !v), BLINK_MS);
    return () => clearInterval(id);
  }, [focused]);

  // Click-outside to blur
  useEffect(() => {
    if (!focused) return;
    const handler = () => setFocused(false);
    document.addEventListener('pointerdown', handler, true);
    return () => document.removeEventListener('pointerdown', handler, true);
  }, [focused]);

  // Keyboard handler when focused
  useEffect(() => {
    if (!focused) return;

    const handler = (e: KeyboardEvent) => {
      e.stopPropagation();
      const v = valueRef.current;
      const pos = cursorPosRef.current;
      const ss = selStartRef.current;
      const se = selEndRef.current;
      const hasSelection = ss !== se;

      if (e.key === 'Enter') {
        e.preventDefault();
        onSubmitRef.current?.(v);
        setFocused(false);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancelRef.current?.();
        setFocused(false);
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) {
          setSelEnd(Math.max(0, pos - 1));
        } else {
          const target = hasSelection ? Math.min(ss, se) : Math.max(0, pos - 1);
          setCursorPos(target); setSelStart(target); setSelEnd(target);
        }
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) {
          setSelEnd(Math.min(v.length, pos + 1));
        } else {
          const target = hasSelection ? Math.max(ss, se) : Math.min(v.length, pos + 1);
          setCursorPos(target); setSelStart(target); setSelEnd(target);
        }
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        setCursorPos(0); setSelStart(0); setSelEnd(0);
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        setCursorPos(v.length); setSelStart(v.length); setSelEnd(v.length);
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        let newVal: string;
        let newPos: number;
        if (hasSelection) {
          const lo = Math.min(ss, se), hi = Math.max(ss, se);
          newVal = v.slice(0, lo) + v.slice(hi);
          newPos = lo;
        } else if (pos > 0) {
          newVal = v.slice(0, pos - 1) + v.slice(pos);
          newPos = pos - 1;
        } else return;
        onChangeRef.current(newVal);
        setCursorPos(newPos); setSelStart(newPos); setSelEnd(newPos);
        return;
      }
      if (e.key === 'Delete') {
        e.preventDefault();
        let newVal: string;
        let newPos: number;
        if (hasSelection) {
          const lo = Math.min(ss, se), hi = Math.max(ss, se);
          newVal = v.slice(0, lo) + v.slice(hi);
          newPos = lo;
        } else if (pos < v.length) {
          newVal = v.slice(0, pos) + v.slice(pos + 1);
          newPos = pos;
        } else return;
        onChangeRef.current(newVal);
        setCursorPos(newPos); setSelStart(newPos); setSelEnd(newPos);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        setSelStart(0); setSelEnd(v.length); setCursorPos(v.length);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        if (hasSelection) {
          const lo = Math.min(ss, se), hi = Math.max(ss, se);
          navigator.clipboard.writeText(v.slice(lo, hi)).catch(() => {});
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
        navigator.clipboard.readText().then(pasted => {
          const cv = valueRef.current;
          const css = selStartRef.current;
          const cse = selEndRef.current;
          const lo = Math.min(css, cse), hi = Math.max(css, cse);
          const newVal = cv.slice(0, lo) + pasted + cv.slice(hi);
          const newPos = lo + pasted.length;
          onChangeRef.current(newVal);
          setCursorPos(newPos); setSelStart(newPos); setSelEnd(newPos);
        }).catch(() => {});
        return;
      }
      // Printable character
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const lo = hasSelection ? Math.min(ss, se) : pos;
        const hi = hasSelection ? Math.max(ss, se) : pos;
        const inserted = e.key;
        if (numeric) {
          if (!/^[\d.\-]$/.test(inserted)) return;
        }
        const newVal = v.slice(0, lo) + inserted + v.slice(hi);
        const newPos = lo + inserted.length;
        if (numeric && min !== undefined && max !== undefined) {
          const num = parseFloat(newVal);
          if (!isNaN(num) && (num < min || num > max)) return;
        }
        onChangeRef.current(newVal);
        setCursorPos(newPos); setSelStart(newPos); setSelEnd(newPos);
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [focused, numeric, min, max]);

  const charWidth = fontSize * (font === 'mono' ? 0.6 : 0.55);

  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    if (disabled) return;
    e.stopPropagation();
    setFocused(true);
    const localX = (e.globalX as number) - PADDING_H;
    const clickPos = Math.max(0, Math.min(value.length, Math.round(localX / charWidth)));
    setCursorPos(clickPos); setSelStart(clickPos); setSelEnd(clickPos);
    setCursorVisible(true);
  }, [disabled, value.length, charWidth]);

  const displayText = value || (focused ? '' : placeholder);
  const isPlaceholder = !value && !focused;

  const cursorX = PADDING_H + cursorPos * charWidth;
  const selLo = Math.min(selStart, selEnd);
  const selHi = Math.max(selStart, selEnd);
  const selX = PADDING_H + selLo * charWidth;
  const selW = (selHi - selLo) * charWidth;
  const hasSelection = selStart !== selEnd;

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.roundRect(0, 0, width, height, 3);
    g.fill({ color: focused ? theme.bg.color : theme.bgSecondary.color });
    g.roundRect(0, 0, width, height, 3);
    g.stroke({
      color: focused ? theme.accent.color : theme.border.color,
      alpha: focused ? 0.8 : 0.6,
      width: focused ? 1.5 : 1,
    });
  }, [width, height, theme, focused]);

  const drawSelection = useCallback((g: GraphicsType) => {
    g.clear();
    if (!hasSelection) return;
    g.rect(selX, 2, selW, height - 4);
    g.fill({ color: theme.accent.color, alpha: 0.3 });
  }, [selX, selW, height, hasSelection, theme]);

  const drawCursor = useCallback((g: GraphicsType) => {
    g.clear();
    if (!focused || !cursorVisible || hasSelection) return;
    g.rect(cursorX, 3, CURSOR_WIDTH, height - 6);
    g.fill({ color: theme.accent.color });
  }, [focused, cursorVisible, cursorX, height, hasSelection, theme]);

  const fontFamily = font === 'mono' ? PIXI_FONTS.MONO : PIXI_FONTS.SANS;

  return (
    <pixiContainer
      eventMode={disabled ? 'none' : 'static'}
      cursor={disabled ? 'default' : 'text'}
      onPointerDown={handlePointerDown}
      alpha={disabled ? 0.4 : 1}
      layout={{ width, height, ...layoutProp }}
    >
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height }} />
      <pixiGraphics draw={drawSelection} layout={{ position: 'absolute', width, height }} />
      <pixiBitmapText
        text={displayText}
        style={{ fontFamily, fontSize, fill: 0xffffff }}
        tint={isPlaceholder ? theme.textMuted.color : theme.text.color}
        alpha={isPlaceholder ? 0.5 : 1}
        layout={{ position: 'absolute', left: PADDING_H, top: (height - fontSize) / 2 }}
      />
      <pixiGraphics draw={drawCursor} layout={{ position: 'absolute', width, height }} />
    </pixiContainer>
  );
};
