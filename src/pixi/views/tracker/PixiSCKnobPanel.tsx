/**
 * PixiSCKnobPanel — Collapsible SuperCollider param panel rendered in PixiJS.
 *
 * Appears ABOVE the pattern editor when a SuperCollider instrument is active.
 * Two states:
 *   - Collapsed: 36px bar — SynthDef name + expand button
 *   - Expanded:  Full param slider panel (up to 8 params visible)
 *
 * Mirrors: src/pixi/views/tracker/PixiTB303KnobPanel.tsx
 */

import React, { useCallback, useState } from 'react';
import { usePixiTheme } from '../../theme';
import { PixiKnob, PixiButton, PixiLabel } from '../../components';
import { useInstrumentStore, useUIStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';

// ─── Heights ─────────────────────────────────────────────────────────────────

const COLLAPSED_H = 36;
const KNOB_ROW_H = 84;
const HEADER_H = 32;
const EXPANDED_H = HEADER_H + KNOB_ROW_H + 4;

export const SC_PANEL_COLLAPSED_H = COLLAPSED_H;
export const SC_PANEL_EXPANDED_H = EXPANDED_H;

// ─── Accent color (SC green) ────────────────────────────────────────────────

const SC_GREEN = 0x00cc66;

// ─── Props ───────────────────────────────────────────────────────────────────

interface PixiSCKnobPanelProps {
  width: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const PixiSCKnobPanel: React.FC<PixiSCKnobPanelProps> = ({ width }) => {
  const theme = usePixiTheme();

  const { scCollapsed, toggleSCCollapsed } = useUIStore(
    useShallow((s) => ({
      scCollapsed: s.scCollapsed ?? true,
      toggleSCCollapsed: s.toggleSCCollapsed,
    }))
  );

  const { instruments, updateInstrument } = useInstrumentStore(
    useShallow((s) => ({
      instruments: s.instruments,
      updateInstrument: s.updateInstrument,
    }))
  );

  // Find first SuperCollider instrument
  const scInstrument = instruments.find((i) => i.synthType === 'SuperCollider');
  const scConfig = scInstrument?.superCollider;
  const params = scConfig?.params ?? [];
  const synthDefName = scConfig?.synthDefName ?? 'SC';

  // Param knob page (show 8 at a time)
  const [paramPage, setParamPage] = useState(0);
  const KNOBS_PER_PAGE = Math.max(1, Math.floor((width - 160) / 72));
  const totalPages = Math.max(1, Math.ceil(params.length / KNOBS_PER_PAGE));
  const visibleParams = params.slice(paramPage * KNOBS_PER_PAGE, (paramPage + 1) * KNOBS_PER_PAGE);

  const handleParamChange = useCallback(
    (paramName: string, value: number) => {
      if (!scInstrument || !scConfig) return;
      const latest = useInstrumentStore
        .getState()
        .instruments.find((i) => i.id === scInstrument.id);
      if (!latest?.superCollider) return;
      const updatedParams = latest.superCollider.params.map((p) =>
        p.name === paramName ? { ...p, value } : p
      );
      updateInstrument(scInstrument.id, {
        superCollider: { ...latest.superCollider, params: updatedParams },
      });
    },
    [scInstrument, scConfig, updateInstrument]
  );

  if (!scInstrument) return null;

  const isCollapsed = scCollapsed;
  const panelH = isCollapsed ? COLLAPSED_H : EXPANDED_H;

  return (
    <layoutContainer
      layout={{
        width,
        height: panelH,
        flexDirection: 'column',
        backgroundColor: theme.bgSecondary.color,
        borderBottomWidth: 1,
        borderColor: theme.border.color,
      }}
    >
      {/* Header bar */}
      <layoutContainer
        layout={{
          width,
          height: isCollapsed ? COLLAPSED_H : HEADER_H,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 12,
          paddingRight: 8,
          gap: 8,
        }}
      >
        {/* SC badge */}
        <layoutContainer
          layout={{
            backgroundColor: SC_GREEN,
            paddingLeft: 6,
            paddingRight: 6,
            paddingTop: 2,
            paddingBottom: 2,
            borderRadius: 3,
          }}
        >
          <PixiLabel text="SC" size="xs" weight="bold" color="custom" customColor={0x000000} />
        </layoutContainer>

        <PixiLabel
          text={`\\${synthDefName}`}
          size="sm"
          weight="bold"
          color="text"
        />

        <PixiLabel
          text={`${params.length} params`}
          size="xs"
          color="textMuted"
        />

        {/* Spacer */}
        <layoutContainer layout={{ flex: 1 }} />

        {/* Page navigation */}
        {!isCollapsed && totalPages > 1 && (
          <>
            <PixiButton
              label="<"
              variant="ghost"
              size="sm"
              onClick={() => setParamPage(Math.max(0, paramPage - 1))}
              disabled={paramPage === 0}
            />
            <PixiLabel
              text={`${paramPage + 1}/${totalPages}`}
              size="xs"
              color="textMuted"
            />
            <PixiButton
              label=">"
              variant="ghost"
              size="sm"
              onClick={() => setParamPage(Math.min(totalPages - 1, paramPage + 1))}
              disabled={paramPage >= totalPages - 1}
            />
          </>
        )}

        {/* Expand/collapse */}
        <PixiButton
          label={isCollapsed ? '▾' : '▴'}
          variant="ghost"
          size="sm"
          onClick={toggleSCCollapsed}
        />
      </layoutContainer>

      {/* Param knobs row */}
      {!isCollapsed && (
        <layoutContainer
          layout={{
            width,
            height: KNOB_ROW_H,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingLeft: 12,
            paddingRight: 12,
            gap: 8,
            borderTopWidth: 1,
            borderColor: theme.border.color,
          }}
        >
          {visibleParams.map((param) => (
            <layoutContainer
              key={param.name}
              layout={{
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                width: 64,
              }}
            >
              <PixiKnob
                value={param.value}
                min={param.min}
                max={param.max}
                onChange={(v) => handleParamChange(param.name, v)}
                size="sm"
                color={SC_GREEN}
                label={param.name.length > 8 ? param.name.slice(0, 7) + '…' : param.name}
                formatValue={(v) => String(Number(v.toPrecision(3)))}
              />
            </layoutContainer>
          ))}

          {params.length === 0 && (
            <PixiLabel text="Compile SynthDef to see params" size="xs" color="textMuted" />
          )}
        </layoutContainer>
      )}
    </layoutContainer>
  );
};
