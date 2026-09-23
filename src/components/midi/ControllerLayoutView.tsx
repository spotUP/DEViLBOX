/**
 * ControllerLayoutView — renders a physical controller layout as interactive visual
 *
 * Given a ControllerLayout + current assignments, draws all controls with
 * color-coding by type and shows current assignment labels. Click a control
 * to select it (parent handles assignment popover).
 */

import React, { useCallback } from 'react';
import type { ControllerLayout, ControlDescriptor } from '@/midi/controllerLayouts';
import type { ControlAssignment } from '@/stores/useMIDIPresetStore';
import { wrapLabel, charsThatFit, describeControl } from '@/midi/controlLabel';

// ============================================================================
// TYPES
// ============================================================================

interface ControllerLayoutViewProps {
  layout: ControllerLayout;
  /** Current assignments by controlId */
  assignments: Record<string, ControlAssignment>;
  /** Currently selected control (highlighted) */
  selectedControlId?: string | null;
  /** MIDI learn: control that just received MIDI */
  learnHighlightId?: string | null;
  /** Called when user clicks a control */
  onSelectControl: (control: ControlDescriptor) => void;
  /**
   * Which hardware layer to draw. A device with a LAYER switch describes the
   * same physical control twice, once per layer, so drawing every control
   * would stack two on each position. Controls with no layer are always drawn
   * — that covers single-layer devices and the layer indicators themselves.
   */
  layer?: 'A' | 'B';
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Pixels per grid unit. Was 32, which left 64 px between neighbouring
// controls — narrower than the names printed under them, so the top encoder
// row ran together into one unreadable string (2026-09-23). Labels wrap now,
// and the extra width is what gives them room to wrap into; the height is
// what keeps a two-line caption clear of the row beneath it.
const CELL = 48;
const PAD = 16;  // padding around the layout
const ENCODER_R = 12;
/**
 * Gap between a control's edge and the first line of its caption.
 *
 * The label used to start 12 px below an encoder's CENTRE — inside the knob's
 * own radius — so the text crowded the graphic ("the texts are too close to
 * the buttons/knobs etc", 2026-09-23). Measured from the edge now, with real
 * air.
 */
const LABEL_GAP = 9;
const BUTTON_SIZE = 24;
const FADER_W = 14;

// Color scheme for assignment types
const COLORS = {
  unassigned:   { bg: '#333', border: '#555', text: '#666' },
  param:        { bg: '#1a3a5c', border: '#3b82f6', text: '#93c5fd' },
  action:       { bg: '#1a4a2e', border: '#22c55e', text: '#86efac' },
  dub:          { bg: '#4a2c1a', border: '#f97316', text: '#fdba74' },
  selected:     { bg: '#4c1d95', border: '#a78bfa', text: '#c4b5fd' },
  learn:        { bg: '#7c2d12', border: '#ef4444', text: '#fca5a5' },
};

function getControlColor(
  _control: ControlDescriptor,
  assignment: ControlAssignment | undefined,
  isSelected: boolean,
  isLearnHighlight: boolean,
) {
  if (isLearnHighlight) return COLORS.learn;
  if (isSelected) return COLORS.selected;
  if (!assignment) return COLORS.unassigned;
  return COLORS[assignment.kind] ?? COLORS.unassigned;
}

function getAssignmentLabel(assignment: ControlAssignment | undefined): string {
  if (!assignment) return '';
  const target = assignment.target;
  // Show last segment for readability
  const parts = target.split('.');
  return parts[parts.length - 1];
}

// ============================================================================
// SHARED LABEL
// ============================================================================

/**
 * A control's caption, wrapped to the space it actually has.
 *
 * Every control is 2 grid units apart, so that is the budget. Two lines, then
 * an ellipsis — and the full target plus its MIDI address always live in the
 * `<title>` on the control's group, which is the answer to "which knob is
 * CC10" that the diagram never used to give.
 */
const ControlLabel: React.FC<{
  cx: number;
  top: number;
  text: string;
  fill: string;
  fontSize: number;
}> = ({ cx, top, text, fill, fontSize }) => {
  const lines = wrapLabel(text, charsThatFit(CELL * 2, fontSize), 2);
  if (lines.length === 0) return null;
  return (
    <text x={cx} y={top} fill={fill} fontSize={fontSize} fontFamily="monospace" textAnchor="middle">
      {lines.map((line, i) => (
        <tspan key={i} x={cx} dy={i === 0 ? 0 : fontSize + 1}>{line}</tspan>
      ))}
    </text>
  );
};

// ============================================================================
// CONTROL RENDERERS
// ============================================================================

const EncoderControl: React.FC<{
  control: ControlDescriptor;
  color: { bg: string; border: string; text: string };
  label: string;
  tooltip: string;
  onClick: () => void;
}> = ({ control, color, label, tooltip, onClick }) => {
  const cx = PAD + control.x * CELL + CELL;
  const cy = PAD + control.y * CELL + CELL / 2;

  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
      <title>{tooltip}</title>
      {/* Ring LED background */}
      {control.hasRingLed && (
        <circle cx={cx} cy={cy} r={ENCODER_R + 4} fill="none" stroke={color.border} strokeWidth={2} opacity={0.3} />
      )}
      {/* Encoder body */}
      <circle cx={cx} cy={cy} r={ENCODER_R} fill={color.bg} stroke={color.border} strokeWidth={1.5} />
      {/* Pointer line */}
      <line x1={cx} y1={cy - ENCODER_R + 3} x2={cx} y2={cy - 3} stroke={color.text} strokeWidth={2} strokeLinecap="round" />
      {/* Label */}
      <ControlLabel cx={cx} top={cy + ENCODER_R + LABEL_GAP + 8} fill={color.text} fontSize={8}
        text={label || control.label || control.id} />
    </g>
  );
};

const ButtonControl: React.FC<{
  control: ControlDescriptor;
  color: { bg: string; border: string; text: string };
  label: string;
  tooltip: string;
  onClick: () => void;
}> = ({ control, color, label, tooltip, onClick }) => {
  const x = PAD + control.x * CELL + CELL - BUTTON_SIZE / 2;
  const y = PAD + control.y * CELL + CELL / 2 - BUTTON_SIZE / 2;

  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
      <title>{tooltip}</title>
      {/* LED dot */}
      {control.hasLed && (
        <circle
          cx={x + BUTTON_SIZE / 2}
          cy={y - 3}
          r={2.5}
          fill={color.border}
          opacity={0.6}
        />
      )}
      {/* Button body */}
      <rect x={x} y={y} width={BUTTON_SIZE} height={BUTTON_SIZE} rx={3}
        fill={color.bg} stroke={color.border} strokeWidth={1.5} />
      {/* Label */}
      <ControlLabel cx={x + BUTTON_SIZE / 2} top={y + BUTTON_SIZE + LABEL_GAP + 7} fill={color.text}
        fontSize={7} text={label || control.label || ''} />
    </g>
  );
};

const FaderControl: React.FC<{
  control: ControlDescriptor;
  color: { bg: string; border: string; text: string };
  label: string;
  tooltip: string;
  onClick: () => void;
}> = ({ control, color, label, tooltip, onClick }) => {
  const h = (control.h ?? 4) * CELL - 8;
  const x = PAD + control.x * CELL + CELL - FADER_W / 2;
  const y = PAD + control.y * CELL + 4;

  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
      <title>{tooltip}</title>
      {/* Fader track */}
      <rect x={x + FADER_W / 2 - 2} y={y} width={4} height={h} rx={2}
        fill="#222" stroke="#444" strokeWidth={0.5} />
      {/* Fader knob */}
      <rect x={x} y={y + h * 0.3} width={FADER_W} height={20} rx={3}
        fill={color.bg} stroke={color.border} strokeWidth={1.5} />
      {/* Label below */}
      <ControlLabel cx={x + FADER_W / 2} top={y + h + LABEL_GAP + 8} fill={color.text} fontSize={8}
        text={label || control.label || control.id} />
    </g>
  );
};

const PadControl: React.FC<{
  control: ControlDescriptor;
  color: { bg: string; border: string; text: string };
  label: string;
  tooltip: string;
  onClick: () => void;
}> = ({ control, color, label, tooltip, onClick }) => {
  const size = BUTTON_SIZE + 8;
  const x = PAD + control.x * CELL + CELL - size / 2;
  const y = PAD + control.y * CELL + CELL / 2 - size / 2;

  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
      <title>{tooltip}</title>
      <rect x={x} y={y} width={size} height={size} rx={4}
        fill={color.bg} stroke={color.border} strokeWidth={2} />
      <ControlLabel cx={x + size / 2} top={y + size + LABEL_GAP + 7} fill={color.text}
        fontSize={7} text={label || control.label || ''} />
    </g>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const ControllerLayoutView: React.FC<ControllerLayoutViewProps> = ({
  layout,
  assignments,
  selectedControlId,
  learnHighlightId,
  onSelectControl,
  layer = 'A',
}) => {
  const svgWidth = layout.width * CELL + PAD * 2;
  const svgHeight = layout.height * CELL + PAD * 2;

  const handleClick = useCallback((control: ControlDescriptor) => {
    onSelectControl(control);
  }, [onSelectControl]);

  // One layer at a time — see the `layer` prop.
  const visible = layout.controls.filter(c => !c.layer || c.layer === layer);

  // Group controls by type for layered rendering (faders behind buttons/encoders)
  const renderOrder: ControlDescriptor[] = [
    ...visible.filter(c => c.type === 'fader'),
    ...visible.filter(c => c.type === 'pad'),
    ...visible.filter(c => c.type === 'button'),
    ...visible.filter(c => c.type === 'encoder'),
  ];

  return (
    <svg
      // Shrink to fit, never grow past natural size, and never clamp height.
      //
      // A fixed pixel box overflowed the dialog into scrollbars; clamping the
      // height to a viewport calculation was worse — on a short window the
      // aspect ratio then drove the width down too and the whole panel
      // collapsed into a thumbnail inside an empty dialog ("this sucks",
      // 2026-09-23). Width is the only constraint: full width up to the
      // natural size, height follows. A window too short to show it all
      // scrolls, which is the normal answer.
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      preserveAspectRatio="xMidYMid meet"
      className="select-none w-full h-auto"
      style={{ maxWidth: svgWidth }}
    >
      {/* Background panel */}
      <rect x={0} y={0} width={svgWidth} height={svgHeight} rx={8}
        fill="#1a1a1a" stroke="#333" strokeWidth={1} />

      {/* Controller name */}
      <text x={PAD} y={PAD - 3} fill="#666" fontSize={10} fontFamily="monospace">
        {layout.manufacturer} {layout.name}
      </text>

      {/* Group separators */}
      {renderGroupBackgrounds(visible)}

      {/* Controls */}
      {renderOrder.map((control) => {
        const assignment = assignments[control.id];
        const isSelected = control.id === selectedControlId;
        const isLearn = control.id === learnHighlightId;
        const color = getControlColor(control, assignment, isSelected, isLearn);
        const label = getAssignmentLabel(assignment);

        const commonProps = {
          control,
          color,
          label,
          tooltip: describeControl({
            id: control.id,
            target: assignment?.target,
            type: control.midi.type,
            channel: control.midi.channel,
            number: control.midi.number,
            pushNote: control.midi.pushNote,
            touchCc: control.midi.touchCc,
            layer: control.layer,
          }),
          onClick: () => handleClick(control),
        };

        switch (control.type) {
          case 'encoder': return <EncoderControl key={control.id} {...commonProps} />;
          case 'button':  return <ButtonControl key={control.id} {...commonProps} />;
          case 'fader':   return <FaderControl key={control.id} {...commonProps} />;
          case 'pad':     return <PadControl key={control.id} {...commonProps} />;
          default:        return null;
        }
      })}
    </svg>
  );
};

// ============================================================================
// GROUP BACKGROUNDS
// ============================================================================

function renderGroupBackgrounds(controls: ControlDescriptor[]): React.ReactNode {
  const groups = new Map<string, { minX: number; minY: number; maxX: number; maxY: number }>();

  for (const control of controls) {
    if (!control.group) continue;
    const existing = groups.get(control.group);
    const cx = control.x;
    const cy = control.y;
    const cw = control.w ?? (control.type === 'fader' ? 1 : 1);
    const ch = control.h ?? (control.type === 'fader' ? 4 : 1);
    if (!existing) {
      groups.set(control.group, { minX: cx, minY: cy, maxX: cx + cw, maxY: cy + ch });
    } else {
      existing.minX = Math.min(existing.minX, cx);
      existing.minY = Math.min(existing.minY, cy);
      existing.maxX = Math.max(existing.maxX, cx + cw);
      existing.maxY = Math.max(existing.maxY, cy + ch);
    }
  }

  const rects: React.ReactNode[] = [];
  groups.forEach((bounds, group) => {
    const x = PAD + bounds.minX * CELL - 4;
    const y = PAD + bounds.minY * CELL - 4;
    const w = (bounds.maxX - bounds.minX) * CELL + 8;
    const h = (bounds.maxY - bounds.minY) * CELL + 8;
    rects.push(
      <g key={`group-${group}`}>
        <rect x={x} y={y} width={w} height={h} rx={4}
          fill="none" stroke="#2a2a2a" strokeWidth={1} strokeDasharray="4 2" />
        <text x={x + 4} y={y - 2} fill="#444" fontSize={8} fontFamily="monospace">
          {group}
        </text>
      </g>,
    );
  });

  return <>{rects}</>;
}
