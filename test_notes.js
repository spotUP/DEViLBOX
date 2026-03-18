const test = {
  patterns: [
    {
      id: 'pattern-0',
      channels: [
        { rows: [] },  // Empty channel
        { rows: [] },
        { rows: [] },
        { rows: [] },
      ]
    }
  ]
};

// Check if pattern has actual notes
const pattern = test.patterns[0];
for (const ch of pattern.channels) {
  for (const row of ch.rows) {
    if (row.note > 0) {
      console.log('Found note!');
      process.exit(0);
    }
  }
}
console.log('NO NOTES FOUND - This pattern is silent!');
