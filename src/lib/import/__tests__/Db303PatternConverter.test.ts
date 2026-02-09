/**
 * Tests for DB303 Pattern Converter
 */

import { describe, it, expect } from 'vitest';
import { parseDb303Pattern, convertToDb303Pattern, createEmptyDb303Pattern } from '../Db303PatternConverter';

// Sample DB303 pattern XML (matches the default pattern format)
const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<db303-pattern version="1.0" numSteps="16">
  <step index="0" key="0" octave="0" gate="true" accent="false" slide="false"/>
  <step index="1" key="0" octave="-1" gate="true" accent="false" slide="false"/>
  <step index="2" key="0" octave="-1" gate="true" accent="false" slide="true"/>
  <step index="3" key="5" octave="0" gate="false" accent="false" slide="false"/>
  <step index="4" key="5" octave="0" gate="true" accent="true" slide="true"/>
  <step index="5" key="5" octave="0" gate="true" accent="false" slide="true"/>
  <step index="6" key="3" octave="0" gate="true" accent="false" slide="false"/>
  <step index="7" key="0" octave="0" gate="true" accent="true" slide="true"/>
  <step index="8" key="0" octave="-1" gate="true" accent="false" slide="true"/>
  <step index="9" key="0" octave="1" gate="true" accent="false" slide="false"/>
  <step index="10" key="4" octave="0" gate="false" accent="false" slide="false"/>
  <step index="11" key="0" octave="-1" gate="true" accent="true" slide="true"/>
  <step index="12" key="0" octave="1" gate="true" accent="true" slide="false"/>
  <step index="13" key="0" octave="-1" gate="true" accent="false" slide="true"/>
  <step index="14" key="0" octave="0" gate="true" accent="false" slide="false"/>
  <step index="15" key="0" octave="-1" gate="false" accent="false" slide="false"/>
</db303-pattern>`;

describe('DB303 Pattern Converter', () => {
  describe('parseDb303Pattern', () => {
    it('should parse valid XML pattern', () => {
      const { pattern } = parseDb303Pattern(sampleXml, 'Test Pattern');

      expect(pattern).toBeDefined();
      expect(pattern.name).toBe('Test Pattern');
      expect(pattern.length).toBe(16);
      expect(pattern.channels).toHaveLength(1);
      expect(pattern.channels[0].rows).toHaveLength(16);
    });

    it('should convert db303 notes to tracker format correctly', () => {
      const { pattern } = parseDb303Pattern(sampleXml);

      // Step 0: key=0, octave=0, gate=true → C-3 (note 37)
      // db303 octave 0 = tracker octave 3
      expect(pattern.channels[0].rows[0].note).toBe(37);

      // Step 1: key=0, octave=-1, gate=true → C-2 (note 25)
      expect(pattern.channels[0].rows[1].note).toBe(25);

      // Step 9: key=0, octave=1, gate=true → C-4 (note 49)
      expect(pattern.channels[0].rows[9].note).toBe(49);
    });

    it('should preserve accent and slide flags', () => {
      const { pattern } = parseDb303Pattern(sampleXml);

      // Step 4 has accent=true and slide=true
      expect(pattern.channels[0].rows[4].flag1).toBe(1);
      expect(pattern.channels[0].rows[4].flag2).toBe(2);

      // Step 0 has accent=false and slide=false
      expect(pattern.channels[0].rows[0].flag1).toBeUndefined();
      expect(pattern.channels[0].rows[0].flag2).toBeUndefined();

      // Step 7 has accent=true and slide=true
      expect(pattern.channels[0].rows[7].flag1).toBe(1);
      expect(pattern.channels[0].rows[7].flag2).toBe(2);
    });

    it('should handle empty steps (gate=false)', () => {
      const { pattern } = parseDb303Pattern(sampleXml);

      // Step 3 has gate=false → note should be 0
      expect(pattern.channels[0].rows[3].note).toBe(0);

      // Step 15 has gate=false → note should be 0
      expect(pattern.channels[0].rows[15].note).toBe(0);
    });

    it('should throw error on invalid XML', () => {
      const invalidXml = '<invalid>xml</invalid>';
      expect(() => parseDb303Pattern(invalidXml)).toThrow();
    });
  });

  describe('convertToDb303Pattern', () => {
    it('should convert tracker pattern to DB303 XML', () => {
      // First parse a pattern
      const { pattern } = parseDb303Pattern(sampleXml, 'Test Pattern');

      // Convert it back to XML
      const xml = convertToDb303Pattern(pattern);

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<db303-pattern version="1.0" numSteps="16">');
      expect(xml).toContain('</db303-pattern>');
    });

    it('should preserve note data in round-trip conversion', () => {
      const { pattern } = parseDb303Pattern(sampleXml);
      const xml = convertToDb303Pattern(pattern);
      const { pattern: pattern2 } = parseDb303Pattern(xml);

      // Check that notes match
      for (let i = 0; i < 16; i++) {
        expect(pattern2.channels[0].rows[i].note).toBe(pattern.channels[0].rows[i].note);
      }
    });

    it('should preserve accent and slide in round-trip conversion', () => {
      const { pattern } = parseDb303Pattern(sampleXml);
      const xml = convertToDb303Pattern(pattern);
      const { pattern: pattern2 } = parseDb303Pattern(xml);

      // Check step 4 (has accent and slide)
      expect(pattern2.channels[0].rows[4].flag1).toBe(1);
      expect(pattern2.channels[0].rows[4].flag2).toBe(2);

      // Check step 7 (has accent and slide)
      expect(pattern2.channels[0].rows[7].flag1).toBe(1);
      expect(pattern2.channels[0].rows[7].flag2).toBe(2);
    });
  });

  describe('createEmptyDb303Pattern', () => {
    it('should create empty pattern with default 16 steps', () => {
      const pattern = createEmptyDb303Pattern();

      expect(pattern.length).toBe(16);
      expect(pattern.channels).toHaveLength(1);
      expect(pattern.channels[0].rows).toHaveLength(16);
    });

    it('should create empty pattern with custom step count', () => {
      const pattern = createEmptyDb303Pattern(32, 'Custom Pattern');

      expect(pattern.name).toBe('Custom Pattern');
      expect(pattern.length).toBe(32);
      expect(pattern.channels[0].rows).toHaveLength(32);
    });

    it('should have all empty steps (note=0)', () => {
      const pattern = createEmptyDb303Pattern(16);

      pattern.channels[0].rows.forEach((row) => {
        expect(row.note).toBe(0);
        expect(row.instrument).toBe(0);
      });
    });
  });

  describe('Note Conversion', () => {
    it('should convert C-3 (tracker) to key=0, octave=0 (db303)', () => {
      const emptyPattern = createEmptyDb303Pattern(1);

      // Set C-3 (note 37)
      emptyPattern.channels[0].rows[0].note = 37 as any;

      const xml = convertToDb303Pattern(emptyPattern);

      // Should contain: key="0" octave="0"
      expect(xml).toContain('key="0" octave="0"');
    });

    it('should convert C-2 (tracker) to key=0, octave=-1 (db303)', () => {
      const emptyPattern = createEmptyDb303Pattern(1);

      // Set C-2 (note 25)
      emptyPattern.channels[0].rows[0].note = 25 as any;

      const xml = convertToDb303Pattern(emptyPattern);

      // Should contain: key="0" octave="-1"
      expect(xml).toContain('key="0" octave="-1"');
    });

    it('should convert C-4 (tracker) to key=0, octave=1 (db303)', () => {
      const emptyPattern = createEmptyDb303Pattern(1);

      // Set C-4 (note 49)
      emptyPattern.channels[0].rows[0].note = 49 as any;

      const xml = convertToDb303Pattern(emptyPattern);

      // Should contain: key="0" octave="1"
      expect(xml).toContain('key="0" octave="1"');
    });

    it('should convert F-3 (tracker) to key=5, octave=0 (db303)', () => {
      const emptyPattern = createEmptyDb303Pattern(1);

      // Set F-3 (note 42 = C-3 37 + 5 semitones)
      emptyPattern.channels[0].rows[0].note = 42 as any;

      const xml = convertToDb303Pattern(emptyPattern);

      // Should contain: key="5" octave="0" (F is 5 semitones above C)
      expect(xml).toContain('key="5" octave="0"');
    });
  });
});
