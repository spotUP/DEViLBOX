/**
 * ProjectMEngine — TypeScript wrapper for the projectM v4 Emscripten WASM module.
 *
 * Loads public/projectm/ProjectM.js + .wasm via script injection,
 * then wraps the C bridge functions (pm_init, pm_render_frame, pm_add_pcm, etc.)
 * into a clean async API.
 *
 * Usage:
 *   const engine = new ProjectMEngine();
 *   await engine.init(canvas, 1280, 720);
 *   engine.loadPresetData(milkdropPresetString, true);
 *   // in rAF loop:
 *   engine.pushAudio(pcmFloat32, sampleCount);
 *   engine.renderFrame();
 *   // cleanup:
 *   engine.destroy();
 */

// Minimal type for the Emscripten module returned by createProjectM()
interface ProjectMModule {
  _pm_init(width: number, height: number): number;
  _pm_render_frame(): void;
  _pm_add_pcm(ptr: number, count: number): void;
  _pm_load_preset_data(ptr: number, smooth: number): void;
  _pm_load_preset_file(ptr: number, smooth: number): void;
  _pm_set_size(width: number, height: number): void;
  _pm_set_beat_sensitivity(sensitivity: number): void;
  _pm_set_soft_cut_duration(seconds: number): void;
  _pm_set_preset_duration(seconds: number): void;
  _pm_set_preset_locked(locked: number): void;
  _pm_set_hard_cut_enabled(enabled: number): void;
  _pm_set_mesh_size(width: number, height: number): void;
  _pm_get_max_samples(): number;
  _pm_destroy(): void;
  _malloc(bytes: number): number;
  _free(ptr: number): void;
  HEAPF32: Float32Array;
  stringToUTF8(str: string, ptr: number, maxBytes: number): void;
  lengthBytesUTF8(str: string): number;
  canvas?: HTMLCanvasElement;
}

type CreateProjectM = (opts: Record<string, unknown>) => Promise<ProjectMModule>;

let factoryPromise: Promise<CreateProjectM> | null = null;

/** Load the ProjectM.js script and return the createProjectM factory. */
function loadFactory(): Promise<CreateProjectM> {
  if (factoryPromise) return factoryPromise;
  factoryPromise = new Promise((resolve, reject) => {
    const existing = (window as unknown as Record<string, unknown>).createProjectM;
    if (typeof existing === 'function') {
      resolve(existing as CreateProjectM);
      return;
    }
    const script = document.createElement('script');
    script.src = '/projectm/ProjectM.js';
    script.onload = () => {
      const fn = (window as unknown as Record<string, unknown>).createProjectM;
      if (typeof fn === 'function') {
        resolve(fn as CreateProjectM);
      } else {
        reject(new Error('createProjectM not found after script load'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load ProjectM.js'));
    document.head.appendChild(script);
  });
  return factoryPromise;
}

export class ProjectMEngine {
  private mod: ProjectMModule | null = null;
  private pcmBuf = 0; // WASM heap pointer for PCM push buffer
  private pcmBufSize = 0;
  private strBuf = 0; // reusable string buffer
  private strBufSize = 0;
  private _ready = false;
  // Queue preset loads to be applied inside renderFrame where the WebGL context is active.
  // Loading presets outside the render loop can fail silently because the SDL/Emscripten
  // WebGL context may not be current, causing shader compilation to silently fail.
  private pendingPreset: { data: string; smooth: boolean } | null = null;

  get ready(): boolean { return this._ready; }

  /**
   * Initialize projectM. Pass the canvas element that Emscripten's SDL2 will bind to.
   * The canvas must already be in the DOM.
   */
  async init(canvas: HTMLCanvasElement, width: number, height: number): Promise<void> {
    const factory = await loadFactory();
    // Emscripten SDL2 needs canvas in DOM with an id for event registration
    if (!canvas.id) canvas.id = 'projectm-canvas';
    this.mod = await factory({
      canvas,
      // Suppress non-fatal SDL event handler warnings
      printErr: (text: string) => {
        if (typeof text === 'string' && text.includes('registerOrRemoveHandler')) return;
        void text;
      },
    }) as ProjectMModule;

    const rc = this.mod._pm_init(width, height);
    if (rc !== 0) throw new Error(`pm_init failed with code ${rc}`);

    // Pre-allocate PCM push buffer (stereo interleaved, max samples)
    const maxSamples = this.mod._pm_get_max_samples();
    this.pcmBufSize = maxSamples * 2; // stereo
    this.pcmBuf = this.mod._malloc(this.pcmBufSize * 4); // float32 = 4 bytes

    // Pre-allocate string buffer (64KB)
    this.strBufSize = 65536;
    this.strBuf = this.mod._malloc(this.strBufSize);

    // Lock presets to prevent projectM's internal auto-advance from interfering
    // with our JS-side preset control. The C bridge sets preset_duration=30s by default.
    this.mod._pm_set_preset_locked(1);

    this._ready = true;
  }

  /** Render one frame to the bound canvas. Call from rAF. */
  renderFrame(): void {
    if (!this.mod) return;
    // Apply any queued preset load inside the render loop where the WebGL context is active
    if (this.pendingPreset) {
      const { data, smooth } = this.pendingPreset;
      this.pendingPreset = null;
      const bytes = this.mod.lengthBytesUTF8(data) + 1;
      let ptr = this.strBuf;
      let allocated = false;
      if (bytes > this.strBufSize) {
        ptr = this.mod._malloc(bytes);
        allocated = true;
      }
      this.mod.stringToUTF8(data, ptr, bytes);
      this.mod._pm_load_preset_data(ptr, smooth ? 1 : 0);
      if (allocated) this.mod._free(ptr);
    }
    this.mod._pm_render_frame();
  }

  /**
   * Push interleaved stereo float PCM audio data.
   * @param samples Float32Array of interleaved LRLRLR... samples
   * @param samplesPerChannel Number of samples per channel
   */
  pushAudio(samples: Float32Array, samplesPerChannel: number): void {
    if (!this.mod || !this.pcmBuf) return;
    const count = Math.min(samplesPerChannel, this.pcmBufSize / 2);
    // Copy into WASM heap
    this.mod.HEAPF32.set(samples.subarray(0, count * 2), this.pcmBuf >> 2);
    this.mod._pm_add_pcm(this.pcmBuf, count);
  }

  /** Queue a Milkdrop preset to be loaded on the next render frame.
   *  Loading is deferred to renderFrame() where the SDL/WebGL context is guaranteed active. */
  loadPresetData(data: string, smooth = true): void {
    if (!this.mod) return;
    this.pendingPreset = { data, smooth };
  }

  /** Load a preset from the Emscripten virtual filesystem. */
  loadPresetFile(path: string, smooth = true): void {
    if (!this.mod) return;
    const bytes = this.mod.lengthBytesUTF8(path) + 1;
    let ptr = this.strBuf;
    let allocated = false;
    if (bytes > this.strBufSize) {
      ptr = this.mod._malloc(bytes);
      allocated = true;
    }
    this.mod.stringToUTF8(path, ptr, bytes);
    this.mod._pm_load_preset_file(ptr, smooth ? 1 : 0);
    if (allocated) this.mod._free(ptr);
  }

  /** Resize the viewport. */
  setSize(width: number, height: number): void {
    this.mod?._pm_set_size(width, height);
  }

  /** Set beat detection sensitivity (default 1.0). */
  setBeatSensitivity(value: number): void {
    this.mod?._pm_set_beat_sensitivity(value);
  }

  /** Set crossfade duration in seconds. */
  setSoftCutDuration(seconds: number): void {
    this.mod?._pm_set_soft_cut_duration(seconds);
  }

  /** Set auto-advance interval (seconds per preset). */
  setPresetDuration(seconds: number): void {
    this.mod?._pm_set_preset_duration(seconds);
  }

  /** Lock/unlock preset auto-switching. */
  setPresetLocked(locked: boolean): void {
    this.mod?._pm_set_preset_locked(locked ? 1 : 0);
  }

  /** Enable/disable hard cuts (abrupt transitions on beat). */
  setHardCutEnabled(enabled: boolean): void {
    this.mod?._pm_set_hard_cut_enabled(enabled ? 1 : 0);
  }

  /** Set mesh resolution (default 48x36). Higher = more detail. */
  setMeshSize(width: number, height: number): void {
    this.mod?._pm_set_mesh_size(width, height);
  }

  /** Destroy the engine and free resources. */
  destroy(): void {
    if (!this.mod) return;
    this.mod._pm_destroy();
    if (this.pcmBuf) this.mod._free(this.pcmBuf);
    if (this.strBuf) this.mod._free(this.strBuf);
    this.pcmBuf = 0;
    this.strBuf = 0;
    this.mod = null;
    this._ready = false;
  }
}
