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

describe('useMixerStore — solo/mute interaction (tracker convention)', () => {
  beforeEach(() => {
    useMixerStore.setState(useMixerStore.getState().getInitialState());
  });

  it('solo is exclusive — soloing a new channel clears the previous solo', () => {
    const mix = useMixerStore.getState();
    mix.setChannelSolo(2, true);
    expect(useMixerStore.getState().channels[2].soloed).toBe(true);
    mix.setChannelSolo(5, true);
    const s = useMixerStore.getState();
    expect(s.channels[5].soloed).toBe(true);
    expect(s.channels[2].soloed, 'previous solo should be cleared').toBe(false);
    expect(s.isSoloing).toBe(true);
  });

  it('unsoloing the only soloed channel clears isSoloing', () => {
    const mix = useMixerStore.getState();
    mix.setChannelSolo(1, true);
    expect(useMixerStore.getState().isSoloing).toBe(true);
    mix.setChannelSolo(1, false);
    expect(useMixerStore.getState().isSoloing).toBe(false);
    expect(useMixerStore.getState().channels[1].soloed).toBe(false);
  });

  it('muting a channel does not clear its solo flag (independent flags)', () => {
    const mix = useMixerStore.getState();
    mix.setChannelSolo(0, true);
    mix.setChannelMute(0, true);
    const ch = useMixerStore.getState().channels[0];
    expect(ch.soloed).toBe(true);
    expect(ch.muted).toBe(true);
  });

  it('resetMuteState clears every mute, solo, and the soloing flag', () => {
    const mix = useMixerStore.getState();
    mix.setChannelMute(0, true);
    mix.setChannelMute(3, true);
    mix.setChannelSolo(7, true);
    mix.resetMuteState();
    const s = useMixerStore.getState();
    expect(s.isSoloing).toBe(false);
    for (const ch of s.channels) {
      expect(ch.muted).toBe(false);
      expect(ch.soloed).toBe(false);
    }
  });

  it('setChannelSolo to false on a non-soloed channel is a no-op', () => {
    const mix = useMixerStore.getState();
    mix.setChannelSolo(4, false);
    const s = useMixerStore.getState();
    expect(s.isSoloing).toBe(false);
    expect(s.channels[4].soloed).toBe(false);
  });
});
