/**
 * TR-808 Hardware UI - 1:1 port of io-808 web emulator
 *
 * Every style, dimension, color, and algorithm is taken directly from:
 * https://github.com/vincentriemer/io-808
 *
 * Source files ported:
 *   theme/variables.js, theme/mixins.js
 *   components/knob, components/guides, components/drumKnob
 *   components/drumSwitch, components/instrumentLabel
 *   components/instrumentColumn, components/appTitle
 *   components/light, components/stepButton
 *   components/masterVolumeKnob
 *   layouts/instrumentColumn, layouts/topRightSection, layouts/app
 */

import React, { useCallback } from 'react';

// ============================================================================
// theme/variables.js - exact values
// ============================================================================
const grey = '#9b9fa0';
const darkGrey = '#232425';
const drumLabel = '#f6edc6';
const stencilOrange = '#ff5a00';
const red = '#d03933';
const buttonOrange = '#e98e2f';
const yellow = '#dfd442';
const offWhite = '#e9e8e7';
const miscKnobInner = '#C8D4C8';
const levelKnobInner = '#ff5a00';
const drumHandle = '#111111';
const slightlyDarkerBlack = '#111111';
const drumSwitchHandle = '#313335';
const lightActive = '#FE0000';
const lightInactive = '#570000';

const baseFontFamily = 'Helvetica, Arial, sans-serif';
const brandingFontFamily = `"ITC Serif Gothic W03", ${baseFontFamily}`;
const panelFontFamily = `"Helvetica LT W04", ${baseFontFamily}`;

// ============================================================================
// theme/mixins.js - exact presets
// ============================================================================
const unselectableText: React.CSSProperties = {
  MozUserSelect: 'none',
  WebkitUserSelect: 'none',
  msUserSelect: 'none',
  userSelect: 'none',
};

const basePreset: React.CSSProperties = {
  fontFamily: panelFontFamily,
  fontWeight: 'bold',
  textAlign: 'center',
  letterSpacing: '-0.2px',
  ...unselectableText,
  cursor: 'default',
};

const labelGreyNormal: React.CSSProperties = {
  ...basePreset,
  fontSize: 13,
  color: grey,
};

const labelGreyLarge: React.CSSProperties = {
  ...basePreset,
  fontSize: 15,
  color: grey,
};

const labelGreySmall: React.CSSProperties = {
  ...basePreset,
  fontSize: 11,
  color: grey,
};

const ring = (size: number): React.CSSProperties => ({
  position: 'absolute',
  width: size,
  height: size,
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
  margin: 'auto',
  borderRadius: '50%',
});

// ============================================================================
// Props
// ============================================================================
interface TR808HardwareProps {
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

// ============================================================================
// components/light/index.js - exact port
// ============================================================================
const Light: React.FC<{ active: boolean }> = ({ active }) => {
  const size = 18;
  const innerPadding = 4;
  const baseInnerStyle: React.CSSProperties = {
    position: 'absolute',
    left: innerPadding,
    right: innerPadding,
    top: innerPadding,
    bottom: innerPadding,
    borderRadius: '50%',
  };
  return (
    <div style={{
      position: 'relative',
      backgroundColor: 'rgba(0,0,0,0.4)',
      width: size,
      height: size,
      borderRadius: '50%',
      pointerEvents: 'none',
    }}>
      <div style={{ ...baseInnerStyle, backgroundColor: lightInactive }} />
      <div style={{
        ...baseInnerStyle,
        backgroundColor: lightActive,
        transition: 'opacity 0.1s',
        opacity: active ? 1 : 0,
      }} />
    </div>
  );
};

// ============================================================================
// components/guides/index.js - exact port
// ============================================================================
const Guides: React.FC<{
  num?: number;
  distance: number;
  hideCount?: number;
  guideStyle?: React.CSSProperties;
  rotate?: boolean;
  values?: React.ReactNode[];
  offset?: number;
}> = React.memo(({
  num: numProp,
  distance,
  hideCount = 0,
  guideStyle = {},
  rotate = true,
  values,
  offset,
}) => {
  let num = numProp ?? 0;
  let useValues = false;
  if (values != null && values.length !== 0) {
    num = values.length;
    useValues = true;
  }

  const guides: React.ReactNode[] = [];
  const angleCounter = 360 / (num + hideCount);
  let currentAngle = 180 + hideCount * angleCounter;

  if (offset) currentAngle += offset;

  const hideCountAdjust = hideCount > 1 ? hideCount - 1 : 0;
  const hideCompensation = (angleCounter * hideCountAdjust) / 2;

  for (let i = 0; i < num; i++) {
    let value: React.ReactNode = null;
    if (useValues) value = values![i];

    let transform = `translateX(-50%) translateY(-50%) rotate(${currentAngle}deg) translateY(-${distance}px)`;
    if (rotate === false)
      transform += ` rotate(-${currentAngle - hideCompensation}deg)`;

    guides.push(
      <div
        style={{
          ...guideStyle,
          cursor: 'default',
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform,
        }}
        key={i}
      >
        {value}
      </div>
    );

    currentAngle += angleCounter;
  }

  return (
    <div style={{
      position: 'absolute',
      width: '100%',
      height: '100%',
      transform: `rotate(-${hideCompensation}deg)`,
    }}>
      {guides}
    </div>
  );
}, () => true);

// ============================================================================
// Knob - simplified port of components/knob/index.js
// (drag interaction simplified since we don't have react-gui/use-pan)
// ============================================================================
const Knob: React.FC<{
  value: number;
  onChange: (value: number) => void;
  size: number;
  min: number;
  max: number;
  step: number;
  bufferSize?: number;
  children?: React.ReactNode;
}> = ({ value, onChange, size, min, max, step, bufferSize = 360, children }) => {
  const rootRef = React.useRef<HTMLDivElement>(null);

  // Drag interaction
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startVal = value;
    const range = max - min;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = (startY - moveEvent.clientY) / 200;
      let newValue = startVal + delta * range;
      // Snap to step
      newValue = Math.round(newValue / step) * step + min;
      newValue = Math.max(min, Math.min(max, newValue));
      onChange(newValue);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [value, onChange, min, max, step]);

  // io-808: rotationAmount = getNormalizedValue(value, min, max) * bufferSize - bufferSize / 2
  const normalizedValue = (value - min) / (max - min);
  const rotationAmount = normalizedValue * bufferSize - bufferSize / 2;

  return (
    <div
      ref={rootRef}
      style={{
        position: 'relative',
        borderRadius: '50%',
        height: size,
        width: size,
        cursor: 'grab',
      }}
      onMouseDown={handleMouseDown}
    >
      <div style={{
        position: 'relative',
        borderRadius: '50%',
        height: '100%',
        width: '100%',
        transform: `rotate(${rotationAmount}deg)`,
      }}>
        {children}
      </div>
    </div>
  );
};

// ============================================================================
// components/drumKnob/index.js - exact port
// ============================================================================
const LABEL_HEIGHT = 30;

const DrumKnob: React.FC<{
  value: number;
  onChange: (value: number) => void;
  size?: number;
  label?: string;
  level?: boolean;
}> = React.memo(({ value, onChange, size = 75, label = '', level = false }) => {
  const knobSize = Math.ceil(size * 0.6);

  return (
    <div style={{
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: size,
      height: size + LABEL_HEIGHT,
    }}>
      {/* Label wrapper */}
      <div style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexGrow: 1,
      }}>
        <span style={labelGreyNormal}>{label}</span>
      </div>

      {/* Control wrapper */}
      <div style={{
        position: 'relative',
        width: size,
        height: size,
      }}>
        {/* Level indicator dot */}
        {level && (
          <div style={{
            position: 'absolute',
            width: 5,
            height: 5,
            borderRadius: '50%',
            backgroundColor: levelKnobInner,
            right: '8%',
            top: '37%',
            zIndex: 2,
          }} />
        )}

        {/* Guide marks */}
        <Guides
          num={11}
          distance={size / 3}
          hideCount={1}
          guideStyle={{
            width: 2,
            backgroundColor: grey,
            height: size / 3,
          }}
        />

        {/* Knob centered with ring() mixin */}
        <div style={{ ...ring(knobSize), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Knob
            value={value}
            onChange={onChange}
            size={knobSize}
            min={0}
            max={100}
            step={2}
            bufferSize={300}
          >
            {/* Inner circle with drumHandle border */}
            <div style={{
              position: 'relative',
              overflow: 'hidden',
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              border: `solid ${drumHandle} 8px`,
              backgroundColor: level ? levelKnobInner : miscKnobInner,
            }}>
              {/* Handle indicator */}
              <div style={{
                position: 'absolute',
                width: 4,
                height: 12,
                backgroundColor: drumHandle,
                top: -6,
                left: '50%',
                transform: 'translateX(-50%)',
              }} />
            </div>
          </Knob>
        </div>
      </div>
    </div>
  );
}, (prev, next) => prev.value === next.value);

// ============================================================================
// components/drumSwitch/index.js - exact port
// ============================================================================
const DrumSwitch: React.FC<{
  position: number;
  onChange: (value: number) => void;
}> = ({ position, onChange }) => {
  const borderRadius = 2;
  return (
    <div style={{
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    }}>
      {/* Outer track */}
      <div
        style={{
          position: 'relative',
          width: 22,
          height: 50,
          padding: 4,
          backgroundColor: slightlyDarkerBlack,
          borderRadius,
          cursor: 'pointer',
        }}
        onClick={() => onChange(position < 0.5 ? 1 : 0)}
      >
        {/* Inner handle */}
        <div style={{
          position: 'absolute',
          width: 22 - 8, // thickness - padding*2
          height: (50 - 8) / 2, // (length - padding*2) / 2
          left: 4,
          top: position < 0.5 ? 4 : 50 - 4 - (50 - 8) / 2,
          backgroundColor: drumSwitchHandle,
          borderRadius,
          transition: 'top 0.1s ease',
        }} />
      </div>
    </div>
  );
};

// ============================================================================
// components/instrumentLabel/index.js - exact port
// ============================================================================
const baseLabelStyle: React.CSSProperties = {
  fontFamily: panelFontFamily,
  whiteSpace: 'pre',
  color: darkGrey,
  letterSpacing: -0.5,
  ...unselectableText,
};

const InstrumentLabel: React.FC<{ label: string[] }> = ({ label }) => {
  const formattedLabel = label.map((section, index) => {
    let style: React.CSSProperties;
    let value: string;
    if (section[0] === '*') {
      style = { ...baseLabelStyle, fontSize: 19, fontWeight: 400 };
      value = section.slice(1);
    } else {
      style = { ...baseLabelStyle, fontSize: 11 };
      value = section;
    }
    return (
      <div key={index} style={style}>{value}</div>
    );
  });

  return (
    <div style={{
      width: '100%',
      height: 36,
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: drumLabel,
      borderRadius: 4,
    }}>
      <div style={{
        alignItems: 'baseline',
        cursor: 'default',
        display: 'flex',
        flexDirection: 'row',
        wordSpacing: '-0.1em',
      }}>
        {formattedLabel}
      </div>
    </div>
  );
};

// ============================================================================
// layouts/instrumentColumn/index.js - exact port
// Knobs on TOP, labels on BOTTOM
// ============================================================================
const InstrumentColumnLayout: React.FC<{
  labels: React.ReactNode[];
  children: React.ReactNode;
  width: number;
  height: number;
}> = ({ labels, children, width, height }) => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'stretch',
      justifyContent: 'space-between',
      width,
      height,
      padding: 4,
    }}>
      {/* Knobs on TOP */}
      <div style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}>
        {React.Children.map(children, (child, index) => (
          <div key={index} style={{ marginBottom: 5 }}>
            {child}
          </div>
        ))}
      </div>

      {/* Labels on BOTTOM */}
      <div style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
      }}>
        {labels.map((label, index) => (
          <div key={index} style={{ marginTop: 8 }}>
            {label}
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// EMPTY_CONTROL constant from components/instrumentColumn
// ============================================================================
const EMPTY_CONTROL = 'EMPTY';

// ============================================================================
// components/instrumentColumn/index.js - exact port
// ============================================================================
const InstrumentColumn: React.FC<{
  config: InstrumentConfig;
  width: number;
  height: number;
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}> = ({ config, width, height, parameters, onParamChange }) => {
  const { type, labels, switchConfig, controls } = config;
  const DRUM_KNOB_SIZE = Math.ceil(width * 0.72);

  // Create label section
  const labelComponents: React.ReactNode[] = [];
  labelComponents.push(
    <InstrumentLabel key={`${type}-label-0`} label={labels[0]} />
  );
  if (labels.length === 2) {
    if (switchConfig != null) {
      labelComponents.push(
        <DrumSwitch
          key={`${type}-switch`}
          position={parameters[switchConfig.param] ?? 0}
          onChange={(v) => onParamChange(switchConfig.param, v)}
        />
      );
    }
    labelComponents.push(
      <InstrumentLabel key={`${type}-label-1`} label={labels[1]} />
    );
  }

  // Create control section - level knob first, then other controls
  const controlComponents: React.ReactNode[] = [];
  controlComponents.push(
    <DrumKnob
      key={`${type}-knob-level`}
      value={parameters[`${type}_level`] ?? 75}
      onChange={(v) => onParamChange(`${type}_level`, v)}
      size={DRUM_KNOB_SIZE}
      label="LEVEL"
      level
    />
  );
  controls.forEach((controlName, index) => {
    if (controlName !== EMPTY_CONTROL) {
      controlComponents.push(
        <DrumKnob
          key={`${type}-knob-${index}`}
          value={parameters[`${type}_${controlName}`] ?? 50}
          onChange={(v) => onParamChange(`${type}_${controlName}`, v)}
          size={DRUM_KNOB_SIZE}
          label={controlName.toUpperCase()}
        />
      );
    } else {
      // Empty spacer (io-808 uses this for open hihat's first empty slot)
      controlComponents.push(
        <div
          key={`${type}-knob-${index}`}
          style={{
            width: DRUM_KNOB_SIZE,
            height: DRUM_KNOB_SIZE + LABEL_HEIGHT,
          }}
        />
      );
    }
  });

  return (
    <InstrumentColumnLayout
      labels={labelComponents}
      width={width}
      height={height}
    >
      {controlComponents}
    </InstrumentColumnLayout>
  );
};

// ============================================================================
// components/appTitle/index.js - exact port
// ============================================================================
const TitleText: React.FC<{ text: string }> = React.memo(({ text }) => {
  const eSplit = text.split('e');
  const result = eSplit.reduce<React.ReactNode[]>((acc, cur, idx) => {
    if (acc === null) return [cur];
    const rotatedE = (
      <span
        key={idx}
        style={{
          display: 'inline-block',
          transformOrigin: '50% 60%',
          transform: 'rotate(-40deg)',
        }}
      >
        e
      </span>
    );
    return [...acc, rotatedE, cur];
  }, null as any);
  return <>{result}</>;
});

const lineHeight = 1.5;
const titleRight = 60;
const lineTop = 55;

const AppTitle: React.FC<{ width: number; height: number }> = ({ width, height }) => {
  return (
    <div style={{ position: 'relative', width, height }}>
      {/* Orange horizontal line */}
      <div style={{
        position: 'absolute',
        height: `${lineHeight}%`,
        left: '50%',
        transform: 'translateX(-50%)',
        top: `${lineTop}%`,
        backgroundColor: stencilOrange,
        width: width - 20,
      }} />

      {/* Title text */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'nowrap',
        alignItems: 'baseline',
        position: 'absolute',
        bottom: `calc(${lineTop}% - 17.5px)`,
        right: titleRight,
      }}>
        <div style={{
          ...labelGreyLarge,
          fontFamily: brandingFontFamily,
          marginRight: 40,
          color: stencilOrange,
          fontSize: 50,
          textShadow: `0.3rem 0 ${darkGrey},0.3rem 0rem ${darkGrey},-0.3rem -0 ${darkGrey},-0.3rem 0 ${darkGrey}`,
        }}>
          <TitleText text="Rhythm Composer" />
        </div>
        <div style={{
          ...labelGreyLarge,
          fontFamily: brandingFontFamily,
          color: stencilOrange,
          fontSize: 40,
          letterSpacing: -1.5,
        }}>
          <TitleText text="DEViLBOX" />
        </div>
      </div>

      {/* Subtitle */}
      <div style={{
        ...labelGreyLarge,
        fontFamily: brandingFontFamily,
        position: 'absolute',
        top: `${lineTop + lineHeight * 3}%`,
        right: titleRight,
        fontSize: 28,
        letterSpacing: -1,
      }}>
        <TitleText text="Browser Controlled" />
      </div>
    </div>
  );
};

// ============================================================================
// components/masterVolumeKnob/index.js - exact port
// ============================================================================
const labelValues: React.ReactNode[] = [];
for (let i = 0; i < 11; i++) {
  if (i === 0) {
    labelValues.push('MIN');
  } else if (i === 10) {
    labelValues.push('MAX');
  } else {
    labelValues.push(i);
  }
}

const MasterVolumeKnob: React.FC<{
  value: number;
  onChange: (value: number) => void;
  size?: number;
}> = ({ value, onChange, size = 130 }) => {
  const knobSize = Math.ceil(size * 0.54);
  const labelHeight = 9;
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'stretch',
      justifyContent: 'space-between',
      width: size,
      height: size + labelHeight,
    }}>
      <div style={{
        position: 'relative',
        width: size,
        height: size,
      }}>
        {/* Dot guides */}
        <Guides
          num={11}
          distance={size * 0.33}
          hideCount={1}
          guideStyle={{
            width: 5,
            height: 5,
            backgroundColor: grey,
            borderRadius: '50%',
          }}
        />
        {/* Label guides */}
        <Guides
          distance={size * 0.45}
          hideCount={1}
          rotate={false}
          values={labelValues}
          guideStyle={labelGreySmall}
        />
        {/* Knob */}
        <div style={ring(knobSize)}>
          <Knob
            value={value}
            onChange={onChange}
            size={knobSize}
            bufferSize={300}
            min={0}
            max={100}
            step={1}
          >
            {/* SelectorKnobInner - dark knob with pointer */}
            <div style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              backgroundColor: darkGrey,
              border: `2px solid ${grey}`,
            }}>
              <div style={{
                position: 'absolute',
                width: 3,
                height: '40%',
                backgroundColor: stencilOrange,
                top: 2,
                left: '50%',
                transform: 'translateX(-50%)',
                borderRadius: 1,
              }} />
            </div>
          </Knob>
        </div>
      </div>
      <div style={{
        position: 'relative',
        ...labelGreyNormal,
        overflow: 'visible',
        top: -4,
      }}>
        MASTER VOLUME
      </div>
    </div>
  );
};

// ============================================================================
// components/stepButton/index.js - exact port
// ============================================================================
const StepButton: React.FC<{
  color: string;
  active: boolean;
  onClick: () => void;
  width?: number;
  height?: number;
}> = ({ color, active, onClick, width = 50, height = 80 }) => {
  return (
    <div
      style={{
        borderRadius: 4,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 5,
        backgroundColor: color,
        width,
        height,
        cursor: 'pointer',
      }}
      onClick={onClick}
    >
      <Light active={active} />
    </div>
  );
};

// ============================================================================
// Instrument configuration - from layouts/topRightSection/index.js
// ============================================================================
interface InstrumentConfig {
  type: string;
  labels: string[][];
  controls: string[];
  switchConfig?: { param: string };
}

const instrumentConfig: InstrumentConfig[] = [
  {
    type: 'accent',
    labels: [['*A', '*C', 'CENT']],
    controls: [],
  },
  {
    type: 'kick',
    labels: [['*B', 'ASS ', '*D', 'RUM']],
    controls: ['tone', 'decay'],
  },
  {
    type: 'snare',
    labels: [['*S', 'NARE ', '*D', 'RUM']],
    controls: ['tone', 'snappy'],
  },
  {
    type: 'low_tom',
    labels: [['*L', 'OW ', '*C', 'ONGA'], ['*L', 'OW ', '*T', 'OM']],
    switchConfig: { param: 'low_tom_selector' },
    controls: ['tuning'],
  },
  {
    type: 'mid_tom',
    labels: [['*M', 'ID ', '*C', 'ONGA'], ['*M', 'ID ', '*T', 'OM']],
    switchConfig: { param: 'mid_tom_selector' },
    controls: ['tuning'],
  },
  {
    type: 'hi_tom',
    labels: [['*H', 'I ', '*C', 'ONGA'], ['*H', 'I ', '*T', 'OM']],
    switchConfig: { param: 'hi_tom_selector' },
    controls: ['tuning'],
  },
  {
    type: 'rimshot',
    labels: [['*C', '*L', 'AVES'], ['*R', 'IM ', '*S', 'HOT']],
    switchConfig: { param: 'rimshot_selector' },
    controls: [],
  },
  {
    type: 'clap',
    labels: [['*M', '*A', 'RACAS'], ['HAND ', '*C', 'LA', '*P']],
    switchConfig: { param: 'clap_selector' },
    controls: [],
  },
  {
    type: 'cowbell',
    labels: [['*C', 'OW ', '*B', 'ELL']],
    controls: [],
  },
  {
    type: 'cymbal',
    labels: [['*C', '*Y', 'MBAL']],
    controls: ['tone', 'decay'],
  },
  {
    type: 'oh',
    labels: [['*O', 'PEN ', '*H', 'IHAT']],
    controls: [EMPTY_CONTROL, 'decay'],
  },
  {
    type: 'ch',
    labels: [["*C", "LS'D ", '*H', 'IHAT']],
    controls: [],
  },
];

// Step button colors: 4 red, 4 orange, 4 yellow, 4 white (io-808 pattern)
const STEP_COLORS = [
  red, red, red, red,
  buttonOrange, buttonOrange, buttonOrange, buttonOrange,
  yellow, yellow, yellow, yellow,
  offWhite, offWhite, offWhite, offWhite,
];

// ============================================================================
// TR808Hardware - Main component
// Layout: topRightSection (instruments + title) + bottomSection (step buttons)
// ============================================================================
export const TR808Hardware: React.FC<TR808HardwareProps> = ({
  parameters,
  onParamChange,
}) => {
  const [stepPattern, setStepPattern] = React.useState<boolean[]>(
    new Array(16).fill(false)
  );

  const toggleStep = useCallback((index: number) => {
    setStepPattern(prev => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  }, []);

  // Layout constants - derived from io-808's layouts/app/index.js
  // We scale to fit the panel but keep proportions
  const SEPARATOR_WIDTH = 1;

  // Top section: instruments (70%) + title (30%)
  const INSTRUMENTS_HEIGHT_RATIO = 0.7;
  const TOP_HEIGHT = 520;
  const instrumentsHeight = Math.ceil(TOP_HEIGHT * INSTRUMENTS_HEIGHT_RATIO);
  const titleSectionHeight = TOP_HEIGHT - instrumentsHeight;

  // Bottom section
  const BOTTOM_HEIGHT = 120;
  const STEP_BUTTON_W = 50;
  const STEP_BUTTON_H = 80;

  return (
    <div style={{
      width: '100%',
      backgroundColor: darkGrey,
      overflow: 'hidden',
    }}>
      {/* ================================================================ */}
      {/* TOP SECTION - io-808 topRightSection */}
      {/* ================================================================ */}
      <div style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Top divider line */}
        <div style={{
          width: '100%',
          height: 3,
          backgroundColor: grey,
        }} />

        {/* Instruments row */}
        <div style={{
          width: '100%',
          height: instrumentsHeight,
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
        }}>
          {instrumentConfig.reduce<React.ReactNode[]>((components, config, index) => {
            const result = [...components];
            // Grey separator between columns
            if (index !== 0) {
              result.push(
                <div
                  key={`separator-${index}`}
                  style={{
                    width: SEPARATOR_WIDTH,
                    height: instrumentsHeight - 10,
                    backgroundColor: grey,
                    flexShrink: 0,
                  }}
                />
              );
            }
            result.push(
              <div
                key={`column-${index}`}
                style={{
                  flex: '1 1 0',
                  minWidth: 0,
                  height: instrumentsHeight,
                  display: 'flex',
                  justifyContent: 'center',
                }}
              >
                <InstrumentColumn
                  config={config}
                  width={110}
                  height={instrumentsHeight}
                  parameters={parameters}
                  onParamChange={onParamChange}
                />
              </div>
            );
            return result;
          }, [])}
        </div>

        {/* Title section */}
        <div style={{
          width: '100%',
          height: titleSectionHeight,
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <AppTitle
            width={Math.ceil(titleSectionHeight * 5.5)}
            height={titleSectionHeight}
          />
          <div style={{
            height: titleSectionHeight,
            display: 'flex',
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <MasterVolumeKnob
              value={parameters.master_volume ?? 75}
              onChange={(v) => onParamChange('master_volume', v)}
              size={Math.floor(titleSectionHeight * 0.86)}
            />
          </div>
        </div>

        {/* Bottom divider line */}
        <div style={{
          width: '100%',
          height: 3,
          backgroundColor: grey,
        }} />
      </div>

      {/* ================================================================ */}
      {/* BOTTOM SECTION - Step buttons */}
      {/* ================================================================ */}
      <div style={{
        width: '100%',
        height: BOTTOM_HEIGHT,
        backgroundColor: grey,
        padding: '8px 16px',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Step number labels */}
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-around',
          alignItems: 'center',
          marginBottom: 4,
        }}>
          {STEP_COLORS.map((_, i) => (
            <div key={i} style={{
              ...labelGreySmall,
              color: i < 8 ? stencilOrange : darkGrey,
              fontSize: i < 4 || (i >= 8 && i < 12) ? 13 : 11,
              fontWeight: 'bold',
              width: STEP_BUTTON_W,
              textAlign: 'center',
            }}>
              {i + 1}
            </div>
          ))}
        </div>

        {/* Step buttons row */}
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-around',
          alignItems: 'flex-start',
          flex: 1,
        }}>
          {STEP_COLORS.map((color, i) => (
            <StepButton
              key={i}
              color={color}
              active={stepPattern[i]}
              onClick={() => toggleStep(i)}
              width={STEP_BUTTON_W}
              height={STEP_BUTTON_H}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
