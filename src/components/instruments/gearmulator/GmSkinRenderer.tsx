/**
 * GmSkinRenderer — Renders a parsed gearmulator hardware skin as DOM elements.
 * Mounts knobs, buttons, combos, labels, and images at their exact skin positions.
 * Designed to be wrapped in PixiDOMOverlay for integration with the Pixi GL scene.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GmKnob } from './GmKnob';
import { GmButton, makeButtonSprites } from './GmButton';
import { GmCombo } from './GmCombo';
import { GmLabel } from './GmLabel';
import { GmParameterMap } from './GmParameterMap';
import {
  parseRml,
  parseRcssSpritesheets,
  type GmSkinControlDef,
} from './GmSkinParser';

// ─── Skin Definition ─────────────────────────────────────────────────────────

interface KnobStyle {
  src: string;
  frameWidth: number;
  frameHeight: number;
  cols: number;
  totalFrames: number;
}

// Virus Trancy skin knob styles
const VIRUS_TRANCY_KNOBS: Record<string, KnobStyle> = {
  knob_1: {
    src: '/gearmulator/skins/virus-trancy/knob_1_128_page0.png',
    frameWidth: 75,
    frameHeight: 75,
    cols: 27,
    totalFrames: 128,
  },
  knob_2: {
    src: '/gearmulator/skins/virus-trancy/knob_2_128_page0.png',
    frameWidth: 55,
    frameHeight: 55,
    cols: 37,
    totalFrames: 128,
  },
};

const SKIN_BASE = '/gearmulator/skins/virus-trancy';

// ─── Props ───────────────────────────────────────────────────────────────────

export interface GmSkinRendererProps {
  /** RML content string */
  rmlContent: string;
  /** RCSS content string */
  rcssContent: string;
  /** Parameter map instance */
  paramMap: GmParameterMap;
  /** Current parameter values (param name → raw value) */
  paramValues: Record<string, number>;
  /** Called when user changes a parameter via the skin */
  onParamChange: (paramName: string, value: number) => void;
  /** Skin display scale (default 0.5 = half-size) */
  scale?: number;
  /** Override skin base URL */
  skinBase?: string;
}

/** Convert RML dp units to pixels */
function dpToPx(dpStr: string): number {
  return parseFloat(dpStr.replace('dp', '').replace('px', ''));
}

export const GmSkinRenderer: React.FC<GmSkinRendererProps> = ({
  rmlContent, rcssContent, paramMap, paramValues, onParamChange,
  scale: scaleProp, skinBase = SKIN_BASE
}) => {
  // Parse skin
  const { body, elements } = useMemo(() => parseRml(rmlContent), [rmlContent]);
  const spritesheets = useMemo(() => parseRcssSpritesheets(rcssContent), [rcssContent]);

  const skinScale = scaleProp ?? parseFloat(body.scale);
  const skinWidth = dpToPx(body.width) * skinScale;
  const skinHeight = dpToPx(body.height) * skinScale;

  // Use ref for current param values to avoid stale closures
  const valuesRef = useRef(paramValues);
  useEffect(() => { valuesRef.current = paramValues; }, [paramValues]);

  // Group elements by page
  const { globalElements, pageElements } = useMemo(() => {
    const global: GmSkinControlDef[] = [];
    const pages: Record<string, GmSkinControlDef[]> = {};
    for (const el of elements) {
      if (el.pageId) {
        (pages[el.pageId] ??= []).push(el);
      } else {
        global.push(el);
      }
    }
    return { globalElements: global, pageElements: pages };
  }, [elements]);

  // Tab state
  const [activeTab, _setActiveTab] = useState(0);
  void _setActiveTab; // will be used when tab switching is wired
  const pageIds = useMemo(() => Object.keys(pageElements).sort(), [pageElements]);

  // Render a single control
  const renderControl = useCallback((ctrl: GmSkinControlDef) => {
    const s = skinScale;
    const posStyle: React.CSSProperties = {
      position: 'absolute',
      left: dpToPx(ctrl.style['left'] ?? '0') * s,
      top: dpToPx(ctrl.style['top'] ?? '0') * s,
    };

    if (ctrl.style['width']) posStyle.width = dpToPx(ctrl.style['width']) * s;
    if (ctrl.style['height']) posStyle.height = dpToPx(ctrl.style['height']) * s;

    const paramDesc = ctrl.param ? paramMap.get(ctrl.param) : undefined;
    const rawValue = ctrl.param ? (paramValues[ctrl.param] ?? paramDesc?.min ?? 0) : 0;

    switch (ctrl.type) {
      case 'knob': {
        const knobDef = VIRUS_TRANCY_KNOBS[ctrl.knobStyle ?? 'knob_1'];
        const normalized = paramDesc
          ? (rawValue - paramDesc.min) / (paramDesc.max - paramDesc.min)
          : 0;
        return (
          <GmKnob
            key={`${ctrl.pageId ?? 'g'}-${ctrl.param ?? ctrl.id}`}
            src={knobDef.src}
            frameWidth={knobDef.frameWidth * s}
            frameHeight={knobDef.frameHeight * s}
            cols={knobDef.cols}
            totalFrames={knobDef.totalFrames}
            value={normalized}
            onChange={(v) => {
              if (ctrl.param && paramDesc) {
                onParamChange(ctrl.param, Math.round(paramDesc.min + v * (paramDesc.max - paramDesc.min)));
              }
            }}
            style={posStyle}
            paramName={ctrl.param}
            bipolar={paramDesc?.isBipolar}
          />
        );
      }

      case 'button': {
        const btnSheet = spritesheets[ctrl.buttonStyle ?? ''];
        const btnSrc = btnSheet ? `${skinBase}/${btnSheet.src}` : '';
        const frames = btnSheet?.frames ?? {};
        const prefix = ctrl.buttonStyle ?? 'btn_1';
        const defFrame = frames[`${prefix}_default`] ?? { x: 0, y: 0, w: 36, h: 68 };
        const chkFrame = frames[`${prefix}_checked`] ?? { x: 0, y: 68, w: 36, h: 68 };

        const isChecked = ctrl.valueOn !== undefined
          ? rawValue === ctrl.valueOn
          : rawValue > 0;

        return (
          <GmButton
            key={`${ctrl.pageId ?? 'g'}-${ctrl.param ?? ctrl.id}`}
            sprites={makeButtonSprites(
              btnSrc,
              defFrame.w * s, defFrame.h * s,
              defFrame.y * s, chkFrame.y * s
            )}
            checked={isChecked}
            isToggle={ctrl.isToggle}
            onChange={(checked) => {
              if (ctrl.param) {
                const val = ctrl.valueOn !== undefined
                  ? (checked ? ctrl.valueOn : 0)
                  : (checked ? (paramDesc?.max ?? 1) : (paramDesc?.min ?? 0));
                onParamChange(ctrl.param, val);
              }
            }}
            style={posStyle}
            paramName={ctrl.param}
          />
        );
      }

      case 'combo': {
        return (
          <GmCombo
            key={`${ctrl.pageId ?? 'g'}-${ctrl.param ?? ctrl.id}`}
            value={rawValue}
            min={paramDesc?.min ?? 0}
            max={paramDesc?.max ?? 127}
            onChange={(v) => ctrl.param && onParamChange(ctrl.param, v)}
            style={posStyle}
            paramName={ctrl.param}
          />
        );
      }

      case 'label': {
        return (
          <GmLabel
            key={`${ctrl.pageId ?? 'g'}-${ctrl.id}`}
            text={ctrl.text ?? ''}
            style={posStyle}
          />
        );
      }

      case 'image': {
        return (
          <img
            key={`${ctrl.pageId ?? 'g'}-${ctrl.id}`}
            src={`${skinBase}/${ctrl.src}`}
            style={{
              ...posStyle,
              pointerEvents: 'none',
            }}
            alt=""
          />
        );
      }

      default:
        return null;
    }
  }, [skinScale, paramValues, paramMap, onParamChange, spritesheets, skinBase]);

  return (
    <div
      className="gm-skin"
      style={{
        position: 'relative',
        width: skinWidth,
        height: skinHeight,
        overflow: 'hidden',
        backgroundImage: `url(${skinBase}/main_background.png)`,
        backgroundSize: `${skinWidth}px ${skinHeight}px`,
        backgroundRepeat: 'no-repeat',
        fontFamily: '"Digital", monospace',
        fontSize: 14 * skinScale,
        color: '#ccc',
      }}
    >
      {/* Global elements (not in any tab page) */}
      {globalElements.map(renderControl)}

      {/* Tab buttons */}
      {/* Tab buttons are already rendered via globalElements */}

      {/* Tab pages */}
      {pageIds.map((pageId, i) => (
        <div
          key={pageId}
          style={{
            display: i === activeTab ? 'block' : 'none',
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
          }}
        >
          {pageElements[pageId]?.map(renderControl)}
        </div>
      ))}
    </div>
  );
};
