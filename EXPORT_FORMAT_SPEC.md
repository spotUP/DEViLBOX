# Tone.js Export Format Specification

## Purpose

Export songs and instruments as standalone Tone.js-compatible JSON files that can be loaded and played in BBS door games and other web applications.

---

## Part 1: Export Types

### 1.1 What Can Be Exported

| Export Type | File Extension | Use Case |
|------------|----------------|----------|
| **Full Song** | `.song.json` | Complete song with patterns, instruments, effects |
| **Instrument** | `.inst.json` | Single instrument preset |
| **Sound Effect** | `.sfx.json` | Short one-shot sound (jingle, hit, notification) |
| **Pattern** | `.pattern.json` | Single pattern (reusable loop) |
| **Instrument Pack** | `.pack.json` | Collection of instruments |

---

## Part 2: Song Export Format

### 2.1 Full Song JSON Structure

```json
{
  "format": "scribbleton-song",
  "version": "1.1.0",
  "name": "My BBS Theme",
  "author": "Username",
  "bpm": 125,
  "created": "2026-01-13T12:00:00Z",

  "instruments": [
    {
      "id": 1,
      "name": "Bass",
      "type": "MonoSynth",
      "options": {
        "oscillator": {
          "type": "sawtooth"
        },
        "envelope": {
          "attack": 0.01,
          "decay": 0.2,
          "sustain": 0.8,
          "release": 0.1
        },
        "filter": {
          "type": "lowpass",
          "frequency": 800,
          "Q": 2
        },
        "filterEnvelope": {
          "attack": 0.01,
          "decay": 0.2,
          "sustain": 0.5,
          "release": 0.1,
          "baseFrequency": 200,
          "octaves": 2
        }
      },
      "effects": [
        {
          "type": "Distortion",
          "options": {
            "distortion": 0.4,
            "wet": 0.5
          }
        }
      ],
      "volume": 0
    },
    {
      "id": 2,
      "name": "Lead",
      "type": "FMSynth",
      "options": {
        "harmonicity": 3,
        "modulationIndex": 10,
        "oscillator": {
          "type": "sine"
        },
        "envelope": {
          "attack": 0.01,
          "decay": 0.1,
          "sustain": 0.3,
          "release": 0.5
        },
        "modulation": {
          "type": "square"
        },
        "modulationEnvelope": {
          "attack": 0.5,
          "decay": 0,
          "sustain": 1,
          "release": 0.5
        }
      },
      "effects": [
        {
          "type": "FeedbackDelay",
          "options": {
            "delayTime": "8n",
            "feedback": 0.3,
            "wet": 0.4
          }
        },
        {
          "type": "Reverb",
          "options": {
            "decay": 2.5,
            "wet": 0.3
          }
        }
      ],
      "volume": -6
    },
    {
      "id": 3,
      "name": "Drums",
      "type": "Sampler",
      "options": {
        "urls": {
          "C1": "kick.wav",
          "D1": "snare.wav",
          "F#1": "hihat.wav",
          "A#1": "clap.wav"
        },
        "baseUrl": "./samples/"
      },
      "effects": [],
      "volume": -3
    }
  ],

  "patterns": [
    {
      "id": "pattern-0",
      "name": "Intro",
      "length": 64,
      "speed": 6,
      "channels": [
        {
          "notes": [
            { "row": 0, "note": "C2", "inst": 1, "vol": 64, "eff": null },
            { "row": 4, "note": "C2", "inst": 1, "vol": 48, "eff": "A0F" },
            { "row": 8, "note": "G2", "inst": 1, "vol": 64, "eff": null },
            { "row": 12, "note": null, "inst": null, "vol": null, "eff": "A0F" },
            { "row": 16, "note": "F2", "inst": 1, "vol": 64, "eff": "300" }
          ]
        },
        {
          "notes": [
            { "row": 0, "note": "C4", "inst": 2, "vol": 48, "eff": "486" },
            { "row": 2, "note": "E4", "inst": 2, "vol": 48, "eff": null },
            { "row": 4, "note": "G4", "inst": 2, "vol": 56, "eff": null }
          ]
        },
        {
          "notes": [
            { "row": 0, "note": "C1", "inst": 3, "vol": 64, "eff": null },
            { "row": 4, "note": "D1", "inst": 3, "vol": 56, "eff": null },
            { "row": 8, "note": "C1", "inst": 3, "vol": 64, "eff": null },
            { "row": 10, "note": "F#1", "inst": 3, "vol": 40, "eff": null },
            { "row": 12, "note": "D1", "inst": 3, "vol": 52, "eff": null },
            { "row": 14, "note": "F#1", "inst": 3, "vol": 36, "eff": null }
          ]
        }
      ]
    },
    {
      "id": "pattern-1",
      "name": "Verse",
      "length": 64,
      "speed": 6,
      "channels": []
    }
  ],

  "sequence": ["pattern-0", "pattern-0", "pattern-1", "pattern-0"],

  "master": {
    "volume": 0,
    "effects": [
      {
        "type": "Limiter",
        "options": {
          "threshold": -3
        }
      }
    ]
  }
}
```

### 2.2 Compact Pattern Format (Alternative)

For smaller file sizes, patterns can use string notation:

```json
{
  "patterns": [
    {
      "id": "pattern-0",
      "name": "Intro",
      "length": 16,
      "compact": true,
      "channels": [
        {
          "instrument": 1,
          "data": "C2-- ---- G2-- ---- F2-- ---- ---- ----"
        },
        {
          "instrument": 3,
          "data": "C1-- D1-- C1-F C1D1 C1-- D1-- C1-F C1D1"
        }
      ]
    }
  ]
}
```

---

## Part 3: Instrument Export Format

### 3.1 Single Instrument JSON

```json
{
  "format": "scribbleton-instrument",
  "version": "1.1.0",
  "name": "Retro Bass",
  "author": "Username",
  "category": "bass",
  "tags": ["retro", "8bit", "game", "bbs"],
  "created": "2026-01-13T12:00:00Z",

  "type": "MonoSynth",
  "options": {
    "oscillator": {
      "type": "square"
    },
    "envelope": {
      "attack": 0.005,
      "decay": 0.1,
      "sustain": 0.7,
      "release": 0.1
    },
    "filter": {
      "type": "lowpass",
      "frequency": 1200,
      "Q": 4
    }
  },
  "effects": [
    {
      "type": "Distortion",
      "options": {
        "distortion": 0.2,
        "wet": 0.5
      }
    }
  ],
  "volume": 0,

  "preview": {
    "notes": ["C3", "E3", "G3", "C4"],
    "pattern": "x-x- x-x- x-x- x---"
  }
}
```

### 3.2 Tone.js Synth Type Mapping

| Export Type | Tone.js Class | Description |
|-------------|---------------|-------------|
| `"Synth"` | `Tone.Synth` | Basic oscillator + envelope |
| `"MonoSynth"` | `Tone.MonoSynth` | Mono with filter |
| `"DuoSynth"` | `Tone.DuoSynth` | Two voices |
| `"FMSynth"` | `Tone.FMSynth` | FM synthesis |
| `"AMSynth"` | `Tone.AMSynth` | AM synthesis |
| `"PluckSynth"` | `Tone.PluckSynth` | Plucked string |
| `"MetalSynth"` | `Tone.MetalSynth` | Metallic/bell |
| `"MembraneSynth"` | `Tone.MembraneSynth` | Drum synthesis |
| `"NoiseSynth"` | `Tone.NoiseSynth` | Noise generator |
| `"Sampler"` | `Tone.Sampler` | Sample playback |

### 3.3 Effect Type Mapping

| Export Type | Tone.js Class | Key Options |
|-------------|---------------|-------------|
| `"Reverb"` | `Tone.Reverb` | `decay`, `wet` |
| `"FeedbackDelay"` | `Tone.FeedbackDelay` | `delayTime`, `feedback`, `wet` |
| `"PingPongDelay"` | `Tone.PingPongDelay` | `delayTime`, `feedback`, `wet` |
| `"Distortion"` | `Tone.Distortion` | `distortion`, `wet` |
| `"Chorus"` | `Tone.Chorus` | `frequency`, `depth`, `wet` |
| `"Phaser"` | `Tone.Phaser` | `frequency`, `depth`, `wet` |
| `"Tremolo"` | `Tone.Tremolo` | `frequency`, `depth`, `wet` |
| `"Vibrato"` | `Tone.Vibrato` | `frequency`, `depth`, `wet` |
| `"BitCrusher"` | `Tone.BitCrusher` | `bits`, `wet` |
| `"Chebyshev"` | `Tone.Chebyshev` | `order`, `wet` |
| `"AutoFilter"` | `Tone.AutoFilter` | `frequency`, `depth`, `wet` |
| `"AutoPanner"` | `Tone.AutoPanner` | `frequency`, `depth` |
| `"EQ3"` | `Tone.EQ3` | `low`, `mid`, `high` |
| `"Compressor"` | `Tone.Compressor` | `threshold`, `ratio`, `attack`, `release` |
| `"Limiter"` | `Tone.Limiter` | `threshold` |
| `"Filter"` | `Tone.Filter` | `type`, `frequency`, `Q` |

---

## Part 4: Sound Effect Export Format

### 4.1 SFX JSON Structure

For short, one-shot sounds (menu beeps, notifications, game events):

```json
{
  "format": "scribbleton-sfx",
  "version": "1.1.0",
  "name": "Level Up",
  "author": "Username",
  "category": "notification",
  "tags": ["game", "success", "bright"],
  "created": "2026-01-13T12:00:00Z",

  "duration": 0.8,
  "bpm": 200,

  "instruments": [
    {
      "id": 1,
      "name": "Arpeggio",
      "type": "Synth",
      "options": {
        "oscillator": { "type": "square" },
        "envelope": {
          "attack": 0.005,
          "decay": 0.1,
          "sustain": 0.3,
          "release": 0.1
        }
      },
      "effects": [
        {
          "type": "Reverb",
          "options": { "decay": 1.5, "wet": 0.3 }
        }
      ],
      "volume": -6
    }
  ],

  "sequence": [
    { "time": 0, "note": "C5", "instrument": 1, "duration": "16n", "velocity": 1 },
    { "time": "16n", "note": "E5", "instrument": 1, "duration": "16n", "velocity": 0.9 },
    { "time": "8n", "note": "G5", "instrument": 1, "duration": "16n", "velocity": 0.8 },
    { "time": "8n.", "note": "C6", "instrument": 1, "duration": "8n", "velocity": 1 }
  ]
}
```

### 4.2 Common SFX Categories for BBS Doors

| Category | Examples | Typical Duration |
|----------|----------|-----------------|
| `"notification"` | New message, alert | 0.3-0.8s |
| `"success"` | Level up, achievement | 0.5-1.5s |
| `"failure"` | Error, game over | 0.5-1s |
| `"menu"` | Button click, select | 0.05-0.2s |
| `"transition"` | Screen change, warp | 0.5-2s |
| `"ambient"` | Background loop, drone | 2-10s |
| `"action"` | Hit, jump, collect | 0.1-0.5s |
| `"intro"` | Game start jingle | 2-5s |

---

## Part 5: Playback Library

### 5.1 Minimal Player Script

Provide a lightweight JavaScript player for BBS doors:

```javascript
// scribbleton-player.min.js (~5KB gzipped)

class ScribbletonPlayer {
  constructor() {
    this.instruments = new Map();
    this.panners = new Map();
    this.isLoaded = false;
    this.speed = 6;
    this.ticksPerRow = 6;
  }

  async load(songJson) {
    await Tone.start();

    const song = typeof songJson === 'string' ? JSON.parse(songJson) : songJson;

    this.song = song;
    this.bpm = song.bpm || 125;
    Tone.Transport.bpm.value = this.bpm;

    // Create instruments with panning
    for (const inst of song.instruments) {
      const synth = this.createSynth(inst);
      const panner = new Tone.Panner(0).toDestination();
      const chain = this.createEffectChain(inst.effects);

      if (chain.length > 0) {
        synth.connect(chain[0]);
        chain[chain.length - 1].connect(panner);
      } else {
        synth.connect(panner);
      }

      synth.volume.value = inst.volume || 0;
      this.instruments.set(inst.id, synth);
      this.panners.set(inst.id, panner);
    }

    this.buildSequence();
    this.isLoaded = true;
    return this;
  }

  createSynth(inst) {
    const SynthClass = Tone[inst.type];
    return new SynthClass(inst.options);
  }

  createEffectChain(effects) {
    if (!effects) return [];
    const chain = effects.map(eff => new Tone[eff.type](eff.options));
    for (let i = 0; i < chain.length - 1; i++) {
      chain[i].connect(chain[i + 1]);
    }
    return chain;
  }

  buildSequence() {
    this.parts = [];
    const tickDuration = 60 / this.bpm / this.ticksPerRow;

    for (const patternId of this.song.sequence) {
      const pattern = this.song.patterns.find(p => p.id === patternId);
      if (!pattern) continue;

      this.speed = pattern.speed || 6;

      for (let chIdx = 0; chIdx < pattern.channels.length; chIdx++) {
        const channel = pattern.channels[chIdx];

        const events = channel.notes.map(n => ({
          time: n.row * tickDuration * this.speed,
          ...n
        }));

        const part = new Tone.Part((time, event) => {
          const synth = this.instruments.get(event.inst);
          const panner = this.panners.get(event.inst);
          if (!synth) return;

          // Process effect command
          if (event.eff) {
            this.processEffect(event.eff, synth, panner, time);
          }

          // Set volume (FT2: 00-40 = 0-64)
          if (event.vol !== null) {
            synth.volume.setValueAtTime(
              Tone.gainToDb(event.vol / 64),
              time
            );
          }

          // Trigger note
          if (event.note && event.note !== '===') {
            synth.triggerAttackRelease(event.note, '16n', time);
          } else if (event.note === '===') {
            synth.triggerRelease(time);
          }
        }, events);

        this.parts.push(part);
      }
    }
  }

  // FT2 effect command processor
  processEffect(eff, synth, panner, time) {
    const cmd = eff[0].toUpperCase();
    const val = parseInt(eff.slice(1), 16);
    const x = parseInt(eff[1], 16);
    const y = parseInt(eff[2], 16);

    switch (cmd) {
      case '0': // Arpeggio
        if (val !== 0) {
          // Rapid note cycling handled by scheduler
        }
        break;
      case '1': // Porta up
        synth.frequency.rampTo(synth.frequency.value * Math.pow(2, val/48), 0.05);
        break;
      case '2': // Porta down
        synth.frequency.rampTo(synth.frequency.value / Math.pow(2, val/48), 0.05);
        break;
      case '8': // Pan (00=L, 80=C, FF=R)
        if (panner) {
          panner.pan.setValueAtTime((val - 128) / 128, time);
        }
        break;
      case 'A': // Volume slide
        if (x > 0) {
          synth.volume.rampTo(synth.volume.value + x, 0.05);
        } else if (y > 0) {
          synth.volume.rampTo(synth.volume.value - y, 0.05);
        }
        break;
      case 'C': // Set volume (00-40)
        synth.volume.setValueAtTime(Tone.gainToDb(val / 64), time);
        break;
      case 'F': // Speed/BPM
        if (val < 32) {
          this.speed = val;
        } else {
          Tone.Transport.bpm.value = val;
        }
        break;
    }
  }

  play() {
    if (!this.isLoaded) return;
    this.parts.forEach(p => p.start(0));
    Tone.Transport.start();
  }

  stop() {
    Tone.Transport.stop();
    Tone.Transport.position = 0;
    this.parts.forEach(p => p.stop());
  }

  pause() { Tone.Transport.pause(); }
  resume() { Tone.Transport.start(); }

  dispose() {
    this.stop();
    this.instruments.forEach(i => i.dispose());
    this.panners.forEach(p => p.dispose());
    this.parts.forEach(p => p.dispose());
    this.instruments.clear();
    this.panners.clear();
    this.isLoaded = false;
  }
}

// SFX Player (simpler, for one-shots)
class ScribbletonSFX {
  constructor() {
    this.sounds = new Map();
  }

  async load(name, sfxJson) {
    const sfx = typeof sfxJson === 'string'
      ? JSON.parse(sfxJson)
      : sfxJson;

    const instruments = [];

    for (const inst of sfx.instruments) {
      const synth = this.createSynth(inst);
      const chain = this.createEffectChain(inst.effects);

      if (chain.length > 0) {
        synth.connect(chain[0]);
        chain[chain.length - 1].toDestination();
      } else {
        synth.toDestination();
      }

      synth.volume.value = inst.volume || 0;
      instruments.push({ id: inst.id, synth });
    }

    this.sounds.set(name, { sfx, instruments });
    return this;
  }

  play(name) {
    const sound = this.sounds.get(name);
    if (!sound) return;

    const { sfx, instruments } = sound;
    const now = Tone.now();

    for (const event of sfx.sequence) {
      const inst = instruments.find(i => i.id === event.instrument);
      if (!inst) continue;

      const time = Tone.Time(event.time).toSeconds() + now;
      inst.synth.triggerAttackRelease(
        event.note,
        event.duration,
        time,
        event.velocity || 1
      );
    }
  }

  createSynth(inst) {
    const SynthClass = Tone[inst.type];
    return new SynthClass(inst.options);
  }

  createEffectChain(effects) {
    if (!effects) return [];
    return effects.map(eff => {
      const EffectClass = Tone[eff.type];
      return new EffectClass(eff.options);
    });
  }
}

// Export for use
window.ScribbletonPlayer = ScribbletonPlayer;
window.ScribbletonSFX = ScribbletonSFX;
```

### 5.2 Usage in BBS Door

```html
<!-- In your BBS door HTML -->
<script src="https://unpkg.com/tone@14.7.39"></script>
<script src="scribbleton-player.min.js"></script>

<script>
// Background music
const player = new ScribbletonPlayer();
await player.load('./music/main-theme.song.json');
player.play();

// Sound effects
const sfx = new ScribbletonSFX();
await sfx.load('levelup', './sfx/level-up.sfx.json');
await sfx.load('click', './sfx/menu-click.sfx.json');
await sfx.load('error', './sfx/error.sfx.json');

// Trigger on events
document.getElementById('button').onclick = () => sfx.play('click');
onLevelUp = () => sfx.play('levelup');
onError = () => sfx.play('error');
</script>
```

---

## Part 6: Export UI in Tracker

### 6.1 Export Dialog

```
┌─────────────────────────────────────────────────────────────────┐
│  EXPORT                                                    [x]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  What to export:                                                │
│                                                                 │
│  ○ Full Song (.song.json)                                       │
│    Complete song with all patterns, instruments, and effects    │
│                                                                 │
│  ○ Current Pattern (.pattern.json)                              │
│    Just the currently selected pattern                          │
│                                                                 │
│  ○ Sound Effect (.sfx.json)                                     │
│    Export selection as a one-shot sound effect                  │
│                                                                 │
│  ○ Single Instrument (.inst.json)                               │
│    Export selected instrument preset                            │
│                                                                 │
│  ○ All Instruments (.pack.json)                                 │
│    Export all instruments as a preset pack                      │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Options:                                                       │
│                                                                 │
│  □ Include playback library (scribbleton-player.min.js)         │
│  □ Minify JSON (smaller file)                                   │
│  □ Include preview data                                         │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  File name: [my-bbs-theme____________]                          │
│                                                                 │
│                              [Cancel]  [Export]                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 SFX Export Mode

Special mode for creating short sound effects:

```
┌─────────────────────────────────────────────────────────────────┐
│  SOUND EFFECT MODE                                         [x]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Category: [Notification ▼]                                     │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  TIMELINE (0.8 seconds)                                 │   │
│  │                                                         │   │
│  │  0s        0.2s       0.4s       0.6s       0.8s       │   │
│  │  |----------|----------|----------|----------|         │   │
│  │  ▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░          │   │
│  │  C5 E5 G5  C6                                          │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Duration: ◀ [0.8s] ▶           [▶ Preview]                    │
│                                                                 │
│  Quick Templates:                                               │
│  [Beep] [Ding] [Whoosh] [Error] [Success] [Collect]            │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Name: [level-up___________________]                            │
│  Tags: [game, success, bright_______]                           │
│                                                                 │
│                              [Cancel]  [Export SFX]             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 7: Sample Embedding (Optional)

### 7.1 Embedded Samples

For drum kits and samplers, samples can be embedded as base64:

```json
{
  "format": "scribbleton-instrument",
  "version": "1.1.0",
  "name": "8-Bit Drums",
  "type": "Sampler",
  "options": {
    "urls": {
      "C1": "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
      "D1": "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
      "F#1": "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="
    }
  },
  "embedded": true
}
```

### 7.2 External Sample References

For larger sample libraries, reference external files:

```json
{
  "type": "Sampler",
  "options": {
    "urls": {
      "C1": "kick.wav",
      "D1": "snare.wav",
      "F#1": "hihat.wav"
    },
    "baseUrl": "https://your-cdn.com/samples/drums/"
  },
  "embedded": false
}
```

---

## Part 8: Integration Checklist

### For BBS Door Developers

1. **Include Tone.js** (from CDN or bundled)
2. **Include scribbleton-player.min.js** (from export)
3. **Load song/SFX JSON files** at startup
4. **Call play methods** on game events

### Required Tone.js Version

```html
<script src="https://unpkg.com/tone@14.7.39/build/Tone.js"></script>
```

### File Size Estimates

| Content | Typical Size |
|---------|-------------|
| Simple SFX | 1-3 KB |
| Song (no samples) | 5-20 KB |
| Instrument preset | 0.5-2 KB |
| Instrument pack (20) | 10-30 KB |
| Song with embedded samples | 50-500 KB |
| Tone.js (minified) | ~300 KB |
| Player library | ~5 KB |

---

## Summary

This export system provides:

1. **Standalone JSON files** - No external dependencies except Tone.js
2. **Multiple export types** - Songs, SFX, instruments, patterns
3. **Direct Tone.js compatibility** - Options map directly to Tone.js constructors
4. **Lightweight player** - Simple API for BBS door integration
5. **Embedded or external samples** - Flexible for different deployment needs
6. **Human-readable format** - Easy to inspect and modify if needed

The exported files can be loaded directly by Tone.js or used with the provided player library for simplified playback in BBS doors and other web applications.
