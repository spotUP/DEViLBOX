/**
 * Tips of the Day - Expert advice for DEViLBOX users
 */

export interface Tip {
  title: string;
  content: string;
  category: 'performance' | 'synthesis' | 'workflow' | 'midi' | 'tracker';
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
  },
  {
    title: "Octave Hopping",
    content: "In the pattern editor, use the 'Z' and 'X' keys to quickly shift your keyboard's octave up or down while recording.",
    category: 'tracker'
  },
  {
    title: "The 'Note Off' Sentinel",
    content: "Use the '`' (backtick) or '=' key to insert a 'Note Off' command. This is essential for controlling the release of polyphonic synths.",
    category: 'tracker'
  },
  {
    title: "Selection Secrets",
    content: "Hold Shift and use Arrow Keys to select a block of notes. You can then use Ctrl+C/Ctrl+V to copy-paste or 'I' to interpolate volumes.",
    category: 'tracker'
  },
  {
    title: "Interpolation Magic",
    content: "Select a range in the Volume or Effect column and press 'I'. DEViLBOX will smoothly interpolate values between the start and end of your selection.",
    category: 'tracker'
  },
  {
    title: "Hexadecimal Mastery",
    content: "Tracker values are in Hex (00-FF). Remember: 40 is 64, 80 is 128, and FF is 255. Most volume columns use 00-40 (0-64).",
    category: 'tracker'
  },
  {
    title: "Fast Forward",
    content: "Hold 'Alt' while navigating patterns to jump by 16 rows at a time. Perfect for navigating long 64-row patterns.",
    category: 'workflow'
  },
  {
    title: "Acid Slides",
    content: "In the TB-303, a slide is triggered when two notes overlap or when the 'Slide' flag is set in the pattern. Ensure your notes are long enough!",
    category: 'synthesis'
  },
  {
    title: "FM Texture",
    content: "In Furnace FM engines (like YM2612), increasing 'Feedback' on Operator 1 adds grit and noise. Use it sparingly for bass, heavily for snares.",
    category: 'synthesis'
  },
  {
    title: "Groove & Swing",
    content: "Use the Groove dropdown in the main toolbar to apply MPC-style swing or custom 'Drunken' timing to your patterns.",
    category: 'workflow'
  },
  {
    title: "Sample Transposition",
    content: "When using the Sampler, the 'Transpose' knob in the Envelope tab allows for clean pitch shifting without changing the sample's speed.",
    category: 'synthesis'
  },
  {
    title: "Panic Button",
    content: "If a synth gets stuck with a 'hanging note', press 'Esc' twice rapidly to kill all active voices and reset the audio engine.",
    category: 'workflow'
  },
  {
    title: "MAME Retro",
    content: "The MAMEVFX engine emulates the classic sound of 80s arcade chips. Try the 'RSA' mode for authentic early-90s digital textures.",
    category: 'performance'
  },
  {
    title: "Automation Recording",
    content: "Enable 'REC' and move a knob while the song is playing. Your movements will be recorded directly into the pattern's effect columns!",
    category: 'tracker'
  },
  {
    title: "Undo/Redo",
    content: "Ctrl+Z and Ctrl+Y (or Ctrl+Shift+Z) work across the entire tracker. Don't be afraid to experiment with the 'Humanize' tool!",
    category: 'workflow'
  },
  {
    title: "The Ghost Pattern",
    content: "Toggle 'Ghost Patterns' in the settings to see the notes of neighboring patterns while you edit. Great for checking harmony.",
    category: 'workflow'
  },
  {
    title: "Effect Memory",
    content: "Many effects like 1xx (Porta Up) or Axy (Volume Slide) remember their last value if you enter '00'. Use this to keep slides consistent.",
    category: 'tracker'
  },
  {
    title: "Step Recording",
    content: "Disable 'Follow' mode (Scroll Lock) to edit patterns while the song plays in the background. Enable it again to jump back to the playhead.",
    category: 'tracker'
  },
  {
    title: "Bitcrush Grit",
    content: "Add a 'Bitcrusher' to your Master FX chain and set it to 12-bit for that classic SP-1200 grit on your drum samples.",
    category: 'synthesis'
  },
  {
    title: "Sidechain Pumping",
    content: "Use the 'Compressor' on Channel 1 (Bass) and set the sidechain source to Channel 2 (Kick) for that modern pumping house feel.",
    category: 'synthesis'
  },
  {
    title: "Vibrato Depth",
    content: "Effect 4xy adds vibrato. 'x' is the speed, 'y' is the depth. Try 482 for a subtle, natural pitch wobble on leads.",
    category: 'tracker'
  },
  {
    title: "Pattern Lengths",
    content: "Patterns don't have to be 64 rows! Use the Pattern Settings to create 48-row patterns for 3/4 waltz or 12-row triplets.",
    category: 'workflow'
  },
  {
    title: "Export to WAV",
    content: "Use the 'Export' button in the toolbar to render your song to a high-quality 24-bit WAV file ready for your DAW.",
    category: 'workflow'
  },
  {
    title: "MIDI Clock Sync",
    content: "DEViLBOX can follow an external MIDI clock. Enable 'MIDI Sync' in Settings to slave the tracker to your external hardware.",
    category: 'midi'
  },
  {
    title: "Custom Keymaps",
    content: "Prefer FastTracker 2 or Impulse Tracker keybindings? You can switch the tracker emulation mode in Settings > Interface.",
    category: 'workflow'
  },
  {
    title: "Low Pass Gates",
    content: "The 'Synare' instrument features a specialized Low Pass Gate. Modulate the 'Strike' parameter for organic, plucky sounds.",
    category: 'synthesis'
  },
  {
    title: "Chord Memory",
    content: "Use the 'Chord' tool (Ctrl+H) to automatically expand a single note into a Major, Minor, or Sus4 chord across multiple channels.",
    category: 'tracker'
  },
  {
    title: "Acid Scream Recipe",
    content: "For maximum 303 squelch: Cutoff LOW (20-30%), Resonance HIGH (90%+), Env Mod HIGH (90%+). The filter sweeps from low → high on each note.",
    category: 'synthesis'
  },
  {
    title: "303 Envelope Secret",
    content: "Env Mod controls HOW FAR the 303 filter sweeps. Decay controls HOW LONG the sweep takes. Together they define the acid character.",
    category: 'synthesis'
  },
  {
    title: "303 Accent Power",
    content: "Accent on the 303 isn't just volume — it pushes the filter harder AND shortens the decay. Use it sparingly for maximum impact.",
    category: 'synthesis'
  },
  {
    title: "Dub Techno Bass",
    content: "For warm dub techno bass on the 303: Cutoff 40%, Reso 30%, Env Mod 50%, Decay 70%. Deep and warm, not screaming.",
    category: 'synthesis'
  }
];