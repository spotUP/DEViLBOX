/**
 * PixiEnvelopeEditor — GL-native ADSR envelope editor with draggable handles.
 * Renders an ADSR curve as a polyline with circular drag handles at each segment
 * boundary. All values are 0-1 normalized. Drag interaction uses PixiJS stage events,
 * consistent with PixiKnob and PixiSlider patterns.
 */

import { useCallback, useRef, useEffect } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent, Container as ContainerType } from 'pixi.js';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme } from '../../theme';

export interface PixiEnvelopeEditorProps {
  attack: number;   // 0-1
  decay: number;    // 0-1
  sustain: number;  // 0-1
  release: number;  // 0-1
  onChange: (param: 'attack' | 'decay' | 'sustain' | 'release', value: number) => void;
  width: number;
  height?: number; // default 120
}

// Handle radius for drag targets
const HANDLE_R = 5;
// Padding inside the editor so handles aren't clipped
const PAD_X = 8;
const PAD_TOP = 6;
const PAD_BOT = 18; // space for A/D/S/R labels below the graph

/**
 * Compute the five polyline points (in editor-local pixel coordinates) for
 * an ADSR curve given normalized [0-1] parameter values and the drawing area.
 *
 * Layout: split width into 4 equal columns [A][D][S][R].
 *  - Point 0: curve start (origin — zero amplitude, time 0)
 *  - Point 1: attack peak — handle A
 *  - Point 2: decay end / sustain level — handle D
 *  - Point 3: sustain right edge — handle S
 *  - Point 4: release end — handle R
 */
function computePoints(
  attack: number,
  decay: number,
  sustain: number,
  release: number,
  w: number,
  h: number,
): { x: number; y: number }[] {
  const graphW = w - PAD_X * 2;
  const graphH = h - PAD_TOP - PAD_BOT;
  const colW = graphW / 4;

  const top = PAD_TOP;
  const bottom = PAD_TOP + graphH;
  const sustainY = top + (1 - sustain) * graphH;

  return [
    { x: PAD_X, y: bottom },
    { x: PAD_X + attack * colW, y: top },
    { x: PAD_X + colW + decay * colW, y: sustainY },
    { x: PAD_X + colW * 2 + colW, y: sustainY },
    { x: PAD_X + colW * 3 + release * colW, y: bottom },
  ];
}

type EnvParam = 'attack' | 'decay' | 'sustain' | 'release';

// Stage shape used for event delegation (mirrors PixiKnob/PixiSlider pattern)
interface PixiStage {
  on: (event: string, handler: (e: FederatedPointerEvent) => void) => void;
  off: (event: string, handler: (e: FederatedPointerEvent) => void) => void;
}

/**
 * Individual drag handle. Renders a circle + label below it.
 * Pointer-down starts a drag via PixiJS stage event delegation.
 */
interface HandleProps {
  cx: number;
  cy: number;
  label: string;
  accent: number;
  textMuted: number;
  onDragStart: (e: FederatedPointerEvent) => void;
}

const EnvelopeHandle: React.FC<HandleProps> = ({ cx, cy, label, accent, textMuted, onDragStart }) => {
  const drawHandle = useCallback((g: GraphicsType) => {
    g.clear();
    g.circle(0, 0, HANDLE_R);
    g.fill({ color: accent });
    g.circle(0, 0, HANDLE_R);
    g.stroke({ color: 0xffffff, alpha: 0.3, width: 1 });
  }, [accent]);

  return (
    <pixiContainer
      eventMode="static"
      cursor="pointer"
      onPointerDown={onDragStart}
      layout={{
        position: 'absolute',
        left: cx - HANDLE_R,
        top: cy - HANDLE_R,
        width: HANDLE_R * 2,
        height: HANDLE_R * 2,
      }}
    >
      <pixiGraphics
        draw={drawHandle}
        layout={{ position: 'absolute', left: HANDLE_R, top: HANDLE_R }}
      />
      <pixiBitmapText
        text={label}
        style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 9, fill: 0xffffff }}
        tint={textMuted}
        layout={{
          position: 'absolute',
          left: -3,
          top: HANDLE_R + 2,
        }}
      />
    </pixiContainer>
  );
};

export const PixiEnvelopeEditor: React.FC<PixiEnvelopeEditorProps> = ({
  attack,
  decay,
  sustain,
  release,
  onChange,
  width,
  height = 120,
}) => {
  const theme = usePixiTheme();

  // Keep latest props in refs to avoid stale closures during drag
  const paramsRef = useRef({ attack, decay, sustain, release });
  useEffect(() => {
    paramsRef.current = { attack, decay, sustain, release };
  }, [attack, decay, sustain, release]);

  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const containerRef = useRef<ContainerType>(null);

  // Draw background, border, and ADSR polyline curve.
  // Reads from paramsRef rather than the prop values directly so that
  // the dependency array does not need to include individual params
  // (this avoids unnecessary redraws when the ref is updated by the
  // parent but the graphics component hasn't re-rendered yet).
  const drawCurve = useCallback((g: GraphicsType) => {
    g.clear();

    // Background
    g.rect(0, 0, width, height);
    g.fill({ color: theme.bgSecondary.color });

    // Border
    g.rect(0, 0, width, height);
    g.stroke({ color: theme.border.color, alpha: theme.border.alpha, width: 1 });

    const pts = computePoints(
      paramsRef.current.attack,
      paramsRef.current.decay,
      paramsRef.current.sustain,
      paramsRef.current.release,
      width,
      height,
    );

    // Semi-transparent fill under the curve
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      g.lineTo(pts[i].x, pts[i].y);
    }
    g.lineTo(pts[0].x, pts[0].y);
    g.fill({ color: theme.accent.color, alpha: 0.08 });

    // Curve line
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      g.lineTo(pts[i].x, pts[i].y);
    }
    g.stroke({ color: theme.text.color, alpha: 0.8, width: 1.5, cap: 'round', join: 'round' });

    // Time axis
    const axisY = height - PAD_BOT;
    g.moveTo(PAD_X, axisY);
    g.lineTo(width - PAD_X, axisY);
    g.stroke({ color: theme.border.color, alpha: 0.3, width: 1 });
  }, [width, height, theme]);

  // Compute handle positions from props (not ref) so JSX is correct
  const pts = computePoints(attack, decay, sustain, release, width, height);
  const handleA = pts[1];
  const handleD = pts[2];
  const handleS = pts[3];
  const handleR = pts[4];

  // Build per-parameter drag handlers inline (satisfies react-hooks/use-memo rule)
  const makeHandler = useCallback((param: EnvParam) => (e: FederatedPointerEvent) => {
    e.stopPropagation();

    const graphW = width - PAD_X * 2;
    const colW = graphW / 4;
    const graphH = height - PAD_TOP - PAD_BOT;

    const startX = e.globalX;
    const startY = e.globalY;
    const startValue = paramsRef.current[param];

    const stage = (containerRef.current as unknown as { stage?: PixiStage })?.stage;
    if (!stage) return;

    const onMove = (ev: FederatedPointerEvent) => {
      let newValue: number;
      if (param === 'sustain') {
        const deltaNorm = (startY - ev.globalY) / graphH;
        newValue = Math.max(0, Math.min(1, startValue + deltaNorm));
      } else {
        const deltaNorm = (ev.globalX - startX) / colW;
        newValue = Math.max(0, Math.min(1, startValue + deltaNorm));
      }
      onChangeRef.current(param, newValue);
    };

    const onUp = () => {
      stage.off('pointermove', onMove);
      stage.off('pointerup', onUp);
      stage.off('pointerupoutside', onUp);
    };

    stage.on('pointermove', onMove);
    stage.on('pointerup', onUp);
    stage.on('pointerupoutside', onUp);
  }, [width, height]);

  const handleADrag = useCallback((e: FederatedPointerEvent) => makeHandler('attack')(e), [makeHandler]);
  const handleDDrag = useCallback((e: FederatedPointerEvent) => makeHandler('decay')(e), [makeHandler]);
  const handleSDrag = useCallback((e: FederatedPointerEvent) => makeHandler('sustain')(e), [makeHandler]);
  const handleRDrag = useCallback((e: FederatedPointerEvent) => makeHandler('release')(e), [makeHandler]);

  return (
    <pixiContainer
      ref={containerRef}
      layout={{
        width,
        height,
        position: 'relative',
      }}
    >
      {/* Background + curve */}
      <pixiGraphics
        draw={drawCurve}
        layout={{ position: 'absolute', left: 0, top: 0, width, height }}
      />

      {/* Drag handles at A, D, S, R positions */}
      <EnvelopeHandle
        cx={handleA.x}
        cy={handleA.y}
        label="A"
        accent={theme.accent.color}
        textMuted={theme.textMuted.color}
        onDragStart={handleADrag}
      />
      <EnvelopeHandle
        cx={handleD.x}
        cy={handleD.y}
        label="D"
        accent={theme.accent.color}
        textMuted={theme.textMuted.color}
        onDragStart={handleDDrag}
      />
      <EnvelopeHandle
        cx={handleS.x}
        cy={handleS.y}
        label="S"
        accent={theme.accent.color}
        textMuted={theme.textMuted.color}
        onDragStart={handleSDrag}
      />
      <EnvelopeHandle
        cx={handleR.x}
        cy={handleR.y}
        label="R"
        accent={theme.accent.color}
        textMuted={theme.textMuted.color}
        onDragStart={handleRDrag}
      />
    </pixiContainer>
  );
};
