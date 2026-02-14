/**
 * WAM (Web Audio Module) synth registrations (lazy-loaded)
 */

import * as Tone from 'tone';
import { SynthRegistry } from '../SynthRegistry';
import type { SynthDescriptor } from '../SynthDescriptor';
import { WAMSynth } from '../../wam/WAMSynth';
import { WAM_SYNTH_URLS } from '@/constants/wamPlugins';

const wamDescs: SynthDescriptor[] = [
  {
    id: 'WAM',
    name: 'Web Audio Module',
    category: 'wam',
    loadMode: 'lazy',
    useSynthBus: true,
    create: (config) => {
      const wamConfig = config.wam || { moduleUrl: '', pluginState: null };
      const synth = new WAMSynth(wamConfig);
      synth.output.gain.value = Tone.dbToGain(config.volume ?? -12);
      return synth;
    },
  },
  {
    id: 'WAMOBXd',
    name: 'OB-Xd (WAM)',
    category: 'wam',
    loadMode: 'lazy',
    useSynthBus: true,
    create: (config) => {
      const url = WAM_SYNTH_URLS['WAMOBXd'];
      const wamConfig = { ...config.wam, moduleUrl: url || '', pluginState: config.wam?.pluginState ?? null };
      const synth = new WAMSynth(wamConfig);
      synth.output.gain.value = Tone.dbToGain(config.volume ?? -12);
      return synth;
    },
  },
  {
    id: 'WAMSynth101',
    name: 'Synth-101 (WAM)',
    category: 'wam',
    loadMode: 'lazy',
    useSynthBus: true,
    create: (config) => {
      const url = WAM_SYNTH_URLS['WAMSynth101'];
      const wamConfig = { ...config.wam, moduleUrl: url || '', pluginState: config.wam?.pluginState ?? null };
      const synth = new WAMSynth(wamConfig);
      synth.output.gain.value = Tone.dbToGain(config.volume ?? -12);
      return synth;
    },
  },
  {
    id: 'WAMTinySynth',
    name: 'TinySynth (WAM)',
    category: 'wam',
    loadMode: 'lazy',
    useSynthBus: true,
    create: (config) => {
      const url = WAM_SYNTH_URLS['WAMTinySynth'];
      const wamConfig = { ...config.wam, moduleUrl: url || '', pluginState: config.wam?.pluginState ?? null };
      const synth = new WAMSynth(wamConfig);
      synth.output.gain.value = Tone.dbToGain(config.volume ?? -12);
      return synth;
    },
  },
  {
    id: 'WAMFaustFlute',
    name: 'Faust Flute (WAM)',
    category: 'wam',
    loadMode: 'lazy',
    useSynthBus: true,
    create: (config) => {
      const url = WAM_SYNTH_URLS['WAMFaustFlute'];
      const wamConfig = { ...config.wam, moduleUrl: url || '', pluginState: config.wam?.pluginState ?? null };
      const synth = new WAMSynth(wamConfig);
      synth.output.gain.value = Tone.dbToGain(config.volume ?? -12);
      return synth;
    },
  },
];

SynthRegistry.register(wamDescs);
