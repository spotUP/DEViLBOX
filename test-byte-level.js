/**
 * BYTE-LEVEL COMPARISON TEST
 * Shows exact hex/byte values for every piece of data
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TEST PATTERN DATA (raw from DB303 XML)
// ═══════════════════════════════════════════════════════════════════════════════

const testPattern = [
  { step: 0, key: 6, octave: 0, gate: true, accent: false, slide: false },
  { step: 1, key: 0, octave: 0, gate: true, accent: false, slide: false },
  { step: 2, key: 6, octave: 0, gate: true, accent: false, slide: true },
  { step: 3, key: 11, octave: 1, gate: false, accent: false, slide: false },
  { step: 4, key: 11, octave: 1, gate: true, accent: true, slide: true },
  { step: 5, key: 0, octave: 0, gate: true, accent: false, slide: false },
  { step: 6, key: 9, octave: 1, gate: true, accent: false, slide: false },
  { step: 7, key: 6, octave: 1, gate: true, accent: true, slide: true },
  { step: 8, key: 6, octave: 0, gate: true, accent: false, slide: true },
  { step: 9, key: 6, octave: 1, gate: true, accent: false, slide: false },
  { step: 10, key: 10, octave: 1, gate: false, accent: false, slide: false },
  { step: 11, key: 6, octave: 0, gate: true, accent: true, slide: true },
  { step: 12, key: 6, octave: 1, gate: true, accent: true, slide: false },
  { step: 13, key: 6, octave: 0, gate: true, accent: false, slide: true },
  { step: 14, key: 6, octave: 1, gate: true, accent: false, slide: false },
  { step: 15, key: 6, octave: 0, gate: false, accent: false, slide: false },
];

const rootNote = 36;

function toHex(n, pad = 2) {
  return '0x' + n.toString(16).toUpperCase().padStart(pad, '0');
}

function toBin(n, pad = 8) {
  return '0b' + n.toString(2).padStart(pad, '0');
}

console.log('╔══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗');
console.log('║                                        BYTE-LEVEL DATA TRACE                                                             ║');
console.log('╚══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝');
console.log('');
console.log('Legend:');
console.log('  MIDI: Musical Instrument Digital Interface note number (0-127)');
console.log('  XM:   XM/MOD note format (1-96 = notes, 97 = note-off, 0 = empty)');
console.log('  flag1: Accent flag (0x01 = accent, 0x00 = no accent)');
console.log('  flag2: Slide flag (0x02 = slide, 0x00 = no slide)');
console.log('');

console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════');
console.log('RAW XML VALUES:');
console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════');
console.log('');
console.log('Root Note: ' + rootNote + ' = ' + toHex(rootNote) + ' (MIDI C2)');
console.log('');
console.log('Step | key (dec/hex) | oct | gate | acc  | slide');
console.log('-----|---------------|-----|------|------|------');

for (const s of testPattern) {
  console.log(`${s.step.toString().padStart(4)} | ${s.key.toString().padStart(3)} / ${toHex(s.key).padEnd(4)} | ${s.octave.toString().padStart(3)} | ${s.gate ? '  1 ' : '  0 '} | ${s.accent ? '  1 ' : '  0 '} | ${s.slide ? '  1' : '  0'}`);
}

console.log('');
console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════');
console.log('MIDI CALCULATION (key + rootNote + octave*12):');
console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════');
console.log('');
console.log('Step | Calculation                    | MIDI dec | MIDI hex | Binary');
console.log('-----|--------------------------------|----------|----------|----------');

for (const s of testPattern) {
  const midi = rootNote + s.key + (s.octave * 12);
  const calc = `${toHex(rootNote)} + ${toHex(s.key)} + ${s.octave}*12`;
  console.log(`${s.step.toString().padStart(4)} | ${calc.padEnd(30)} | ${midi.toString().padStart(8)} | ${toHex(midi).padEnd(8)} | ${toBin(midi)}`);
}

console.log('');
console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════');
console.log('XM PATTERN DATA (TrackerCell format):');
console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════');
console.log('');
console.log('Conversion: XM = MIDI - 11 (so MIDI 0x24 = XM 0x19 = C-2)');
console.log('Note-off: 0x61 (decimal 97)');
console.log('');
console.log('Step | gate | MIDI hex | XM dec | XM hex | flag1 hex | flag2 hex | Combined Byte View');
console.log('-----|------|----------|--------|--------|-----------|-----------|--------------------');

let lastGate = false;
for (const s of testPattern) {
  const midi = rootNote + s.key + (s.octave * 12);
  let xmNote;
  let flag1 = s.accent ? 0x01 : 0x00;
  let flag2 = s.slide ? 0x02 : 0x00;
  
  if (s.gate) {
    xmNote = midi - 11;
    lastGate = true;
  } else {
    if (lastGate) {
      xmNote = 97; // Note-off
      flag1 = 0;
      flag2 = 0;
    } else {
      xmNote = 0; // Empty
      flag1 = 0;
      flag2 = 0;
    }
    lastGate = false;
  }
  
  // Combined byte view: [note][flag1][flag2]
  const combined = `[${toHex(xmNote)}][${toHex(flag1)}][${toHex(flag2)}]`;
  
  console.log(`${s.step.toString().padStart(4)} | ${s.gate ? '  1 ' : '  0 '} | ${toHex(midi).padEnd(8)} | ${xmNote.toString().padStart(6)} | ${toHex(xmNote).padEnd(6)} | ${toHex(flag1).padEnd(9)} | ${toHex(flag2).padEnd(9)} | ${combined}`);
}

console.log('');
console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════');
console.log('SLIDE STATE MACHINE (bit-level tracking):');
console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════');
console.log('');
console.log('prevSlideFlag: Stored from previous row (1 bit)');
console.log('currSlideFlag: flag2 & 0x02 from current row');
console.log('slideActive: prevSlideFlag && hasNote (sent to synth)');
console.log('');
console.log('Step | XM hex | hasNote | prevSlide | currSlide (flag2) | slideActive | Action');
console.log('-----|--------|---------|-----------|-------------------|-------------|--------');

let prevSlideFlag = false;
lastGate = false;

for (const s of testPattern) {
  const midi = rootNote + s.key + (s.octave * 12);
  let xmNote;
  let flag2 = s.slide ? 0x02 : 0x00;
  
  if (s.gate) {
    xmNote = midi - 11;
    lastGate = true;
  } else {
    if (lastGate) {
      xmNote = 97;
      flag2 = 0;
    } else {
      xmNote = 0;
      flag2 = 0;
    }
    lastGate = false;
  }
  
  const hasNote = xmNote > 0 && xmNote !== 97;
  const isNoteOff = xmNote === 97;
  const currSlide = (flag2 & 0x02) !== 0;
  const slideActive = prevSlideFlag && hasNote;
  
  let action = '';
  if (isNoteOff) action = 'RELEASE';
  else if (!hasNote) action = 'EMPTY';
  else if (slideActive) action = 'SLIDE';
  else action = 'TRIGGER';
  
  console.log(`${s.step.toString().padStart(4)} | ${toHex(xmNote).padEnd(6)} | ${hasNote ? '   1   ' : '   0   '} | ${prevSlideFlag ? '    1    ' : '    0    '} | ${currSlide ? '       1 (' + toHex(flag2) + ')     ' : '       0 (0x00)     '} | ${slideActive ? '     1     ' : '     0     '} | ${action}`);
  
  // Update state
  if (hasNote) {
    prevSlideFlag = currSlide;
  } else if (isNoteOff) {
    prevSlideFlag = false;
  }
  // Empty: keep prevSlideFlag unchanged
}

console.log('');
console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════');
console.log('SYNTH TRIGGERATTACK PARAMETERS:');
console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════');
console.log('');
console.log('Parameters: triggerAttack(noteName, time, velocity, accent, slide, hammer)');
console.log('');
console.log('Step | Call           | Note      | MIDI hex | accent | slide  | Full Param Dump');
console.log('-----|----------------|-----------|----------|--------|--------|------------------------------------------');

const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
prevSlideFlag = false;
lastGate = false;

function midiToNoteName(midi) {
  const octave = Math.floor(midi / 12) - 1;
  const semitone = midi % 12;
  return `${noteNames[semitone]}${octave}`;
}

for (const s of testPattern) {
  const midi = rootNote + s.key + (s.octave * 12);
  let xmNote;
  let flag1 = s.accent ? 0x01 : 0x00;
  let flag2 = s.slide ? 0x02 : 0x00;
  
  if (s.gate) {
    xmNote = midi - 11;
    lastGate = true;
  } else {
    if (lastGate) {
      xmNote = 97;
      flag1 = 0;
      flag2 = 0;
    } else {
      xmNote = 0;
      flag1 = 0;
      flag2 = 0;
    }
    lastGate = false;
  }
  
  const hasNote = xmNote > 0 && xmNote !== 97;
  const isNoteOff = xmNote === 97;
  const currSlide = (flag2 & 0x02) !== 0;
  const accent = (flag1 & 0x01) !== 0;
  const slideActive = prevSlideFlag && hasNote;
  
  let callType = '';
  let noteName = '';
  let paramDump = '';
  
  if (isNoteOff) {
    callType = 'triggerRelease';
    noteName = '---';
    paramDump = 'triggerRelease(time)';
  } else if (!hasNote) {
    callType = '(no call)';
    noteName = '...';
    paramDump = '// no synth call';
  } else {
    callType = 'triggerAttack';
    const actualMidi = xmNote + 11;
    noteName = midiToNoteName(actualMidi);
    paramDump = `triggerAttack("${noteName}", t, 1.0, ${accent}, ${slideActive}, false)`;
  }
  
  console.log(`${s.step.toString().padStart(4)} | ${callType.padEnd(14)} | ${noteName.padEnd(9)} | ${hasNote ? toHex(xmNote + 11) : '  --  '.padEnd(8)} | ${accent ? 'true  ' : 'false '} | ${slideActive ? 'true  ' : 'false '} | ${paramDump}`);
  
  // Update state
  if (hasNote) {
    prevSlideFlag = currSlide;
  } else if (isNoteOff) {
    prevSlideFlag = false;
  }
}

console.log('');
console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════');
console.log('FREQUENCY VALUES (what synth actually plays):');
console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════');
console.log('');
console.log('Formula: freq = 440 * 2^((midi - 69) / 12)');
console.log('');
console.log('Step | Note  | MIDI | Freq (Hz)     | Action');
console.log('-----|-------|------|---------------|--------');

prevSlideFlag = false;
lastGate = false;

for (const s of testPattern) {
  const midi = rootNote + s.key + (s.octave * 12);
  let xmNote;
  let flag2 = s.slide ? 0x02 : 0x00;
  
  if (s.gate) {
    xmNote = midi - 11;
    lastGate = true;
  } else {
    if (lastGate) {
      xmNote = 97;
      flag2 = 0;
    } else {
      xmNote = 0;
      flag2 = 0;
    }
    lastGate = false;
  }
  
  const hasNote = xmNote > 0 && xmNote !== 97;
  const isNoteOff = xmNote === 97;
  const currSlide = (flag2 & 0x02) !== 0;
  const slideActive = prevSlideFlag && hasNote;
  
  let noteName = '';
  let freqStr = '';
  let action = '';
  
  if (isNoteOff) {
    noteName = '===';
    freqStr = 'N/A';
    action = 'RELEASE';
  } else if (!hasNote) {
    noteName = '...';
    freqStr = 'N/A';
    action = 'EMPTY';
  } else {
    const actualMidi = xmNote + 11;
    noteName = midiToNoteName(actualMidi);
    const freq = 440 * Math.pow(2, (actualMidi - 69) / 12);
    freqStr = freq.toFixed(2);
    action = slideActive ? 'GLIDE TO' : 'ATTACK';
  }
  
  console.log(`${s.step.toString().padStart(4)} | ${noteName.padEnd(5)} | ${hasNote ? (xmNote + 11).toString().padStart(4) : ' -- '} | ${freqStr.padStart(13)} | ${action}`);
  
  // Update state
  if (hasNote) {
    prevSlideFlag = currSlide;
  } else if (isNoteOff) {
    prevSlideFlag = false;
  }
}

console.log('');
console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════');
console.log('COMPARISON SUMMARY (DEViLBOX vs DB303):');
console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════');
console.log('');
console.log('DB303 slide rule: prevStep.slide && prevStep.gate && currStep.gate');
console.log('DEViLBOX slide rule: previousSlideFlag && hasNote (where previousSlideFlag is set from previous row if hasNote)');
console.log('');
console.log('Step | DB303 prevGate | DB303 prevSlide | DB303 currGate | DB303 slide? | DV slideActive | Match?');
console.log('-----|----------------|-----------------|----------------|--------------|----------------|--------');

prevSlideFlag = false;
lastGate = false;

for (let i = 0; i < testPattern.length; i++) {
  const s = testPattern[i];
  const prev = i > 0 ? testPattern[i - 1] : null;
  
  const midi = rootNote + s.key + (s.octave * 12);
  let xmNote;
  let flag2 = s.slide ? 0x02 : 0x00;
  
  if (s.gate) {
    xmNote = midi - 11;
    lastGate = true;
  } else {
    if (lastGate) {
      xmNote = 97;
      flag2 = 0;
    } else {
      xmNote = 0;
      flag2 = 0;
    }
    lastGate = false;
  }
  
  const hasNote = xmNote > 0 && xmNote !== 97;
  const isNoteOff = xmNote === 97;
  const currSlide = (flag2 & 0x02) !== 0;
  const dvSlideActive = prevSlideFlag && hasNote;
  
  // DB303 calculation
  const db303PrevGate = prev ? prev.gate : false;
  const db303PrevSlide = prev ? prev.slide : false;
  const db303CurrGate = s.gate;
  const db303ShouldSlide = db303PrevSlide && db303PrevGate && db303CurrGate;
  
  const match = (dvSlideActive === db303ShouldSlide);
  
  console.log(`${i.toString().padStart(4)} | ${db303PrevGate ? '      1       ' : '      0       '} | ${db303PrevSlide ? '       1       ' : '       0       '} | ${db303CurrGate ? '      1       ' : '      0       '} | ${db303ShouldSlide ? '      1      ' : '      0      '} | ${dvSlideActive ? '       1       ' : '       0       '} | ${match ? '   ✓' : '  ❌ MISMATCH'}`);
  
  // Update DV state
  if (hasNote) {
    prevSlideFlag = currSlide;
  } else if (isNoteOff) {
    prevSlideFlag = false;
  }
}

console.log('');
console.log('════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════');
console.log('END OF BYTE-LEVEL TRACE');
console.log('════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════');
