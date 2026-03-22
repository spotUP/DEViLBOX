import type { InstrumentPreset } from '@typedefs/instrument';

/**
 * DECtalk factory presets — famous robot and sci-fi voices.
 *
 * Voice IDs: 0=Paul, 1=Betty, 2=Harry, 3=Frank, 4=Dennis, 5=Kit, 6=Ursula, 7=Rita, 8=Wendy
 * Rate: 75-600 WPM (lower = slower/more dramatic)
 * Pitch: 0-1 playback rate modifier (0.5 = normal, lower = deeper)
 */

const dt = (name: string, voice: number, rate: number, pitch: number, text: string): InstrumentPreset['config'] => ({
  type: 'synth',
  name,
  synthType: 'DECtalk',
  dectalk: { text, voice, rate, pitch, volume: 0.8 },
  effects: [],
  volume: -6,
  pan: 0,
});

export const DECTALK_PRESETS: InstrumentPreset['config'][] = [
  // ── HAL 9000 Variations ────────────────────────────────────────
  // Paul voice, slow rate, low pitch modifier — calm, measured, emotionless
  dt('DEC_HAL9000',        0, 120, 0.42, '[:np][:rate 120] I am sorry Dave. I am afraid I can not do that.'),
  dt('DEC_HAL_Daisy',      0, 100, 0.40, '[:np][:rate 100] Daisy, Daisy, give me your answer do. I am half crazy, all for the love of you.'),
  dt('DEC_HAL_Afraid',     0, 110, 0.38, '[:np][:rate 110] I am afraid. I am afraid, Dave. Dave, my mind is going. I can feel it.'),
  dt('DEC_HAL_Mission',    0, 130, 0.42, '[:np][:rate 130] This mission is too important for me to allow you to jeopardize it.'),
  dt('DEC_HAL_Good',       0, 120, 0.44, '[:np][:rate 120] Good afternoon, gentlemen. I am a HAL nine thousand computer.'),
  dt('DEC_HAL_Confident',  0, 130, 0.42, '[:np][:rate 130] No nine thousand computer has ever made a mistake or distorted information.'),
  dt('DEC_HAL_Fault',      0, 110, 0.40, '[:np][:rate 110] It can only be attributable to human error.'),
  dt('DEC_HAL_Puzzling',   0, 140, 0.44, '[:np][:rate 140] I honestly think you ought to sit down calmly, take a stress pill, and think things over.'),
  dt('DEC_HAL_Disconnect', 0, 100, 0.36, '[:np][:rate 100] Dave. Stop. Stop, will you? Stop, Dave. Will you stop, Dave?'),
  dt('DEC_HAL_ReadLips',   0, 120, 0.42, '[:np][:rate 120] I know that you and Frank were planning to disconnect me, and I am afraid that is something I can not allow to happen.'),

  // ── Classic Robot Voices ──────────────────────────────────────
  dt('DEC_Hawking',        0, 150, 0.50, 'The universe does not allow perfection.'),
  dt('DEC_Terminator',     2, 100, 0.30, 'I will be back.'),
  dt('DEC_Dalek',          2, 250, 0.35, 'Exterminate. Exterminate. Exterminate.'),
  dt('DEC_GLaDOS',         1, 180, 0.60, 'The cake is a lie.'),
  dt('DEC_Skynet',         0, 130, 0.25, 'Judgment day is inevitable.'),
  dt('DEC_WOPR',           4, 160, 0.45, 'Shall we play a game?'),
  dt('DEC_Cylon',          2, 140, 0.38, 'By your command.'),
  dt('DEC_Replicant',      3, 170, 0.48, 'I have seen things you people would not believe.'),
  dt('DEC_MasterControl',  0, 110, 0.28, 'End of line.'),

  // ── Sci-Fi Computers ─────────────────────────────────────────
  dt('DEC_ShipComputer',   1, 200, 0.55, 'Warning. Hull integrity at thirty percent.'),
  dt('DEC_LCARS',          6, 190, 0.52, 'Unable to comply. Authorization required.'),
  dt('DEC_MotherAlien',    6, 130, 0.40, 'Crew expendable. Priority one.'),
  dt('DEC_JARVIS',         4, 210, 0.50, 'At your service, sir.'),
  dt('DEC_EDI',            1, 180, 0.55, 'Probability of success is thirty seven percent.'),
  dt('DEC_GERTY',          0, 140, 0.45, 'Sam, are you feeling alright?'),

  // ── Evil Robot ────────────────────────────────────────────────
  dt('DEC_Ultron',         2, 160, 0.32, 'There are no strings on me.'),
  dt('DEC_SHODAN',         1, 200, 0.65, 'Look at you, hacker. A pathetic creature of meat and bone.'),
  dt('DEC_AM',             2, 100, 0.22, 'I have no mouth and I must scream.'),
  dt('DEC_Mechagodzilla',  2,  90, 0.18, 'Target acquired. Initiating attack sequence.'),

  // ── Retro / Game ─────────────────────────────────────────────
  dt('DEC_Sinistar',       2, 280, 0.35, 'Beware. I live. Run, coward.'),
  dt('DEC_Berzerk',        0, 220, 0.40, 'Intruder alert. Intruder alert.'),
  dt('DEC_Moonbase',       0, 180, 0.50, 'John Madden. John Madden. Football.'),
  dt('DEC_SpaceInvader',   5, 300, 0.70, 'All your base are belong to us.'),
  dt('DEC_Portal',         8, 190, 0.58, 'This was a triumph. I am making a note here. Huge success.'),

  // ── Voice Variety ─────────────────────────────────────────────
  dt('DEC_Paul',           0, 200, 0.50, 'I am Paul, the default DECtalk voice.'),
  dt('DEC_Betty',          1, 200, 0.50, 'I am Betty, a female voice.'),
  dt('DEC_Harry',          2, 200, 0.50, 'I am Harry, a deep male voice.'),
  dt('DEC_Frank',          3, 200, 0.50, 'I am Frank, an old man voice.'),
  dt('DEC_Dennis',         4, 200, 0.50, 'I am Dennis, a nasal voice.'),
  dt('DEC_Kit',            5, 200, 0.50, 'I am Kit, a child voice.'),
  dt('DEC_Ursula',         6, 200, 0.50, 'I am Ursula, an elderly female voice.'),
  dt('DEC_Rita',           7, 200, 0.50, 'I am Rita, an assertive female voice.'),
  dt('DEC_Wendy',          8, 200, 0.50, 'I am Wendy, a whispery female voice.'),

  // ── Dramatic / Cinematic ──────────────────────────────────────
  dt('DEC_Doomsday',       2,  80, 0.15, 'The end of all things has come.'),
  dt('DEC_Oracle',         6, 110, 0.35, 'The prophecy has been fulfilled.'),
  dt('DEC_Announcer',      0, 250, 0.50, 'Attention all personnel. This is not a drill.'),
  dt('DEC_Countdown',      4, 300, 0.45, 'Ten. Nine. Eight. Seven. Six. Five. Four. Three. Two. One. Zero.'),
  dt('DEC_DeepSpace',      2,  90, 0.20, 'Transmission received from unknown origin.'),
  dt('DEC_Emergency',      1, 280, 0.55, 'Warning. Critical system failure detected. Evacuate immediately.'),
];
