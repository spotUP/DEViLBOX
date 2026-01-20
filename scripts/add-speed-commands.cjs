/**
 * Add F06 speed command to the first row of each pattern in demo songs
 * This sets the tracker speed to 6 ticks per row (FT2 default)
 */

const fs = require('fs');
const path = require('path');

const SONGS_DIR = path.join(__dirname, '../public/songs');
const DEMO_SONGS = [
  'daft-punk-da-funk.song.json',
  'phuture-acid-tracks.song.json',
  'hardfloor-funalogue.song.json',
  'josh-wink-higher-state.song.json',
  'dittytoy-303.song.json',
  'new-order-confusion.song.json',
  'fatboy-slim-everyone-needs-303.song.json',
  'fast-eddie-acid-thunder.song.json',
  'dj-tim-misjah-access.song.json',
  'edge-of-motion-setup-707.song.json',
];

function addSpeedCommands(songPath) {
  console.log(`Processing: ${path.basename(songPath)}`);

  const data = JSON.parse(fs.readFileSync(songPath, 'utf8'));

  if (!data.patterns || !Array.isArray(data.patterns)) {
    console.log(`  ⚠️  No patterns found, skipping`);
    return;
  }

  let modified = 0;

  data.patterns.forEach((pattern, patternIndex) => {
    if (!pattern.channels || pattern.channels.length === 0) return;

    // Add F06 to first row of first channel if it doesn't have an effect
    const firstRow = pattern.channels[0].rows[0];
    if (firstRow && firstRow.effect === null) {
      firstRow.effect = 'F06'; // Set speed to 6 ticks per row
      modified++;
    }
  });

  if (modified > 0) {
    fs.writeFileSync(songPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`  ✓ Added F06 to ${modified} pattern(s)`);
  } else {
    console.log(`  → No changes needed`);
  }
}

console.log('Adding F06 speed commands to demo songs...\n');

DEMO_SONGS.forEach(filename => {
  const songPath = path.join(SONGS_DIR, filename);

  if (fs.existsSync(songPath)) {
    try {
      addSpeedCommands(songPath);
    } catch (error) {
      console.error(`  ✗ Error processing ${filename}:`, error.message);
    }
  } else {
    console.log(`  ⚠️  File not found: ${filename}`);
  }
});

console.log('\n✓ Done!');
