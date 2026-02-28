/**
 * WorkbenchTiltRenderer — WebGL perspective tilt for the infinite canvas.
 *
 * Renders the world container to a full-size RenderTexture, then displays
 * it on a trapezoid mesh that simulates a desk viewed at a slight angle.
 *
 * Because everything happens inside WebGL (not CSS 3D transforms), the
 * browser compositor sees a flat canvas — fast and compositor-friendly.
 *
 * Technique:
 *   1. Render the world container to an offscreen RenderTexture each frame.
 *   2. Display the RT on a quad Mesh whose vertex positions form a trapezoid
 *      (top edge narrower + slightly shifted = perspective desk illusion).
 *   3. Vertex positions are in clip space (-1→1), so no projection uniform needed.
 *   4. tiltFactor: 0 = flat quad, 1 = full 20° desk tilt.
 *
 * DOM overlays (PixiDOMOverlay portals) must be hidden during tilt since they
 * cannot participate in the WebGL transform.
 */

import type { Application, Container as ContainerType } from 'pixi.js';
import {
  RenderTexture,
  Geometry,
  Buffer,
  BufferUsage,
  Mesh,
  Shader,
  GlProgram,
} from 'pixi.js';

// ─── GLSL shaders ─────────────────────────────────────────────────────────────

// Clip-space vertex shader: no projection matrix needed.
// aPosition is pre-computed in clip space (x ∈ [-1,1], y ∈ [-1,1]).
const VERT = /* glsl */ `
  in vec2 aPosition;
  in vec2 aUV;
  out vec2 vUV;
  void main() {
    gl_Position = vec4(aPosition, 0.0, 1.0);
    vUV = aUV;
  }
`;

// Samples the render texture.
// Y is not flipped here — Pixi's RenderTexture already handles orientation
// via framebuffer.invertY so UV (0,0) = top-left of rendered image.
const FRAG = /* glsl */ `
  in vec2 vUV;
  out vec4 outColor;
  uniform sampler2D uTexture;
  void main() {
    outColor = texture(uTexture, vUV);
  }
`;

// ─── WorkbenchTiltRenderer ────────────────────────────────────────────────────

export class WorkbenchTiltRenderer {
  private app: Application;
  private rt: RenderTexture;
  private mesh: Mesh<Geometry, Shader>;

  // Float32Array kept as a persistent view into the posBuffer's data.
  // Modified in-place each frame then buf.update() signals the GPU.
  private posData: Float32Array;
  private posBuffer: Buffer;

  private w: number;
  private h: number;

  constructor(
    app: Application,
    parentContainer: ContainerType,  // mesh is added here imperatively
    width: number,
    height: number,
  ) {
    this.app = app;
    this.w = width;
    this.h = height;

    // ── RenderTexture ──────────────────────────────────────────────────────
    this.rt = RenderTexture.create({ width, height });

    // ── Vertex buffers ─────────────────────────────────────────────────────
    // 4 vertices × 2 floats each = 8 values.
    // Initialised to the full-screen rectangle in clip space.
    this.posData = new Float32Array([
      -1,  1,  // TL
       1,  1,  // TR
       1, -1,  // BR
      -1, -1,  // BL
    ]);

    this.posBuffer = new Buffer({
      data: this.posData,
      usage: BufferUsage.VERTEX | BufferUsage.COPY_DST,
    });

    const uvBuffer = new Buffer({
      data: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      usage: BufferUsage.VERTEX,
    });

    const indexBuffer = new Buffer({
      data: new Uint32Array([0, 1, 2, 0, 2, 3]),
      usage: BufferUsage.INDEX,
    });

    // ── Geometry ───────────────────────────────────────────────────────────
    const geometry = new Geometry({
      attributes: {
        aPosition: { buffer: this.posBuffer, format: 'float32x2', stride: 8, offset: 0 },
        aUV:       { buffer: uvBuffer,       format: 'float32x2', stride: 8, offset: 0 },
      },
      indexBuffer,
    });

    // ── Shader ─────────────────────────────────────────────────────────────
    const glProgram = new GlProgram({ vertex: VERT, fragment: FRAG });
    const shader = new Shader({
      glProgram,
      resources: { uTexture: this.rt.source },
    });

    // ── Mesh ───────────────────────────────────────────────────────────────
    this.mesh = new Mesh({ geometry, shader });
    this.mesh.visible = false;
    this.mesh.zIndex = 9000; // above all workbench layers
    parentContainer.addChild(this.mesh);
  }

  /**
   * Render worldContainer → RenderTexture and update the trapezoid shape.
   * Call BEFORE the main Pixi render pass (i.e. inside a ticker callback).
   *
   * @param worldContainer  The camera-transformed world container.
   * @param tiltFactor      0 (flat) → 1 (full desk tilt).
   */
  renderFrame(worldContainer: ContainerType, tiltFactor: number): void {
    // Render world at full opacity to the offscreen RT.
    // The container must be rendered before it is hidden for the main pass.
    this.app.renderer.render({ container: worldContainer, target: this.rt, clear: true });

    // Update trapezoid vertex positions in clip space.
    // At tiltFactor=1: top edge insets ~7% and rises ~4% relative to canvas.
    const inset   = this.w * tiltFactor * 0.07;  // pixel inset per side
    const topY    = this.h * tiltFactor * 0.04;  // pixel drop at top
    const { w, h } = this;

    // Pixel → clip-space: clipX = px/w*2-1,  clipY = 1-py/h*2
    const tlx = (inset     / w) * 2 - 1;   const tly =  1 - (topY / h) * 2;
    const trx = ((w-inset) / w) * 2 - 1;   const try_ = tly;
    const brx =  1;                          const bry  = -1;
    const blx = -1;                          const bly  = -1;

    this.posData[0] = tlx;  this.posData[1] = tly;
    this.posData[2] = trx;  this.posData[3] = try_;
    this.posData[4] = brx;  this.posData[5] = bry;
    this.posData[6] = blx;  this.posData[7] = bly;
    this.posBuffer.update();
  }

  /** Show the tilt mesh and hide the live world container (avoid double-draw). */
  setActive(active: boolean, worldContainer: ContainerType): void {
    this.mesh.visible = active;
    worldContainer.visible = !active;
  }

  /** Call when the canvas is resized. */
  resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.rt.resize(width, height);
  }

  destroy(): void {
    this.mesh.destroy();
    this.rt.destroy();
  }
}
