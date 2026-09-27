/**
 * The GLOBAL lane edits like a channel lane; the DUB lane is gone.
 *
 * MasterDubLane was a 48 px column drawn on top of the GLOBAL lane - same
 * x, same channelIndex -1 curves - holding AutomationLane, a wide
 * single-parameter editor: its label read "Mas", and opening it crammed the
 * whole editor into the column ("the Mas menu draws in the wrong location /
 * it looks broken when i click it", 2026-09-28). Owner's choice: one lane,
 * editable. The GLOBAL lane also drew at the overlay's top, which starts
 * the previous pattern's ghost rows above row 0.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { useAutomationStore } from '@stores';
import { GlobalLaneCurves } from '../GlobalLaneCurves';

const ROW_H = 10;

beforeEach(() => {
  useAutomationStore.setState({ curves: [] } as never);
});
afterEach(cleanup);

function seedGlobalCurve() {
  const id = useAutomationStore.getState().addCurve('p1', -1, 'dub.echoIntensity');
  useAutomationStore.getState().addPoint(id, 0, 1);
  return id;
}

describe('the GLOBAL lane', () => {
  it('writes a point where it is pressed, like a channel lane', () => {
    const id = seedGlobalCurve();
    const { container } = render(
      <GlobalLaneCurves patternId="p1" patternLength={16} rowHeight={ROW_H} laneLeft={40} laneWidth={48} topOffset={0} />,
    );
    const lane = container.querySelector('[data-global-lane]') as HTMLDivElement;
    lane.getBoundingClientRect = () => ({ left: 40, top: 100, right: 88, bottom: 260, width: 48, height: 160, x: 40, y: 100, toJSON: () => ({}) });
    const slice = container.querySelector('[data-global-lane-curve="dub.echoIntensity"]') as HTMLDivElement;
    // Row 5, half-way across the slice (x = lane left + 1 + half of 46).
    fireEvent.pointerDown(slice, { button: 0, clientX: 40 + 1 + 23, clientY: 100 + 5 * ROW_H + 2 });
    const curve = useAutomationStore.getState().curves.find((c) => c.id === id)!;
    const p = curve.points.find((pt) => pt.row === 5);
    expect(p).toBeDefined();
    expect(p!.value).toBeCloseTo(0.5, 1);
  });

  it('sits on the pattern\'s row 0, below the previous pattern\'s ghost rows', () => {
    seedGlobalCurve();
    const { container } = render(
      <GlobalLaneCurves patternId="p1" patternLength={16} rowHeight={ROW_H} laneLeft={40} laneWidth={48} topOffset={64 * ROW_H} />,
    );
    expect((container.querySelector('[data-global-lane]') as HTMLDivElement).style.top).toBe(`${64 * ROW_H}px`);
  });

  it('is the only global column: no DUB lane, and the channels\' parameter picker adds global parameters', () => {
    const root = resolve(__dirname, '..');
    expect(existsSync(resolve(root, 'MasterDubLane.tsx'))).toBe(false);
    const canvas = readFileSync(resolve(root, 'PatternEditorCanvas.tsx'), 'utf8');
    expect(canvas).not.toMatch(/MasterDubLane|masterDubLane/);
    // One header component for both header rows, holding the channels' picker for -1.
    expect(canvas.match(/<GlobalLaneHeader /g)?.length).toBe(2);
    expect(canvas).not.toContain('⬢ GLOBAL');
    const header = readFileSync(resolve(root, 'GlobalLaneHeader.tsx'), 'utf8');
    expect(header).toMatch(/<AutomationParameterPicker inline channelIndex=\{-1\}/);
    expect(canvas).toMatch(/topOffset=\{prevLen \* rowHeight\}/);
  });
});
