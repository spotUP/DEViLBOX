import * as Tone from 'tone';

export class ChannelManager {
  private channelOutputs: Map<number, {
    input: Tone.Gain;
    channel: Tone.Channel;
    meter: Tone.Meter;
  }> = new Map();

  private channelMuteStates: Map<number, boolean> = new Map();
  private channelTriggerLevels: Map<number, number> = new Map();

  private masterInput: Tone.Gain;

  constructor(masterInput: Tone.Gain) {
    this.masterInput = masterInput;
  }

  public getChannelOutput(channelIndex: number): Tone.Gain {
    if (!this.channelOutputs.has(channelIndex)) {
      const input = new Tone.Gain(1);
      const channel = new Tone.Channel({ volume: 0, pan: 0 });
      const meter = new Tone.Meter({ smoothing: 0.8 });

      input.connect(channel);
      channel.connect(meter);
      channel.connect(this.masterInput);

      this.channelOutputs.set(channelIndex, { input, channel, meter });
    }
    return this.channelOutputs.get(channelIndex)!.input;
  }

  public setChannelVolume(channelIndex: number, volumeDb: number): void {
    const output = this.channelOutputs.get(channelIndex);
    if (output) output.channel.volume.value = volumeDb;
  }

  public setChannelPan(channelIndex: number, pan: number): void {
    const output = this.channelOutputs.get(channelIndex);
    if (output) output.channel.pan.value = pan / 100;
  }

  public setChannelMute(channelIndex: number, muted: boolean): void {
    if (!this.channelOutputs.has(channelIndex)) this.getChannelOutput(channelIndex);
    this.channelOutputs.get(channelIndex)!.channel.mute = muted;
  }

  public updateMuteStates(channels: { muted: boolean; solo: boolean }[]): void {
    const anySolo = channels.some(ch => ch.solo);
    channels.forEach((channel, idx) => {
      const shouldMute = anySolo ? !channel.solo : channel.muted;
      this.channelMuteStates.set(idx, shouldMute);
      this.setChannelMute(idx, shouldMute);
    });
  }

  public isChannelMuted(channelIndex: number): boolean {
    return this.channelMuteStates.get(channelIndex) ?? false;
  }

  public getChannelLevels(numChannels: number): number[] {
    const levels: number[] = [];
    for (let i = 0; i < numChannels; i++) {
      const output = this.channelOutputs.get(i);
      if (output) {
        const db = output.meter.getValue() as number;
        levels.push(Math.max(0, Math.min(1, (db + 60) / 60)));
      } else {
        levels.push(0);
      }
    }
    return levels;
  }

  public triggerChannelMeter(channelIndex: number, velocity: number): void {
    this.channelTriggerLevels.set(channelIndex, Math.min(1, velocity * 1.2));
  }

  public getChannelTriggerLevels(numChannels: number): number[] {
    const levels: number[] = [];
    for (let i = 0; i < numChannels; i++) {
      const current = this.channelTriggerLevels.get(i) || 0;
      levels.push(current);
      if (current > 0) {
        this.channelTriggerLevels.set(i, current * 0.85);
        if (current < 0.01) this.channelTriggerLevels.set(i, 0);
      }
    }
    return levels;
  }

  public disposeAll(): void {
    this.channelOutputs.forEach(out => {
      out.meter.dispose();
      out.channel.dispose();
      out.input.dispose();
    });
    this.channelOutputs.clear();
  }
}
