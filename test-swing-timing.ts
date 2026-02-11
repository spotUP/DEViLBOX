/**
 * Swing Timing Test Pattern Generator
 * 
 * Creates a simple test pattern to verify swing timing behavior.
 * Run this to generate a test pattern that demonstrates:
 * - Swing = 100 should be straight (no delay)
 * - Swing = 150 should have medium bounce
 * - Swing = 200 should have full triplet feel
 * - Slides should work correctly at all swing values
 * 
 * Expected timing at 120 BPM (rowDuration = 125ms):
 * - Swing 100: All steps evenly spaced at 125ms intervals
 * - Swing 150: Odd steps delayed by ~21ms (16.7% of 125ms)
 * - Swing 200: Odd steps delayed by ~42ms (33.3% of 125ms)
 */

import type { Pattern, TrackerCell } from './src/types';
import { useTrackerStore } from './src/stores/useTrackerStore';
import { useTransportStore } from './src/stores/useTransportStore';
import { useInstrumentStore } from './src/stores/useInstrumentStore';

/**
 * Generate test pattern with alternating notes and slides
 */
export function createSwingTestPattern(instrumentId: number = 1): Pattern {
  const rows: TrackerCell[] = [];
  
  // 16 steps: C4 on even steps, rest on odd steps, slides on steps 2,6,10,14
  for (let i = 0; i < 16; i++) {
    if (i % 2 === 0) {
      // Even steps: play C4 (note 49 in XM format)
      // XM: C-4 = 49 (MIDI 60 - 11)
      rows.push({
        note: 49,  // C-4
        instrument: instrumentId,
        volume: 0x40, // Max volume
        effTyp: 0,
        eff: 0,
        effTyp2: 0,
        eff2: 0,
        // Add slide flag on steps 2, 6, 10, 14
        flag2: (i === 2 || i === 6 || i === 10 || i === 14) ? 2 : undefined,
      });
    } else {
      // Odd steps: rest
      rows.push({
        note: 0,
        instrument: 0,
        volume: 0,
        effTyp: 0,
        eff: 0,
        effTyp2: 0,
        eff2: 0,
      });
    }
  }

  return {
    id: 'swing-test-pattern',
    name: 'Swing Test Pattern',
    length: 16,
    channels: [
      {
        id: 'ch0',
        instrumentId: instrumentId,
        volume: 64,
        pan: 128,
        muted: false,
        rows,
      }
    ],
  };
}

/**
 * Load the test pattern into the tracker
 * Call this from browser console after app loads:
 * 
 * import('/test-swing-timing.js').then(m => m.loadSwingTest())
 */
export async function loadSwingTest() {
  console.log('🧪 Loading Swing Timing Test Pattern...');
  
  // Get stores
  const trackerStore = useTrackerStore.getState();
  const transportStore = useTransportStore.getState();
  const instrumentStore = useInstrumentStore.getState();
  
  // Find or create TB-303 instrument
  let tb303 = instrumentStore.instruments.find(inst => inst.synthType === 'TB303');
  if (!tb303) {
    const { createDefaultTB303Instrument } = await import('./src/lib/instrumentFactory');
    tb303 = createDefaultTB303Instrument();
    instrumentStore.addInstrument(tb303);
    console.log('✓ Created TB-303 instrument:', tb303.id);
  }
  
  // Create test pattern
  const testPattern = createSwingTestPattern(tb303.id);
  
  // Load into tracker
  const patterns = [...trackerStore.patterns, testPattern];
  trackerStore.loadPatterns(patterns);
  trackerStore.setCurrentPattern(patterns.length - 1);
  trackerStore.setPatternOrder([patterns.length - 1]);
  
  // Set test conditions
  transportStore.setBPM(120);  // 125ms per 1/16 note
  transportStore.setSwing(100); // Start with straight timing
  transportStore.setGrooveSteps(2); // 16th note swing
  
  console.log('✓ Test pattern loaded!');
  console.log('');
  console.log('📋 TEST INSTRUCTIONS:');
  console.log('-------------------');
  console.log('1. Press PLAY to start playback');
  console.log('2. Listen with Swing = 100 (current) - should sound evenly spaced');
  console.log('3. Adjust Swing to 150 - should have subtle bounce');
  console.log('4. Adjust Swing to 200 - should have strong shuffle feel');
  console.log('');
  console.log('🎯 EXPECTED TIMING (120 BPM):');
  console.log('- Swing 100: All notes evenly spaced at 125ms intervals');
  console.log('- Swing 150: Odd beats delayed by ~21ms');
  console.log('- Swing 200: Odd beats delayed by ~42ms (triplet feel)');
  console.log('');
  console.log('🎸 SLIDE TEST:');
  console.log('- Slides on steps 2, 6, 10, 14');
  console.log('- Should glide smoothly from previous note');
  console.log('- Timing should feel natural at all swing values');
  console.log('');
  console.log('Pattern: C4 - C4 - C4 - C4 - C4 - C4 - C4 - C4');
  console.log('Slides:  -  -  S  -  -  -  S  -  -  -  S  -  -  -  S  -');
  
  return testPattern;
}

/**
 * Run timing analysis
 * This logs expected vs actual timing for verification
 */
export function analyzeSwingTiming() {
  const transport = useTransportStore.getState();
  const bpm = transport.bpm;
  const swing = transport.swing;
  
  // Calculate row duration at current BPM
  const speed = 6; // Default XM speed
  const tickInterval = 2.5 / bpm;
  const rowDuration = tickInterval * speed;
  
  // Calculate swing offset
  const intensity = (swing - 100) / 100;
  const tripletShift = 0.3333;
  const swingOffset = intensity * tripletShift * rowDuration;
  
  console.log('⏱️  TIMING ANALYSIS');
  console.log('=================');
  console.log(`BPM: ${bpm}`);
  console.log(`Swing: ${swing}`);
  console.log(`Row Duration: ${(rowDuration * 1000).toFixed(2)}ms`);
  console.log(`Swing Intensity: ${(intensity * 100).toFixed(1)}%`);
  console.log(`Swing Offset: ${(swingOffset * 1000).toFixed(2)}ms`);
  console.log('');
  console.log('STEP TIMING:');
  console.log('Step | Beat | Delay | Time (ms)');
  console.log('-----|------|-------|----------');
  
  for (let i = 0; i < 16; i++) {
    const isSwungStep = (i % 2) === 1; // Odd steps get delayed
    const baseTime = i * rowDuration * 1000;
    const delay = isSwungStep ? swingOffset * 1000 : 0;
    const actualTime = baseTime + delay;
    const beatType = i % 2 === 0 ? 'ON ' : 'OFF';
    
    console.log(
      `  ${i.toString().padStart(2)} | ${beatType} | ${delay.toFixed(1).padStart(5)}ms | ${actualTime.toFixed(1).padStart(6)}ms`
    );
  }
  
  console.log('');
  console.log('Note: OFF beats are delayed by swing amount');
  console.log('      ON beats (0,2,4...) stay on the grid');
}

// Export for use in browser console
if (typeof window !== 'undefined') {
  (window as any).loadSwingTest = loadSwingTest;
  (window as any).analyzeSwingTiming = analyzeSwingTiming;
  console.log('🧪 Swing test loaded. Run: loadSwingTest()');
}
