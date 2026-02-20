/**
 * Sampler + Player synth registrations
 *
 * Includes period-based playback hooks for MOD/XM sample playback.
 */

import * as Tone from 'tone';
import { SynthRegistry } from '../SynthRegistry';
import type { SynthDescriptor } from '../SynthDescriptor';
import type { InstrumentConfig } from '@typedefs/instrument';
import { periodToNoteIndex, getPeriodExtended } from '../../effects/PeriodTables';

function getNormalizedVolume(synthType: string, configVolume: number | undefined): number {
  const offsets: Record<string, number> = { Sampler: 10, Player: 10, GranularSynth: -47 };
  return (configVolume ?? -12) + (offsets[synthType] ?? 0);
}

/**
 * Handle period-based playback for MOD/XM samples.
 * Extracted from ToneEngine's triggerNoteAttack Sampler/Player branches.
 */
function handlePeriodPlayback(
  player: Tone.Player | Tone.GrainPlayer,
  note: string,
  time: number,
  velocity: number,
  config: InstrumentConfig,
  period?: number,
): void {
  if (!player.buffer || !player.buffer.loaded) return;

  // Apply velocity as volume
  const velocityDb = velocity > 0 ? Tone.gainToDb(velocity) : -Infinity;
  player.volume.value = velocityDb;

  if (config.metadata?.modPlayback?.usePeriodPlayback && period) {
    const modPlayback = config.metadata.modPlayback;
    let finetunedPeriod = period;

    if (modPlayback.finetune !== 0) {
      const noteIndex = periodToNoteIndex(period, 0);
      if (noteIndex >= 0) {
        finetunedPeriod = getPeriodExtended(noteIndex, modPlayback.finetune);
      }
    }

    const frequency = modPlayback.periodMultiplier / finetunedPeriod;
    const sampleRate = config.sample?.sampleRate || 8363;
    const playbackRate = frequency / sampleRate;
    player.playbackRate = playbackRate;
  } else {
    // Keyboard playback — calculate rate from note
    const baseNote = config.sample?.baseNote || 'C4';
    const baseFreq = Tone.Frequency(baseNote).toFrequency();
    const targetFreq = Tone.Frequency(note).toFrequency();
    player.playbackRate = targetFreq / baseFreq;
  }

  player.start(time);
}

const samplerDescs: SynthDescriptor[] = [
  {
    id: 'Sampler',
    name: 'Sampler',
    category: 'tone',
    loadMode: 'eager',
    volumeOffsetDb: 10,
    controlsComponent: 'SampleControls',
    create: (config) => {
      // Check if this is a MOD/XM sample needing period-based playback
      const hasMODMetadata = config.metadata?.modPlayback?.usePeriodPlayback;
      if (hasMODMetadata) {
        // Use Player for period-based playback
        const pp = config.parameters as Record<string, string | number> | undefined;
        const sampleUrl = pp?.sampleUrl as string | undefined;
        if (sampleUrl) {
          return new Tone.Player({
            url: sampleUrl,
            volume: getNormalizedVolume('Player', config.volume),
          });
        }
        return new Tone.Player({ volume: getNormalizedVolume('Player', config.volume) });
      }

      // Regular Sampler
      // Priority 1: Multi-sample map
      if (config.sample?.multiMap && Object.keys(config.sample.multiMap).length > 0) {
        return new Tone.Sampler({
          urls: config.sample.multiMap,
          volume: getNormalizedVolume('Sampler', config.volume),
        });
      }

      // Priority 2: Single sample URL (sample.url wins over parameters.sampleUrl
      // to match SampleEditor's display priority and avoid stale data URLs)
      const params = config.parameters as Record<string, string | number> | undefined;
      const sampleUrl = config.sample?.url || params?.sampleUrl as string | undefined;
      const baseNote = config.sample?.baseNote || 'C4';

      if (sampleUrl) {
        const urls: { [note: string]: string } = {};
        urls[baseNote] = sampleUrl;
        return new Tone.Sampler({
          urls,
          volume: getNormalizedVolume('Sampler', config.volume),
        });
      }

      return new Tone.Sampler({ volume: getNormalizedVolume('Sampler', config.volume) });
    },
    onTriggerAttack: (synth, note, time, velocity, opts) => {
      // MOD/XM period-based playback (Player disguised as Sampler)
      if (opts.config.metadata?.modPlayback?.usePeriodPlayback) {
        handlePeriodPlayback(synth as Tone.Player, note, time, velocity, opts.config, opts.period);
        return true;
      }

      // Regular Sampler
      const sampler = synth as Tone.Sampler;
      if (!sampler.loaded) return true; // Skip silently
      try {
        sampler.triggerAttack(note, time, velocity);
      } catch {
        // Sampler may throw if async loading hasn't completed
      }
      return true;
    },
    onTriggerRelease: (synth, note, time, opts) => {
      if (opts.config.metadata?.modPlayback?.usePeriodPlayback) {
        // Player uses stop()
        const player = synth as Tone.Player;
        if (player.state === 'started') player.stop(time);
        return true;
      }
      const sampler = synth as Tone.Sampler;
      if (!sampler.loaded) return true;
      sampler.triggerRelease(note || 'C4', time);
      return true;
    },
  },
  {
    id: 'Player',
    name: 'Player',
    category: 'tone',
    loadMode: 'eager',
    volumeOffsetDb: 10,
    create: (config) => {
      const pp = config.parameters as Record<string, string | number> | undefined;
      const sampleUrl = pp?.sampleUrl as string | undefined;
      const reverseMode = pp?.reverseMode || 'forward';

      if (sampleUrl) {
        return new Tone.Player({
          url: sampleUrl,
          volume: getNormalizedVolume('Player', config.volume),
          reverse: reverseMode === 'reverse',
        });
      }
      return new Tone.Player({ volume: getNormalizedVolume('Player', config.volume) });
    },
    onTriggerAttack: (synth, note, time, velocity, opts) => {
      handlePeriodPlayback(synth as Tone.Player, note, time, velocity, opts.config, opts.period);
      return true;
    },
    onTriggerRelease: (synth, _note, time) => {
      const player = synth as Tone.Player;
      if (player.state === 'started') player.stop(time);
      return true;
    },
  },
  {
    id: 'GranularSynth',
    name: 'Granular Synth',
    category: 'tone',
    loadMode: 'eager',
    volumeOffsetDb: -47,
    create: (config) => {
      const sampleUrl = config.granular?.sampleUrl ||
        (config.parameters as Record<string, string> | undefined)?.sampleUrl;
      const gc = config.granular;

      if (sampleUrl) {
        return new Tone.GrainPlayer({
          url: sampleUrl,
          grainSize: (gc?.grainSize || 100) / 1000,
          overlap: (gc?.grainOverlap || 50) / 100,
          playbackRate: gc?.playbackRate || 1,
          detune: gc?.detune || 0,
          reverse: gc?.reverse || false,
          loop: true,
          loopStart: 0,
          loopEnd: 0,
          volume: getNormalizedVolume('GranularSynth', config.volume),
        });
      }
      return new Tone.GrainPlayer({
        grainSize: 0.1,
        overlap: 0.5,
        playbackRate: 1,
        loop: true,
        volume: getNormalizedVolume('GranularSynth', config.volume),
      });
    },
    onTriggerAttack: (synth, note, time, velocity, opts) => {
      handlePeriodPlayback(synth as Tone.GrainPlayer, note, time, velocity, opts.config, opts.period);
      return true;
    },
    onTriggerRelease: (synth, _note, time) => {
      const player = synth as Tone.GrainPlayer;
      if (player.state === 'started') player.stop(time);
      return true;
    },
  },
];

SynthRegistry.register(samplerDescs);
