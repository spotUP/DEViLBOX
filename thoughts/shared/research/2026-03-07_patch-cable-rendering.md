---
date: 2026-03-07
topic: patch-cable-rendering-algorithms
tags: [pixi, rendering, cables, modular-synth, ui, research]
status: final
---

# Patch Cable Rendering: State of the Art Research

Comprehensive research into how professional DAWs, modular synth software, and web-based node editors render patch cables. Covers curve algorithms, visual techniques, interaction design, performance, and PixiJS v8-specific approaches.

---

## 1. Curve Algorithms

### 1.1 Quadratic Bezier (VCV Rack)

**VCV Rack uses a single quadratic Bezier curve** -- NOT cubic Bezier, NOT catenary, NOT physics simulation. This is surprisingly simple.

From `VCVRack/Rack` v2, `src/app/CableWidget.cpp`:

```cpp
static math::Vec getSlumpPos(math::Vec pos1, math::Vec pos2) {
    float dist = pos1.minus(pos2).norm();
    math::Vec avg = pos1.plus(pos2).div(2);
    // Lower average point as distance increases
    avg.y += (1.0 - settings::cableTension) * (150.0 + 1.0 * dist);
    return avg;
}
```

The "slump" control point is computed as:
- Start with the **midpoint** of the two endpoints
- **Add vertical sag** proportional to `(1 - tension) * (150 + distance)`
- `cableTension` ranges 0.0-1.0 (default 1.0 = taut, 0.0 = maximum droop)

Drawing uses NanoVG's `nvgQuadTo()`:
```cpp
nvgBeginPath(args.vg);
nvgMoveTo(args.vg, outputPos);
nvgQuadTo(args.vg, slump, inputPos);  // Single quadratic bezier
```

**Key insight**: VCV Rack does NOT use cubic Bezier or catenary. A single quadratic Bezier with a gravity-influenced control point produces a convincing cable appearance at minimal computational cost.

### 1.2 Cubic Bezier (React Flow / xyflow, Most Node Editors)

React Flow's `getBezierPath()` uses **cubic Bezier** with control points offset from the source/target positions:

```
M sourceX,sourceY C controlX1,sourceY controlX2,targetY targetX,targetY
```

Control points are calculated with `getControlWithCurvature()`:
- Control point 1: offset horizontally from source by `curvature` amount
- Control point 2: offset horizontally from target by `curvature` amount
- The curvature scales with distance between endpoints

Example: source (0,20) -> target (150,100) produces `M0,20 C75,20 75,100 150,100`

This creates the characteristic **S-curve** seen in node editors where connections exit horizontally from ports.

### 1.3 Catenary Curves (Physics-Accurate)

A catenary is the curve a hanging cable makes under gravity: `y = a * cosh((x - b) / a) + c`

**apulsoft blog** provides the complete solving algorithm:

Given endpoints (x0,y0), (x1,y1) and rope length L:
1. Compute `x_d = x1 - x0`, `y_d = y1 - y0`
2. Compute `x_f = sqrt(L^2 - y_d^2) / x_d`
3. Solve `sinh(xi) / xi - x_f = 0` numerically
4. Derive: `a = x_d / (2*xi)`, `b = (x0+x1)/2 - a*asinh(y_d / (2*a*sinh(xi)))`, `c = y0 - a*cosh((x0-b)/a)`

**Two-fold approximation** (avoids Newton-Raphson instability):
- For xi <= 2: Taylor series: `xi = sqrt(t - 84/t - 14)` with cubic root formula
- For xi > 2: Logarithmic: `xi = 1.16 * ln(x_f - 0.75) + 1.9`

**When to use**: Catenary is best when you want physically-accurate cable droop and have a known cable "length" parameter. The math is heavier than Bezier but still O(1) per cable per frame.

**Who uses it**: Softube Modular and some hardware-emulating plugins use catenary or catenary-like curves for physical realism. A C++17 header implementation exists (apulsoft GitHub).

### 1.4 Max/MSP: Three Styles

Max/MSP offers user-selectable patchcord styles:
- **Curved** (default): Smooth curves, likely cubic Bezier
- **Straight**: Direct line segments
- **Segmented**: User-placed breakpoints with right-angle corners

Users can convert between styles (right-click > Align for segmented, Remove All Segments for curved). Shift-click temporarily toggles the active style.

### 1.5 Reaktor

Reaktor 6 uses **curved wires** with color-coding by signal type. The curves are anti-aliased and change color to indicate signal type (audio, event, etc.).

### 1.6 Bitwig Grid

Bitwig uses a **non-skeuomorphic** approach -- modulation connections are shown as curved lines but the visual emphasis is on clarity over realism. Every visible cable represents a stereo pair.

### 1.7 Summary Table

| Application        | Curve Type         | Physics Sim | Notes                          |
|--------------------|--------------------|-------------|--------------------------------|
| VCV Rack           | Quadratic Bezier   | No          | Single control point + gravity |
| React Flow / xyflow| Cubic Bezier       | No          | S-curve with curvature param   |
| Reason             | Cubic Bezier/Spline| No          | 3D-shaded skeuomorphic cables  |
| Max/MSP            | Cubic Bezier       | No          | 3 styles: curved/straight/segmented |
| Reaktor            | Cubic Bezier       | No          | Color-coded by signal type     |
| Bitwig Grid        | Cubic Bezier       | No          | Clean, non-skeuomorphic        |
| Cherry Audio VM    | Bezier + sag       | No          | "Nicely swung" cables          |
| Softube Modular    | Catenary-like      | No          | More physical appearance        |
| cables.gl          | Simple splines     | No          | 1px lines for connections      |
| litegraph.js       | Canvas Bezier      | No          | 2-canvas architecture          |

**Key finding**: No major application uses real-time physics simulation for cable rendering. The visual "physics" is all achieved through static mathematical curves with gravity-influenced control points.

---

## 2. Visual Realism Techniques

### 2.1 VCV Rack's Multi-Layer Drawing

VCV Rack draws cables in **3 layers** (from the actual source code):

**Layer -1: Shadow**
```cpp
// Offset shadow downward by 30px
math::Vec shadowSlump = slump.plus(math::Vec(0, 30));
nvgBeginPath(args.vg);
nvgMoveTo(args.vg, outputPos);
nvgQuadTo(args.vg, shadowSlump, inputPos);
nvgStrokeColor(args.vg, nvgRGBAf(0, 0, 0, 0.10));
nvgStrokeWidth(args.vg, thickness - 1.0);
nvgStroke(args.vg);
```

**Layer 0: Outline + Fill (two strokes, same path)**
```cpp
// Outer stroke (darker, full thickness)
nvgStrokeColor(args.vg, color::mult(color, 0.8));
nvgStrokeWidth(args.vg, thickness);  // 6px normal, 9px polyphonic
nvgStroke(args.vg);

// Inner stroke (lighter, slightly thinner)
nvgStrokeColor(args.vg, color::mult(color, 0.95));
nvgStrokeWidth(args.vg, thickness - 1.0);  // 5px normal, 8px polyphonic
nvgStroke(args.vg);
```

This creates a **subtle 3D cylinder effect** -- the darker outer edge acts as a shadow/outline and the lighter inner fill simulates a highlight.

### 2.2 Cable Thickness

| Application     | Normal Width | Thick/Polyphonic | Technique           |
|-----------------|-------------|-------------------|---------------------|
| VCV Rack        | 6px         | 9px (polyphonic)  | Two concentric strokes |
| React Flow      | 1-2px       | N/A               | Single SVG stroke   |
| Reason          | ~4-6px      | N/A               | Textured/3D         |

VCV Rack increases thickness for polyphonic cables (multiple channels), providing visual feedback about signal complexity.

### 2.3 Cable Color Strategies

**VCV Rack**: Random color assignment from a preset palette. Colors are serialized with the patch. User can right-click to change color.

**Reaktor**: Automatic color-coding by signal type (audio = one color, event/control = another).

**Max/MSP**: Color indicates data type (audio = yellow/striped, message = gray, signal = dotted).

**React Flow**: Fully customizable per-edge via props.

### 2.4 Opacity and Overlapping Cable Management

VCV Rack's approach (from source):
- Default opacity: 0.5 (semi-transparent)
- **Hover highlight**: When mouse hovers over a connected port, that cable goes to opacity 1.0
- **Inactive dimming**: Cables with 0 active channels get additional 50% transparency
- **Dragging cable**: Always opacity 1.0
- Opacity is applied with gamma correction: `nvgAlpha(args.vg, std::pow(opacity, 1.5))`

### 2.5 3D Appearance Techniques

For a more realistic "rubber cable" look without full 3D rendering:

1. **Concentric strokes** (VCV Rack): Draw same path twice at different widths/colors
2. **Linear gradient along perpendicular**: Apply a gradient across the cable width (light on top, dark on bottom)
3. **Texture mapping** (Reason-style): Map a pre-rendered cable texture along a mesh strip
4. **Drop shadow offset**: Draw same curve shifted down and blurred (VCV Rack uses 30px offset, 10% opacity)

### 2.6 Plug/Connector Rendering

VCV Rack renders **SVG plug graphics** at cable endpoints:
- Plug SVG is rotated to match the cable angle at the connection point
- Rotation calculated from: `slump.minus(outputPos).arg()` (angle of cable tangent)
- Plugs are tinted to match cable color
- LED lights on plugs show signal activity

---

## 3. Interaction Design

### 3.1 Cable Dragging Behavior

**VCV Rack**:
- Cable follows mouse cursor during drag
- The unconnected end tracks mouse position; the "slump" recalculates each frame
- Hovering over a valid port highlights it (snap-to-port visual feedback)

**React Flow**:
- Edge creation starts from clicking an output handle
- Curved preview follows cursor
- Snap-to-target on hover

### 3.2 Cable Selection and Highlighting

**VCV Rack**:
- No explicit cable selection; hovering over a port highlights all connected cables
- Hover increases opacity from 0.5 to 1.0

**Max/MSP**:
- Click to select individual patchcords
- Selected cords highlighted
- Delete key removes selected cord

### 3.3 Cable Collision / Avoidance

**No major application implements cable collision avoidance.** All applications allow cables to overlap freely. This is intentional -- physical cable routing would be computationally expensive and would fight the user's layout intentions.

### 3.4 Z-Ordering

**VCV Rack**:
- Cables render in a single layer
- Plugs have a separate container that renders on top of cables
- "Top plug" concept: only the topmost plug on a port shows its LED light
- The most recently interacted cable renders on top

---

## 4. Performance Considerations

### 4.1 Rendering Technology Comparison

| Technology   | Draw Calls | Anti-Aliasing | Batching   | Best For            |
|-------------|-----------|---------------|------------|---------------------|
| Canvas 2D   | 1/cable   | Built-in      | None       | <20 cables          |
| SVG         | 1/cable   | Built-in      | None       | <50 cables, static  |
| NanoVG/GL   | 1/cable   | Multi-sample  | Minimal    | 50-200 cables       |
| WebGL Mesh  | Batchable | Shader-based  | Full       | 100+ cables         |
| PixiJS Graphics | ~1/cable | Triangulated  | Partial    | 20-100 cables       |
| PixiJS MeshRope | Batchable | Texture-based | Yes     | 50-200 cables       |

### 4.2 VCV Rack Performance

VCV Rack uses NanoVG (vector graphics on OpenGL). Each cable is 2-3 draw calls (shadow + outline + fill). With 50-100 cables this is manageable on desktop GPUs but has been noted as a performance concern by the community.

### 4.3 React Flow / SVG Performance

React Flow renders edges as SVG `<path>` elements. Performance issues arise with:
- 500+ edges with `stroke-dasharray` animation (CSS-driven, CPU-heavy)
- Solution: `onlyRenderVisibleElements` prop for viewport culling

### 4.4 WebGL Batching for Cables

For rendering 100+ cables efficiently in WebGL:

1. **Triangle strip approach**: Tessellate each Bezier into a triangle strip, merge all strips into one vertex buffer, single draw call
2. **Instanced rendering**: One cable mesh template, instanced with per-cable uniforms (control points, color)
3. **Texture atlas**: Render cable appearance into texture, apply via mesh UV mapping

Performance benchmarks from Cytoscape.js WebGL renderer:
- 1000 curves at 1px width: 45 FPS
- 1000 curves at 3px width: 30 FPS
- Key bottleneck: number of vertices, not draw calls (with batching)

### 4.5 Key Optimization: Static vs Dynamic

**Static cables** (not being dragged): Cache the tessellated geometry. Only rebuild when endpoints move (module repositioning).

**Dynamic cables** (being dragged): Rebuild geometry each frame, but only for the one cable being dragged.

**Hybrid approach**: Keep a geometry pool. Mark cables dirty when their endpoints move. Rebuild only dirty cables.

---

## 5. PixiJS v8-Specific Approaches

### 5.1 Approach A: Graphics API (Simplest)

```typescript
const g = new Graphics();
// Quadratic Bezier (VCV Rack style)
g.moveTo(x1, y1);
g.quadraticCurveTo(cx, cy, x2, y2);
g.stroke({ width: 6, color: 0xff0000 });
```

**Pros**: Simple, built-in anti-aliasing (adaptive tessellation), familiar API
**Cons**: Each Graphics object is a separate draw call, "Using 100s of graphics complex objects can be slow" (official docs). Not batchable with other Graphics.

**Performance ceiling**: ~50-80 cables before frame drops become noticeable.

**Optimization**: Convert static cables to sprites via `renderer.generateTexture()` -- reported 3-4x performance boost.

### 5.2 Approach B: MeshRope (Best Balance)

```typescript
const points: Point[] = [];
for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    // Evaluate quadratic bezier
    const x = (1-t)*(1-t)*x1 + 2*(1-t)*t*cx + t*t*x2;
    const y = (1-t)*(1-t)*y1 + 2*(1-t)*t*cy + t*t*y2;
    points.push(new Point(x, y));
}
const rope = new MeshRope({ texture: cableTexture, points, textureScale: 0 });
```

**Pros**:
- Texture-mapped cables (can include highlight/shadow in the texture itself)
- `textureScale: 0` stretches texture, `textureScale > 0` tiles/repeats
- Participates in PixiJS batch rendering (fewer draw calls)
- Built-in UV mapping along the rope
- `autoUpdate` flag for dynamic vs static optimization

**Cons**:
- Need to manually tessellate the Bezier curve into points
- Texture quality depends on segment count (20-30 segments is usually sufficient)
- No built-in shadow/glow (needs separate pass or shader)

**Cable texture**: A horizontal 1D texture, e.g. 32x8 pixels:
- Top edge: dark (shadow)
- Center: cable color with slight highlight offset upward
- Bottom edge: darker (ambient occlusion)

This single texture, when mapped onto MeshRope, creates the 3D cylinder illusion automatically.

### 5.3 Approach C: Custom Mesh + Shader (Most Advanced)

Build custom geometry (triangle strip along Bezier path) with a fragment shader for:
- Distance-field anti-aliasing
- Glow/bloom effect
- Dynamic color/thickness

```typescript
const geometry = new MeshGeometry({
    positions: new Float32Array(vertexData),  // Triangle strip vertices
    uvs: new Float32Array(uvData),
    indices: new Uint32Array(indexData)
});

const shader = Shader.from({
    gl: { vertex: vertexSrc, fragment: fragmentSrc },
    resources: {
        cableUniforms: {
            color: { value: [1, 0, 0, 1], type: 'vec4<f32>' },
            glow: { value: 0.5, type: 'f32' },
            thickness: { value: 6.0, type: 'f32' }
        }
    }
});

const mesh = new Mesh({ geometry, shader });
```

Fragment shader for cable with glow:
```glsl
// Pseudocode
varying float vDistFromCenter;  // -1 to 1 across cable width
uniform vec4 color;
uniform float glow;

void main() {
    float d = abs(vDistFromCenter);
    float alpha = smoothstep(1.0, 0.8, d);  // Anti-aliased edge
    float glowAlpha = exp(-d * d * 4.0) * glow;  // Gaussian glow
    gl_FragColor = vec4(color.rgb, alpha + glowAlpha);
}
```

**Pros**: Maximum visual quality, GPU-accelerated effects, single draw call per batch
**Cons**: Most complex to implement, shader maintenance, WebGL/WebGPU compat

### 5.4 Approach D: Hybrid (Recommended for Production)

Combine approaches based on cable state:

1. **Static cables**: MeshRope with cable texture, `autoUpdate: false`
2. **Dragging cable**: Graphics API (simple, redraws every frame anyway)
3. **Shadow layer**: Separate Graphics or MeshRope rendered to a lower layer
4. **Selected/highlighted cable**: Add GlowFilter or draw with increased width

### 5.5 PixiJS Performance Rules for Cables

1. **Group cables by type**: Render all cables of the same color together to maintain batch efficiency
2. **Avoid blend mode mixing**: Different blend modes break batches -- keep all cables using the same blend mode
3. **MeshRope > Graphics for many cables**: MeshRope participates in batching; Graphics objects don't batch with each other
4. **Pre-compute geometry**: Only update cable geometry when endpoints move
5. **Use Container.sortableChildren sparingly**: Sorting has CPU cost
6. **Texture atlas for cable textures**: Put all cable color textures in one atlas to maximize batching
7. **Render order matters**: `sprite / graphic / sprite / graphic` is slower than `sprite / sprite / graphic / graphic` -- group by render type

---

## 6. Notable Open-Source Implementations

### 6.1 VCV Rack (C++ / NanoVG / OpenGL)

- **Repository**: https://github.com/VCVRack/Rack (branch v2)
- **Key file**: `src/app/CableWidget.cpp` (412 lines total)
- **Algorithm**: Single quadratic Bezier with gravity-influenced midpoint
- **Drawing**: NanoVG vector graphics on OpenGL
- **Technique**: 3-layer drawing (shadow, outline, fill)
- **Settings**: User-adjustable cable tension (0-1) and opacity (0-1)
- **License**: Source-available (GPLv3+ with additional restrictions)

### 6.2 React Flow / xyflow (TypeScript / SVG)

- **Repository**: https://github.com/xyflow/xyflow
- **Key file**: `packages/system/src/utils/edges/bezier-edge.ts`
- **Algorithm**: Cubic Bezier with `getControlWithCurvature()`
- **Drawing**: SVG `<path>` elements with `d` attribute
- **Edge types**: Default (bezier), straight, step, smoothstep
- **License**: MIT

### 6.3 litegraph.js (JavaScript / Canvas 2D)

- **Repository**: https://github.com/jagenjo/litegraph.js
- **Architecture**: Two-canvas system (background grid + connections, foreground nodes)
- **Drawing**: Canvas 2D `bezierCurveTo()`
- **Notable**: Used by ComfyUI (Stable Diffusion node editor)
- **License**: MIT

### 6.4 Patchcab (Svelte / Web Audio)

- **Repository**: https://github.com/spectrome/patchcab
- **Architecture**: Tone.js + Svelte for Web Audio modular synth
- **License**: MIT

### 6.5 cables.gl (WebGL Visual Programming)

- **Repository**: https://github.com/cables-gl
- **Architecture**: Full WebGL pipeline for visual programming
- **Connections**: Simple 1px splines between nodes
- **License**: MIT

### 6.6 Catenary Curve Implementation

- **Blog**: https://www.apulsoft.ch/blog/cable-dangle-catenary/
- **Language**: C++17 header-only
- **Algorithm**: Complete catenary solver with two-fold numerical approximation
- **License**: Not specified (blog post)

---

## 7. Recommendations for PixiJS v8 Implementation

### 7.1 Recommended Algorithm: Quadratic Bezier (VCV Rack Style)

For a modular synth application, the VCV Rack approach is proven and efficient:

```typescript
function getSlumpPoint(p1: Point, p2: Point, tension: number = 0.5): Point {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2 + (1 - tension) * (150 + dist);
    return new Point(midX, midY);
}
```

Why quadratic Bezier over cubic:
- One fewer control point to compute
- Visually indistinguishable for hanging cables
- Cheaper to tessellate
- Proven by VCV Rack (the most successful virtual modular synth)

### 7.2 Recommended Rendering: MeshRope with Cable Texture

1. Create a small horizontal cable texture (e.g., 32x8) with baked-in highlight/shadow
2. Tessellate the quadratic Bezier into 20-30 points
3. Create MeshRope with `textureScale: 0` (stretch mode)
4. Set `autoUpdate: false` for static cables, `true` for dragging
5. Use different tinted versions of the base texture for cable colors (or use `mesh.tint`)

### 7.3 Recommended Visual Effects

1. **Shadow**: Render same curve offset 15-30px down with low alpha (0.1) in a lower container
2. **3D appearance**: Bake highlight/shadow into the cable texture
3. **Selection glow**: Apply `GlowFilter` to selected cable, or draw a wider, more transparent version underneath
4. **Opacity**: Default 0.5 alpha, 1.0 on hover/selection
5. **Color coding**: Assign colors from a carefully chosen palette (6-8 distinct hues)

### 7.4 Recommended Interaction

1. **Drag**: Use Graphics API for the cable being dragged (simplest, rebuilt every frame)
2. **Hover**: Increase opacity to 1.0, optional width increase
3. **Port hover**: Highlight all cables connected to hovered port
4. **Z-order**: Most recently touched cable on top (adjust zIndex)

### 7.5 Performance Budget

For 50-100 cables in a modular synth:
- MeshRope approach: ~1-2 draw calls (all batched)
- Shadow layer: +1 draw call
- Estimated vertex count: 100 cables * 30 segments * 2 triangles = 6000 triangles (trivial for GPU)
- CPU cost: Primarily in tessellating curves when endpoints move

---

## 8. Advanced Techniques (Future Consideration)

### 8.1 SDF-Based Cable Shader

Render cables entirely in a fragment shader using signed distance fields to a Bezier curve. Provides resolution-independent rendering, perfect anti-aliasing, and easy glow effects. High shader complexity but zero CPU tessellation cost.

Shadertoy references:
- Quadratic Bezier distance: https://www.shadertoy.com/view/MlKcDD
- Cubic Bezier SDF: https://www.shadertoy.com/view/4sKyzW
- Bezier with glow: https://www.shadertoy.com/view/XdB3Ww

### 8.2 Instanced Cable Rendering

Pass cable control points as instance attributes. One base mesh (triangle strip), instanced N times. Vertex shader evaluates Bezier and expands to thickness. Single draw call for all cables.

### 8.3 Animated Cable Physics

For juice/polish, add subtle cable sway animation:
```typescript
// Add subtle oscillation to the slump point
const time = performance.now() / 1000;
const sway = Math.sin(time * 0.5 + cableId * 1.7) * 3.0;
slumpPoint.x += sway;
```

This creates gentle swaying without actual physics simulation.
