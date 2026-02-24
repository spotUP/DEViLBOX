/**
 * ISFRenderer — Wrapper around interactive-shader-format for the VJ engine.
 *
 * Provides:
 *   - Load ISF shader source (fragment + optional vertex)
 *   - Audio-reactive uniforms (bass, mid, high, beat, RMS)
 *   - Automatic input control generation from ISF metadata
 *   - Canvas resize handling
 *   - Render loop integration
 */

import { Renderer as ISFRendererLib, Parser as ISFParser } from 'interactive-shader-format';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ISFInput {
  NAME: string;
  TYPE: 'float' | 'bool' | 'long' | 'color' | 'point2D' | 'image' | 'event';
  DEFAULT?: number | boolean | number[];
  MIN?: number;
  MAX?: number;
  LABEL?: string;
  LABELS?: string[];
  VALUES?: number[];
}

export interface ISFMetadata {
  DESCRIPTION?: string;
  CREDIT?: string;
  CATEGORIES?: string[];
  INPUTS?: ISFInput[];
  PASSES?: Array<{ target?: string; width?: string; height?: string; float?: boolean }>;
  ISFVSN?: string;
}

export interface ISFPreset {
  name: string;
  fragmentShader: string;
  vertexShader?: string;
  author?: string;
  category?: string;
  description?: string;
}

export interface AudioUniforms {
  audio_bass: number;
  audio_mid: number;
  audio_high: number;
  audio_level: number;
  audio_beat: number;
}

// ─── Engine ────────────────────────────────────────────────────────────────────

export class ISFEngine {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | WebGL2RenderingContext;
  private renderer: any;
  private _valid = false;
  private _error: string | null = null;
  private _inputs: ISFInput[] = [];
  private _inputNames = new Set<string>();
  private _metadata: ISFMetadata | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false })
             || canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL not available');
    this.gl = gl;
    this.renderer = new ISFRendererLib(gl);
  }

  get valid() { return this._valid; }
  get error() { return this._error; }
  get inputs() { return this._inputs; }
  get metadata() { return this._metadata; }

  /** Load an ISF shader from source */
  loadSource(fragmentISF: string, vertexISF?: string): boolean {
    try {
      // Parse metadata first
      const parser = new ISFParser();
      parser.parse(fragmentISF, vertexISF);
      this._metadata = parser.metadata || null;
      this._inputs = (parser.inputs || []) as ISFInput[];
      this._inputNames = new Set(this._inputs.map(i => i.NAME));

      // Load into renderer
      this.renderer.loadSource(fragmentISF, vertexISF);
      this._valid = this.renderer.valid;
      this._error = this.renderer.error ? String(this.renderer.error) : null;
      return this._valid;
    } catch (err) {
      this._valid = false;
      this._error = String(err);
      return false;
    }
  }

  /** Load an ISF preset */
  loadPreset(preset: ISFPreset): boolean {
    return this.loadSource(preset.fragmentShader, preset.vertexShader);
  }

  /** Set a named input value */
  setValue(name: string, value: number | boolean | number[]) {
    if (!this._valid || !this._inputNames.has(name)) return;
    try {
      this.renderer.setValue(name, value);
    } catch {
      // Ignore invalid uniform names
    }
  }

  /** Push audio-reactive uniforms */
  setAudioUniforms(audio: AudioUniforms) {
    this.setValue('audio_bass', audio.audio_bass);
    this.setValue('audio_mid', audio.audio_mid);
    this.setValue('audio_high', audio.audio_high);
    this.setValue('audio_level', audio.audio_level);
    this.setValue('audio_beat', audio.audio_beat);
  }

  /** Render one frame */
  draw() {
    if (!this._valid) return;
    try {
      this.renderer.draw(this.canvas);
    } catch {
      // Swallow render errors (shader compilation issues, etc.)
    }
  }

  /** Handle canvas resize */
  resize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  /** Cleanup WebGL resources */
  dispose() {
    try {
      this.renderer.cleanup();
    } catch {
      // ignore
    }
  }
}
