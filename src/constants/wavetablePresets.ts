/**
 * Wavetable Presets - Pre-defined wavetables for WavetableSynth
 *
 * Each wavetable consists of multiple frames that can be morphed between.
 * Frame data is stored as normalized Float32Array (-1 to 1).
 */

export interface WavetableFrame {
  real: Float32Array;
  imag: Float32Array;
}

export interface WavetablePreset {
  id: string;
  name: string;
  category: 'Basic' | 'Analog' | 'Digital' | 'Vocal' | 'FX';
  frames: WavetableFrame[];
}

const WAVETABLE_SIZE = 2048;

/**
 * Generate a basic waveform as Fourier coefficients
 */
function generateBasicWave(type: 'sine' | 'saw' | 'square' | 'triangle'): WavetableFrame {
  const real = new Float32Array(WAVETABLE_SIZE);
  const imag = new Float32Array(WAVETABLE_SIZE);

  switch (type) {
    case 'sine':
      imag[1] = 1;
      break;

    case 'saw':
      for (let i = 1; i < WAVETABLE_SIZE / 2; i++) {
        imag[i] = 2 / (i * Math.PI) * (i % 2 === 0 ? 1 : -1);
      }
      break;

    case 'square':
      for (let i = 1; i < WAVETABLE_SIZE / 2; i += 2) {
        imag[i] = 4 / (i * Math.PI);
      }
      break;

    case 'triangle':
      for (let i = 1; i < WAVETABLE_SIZE / 2; i += 2) {
        imag[i] = 8 / (Math.PI * Math.PI * i * i) * (((i - 1) / 2) % 2 === 0 ? 1 : -1);
      }
      break;
  }

  return { real, imag };
}

/**
 * Generate pulse wave with given duty cycle
 */
function generatePulse(dutyCycle: number): WavetableFrame {
  const real = new Float32Array(WAVETABLE_SIZE);
  const imag = new Float32Array(WAVETABLE_SIZE);

  for (let i = 1; i < WAVETABLE_SIZE / 2; i++) {
    imag[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * dutyCycle);
  }

  return { real, imag };
}

/**
 * Generate a formant-like vowel sound
 */
function generateFormant(f1: number, f2: number, f3: number): WavetableFrame {
  const real = new Float32Array(WAVETABLE_SIZE);
  const imag = new Float32Array(WAVETABLE_SIZE);

  // Add harmonics with formant emphasis
  const formants = [f1, f2, f3];
  const bandwidths = [100, 150, 200];

  for (let i = 1; i < WAVETABLE_SIZE / 2; i++) {
    const freq = i * 100; // Assuming 100Hz fundamental
    let amplitude = 0;

    for (let f = 0; f < formants.length; f++) {
      const distance = Math.abs(freq - formants[f]);
      amplitude += Math.exp(-(distance * distance) / (2 * bandwidths[f] * bandwidths[f]));
    }

    imag[i] = amplitude / (i * 0.5 + 1);
  }

  return { real, imag };
}

/**
 * Pre-defined wavetables
 */
export const WAVETABLE_PRESETS: WavetablePreset[] = [
  // Basic waveforms
  {
    id: 'basic-saw',
    name: 'Saw',
    category: 'Basic',
    frames: [generateBasicWave('saw')],
  },
  {
    id: 'basic-square',
    name: 'Square',
    category: 'Basic',
    frames: [generateBasicWave('square')],
  },
  {
    id: 'basic-triangle',
    name: 'Triangle',
    category: 'Basic',
    frames: [generateBasicWave('triangle')],
  },
  {
    id: 'basic-sine',
    name: 'Sine',
    category: 'Basic',
    frames: [generateBasicWave('sine')],
  },

  // Analog sweep (morphs from sine to saw to square)
  {
    id: 'analog-sweep',
    name: 'Analog Sweep',
    category: 'Analog',
    frames: [
      generateBasicWave('sine'),
      generateBasicWave('triangle'),
      generateBasicWave('saw'),
      generateBasicWave('square'),
    ],
  },

  // PWM (pulse width modulation)
  {
    id: 'pwm',
    name: 'PWM',
    category: 'Analog',
    frames: [
      generatePulse(0.1),
      generatePulse(0.25),
      generatePulse(0.5),
      generatePulse(0.75),
      generatePulse(0.9),
    ],
  },

  // Saw stack (detuned saws)
  {
    id: 'saw-stack',
    name: 'Saw Stack',
    category: 'Analog',
    frames: [
      generateBasicWave('saw'),
      (() => {
        const frame = generateBasicWave('saw');
        // Add slight phase shift for thickness
        for (let i = 1; i < WAVETABLE_SIZE / 2; i++) {
          const phase = Math.PI * 0.1 * i;
          const cos = Math.cos(phase);
          const sin = Math.sin(phase);
          const r = frame.real[i];
          const im = frame.imag[i];
          frame.real[i] = r * cos - im * sin;
          frame.imag[i] = r * sin + im * cos;
        }
        return frame;
      })(),
    ],
  },

  // Digital harmonics
  {
    id: 'digital-harmonics',
    name: 'Digital',
    category: 'Digital',
    frames: [
      (() => {
        const real = new Float32Array(WAVETABLE_SIZE);
        const imag = new Float32Array(WAVETABLE_SIZE);
        // Only odd harmonics
        for (let i = 1; i < 32; i += 2) {
          imag[i] = 1 / i;
        }
        return { real, imag };
      })(),
      (() => {
        const real = new Float32Array(WAVETABLE_SIZE);
        const imag = new Float32Array(WAVETABLE_SIZE);
        // Only even harmonics
        for (let i = 2; i < 32; i += 2) {
          imag[i] = 1 / i;
        }
        return { real, imag };
      })(),
    ],
  },

  // Vocal formants
  {
    id: 'vocal-a',
    name: 'Vocal A',
    category: 'Vocal',
    frames: [
      generateFormant(800, 1200, 2800), // "ah"
    ],
  },
  {
    id: 'vocal-morph',
    name: 'Vocal Morph',
    category: 'Vocal',
    frames: [
      generateFormant(300, 2300, 3000),  // "ee"
      generateFormant(500, 1800, 2500),  // "eh"
      generateFormant(800, 1200, 2800),  // "ah"
      generateFormant(450, 800, 2500),   // "oh"
      generateFormant(300, 600, 2300),   // "oo"
    ],
  },

  // Metallic
  {
    id: 'metallic',
    name: 'Metallic',
    category: 'FX',
    frames: [
      (() => {
        const real = new Float32Array(WAVETABLE_SIZE);
        const imag = new Float32Array(WAVETABLE_SIZE);
        // Inharmonic partials
        const partials = [1, 2.756, 5.404, 8.933, 13.344];
        partials.forEach((p, i) => {
          const idx = Math.round(p);
          if (idx < WAVETABLE_SIZE / 2) {
            imag[idx] = 1 / (i + 1);
          }
        });
        return { real, imag };
      })(),
    ],
  },
];

/**
 * Get wavetable preset by ID
 */
export function getWavetablePreset(id: string): WavetablePreset | undefined {
  return WAVETABLE_PRESETS.find((p) => p.id === id);
}

/**
 * Interpolate between two wavetable frames
 */
export function interpolateFrames(
  frame1: WavetableFrame,
  frame2: WavetableFrame,
  position: number
): WavetableFrame {
  const real = new Float32Array(WAVETABLE_SIZE);
  const imag = new Float32Array(WAVETABLE_SIZE);

  for (let i = 0; i < WAVETABLE_SIZE; i++) {
    real[i] = frame1.real[i] * (1 - position) + frame2.real[i] * position;
    imag[i] = frame1.imag[i] * (1 - position) + frame2.imag[i] * position;
  }

  return { real, imag };
}

/**
 * Get interpolated frame from wavetable at given position
 */
export function getFrameAtPosition(preset: WavetablePreset, position: number): WavetableFrame {
  if (preset.frames.length === 1) {
    return preset.frames[0];
  }

  const framePosition = position * (preset.frames.length - 1);
  const frameIndex = Math.floor(framePosition);
  const frameFraction = framePosition - frameIndex;

  if (frameIndex >= preset.frames.length - 1) {
    return preset.frames[preset.frames.length - 1];
  }

  return interpolateFrames(
    preset.frames[frameIndex],
    preset.frames[frameIndex + 1],
    frameFraction
  );
}
