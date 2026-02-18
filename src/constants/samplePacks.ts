/**
 * Sample Pack Registry - Available sample packs for DEViLBOX
 */

import type { SamplePack, SampleInfo, SampleCategory } from '@typedefs/samplePack';
import { normalizeUrl } from '@utils/urlUtils';

/**
 * Helper to create SampleInfo from filename
 */
function createSampleInfo(filename: string, category: SampleCategory, basePath: string): SampleInfo {
  // Clean up filename for display name
  const nameWithoutExt = filename.replace(/\.wav$/i, '');
  // Remove prefix patterns like "BD_", "SD_", etc.
  const cleanName = nameWithoutExt
    .replace(/^(BD|SD|CH|OH|CYM|BB|FX|TOM|CLAP|CLAVE|CONGA|COW|BELL|BONGO|RIM|SHAKE|SNAP|TABLA|TAMB|LAZ)_?/i, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    filename,
    name: cleanName || nameWithoutExt,
    category,
    url: normalizeUrl(`${basePath}/${category}/${encodeURIComponent(filename)}`),
  };
}

// ============================================================================
// DRUMNIBUS ELECTRO DRUMS SAMPLE PACK
// By Legowelt - 229 samples of electro drum machine sounds
// ============================================================================

const DRUMNIBUS_BASE_PATH = 'data/samples/packs/drumnibus';

const DRUMNIBUS_KICKS: string[] = [
  'BB_Electro1short.wav',
  'BD_Drumaxia.wav',
  'BD_Pufsub.wav',
  'BD_808A1200.wav',
  'BD_DiggerLong.wav',
  'BD_Digidap.wav',
  'BD_Digimozzy.wav',
  'BD_Dikkie.wav',
  'BD_Dome_Long.wav',
  'BD_EchoRam1.wav',
  'BD_EchoRam2.wav',
  'BD_Electro1shorter.wav',
  'BD_Juxtapos.wav',
  'BD_Lite2021.wav',
  'BD_LofiHuman.wav',
  'BD_Losamplix.wav',
  'BD_Magnotron..wav',
  'BD_Matrixtape1.wav',
  'BD_Matrixtape2.wav',
  'BD_Plastiklog.wav',
  'BD_Punchtron.wav',
  'BD_Punchysplur.wav',
  'BD_Pziforze.wav',
  'BD_Ritmo.wav',
  'BD_Romkick1.wav',
  'BD_Rubydub.wav',
  'BD_Ruflex.wav',
  'BD_Simpletron.wav',
  'BD_Springworth.wav',
  'BD_Spriverbion.wav',
  'BD_Stuf.wav',
  'BD_SubThud.wav',
  'BD_Zistort.wav',
];

const DRUMNIBUS_SNARES: string[] = [
  'SD_808A1200.wav',
  'SD_Analog_Noise_2.wav',
  'SD_Analog_Noise_4.wav',
  'SD_Analog_Noise_5.wav',
  'SD_Analog_Noise1.wav',
  'SD_CompuCrunchy.wav',
  'SD_Digidap.wav',
  'SD_Draconis1.wav',
  'SD_Draconis2.wav',
  'SD_Drumaxia.wav',
  'SD_Echoram1.wav',
  'SD_Echoram2.wav',
  'SD_Echoram3.wav',
  'SD_electro7000.wav',
  'SD_Hark.wav',
  'SD_Juxtapos.wav',
  'SD_Kitcatlitter.wav',
  'SD_LoDigital_1.wav',
  'SD_LoDigital_2.wav',
  'SD_LofiHuman.wav',
  'SD_Magnotron.wav',
  'SD_Mamba.wav',
  'SD_Mambalazesnare.wav',
  'SD_Mambalazesnare2.wav',
  'SD_NomiSnare.wav',
  'SD_NomiSnareLazer.wav',
  'SD_NomiSnareWhip.wav',
  'SD_Punchtron..wav',
  'SD_Reverz1.wav',
  'SD_Reverz2.wav',
  'SD_Reverz3.wav',
  'SD_Ritmo.wav',
  'SD_Rubydubwav.wav',
  'SD_Ruflex.wav',
  'SD_Strakker.wav',
  'SD_Turbosound.wav',
  'SD_Wolf_3.wav',
  'SD_Wolf_5.wav',
  'SD_Wolf_6.wav',
  'SD_Wolf_7.wav',
  'SD_Wolf_8.wav',
  'SD_Wolf_9.wav',
  'SD_Wolf1.wav',
  'SD_Wolf2.wav',
  'SD_Wolfsweep1.wav',
];

const DRUMNIBUS_HIHATS: string[] = [
  'CH_Digidap.wav',
  'CH_DistortedRitmo.wav',
  'CH_DraconisD921.wav',
  'CH_DraconisD922.wav',
  'CH_Fantio_Closed_Hat.wav',
  'CH_Filtix_Closed_Hat.wav',
  'CH_Juxtapos.wav',
  'CH_LofiHuman.wav',
  'CH_Magnotron.wav',
  'CH_Punchtron.wav',
  'CH_Rezmatix_Closed_Hat.wav',
  'CH_Rubydub.wav',
  'CH_Ruflex.wav',
  'CH_Sizzel_Closed_Hat.wav',
  'CYM_Juxtapos.wav',
  'CYM_Magnotron.wav',
  'CYM_Punchtron.wav',
  'CYM_Ruflex.wav',
  'CYM_Synthique.wav',
  'OH_AnalogHihat1.wav',
  'OH_AnalogOpenhatwav.wav',
  'OH_AnalogVeryLongHat.wav',
  'OH_Digidap.wav',
  'OH_DistortedRitmo.wav',
  'OH_DraconisD921.wav',
  'OH_DraconisD922.wav',
  'OH_Drumaxia.wav',
  'OH_Fantio_Open_Hat.wav',
  'OH_Filtix_Open_Hat.wav',
  'OH_Juxtapos.wav',
  'OH_LofiHuman.wav',
  'OH_Magnotron.wav',
  'OH_Punchtron.wav',
  'OH_Rezmatix_Open_Hat_Long.wav',
  'OH_Rezmatix_Open_Hat.wav',
  'OH_Rubydub.wav',
  'OH_Ruflex.wav',
  'OH_Sizzel_Open_Hat.wav',
];

const DRUMNIBUS_PERCUSSION: string[] = [
  'BELL_Darkgong.wav',
  'BELL_Filterbell.wav',
  'BELL_Hypnoschaal.wav',
  'BELL_Hypnoschaal2.wav',
  'BELL_Hypnoschaal3.wav',
  'BONGO_Ryhtmbox.wav',
  'BONGO_Ryhtmbox2.wav',
  'BONGO_Simple.wav',
  'CLAP_Juxtapos.wav',
  'CLAP_LofiHuman.wav',
  'CLAP_Magnotron.wav',
  'CLAP_Punchtron.wav',
  'CLAP_Rubydub.wav',
  'CLAP_Ruflex.wav',
  'CLAVE_Punchtron.wav',
  'CLAVE_Simple.wav',
  'CLAVE_Singalique.wav',
  'CLAVE_Syntheticblox.wav',
  'CONGA_Lowpark.wav',
  'CONGA_Syntique.wav',
  'COW_Syntique.wav',
  'LAZ_Drumaxia.wav',
  'LAZ_Blip1.wav',
  'LAZ_Blip2.wav',
  'LAZ_Blip3.wav',
  'LAZ_Chewy1.wav',
  'LAZ_Digidap.wav',
  'LAZ_Lectrophy.wav',
  'LAZ_Lectrophy2.wav',
  'LAZ_lowvix1.wav',
  'LAZ_lowvix2.wav',
  'LAZ_lowvix3.wav',
  'LAZ_Mambalazesnare.wav',
  'LAZ_R900.wav',
  'LAZ_Softrond.wav',
  'LAZ_Softrond2.wav',
  'LAZ_Softrond3.wav',
  'RIM_Losimple.wav',
  'RIM_Magnotron.wav',
  'RIM_Rubydub.wav',
  'SHAKE_AnalogShaker1.wav',
  'SHAKE_AnalogShaker2.wav',
  'SHAKE_AnalogShaker3.wav',
  'SHAKE_Ritmo.wav',
  'SNAP_Juxtapos.wav',
  'TABLA_Mamba.wav',
  'TAMB_Tamb&Shaker.wav',
  'TAMB_TapeShake1.wav',
  'TAMB_TapeShake2.wav',
  'TAMB_TapeShake3.wav',
  'TOM_digger.wav',
  'TOM_DistortedRitmo.wav',
  'TOM_DistortedRitmoHi.wav',
  'TOM_DraconisDS92.wav',
  'TOM_DraconisDS92high.wav',
  'TOM_Druimaxia.wav',
  'TOM_Juxtapos.wav',
  'TOM_LofiHuman.wav',
  'TOM_Magnotron.wav',
  'TOM_Osciaz.wav',
  'TOM_Punchtron.wav',
  'TOM_Rubydub.wav',
  'TOM_Ruflex.wav',
  'TOM_Stofelectro1.wav',
  'TOM_TamborineTom.wav',
  'TOM_TamborineTom2.wav',
  'TOM_TamborineTom3.wav',
  'TOM_Warped.wav',
];

const DRUMNIBUS_FX: string[] = [
  'FX_AnalogFX1.wav',
  'FX_AnalogFX2.wav',
  'FX_Blarper.wav',
  'FX_Briesherfst.wav',
  'FX_Briesherfst2.wav',
  'FX_Briesherfst3.wav',
  'FX_Burst1.wav',
  'FX_Burst2.wav',
  'FX_Chainmalz.wav',
  'FX_Digidap2.wav',
  'FX_Digidap3.wav',
  'FX_Drumaxia.wav',
  'FX_Drumaxia2.wav',
  'FX_ElectroIsland.wav',
  'FX_ElectroIsland2.wav',
  'FX_Emerx1.wav',
  'FX_Emerx2.wav',
  'FX_Emerx3.wav',
  'FX_LofiHuman.wav',
  'FX_LofiHuman2.wav',
  'FX_Magstorm1.wav',
  'FX_Magstorm2.wav',
  'FX_NomiElastiek.wav',
  'FX_NomiLaser1.wav',
  'FX_NomiLectric.wav',
  'FX_NomiLectric2.wav',
  'FX_NomiSnip.wav',
  'FX_NomiSpring.wav',
  'FX_Poni1.wav',
  'FX_Poni2.wav',
  'FX_Poni3.wav',
  'FX_Quarkulator.wav',
  'FX_Quarkulator2.wav',
  'FX_Sloiz.wav',
  'FX_Snakamon1.wav',
  'FX_Snakamon2.wav',
  'FX_Snakamon3.wav',
  'FX_Snakamon3B.wav',
  'FX_Snakamon5.wav',
  'FX_Sonar.wav',
  'FX_Sonar2.wav',
  'FX_Sydrum1.wav',
  'FX_Sydrum2.wav',
  'FX_Sydrum3.wav',
  'FX_Timpio.wav',
];

export const DRUMNIBUS_PACK: SamplePack = {
  id: 'drumnibus',
  name: 'Drumnibus Electro Drums',
  author: 'Legowelt',
  description: 'A collection of 229 electro drum machine samples. Classic analog-style kicks, snares, hi-hats, percussion and FX sounds perfect for electro, techno, and electronic music production.',
  coverImage: normalizeUrl('data/samples/packs/drumnibus/cover.png'),
  basePath: DRUMNIBUS_BASE_PATH,
  categories: ['kicks', 'snares', 'hihats', 'percussion', 'fx'],
  samples: {
    kicks: DRUMNIBUS_KICKS.map(f => createSampleInfo(f, 'kicks', DRUMNIBUS_BASE_PATH)),
    snares: DRUMNIBUS_SNARES.map(f => createSampleInfo(f, 'snares', DRUMNIBUS_BASE_PATH)),
    hihats: DRUMNIBUS_HIHATS.map(f => createSampleInfo(f, 'hihats', DRUMNIBUS_BASE_PATH)),
    claps: [], // Claps are in percussion
    percussion: DRUMNIBUS_PERCUSSION.map(f => createSampleInfo(f, 'percussion', DRUMNIBUS_BASE_PATH)),
    fx: DRUMNIBUS_FX.map(f => createSampleInfo(f, 'fx', DRUMNIBUS_BASE_PATH)),
    bass: [],
    leads: [],
    pads: [],
    loops: [],
    vocals: [],
    other: [],
  },
  sampleCount: 229,
};

// ============================================================================
// CASIO MT40 SAMPLE PACK
// ============================================================================

const CASIO_MT40_BASE_PATH = 'data/samples/packs/casio-mt40';

const CASIO_MT40_LEADS: string[] = [
  'accordion.wav',
  'banjo.wav',
  'bass.wav',
  'brass.wav',
  'celesta.wav',
  'cello.wav',
  'clarinet.wav',
  'elec piano.wav',
  'flute.wav',
  'folk flute.wav',
  'funny fuzz.wav',
  'glocken.wav',
  'guitar.wav',
  'harpsichord.wav',
  'organ.wav',
  'oriental.wav',
  'pipe-organ.wav',
  'recorder.wav',
  'st ensemble.wav',
  'synth fuzz.wav',
  'trumpet.wav',
  'violin.wav',
  'xylophone.wav',
];

export const CASIO_MT40_PACK: SamplePack = {
  id: 'casio-mt40',
  name: 'Casio MT-40',
  author: 'Casio',
  description: 'Classic 8-bit instrument sounds from the legendary Casio MT-40 keyboard. Home of the Sleng Teng riddim.',
  coverImage: normalizeUrl('data/samples/packs/casio-mt40/cover.jpg'),
  basePath: CASIO_MT40_BASE_PATH,
  categories: ['leads'],
  samples: {
    kicks: [],
    snares: [],
    hihats: [],
    claps: [],
    percussion: [],
    fx: [],
    bass: [],
    leads: CASIO_MT40_LEADS.map(f => createSampleInfo(f, 'leads', CASIO_MT40_BASE_PATH)),
    pads: [],
    loops: [],
    vocals: [],
    other: [],
  },
  sampleCount: 23,
};

// ============================================================================
// ST-01 SAMPLE PACK (Ami-Sampler)
// Classic Amiga tracker sounds - 126 samples
// ============================================================================

const ST01_BASE_PATH = 'data/samples/packs/st-01';

const ST01_KICKS = ['BassDrum1.wav', 'BassDrum2.wav', 'BassDrum3.wav', 'BassDrum4.wav'];
const ST01_SNARES = ['Snare1.wav', 'Snare2.wav', 'Snare3.wav', 'Snare4.wav', 'Snare5.wav', 'PopSnare1.wav', 'PopSnare2.wav', 'PopSnare3.wav', 'Smash1.wav', 'Smash2.wav'];
const ST01_CLAPS = ['Claps1.wav', 'Claps2.wav'];
const ST01_HIHATS = ['HiHat1.wav', 'HiHat2.wav', 'CloseHiHat.wav'];
const ST01_PERCUSSION = ['Claves.wav', 'Conga.wav', 'CowBell.wav', 'DxTom.wav', 'ElecTom.wav', 'Perco.wav', 'Shaker.wav', 'SynClaves.wav', 'WoodBlock.wav'];

const ST01_BASS = [
  'DeepBass.wav', 'DXBass.wav', 'FilterBass.wav', 'FunBass.wav', 'FunkBass.wav', 'KorgBass.wav',
  'MonoBass.wav', 'MonsterBass.wav', 'PopBass.wav', 'RubberBass.wav', 'SlapBass.wav', 'SoftBass.wav',
  'SyntheBass.wav', 'TechBass.wav', 'TuneBass.wav', 'WowBass.wav'
];

const ST01_STRINGS = [
  'AnalogString.wav', 'KorgString.wav', 'RichString.wav', 'Strings1.wav', 'Strings2.wav',
  'Strings3.wav', 'Strings4.wav', 'Strings5.wav', 'strings6.wav', 'Strings7.wav', 'Strings8.wav',
  'WabberString.wav'
];

const ST01_LEADS = [
  'Alien.wav', 'Aligator.wav', 'Asia.wav', 'BigBow.wav', 'Blast.wav', 'Blubzing.wav', 'Breath.wav',
  'Call.wav', 'Celeste.wav', 'Chink.wav', 'Cinema.wav', 'Dangerous.wav', 'Detune.wav', 'DigDug.wav',
  'DigiHarp.wav', 'DreamBells.wav', 'EPiano.wav', 'ExBells.wav', 'FaeryTale.wav', 'Gato.wav', 'Great.wav',
  'HallBrass.wav', 'Heaven.wav', 'HeavySynth.wav', 'Heifer.wav', 'Hooman.wav', 'Horns.wav', 'JahrMarkt1.wav',
  'JahrMarkt2.wav', 'Jetes.wav', 'Klickorgan.wav', 'KorgBeau.wav', 'KorgBow.wav', 'KorgFilter.wav',
  'Koto.wav', 'Leader.wav', 'Licks.wav', 'Magic.wav', 'Marimba.wav', 'Mechanic1.wav', 'Mechanic2.wav',
  'MetalKeys.wav', 'MuteClav.wav', 'Nice.wav', 'NightMare.wav', 'NoteMan.wav', 'Organ.wav', 'Outlaw.wav',
  'PanFlute.wav', 'PingBells.wav', 'Pizza.wav', 'PolySynth.wav', 'Pulse.wav', 'RingPiano.wav',
  'RoomBrass.wav', 'Shamus.wav', 'SineCZ.wav', 'SixTease.wav', 'Soundtrack.wav', 'Squares.wav',
  'Stabs.wav', 'Steinway.wav', 'Strange.wav', 'Sweep.wav', 'SynBrass.wav', 'SynthPiano.wav',
  'TheEgg.wav', 'TineWave.wav', 'Touch.wav', 'Voices.wav'
];

export const ST01_PACK: SamplePack = {
  id: 'st-01',
  name: 'ST-01 (Ami-Sampler)',
  author: 'Unknown',
  description: 'Classic Amiga tracker sounds from the Ami-Sampler VST. 126 samples including drums, basses, strings, leads and more. Perfect for classic tracker music and chiptune.',
  basePath: ST01_BASE_PATH,
  categories: ['kicks', 'snares', 'claps', 'hihats', 'percussion', 'bass', 'leads', 'pads'],
  samples: {
    kicks: ST01_KICKS.map(f => createSampleInfo(f, 'kicks', ST01_BASE_PATH)),
    snares: ST01_SNARES.map(f => createSampleInfo(f, 'snares', ST01_BASE_PATH)),
    claps: ST01_CLAPS.map(f => createSampleInfo(f, 'claps', ST01_BASE_PATH)),
    hihats: ST01_HIHATS.map(f => createSampleInfo(f, 'hihats', ST01_BASE_PATH)),
    percussion: ST01_PERCUSSION.map(f => createSampleInfo(f, 'percussion', ST01_BASE_PATH)),
    bass: ST01_BASS.map(f => createSampleInfo(f, 'bass', ST01_BASE_PATH)),
    leads: ST01_LEADS.map(f => createSampleInfo(f, 'leads', ST01_BASE_PATH)),
    pads: ST01_STRINGS.map(f => createSampleInfo(f, 'pads', ST01_BASE_PATH)),
    fx: [],
    loops: [],
    vocals: [],
    other: [],
  },
  sampleCount: 126,
};

// ============================================================================
// ST-02 SAMPLE PACK (Ami-Sampler)
// Classic Amiga tracker sounds - 121 samples
// ============================================================================

const ST02_BASE_PATH = 'data/samples/packs/st-02';

const ST02_KICKS = ['BassDrum5.wav', 'bassdrum8.wav', 'linnkick.wav'];
const ST02_SNARES = ['Snare6.wav', 'Snare7.wav', 'Snare8.wav', 'Snare9.wav', 'snare10.wav', 'break.wav', 'snx.drum2.wav', 'snx.drum3.wav'];
const ST02_HIHATS = ['HiHat3.wav', 'HiHat4.wav'];
const ST02_PERCUSSION = [
  'Cowbell2.wav', 'Cymbal1.wav', 'Cymbal2.wav', 'ridecymbal.wav',
  'Perc-Agogo.wav', 'Perc-Bongo.wav', 'perc-drytom.wav', 'Perc-HandDrum.wav',
  'Perc-Taiko.wav', 'Perc-Timbale.wav', 'Perc-Timpani.wav'
];

const ST02_BASS = [
  'DumpfBass.wav', 'HammerBass.wav', 'HitBass.wav', 'HosBass.wav', 'MilBass.wav',
  'MiniMoog.wav', 'SoloBass.wav', 'slapbass2.wav'
];

const ST02_LEADS = [
  'AccGit.wav', 'accordion.wav', 'AcoPiano.wav', 'aeh.wav', 'AhhVox.wav', 'Alcom.wav', 'Aloog.wav',
  'baba.wav', 'Balance.wav', 'Blower.wav', 'Bouncy.wav', 'Bratz.wav', 'Brian.wav', 'Bright.wav',
  'Bubble.wav', 'China.wav', 'Cliop.wav', 'CordPiano.wav', 'DigiPop.wav', 'ElecGuitar.wav',
  'EloPin.wav', 'fatbrass.wav', 'Friday.wav', 'GlassMute.wav', 'Glockenspiel.wav', 'Growl.wav',
  'guitar1.wav', 'ha.wav', 'Hapsi.wav', 'he.wav', 'HighVibes.wav', 'HitMe1.wav', 'HitMe2.wav',
  'IceRain.wav', 'importdev.wav', 'JamJam.wav', 'k.wav', 'kermie1.wav', 'kermie2.wav', 'kermie3.wav',
  'kermie4.wav', 'kermie5.wav', 'kermie6.wav', 'kermie7.wav', 'Licks2.wav', 'LongSlap.wav',
  'master.wav', 'Monkey.wav', 'o.wav', 'ok.wav', 'Paper.wav', 'Peck.wav', 'PinVoice.wav',
  'PitchBrass.wav', 'Pizza2.wav', 'Poison.wav', 'RealKoto1.wav', 'RealKoto2.wav', 'Reflex.wav',
  'Reverb2.wav', 'Ringtone.wav', 's.wav', 'SawJump.wav', 'Sequencer.wav', 'servant.wav', 'Sinbad.wav',
  'SingerBell.wav', 'Siren.wav', 'SmartBrass.wav', 'SpeOwl.wav', 'Spoils.wav', 'SqBrass.wav',
  'Squint.wav', 'Starpeace.wav', 'Stars.wav', 'stoehn.wav', 'stringsc.wav', 'swoop.wav', 'SynBuz.wav',
  'SynPia.wav', 'Take.wav', 'Tallic.wav', 'TeaPiano.wav', 'Telephone.wav', 'Trio.wav', 'Tubes.wav',
  'WarmBells.wav', 'Warmth.wav', 'YaskMe.wav'
];

export const ST02_PACK: SamplePack = {
  id: 'st-02',
  name: 'ST-02 (Ami-Sampler)',
  author: 'Unknown',
  description: 'More classic Amiga tracker sounds from the Ami-Sampler VST. 121 samples including Kermit vocals, percussion, basses and melodic instruments. Great for tracker music.',
  basePath: ST02_BASE_PATH,
  categories: ['kicks', 'snares', 'hihats', 'percussion', 'bass', 'leads', 'vocals'],
  samples: {
    kicks: ST02_KICKS.map(f => createSampleInfo(f, 'kicks', ST02_BASE_PATH)),
    snares: ST02_SNARES.map(f => createSampleInfo(f, 'snares', ST02_BASE_PATH)),
    claps: [],
    hihats: ST02_HIHATS.map(f => createSampleInfo(f, 'hihats', ST02_BASE_PATH)),
    percussion: ST02_PERCUSSION.map(f => createSampleInfo(f, 'percussion', ST02_BASE_PATH)),
    bass: ST02_BASS.map(f => createSampleInfo(f, 'bass', ST02_BASE_PATH)),
    leads: ST02_LEADS.map(f => createSampleInfo(f, 'leads', ST02_BASE_PATH)),
    pads: [],
    fx: [],
    loops: [],
    vocals: [], // kermie samples are in leads
    other: [],
  },
  sampleCount: 121,
};

// ============================================================================
// SAMPLE PACK REGISTRY
// ============================================================================

export const SAMPLE_PACKS: SamplePack[] = [
  DRUMNIBUS_PACK,
  CASIO_MT40_PACK,
  ST01_PACK,
  ST02_PACK,
];

export const getSamplePackById = (id: string): SamplePack | undefined => {
  return SAMPLE_PACKS.find(pack => pack.id === id);
};

export const getAllSamplePacks = (): SamplePack[] => {
  return SAMPLE_PACKS;
};
