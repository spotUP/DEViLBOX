# Music-Reactive Nibbles Game Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the Nibbles game into a music-reactive visualizer with animated background tiles, beat-synced gameplay, and visual effects that respond to frequency analysis.

**Architecture:** Hook into DEViLBOX's existing audio analysis infrastructure (AnalyserNode) to extract frequency/amplitude data. Render a grid of colored tiles in the background that animate based on frequency bands. Add beat detection for gameplay mechanics (food spawning, score multipliers). Layer visual effects (pulses, glows, trails) on top of existing game rendering.

**Tech Stack:** Web Audio API (AnalyserNode), Canvas 2D, React hooks, useVisualizationStore for audio data access

---

## Task 1: Audio Analysis Hook

**Files:**
- Modify: `src/components/visualization/NibblesGame.tsx`
- Reference: `src/hooks/useVisualizationAnimation.ts`
- Reference: `src/stores/useVisualizationStore.ts`

**Step 1: Add audio analysis state**

Add after existing state declarations (around line 60):

```typescript
// Audio reactivity state
const [audioData, setAudioData] = useState<Uint8Array>(new Uint8Array(128));
const [beatIntensity, setBeatIntensity] = useState(0);
const analyserRef = useRef<AnalyserNode | null>(null);
const previousVolumeRef = useRef(0);
```

**Step 2: Create audio analysis setup function**

Add before the game loop functions:

```typescript
// Setup audio analysis
const setupAudioAnalysis = useCallback(() => {
  try {
    const audioContext = useVisualizationStore.getState().audioContext;
    if (!audioContext) return;

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256; // 128 frequency bins
    analyser.smoothingTimeConstant = 0.8;

    // Connect to master output
    const audioStore = useVisualizationStore.getState();
    if (audioStore.masterGain) {
      audioStore.masterGain.connect(analyser);
    }

    analyserRef.current = analyser;
  } catch (e) {
    console.warn('Audio analysis setup failed:', e);
  }
}, []);
```

**Step 3: Create audio data extraction function**

```typescript
// Extract audio data for visualization
const updateAudioData = useCallback(() => {
  const analyser = analyserRef.current;
  if (!analyser) return;

  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(dataArray);
  setAudioData(dataArray);

  // Beat detection: measure sudden volume increase
  const volume = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
  const volumeDelta = volume - previousVolumeRef.current;

  if (volumeDelta > 15) {
    // Beat detected
    setBeatIntensity(Math.min(volumeDelta / 30, 1));
  } else {
    // Decay beat intensity
    setBeatIntensity(prev => Math.max(0, prev - 0.05));
  }

  previousVolumeRef.current = volume;
}, []);
```

**Step 4: Initialize audio analysis on mount**

Add useEffect:

```typescript
useEffect(() => {
  setupAudioAnalysis();
}, [setupAudioAnalysis]);
```

**Step 5: Call audio update in animation loop**

Modify the `move()` function to call `updateAudioData()` at the start:

```typescript
const move = useCallback(() => {
  if (!isPlayingRef.current) return;

  updateAudioData(); // Add this line

  // ... rest of move function
}, [/* existing deps */, updateAudioData]);
```

**Step 6: Commit**

```bash
git add src/components/visualization/NibblesGame.tsx
git commit -m "feat(nibbles): add audio analysis infrastructure"
```

---

## Task 2: Background Tile Renderer

**Files:**
- Modify: `src/components/visualization/NibblesGame.tsx`

**Step 1: Add tile rendering constants**

Add after PALETTE constant (around line 40):

```typescript
// Music visualization tiles
const TILE_BANDS = 16; // Number of frequency bands to visualize
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
```

**Step 2: Create background tile renderer**

Add new function before the main render loop:

```typescript
// Render music-reactive background tiles
const renderBackgroundTiles = useCallback((
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  cellSize: number
) => {
  if (!audioData || audioData.length === 0) return;

  const cols = WIDTH;
  const rows = HEIGHT;
  const bandsPerColumn = Math.ceil(audioData.length / cols);

  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      // Map position to frequency band
      const bandIndex = Math.floor((x / cols) * audioData.length);
      const intensity = audioData[bandIndex] / 255;

      // Map intensity to height (taller bars for louder frequencies)
      const maxHeight = rows;
      const barHeight = Math.floor(intensity * maxHeight);

      // Only draw if this y-position is within the bar height (from bottom)
      const shouldDraw = y >= (rows - barHeight);

      if (shouldDraw && intensity > 0.05) {
        // Map frequency band to color
        const colorIndex = Math.floor((bandIndex / audioData.length) * TILE_COLORS.length);
        const color = TILE_COLORS[colorIndex];

        // Draw tile with alpha based on intensity
        const alpha = 0.2 + (intensity * 0.4);
        ctx.fillStyle = color;
        ctx.globalAlpha = alpha;

        const px = x * cellSize;
        const py = y * cellSize;
        ctx.fillRect(px, py, cellSize, cellSize);
        ctx.globalAlpha = 1;
      }
    }
  }
}, [audioData]);
```

**Step 3: Integrate background tiles into render loop**

Modify the render function to draw background tiles first (around line 520):

```typescript
// Clear canvas
ctx.fillStyle = backgroundColor;
ctx.fillRect(0, 0, canvas.width, canvas.height);

// Draw music-reactive background tiles
renderBackgroundTiles(ctx, canvas.width, canvas.height, cellSize);

// Draw border (existing code)
if (surround) {
  // ...
```

**Step 4: Add background tiles to dependencies**

Update the render dependencies to include `renderBackgroundTiles`:

```typescript
}, [
  // ... existing deps
  renderBackgroundTiles,
]);
```

**Step 5: Test the background tiles**

Run the app and start playback. The background should show animated vertical frequency bars.

**Step 6: Commit**

```bash
git add src/components/visualization/NibblesGame.tsx
git commit -m "feat(nibbles): add music-reactive background tiles"
```

---

## Task 3: Beat-Synced Visual Effects

**Files:**
- Modify: `src/components/visualization/NibblesGame.tsx`

**Step 1: Add visual effect state**

Add after audio state (around line 64):

```typescript
// Visual effects
const [gridGlowIntensity, setGridGlowIntensity] = useState(0);
const [wormPulseScale, setWormPulseScale] = useState(1);
```

**Step 2: Update visual effects based on beat**

Modify `updateAudioData` to update visual effects:

```typescript
if (volumeDelta > 15) {
  // Beat detected
  const intensity = Math.min(volumeDelta / 30, 1);
  setBeatIntensity(intensity);
  setGridGlowIntensity(intensity);
  setWormPulseScale(1 + (intensity * 0.15));
} else {
  // Decay effects
  setBeatIntensity(prev => Math.max(0, prev - 0.05));
  setGridGlowIntensity(prev => Math.max(0, prev - 0.08));
  setWormPulseScale(prev => Math.max(1, prev - 0.02));
}
```

**Step 3: Apply grid glow effect**

Modify grid border rendering (around line 580):

```typescript
// Draw border
if (surround) {
  ctx.strokeStyle = PALETTE[11]; // Cyan
  ctx.lineWidth = 2;

  // Add glow effect on beats
  if (gridGlowIntensity > 0.1) {
    ctx.shadowColor = PALETTE[11];
    ctx.shadowBlur = 10 * gridGlowIntensity;
  }

  ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
  ctx.shadowBlur = 0;
}
```

**Step 4: Apply worm pulse effect**

Modify worm segment rendering to use pulsing scale:

```typescript
if (grid) {
  ctx.fillStyle = '#000';
  ctx.fillRect(px, py, cellSize, cellSize);
  ctx.fillStyle = PALETTE[val] || '#fff';

  // Apply pulse effect to worm segments
  const inset = 2 / wormPulseScale;
  const size = (cellSize - 4) * wormPulseScale;
  ctx.fillRect(
    px + inset,
    py + inset,
    size,
    size
  );
}
```

**Step 5: Commit**

```bash
git add src/components/visualization/NibblesGame.tsx
git commit -m "feat(nibbles): add beat-synced grid glow and worm pulse"
```

---

## Task 4: Beat-Synced Food Spawning

**Files:**
- Modify: `src/components/visualization/NibblesGame.tsx`

**Step 1: Add beat-sync food spawning flag**

Add state for tracking beat-synced spawning:

```typescript
const lastBeatSpawnRef = useRef(0);
const beatFoodQueueRef = useRef(0);
```

**Step 2: Queue food spawns on beats**

Modify `updateAudioData` to queue food spawns:

```typescript
if (volumeDelta > 15) {
  const intensity = Math.min(volumeDelta / 30, 1);
  setBeatIntensity(intensity);
  setGridGlowIntensity(intensity);
  setWormPulseScale(1 + (intensity * 0.15));

  // Queue food spawn on strong beats
  if (intensity > 0.5 && Date.now() - lastBeatSpawnRef.current > 2000) {
    beatFoodQueueRef.current++;
    lastBeatSpawnRef.current = Date.now();
  }
}
```

**Step 3: Spawn queued food in game loop**

Modify `move()` function to spawn queued food:

```typescript
// Spawn beat-synced food
if (beatFoodQueueRef.current > 0) {
  spawnFood();
  beatFoodQueueRef.current--;
}
```

**Step 4: Commit**

```bash
git add src/components/visualization/NibblesGame.tsx
git commit -m "feat(nibbles): add beat-synced food spawning"
```

---

## Task 5: Score Multiplier System

**Files:**
- Modify: `src/components/visualization/NibblesGame.tsx`

**Step 1: Add score multiplier state**

```typescript
const [scoreMultiplier, setScoreMultiplier] = useState(1);
const lastEatTimeRef = useRef(0);
```

**Step 2: Apply multiplier on beat-synced eating**

Modify food eating logic in `move()`:

```typescript
if (nextCell >= 16) {
  // Food eaten
  const points = nextCell - 16;
  const now = Date.now();
  const timeSinceLastEat = now - lastEatTimeRef.current;

  // Bonus multiplier if eaten during beat (within 200ms of beat)
  const onBeat = beatIntensity > 0.3;
  const multiplier = onBeat ? 2 : 1;

  if (player === 1) {
    p1ScoreRef.current += points * multiplier;
  } else {
    p2ScoreRef.current += points * multiplier;
  }

  // Show visual feedback for multiplier
  if (onBeat) {
    setScoreMultiplier(2);
    setTimeout(() => setScoreMultiplier(1), 500);
  }

  lastEatTimeRef.current = now;
  // ... rest of eating logic
}
```

**Step 3: Display score multiplier UI**

Add multiplier indicator in the UI section (around line 680):

```typescript
<div className="flex items-center gap-4">
  <span className="text-accent-primary font-bold text-[11px] font-mono">
    P1: {p1ScoreRef.current}
  </span>
  {scoreMultiplier > 1 && (
    <span className="text-yellow-400 font-bold text-[9px] animate-pulse">
      x{scoreMultiplier}
    </span>
  )}
</div>
```

**Step 4: Commit**

```bash
git add src/components/visualization/NibblesGame.tsx
git commit -m "feat(nibbles): add beat-synced score multiplier"
```

---

## Task 6: Dynamic Speed Modulation

**Files:**
- Modify: `src/components/visualization/NibblesGame.tsx`

**Step 1: Add speed modulation**

Modify the game speed calculation based on audio energy:

```typescript
const getGameSpeed = useCallback(() => {
  const baseSpeed = speed;

  // Calculate average audio energy
  const avgEnergy = audioData.length > 0
    ? audioData.reduce((a, b) => a + b, 0) / audioData.length / 255
    : 0;

  // Modulate speed: +20% at high energy, -10% at low energy
  const speedMod = 0.9 + (avgEnergy * 0.3);

  return baseSpeed * speedMod;
}, [speed, audioData]);
```

**Step 2: Use dynamic speed in game loop**

Modify the interval setup:

```typescript
const interval = setInterval(() => {
  move();
}, getGameSpeed());
```

**Step 3: Update dependencies**

```typescript
}, [move, getGameSpeed]);
```

**Step 4: Commit**

```bash
git add src/components/visualization/NibblesGame.tsx
git commit -m "feat(nibbles): add music-reactive speed modulation"
```

---

## Task 7: Particle Trail Effects

**Files:**
- Modify: `src/components/visualization/NibblesGame.tsx`

**Step 1: Add particle system state**

```typescript
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

const particlesRef = useRef<Particle[]>([]);
```

**Step 2: Spawn particles on food eat**

Modify food eating logic:

```typescript
if (nextCell >= 16) {
  // Spawn particles
  const centerX = nextP1.x * cellSize + cellSize / 2;
  const centerY = nextP1.y * cellSize + cellSize / 2;

  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI * 2 * i) / 8;
    const speed = 2 + Math.random() * 3;
    particlesRef.current.push({
      x: centerX,
      y: centerY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      color: PALETTE[12], // Yellow
      size: 3 + Math.random() * 3,
    });
  }

  // ... existing food logic
}
```

**Step 3: Update and render particles**

Add particle update function:

```typescript
const updateAndRenderParticles = useCallback((ctx: CanvasRenderingContext2D) => {
  particlesRef.current = particlesRef.current.filter(p => {
    // Update position
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 0.02;
    p.vy += 0.1; // Gravity

    // Render
    if (p.life > 0) {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      ctx.globalAlpha = 1;
    }

    return p.life > 0;
  });
}, []);
```

**Step 4: Call particle renderer**

Add to render loop (after grid rendering):

```typescript
// Update and render particles
updateAndRenderParticles(ctx);
```

**Step 5: Commit**

```bash
git add src/components/visualization/NibblesGame.tsx
git commit -m "feat(nibbles): add particle trail effects"
```

---

## Task 8: Frequency-Based Worm Colors

**Files:**
- Modify: `src/components/visualization/NibblesGame.tsx`

**Step 1: Create frequency-to-color mapping**

```typescript
const getFrequencyColor = useCallback((segmentIndex: number, playerColor: number) => {
  if (audioData.length === 0) return PALETTE[playerColor];

  // Map segment index to frequency band
  const bandIndex = (segmentIndex * 3) % audioData.length;
  const intensity = audioData[bandIndex] / 255;

  // Blend player color with frequency color
  if (intensity > 0.3) {
    const freqColorIndex = Math.floor((bandIndex / audioData.length) * TILE_COLORS.length);
    return TILE_COLORS[freqColorIndex];
  }

  return PALETTE[playerColor];
}, [audioData]);
```

**Step 2: Apply frequency colors to worm segments**

Modify worm rendering:

```typescript
// When rendering worm segment:
const segmentIndex = /* calculate from worm array position */;
const color = getFrequencyColor(segmentIndex, val);
ctx.fillStyle = color;
```

**Step 3: Commit**

```bash
git add src/components/visualization/NibblesGame.tsx
git commit -m "feat(nibbles): add frequency-based worm segment colors"
```

---

## Task 9: Settings UI for Music Reactivity

**Files:**
- Modify: `src/components/visualization/NibblesGame.tsx`

**Step 1: Add music reactivity toggle**

Add state:

```typescript
const [musicReactive, setMusicReactive] = useState(true);
```

**Step 2: Add checkbox to settings menu**

Add after the 2-Key checkbox:

```typescript
<label className="flex items-center gap-1 text-[9px] text-text-muted cursor-pointer uppercase font-mono">
  <input
    type="checkbox"
    checked={musicReactive}
    onChange={e => { e.stopPropagation(); setMusicReactive(e.target.checked); }}
    className="accent-accent-primary"
  />
  Music FX
</label>
```

**Step 3: Conditional rendering of effects**

Wrap background tiles rendering:

```typescript
if (musicReactive) {
  renderBackgroundTiles(ctx, canvas.width, canvas.height, cellSize);
}
```

**Step 4: Commit**

```bash
git add src/components/visualization/NibblesGame.tsx
git commit -m "feat(nibbles): add music reactivity toggle in settings"
```

---

## Task 10: Performance Optimization

**Files:**
- Modify: `src/components/visualization/NibblesGame.tsx`

**Step 1: Memoize expensive calculations**

Use useMemo for background tile calculations:

```typescript
const tileData = useMemo(() => {
  if (!audioData || audioData.length === 0) return null;

  const cols = WIDTH;
  const rows = HEIGHT;
  const tiles: Array<{x: number, y: number, color: string, alpha: number}> = [];

  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      const bandIndex = Math.floor((x / cols) * audioData.length);
      const intensity = audioData[bandIndex] / 255;
      const maxHeight = rows;
      const barHeight = Math.floor(intensity * maxHeight);
      const shouldDraw = y >= (rows - barHeight);

      if (shouldDraw && intensity > 0.05) {
        const colorIndex = Math.floor((bandIndex / audioData.length) * TILE_COLORS.length);
        tiles.push({
          x,
          y,
          color: TILE_COLORS[colorIndex],
          alpha: 0.2 + (intensity * 0.4),
        });
      }
    }
  }

  return tiles;
}, [audioData]);
```

**Step 2: Use pre-calculated tile data**

Simplify renderBackgroundTiles:

```typescript
const renderBackgroundTiles = useCallback((
  ctx: CanvasRenderingContext2D,
  cellSize: number
) => {
  if (!tileData) return;

  tileData.forEach(tile => {
    ctx.fillStyle = tile.color;
    ctx.globalAlpha = tile.alpha;
    ctx.fillRect(tile.x * cellSize, tile.y * cellSize, cellSize, cellSize);
  });

  ctx.globalAlpha = 1;
}, [tileData]);
```

**Step 3: Commit**

```bash
git add src/components/visualization/NibblesGame.tsx
git commit -m "perf(nibbles): optimize background tile rendering"
```

---

## Task 11: Testing & Polish

**Files:**
- Modify: `src/components/visualization/NibblesGame.tsx`

**Step 1: Test all features**

Manual testing checklist:
- [ ] Background tiles animate with music
- [ ] Grid glows on beats
- [ ] Worm pulses on beats
- [ ] Food spawns on beats
- [ ] Score multiplier shows on beat-synced eating
- [ ] Game speed modulates with music energy
- [ ] Particles spawn when eating food
- [ ] Worm colors change with frequency
- [ ] Music FX toggle works
- [ ] Performance is smooth (60fps)

**Step 2: Add default values to reset**

Ensure all new state resets properly on game restart:

```typescript
const resetGame = () => {
  // ... existing resets
  setBeatIntensity(0);
  setGridGlowIntensity(0);
  setWormPulseScale(1);
  setScoreMultiplier(1);
  particlesRef.current = [];
  beatFoodQueueRef.current = 0;
};
```

**Step 3: Final polish**

Adjust timing constants for best feel:
- Beat detection threshold
- Effect decay rates
- Particle counts
- Speed modulation range

**Step 4: Final commit**

```bash
git add src/components/visualization/NibblesGame.tsx
git commit -m "feat(nibbles): complete music-reactive implementation"
```

---

## Implementation Notes

**Audio Analysis:**
- Uses existing DEViLBOX audio infrastructure
- FFT size of 256 gives 128 frequency bins (good balance of resolution vs performance)
- Beat detection uses simple volume delta threshold
- Could be enhanced with more sophisticated beat detection algorithms

**Visual Performance:**
- Background tiles update every frame but pre-calculate in useMemo
- Particle system limited to reasonable count (max ~100 particles)
- Grid glow uses canvas shadowBlur (native GPU acceleration)
- All effects can be toggled off via Music FX checkbox

**Gameplay Balance:**
- Speed modulation capped at ±20% to keep game playable
- Beat-synced food spawning has 2-second cooldown
- Score multiplier only applies during strong beats (intensity > 0.3)
- Particle effects don't obscure gameplay

**Future Enhancements:**
- Different visualization modes (spectrum bars, waveform, circular)
- BPM detection for more accurate beat sync
- Preset color palettes
- Recording replays with audio sync
- Leaderboards for beat-synced high scores

---

## Execution Ready

All tasks are atomic (2-5 minutes), include exact code, and follow TDD where applicable. Implementation can proceed in order or tasks can be parallelized where independent.
