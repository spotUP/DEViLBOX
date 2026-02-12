/**
 * OscilloscopePopout - Full-window visualizer for pop-out mode
 * Renders the current visualization mode at full window size with click-to-cycle
 */

import React, { useState } from 'react';
import { Oscilloscope } from './Oscilloscope';
import { ChannelLevelsCompact } from './ChannelLevelsCompact';
import { CircularVU } from './CircularVU';
import { FrequencyBars } from './FrequencyBars';
import { ParticleField } from './ParticleField';
import { ChannelWaveforms } from './ChannelWaveforms';
import { ChannelActivityGrid } from './ChannelActivityGrid';
import { ChannelSpectrums } from './ChannelSpectrums';
import { ChannelCircularVU } from './ChannelCircularVU';
import { ChannelParticles } from './ChannelParticles';
import { ChannelRings } from './ChannelRings';
import { ChannelTunnel } from './ChannelTunnel';
import { ChannelRadar } from './ChannelRadar';
import { VisualizerFrame } from './VisualizerFrame';

type VizMode = 'waveform' | 'spectrum' | 'channels' | 'circular' | 'bars' | 'particles' | 'chanWaves' | 'chanActivity' | 'chanSpectrum' | 'chanCircular' | 'chanParticles' | 'chanRings' | 'chanTunnel' | 'chanRadar';

const VIZ_MODES: VizMode[] = ['waveform', 'spectrum', 'channels', 'circular', 'bars', 'particles', 'chanWaves', 'chanActivity', 'chanSpectrum', 'chanCircular', 'chanParticles', 'chanRings', 'chanTunnel', 'chanRadar'];

const MODE_LABELS: Record<VizMode, string> = {
  waveform: 'Waveform',
  spectrum: 'Spectrum',
  channels: 'Channel Levels',
  circular: 'Circular VU',
  bars: 'Frequency Bars',
  particles: 'Particle Field',
  chanWaves: 'Channel Waveforms',
  chanActivity: 'Activity Grid',
  chanSpectrum: 'Channel Spectrums',
  chanCircular: 'Channel Circular',
  chanParticles: 'Channel Particles',
  chanRings: 'Channel Rings',
  chanTunnel: 'Channel Tunnel',
  chanRadar: 'Channel Radar',
};

export const OscilloscopePopout: React.FC = () => {
  const [vizMode, setVizMode] = useState<VizMode>('waveform');
  const height = 440;

  const cycleMode = () => {
    const idx = VIZ_MODES.indexOf(vizMode);
    setVizMode(VIZ_MODES[(idx + 1) % VIZ_MODES.length]);
  };

  return (
    <div
      className="h-screen w-screen bg-dark-bg flex flex-col cursor-pointer p-4"
      onClick={cycleMode}
    >
      {/* Mode label */}
      <div className="px-3 py-1.5 text-xs text-text-muted font-mono flex items-center justify-between">
        <span>{MODE_LABELS[vizMode]}</span>
        <span className="text-text-muted/50">Click to cycle modes</span>
      </div>

      {/* Visualization in hardware frame */}
      <VisualizerFrame variant="large" className="flex-1" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {(vizMode === 'waveform' || vizMode === 'spectrum') && <Oscilloscope width="auto" height={height} mode={vizMode} />}
        {vizMode === 'channels' && <ChannelLevelsCompact height={height} />}
        {vizMode === 'circular' && <CircularVU height={height} />}
        {vizMode === 'bars' && <FrequencyBars height={height} />}
        {vizMode === 'particles' && <ParticleField height={height} />}
        {vizMode === 'chanWaves' && <ChannelWaveforms height={height} />}
        {vizMode === 'chanActivity' && <ChannelActivityGrid height={height} />}
        {vizMode === 'chanSpectrum' && <ChannelSpectrums height={height} />}
        {vizMode === 'chanCircular' && <ChannelCircularVU height={height} />}
        {vizMode === 'chanParticles' && <ChannelParticles height={height} />}
        {vizMode === 'chanRings' && <ChannelRings height={height} />}
        {vizMode === 'chanTunnel' && <ChannelTunnel height={height} />}
        {vizMode === 'chanRadar' && <ChannelRadar height={height} />}
      </VisualizerFrame>
    </div>
  );
};
