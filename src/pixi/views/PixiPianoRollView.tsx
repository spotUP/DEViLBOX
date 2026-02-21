/**
 * PixiPianoRollView — Piano roll view for WebGL mode.
 * Layout: Toolbar (top) | [Piano keyboard | Note grid] (flex row) | Velocity lane
 */

import { useCallback, useMemo, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { usePixiTheme } from '../theme';
import { PixiButton, PixiLabel } from '../components';
import { PixiPianoKeyboard } from './pianoroll/PixiPianoKeyboard';
import { PixiPianoRollGrid } from './pianoroll/PixiPianoRollGrid';
import { PixiVelocityLane } from './pianoroll/PixiVelocityLane';
import { usePianoRollStore } from '@stores';
import { useTrackerStore } from '@stores';

const VELOCITY_HEIGHT = 80;
const TOOLBAR_HEIGHT = 36;
const KEYBOARD_WIDTH = 60;

const GRID_DIVISIONS = [1, 2, 4, 8, 16];

export const PixiPianoRollView: React.FC = () => {
  const theme = usePixiTheme();
  const tool = usePianoRollStore(s => s.tool);
  const setTool = usePianoRollStore(s => s.setTool);
  const view = usePianoRollStore(s => s.view);
  // Version counter to force note recalculation after edits
  const [noteVersion, setNoteVersion] = useState(0);
  const handleNotesChanged = useCallback(() => setNoteVersion(v => v + 1), []);

  // Get notes from the current pattern/channel
  const notes = useMemo(() => {
    const ts = useTrackerStore.getState();
    const pat = ts.patterns[ts.currentPatternIndex];
    if (!pat) return [];
    const ch = pat.channels[view.channelIndex];
    if (!ch) return [];
    // Convert tracker rows to piano roll note format
    const result: { note: number; start: number; duration: number; velocity: number }[] = [];
    for (let row = 0; row < pat.length; row++) {
      const cell = ch.rows[row];
      if (cell && cell.note > 0 && cell.note < 97) {
        // Find note-off or next note to determine duration
        let dur = 1;
        for (let r = row + 1; r < pat.length; r++) {
          const next = ch.rows[r];
          if (next && (next.note > 0 || next.note === 97)) break;
          dur++;
        }
        result.push({
          note: cell.note + 11, // Convert tracker note to MIDI
          start: row,
          duration: dur,
          velocity: cell.volume !== null ? cell.volume : 64,
        });
      }
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.channelIndex, noteVersion]);

  const handleCycleGrid = useCallback(() => {
    const s = usePianoRollStore.getState();
    const idx = GRID_DIVISIONS.indexOf(s.view.gridDivision);
    const next = GRID_DIVISIONS[(idx + 1) % GRID_DIVISIONS.length];
    s.setGridDivision(next);
  }, []);

  const handleToggleSnap = useCallback(() => {
    usePianoRollStore.setState(state => {
      state.view.snapToGrid = !state.view.snapToGrid;
    });
  }, []);

  const drawToolbarBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, 4000, TOOLBAR_HEIGHT);
    g.fill({ color: theme.bgSecondary.color });
    g.rect(0, TOOLBAR_HEIGHT - 1, 4000, 1);
    g.fill({ color: theme.border.color, alpha: theme.border.alpha });
  }, [theme]);

  return (
    <pixiContainer
      layout={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
      }}
    >
      {/* Toolbar */}
      <pixiContainer
        layout={{
          width: '100%',
          height: TOOLBAR_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 8,
          gap: 6,
        }}
      >
        <pixiGraphics draw={drawToolbarBg} layout={{ position: 'absolute', width: '100%', height: TOOLBAR_HEIGHT }} />

        <PixiLabel text="PIANO ROLL" size="sm" weight="bold" color="accent" />

        <PixiButton
          label="Select"
          variant={tool === 'select' ? 'ft2' : 'ghost'}
          color={tool === 'select' ? 'blue' : undefined}
          size="sm"
          active={tool === 'select'}
          onClick={() => setTool('select')}
        />
        <PixiButton
          label="Draw"
          variant={tool === 'draw' ? 'ft2' : 'ghost'}
          color={tool === 'draw' ? 'green' : undefined}
          size="sm"
          active={tool === 'draw'}
          onClick={() => setTool('draw')}
        />
        <PixiButton
          label="Erase"
          variant={tool === 'erase' ? 'ft2' : 'ghost'}
          color={tool === 'erase' ? 'red' : undefined}
          size="sm"
          active={tool === 'erase'}
          onClick={() => setTool('erase')}
        />

        <PixiButton
          label={`Grid:1/${view.gridDivision}`}
          variant="ghost"
          size="sm"
          onClick={handleCycleGrid}
        />
        <PixiButton
          label={view.snapToGrid ? 'Snap:ON' : 'Snap:OFF'}
          variant={view.snapToGrid ? 'ft2' : 'ghost'}
          color={view.snapToGrid ? 'blue' : undefined}
          size="sm"
          active={view.snapToGrid}
          onClick={handleToggleSnap}
        />

        <pixiContainer layout={{ flex: 1 }} />

        <PixiLabel
          text={`Ch ${view.channelIndex + 1}`}
          size="xs"
          color="textMuted"
          layout={{ marginRight: 8 }}
        />
      </pixiContainer>

      {/* Main area: Keyboard | Grid */}
      <pixiContainer
        layout={{
          flex: 1,
          width: '100%',
          flexDirection: 'row',
        }}
      >
        <PixiPianoKeyboard width={KEYBOARD_WIDTH} height={4000} />
        <PixiPianoRollGrid
          width={4000}
          height={4000}
          notes={notes}
          onNotesChanged={handleNotesChanged}
        />
      </pixiContainer>

      {/* Velocity lane */}
      <PixiVelocityLane
        width={4000}
        height={VELOCITY_HEIGHT}
        notes={notes.map(n => ({ start: n.start, velocity: n.velocity }))}
      />
    </pixiContainer>
  );
};
