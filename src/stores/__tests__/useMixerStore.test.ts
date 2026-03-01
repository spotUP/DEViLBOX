import { describe, it, expect, beforeEach } from 'vitest';
import { useMixerStore } from '../useMixerStore';

describe('useMixerStore', () => {
  beforeEach(() => {
    useMixerStore.setState(useMixerStore.getState().getInitialState());
  });

  it('initializes 16 channels at unity volume', () => {
    const { channels } = useMixerStore.getState();
    expect(channels).toHaveLength(16);
    expect(channels[0].volume).toBe(1);
    expect(channels[0].pan).toBe(0);
    expect(channels[0].muted).toBe(false);
    expect(channels[0].soloed).toBe(false);
  });

  it('setChannelVolume updates channel state', () => {
    useMixerStore.getState().setChannelVolume(0, 0.5);
    expect(useMixerStore.getState().channels[0].volume).toBe(0.5);
  });

  it('setChannelPan updates channel state', () => {
    useMixerStore.getState().setChannelPan(2, -0.5);
    expect(useMixerStore.getState().channels[2].pan).toBe(-0.5);
  });

  it('setChannelMute toggles muted', () => {
    useMixerStore.getState().setChannelMute(1, true);
    expect(useMixerStore.getState().channels[1].muted).toBe(true);
  });

  it('setChannelSolo solos one channel and mutes others', () => {
    useMixerStore.getState().setChannelSolo(3, true);
    const { channels } = useMixerStore.getState();
    expect(channels[3].soloed).toBe(true);
    expect(useMixerStore.getState().isSoloing).toBe(true);
  });

  it('setMasterVolume updates master', () => {
    useMixerStore.getState().setMasterVolume(0.8);
    expect(useMixerStore.getState().master.volume).toBe(0.8);
  });
});
