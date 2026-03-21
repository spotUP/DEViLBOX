/**
 * Simple English text-to-phoneme converter for Pink Trombone.
 * No WASM, no heavy dependencies — pure lookup-based.
 * Maps common English words and letter patterns to SAM phoneme codes.
 */

// Common word pronunciations (SAM codes)
const WORD_MAP: Record<string, string[]> = {
  'a':       ['AX'],
  'the':     ['DH', 'AX'],
  'is':      ['IH', 'Z*'],
  'it':      ['IH', 'T*'],
  'in':      ['IH', 'N*'],
  'to':      ['T*', 'UX'],
  'and':     ['AE', 'N*', 'D*'],
  'of':      ['AH', 'V*'],
  'that':    ['DH', 'AE', 'T*'],
  'this':    ['DH', 'IH', 'S*'],
  'for':     ['F*', 'AO', 'R*'],
  'you':     ['Y*', 'UX'],
  'with':    ['W*', 'IH', 'TH'],
  'not':     ['N*', 'AO', 'T*'],
  'are':     ['AA', 'R*'],
  'but':     ['B*', 'AH', 'T*'],
  'have':    ['EH', 'AE', 'V*'],
  'from':    ['F*', 'R*', 'AH', 'M*'],
  'or':      ['AO', 'R*'],
  'be':      ['B*', 'IY'],
  'was':     ['W*', 'AO', 'Z*'],
  'at':      ['AE', 'T*'],
  'all':     ['AO', 'L*'],
  'can':     ['K*', 'AE', 'N*'],
  'had':     ['EH', 'AE', 'D*'],
  'her':     ['ER', 'R*'],
  'there':   ['DH', 'EH', 'R*'],
  'one':     ['W*', 'AH', 'N*'],
  'do':      ['D*', 'UX'],
  'my':      ['M*', 'AY'],
  'me':      ['M*', 'IY'],
  'we':      ['W*', 'IY'],
  'he':      ['IY'],
  'she':     ['SH', 'IY'],
  'what':    ['W*', 'AH', 'T*'],
  'no':      ['N*', 'OW'],
  'so':      ['S*', 'OW'],
  'up':      ['AH', 'P*'],
  'out':     ['AW', 'T*'],
  'if':      ['IH', 'F*'],
  'go':      ['G*', 'OW'],
  'how':     ['EH', 'AW'],
  'yes':     ['Y*', 'EH', 'S*'],
  'hello':   ['EH', 'EH', 'L*', 'OW'],
  'world':   ['W*', 'ER', 'L*', 'D*'],
  'love':    ['L*', 'AH', 'V*'],
  'good':    ['G*', 'UH', 'D*'],
  'bad':     ['B*', 'AE', 'D*'],
  'man':     ['M*', 'AE', 'N*'],
  'day':     ['D*', 'EY'],
  'time':    ['T*', 'AY', 'M*'],
  'come':    ['K*', 'AH', 'M*'],
  'make':    ['M*', 'EY', 'K*'],
  'like':    ['L*', 'AY', 'K*'],
  'just':    ['J*', 'AH', 'S*', 'T*'],
  'know':    ['N*', 'OW'],
  'take':    ['T*', 'EY', 'K*'],
  'people':  ['P*', 'IY', 'P*', 'AX', 'L*'],
  'think':   ['TH', 'IH', 'NX', 'K*'],
  'say':     ['S*', 'EY'],
  'get':     ['G*', 'EH', 'T*'],
  'see':     ['S*', 'IY'],
  'look':    ['L*', 'UH', 'K*'],
  'way':     ['W*', 'EY'],
  'more':    ['M*', 'AO', 'R*'],
  'will':    ['W*', 'IH', 'L*'],
  'now':     ['N*', 'AW'],
  'find':    ['F*', 'AY', 'N*', 'D*'],
  'here':    ['IY', 'R*'],
  'thing':   ['TH', 'IH', 'NX'],
  'give':    ['G*', 'IH', 'V*'],
  'tell':    ['T*', 'EH', 'L*'],
  'help':    ['EH', 'EH', 'L*', 'P*'],
  'talk':    ['T*', 'AO', 'K*'],
  'test':    ['T*', 'EH', 'S*', 'T*'],
  'sing':    ['S*', 'IH', 'NX'],
  'song':    ['S*', 'AO', 'NX'],
  'play':    ['P*', 'L*', 'EY'],
  'stop':    ['S*', 'T*', 'AO', 'P*'],
  'start':   ['S*', 'T*', 'AA', 'R*', 'T*'],
  'name':    ['N*', 'EY', 'M*'],
  'robot':   ['R*', 'OW', 'B*', 'AO', 'T*'],
  'voice':   ['V*', 'OY', 'S*'],
  'sound':   ['S*', 'AW', 'N*', 'D*'],
  'music':   ['M*', 'Y*', 'UX', 'Z*', 'IH', 'K*'],
  'pink':    ['P*', 'IH', 'NX', 'K*'],
  'trombone':['T*', 'R*', 'AO', 'M*', 'B*', 'OW', 'N*'],
  'i':       ['AY'],
};

// Letter-to-phoneme rules (fallback for unknown words)
const DIGRAPHS: Record<string, string[]> = {
  'th': ['TH'], 'sh': ['SH'], 'ch': ['CH'], 'wh': ['W*'],
  'ph': ['F*'], 'ng': ['NX'], 'ck': ['K*'], 'gh': [''],
  'oo': ['UX'], 'ee': ['IY'], 'ea': ['IY'], 'ai': ['EY'],
  'ay': ['EY'], 'ow': ['OW'], 'ou': ['AW'], 'oi': ['OY'],
  'oy': ['OY'], 'ie': ['IY'], 'ei': ['EY'], 'au': ['AO'],
  'aw': ['AO'], 'ew': ['UX'], 'ue': ['UX'],
};

const SINGLE_LETTERS: Record<string, string[]> = {
  'a': ['AE'], 'b': ['B*'], 'c': ['K*'], 'd': ['D*'],
  'e': ['EH'], 'f': ['F*'], 'g': ['G*'], 'h': ['/H'],
  'i': ['IH'], 'j': ['J*'], 'k': ['K*'], 'l': ['L*'],
  'm': ['M*'], 'n': ['N*'], 'o': ['AO'], 'p': ['P*'],
  'q': ['K*', 'W*'], 'r': ['R*'], 's': ['S*'], 't': ['T*'],
  'u': ['AH'], 'v': ['V*'], 'w': ['W*'], 'x': ['K*', 'S*'],
  'y': ['Y*'], 'z': ['Z*'],
};

function letterToPhonemes(word: string): string[] {
  const result: string[] = [];
  let i = 0;
  while (i < word.length) {
    if (i + 1 < word.length) {
      const digraph = word.slice(i, i + 2);
      if (DIGRAPHS[digraph]) {
        const ph = DIGRAPHS[digraph];
        if (ph.length > 0 && ph[0] !== '') result.push(...ph);
        i += 2;
        continue;
      }
    }
    const ch = word[i];
    if (SINGLE_LETTERS[ch]) {
      result.push(...SINGLE_LETTERS[ch]);
    }
    i++;
  }
  return result;
}

/**
 * Convert text to SAM phoneme codes using simple lookup.
 * Fast, synchronous, no WASM needed.
 */
export function textToPhonemes(text: string): string[] {
  const words = text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
  const result: string[] = [];

  for (let w = 0; w < words.length; w++) {
    if (w > 0) result.push(' '); // word boundary pause

    const word = words[w];
    const known = WORD_MAP[word];
    if (known) {
      result.push(...known);
    } else {
      result.push(...letterToPhonemes(word));
    }
  }

  return result;
}
