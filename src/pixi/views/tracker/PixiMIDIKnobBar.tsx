/**
 * PixiMIDIKnobBar — Compact MIDI CC knob assignment bar for WebGL mode.
 * Shows 4 bank tabs + 8-column knob assignment grid.
 */

import { useCallback, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme } from '../../theme';
import { PixiButton } from '../../components';
import { useMIDIStore } from '@/stores/useMIDIStore';
import { KNOB_BANKS, type KnobAssignment } from '@/midi/knobBanks';
import type { KnobBankMode } from '@/midi/types';

const BAR_HEIGHT_COLLAPSED = 20;
const BAR_HEIGHT_EXPANDED = 56;

interface PixiMIDIKnobBarProps {
  width: number;
}

const BANKS: { id: KnobBankMode; label: string }[] = [
  { id: '303', label: '303' },
  { id: 'Siren', label: 'SIR' },
  { id: 'FX', label: 'FX' },
  { id: 'Mixer', label: 'MIX' },
];

export const PixiMIDIKnobBar: React.FC<PixiMIDIKnobBarProps> = ({ width }) => {
  const theme = usePixiTheme();
  const knobBank = useMIDIStore(s => s.knobBank);
  const setKnobBank = useMIDIStore(s => s.setKnobBank);
  const isInitialized = useMIDIStore(s => s.isInitialized);
  const inputDevices = useMIDIStore(s => s.inputDevices);
  const showKnobBar = useMIDIStore(s => s.showKnobBar);
  const setShowKnobBar = useMIDIStore(s => s.setShowKnobBar);

  if (!isInitialized || inputDevices.length === 0) return null;

  const currentAssignments = KNOB_BANKS[knobBank];
  const barHeight = showKnobBar ? BAR_HEIGHT_EXPANDED : BAR_HEIGHT_COLLAPSED;

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, barHeight);
    g.fill({ color: theme.bgTertiary.color });
    g.rect(0, 0, width, 1);
    g.fill({ color: theme.border.color, alpha: theme.border.alpha });
  }, [width, barHeight, theme]);

  const handleToggle = useCallback(() => {
    setShowKnobBar(!showKnobBar);
  }, [showKnobBar, setShowKnobBar]);

  return (
    <pixiContainer layout={{ width, height: barHeight, flexDirection: 'column' }}>
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height: barHeight }} />

      {/* Header row */}
      <pixiContainer layout={{ width, height: BAR_HEIGHT_COLLAPSED, flexDirection: 'row', alignItems: 'center', paddingLeft: 8, gap: 4 }}>
        <pixiBitmapText
          text="MIDI"
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 8, fill: 0xffffff }}
          tint={theme.success.color}
          layout={{}}
        />

        {showKnobBar && BANKS.map(bank => (
          <PixiButton
            key={bank.id}
            label={bank.label}
            variant={knobBank === bank.id ? 'ft2' : 'ghost'}
            color={knobBank === bank.id ? 'blue' : undefined}
            size="sm"
            active={knobBank === bank.id}
            onClick={() => setKnobBank(bank.id)}
          />
        ))}

        <pixiContainer layout={{ flex: 1 }} />

        <PixiButton
          label={showKnobBar ? 'HIDE' : 'SHOW'}
          variant="ghost"
          size="sm"
          onClick={handleToggle}
        />
      </pixiContainer>

      {/* Knob assignments grid */}
      {showKnobBar && (
        <pixiContainer layout={{ width, height: 36, flexDirection: 'row', paddingLeft: 8, paddingRight: 8, gap: 4, alignItems: 'center' }}>
          {currentAssignments.map((assignment: KnobAssignment, index: number) => (
            <KnobCell key={index} assignment={assignment} index={index} />
          ))}
        </pixiContainer>
      )}
    </pixiContainer>
  );
};

/** Individual knob cell with hover highlight + top accent bar (matches DOM) */
const KnobCell: React.FC<{ assignment: KnobAssignment; index: number }> = ({ assignment, index }) => {
  const theme = usePixiTheme();
  const [hovered, setHovered] = useState(false);

  const drawCellBg = useCallback((g: GraphicsType) => {
    g.clear();
    // Top accent bar (matches DOM's h-[2px] bg-accent-primary)
    g.rect(0, 0, 80, 2);
    g.fill({ color: theme.accent.color, alpha: hovered ? 0.5 : 0.2 });
    // Cell background on hover
    if (hovered) {
      g.roundRect(0, 2, 80, 30, 3);
      g.fill({ color: theme.accent.color, alpha: 0.1 });
    }
  }, [hovered, theme]);

  return (
    <pixiContainer
      eventMode="static"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      layout={{ flex: 1, height: 32, flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
    >
      <pixiGraphics draw={drawCellBg} layout={{ position: 'absolute', width: 80, height: 32 }} />
      <pixiBitmapText
        text={`K${index + 1} (CC ${assignment.cc})`}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 7, fill: 0xffffff }}
        tint={hovered ? theme.textSecondary.color : theme.textMuted.color}
        layout={{}}
      />
      <pixiBitmapText
        text={assignment.label.toUpperCase().slice(0, 8)}
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 8, fill: 0xffffff }}
        tint={theme.accent.color}
        layout={{}}
      />
    </pixiContainer>
  );
};
