/**
 * DB303 Preset Converter Tests
 */

import { describe, test, expect } from 'vitest';
import { parseDb303Preset, convertToDb303Preset } from '../Db303PresetConverter';
import { DEFAULT_TB303 } from '@typedefs/instrument';

// Sample XML from default-preset.xml
const samplePreset = `<?xml version="1.0" encoding="UTF-8"?>
<db303-preset version="1.0">
  <oscillator>
    <waveform>0</waveform>
    <pulseWidth>0</pulseWidth>
    <subOscGain>0</subOscGain>
    <subOscBlend>1</subOscBlend>
  </oscillator>
  <filter>
    <cutoff>0.5</cutoff>
    <resonance>0.5</resonance>
    <envMod>0.5</envMod>
    <decay>0.5</decay>
    <accent>0.5</accent>
  </filter>
  <devilfish>
    <normalDecay>0.164</normalDecay>
    <accentDecay>0.006</accentDecay>
    <softAttack>0</softAttack>
    <accentSoftAttack>0.1</accentSoftAttack>
    <passbandCompensation>0.09</passbandCompensation>
    <resTracking>0.743</resTracking>
    <filterInputDrive>0.169</filterInputDrive>
    <filterSelect>255</filterSelect>
    <diodeCharacter>1</diodeCharacter>
    <duffingAmount>0.03</duffingAmount>
    <filterFmDepth>0</filterFmDepth>
    <lpBpMix>0</lpBpMix>
    <stageNLAmount>0</stageNLAmount>
    <ensembleAmount>0</ensembleAmount>
    <oversamplingOrder>2</oversamplingOrder>
    <filterTracking>0</filterTracking>
    <slideTime>0.17</slideTime>
  </devilfish>
  <lfo>
    <waveform>0</waveform>
    <rate>0</rate>
    <contour>0</contour>
    <pitchDepth>0</pitchDepth>
    <pwmDepth>0</pwmDepth>
    <filterDepth>0</filterDepth>
  </lfo>
  <chorus>
    <mode>0</mode>
    <mix>0.5</mix>
  </chorus>
  <phaser>
    <rate>0.5</rate>
    <width>0.7</width>
    <feedback>0</feedback>
    <mix>0</mix>
  </phaser>
  <delay>
    <time>3</time>
    <feedback>0.3</feedback>
    <tone>0.5</tone>
    <mix>0</mix>
    <spread>0.5</spread>
  </delay>
</db303-preset>`;

describe('Db303PresetConverter', () => {
  test('parseDb303Preset should parse valid XML', () => {
    const config = parseDb303Preset(samplePreset);

    expect(config.oscillator).toBeDefined();
    expect(config.oscillator?.type).toBe('sawtooth'); // waveform=0
    expect(config.filter).toBeDefined();
    expect(config.devilFish).toBeDefined();
    expect(config.lfo).toBeDefined();
    expect(config.chorus).toBeDefined();
    expect(config.phaser).toBeDefined();
    expect(config.delay).toBeDefined();
  });

  test('parseDb303Preset should handle normalized values correctly', () => {
    const config = parseDb303Preset(samplePreset);

    // Oscillator
    expect(config.oscillator?.pulseWidth).toBe(0);
    expect(config.oscillator?.subOscBlend).toBe(1); // 0-1 normalized

    // Filter - 0.5 normalized values (not multiplied to 0-100)
    expect(config.filter?.resonance).toBe(0.5);
    expect(config.filterEnvelope?.envMod).toBe(0.5);
    expect(config.accent?.amount).toBe(0.5);

    // LFO - all 0
    expect(config.lfo?.rate).toBe(0);
    expect(config.lfo?.pitchDepth).toBe(0);

    // Chorus - mode=0 means Off, so enabled=false and mix=0
    expect(config.chorus?.mix).toBe(0);
    expect(config.chorus?.enabled).toBe(false); // mode=0 means Off
  });

  test('convertToDb303Preset should generate valid XML', () => {
    const xml = convertToDb303Preset(DEFAULT_TB303);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<db303-preset version="1.0">');
    expect(xml).toContain('<oscillator>');
    expect(xml).toContain('<filter>');
    expect(xml).toContain('</db303-preset>');
  });

  test('round-trip conversion should preserve values', () => {
    // Parse the sample preset
    const parsed = parseDb303Preset(samplePreset);

    // Convert back to XML
    const mergedConfig = { ...DEFAULT_TB303, ...parsed };
    const xml = convertToDb303Preset(mergedConfig);

    // Parse again
    const reparsed = parseDb303Preset(xml);

    // Check key values are preserved (within rounding tolerance)
    expect(reparsed.oscillator?.type).toBe(parsed.oscillator?.type);
    expect(reparsed.filter?.resonance).toBeCloseTo(parsed.filter?.resonance ?? 0.5, 3);
    expect(reparsed.lfo?.waveform).toBe(parsed.lfo?.waveform);
  });

  test('parseDb303Preset should throw on invalid XML', () => {
    const invalidXml = 'This is not XML';

    expect(() => parseDb303Preset(invalidXml)).toThrow('Invalid XML');
  });
});
