/**
 * AelapseSpringsRenderer — WebGL2 renderer for the Ælapse spring-reverb
 * visualization. Ports third-party/aelapse/src/GUI/assets/springs.shader
 * from GLSL 1.10 to GLSL ES 3.00 and renders the 4-spring SDF raymarcher
 * to a caller-supplied HTMLCanvasElement.
 *
 * This is the Phase B2 companion to the framebuffer JUCE UI: the JUCE
 * editor paints the knob strip and delay section into a 2D canvas via its
 * software rasterizer, and this renderer paints the springs on top of a
 * separate WebGL2 canvas composited above the JUCE framebuffer. The two
 * canvases are DOM siblings in the React hardware UI wrapper.
 *
 * State:
 *   - coils / radius / shape    — 0..1, knob positions (mirror aelapse
 *                                 SpringsSection params)
 *   - time                      — seconds (used for rotational animation)
 *   - rmsStack                  — 256 floats = 64 frames × 4 springs
 *   - rmsPos                    — ring-buffer write position (0..63)
 *   - aaSubpixels               — 1 = no AA (cheap), 2 = 4x AA, 3 = 9x AA
 *
 * Usage:
 *   const renderer = new AelapseSpringsRenderer(canvas);
 *   requestAnimationFrame(function tick() {
 *     renderer.render({ coils, radius, shape, time, rmsStack, rmsPos });
 *     requestAnimationFrame(tick);
 *   });
 *   // on teardown:
 *   renderer.dispose();
 */

// ─── Vertex shader ─────────────────────────────────────────────────────────
// Trivial full-screen quad. The vertex positions come from a static buffer
// covering clip-space [-1,1]². No attributes are forwarded to the fragment
// stage — it reads `gl_FragCoord.xy` directly.

const VERTEX_SHADER_ES3 = /* glsl */ `#version 300 es
in vec2 a_position;
void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// ─── Fragment shader ───────────────────────────────────────────────────────
// Ported from aelapse's springs.shader. Changes vs the original:
//   - #version 300 es header
//   - out vec4 fragColor; replaces gl_FragColor
//   - NSPRINGS baked in at 4, RMS_BUFFER_SIZE baked in at 64
//   - `N` used as alias for NSPRINGS in getRMS() — upstream had this
//     inconsistency and we preserve it for exact behaviour parity
//   - u_aasubpixels is an int; GLSL ES 3.00 requires explicit precision
//     qualifiers for integer uniforms
//
// Everything else is identical to the reference shader.

const FRAGMENT_SHADER_ES3 = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

#define PI 3.14159
#define NSPRINGS 4
#define N NSPRINGS
#define SHOWSPRINGS 3
#define RMS_BUFFER_SIZE 64
#define NITER 80
#define BACKGROUND_COLOR vec3(0.8235294117647058, 0.8392156862745098, 0.8470588235294118)

uniform float u_rms[RMS_BUFFER_SIZE * NSPRINGS];
uniform int   u_rmspos;
uniform float u_coils;
uniform float u_radius;
uniform float u_shape;
uniform int   u_aasubpixels;
uniform float u_time;
uniform vec2  u_resolution;

out vec4 fragColor;

const float springSize     = 0.3;
const float springRadius   = 0.38 * springSize;
const float springCoilsMin = 35.0;
const float springCoilsMax = 60.0;
const float coilRadiusMin  = 0.007;
const float coilRadiusMax  = 0.014;

float springCoils;
float coilRadius;

float roundedBox(vec2 p, vec2 size, float cornerSize) {
    vec2 q    = abs(p) - size + cornerSize;
    float sdf = min(max(q.x, q.y), 0.0) + length(max(q, vec2(0.0))) - cornerSize;
    return sdf;
}

float getRMS(float x, int springId) {
    float lgth  = 0.6;
    float xpos  = lgth * float(RMS_BUFFER_SIZE) * (x + 1.0) / 2.0;
    int   ixpos = int(xpos);
    float fxpos = xpos - float(ixpos);
    int ixpos0  = (u_rmspos - ixpos)       & (RMS_BUFFER_SIZE - 1);
    int ixpos1  = (u_rmspos - (ixpos + 1)) & (RMS_BUFFER_SIZE - 1);
    float rms0  = u_rms[ixpos0 * N + springId];
    float rms1  = u_rms[ixpos1 * N + springId];
    float rms   = rms0 + fxpos * (rms1 - rms0);
    rms = pow(rms, 1.0 / 2.5);
    return 5.0 * rms;
}

vec3 transformSpace(vec3 p, float x) {
    p.y /= springSize;
    p.y += 0.5;
    int id = 0;
    if (p.y < 2.0 && p.y > -1.0) {
        id  = int(p.y + 1.0);
        p.y = (fract(p.y) - 0.5) * springSize;
    }

    float springMove = getRMS(x, id);

    float winoverflow = 0.85;
    float winpower    = 0.8;
    float win         = pow(cos(x * winoverflow * PI / 2.0), winpower);
    springMove *= win;

    float fid = float(id);

    p.x = p.x * springCoils - springMove + (fid - 0.394) * 24.1498;

    float transverse = springMove * 0.006;
    float rot  = 2.0 * PI * u_time * (8.12321 + 2.323 * fid) + fid * 124.32;
    float crot = cos(rot);
    float srot = sin(rot);
    p.y += crot * transverse;
    p.z += srot * transverse;

    return p;
}

float mapScene(vec3 p, float x) {
    p = transformSpace(p, x);
    float cylinder = length(p.yz) - springRadius;
    float coils    = (sin(u_shape * atan(p.y, p.z) - p.x)) / springCoils;
    float dist     = length(vec2(cylinder, coils)) - coilRadius;
    return dist;
}

vec3 getColor(vec3 p, float x) {
    p = transformSpace(p, x);
    p.yz /= springRadius;

    float theta = 0.29 * PI;
    float cth = cos(theta);
    float sth = sin(theta);
    p.yz *= mat2(cth, sth, -sth, cth);

    const vec3 baseColor = vec3(0.851, 0.92, 1.000);
    const vec3 specColor = vec3(0.648, 0.706, 0.760);

    vec3 color = baseColor * (0.25 + 0.10 * (1.0 + (length(p.yz) - 1.0) *
                                                   springRadius / coilRadius));

    p.x -= 0.66 + u_radius * 0.5;
    p.z = max(-p.z, 0.0) - sin(2.0 * (p.x + u_shape * atan(p.y, p.z))) * 0.10;
    p.z = abs(p.z);

    color += baseColor * pow(p.z * 0.25, 1.0);
    color += specColor * (pow(p.z * 0.845, 60.0));
    return color;
}

void main() {
    springCoils = springCoilsMin + u_coils * (springCoilsMax - springCoilsMin);
    coilRadius  = coilRadiusMin + u_radius * (coilRadiusMax - coilRadiusMin);

    vec3  color = vec3(0.0);
    float alpha = 0.0;

    for (int aax = 0; aax < u_aasubpixels; ++aax) {
        for (int aay = 0; aay < u_aasubpixels; ++aay) {
            vec2 aa = vec2(float(aax), float(aay)) / float(u_aasubpixels);
            vec2 st = (2.0 * (gl_FragCoord.xy + aa) - u_resolution);
            float xpos = st.x / u_resolution.x;
            st /= u_resolution.yy;

            vec3 ro = vec3(0.0, 0.0, -5.0);
            vec3 rd = normalize(vec3(st, 10.0));

            float dist = 0.0;
            for (int i = 0; i < NITER; ++i) {
                vec3 p      = ro + dist * rd;
                float delta = 0.95 * mapScene(p, xpos);
                dist += delta;
                if (delta < 0.001) {
                    p = ro + dist * rd;
                    color += getColor(p, xpos);
                    alpha += 1.0;
                    break;
                }
                if (dist > 6.0) {
                    // Background — transparent so the JUCE framebuffer
                    // underneath shows through. The shadow/shading is
                    // drawn as semi-transparent darkening instead of an
                    // opaque background fill.
                    float shade     = 0.02 + u_radius * 0.10 + u_coils * 0.14;
                    float shadeSize = 1.70;
                    float shadeY    = st.y * shadeSize;
                    shadeY += 0.86;
                    if (shadeY < 2.0 && shadeY > -1.0) {
                        shadeY = (fract(shadeY) - 0.5) / shadeSize;
                        shadeY = abs(shadeY);
                    }
                    float shadowAlpha = shade *
                        (1.0 - min(1.0, pow(shadeY * 5.9,
                                            1.5 + 0.5 * (u_coils + u_radius))));
                    alpha += shadowAlpha * 0.4;
                    break;
                }
            }
        }
    }

    float aa2 = float(u_aasubpixels) * float(u_aasubpixels);
    color /= max(1.0, aa2);
    alpha /= aa2;

    fragColor = vec4(color, alpha);
}
`;

// ─── Renderer ──────────────────────────────────────────────────────────────

export interface AelapseSpringsState {
  /** Spring coil count param, 0..1 (aelapse springs_shape) */
  coils: number;
  /** Coil radius param, 0..1 (derived from aelapse springs_length) */
  radius: number;
  /** Spring shape param, 0..1 */
  shape: number;
  /** Time in seconds, monotonically increasing (used for animation) */
  time: number;
  /** RMS ring buffer — 256 floats packed as [frame0_L0, frame0_L1, frame0_L2, frame0_L3, frame1_L0, ...] */
  rmsStack: Float32Array;
  /** Current write position in the ring buffer, 0..63 */
  rmsPos: number;
  /** Anti-aliasing subpixel count — 1 (1x), 2 (4x), 3 (9x). Default 1. */
  aaSubpixels?: number;
  /** Optional clip bounds for the springs viewport */
  clip?: { x: number; y: number; w: number; h: number };
}

export class AelapseSpringsRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly quadVao: WebGLVertexArrayObject;
  private readonly quadBuf: WebGLBuffer;

  // Uniform locations — resolved once after link.
  private readonly uRms:         WebGLUniformLocation | null;
  private readonly uRmsPos:      WebGLUniformLocation | null;
  private readonly uCoils:       WebGLUniformLocation | null;
  private readonly uRadius:      WebGLUniformLocation | null;
  private readonly uShape:       WebGLUniformLocation | null;
  private readonly uAASubpixels: WebGLUniformLocation | null;
  private readonly uTime:        WebGLUniformLocation | null;
  private readonly uResolution:  WebGLUniformLocation | null;

  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,  // we do our own SDF-aware supersampling
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      throw new Error('AelapseSpringsRenderer: WebGL2 is not available');
    }
    this.gl = gl;

    this.program = this.buildProgram(VERTEX_SHADER_ES3, FRAGMENT_SHADER_ES3);

    // Fullscreen quad — two triangles covering clip space [-1,1]².
    const verts = new Float32Array([
      -1, -1,   1, -1,   -1,  1,
      -1,  1,   1, -1,    1,  1,
    ]);

    const vao = gl.createVertexArray();
    if (!vao) throw new Error('AelapseSpringsRenderer: createVertexArray failed');
    this.quadVao = vao;
    gl.bindVertexArray(vao);

    const buf = gl.createBuffer();
    if (!buf) throw new Error('AelapseSpringsRenderer: createBuffer failed');
    this.quadBuf = buf;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

    const aPosLoc = gl.getAttribLocation(this.program, 'a_position');
    gl.enableVertexAttribArray(aPosLoc);
    gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    this.uRms         = gl.getUniformLocation(this.program, 'u_rms[0]');
    this.uRmsPos      = gl.getUniformLocation(this.program, 'u_rmspos');
    this.uCoils       = gl.getUniformLocation(this.program, 'u_coils');
    this.uRadius      = gl.getUniformLocation(this.program, 'u_radius');
    this.uShape       = gl.getUniformLocation(this.program, 'u_shape');
    this.uAASubpixels = gl.getUniformLocation(this.program, 'u_aasubpixels');
    this.uTime        = gl.getUniformLocation(this.program, 'u_time');
    this.uResolution  = gl.getUniformLocation(this.program, 'u_resolution');
  }

  /** Render one frame with the given state. Call from a rAF loop. */
  render(state: AelapseSpringsState): void {
    if (this.disposed) return;

    const gl = this.gl;
    const canvas = gl.canvas as HTMLCanvasElement;

    // Match the drawing-buffer size to the CSS size × DPR. Only resize when
    // the underlying element changed to avoid GPU state churn.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth || canvas.width;
    const cssH = canvas.clientHeight || canvas.height;
    const targetW = Math.max(1, Math.floor(cssW * dpr));
    const targetH = Math.max(1, Math.floor(cssH * dpr));
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(this.program);

    if (this.uCoils)       gl.uniform1f(this.uCoils, state.coils);
    if (this.uRadius)      gl.uniform1f(this.uRadius, state.radius);
    if (this.uShape)       gl.uniform1f(this.uShape, state.shape);
    if (this.uTime)        gl.uniform1f(this.uTime, state.time);
    if (this.uResolution)  gl.uniform2f(this.uResolution, canvas.width, canvas.height);
    if (this.uRmsPos)      gl.uniform1i(this.uRmsPos, state.rmsPos | 0);
    if (this.uAASubpixels) gl.uniform1i(this.uAASubpixels, state.aaSubpixels ?? 1);

    // u_rms[RMS_BUFFER_SIZE * NSPRINGS] = 64 × 4 = 256 floats.
    if (this.uRms) {
      // Guard against under-sized buffers by padding with zeros.
      if (state.rmsStack.length >= 256) {
        gl.uniform1fv(this.uRms, state.rmsStack, 0, 256);
      } else {
        const padded = new Float32Array(256);
        padded.set(state.rmsStack.subarray(0, Math.min(256, state.rmsStack.length)));
        gl.uniform1fv(this.uRms, padded);
      }
    }

    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    gl.deleteVertexArray(this.quadVao);
    gl.deleteBuffer(this.quadBuf);
    gl.deleteProgram(this.program);
  }

  // ─── internals ───────────────────────────────────────────────────────────

  private buildProgram(vertSrc: string, fragSrc: string): WebGLProgram {
    const gl = this.gl;
    const vert = this.compileShader(gl.VERTEX_SHADER, vertSrc);
    const frag = this.compileShader(gl.FRAGMENT_SHADER, fragSrc);
    const prog = gl.createProgram();
    if (!prog) throw new Error('createProgram failed');
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog) ?? '(no log)';
      gl.deleteProgram(prog);
      throw new Error('Shader link failed: ' + log);
    }
    // Shaders can be detached after link; the program retains a reference.
    gl.detachShader(prog, vert);
    gl.detachShader(prog, frag);
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    return prog;
  }

  private compileShader(type: GLenum, src: string): WebGLShader {
    const gl = this.gl;
    const sh = gl.createShader(type);
    if (!sh) throw new Error('createShader failed');
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh) ?? '(no log)';
      gl.deleteShader(sh);
      throw new Error(
        `Shader compile failed (${type === gl.VERTEX_SHADER ? 'vertex' : 'fragment'}): ${log}`,
      );
    }
    return sh;
  }
}
