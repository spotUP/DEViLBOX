/**
 * useEffectCellHover - hover tooltip for effect cells of the canvas-drawn pattern grid.
 *
 * The grid is a canvas, so there is no element to hover. The pointer position is resolved to a cell
 * by the grid's own hit test (getCellFromCoords), at most once per animation frame. The tooltip shows
 * after HOVER_DELAY_MS on the same effect cell and hides on leave, wheel, button press or scroll. State
 * that changes with the pointer lives in refs: React re-renders only when the tooltip appears or goes.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useHoverTooltip } from '@components/ui/HoverTooltip';
import { describeEffectSlot } from '@/utils/effectCellDescription';

export const HOVER_DELAY_MS = 400;

interface HoverHit { channelIndex: number; rowIndex: number; columnType: string; effectColumnIndex?: number }

export function useEffectCellHover(
  getCellFromCoords: (clientX: number, clientY: number) => HoverHit | null,
  getPatternCell: (channelIndex: number, rowIndex: number) => object | undefined,
) {
  const { showAt, hide, tooltip } = useHoverTooltip();
  const keyRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef({ x: 0, y: 0 });

  const cancel = useCallback(() => {
    if (timerRef.current !== null) { window.clearTimeout(timerRef.current); timerRef.current = null; }
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (keyRef.current !== null) { keyRef.current = null; hide(); }
  }, [hide]);

  const resolve = useCallback(() => {
    rafRef.current = null;
    const { x, y } = lastRef.current;
    const hit = getCellFromCoords(x, y);
    const isEffect = hit !== null && (hit.columnType === 'effTyp' || hit.columnType === 'effParam'
      || hit.columnType === 'effTyp2' || hit.columnType === 'effParam2');
    if (!hit || !isEffect) { cancel(); return; }
    const slot = hit.effectColumnIndex ?? 0;
    const key = `${hit.channelIndex}:${hit.rowIndex}:${slot}`;
    if (key === keyRef.current) return;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (keyRef.current !== null) hide();
    keyRef.current = key;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const d = describeEffectSlot(getPatternCell(hit.channelIndex, hit.rowIndex), slot);
      if (!d) return;
      const { x: px, y: py } = lastRef.current;
      showAt(`${d.command}  ${d.name}\n${d.meaning}\n${d.value}`, { left: px, width: 0, top: py - 12, bottom: py + 12 });
    }, HOVER_DELAY_MS);
  }, [getCellFromCoords, getPatternCell, cancel, hide, showAt]);

  /** Wire to the grid's pointer-move; ignored while a button is held (selection, scratch). */
  const onHoverMove = useCallback((e: { clientX: number; clientY: number; buttons: number }) => {
    if (e.buttons !== 0) { cancel(); return; }
    lastRef.current = { x: e.clientX, y: e.clientY };
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(resolve);
  }, [cancel, resolve]);

  useEffect(() => cancel, [cancel]);

  return { onHoverMove, onHoverEnd: cancel, tooltip };
}
