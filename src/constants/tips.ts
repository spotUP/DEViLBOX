/**
 * Tips of the Day - Expert advice for DEViLBOX users
 */

export interface Tip {
  title: string;
  content: string;
  category: 'performance' | 'synthesis' | 'workflow' | 'midi';
}

export const DEVILBOX_TIPS: Tip[] = [
  {
    title: "Instant Jamming",
    content: "Open the Drumpad Editor and click 'Match Names' to instantly map your drum kit to your Akai MPK Mini pads.",
    category: 'workflow'
  },
  {
    title: "Interactive Latency",
    content: "Go to Settings > Engine and set Latency to 'Interactive' (10ms) for the snappiest response when playing live.",
    category: 'performance'
  },
  {
    title: "Dub Siren Expression",
    content: "The Akai joystick is hard-mapped for sirens! X-axis controls frequency, and Y-axis controls LFO rate.",
    category: 'midi'
  },
  {
    title: "The Tubby Filter",
    content: "The Dub Filter is a resonant lowpass filter. Set it to around 40-50% for that deep, Sound System weight.",
    category: 'synthesis'
  },
  {
    title: "Devil Fish Decays",
    content: "When Devil Fish is enabled, the 'Decay' knob controls the VEG (Amplitude). Use 'Norm Dec' and 'Acc Dec' for MEG (Filter) decay.",
    category: 'synthesis'
  },
  {
    title: "Space Echo Modes",
    content: "Modes 1-4 are Delay only, 5-11 are Delay + Reverb, and Mode 12 is Reverb only. Mode 4 is the 'Dub Standard'.",
    category: 'synthesis'
  },
  {
    title: "Quick Reset",
    content: "Double-click (or right-click) any knob to instantly reset it to its factory default value.",
    category: 'workflow'
  },
  {
    title: "Knob Banks",
    content: "Press Pads 1-4 on your Akai to switch knob banks between 303, Siren, Effects, and Mixer controls.",
    category: 'midi'
  },
  {
    title: "Monophonic Power",
    content: "Synare and 303 are monophonic by default to ensure clean slides and punchy hits. You can toggle this in the header!",
    category: 'synthesis'
  },
  {
    title: "Pattern Navigation",
    content: "Use Ctrl+Shift+P to quickly open the Pattern Management panel and organize your song structure.",
    category: 'workflow'
  },
  {
    title: "Visual Feedback",
    content: "Press Ctrl+K to toggle the MIDI Knob Bar. It shows exactly what your physical knobs are controlling in real-time.",
    category: 'midi'
  },
  {
    title: "WASM Performance",
    content: "Buzzmachines and Furnace chips run on native WASM for maximum precision. Use them for authentic retro textures.",
    category: 'performance'
  },
  {
    title: "Delay Throws",
    content: "Use the 'Wind' icon button in the Dub Siren or Synare FX tabs to momentarily 'throw' a specific hit into the echo chamber. It's the ultimate dub punctuation tool!",
    category: 'workflow'
  }
];
