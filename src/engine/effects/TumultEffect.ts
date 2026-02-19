// src/engine/effects/TumultEffect.ts
/**
 * TumultEffect — noise/ambience generator.
 * 1:1 port of Tumult HISE plugin (https://github.com/Mrugalla/Tumult)
 * DSP: noise.cpp + svf_*.cpp + hardSoftClipper.h (Faust/SNEX compiled sources)
 */

import * as Tone from 'tone';

function getRawNode(node: Tone.Gain): AudioNode {
  const n = node as unknown as Record<string, AudioNode | undefined>;
  return n._gainNode ?? n._nativeAudioNode ?? n._node ?? (node as unknown as AudioNode);
}

// Ordered list of all 95 sample file paths (index = sampleIndex param).
// Group order: hum(5), machine(11), static(6), vinyl(5), world(18),
//              noiseplethora/A(17), noiseplethora/B(10), noiseplethora/C(23)
const SAMPLE_PATHS: string[] = [
  // hum (0–4)
  'hum/hum1_0ktober_hyperspace_cut.wav',
  'hum/hum2_alienhum1.wav',
  'hum/hum3_joedeshon__electrical_hum_01_cut.wav',
  'hum/hum4_loose-connection-feedback-hum.wav',
  'hum/hum5_vhs-hum.wav',
  // machine (5–15)
  'machine/machine1_computer_fan_hum_cut.wav',
  'machine/machine2_dough-machine-electricity-001_cut.wav',
  'machine/machine3_fridge-hum-kitchen-2012_cut.wav',
  'machine/machine4_fridge-hum-loud-saint-john_cut.wav',
  'machine/machine5_furnace-propane-pump-hum-rattle-nearby.wav',
  'machine/machine6_lettersort.wav',
  'machine/machine7_oven-hum-2_cut.wav',
  'machine/machine8_tattoo-air-conditioning-blowing-traffic-hum-outside_cut.wav',
  'machine/machine9_thailand-hotel-hallway-heavy-ventilation-hum-distant-voices-man-spits-middle.wav',
  'machine/machine10_vending-machine-hum_cut.wav',
  'machine/machine11_washing-machine-rinse.wav',
  // static (16–21)
  'static/static1_electric-zap-electricity-2.wav',
  'static/static2_electrical-noise.wav',
  'static/static3_film_static_03_cut.wav',
  'static/static4_gramophone_stereo.wav',
  'static/static5_radio-fuzz-for-old-radio-broadcast-ff233_cut.wav',
  'static/static6_tv-static_cut.wav',
  // vinyl (22–26)
  'vinyl/vinyl1_Runoff 139 BPM.wav',
  'vinyl/vinyl2_oldvinyl_128.wav',
  'vinyl/vinyl3_Vinyl Dust2.wav',
  'vinyl/vinyl4_Vinyl Crackle Analogue 1.wav',
  'vinyl/vinyl5_vinyl-crackle-1_edit.wav',
  // world (27–44)
  'world/city1_city-ambiance-heavy-snow-wind.wav',
  'world/city2_city-ambience-at-night-3.wav',
  'world/city3_distant-city-evening-traffic-5th-floor-balcony.wav',
  'world/crowd_large_crowd_medium_distance_stereo.wav',
  'world/fire1_ambiance_campfire_loop_stereo.wav',
  'world/fire2.wav',
  'world/fire3_campfire-01.wav',
  'world/fire4_campfire.wav',
  'world/rain1_field_la-rain_park_under-stone-bridge_02.wav',
  'world/rain2_forest-cabin-summer-rain-5.wav',
  'world/rain3_rain-and-thunder-in-the-countryside.wav',
  'world/rain4_rain-in-the-midnight-city.wav',
  'world/rain5_rain-thunder-and-traffic.wav',
  'world/underground_large-underground-metro-station-heavy-ventilation-and-distant-echo-voices.wav',
  'world/waterfall1_hidden-waterfall.wav',
  'world/waterfall2_krka_waterfall2_f_4824.wav',
  'world/waterfall3_turbulent-river-waterfall.wav',
  'world/waterfall4_sound.wav',
  // noiseplethora/A (45–61)
  'noiseplethora/A/A0-RadioOhNo_1.wav',
  'noiseplethora/A/A0-RadioOhNo_2.wav',
  'noiseplethora/A/A1-Rwalk_SineFMFlange.wav',
  'noiseplethora/A/A2-xModRingSqr.wav',
  'noiseplethora/A/A3-xModRingSine_1.wav',
  'noiseplethora/A/A3-xModRingSine_2.wav',
  'noiseplethora/A/A4-CrossModRing_1.wav',
  'noiseplethora/A/A4-CrossModRing_2.wav',
  'noiseplethora/A/A5-Resonoise_long.wav',
  'noiseplethora/A/A6-GrainGlitch_1.wav',
  'noiseplethora/A/A6-GrainGlitch_2.wav',
  'noiseplethora/A/A7-GrainGlitchII_1.wav',
  'noiseplethora/A/A7-GrainGlitchII_2.wav',
  'noiseplethora/A/A8-GrainGlitchIII_1.wav',
  'noiseplethora/A/A8-GrainGlitchIII_2.wav',
  'noiseplethora/A/A9-Basurilla_1.wav',
  'noiseplethora/A/A9-Basurilla_2.wav',
  // noiseplethora/B (62–71)
  'noiseplethora/B/B0-ClusterSaw.wav',
  'noiseplethora/B/B1-PwCluster.wav',
  'noiseplethora/B/B2-CrCluster2.wav',
  'noiseplethora/B/B3-SineFMcluster.wav',
  'noiseplethora/B/B4-TriFMcluster.wav',
  'noiseplethora/B/B5-Primecluster.wav',
  'noiseplethora/B/B6-PrimecCnoise.wav',
  'noiseplethora/B/B7-FibonacciCluster.wav',
  'noiseplethora/B/B8-PartialCluster.wav',
  'noiseplethora/B/B9-PhasingCluster.wav',
  // noiseplethora/C (72–94)
  'noiseplethora/C/C0-BasuraTotal_1.wav',
  'noiseplethora/C/C0-BasuraTotal_2.wav',
  'noiseplethora/C/C1-Atari.wav',
  'noiseplethora/C/C2-WakingFilomena_1.wav',
  'noiseplethora/C/C2-WakingFilomena_2.wav',
  'noiseplethora/C/C3-P_S_H.wav',
  'noiseplethora/C/C4-ArrayOnTheRocks_1.wav',
  'noiseplethora/C/C4-ArrayOnTheRocks_2.wav',
  'noiseplethora/C/C4-ArrayOnTheRocks_3.wav',
  'noiseplethora/C/C4-ArrayOnTheRocks_4.wav',
  'noiseplethora/C/C5-ExistencelsPain_1.wav',
  'noiseplethora/C/C5-ExistencelsPain_2.wav',
  'noiseplethora/C/C6-WhoKnows_1.wav',
  'noiseplethora/C/C6-WhoKnows_2.wav',
  'noiseplethora/C/C6-WhoKnows_3.wav',
  'noiseplethora/C/C7-SatanWorkout_1.wav',
  'noiseplethora/C/C7-SatanWorkout_2.wav',
  'noiseplethora/C/C8-Rwalk_BitCrushPW_1.wav',
  'noiseplethora/C/C8-Rwalk_BitCrushPW_2.wav',
  'noiseplethora/C/C8-Rwalk_BitCrushPW_3.wav',
  'noiseplethora/C/C9-Rwalk_LFree_1.wav',
  'noiseplethora/C/C9-Rwalk_LFree_2.wav',
  'noiseplethora/C/C9-Rwalk_LFree_3.wav',
];

export interface TumultOptions {
  noiseGain?: number;  mix?: number;  noiseMode?: number;
  sourceMode?: number; switchBranch?: number;
  duckThreshold?: number; duckAttack?: number; duckRelease?: number;
  followThreshold?: number; followAttack?: number; followRelease?: number;
  followAmount?: number; clipAmount?: number;
  hpEnable?: number; hpFreq?: number; hpQ?: number;
  peak1Enable?: number; peak1Type?: number; peak1Freq?: number; peak1Gain?: number; peak1Q?: number;
  peak2Enable?: number; peak2Freq?: number; peak2Gain?: number; peak2Q?: number;
  peak3Enable?: number; peak3Type?: number; peak3Freq?: number; peak3Gain?: number; peak3Q?: number;
  lpEnable?: number; lpFreq?: number; lpQ?: number;
  sampleIndex?: number; playerStart?: number; playerEnd?: number;
  playerFade?: number; playerGain?: number;
  wet?: number;
}

export class TumultEffect extends Tone.ToneAudioNode {
  readonly name = 'Tumult';
  readonly input:  Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private _params: Required<TumultOptions>;
  private _loadedSampleIndex = -1;

  private static loadedContexts = new Set<BaseAudioContext>();
  private static initPromises   = new Map<BaseAudioContext, Promise<void>>();

  constructor(options: TumultOptions = {}) {
    super();
    this._params = {
      noiseGain: options.noiseGain ?? -10.0, mix: options.mix ?? 0.5,
      noiseMode: options.noiseMode ?? 0, sourceMode: options.sourceMode ?? 0,
      switchBranch: options.switchBranch ?? 0,
      duckThreshold: options.duckThreshold ?? -20.0,
      duckAttack: options.duckAttack ?? 0, duckRelease: options.duckRelease ?? 15.0,
      followThreshold: options.followThreshold ?? -20.0,
      followAttack: options.followAttack ?? 0, followRelease: options.followRelease ?? 15.0,
      followAmount: options.followAmount ?? 0.7,
      clipAmount: options.clipAmount ?? 0.497,
      hpEnable: options.hpEnable ?? 0, hpFreq: options.hpFreq ?? 888.5, hpQ: options.hpQ ?? 0.7,
      peak1Enable: options.peak1Enable ?? 0, peak1Type: options.peak1Type ?? 0,
      peak1Freq: options.peak1Freq ?? 20, peak1Gain: options.peak1Gain ?? -0.19, peak1Q: options.peak1Q ?? 0.7,
      peak2Enable: options.peak2Enable ?? 0,
      peak2Freq: options.peak2Freq ?? 600, peak2Gain: options.peak2Gain ?? 1, peak2Q: options.peak2Q ?? 1,
      peak3Enable: options.peak3Enable ?? 0, peak3Type: options.peak3Type ?? 1,
      peak3Freq: options.peak3Freq ?? 2500, peak3Gain: options.peak3Gain ?? 1, peak3Q: options.peak3Q ?? 1,
      lpEnable: options.lpEnable ?? 0, lpFreq: options.lpFreq ?? 8500, lpQ: options.lpQ ?? 0.7,
      sampleIndex: options.sampleIndex ?? 0,
      playerStart: options.playerStart ?? 0, playerEnd: options.playerEnd ?? 1,
      playerFade: options.playerFade ?? 0.01, playerGain: options.playerGain ?? 0,
      wet: options.wet ?? 1.0,
    };

    this.input   = new Tone.Gain(1);
    this.output  = new Tone.Gain(1);
    this.dryGain = new Tone.Gain(1 - this._params.wet);
    this.wetGain = new Tone.Gain(this._params.wet);

    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);

    void this._initWorklet();
  }

  private async _initWorklet() {
    try {
      const rawCtx = Tone.getContext().rawContext as AudioContext;
      await TumultEffect._ensureRegistered(rawCtx);

      this.workletNode = new AudioWorkletNode(rawCtx, 'tumult-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });

      const rawInput = getRawNode(this.input);
      const rawWet   = getRawNode(this.wetGain);
      rawInput.connect(this.workletNode);
      this.workletNode.connect(rawWet);

      // Push all current params
      const p = this._params;
      for (const [k, v] of Object.entries(p) as [string, number][]) {
        if (k !== 'wet') this._send(k, v);
      }

      // Send playing state — may have been set before workletNode was ready
      this._send('playing', this._playingState ? 1 : 0);

      // Load sample if sourceMode needs one
      if (p.sourceMode === 2 || p.sourceMode === 3) {
        void this._loadSample(p.sampleIndex);
      }
    } catch (err) {
      console.warn('[Tumult] Worklet init failed:', err);
      this.input.connect(this.wetGain);
    }
  }

  private static async _ensureRegistered(ctx: AudioContext): Promise<void> {
    if (this.loadedContexts.has(ctx)) return;
    const existing = this.initPromises.get(ctx);
    if (existing) return existing;
    const p = (async () => {
      const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      await ctx.audioWorklet.addModule(`${base}tumult/Tumult.worklet.js`);
      this.loadedContexts.add(ctx);
    })();
    this.initPromises.set(ctx, p);
    return p;
  }

  private _send(param: string, value: number) {
    this.workletNode?.port.postMessage({ param, value });
  }

  private async _loadSample(index: number) {
    if (index === this._loadedSampleIndex) return;
    const path = SAMPLE_PATHS[index];
    if (!path) return;
    try {
      const base  = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
      const url   = `${base}tumult/samples/${path}`;
      const resp  = await fetch(url);
      const ab    = await resp.arrayBuffer();
      const rawCtx = Tone.getContext().rawContext as AudioContext;
      const buf   = await rawCtx.decodeAudioData(ab);

      // Extract channel data
      const bufL = buf.getChannelData(0).slice();
      const bufR = (buf.numberOfChannels > 1 ? buf.getChannelData(1) : buf.getChannelData(0)).slice();

      this.workletNode?.port.postMessage(
        { type: 'sample', bufferL: bufL.buffer, bufferR: bufR.buffer, length: bufL.length, sampleRate: buf.sampleRate },
        [bufL.buffer, bufR.buffer],
      );
      this._loadedSampleIndex = index;
    } catch (err) {
      console.warn('[Tumult] Sample load failed:', err);
    }
  }

  // ─── Parameter setters ─────────────────────────────────────────────────────

  // ToneEngine's updateMasterEffectParams checks `node.wet` to update dry/wet.
  // Expose it as a plain number accessor that delegates to setParam.
  get wet(): number { return this._params.wet; }
  set wet(value: number) { this.setParam('wet', value); }

  private _playingState = false;
  setPlaying(playing: boolean) {
    this._playingState = playing;
    this._send('playing', playing ? 1 : 0);
  }

  setEditorOpen(open: boolean) {
    this._send('editorOpen', open ? 1 : 0);
  }

  setParam(param: keyof TumultOptions, value: number) {
    (this._params as Record<string, number>)[param] = value;
    if (param === 'wet') {
      this.wetGain.gain.value = value;
      this.dryGain.gain.value = 1 - value;
    } else {
      this._send(param, value);
    }
    // Trigger sample load when switching source or sample index
    if (param === 'sampleIndex' || param === 'sourceMode') {
      const p = this._params;
      if (p.sourceMode === 2 || p.sourceMode === 3) {
        void this._loadSample(p.sampleIndex);
      }
    }
  }

  dispose(): this {
    try { this.workletNode?.disconnect(); } catch { /* */ }
    this.workletNode = null;
    this.dryGain.dispose();
    this.wetGain.dispose();
    this.input.dispose();
    this.output.dispose();
    super.dispose();
    return this;
  }
}
