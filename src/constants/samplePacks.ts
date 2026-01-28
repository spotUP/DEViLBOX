/**
 * Sample Pack Registry - Available sample packs for DEViLBOX
 */

import type { SamplePack, SampleInfo, SampleCategory } from '@typedefs/samplePack';

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
    url: `${basePath}/${category}/${encodeURIComponent(filename)}`,
  };
}

// ============================================================================
// DRUMNIBUS ELECTRO DRUMS SAMPLE PACK
// By Legowelt - 229 samples of electro drum machine sounds
// ============================================================================

// Use Vite's BASE_URL for proper path resolution
const BASE_URL = import.meta.env.BASE_URL || '/';
const DRUMNIBUS_BASE_PATH = `${BASE_URL}data/samples/packs/drumnibus`;

const DRUMNIBUS_KICKS: string[] = [
  'BB_Electro1short.wav',
  'BD Drumaxia wav.wav',
  'BD Pufsub.wav',
  'BD_808A1200.wav',
  'BD_DiggerLong.wav',
  'BD_Digidap.wav',
  'BD_Digimozzy.wav',
  'BD_Dikkie.wav',
  'BD_Dome Long.wav',
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
  'SD_Analog Noise 2.wav',
  'SD_Analog Noise 4.wav',
  'SD_Analog Noise 5.wav',
  'SD_Analog Noise1.wav',
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
  'SD_LoDigital 1.wav',
  'SD_LoDigital 2.wav',
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
  'SD_Wolf 3.wav',
  'SD_Wolf 5.wav',
  'SD_Wolf 6.wav',
  'SD_Wolf 7.wav',
  'SD_Wolf 8.wav',
  'SD_Wolf 9.wav',
  'SD_Wolf1.wav',
  'SD_Wolf2.wav',
  'SD_Wolfsweep1.wav',
];

const DRUMNIBUS_HIHATS: string[] = [
  'CH_Digidap.wav',
  'CH_DistortedRitmo.wav',
  'CH_DraconisD921.wav',
  'CH_DraconisD922.wav',
  'CH_Fantio Closed Hat.wav',
  'CH_Filtix Closed Hat.wav',
  'CH_Juxtapos.wav',
  'CH_LofiHuman.wav',
  'CH_Magnotron.wav',
  'CH_Punchtron.wav',
  'CH_Rezmatix Closed Hat.wav',
  'CH_Rubydub.wav',
  'CH_Ruflex.wav',
  'CH_Sizzel Closed Hat.wav',
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
  'OH_Fantio Open Hat.wav',
  'OH_Filtix Open Hat.wav',
  'OH_Juxtapos.wav',
  'OH_LofiHuman.wav',
  'OH_Magnotron.wav',
  'OH_Punchtron.wav',
  'OH_Rezmatix Open Hat Long.wav',
  'OH_Rezmatix Open Hat.wav',
  'OH_Rubydub.wav',
  'OH_Ruflex.wav',
  'OH_Sizzel Open Hat.wav',
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
  'LAZ Drumaxia.wav',
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
  coverImage: `${BASE_URL}data/samples/packs/drumnibus/cover.png`,
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
// SAMPLE PACK REGISTRY
// ============================================================================

export const SAMPLE_PACKS: SamplePack[] = [
  DRUMNIBUS_PACK,
];

export const getSamplePackById = (id: string): SamplePack | undefined => {
  return SAMPLE_PACKS.find(pack => pack.id === id);
};

export const getAllSamplePacks = (): SamplePack[] => {
  return SAMPLE_PACKS;
};
