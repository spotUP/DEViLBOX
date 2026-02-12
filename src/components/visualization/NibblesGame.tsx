/**
 * NibblesGame - 1:1 port of FastTracker 2 Nibbles game
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { NIBBLES_LEVELS } from './nibblesLevels';
import { scoreLibrary, type NibblesScore } from '@/lib/scoreLibrary';
import { useAudioStore } from '@stores';

interface NibblesGameProps {
  height?: number;
  onExit?: () => void;
}

const NI_SPEEDS = [12, 8, 6, 4]; // Novice, Average, Pro, Up Rough (60Hz ticks)
const WIDTH = 51;
const HEIGHT = 23;

// Audio reactivity tuning
const BEAT_DETECTION_THRESHOLD = 15;
const BEAT_INTENSITY_SCALE = 30;
const BEAT_DECAY_RATE = 0.05;

// Music visualization tuning
const MIN_VISUALIZATION_INTENSITY = 0.05; // Skip tiles below 5% intensity
const MIN_TILE_ALPHA = 0.2; // Minimum opacity for background tiles
const ALPHA_INTENSITY_RANGE = 0.4; // Additional opacity based on intensity (max = 0.6)

// Dynamic speed modulation
const SPEED_MOD_MIN = 0.9;  // -10% speed at silence
const SPEED_MOD_RANGE = 0.3; // +20% speed at max energy (0.9 + 0.3 = 1.2)

// Beat-synced visual effects tuning
const GRID_GLOW_DECAY_RATE = 0.08;
const WORM_PULSE_DECAY_RATE = 0.02;
const WORM_PULSE_INTENSITY = 0.15;
const GRID_GLOW_THRESHOLD = 0.1;
const GRID_GLOW_BLUR_MULTIPLIER = 10;

// Beat-synced food spawning
const BEAT_SPAWN_INTENSITY_THRESHOLD = 0.5;
const BEAT_SPAWN_COOLDOWN_MS = 2000;

// Score multiplier
const SCORE_MULTIPLIER_BEAT_THRESHOLD = 0.3;
const SCORE_MULTIPLIER_ON_BEAT = 2;
const SCORE_MULTIPLIER_DISPLAY_MS = 500;

// Grid rendering
const GRID_CELL_PADDING = 2;

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

// Music visualization tiles
const TILE_COLORS = [
  '#1a1a2e', // Dark blue (bass)
  '#16213e',
  '#0f3460',
  '#533483', // Purple (mid-bass)
  '#7b2cbf',
  '#9d4edd', // Bright purple (mids)
  '#c77dff',
  '#e0aaff', // Light purple (high-mids)
  '#ff006e', // Pink (treble)
  '#fb5607', // Orange
  '#ffbe0b', // Yellow
  '#8ac926', // Green
  '#1982c4', // Blue
  '#6a4c93', // Purple
  '#06ffa5', // Cyan
  '#fffb00', // Bright yellow (high treble)
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
  const [twoKeyMode, setTwoKeyMode] = useState(true);
  const [highScores, setHighScores] = useState<NibblesScore[]>([]);
  const [showNameEntry, setShowNameEntry] = useState(false);
  const [nameEntryPlayer, setNameEntryPlayer] = useState(1);
  const [nameEntryScore, setNameEntryScore] = useState(0);
  const [nameEntryLevel, setNameEntryLevel] = useState(0);
  const [nameInput, setNameInput] = useState('');

  // Audio reactivity state
  const [audioData, setAudioData] = useState<Uint8Array>(new Uint8Array(128));
  const [beatIntensity, setBeatIntensity] = useState(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const previousVolumeRef = useRef(0);
  const audioBufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  // Visual effects
  const [gridGlowIntensity, setGridGlowIntensity] = useState(0);
  const [wormPulseScale, setWormPulseScale] = useState(1);

  // Score multiplier
  const [scoreMultiplier, setScoreMultiplier] = useState(1);
  const lastEatTimeRef = useRef(0);

  // Beat-synced food spawning
  const lastBeatSpawnRef = useRef(0);
  const beatFoodQueueRef = useRef(0);

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

  // Setup audio analysis
  const setupAudioAnalysis = useCallback(() => {
    try {
      const { analyserNode } = useAudioStore.getState();
      if (!analyserNode) return;

      // Use Tone.js analyser's internal native AnalyserNode
      const nativeAnalyser = analyserNode.input as unknown as AnalyserNode;
      if (!nativeAnalyser || !nativeAnalyser.context) return;

      analyserRef.current = nativeAnalyser;
    } catch (e) {
      console.warn('Audio analysis setup failed:', e);
    }
  }, []);

  // Calculate dynamic game speed based on audio energy
  const getGameSpeed = useCallback(() => {
    const baseSpeed = NI_SPEEDS[speed];

    // Calculate average audio energy
    const avgEnergy = audioData.length > 0
      ? audioData.reduce((a, b) => a + b, 0) / audioData.length / 255
      : 0;

    // Modulate speed: +20% at high energy, -10% at low energy
    const speedMod = SPEED_MOD_MIN + (avgEnergy * SPEED_MOD_RANGE);

    return baseSpeed * speedMod;
  }, [speed, audioData]);

  // Extract audio data for visualization
  const updateAudioData = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    // Reuse buffer to avoid allocation on every frame
    if (!audioBufferRef.current || audioBufferRef.current.length !== analyser.frequencyBinCount) {
      audioBufferRef.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    }
    analyser.getByteFrequencyData(audioBufferRef.current);
    setAudioData(audioBufferRef.current);

    // Beat detection: measure sudden volume increase
    const volume = audioBufferRef.current.reduce((a, b) => a + b, 0) / audioBufferRef.current.length;
    const volumeDelta = volume - previousVolumeRef.current;

    if (volumeDelta > BEAT_DETECTION_THRESHOLD) {
      // Beat detected
      const intensity = Math.min(volumeDelta / BEAT_INTENSITY_SCALE, 1);
      setBeatIntensity(intensity);
      setGridGlowIntensity(intensity);
      setWormPulseScale(1 + (intensity * WORM_PULSE_INTENSITY));

      // Queue food spawn on strong beats
      if (intensity > BEAT_SPAWN_INTENSITY_THRESHOLD && Date.now() - lastBeatSpawnRef.current > BEAT_SPAWN_COOLDOWN_MS) {
        beatFoodQueueRef.current++;
        lastBeatSpawnRef.current = Date.now();
      }
    } else {
      // Decay effects
      setBeatIntensity(prev => Math.max(0, prev - BEAT_DECAY_RATE));
      setGridGlowIntensity(prev => Math.max(0, prev - GRID_GLOW_DECAY_RATE));
      setWormPulseScale(prev => Math.max(1, prev - WORM_PULSE_DECAY_RATE));
    }

    previousVolumeRef.current = volume;
  }, []);

  // Initialize on mount
  useEffect(() => {
    setupAudioAnalysis();
  }, [setupAudioAnalysis]);

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
  // Render music-reactive background tiles
  const renderBackgroundTiles = useCallback((
    ctx: CanvasRenderingContext2D,
    cellSize: number
  ) => {
    if (!audioData || audioData.length === 0) return;

    const cols = WIDTH;
    const rows = HEIGHT;

    for (let x = 0; x < cols; x++) {
      // Compute per-column values once
      const bandIndex = Math.floor((x / cols) * audioData.length);
      const intensity = audioData[bandIndex] / 255;

      if (intensity <= MIN_VISUALIZATION_INTENSITY) continue; // Skip early

      const barHeight = Math.floor(intensity * rows);
      const colorIndex = Math.min(
        Math.floor((bandIndex / audioData.length) * TILE_COLORS.length),
        TILE_COLORS.length - 1
      );
      const color = TILE_COLORS[colorIndex];
      const alpha = MIN_TILE_ALPHA + (intensity * ALPHA_INTENSITY_RANGE);
      const px = x * cellSize;

      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;

      // Only iterate y values that need drawing
      for (let y = rows - barHeight; y < rows; y++) {
        const py = y * cellSize;
        ctx.fillRect(px, py, cellSize, cellSize);
      }
      ctx.globalAlpha = 1;
    }
  }, [audioData]);

  const handleGameOver = useCallback(async () => {
    setIsPlaying(false);

    // Sync final values for highscore check
    const s1 = score1Ref.current;
    const s2 = score2Ref.current;
    const lvl = levelRef.current;

    const lowestTopScore = highScores.length < 10 ? 0 : highScores[highScores.length - 1].score;

    // Check if either player got a high score
    if (s1 > lowestTopScore) {
      setNameEntryPlayer(1);
      setNameEntryScore(s1);
      setNameEntryLevel(lvl + 1);
      setNameInput('Player 1');
      setShowNameEntry(true);
      return; // Wait for name entry
    }

    if (numPlayers === 2 && s2 > lowestTopScore) {
      setNameEntryPlayer(2);
      setNameEntryScore(s2);
      setNameEntryLevel(lvl + 1);
      setNameInput('Player 2');
      setShowNameEntry(true);
      return; // Wait for name entry
    }

    // No high scores, reset immediately
    loadHighScores();
    setShowHighScores(true);
    levelRef.current = 0;
    score1Ref.current = 0;
    score2Ref.current = 0;
    lives1Ref.current = 3;
    lives2Ref.current = 3;
    initLevel(0);
    syncUI();
  }, [numPlayers, speed, highScores, loadHighScores, syncUI, initLevel]);

  // Handle name entry submission
  const handleNameSubmit = useCallback(async () => {
    if (nameInput.trim()) {
      await scoreLibrary.saveScore({
        name: nameInput.trim(),
        score: nameEntryScore,
        level: nameEntryLevel,
        players: numPlayers,
        speed: speed
      });
    }

    setShowNameEntry(false);

    // Check if player 2 also needs to enter name
    if (nameEntryPlayer === 1 && numPlayers === 2) {
      const s2 = score2Ref.current;
      const lvl = levelRef.current;
      const lowestTopScore = highScores.length < 10 ? 0 : highScores[highScores.length - 1].score;

      if (s2 > lowestTopScore) {
        setNameEntryPlayer(2);
        setNameEntryScore(s2);
        setNameEntryLevel(lvl + 1);
        setNameInput('Player 2');
        setShowNameEntry(true);
        return;
      }
    }

    // All done, show high scores and reset
    loadHighScores();
    setShowHighScores(true);
    levelRef.current = 0;
    score1Ref.current = 0;
    score2Ref.current = 0;
    lives1Ref.current = 3;
    lives2Ref.current = 3;
    initLevel(0);
    syncUI();
  }, [nameInput, nameEntryScore, nameEntryLevel, nameEntryPlayer, numPlayers, speed, highScores, loadHighScores, syncUI, initLevel]);

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

    updateAudioData();

    // Spawn beat-synced food
    if (beatFoodQueueRef.current > 0) {
      spawnFood();
      beatFoodQueueRef.current--;
    }

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
      const now = Date.now();
      const points = (cell1 - 16) * 999 * (levelRef.current + 1);

      // Bonus multiplier if eaten during beat
      const onBeat = beatIntensity > SCORE_MULTIPLIER_BEAT_THRESHOLD;
      const multiplier = onBeat ? SCORE_MULTIPLIER_ON_BEAT : 1;

      score1Ref.current += points * multiplier;
      p1NoClearRef.current = p1LenRef.current >> 1;
      p1Eating = true;

      // Show visual feedback for multiplier
      if (onBeat) {
        setScoreMultiplier(SCORE_MULTIPLIER_ON_BEAT);
        setTimeout(() => setScoreMultiplier(1), SCORE_MULTIPLIER_DISPLAY_MS);
      }

      lastEatTimeRef.current = now;
    }

    if (nextP2) {
      const cell2 = gridRef.current[nextP2.y][nextP2.x];
      if (cell2 >= 16) {
        const now = Date.now();
        const points = (cell2 - 16) * 999 * (levelRef.current + 1);

        // Bonus multiplier if eaten during beat
        const onBeat = beatIntensity > SCORE_MULTIPLIER_BEAT_THRESHOLD;
        const multiplier = onBeat ? SCORE_MULTIPLIER_ON_BEAT : 1;

        score2Ref.current += points * multiplier;
        p2NoClearRef.current = p2LenRef.current >> 1;
        p2Eating = true;

        // Show visual feedback for multiplier
        if (onBeat) {
          setScoreMultiplier(SCORE_MULTIPLIER_ON_BEAT);
          setTimeout(() => setScoreMultiplier(1), SCORE_MULTIPLIER_DISPLAY_MS);
        }

        lastEatTimeRef.current = now;
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
  }, [numPlayers, wrap, surround, initLevel, handleGameOver, syncUI, isInvalid, updateAudioData]);

  // Main Loop
  useEffect(() => {
    let lastTick = 0;
    const tick = (now: number) => {
      if (isPlayingRef.current) {
        if (now - lastTick >= (getGameSpeed() * 16.67)) {
          lastTick = now;
          move();
        }
      }
      animationRef.current = requestAnimationFrame(tick);
    };
    animationRef.current = requestAnimationFrame(tick);
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [speed, move, getGameSpeed]);

  // Key Handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPlayingRef.current) return;

      if (twoKeyMode) {
        // Two-key mode: left/right only (relative to current direction)
        // 0=right, 1=up, 2=left, 3=down
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          const currentDir = p1DirRef.current;
          const newDir = (currentDir + 1) % 4; // Turn left (counter-clockwise)
          inputBuffer1.current.push(newDir);
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          const currentDir = p1DirRef.current;
          const newDir = (currentDir + 3) % 4; // Turn right (clockwise)
          inputBuffer1.current.push(newDir);
        }
        if (e.key.toLowerCase() === 'a') {
          e.preventDefault();
          const currentDir = p2DirRef.current;
          const newDir = (currentDir + 1) % 4; // Turn left
          inputBuffer2.current.push(newDir);
        }
        if (e.key.toLowerCase() === 'd') {
          e.preventDefault();
          const currentDir = p2DirRef.current;
          const newDir = (currentDir + 3) % 4; // Turn right
          inputBuffer2.current.push(newDir);
        }
      } else {
        // Four-way mode: absolute directions
        if (e.key === 'ArrowRight') { e.preventDefault(); inputBuffer1.current.push(0); }
        if (e.key === 'ArrowUp')    { e.preventDefault(); inputBuffer1.current.push(1); }
        if (e.key === 'ArrowLeft')  { e.preventDefault(); inputBuffer1.current.push(2); }
        if (e.key === 'ArrowDown')  { e.preventDefault(); inputBuffer1.current.push(3); }
        if (e.key.toLowerCase() === 'd') { e.preventDefault(); inputBuffer2.current.push(0); }
        if (e.key.toLowerCase() === 'w') { e.preventDefault(); inputBuffer2.current.push(1); }
        if (e.key.toLowerCase() === 'a') { e.preventDefault(); inputBuffer2.current.push(2); }
        if (e.key.toLowerCase() === 's') { e.preventDefault(); inputBuffer2.current.push(3); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [twoKeyMode]);

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

      // Draw music-reactive background tiles
      ctx.save();
      ctx.translate(offsetX, offsetY);
      renderBackgroundTiles(ctx, cellSize);
      ctx.restore();

      // Draw playfield border
      if (surround) {
        ctx.strokeStyle = PALETTE[11]; // Cyan
        ctx.lineWidth = 2;

        // Add glow effect on beats
        if (gridGlowIntensity > GRID_GLOW_THRESHOLD) {
          ctx.shadowColor = PALETTE[11];
          ctx.shadowBlur = GRID_GLOW_BLUR_MULTIPLIER * gridGlowIntensity;
        }

        ctx.strokeRect(offsetX, offsetY, playWidth, playHeight);
        ctx.shadowBlur = 0;
      } else {
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.3)'; // cyan-500/30
        ctx.lineWidth = 2;
        ctx.strokeRect(offsetX, offsetY, playWidth, playHeight);
      }

      for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
          const val = gridRef.current[y]?.[x];
          if (val === undefined || val === 0) continue;
          const px = offsetX + x * cellSize;
          const py = offsetY + y * cellSize;
          if (val >= 16) {
            // Food: Draw filled cell with number (same size as worm segment)
            if (grid) {
              ctx.fillStyle = '#000';
              ctx.fillRect(px, py, cellSize, cellSize);
              ctx.fillStyle = PALETTE[12]; // Yellow background
              ctx.fillRect(px + GRID_CELL_PADDING, py + GRID_CELL_PADDING, cellSize - (GRID_CELL_PADDING * 2), cellSize - (GRID_CELL_PADDING * 2));
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
              ctx.fillStyle = '#000';
              ctx.fillRect(px, py, cellSize, cellSize);
              ctx.fillStyle = PALETTE[val] || '#fff';

              // Apply pulse effect to worm segments
              const inset = GRID_CELL_PADDING / wormPulseScale;
              const size = (cellSize - (GRID_CELL_PADDING * 2)) * wormPulseScale;
              ctx.fillRect(
                px + inset,
                py + inset,
                size,
                size
              );
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
  }, [grid, surround, gridGlowIntensity, wormPulseScale, uiState.showMenu, uiState.showHighScores, renderBackgroundTiles]);

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
        <div className="flex items-center gap-2">
          <span className="font-mono text-[8px] text-white uppercase">P1: {uiState.score1} | L:{uiState.lives1}</span>
          {scoreMultiplier > 1 && (
            <span className="text-yellow-400 font-bold text-[9px] animate-pulse">
              x{scoreMultiplier}
            </span>
          )}
        </div>
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
            <label className="flex items-center gap-1 text-[9px] text-text-muted cursor-pointer uppercase font-mono">
              <input
                type="checkbox"
                checked={twoKeyMode}
                onChange={e => { e.stopPropagation(); setTwoKeyMode(e.target.checked); }}
                className="accent-accent-primary"
              />
              2-Key
            </label>
          </div>
        </div>
      )}

      {/* High Score Name Entry */}
      {showNameEntry && (
        <div
          className="absolute inset-0 bg-black/90 z-50 flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-dark-bgSecondary border border-accent-primary rounded p-4 flex flex-col gap-3 min-w-[200px]">
            <div className="text-accent-primary font-bold text-[11px] uppercase tracking-wider text-center">
              High Score!
            </div>
            <div className="text-text-secondary text-[9px] font-mono text-center">
              Player {nameEntryPlayer} - {nameEntryScore.toLocaleString()} pts
            </div>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleNameSubmit();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  handleNameSubmit();
                }
              }}
              maxLength={20}
              placeholder="Enter your name"
              autoFocus
              className="bg-dark-bgTertiary border border-dark-border rounded px-2 py-1 text-white text-[10px] font-mono focus:border-accent-primary focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleNameSubmit();
                }}
                className="flex-1 bg-accent-primary hover:bg-accent-secondary text-white px-3 py-1 rounded text-[9px] font-bold uppercase transition-all"
              >
                Submit
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setNameInput('');
                  handleNameSubmit();
                }}
                className="bg-dark-bgTertiary hover:bg-dark-border text-text-muted px-3 py-1 rounded text-[9px] uppercase transition-all"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
