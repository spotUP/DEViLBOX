/**
 * WorkbenchTiltRenderer — WebGL perspective tilt for the infinite canvas.
 *
 * Renders the world container to a full-size RenderTexture, then displays
 * it on a trapezoid mesh that simulates perspective viewing angles.
 *
 * Technique:
 *   1. Render the world container to an offscreen RenderTexture each frame.
 *   2. Display the RT on a quad Mesh whose vertex positions form a trapezoid.
 *   3. Vertex positions are in clip space (-1→1), no projection uniform needed.
 *   4. tiltFactor: 0 (flat) → 1 (full effect). Preset params control the shape.
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
import type { TiltParams } from '@stores/useWorkbenchStore';

// ─── GLSL shaders ─────────────────────────────────────────────────────────────

const VERT = /* glsl */`#version 300 es
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
  vUV = aUV;
}
`;

const FRAG = /* glsl */`#version 300 es
precision highp float;
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

  private posData: Float32Array;
  private posBuffer: Buffer;

  private w: number;
  private h: number;

  constructor(
    app: Application,
    parentContainer: ContainerType,
    width: number,
    height: number,
  ) {
    this.app = app;
    this.w = width;
    this.h = height;

    // ── RenderTexture ──────────────────────────────────────────────────────
    this.rt = RenderTexture.create({ width, height });

    // ── Vertex buffers ─────────────────────────────────────────────────────
    this.posData = new Float32Array([
      -1,  1,   // TL
       1,  1,   // TR
       1, -1,   // BR
      -1, -1,   // BL
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
    this.mesh.zIndex = 9000;
    parentContainer.addChild(this.mesh);
  }

  /**
   * Render worldContainer → RenderTexture and update the trapezoid shape.
   *
   * @param worldContainer  The camera-transformed world container.
   * @param tiltFactor      0 (flat) → 1 (full effect).
   * @param params          Preset parameters controlling trapezoid shape.
   */
  renderFrame(worldContainer: ContainerType, tiltFactor: number, params: TiltParams): void {
    this.app.renderer.render({ container: worldContainer, target: this.rt, clear: true });

    const { w, h } = this;
    const f = tiltFactor;

    // Top edge: inset + vertical shift
    const topInset = w * f * params.inset;
    const topY     = h * f * params.topShift;

    // Bottom edge: inset + vertical shift (for widescreen/tower presets)
    const botInset = w * f * params.bottomInset;
    const botY     = h * f * params.bottomShift;

    // Pixel → clip-space
    const tlx = (topInset       / w) * 2 - 1;
    const tly = 1 - (topY       / h) * 2;
    const trx = ((w - topInset) / w) * 2 - 1;
    const try_ = tly;
    const brx = ((w - botInset) / w) * 2 - 1;
    const bry = -1 + (botY      / h) * 2;
    const blx = (botInset       / w) * 2 - 1;
    const bly = bry;

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
