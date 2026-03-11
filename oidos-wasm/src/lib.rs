// Oidos Synth - WASM build
// Based on Oidos by Aske Simon Christensen (Blueberry/Loonies)
// Using pure Rust additive_core() for 1:1 accurate sound

use wasm_bindgen::prelude::*;
use std::f64::consts::PI;

const NOISESIZE: usize = 64;
const TOTAL_SEMITONES: f32 = 120.0;
const DECAY_TIME: f32 = 4096.0 / 44100.0;

/// Random data generator - exact match to original
fn generate_random_data() -> Vec<u32> {
    let mut data = Vec::with_capacity(NOISESIZE * NOISESIZE * NOISESIZE);
    let mut randomstate: [u32; 4] = [0x6F15AAF2, 0x4E89D208, 0x9548B49A, 0x9C4FD335];
    for _ in 0..NOISESIZE * NOISESIZE * NOISESIZE {
        let mut r = 0u32;
        for s in 0..3 {
            let mut rs = randomstate[s];
            rs = rs.rotate_right(rs).wrapping_add(randomstate[s + 1]);
            randomstate[s] = rs;
            r ^= rs;
        }
        data.push(r);
    }
    data
}

/// Quantize value for size optimization (matches original exactly)
#[allow(dead_code)]
fn quantize(value: f32, level: f32) -> f32 {
    let bit = 1u32 << ((level * 31.0).floor() as i32);
    let mask = !bit + 1;
    let add = bit >> 1;
    let mut bits = value.to_bits();
    bits = bits.wrapping_add(add) & mask;
    if bits == 0x80000000 {
        bits = 0x00000000;
    }
    f32::from_bits(bits)
}

#[wasm_bindgen]
pub struct OidosSynth {
    sample_rate: f32,
    random_data: Vec<u32>,
    voices: Vec<OidosVoice>,
    // Global parameters
    params: OidosParams,
}

struct OidosParams {
    modes: u8,
    fat: u8,
    seed: u8,
    overtones: u8,
    decaylow: f32,
    decaydiff: f32,
    harmonicity: f32,
    sharpness: f32,
    width: f32,
    f_low: f32,
    f_slopelow: f32,
    f_sweeplow: f32,
    f_high: f32,
    f_slopehigh: f32,
    f_sweephigh: f32,
    gain: f32,
    attack: f32,
    release: f32,
    base_freq: f32,
}

impl Default for OidosParams {
    fn default() -> Self {
        OidosParams {
            modes: 40,
            fat: 10,
            seed: 50,
            overtones: 27,
            decaylow: 1.0,
            decaydiff: 0.0,
            harmonicity: 1.0,
            sharpness: 4.5,
            width: 0.0043,
            f_low: 0.0,
            f_slopelow: 1.0,
            f_sweeplow: 0.0,
            f_high: 120.0,
            f_slopehigh: 1.0,
            f_sweephigh: 0.0,
            gain: 1.0,
            attack: 0.25,
            release: 0.5,
            base_freq: 440.0 * 2f32.powf(-57.0 / 12.0) / 44100.0 * 2.0 * std::f32::consts::PI,
        }
    }
}

struct OidosVoice {
    active: bool,
    tone: u8,
    #[allow(dead_code)]
    time: usize,
    envelope: f32,
    releasing: bool,
    
    n_partials: usize,
    state_re: Vec<f64>,
    state_im: Vec<f64>,
    step_re: Vec<f64>,
    step_im: Vec<f64>,
    filter_low: Vec<f64>,
    filter_high: Vec<f64>,
    f_add_low: f64,
    f_add_high: f64,
    gain: f64,
}

impl OidosVoice {
    fn new() -> Self {
        OidosVoice {
            active: false,
            tone: 0,
            time: 0,
            envelope: 0.0,
            releasing: false,
            n_partials: 0,
            state_re: Vec::new(),
            state_im: Vec::new(),
            step_re: Vec::new(),
            step_im: Vec::new(),
            filter_low: Vec::new(),
            filter_high: Vec::new(),
            f_add_low: 0.0,
            f_add_high: 0.0,
            gain: 1.0,
        }
    }

    fn init(&mut self, params: &OidosParams, tone: u8, random_data: &[u32], sample_rate: f32) {
        self.active = true;
        self.tone = tone;
        self.time = 0;
        self.envelope = 0.0;
        self.releasing = false;

        let n_partials = params.modes as usize * params.fat as usize;
        let n_partials_in_array = (n_partials + 3) & !3;

        self.n_partials = n_partials;
        self.state_re = Vec::with_capacity(n_partials_in_array);
        self.state_im = Vec::with_capacity(n_partials_in_array);
        self.step_re = Vec::with_capacity(n_partials_in_array);
        self.step_im = Vec::with_capacity(n_partials_in_array);
        self.filter_low = Vec::with_capacity(n_partials_in_array);
        self.filter_high = Vec::with_capacity(n_partials_in_array);
        
        // Clear vectors
        self.state_re.clear();
        self.state_im.clear();
        self.step_re.clear();
        self.step_im.clear();
        self.filter_low.clear();
        self.filter_high.clear();

        self.f_add_low = (-params.f_sweeplow * params.f_slopelow / sample_rate) as f64;
        self.f_add_high = (params.f_sweephigh * params.f_slopehigh / sample_rate) as f64;
        self.gain = params.gain as f64;

        let f_lowlimit = params.f_low as f64 + tone as f64;
        let f_highlimit = params.f_high as f64 + tone as f64;

        for m in 0..params.modes as usize {
            let mut random_index = m * 256 + params.seed as usize;
            let mut getrandom = || {
                let r = random_data[random_index % random_data.len()];
                random_index += 1;
                r as i32 as f64 / 0x80000000u32 as f64
            };

            let subtone = getrandom().abs();
            let reltone = subtone * params.overtones as f64;
            let decay = params.decaylow as f64 + subtone * params.decaydiff as f64;
            let ampmul = decay.powf((1.0 / DECAY_TIME / sample_rate) as f64);

            let relfreq = 2f64.powf(reltone / 12.0);
            let relfreq_ot = (relfreq + 0.5).floor();
            let relfreq_h = relfreq + (relfreq_ot - relfreq) * params.harmonicity as f64;
            let reltone = relfreq_h.ln() / 2f64.ln() * 12.0;
            let mtone = tone as f64 + reltone;
            let mamp = getrandom() * 2f64.powf(reltone * params.sharpness as f64 / 12.0);

            for _ in 0..params.fat as usize {
                let ptone = mtone + getrandom() * params.width as f64;
                let phase = params.base_freq as f64 * 2f64.powf(ptone / 12.0);
                self.step_re.push(ampmul * phase.cos());
                self.step_im.push(ampmul * phase.sin());

                let angle = getrandom() * PI;
                self.state_re.push(mamp * angle.cos());
                self.state_im.push(mamp * angle.sin());

                let f_startlow = 1.0 - (f_lowlimit - ptone) * params.f_slopelow as f64;
                let f_starthigh = 1.0 - (ptone - f_highlimit) * params.f_slopehigh as f64;
                self.filter_low.push(f_startlow);
                self.filter_high.push(f_starthigh);
            }
        }

        // Pad to multiple of 4
        for _ in n_partials..n_partials_in_array {
            self.state_re.push(0.0);
            self.state_im.push(0.0);
            self.step_re.push(0.0);
            self.step_im.push(0.0);
            self.filter_low.push(0.0);
            self.filter_high.push(0.0);
        }
    }

    /// Pure Rust additive core - functionally equivalent to vectorized asm
    /// This is the EXACT algorithm from oidos_generate.rs line 430-446
    fn additive_core(&mut self) -> f64 {
        let mut s = 0f64;
        for i in 0..self.n_partials {
            // Complex multiplication for oscillator step
            let re = self.state_re[i] * self.step_re[i] - self.state_im[i] * self.step_im[i];
            let im = self.state_re[i] * self.step_im[i] + self.state_im[i] * self.step_re[i];
            self.state_re[i] = re;
            self.state_im[i] = im;

            // Filter envelope
            let f = self.filter_low[i].min(self.filter_high[i]).min(1.0).max(0.0);
            self.filter_low[i] += self.f_add_low;
            self.filter_high[i] += self.f_add_high;

            s += re * f;
        }
        s
    }

    fn produce_sample(&mut self, attack_rate: f32, release_rate: f32) -> f32 {
        if !self.active {
            return 0.0;
        }

        // Envelope
        if self.releasing {
            self.envelope -= release_rate;
            if self.envelope <= 0.0 {
                self.active = false;
                return 0.0;
            }
        } else {
            self.envelope += attack_rate;
            if self.envelope > 1.0 {
                self.envelope = 1.0;
            }
        }

        // Generate sample using pure Rust additive core
        let s = self.additive_core();
        
        // Soft clipping / normalization (matches original produce_sample)
        let n = self.n_partials as f64;
        let output = s * (self.gain / (n + (self.gain - 1.0) * s * s)).sqrt();
        
        self.time += 1;
        
        (output * self.envelope as f64) as f32
    }
}

#[wasm_bindgen]
impl OidosSynth {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f32) -> OidosSynth {
        let mut params = OidosParams::default();
        params.base_freq = 440.0 * 2f32.powf(-57.0 / 12.0) / sample_rate * 2.0 * std::f32::consts::PI;
        
        OidosSynth {
            sample_rate,
            random_data: generate_random_data(),
            voices: (0..16).map(|_| OidosVoice::new()).collect(),
            params,
        }
    }

    /// Set parameter (0-1 normalized)
    #[wasm_bindgen]
    pub fn set_parameter(&mut self, index: u32, value: f32) {
        match index {
            0 => self.params.seed = (value * 100.0 + 0.5).floor().max(0.0).min(99.0) as u8,
            1 => self.params.modes = (value * 100.0 + 0.5).floor().max(1.0).min(100.0) as u8,
            2 => self.params.fat = (value * 100.0 + 0.5).floor().max(1.0).min(100.0) as u8,
            3 => self.params.width = value.powf(5.0) * 100.0,
            4 => self.params.overtones = (value * 100.0 + 0.5).floor().max(0.0).min(100.0) as u8,
            5 => self.params.sharpness = value * 5.0 - 4.0,
            6 => self.params.harmonicity = value * 2.0 - 1.0,
            7 => self.params.decaylow = value,
            8 => self.params.decaydiff = value - self.params.decaylow, // decayhigh - decaylow
            9 => self.params.f_low = (value * 2.0 - 1.0) * TOTAL_SEMITONES,
            10 => self.params.f_slopelow = (1.0 - value).powf(3.0),
            11 => self.params.f_sweeplow = (value - 0.5).powf(3.0) * TOTAL_SEMITONES * 100.0,
            12 => self.params.f_high = (value * 2.0 - 1.0) * TOTAL_SEMITONES,
            13 => self.params.f_slopehigh = (1.0 - value).powf(3.0),
            14 => self.params.f_sweephigh = (value - 0.5).powf(3.0) * TOTAL_SEMITONES * 100.0,
            15 => self.params.gain = 4096f32.powf(value - 0.25),
            16 => self.params.attack = value,
            17 => self.params.release = value,
            _ => {}
        }
    }

    /// Note on (MIDI note number 0-127)
    #[wasm_bindgen]
    pub fn note_on(&mut self, note: u8, _velocity: u8) {
        // Find free voice or steal oldest
        let mut voice_idx = None;
        for (i, v) in self.voices.iter().enumerate() {
            if !v.active {
                voice_idx = Some(i);
                break;
            }
        }
        let idx = voice_idx.unwrap_or(0);
        
        self.voices[idx].init(&self.params, note, &self.random_data, self.sample_rate);
    }

    /// Note off
    #[wasm_bindgen]
    pub fn note_off(&mut self, note: u8) {
        for voice in &mut self.voices {
            if voice.active && voice.tone == note && !voice.releasing {
                voice.releasing = true;
            }
        }
    }

    /// Process audio block (mono output)
    #[wasm_bindgen]
    pub fn process(&mut self, output: &mut [f32]) {
        let attack_rate = if self.params.attack == 0.0 {
            2.0
        } else {
            1.0 / (self.params.attack * self.params.attack * self.sample_rate)
        };
        
        let release_rate = if self.params.release == 0.0 {
            2.0
        } else {
            1.0 / (self.params.release * self.sample_rate)
        };

        for sample in output.iter_mut() {
            *sample = 0.0;
            for voice in &mut self.voices {
                *sample += voice.produce_sample(attack_rate, release_rate);
            }
        }
    }

    /// Get memory estimate in bytes (for UI display)
    #[wasm_bindgen]
    pub fn get_memory_estimate(&self) -> usize {
        let partials_per_voice = self.params.modes as usize * self.params.fat as usize;
        // 6 arrays of f64 per voice, 16 voices
        partials_per_voice * 6 * 8 * 16
    }
    
    /// Get active voice count
    #[wasm_bindgen]
    pub fn get_active_voices(&self) -> u32 {
        self.voices.iter().filter(|v| v.active).count() as u32
    }
}
