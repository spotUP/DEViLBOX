/**
 * Generate TB-303 Demo Songs
 * Creates .dbox files from famous TB-303 patterns
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { FAMOUS_TB303_PATTERNS } from '../src/lib/generators/famousTB303Patterns.js';
import { convertTB303Pattern, padPattern } from '../src/lib/generators/tb303PatternConverter.js';
import type { Pattern, InstrumentConfig, ProjectMetadata } from '../src/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUTPUT_DIR = join(__dirname, '../public/demos/tb303');

// Create TB-303 instrument configuration
function createTB303Instrument(waveform: 'SAW' | 'SQUARE'): InstrumentConfig {
  return {
    id: 0,
    name: `TB-303 (${waveform})`,
    synthType: 'TB-303',
    volume: -6,
    pan: 0,
    effects: [],
    parameters: {
      waveform,
      cutoff: 0.5,
      resonance: 0.7,
      envMod: 0.6,
      decay: 0.4,
      accent: 0.8,
    },
  };
}

// Create pattern from TB-303 pattern data
function createPatternFromTB303(tb303Pattern: typeof FAMOUS_TB303_PATTERNS[0], patternIndex: number): Pattern {
  const cells = convertTB303Pattern(tb303Pattern, 0);
  const paddedCells = padPattern(cells, 16);

  return {
    id: `pattern-${patternIndex}`,
    name: tb303Pattern.name,
    length: paddedCells.length,
    channels: [
      {
        name: 'TB-303',
        rows: paddedCells,
        muted: false,
        solo: false,
        volume: 80,
        pan: 0,
        instrumentId: 0,
        color: '#FFD700', // Gold color for TB-303
      },
    ],
  };
}

// Generate .dbox file content
function generateDBoxFile(
  pattern: typeof FAMOUS_TB303_PATTERNS[0],
  patternIndex: number
): string {
  const instrument = createTB303Instrument(pattern.waveform);
  const patternData = createPatternFromTB303(pattern, patternIndex);

  const metadata: ProjectMetadata = {
    title: pattern.name,
    author: 'DEViLBOX',
    description: `Classic TB-303 pattern - ${pattern.waveform} wave`,
    version: '1.0.0',
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
  };

  const projectData = {
    version: '1.0.0',
    metadata,
    bpm: pattern.bpm || 120,
    patterns: [patternData],
    instruments: [instrument],
    masterVolume: 0,
    masterEffects: [],
  };

  return JSON.stringify(projectData, null, 2);
}

// Main generation function
function generateAllDemos() {
  // Create output directory
  try {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  } catch (err) {
    // Directory may already exist
  }

  console.log(`Generating TB-303 demo songs in ${OUTPUT_DIR}...\n`);

  FAMOUS_TB303_PATTERNS.forEach((pattern, index) => {
    const filename = `${index + 1}-${pattern.name
      .replace(/[^a-z0-9]/gi, '-')
      .replace(/-+/g, '-')
      .toLowerCase()}.dbox`;

    const filepath = join(OUTPUT_DIR, filename);
    const content = generateDBoxFile(pattern, index);

    writeFileSync(filepath, content);
    console.log(`✓ Created: ${filename}`);
    console.log(`  Pattern: ${pattern.name}`);
    console.log(`  Waveform: ${pattern.waveform}`);
    console.log(`  Steps: ${pattern.steps.length}`);
    if (pattern.bpm) {
      console.log(`  BPM: ${pattern.bpm}`);
    }
    console.log('');
  });

  console.log(`\n✅ Generated ${FAMOUS_TB303_PATTERNS.length} TB-303 demo songs!`);
}

// Run immediately
generateAllDemos();

export { generateAllDemos };
