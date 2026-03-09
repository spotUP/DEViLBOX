---
name: mix
description: "Control the mixer — volumes, pans, mutes, solos, master effects, auto-mix"
---

# /mix — Mixer Control

Control channel volumes, panning, mutes/solos, master effects, and auto-mixing.

## Usage

```
/mix <action> [options]
```

Examples:
- `/mix status` — Show current mixer state
- `/mix solo channel 2` — Solo channel 2
- `/mix add reverb` — Add reverb to master chain
- `/mix auto balance` — Auto-balance channel volumes
- `/mix reset` — Reset all channels to defaults

## Actions

### Status
```
get_mixer_state
```
Shows all channel volumes, pans, mutes, solos.

### Channel Control
```
set_channel_volume(channel: 0, volume: 0.8)   // 0-1 (1 = unity)
set_channel_pan(channel: 0, pan: -0.5)         // -1 (left) to 1 (right)
set_channel_mute(channel: 0, muted: true)
set_channel_solo(channel: 0, soloed: true)
solo_channel(channel: 2)                        // Solo one, mute others
mute_all_channels()
unmute_all_channels()
```

### Master Output
```
set_master_volume(volume: 0)     // dB (-60 to 0)
set_master_mute(muted: false)
set_sample_bus_gain(gain: 3)     // dB offset for sample/tracker bus
set_synth_bus_gain(gain: -3)     // dB offset for synth/chip bus
```

### Master Effects
```
add_master_effect(effectType: "Reverb")
get_audio_state                                  // See effects chain with IDs
update_master_effect(effectId: "<id>", updates: {wet: 30, parameters: {decay: 2.5}})
toggle_master_effect(effectId: "<id>")
remove_master_effect(effectId: "<id>")
```

Available effects: Reverb, Delay, Distortion, Chorus, Phaser, EQ3, Compressor, AutoFilter, Tremolo, Vibrato, PingPongDelay, FeedbackDelay, Chebyshev, BitCrusher

### Auto-Mix (AI-Assisted)
```
auto_mix(mode: "balance")           // Equalize channel loudness
auto_mix(mode: "duck_bass")         // Duck non-bass channels when bass hits
auto_mix(mode: "emphasize_melody")  // Boost mid-range channels
auto_mix(mode: "reset")             // Reset all to defaults
```
Optional: `intensity: 0.5` (0-1), `channels: [0, 1, 2]` (specific channels)

### Audio-Reactive Effects
```
// Make reverb wet amount follow the bass energy
set_auto_effect(effectId: "<id>", parameter: "wet", source: "bass", min: 10, max: 60, smoothing: 0.7)

// Cancel it
cancel_auto_effect(key: "<cancelKey from response>")
```
Sources: `rms`, `peak`, `bass`, `mid`, `high`, `sub`, `beat`

## Audio Monitoring

Start continuous monitoring for live performance:
```
start_monitoring()
get_monitoring_data     // Energy profile, BPM estimate, snapshots
stop_monitoring()
```
