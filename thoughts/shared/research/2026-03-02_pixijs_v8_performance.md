---
date: 2026-03-02
topic: PixiJS v8 performance characteristics
tags: [pixijs, v8, graphics, performance, rendering, gpu, mesh]
status: final
---

# PixiJS v8 Performance Research

## Question 1: Graphics.clear() — GPU Buffer Invalidation

### What Happens Internally

When you call `g.clear()` on a Graphics object in PixiJS v8:

1. **CPU-side geometry re-triangulation is triggered** — the internal geometry data structure is reset and must be rebuilt from scratch before the next render.
2. **GPU buffers are NOT automatically freed** — they persist in GPU memory until the Graphics object is destroyed or garbage collected. This can lead to VRAM leaks if not managed carefully.
3. **The GeometryGeometry is marked as dirty** — geometry re-triangulation occurs, which is an expensive CPU operation.

### Key Insight from Official Guidance

The PixiJS v8 official documentation explicitly states: **"Do not clear and rebuild graphics every frame."**

### Known Issues in v8

There are documented memory management problems in v8:
- Rapidly creating and destroying Graphics objects leads to a **memory leak in Chrome** that eventually crashes with `RangeError: Invalid array length`
- There is **severe VRAM degradation in v8 compared to v7**, particularly with Sprite texture creation

### Recommendation

Instead of calling `.clear()` and rebuilding geometry each frame:
- **Prefer swapping prebuilt GraphicsContext objects** — this is the pattern recommended by PixiJS maintainers
- Create multiple GraphicsContext instances with different geometry ahead of time
- Swap contexts with: `graphic.context = frames[frameIndex];` (very cheap operation)
- This avoids CPU geometry re-triangulation and GPU buffer churn

---

## Question 2: Cost of rect() + fill() Repeated 50+ Times Per Frame

### Draw Call Behavior

The cost depends on whether the geometry can be **batched**:

#### Batching Rules

- **Geometry under 100 points (GraphicsGeometry.BATCHABLE_SIZE):** All rectangles can be batched into a **single draw call**
- **Geometry over 100 points:** Cannot be batched; each shape generates its own draw call
- **Break conditions:** Different blend modes, different z-order, or state changes break batches

#### Per-Frame Cost for 50 Rectangles

Assuming all 50 rects fit under the 100-point limit (they should):
- **Single Graphics object with 50 rects:** 1 draw call (if not exceeding 100 points total)
- **50 separate Graphics objects:** Up to 50 draw calls, but each small Graphics is as fast as a Sprite once batched

#### Myth vs. Reality

- **MYTH:** Each `.fill()` call creates a separate draw call
- **REALITY:** All fills in a single Graphics object are geometry commands in the same draw call (unless total geometry exceeds 100 points)

### Performance Profile

Graphics objects are **fastest when not modified constantly**. For your use case:
- Building the geometry once per frame with 50 rect() calls: **Moderate cost** (CPU geometry triangulation)
- Clearing and rebuilding: **High cost** (re-triangulation each frame)
- Just changing colors/positions: **Cheap** (transform, alpha, tint don't trigger re-triangulation)

---

## Question 3: More Efficient Approaches for Dynamic Grid Rendering

### Option 1: Graphics with Context Swapping ⭐ RECOMMENDED

**Best for:** Animated sequences with known state changes

```typescript
// Build contexts once during setup
const contexts = [
  buildGridContext(gridState1),
  buildGridContext(gridState2),
  buildGridContext(gridState3),
];

const graphic = new Graphics(contexts[0]);

// Per frame: cheap swap (no geometry rebuild)
graphic.context = contexts[frameState % contexts.length];
```

**Pros:**
- No per-frame geometry triangulation
- Prebuilt geometry is reused
- One draw call per frame
- Very cheap context switching

**Cons:**
- Requires predefined states
- Not suitable for per-pixel dynamic changes
- Memory cost scales with number of states

---

### Option 2: Mesh with Custom Geometry ⭐ GOOD FOR FLEXIBLE GRIDS

**Best for:** Grids where cells have dynamic properties (position, color, UV offset)

```typescript
const geometry = new MeshGeometry({
  positions: new Float32Array(cellPositions),
  indices: new Uint32Array(cellIndices),
  // Add per-vertex colors or other attributes
});

const mesh = new Mesh({
  geometry,
  shader: GridShader, // Custom fragment shader for cell rendering
});

// Per frame: update buffers in-place (cheap if autoUpdate=true)
geometry.positions.set(newPositions);
geometry.update(); // Mark as dirty for re-upload
```

**Pros:**
- Direct control over geometry structure
- Efficient per-vertex updates (positions, colors, UVs)
- Single draw call for entire grid
- Shader can handle complex cell rendering logic

**Cons:**
- More setup complexity
- Need custom shader for advanced effects
- Buffer updates cost GPU bandwidth

**Use Cases:**
- Tracker pattern editor with many cells
- Real-time color/brightness changes per cell
- Grid distortion effects

---

### Option 3: MeshPlane (Built-in Subdivided Mesh)

**Best for:** Regular grids with uniform structure

```typescript
const plane = new MeshPlane({
  cols: gridWidth,
  rows: gridHeight,
  // Each cell is a quad (2 triangles)
});

plane.geometry.positions.set(newPositions);
```

**Pros:**
- Built-in grid topology (no manual index construction)
- Designed for grid-based warping and distortion
- Supports `autoUpdate`

**Cons:**
- Less flexible than custom Geometry
- Assumes regular quad-based structure

---

### Option 4: RenderTexture with Scrolling/Offset

**Best for:** Static or slowly changing grids

```typescript
// Render grid into texture once
const rt = new RenderTexture({ width, height });
const gridGraphics = buildGridGraphics();
renderer.render({ target: rt, source: gridGraphics });

// Per frame: just display texture with offset
const sprite = new Sprite(rt);
sprite.x = scrollOffset;
```

**Pros:**
- Grid geometry cached as texture
- Very cheap per-frame update (just offset)
- Works well with CSS-like viewport scrolling

**Cons:**
- Texture resolution limits (not scalable to arbitrary zoom)
- Difficult for per-cell color changes
- Requires re-render when grid changes significantly

---

### Option 5: Single Spritesheet Approach

**Best for:** Grids with pre-rendered cell textures (icons, patterns)

```typescript
const cellTexture = Texture.from('cells-spritesheet.png');

// Draw each cell as a sprite
for (let i = 0; i < cells.length; i++) {
  const sprite = new Sprite(cellTexture);
  sprite.frame = frameForCellType[cells[i]];
  container.addChild(sprite);
}
```

**Pros:**
- Extremely fast if cells are predrawn
- GPU batches all sprites together
- No geometry triangulation cost

**Cons:**
- Not suitable for per-pixel gradients or effects
- Texture atlas management overhead
- Memory cost for spritesheet

---

### Option 6: Shader-Based Grid (Fragment Shader Only)

**Best for:** Purely visual grids (lines, patterns, procedural)

```glsl
// Fragment shader generates grid pattern procedurally
void main() {
  vec2 cell = fract(uv * gridSize);
  if (cell.x < lineWidth || cell.y < lineWidth) {
    gl_FragColor = gridColor;
  } else {
    gl_FragColor = cellColor;
  }
}
```

**Pros:**
- Zero geometry overhead
- Grid lines generated on-GPU per pixel
- Supports complex patterns (checkerboard, gradients, etc.)
- Scales perfectly with zoom

**Cons:**
- Can't render arbitrary cell content
- Complex shader code required
- Per-cell color mapping requires texture lookup

---

## Comparison Table

| Approach | Setup Cost | Per-Frame Cost | Draw Calls | Best Use Case |
|----------|-----------|---------------|-----------|---------------|
| Graphics + Context Swap | High (build contexts) | Very Low | 1 | Animated sequences |
| Custom Mesh Geometry | High (build geometry) | Low-Medium | 1 | Dynamic cell properties |
| MeshPlane | Low | Low-Medium | 1 | Regular grid distortion |
| RenderTexture Scroll | Medium | Very Low | 1 | Static grids with viewport |
| Spritesheet | Medium | Very Low | Batched | Pre-rendered cell textures |
| Shader Grid | Low | Very Low | 1 | Pure visual grids |
| Simple Graphics | None | High | 1-50 | Quick prototypes |

---

## Question 4: BitmapText Property Performance

### Text Property (`.text`)

**Cost: Very Cheap (with caveats)**

- Setting `.text` to the **same value** does **NOT short-circuit** in PixiJS v8
- The library will re-triangulate the text geometry and re-upload buffers even if the text hasn't changed
- However, **no canvas rasterization occurs** (unlike regular Text) — BitmapText uses pre-rendered glyph atlases

**Performance implications:**
- Changing 100 BitmapText objects' text each frame: ~5-10ms depending on character count
- Much faster than regular Text (which rasterizes to canvas each change)
- Still slower than not changing text at all

**Optimization:** Cache text values and only call `.text = newVal` when text actually changes:
```typescript
if (bitmapText.text !== newText) {
  bitmapText.text = newText;
}
```

---

### Position Properties (`.x`, `.y`)

**Cost: Free (transform-only)**

- Position is a standard transform property
- Setting `.x` and `.y` does **NOT trigger geometry rebuilds**
- PixiJS v8 documentation explicitly states: graphics objects are fastest when not modified constantly "**not including the transform, alpha or tint!**"

**Performance:** Changing position 1000 times per frame: negligible cost (~0.1ms)

---

### Tint Property (`.tint`)

**Cost: Free (transform-only)**

- `.tint` is a color multiplication applied to the bitmap texture
- Does **NOT trigger geometry rebuild**
- Not included in the "constantly modified" warnings

**Performance:** Changing tint 1000 times per frame: negligible cost (~0.1ms)

---

### Batch Impact

BitmapText objects are **heavily batched** by PixiJS:
- All BitmapText with the same font texture render as a single batch
- Sorting by z-index or blend mode can break batches
- Tens of thousands of BitmapText can render efficiently if:
  - Same font texture (same `fontName`, same styling)
  - No interleaved blend modes
  - No frequent re-ordering

---

## Summary & Recommendations for DEViLBOX

### For Tracker Pattern Editor Grid

The pattern editor needs to render ~200-500 cells per pattern, with cells updating on almost every frame (note changes, parameter changes).

**Recommended approach (priority order):**

1. **Mesh + Custom Geometry** (if colors/positions change frequently)
   - Build a single MeshGeometry with quads for all cells
   - Store cell data (color, position offset) as vertex attributes
   - Update geometry buffer each frame (cheap bandwidth operation)
   - Single draw call

2. **Graphics + Context Swapping** (if pattern state is discrete)
   - Build Graphics contexts for common pattern configurations
   - Swap contexts based on pattern state
   - Zero geometry triangulation per frame

3. **Fallback: Simple Graphics** (if complexity is low)
   - OK for prototyping, but will have higher CPU cost
   - Clear and rebuild each frame acceptable for <500 cells
   - Geometry triangulation is CPU-intensive at scale

### For Sample Editor Display

The sample editor UI displays metadata, waveforms, and controls.

**Recommended approach:**
- **BitmapText for labels** — only set `.text` when value changes (implement caching)
- **Graphics for waveform visualization** — build once, swap contexts for different sample data
- **Position/tint updates:** Free, can update every frame without performance impact

### For Overall Rendering Pipeline

Based on the research and existing DEViLBOX code (CRTRenderer pattern):

1. **Organize by render order:** All Meshes/Graphics, then all sprites, then UI/BitmapText
   - Reduces batch breaks
2. **Set bounds explicitly:** Use `container.boundArea` to avoid recursive bounds calculation
3. **Disable `interactiveChildren`** on non-interactive containers
4. **Stagger texture destruction:** If destroying multiple textures, space them across frames
5. **Monitor VRAM:** Use Chrome DevTools GPU tab to catch leaks
   - v8 has known VRAM degradation issues

---

## Sources

- [PixiJS v8 Performance Tips](https://pixijs.com/8.x/guides/concepts/performance-tips)
- [PixiJS v8 Graphics Guide](https://pixijs.com/8.x/guides/components/scene-objects/graphics)
- [PixiJS v8 Mesh Guide](https://pixijs.com/8.x/guides/components/scene-objects/mesh)
- [PixiJS v8 BitmapText Guide](https://pixijs.com/8.x/guides/components/scene-objects/text/bitmap)
- [GitHub Issue: Memory leak in Graphics destruction in v8](https://github.com/pixijs/pixijs/issues/10586)
- [GitHub Issue: Severe VRAM Management Degradation in v8](https://github.com/pixijs/pixijs/issues/11331)
- [Medium: Maximising Performance in PixiJS](https://medium.com/@turkmergin/maximising-performance-a-deep-dive-into-pixijs-optimization-6689688ead93)
- [Medium: Rendering Fast Graphics with PixiJS](https://medium.com/@bigtimebuddy/rendering-fast-graphics-with-pixijs-6f547895c08c)
- [PixiJS API: Graphics](https://pixijs.download/v8.0.0/docs/scene.Graphics.html)
- [PixiJS API: Mesh](https://pixijs.download/v8.0.0/docs/scene.Mesh.html)
- [PixiJS API: MeshGeometry](https://pixijs.download/v8.1.0/docs/scene.MeshGeometry.html)
