/**
 * NibblesGame - 1:1 port of FastTracker 2 Nibbles game
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { NIBBLES_LEVELS } from './nibblesLevels';
import { scoreLibrary, type NibblesScore } from '@/lib/scoreLibrary';

interface NibblesGameProps {
  height?: number;
  onExit?: () => void;
}

const NI_SPEEDS = [12, 8, 6, 4]; // Novice, Average, Pro, Up Rough (60Hz ticks)
const WIDTH = 51;
const HEIGHT = 23;

// Colors matching FT2 bmpCustomPalette
const PALETTE = [
  '#000000', // 0: Background
  '#5397FF', // 1
  '#000067', // 2
  '#4BFFFF', // 3
  '#AB7787', // 4
  '#FFFFFF', // 5: Food numbers
  '#7F7F7F', // 6: P1 Head
  '#ABCDEF', // 7: P2 Head
  '#733747', // 8
  '#F7CBDB', // 9
  '#434343', // 10
  '#D3D3D3', // 11
  '#FFFF00', // 12
];

type Coord = { x: number; y: number };

export const NibblesGame: React.FC<NibblesGameProps> = ({ height = 100, onExit }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [actualWidth, setActualWidth] = useState(408);
  const [actualHeight, setActualHeight] = useState(height);
  
  // UI Sync State (for rendering only)
  const [uiState, setUiSync] = useState({
    level: 0,
    score1: 0,
    score2: 0,
    lives1: 3,
    lives2: 3,
    isPlaying: false,
    showMenu: false,
    showHighScores: false,
  });

  const [speed, setSpeed] = useState(1); // Average
  const [numPlayers, setNumPlayers] = useState(1);
  const [wrap, setWrap] = useState(false);
  const [grid, setGrid] = useState(true);
  const [surround, setSurround] = useState(false);
  const [highScores, setHighScores] = useState<NibblesScore[]>([]);
  
  // Refs for core game logic (to keep the loop stable)
  const levelRef = useRef(0);
  const score1Ref = useRef(0);
  const score2Ref = useRef(0);
  const lives1Ref = useRef(3);
  const lives2Ref = useRef(3);
  const isPlayingRef = useRef(false);

  const gridRef = useRef<number[][]>([]);
  const p1Ref = useRef<(Coord | null)[]>([]);
  const p2Ref = useRef<(Coord | null)[]>([]);
  const p1DirRef = useRef(0);
  const p2DirRef = useRef(0);
  const p1LenRef = useRef(5);
  const p2LenRef = useRef(5);
  const p1NoClearRef = useRef(0);
  const p2NoClearRef = useRef(0);
  const currentNumberRef = useRef(0);
  
  const inputBuffer1 = useRef<number[]>([]);
  const inputBuffer2 = useRef<number[]>([]);
  const animationRef = useRef<number | null>(null);

  // Sync refs to UI state for display
  const syncUI = useCallback(() => {
    setUiSync({
      level: levelRef.current,
      score1: score1Ref.current,
      score2: score2Ref.current,
      lives1: lives1Ref.current,
      lives2: lives2Ref.current,
      isPlaying: isPlayingRef.current,
      showMenu: false, // Updated separately
      showHighScores: false, // Updated separately
    });
  }, []);

  const setShowMenu = (val: boolean) => setUiSync(prev => ({ ...prev, showMenu: val }));
  const setShowHighScores = (val: boolean) => setUiSync(prev => ({ ...prev, showHighScores: val }));
  const setIsPlaying = (val: boolean) => {
    isPlayingRef.current = val;
    setUiSync(prev => ({ ...prev, isPlaying: val }));
  };

  // Load scores
  const loadHighScores = useCallback(async () => {
    const scores = await scoreLibrary.getTopScores(10);
    setHighScores(scores);
  }, []);

  useEffect(() => {
    requestAnimationFrame(() => loadHighScores());
  }, [loadHighScores]);

  // Resize handler
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setActualWidth(containerRef.current.clientWidth);
        setActualHeight(containerRef.current.clientHeight);
      }
    };
    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    return () => resizeObserver.disconnect();
  }, []);

  const spawnFood = useCallback(() => {
    let attempts = 0;
    while (attempts < 1000) {
      const x = Math.floor(Math.random() * WIDTH);
      const y = Math.floor(Math.random() * HEIGHT);
      const cell = gridRef.current[y]?.[x];
      const cellBelow = y < HEIGHT - 1 ? gridRef.current[y + 1]?.[x] : 0;
      const suitable = cell === 0 && (y === HEIGHT - 1 || cellBelow === 0);
      if (suitable) {
        currentNumberRef.current++;
        gridRef.current[y][x] = 16 + currentNumberRef.current;
        return;
      }
      attempts++;
    }
  }, []);

  // Initialize Level
  const initLevel = useCallback((lvlIdx: number) => {
    const lvlData = NIBBLES_LEVELS[lvlIdx % NIBBLES_LEVELS.length];
    const newGrid = lvlData.grid.map(row => [...row]);

    let x1 = 2, y1 = 2, x2 = 48, y2 = 20;
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const val = newGrid[y]?.[x];
        if (val === 6) { x1 = x; y1 = y; newGrid[y][x] = 0; }
        if (val === 7) { x2 = x; y2 = y; newGrid[y][x] = 0; }
      }
    }

    gridRef.current = newGrid;

    const mapDir = (d: number) => {
      if (d === 0) return 2; // Left
      if (d === 5) return 3; // Down
      if (d === 6) return 0; // Right
      if (d === 7) return 1; // Up
      return 0;
    };

    p1DirRef.current = mapDir(lvlData.p1Dir);
    p2DirRef.current = mapDir(lvlData.p2Dir);

    p1Ref.current = Array(256).fill(null).map(() => ({ x: x1, y: y1 }));
    p2Ref.current = Array(256).fill(null).map(() => ({ x: x2, y: y2 }));

    p1LenRef.current = 5;
    p2LenRef.current = 5;
    p1NoClearRef.current = 0;
    p2NoClearRef.current = 0;
    currentNumberRef.current = 0;

    if (gridRef.current[y1]) gridRef.current[y1][x1] = 6;
    if (numPlayers === 2 && gridRef.current[y2]) gridRef.current[y2][x2] = 7;

    inputBuffer1.current = [];
    inputBuffer2.current = [];

    if (!surround) spawnFood();
  }, [numPlayers, surround, spawnFood]);

  // Handle Game Over
  const handleGameOver = useCallback(async () => {
    setIsPlaying(false);

    // Sync final values for highscore check
    const s1 = score1Ref.current;
    const s2 = score2Ref.current;
    const lvl = levelRef.current;

    const lowestTopScore = highScores.length < 10 ? 0 : highScores[highScores.length - 1].score;

    if (s1 > lowestTopScore) {
      const name = prompt("Player 1 - Enter your name for the highscore:", "Player 1");
      if (name) {
        await scoreLibrary.saveScore({
          name,
          score: s1,
          level: lvl + 1,
          players: numPlayers,
          speed: speed
        });
      }
    }

    if (numPlayers === 2 && s2 > lowestTopScore) {
      const name = prompt("Player 2 - Enter your name for the highscore:", "Player 2");
      if (name) {
        await scoreLibrary.saveScore({
          name,
          score: s2,
          level: lvl + 1,
          players: numPlayers,
          speed: speed
        });
      }
    }

    loadHighScores();
    setShowHighScores(true);

    // Reset Game State
    levelRef.current = 0;
    score1Ref.current = 0;
    score2Ref.current = 0;
    lives1Ref.current = 3;
    lives2Ref.current = 3;
    initLevel(0);
    syncUI();
  }, [numPlayers, speed, highScores, loadHighScores, syncUI, initLevel]);

  const isInvalid = useCallback((currentX: number, currentY: number, d: number) => {
    // Calculate the next position
    let nextX = currentX;
    let nextY = currentY;
    if (d === 0) nextX++;
    else if (d === 1) nextY--;
    else if (d === 2) nextX--;
    else if (d === 3) nextY++;

    // Check if next position is out of bounds (when not wrapping)
    if (!wrap) {
      if (nextX < 0 || nextX >= WIDTH || nextY < 0 || nextY >= HEIGHT) {
        return true;
      }
    } else {
      // Wrap coordinates for collision check
      if (nextX < 0) nextX = WIDTH - 1;
      if (nextX >= WIDTH) nextX = 0;
      if (nextY < 0) nextY = HEIGHT - 1;
      if (nextY >= HEIGHT) nextY = 0;
    }

    // Check if next position has an obstacle
    const cell = gridRef.current[nextY]?.[nextX];
    return cell >= 1 && cell <= 15;
  }, [wrap]);

  const move = useCallback(() => {
    if (!isPlayingRef.current) return;

    if (inputBuffer1.current.length > 0) {
      const d = inputBuffer1.current.shift()!;
      if (!((d === 0 && p1DirRef.current === 2) || (d === 2 && p1DirRef.current === 0) || 
            (d === 1 && p1DirRef.current === 3) || (d === 3 && p1DirRef.current === 1))) {
        p1DirRef.current = d;
      }
    }
    if (numPlayers === 2 && inputBuffer2.current.length > 0) {
      const d = inputBuffer2.current.shift()!;
      if (!((d === 0 && p2DirRef.current === 2) || (d === 2 && p2DirRef.current === 0) || 
            (d === 1 && p2DirRef.current === 3) || (d === 3 && p2DirRef.current === 1))) {
        p2DirRef.current = d;
      }
    }

    const updateCoord = (head: Coord, dir: number) => {
      let { x, y } = head;
      if (dir === 0) x++;
      else if (dir === 1) y--;
      else if (dir === 2) x--;
      else if (dir === 3) y++;
      if (x < 0) x = WIDTH - 1;
      if (x >= WIDTH) x = 0;
      if (y < 0) y = HEIGHT - 1;
      if (y >= HEIGHT) y = 0;
      return { x, y };
    };

    // Check collision from current position before moving
    const die1 = isInvalid(p1Ref.current[0]!.x, p1Ref.current[0]!.y, p1DirRef.current);
    const die2 = numPlayers === 2 ? isInvalid(p2Ref.current[0]!.x, p2Ref.current[0]!.y, p2DirRef.current) : false;

    const nextP1 = updateCoord(p1Ref.current[0]!, p1DirRef.current);
    const nextP2 = numPlayers === 2 ? updateCoord(p2Ref.current[0]!, p2DirRef.current) : null;
    const headOnHead = nextP2 && nextP1.x === nextP2.x && nextP1.y === nextP2.y;
    
    if (die1 || die2 || headOnHead) {
      lives1Ref.current -= (die1 || headOnHead) ? 1 : 0;
      lives2Ref.current -= (die2 || headOnHead) ? 1 : 0;
      if (lives1Ref.current <= 0 || (numPlayers === 2 && lives2Ref.current <= 0)) {
        handleGameOver();
      } else {
        setIsPlaying(false);
        initLevel(levelRef.current);
        syncUI();
      }
      return;
    }

    // Process Food
    let p1Eating = false;
    let p2Eating = false;

    const cell1 = gridRef.current[nextP1.y][nextP1.x];
    if (cell1 >= 16) {
      score1Ref.current += (cell1 - 16) * 999 * (levelRef.current + 1);
      p1NoClearRef.current = p1LenRef.current >> 1;
      p1Eating = true;
    }

    if (nextP2) {
      const cell2 = gridRef.current[nextP2.y][nextP2.x];
      if (cell2 >= 16) {
        score2Ref.current += (cell2 - 16) * 999 * (levelRef.current + 1);
        p2NoClearRef.current = p2LenRef.current >> 1;
        p2Eating = true;
      }
    }

    if (p1Eating || p2Eating) {
      if (currentNumberRef.current === 9) {
        levelRef.current++;
        initLevel(levelRef.current);
        syncUI();
        return;
      } else {
        spawnFood();
      }
    }

    // Advance bodies
    for (let i = 255; i > 0; i--) {
      const prev1 = p1Ref.current[i-1];
      p1Ref.current[i] = prev1 ? { x: prev1.x, y: prev1.y } : null;
      if (numPlayers === 2) {
        const prev2 = p2Ref.current[i-1];
        p2Ref.current[i] = prev2 ? { x: prev2.x, y: prev2.y } : null;
      }
    }
    p1Ref.current[0] = nextP1;
    if (nextP2) p2Ref.current[0] = nextP2;

    // Handle Trail
    if (!surround) {
      if (p1NoClearRef.current > 0 && p1LenRef.current < 255) {
        p1NoClearRef.current--;
        p1LenRef.current++;
      } else {
        const tail = p1Ref.current[p1LenRef.current];
        if (tail && gridRef.current[tail.y]) {
          gridRef.current[tail.y][tail.x] = 0;
        }
      }

      if (numPlayers === 2) {
        if (p2NoClearRef.current > 0 && p2LenRef.current < 255) {
          p2NoClearRef.current--;
          p2LenRef.current++;
        } else {
          const tail = p2Ref.current[p2LenRef.current];
          if (tail && gridRef.current[tail.y]) {
            gridRef.current[tail.y][tail.x] = 0;
          }
        }
      }
    }

    score1Ref.current = Math.max(0, score1Ref.current - 17);
    if (numPlayers === 2) score2Ref.current = Math.max(0, score2Ref.current - 17);

    // Update Grid
    if (gridRef.current[nextP1.y]) {
      gridRef.current[nextP1.y][nextP1.x] = 6;
    }
    if (nextP2 && gridRef.current[nextP2.y]) {
      gridRef.current[nextP2.y][nextP2.x] = 7;
    }

    syncUI();
  }, [numPlayers, wrap, surround, initLevel, handleGameOver, syncUI, isInvalid]);

  // Main Loop
  useEffect(() => {
    let lastTick = 0;
    const tick = (now: number) => {
      if (isPlayingRef.current) {
        if (now - lastTick >= (NI_SPEEDS[speed] * 16.67)) {
          lastTick = now;
          move();
        }
      }
      animationRef.current = requestAnimationFrame(tick);
    };
    animationRef.current = requestAnimationFrame(tick);
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [speed, move]);

  // Key Handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPlayingRef.current) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); inputBuffer1.current.push(0); }
      if (e.key === 'ArrowUp')    { e.preventDefault(); inputBuffer1.current.push(1); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); inputBuffer1.current.push(2); }
      if (e.key === 'ArrowDown')  { e.preventDefault(); inputBuffer1.current.push(3); }
      if (e.key.toLowerCase() === 'd') { e.preventDefault(); inputBuffer2.current.push(0); }
      if (e.key.toLowerCase() === 'w') { e.preventDefault(); inputBuffer2.current.push(1); }
      if (e.key.toLowerCase() === 'a') { e.preventDefault(); inputBuffer2.current.push(2); }
      if (e.key.toLowerCase() === 's') { e.preventDefault(); inputBuffer2.current.push(3); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Canvas Drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let isRunning = true;
    let renderFrameId: number | null = null;

    const render = () => {
      if (!isRunning) return;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (uiState.showMenu || uiState.showHighScores) {
        renderFrameId = requestAnimationFrame(render);
        return;
      }
      const cellSize = Math.min(canvas.width / WIDTH, canvas.height / HEIGHT);
      const playWidth = WIDTH * cellSize;
      const playHeight = HEIGHT * cellSize;
      const offsetX = (canvas.width - playWidth) / 2;
      const offsetY = (canvas.height - playHeight) / 2;

      // Draw playfield border
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.3)'; // cyan-500/30
      ctx.lineWidth = 2;
      ctx.strokeRect(offsetX, offsetY, playWidth, playHeight);

      for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
          const val = gridRef.current[y]?.[x];
          if (val === undefined || val === 0) continue;
          const px = offsetX + x * cellSize;
          const py = offsetY + y * cellSize;
          if (val >= 16) {
            // Food: Draw filled cell with number (same size as worm segment)
            if (grid) {
              ctx.fillStyle = '#222';
              ctx.fillRect(px, py, cellSize, cellSize);
              ctx.fillStyle = PALETTE[12]; // Yellow background
              ctx.fillRect(px + 1, py + 1, cellSize - 1, cellSize - 1);
            } else {
              ctx.fillStyle = PALETTE[12]; // Yellow background
              ctx.fillRect(px, py, cellSize, cellSize);
            }
            // Draw number on top
            ctx.fillStyle = '#000'; // Black text for contrast
            ctx.font = `bold ${Math.floor(cellSize * 0.7)}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText((val - 16).toString(), px + cellSize / 2, py + cellSize / 2 + 1);
          } else {
            if (grid) {
              ctx.fillStyle = '#222';
              ctx.fillRect(px, py, cellSize, cellSize);
              ctx.fillStyle = PALETTE[val] || '#fff';
              ctx.fillRect(px + 1, py + 1, cellSize - 1, cellSize - 1);
            } else {
              ctx.fillStyle = PALETTE[val] || '#fff';
              ctx.fillRect(px, py, cellSize, cellSize);
            }
          }
        }
      }
      renderFrameId = requestAnimationFrame(render);
    };
    renderFrameId = requestAnimationFrame(render);
    return () => {
      isRunning = false;
      if (renderFrameId !== null) cancelAnimationFrame(renderFrameId);
    };
  }, [grid, uiState.showMenu, uiState.showHighScores]);

  // Initial Level Load (only once on mount)
  useEffect(() => {
    initLevel(0);
    syncUI();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col items-stretch relative group overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      {/* HUD Overlay */}
      <div className={`absolute top-0 left-0 w-full flex justify-between px-2 py-0.5 pointer-events-none z-10 bg-black/40 backdrop-blur-sm transition-opacity opacity-0 ${uiState.isPlaying ? 'group-hover:opacity-100' : ''}`}>
        <div className="font-mono text-[8px] text-white uppercase">P1: {uiState.score1} | L:{uiState.lives1}</div>
        <div className="font-mono text-[8px] text-accent-primary font-bold">LVL {uiState.level + 1}</div>
        <div className="font-mono text-[8px] text-white uppercase">P2: {uiState.score2} | L:{uiState.lives2}</div>
      </div>

      <canvas
        ref={canvasRef}
        width={actualWidth}
        height={actualHeight}
        className="cursor-pointer w-full h-full"
        onClick={(e) => {
          e.stopPropagation();
          if (!uiState.isPlaying) setIsPlaying(true);
        }}
      />

      {/* Menu Trigger */}
      {!uiState.isPlaying && !uiState.showMenu && !uiState.showHighScores && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-20">
          <div className="flex flex-col items-center gap-2 scale-75 md:scale-100">
            <h3 className="text-white font-bold text-sm tracking-widest uppercase">NIBBLES</h3>
            <button 
              onClick={(e) => { e.stopPropagation(); setIsPlaying(true); }}
              className="bg-accent-primary hover:bg-accent-secondary text-white px-6 py-1 rounded-full text-xs font-bold uppercase transition-all shadow-glow-sm"
            >
              Start Game
            </button>
            <div className="flex gap-4">
              <button 
                onClick={(e) => { e.stopPropagation(); setShowMenu(true); }} 
                className="text-text-muted hover:text-white text-[9px] uppercase font-mono"
              >
                Options
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); setShowHighScores(true); loadHighScores(); }} 
                className="text-text-muted hover:text-white text-[9px] uppercase font-mono"
              >
                High Scores
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); onExit?.(); }} 
                className="text-red-400/70 hover:text-red-400 text-[9px] uppercase font-mono"
              >
                Exit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* High Scores Overlay */}
      {uiState.showHighScores && !uiState.isPlaying && (
        <div 
          className="absolute inset-0 bg-black z-40 p-2 flex flex-col gap-2 overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-center border-b border-dark-border pb-1">
            <span className="text-accent-primary font-bold text-[10px] uppercase tracking-wider">Fasttracker Nibbles Highscore</span>
            <button 
              onClick={(e) => { e.stopPropagation(); setShowHighScores(false); }} 
              className="text-text-muted hover:text-white uppercase text-[10px]"
            >
              Close
            </button>
          </div>
          
          <div className="flex-1 flex flex-col gap-1 mt-1">
            {highScores.length === 0 ? (
              <div className="text-center text-text-muted py-4 text-[9px] uppercase font-mono">No high scores yet!</div>
            ) : (
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1">
                <div className="text-text-muted text-[8px] uppercase font-bold border-b border-dark-border/30">Player</div>
                <div className="text-text-muted text-[8px] uppercase font-bold border-b border-dark-border/30 text-right">Score</div>
                <div className="text-text-muted text-[8px] uppercase font-bold border-b border-dark-border/30 text-right">Lvl</div>
                {highScores.map((s, idx) => (
                  <React.Fragment key={s.id || idx}>
                    <div className="text-text-primary text-[9px] truncate font-mono">{s.name}</div>
                    <div className="text-accent-secondary text-[9px] font-mono text-right">{s.score.toLocaleString()}</div>
                    <div className="text-text-secondary text-[9px] font-mono text-right">{s.level}</div>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
          
          <button 
            onClick={async (e) => { 
              e.stopPropagation(); 
              if (confirm("Are you sure you want to clear all high scores?")) {
                await scoreLibrary.clearAll();
                loadHighScores();
              }
            }} 
            className="text-red-500/50 hover:text-red-500 uppercase text-[8px] font-mono mt-auto pt-2"
          >
            Clear All
          </button>
        </div>
      )}

      {/* Options Menu Overlay */}
      {uiState.showMenu && !uiState.isPlaying && (
        <div 
          className="absolute inset-0 bg-black z-30 p-2 flex flex-col gap-2 overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-center border-b border-dark-border pb-1">
            <span className="text-white font-bold text-[10px] uppercase">Options</span>
            <button 
              onClick={(e) => { e.stopPropagation(); setShowMenu(false); }} 
              className="text-text-muted hover:text-white uppercase text-[10px]"
            >
              Close
            </button>
          </div>
          
          <div className="grid grid-cols-2 gap-2 text-[9px] font-mono uppercase text-text-secondary">
            <div className="flex flex-col gap-1">
              <span>Speed:</span>
              <select 
                value={speed} 
                onChange={e => { e.stopPropagation(); setSpeed(parseInt(e.target.value)); }} 
                className="bg-dark-bgTertiary border border-dark-border rounded px-1 py-0.5 text-white"
              >
                <option value={0}>Novice</option>
                <option value={1}>Average</option>
                <option value={2}>Pro</option>
                <option value={3}>Up Rough</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <span>Players:</span>
              <select 
                value={numPlayers} 
                onChange={e => { e.stopPropagation(); setNumPlayers(parseInt(e.target.value)); }} 
                className="bg-dark-bgTertiary border border-dark-border rounded px-1 py-0.5 text-white"
              >
                <option value={1}>1 Player</option>
                <option value={2}>2 Players</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 mt-1">
            <label className="flex items-center gap-1 text-[9px] text-text-muted cursor-pointer uppercase font-mono">
              <input 
                type="checkbox" 
                checked={wrap} 
                onChange={e => { e.stopPropagation(); setWrap(e.target.checked); }} 
                className="accent-accent-primary" 
              />
              Wrap
            </label>
            <label className="flex items-center gap-1 text-[9px] text-text-muted cursor-pointer uppercase font-mono">
              <input 
                type="checkbox" 
                checked={grid} 
                onChange={e => { e.stopPropagation(); setGrid(e.target.checked); }} 
                className="accent-accent-primary" 
              />
              Grid
            </label>
            <label className="flex items-center gap-1 text-[9px] text-text-muted cursor-pointer uppercase font-mono">
              <input 
                type="checkbox" 
                checked={surround} 
                onChange={e => { e.stopPropagation(); setSurround(e.target.checked); }} 
                className="accent-accent-primary" 
              />
              Surround
            </label>
          </div>
        </div>
      )}
    </div>
  );
};
