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
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CELL = 32; // pixels per grid unit
const PAD = 16;  // padding around the layout
const ENCODER_R = 12;
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
// CONTROL RENDERERS
// ============================================================================

const EncoderControl: React.FC<{
  control: ControlDescriptor;
  color: { bg: string; border: string; text: string };
  label: string;
  onClick: () => void;
}> = ({ control, color, label, onClick }) => {
  const cx = PAD + control.x * CELL + CELL;
  const cy = PAD + control.y * CELL + CELL / 2;

  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
      {/* Ring LED background */}
      {control.hasRingLed && (
        <circle cx={cx} cy={cy} r={ENCODER_R + 4} fill="none" stroke={color.border} strokeWidth={2} opacity={0.3} />
      )}
      {/* Encoder body */}
      <circle cx={cx} cy={cy} r={ENCODER_R} fill={color.bg} stroke={color.border} strokeWidth={1.5} />
      {/* Pointer line */}
      <line x1={cx} y1={cy - ENCODER_R + 3} x2={cx} y2={cy - 3} stroke={color.text} strokeWidth={2} strokeLinecap="round" />
      {/* Label */}
      <text x={cx} y={cy + ENCODER_R + 12} fill={color.text} fontSize={8} fontFamily="monospace" textAnchor="middle">
        {label || control.label || control.id}
      </text>
    </g>
  );
};

const ButtonControl: React.FC<{
  control: ControlDescriptor;
  color: { bg: string; border: string; text: string };
  label: string;
  onClick: () => void;
}> = ({ control, color, label, onClick }) => {
  const x = PAD + control.x * CELL + CELL - BUTTON_SIZE / 2;
  const y = PAD + control.y * CELL + CELL / 2 - BUTTON_SIZE / 2;

  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
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
      <text x={x + BUTTON_SIZE / 2} y={y + BUTTON_SIZE + 11} fill={color.text}
        fontSize={7} fontFamily="monospace" textAnchor="middle">
        {(label || control.label || '').substring(0, 8)}
      </text>
    </g>
  );
};

const FaderControl: React.FC<{
  control: ControlDescriptor;
  color: { bg: string; border: string; text: string };
  label: string;
  onClick: () => void;
}> = ({ control, color, label, onClick }) => {
  const h = (control.h ?? 4) * CELL - 8;
  const x = PAD + control.x * CELL + CELL - FADER_W / 2;
  const y = PAD + control.y * CELL + 4;

  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
      {/* Fader track */}
      <rect x={x + FADER_W / 2 - 2} y={y} width={4} height={h} rx={2}
        fill="#222" stroke="#444" strokeWidth={0.5} />
      {/* Fader knob */}
      <rect x={x} y={y + h * 0.3} width={FADER_W} height={20} rx={3}
        fill={color.bg} stroke={color.border} strokeWidth={1.5} />
      {/* Label below */}
      <text x={x + FADER_W / 2} y={y + h + 14} fill={color.text}
        fontSize={8} fontFamily="monospace" textAnchor="middle">
        {label || control.label || control.id}
      </text>
    </g>
  );
};

const PadControl: React.FC<{
  control: ControlDescriptor;
  color: { bg: string; border: string; text: string };
  label: string;
  onClick: () => void;
}> = ({ control, color, label, onClick }) => {
  const size = BUTTON_SIZE + 8;
  const x = PAD + control.x * CELL + CELL - size / 2;
  const y = PAD + control.y * CELL + CELL / 2 - size / 2;

  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
      <rect x={x} y={y} width={size} height={size} rx={4}
        fill={color.bg} stroke={color.border} strokeWidth={2} />
      <text x={x + size / 2} y={y + size + 12} fill={color.text}
        fontSize={7} fontFamily="monospace" textAnchor="middle">
        {(label || control.label || '').substring(0, 8)}
      </text>
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
}) => {
  const svgWidth = layout.width * CELL + PAD * 2;
  const svgHeight = layout.height * CELL + PAD * 2;

  const handleClick = useCallback((control: ControlDescriptor) => {
    onSelectControl(control);
  }, [onSelectControl]);

  // Group controls by type for layered rendering (faders behind buttons/encoders)
  const renderOrder: ControlDescriptor[] = [
    ...layout.controls.filter(c => c.type === 'fader'),
    ...layout.controls.filter(c => c.type === 'pad'),
    ...layout.controls.filter(c => c.type === 'button'),
    ...layout.controls.filter(c => c.type === 'encoder'),
  ];

  return (
    <svg
      width={svgWidth}
      height={svgHeight}
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      className="select-none"
    >
      {/* Background panel */}
      <rect x={0} y={0} width={svgWidth} height={svgHeight} rx={8}
        fill="#1a1a1a" stroke="#333" strokeWidth={1} />

      {/* Controller name */}
      <text x={PAD} y={PAD - 3} fill="#666" fontSize={10} fontFamily="monospace">
        {layout.manufacturer} {layout.name}
      </text>

      {/* Group separators */}
      {renderGroupBackgrounds(layout)}

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

function renderGroupBackgrounds(layout: ControllerLayout): React.ReactNode {
  const groups = new Map<string, { minX: number; minY: number; maxX: number; maxY: number }>();

  for (const control of layout.controls) {
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
