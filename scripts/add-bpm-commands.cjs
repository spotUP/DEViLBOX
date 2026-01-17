/**
 * Add BPM commands to demo songs
 * Uses Fxx command where xx >= 20 (32) sets BPM directly
 * Common: F7D = 125 BPM (ProTracker default)
 */

const fs = require('fs');
const path = require('path');

const SONGS_DIR = path.join(__dirname, '../public/songs');

// Demo songs with their desired BPM
const DEMO_SONGS = [
  { file: 'phuture-acid-tracks.song.json', bpm: 125 }, // Classic acid house
  { file: 'hardfloor-funalogue.song.json', bpm: 130 }, // Harder techno
  { file: 'josh-wink-higher-state.song.json', bpm: 130 }, // Acid techno
  { file: 'dittytoy-303.song.json', bpm: 125 }, // Classic tempo
  { file: 'new-order-confusion.song.json', bpm: 120 }, // 80s tempo
  { file: 'fatboy-slim-everyone-needs-303.song.json', bpm: 125 }, // Big beat
  { file: 'fast-eddie-acid-thunder.song.json', bpm: 128 }, // House
  { file: 'dj-tim-misjah-access.song.json', bpm: 140 }, // Gabber/hardcore
  { file: 'edge-of-motion-setup-707.song.json', bpm: 125 }, // Techno
];

function bpmToHex(bpm) {
  // Fxx command: F20-FF sets BPM (32-255)
  const clampedBpm = Math.max(32, Math.min(255, bpm));
  return 'F' + clampedBpm.toString(16).toUpperCase().padStart(2, '0');
}

function addBpmCommands(songPath, targetBpm) {
  console.log(`Processing: ${path.basename(songPath)} (BPM: ${targetBpm})`);

  const data = JSON.parse(fs.readFileSync(songPath, 'utf8'));

  if (!data.patterns || !Array.isArray(data.patterns)) {
    console.log(`  ⚠️  No patterns found, skipping`);
    return;
  }

  // Update the song's global BPM metadata if it exists
  if (data.bpm !== undefined) {
    data.bpm = targetBpm;
  }

  const bpmCommand = bpmToHex(targetBpm);
  let modified = 0;

  // Add BPM command to first row of first pattern's first channel
  const firstPattern = data.patterns[0];
  if (firstPattern && firstPattern.channels && firstPattern.channels.length > 0) {
    const firstRow = firstPattern.channels[0].rows[0];

    // Check if there's already a speed command (F06), we'll add BPM to second row or another channel
    if (firstRow.effect && firstRow.effect.startsWith('F')) {
      // If row already has F06 (speed), try second channel
      if (firstPattern.channels.length > 1) {
        const secondChannelFirstRow = firstPattern.channels[1].rows[0];
        if (secondChannelFirstRow && secondChannelFirstRow.effect === null) {
          secondChannelFirstRow.effect = bpmCommand;
          modified++;
        }
      } else {
        // Otherwise use second row of first channel
        if (firstPattern.channels[0].rows.length > 1) {
          const secondRow = firstPattern.channels[0].rows[1];
          if (secondRow && secondRow.effect === null) {
            secondRow.effect = bpmCommand;
            modified++;
          }
        }
      }
    } else if (firstRow.effect === null) {
      // No effect yet, add BPM command
      firstRow.effect = bpmCommand;
      modified++;
    }
  }

  if (modified > 0) {
    fs.writeFileSync(songPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`  ✓ Added ${bpmCommand} (${targetBpm} BPM)`);
  } else {
    console.log(`  → No changes needed (may already have effect commands)`);
  }
}

console.log('Adding BPM commands to demo songs...\n');

DEMO_SONGS.forEach(({ file, bpm }) => {
  const songPath = path.join(SONGS_DIR, file);

  if (fs.existsSync(songPath)) {
    try {
      addBpmCommands(songPath, bpm);
    } catch (error) {
      console.error(`  ✗ Error processing ${file}:`, error.message);
    }
  } else {
    console.log(`  ⚠️  File not found: ${file}`);
  }
});

console.log('\n✓ Done!');
