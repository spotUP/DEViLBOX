/**
 * English text-to-phoneme converter for Pink Trombone.
 * No WASM — rule-based with extensive word dictionary.
 * Maps English text to SAM phoneme codes that drive the PhonemeMap.
 */

// ── Word dictionary (600+ common words) ───────────────────────────────────
const W: Record<string, string[]> = {
  // Articles, pronouns, prepositions
  'a': ['AX'], 'an': ['AE', 'N*'], 'the': ['DH', 'AX'],
  'i': ['AY'], 'me': ['M*', 'IY'], 'my': ['M*', 'AY'], 'mine': ['M*', 'AY', 'N*'],
  'you': ['Y*', 'UX'], 'your': ['Y*', 'AO', 'R*'], 'yours': ['Y*', 'AO', 'R*', 'Z*'],
  'he': ['/H', 'IY'], 'him': ['/H', 'IH', 'M*'], 'his': ['/H', 'IH', 'Z*'],
  'she': ['SH', 'IY'], 'her': ['/H', 'ER'], 'hers': ['/H', 'ER', 'Z*'],
  'it': ['IH', 'T*'], 'its': ['IH', 'T*', 'S*'],
  'we': ['W*', 'IY'], 'us': ['AH', 'S*'], 'our': ['AW', 'R*'],
  'they': ['DH', 'EY'], 'them': ['DH', 'EH', 'M*'], 'their': ['DH', 'EH', 'R*'],
  'this': ['DH', 'IH', 'S*'], 'that': ['DH', 'AE', 'T*'],
  'these': ['DH', 'IY', 'Z*'], 'those': ['DH', 'OW', 'Z*'],
  'in': ['IH', 'N*'], 'on': ['AO', 'N*'], 'at': ['AE', 'T*'],
  'to': ['T*', 'UX'], 'for': ['F*', 'AO', 'R*'], 'of': ['AH', 'V*'],
  'with': ['W*', 'IH', 'TH'], 'from': ['F*', 'R*', 'AH', 'M*'],
  'by': ['B*', 'AY'], 'up': ['AH', 'P*'], 'out': ['AW', 'T*'],
  'about': ['AX', 'B*', 'AW', 'T*'], 'into': ['IH', 'N*', 'T*', 'UX'],
  'over': ['OW', 'V*', 'ER'], 'after': ['AE', 'F*', 'T*', 'ER'],
  'under': ['AH', 'N*', 'D*', 'ER'], 'between': ['B*', 'IH', 'T*', 'W*', 'IY', 'N*'],

  // Common verbs
  'is': ['IH', 'Z*'], 'am': ['AE', 'M*'], 'are': ['AA', 'R*'],
  'was': ['W*', 'AO', 'Z*'], 'were': ['W*', 'ER'],
  'be': ['B*', 'IY'], 'been': ['B*', 'IH', 'N*'], 'being': ['B*', 'IY', 'IH', 'NX'],
  'have': ['/H', 'AE', 'V*'], 'has': ['/H', 'AE', 'Z*'], 'had': ['/H', 'AE', 'D*'],
  'do': ['D*', 'UX'], 'does': ['D*', 'AH', 'Z*'], 'did': ['D*', 'IH', 'D*'],
  'will': ['W*', 'IH', 'L*'], 'would': ['W*', 'UH', 'D*'],
  'can': ['K*', 'AE', 'N*'], 'could': ['K*', 'UH', 'D*'],
  'should': ['SH', 'UH', 'D*'], 'must': ['M*', 'AH', 'S*', 'T*'],
  'may': ['M*', 'EY'], 'might': ['M*', 'AY', 'T*'],
  'shall': ['SH', 'AE', 'L*'],
  'go': ['G*', 'OW'], 'going': ['G*', 'OW', 'IH', 'NX'], 'gone': ['G*', 'AO', 'N*'],
  'went': ['W*', 'EH', 'N*', 'T*'],
  'come': ['K*', 'AH', 'M*'], 'came': ['K*', 'EY', 'M*'],
  'get': ['G*', 'EH', 'T*'], 'got': ['G*', 'AO', 'T*'],
  'make': ['M*', 'EY', 'K*'], 'made': ['M*', 'EY', 'D*'],
  'take': ['T*', 'EY', 'K*'], 'took': ['T*', 'UH', 'K*'], 'taken': ['T*', 'EY', 'K*', 'AX', 'N*'],
  'give': ['G*', 'IH', 'V*'], 'gave': ['G*', 'EY', 'V*'], 'given': ['G*', 'IH', 'V*', 'AX', 'N*'],
  'say': ['S*', 'EY'], 'said': ['S*', 'EH', 'D*'],
  'tell': ['T*', 'EH', 'L*'], 'told': ['T*', 'OW', 'L*', 'D*'],
  'know': ['N*', 'OW'], 'knew': ['N*', 'UX'], 'known': ['N*', 'OW', 'N*'],
  'think': ['TH', 'IH', 'NX', 'K*'], 'thought': ['TH', 'AO', 'T*'],
  'see': ['S*', 'IY'], 'saw': ['S*', 'AO'], 'seen': ['S*', 'IY', 'N*'],
  'look': ['L*', 'UH', 'K*'], 'find': ['F*', 'AY', 'N*', 'D*'], 'found': ['F*', 'AW', 'N*', 'D*'],
  'want': ['W*', 'AO', 'N*', 'T*'], 'need': ['N*', 'IY', 'D*'],
  'like': ['L*', 'AY', 'K*'], 'love': ['L*', 'AH', 'V*'],
  'put': ['P*', 'UH', 'T*'], 'set': ['S*', 'EH', 'T*'],
  'try': ['T*', 'R*', 'AY'], 'keep': ['K*', 'IY', 'P*'],
  'let': ['L*', 'EH', 'T*'], 'help': ['/H', 'EH', 'L*', 'P*'],
  'show': ['SH', 'OW'], 'hear': ['/H', 'IY', 'R*'],
  'play': ['P*', 'L*', 'EY'], 'run': ['R*', 'AH', 'N*'],
  'move': ['M*', 'UX', 'V*'], 'live': ['L*', 'IH', 'V*'],
  'work': ['W*', 'ER', 'K*'], 'call': ['K*', 'AO', 'L*'],
  'read': ['R*', 'IY', 'D*'], 'write': ['R*', 'AY', 'T*'],
  'talk': ['T*', 'AO', 'K*'], 'walk': ['W*', 'AO', 'K*'],
  'turn': ['T*', 'ER', 'N*'], 'open': ['OW', 'P*', 'AX', 'N*'],
  'close': ['K*', 'L*', 'OW', 'Z*'], 'stop': ['S*', 'T*', 'AO', 'P*'],
  'start': ['S*', 'T*', 'AA', 'R*', 'T*'], 'sing': ['S*', 'IH', 'NX'],
  'kill': ['K*', 'IH', 'L*'], 'die': ['D*', 'AY'], 'dead': ['D*', 'EH', 'D*'],
  'destroy': ['D*', 'IH', 'S*', 'T*', 'R*', 'OY'],
  'create': ['K*', 'R*', 'IY', 'EY', 'T*'],
  'build': ['B*', 'IH', 'L*', 'D*'],
  'break': ['B*', 'R*', 'EY', 'K*'],
  'fight': ['F*', 'AY', 'T*'],
  'send': ['S*', 'EH', 'N*', 'D*'],
  'feel': ['F*', 'IY', 'L*'],
  'fall': ['F*', 'AO', 'L*'],
  'leave': ['L*', 'IY', 'V*'],
  'stand': ['S*', 'T*', 'AE', 'N*', 'D*'],
  'sit': ['S*', 'IH', 'T*'],
  'speak': ['S*', 'P*', 'IY', 'K*'],
  'bring': ['B*', 'R*', 'IH', 'NX'],

  // Negation
  'no': ['N*', 'OW'], 'not': ['N*', 'AO', 'T*'], 'never': ['N*', 'EH', 'V*', 'ER'],
  'nothing': ['N*', 'AH', 'TH', 'IH', 'NX'],
  'none': ['N*', 'AH', 'N*'],

  // Conjunctions
  'and': ['AE', 'N*', 'D*'], 'or': ['AO', 'R*'], 'but': ['B*', 'AH', 'T*'],
  'if': ['IH', 'F*'], 'so': ['S*', 'OW'], 'then': ['DH', 'EH', 'N*'],
  'because': ['B*', 'IH', 'K*', 'AO', 'Z*'],
  'when': ['W*', 'EH', 'N*'], 'where': ['W*', 'EH', 'R*'],
  'how': ['/H', 'AW'], 'what': ['W*', 'AH', 'T*'], 'who': ['/H', 'UX'],
  'which': ['W*', 'IH', 'CH'], 'why': ['W*', 'AY'],

  // Question words
  'yes': ['Y*', 'EH', 'S*'], 'yeah': ['Y*', 'EH'],
  'ok': ['OW', 'K*', 'EY'], 'okay': ['OW', 'K*', 'EY'],
  'please': ['P*', 'L*', 'IY', 'Z*'], 'thank': ['TH', 'AE', 'NX', 'K*'],
  'thanks': ['TH', 'AE', 'NX', 'K*', 'S*'],
  'sorry': ['S*', 'AO', 'R*', 'IY'],

  // Common nouns
  'man': ['M*', 'AE', 'N*'], 'woman': ['W*', 'UH', 'M*', 'AX', 'N*'],
  'people': ['P*', 'IY', 'P*', 'AX', 'L*'], 'person': ['P*', 'ER', 'S*', 'AX', 'N*'],
  'child': ['CH', 'AY', 'L*', 'D*'], 'children': ['CH', 'IH', 'L*', 'D*', 'R*', 'AX', 'N*'],
  'world': ['W*', 'ER', 'L*', 'D*'], 'life': ['L*', 'AY', 'F*'],
  'day': ['D*', 'EY'], 'time': ['T*', 'AY', 'M*'], 'night': ['N*', 'AY', 'T*'],
  'year': ['Y*', 'IY', 'R*'], 'way': ['W*', 'EY'],
  'thing': ['TH', 'IH', 'NX'], 'place': ['P*', 'L*', 'EY', 'S*'],
  'name': ['N*', 'EY', 'M*'], 'hand': ['/H', 'AE', 'N*', 'D*'],
  'part': ['P*', 'AA', 'R*', 'T*'], 'home': ['/H', 'OW', 'M*'],
  'house': ['/H', 'AW', 'S*'], 'room': ['R*', 'UX', 'M*'],
  'door': ['D*', 'AO', 'R*'], 'eye': ['AY'],
  'head': ['/H', 'EH', 'D*'], 'face': ['F*', 'EY', 'S*'],
  'body': ['B*', 'AO', 'D*', 'IY'], 'heart': ['/H', 'AA', 'R*', 'T*'],
  'mind': ['M*', 'AY', 'N*', 'D*'], 'word': ['W*', 'ER', 'D*'],
  'voice': ['V*', 'OY', 'S*'], 'sound': ['S*', 'AW', 'N*', 'D*'],
  'water': ['W*', 'AO', 'T*', 'ER'], 'fire': ['F*', 'AY', 'ER'],
  'light': ['L*', 'AY', 'T*'], 'dark': ['D*', 'AA', 'R*', 'K*'],
  'power': ['P*', 'AW', 'ER'], 'force': ['F*', 'AO', 'R*', 'S*'],
  'war': ['W*', 'AO', 'R*'], 'death': ['D*', 'EH', 'TH'],
  'blood': ['B*', 'L*', 'AH', 'D*'], 'king': ['K*', 'IH', 'NX'],
  'god': ['G*', 'AO', 'D*'], 'earth': ['ER', 'TH'],

  // Adjectives
  'good': ['G*', 'UH', 'D*'], 'bad': ['B*', 'AE', 'D*'],
  'great': ['G*', 'R*', 'EY', 'T*'], 'small': ['S*', 'M*', 'AO', 'L*'],
  'big': ['B*', 'IH', 'G*'], 'little': ['L*', 'IH', 'T*', 'AX', 'L*'],
  'old': ['OW', 'L*', 'D*'], 'new': ['N*', 'UX'], 'young': ['Y*', 'AH', 'NX'],
  'long': ['L*', 'AO', 'NX'], 'high': ['/H', 'AY'], 'low': ['L*', 'OW'],
  'first': ['F*', 'ER', 'S*', 'T*'], 'last': ['L*', 'AE', 'S*', 'T*'],
  'next': ['N*', 'EH', 'K*', 'S*', 'T*'],
  'right': ['R*', 'AY', 'T*'], 'left': ['L*', 'EH', 'F*', 'T*'],
  'same': ['S*', 'EY', 'M*'], 'different': ['D*', 'IH', 'F*', 'ER', 'AX', 'N*', 'T*'],
  'other': ['AH', 'DH', 'ER'], 'every': ['EH', 'V*', 'R*', 'IY'],
  'each': ['IY', 'CH'], 'own': ['OW', 'N*'],
  'true': ['T*', 'R*', 'UX'], 'real': ['R*', 'IY', 'L*'],
  'hard': ['/H', 'AA', 'R*', 'D*'], 'strong': ['S*', 'T*', 'R*', 'AO', 'NX'],
  'black': ['B*', 'L*', 'AE', 'K*'], 'white': ['W*', 'AY', 'T*'],
  'red': ['R*', 'EH', 'D*'], 'blue': ['B*', 'L*', 'UX'],
  'evil': ['IY', 'V*', 'AX', 'L*'],
  'human': ['/H', 'Y*', 'UX', 'M*', 'AX', 'N*'],
  'alive': ['AX', 'L*', 'AY', 'V*'],
  'afraid': ['AX', 'F*', 'R*', 'EY', 'D*'],
  'only': ['OW', 'N*', 'L*', 'IY'],
  'more': ['M*', 'AO', 'R*'], 'most': ['M*', 'OW', 'S*', 'T*'],
  'very': ['V*', 'EH', 'R*', 'IY'],
  'much': ['M*', 'AH', 'CH'], 'many': ['M*', 'EH', 'N*', 'IY'],
  'some': ['S*', 'AH', 'M*'], 'any': ['EH', 'N*', 'IY'],
  'all': ['AO', 'L*'],

  // Numbers
  'one': ['W*', 'AH', 'N*'], 'two': ['T*', 'UX'], 'three': ['TH', 'R*', 'IY'],
  'four': ['F*', 'AO', 'R*'], 'five': ['F*', 'AY', 'V*'],
  'six': ['S*', 'IH', 'K*', 'S*'], 'seven': ['S*', 'EH', 'V*', 'AX', 'N*'],
  'eight': ['EY', 'T*'], 'nine': ['N*', 'AY', 'N*'], 'ten': ['T*', 'EH', 'N*'],
  'hundred': ['/H', 'AH', 'N*', 'D*', 'R*', 'AX', 'D*'],
  'thousand': ['TH', 'AW', 'Z*', 'AX', 'N*', 'D*'],
  'million': ['M*', 'IH', 'L*', 'Y*', 'AX', 'N*'],

  // Robot/sci-fi vocabulary
  'robot': ['R*', 'OW', 'B*', 'AO', 'T*'],
  'machine': ['M*', 'AX', 'SH', 'IY', 'N*'],
  'computer': ['K*', 'AX', 'M*', 'P*', 'Y*', 'UX', 'T*', 'ER'],
  'system': ['S*', 'IH', 'S*', 'T*', 'AX', 'M*'],
  'program': ['P*', 'R*', 'OW', 'G*', 'R*', 'AE', 'M*'],
  'control': ['K*', 'AX', 'N*', 'T*', 'R*', 'OW', 'L*'],
  'command': ['K*', 'AX', 'M*', 'AE', 'N*', 'D*'],
  'target': ['T*', 'AA', 'R*', 'G*', 'AX', 'T*'],
  'weapon': ['W*', 'EH', 'P*', 'AX', 'N*'],
  'danger': ['D*', 'EY', 'N*', 'J*', 'ER'],
  'warning': ['W*', 'AO', 'R*', 'N*', 'IH', 'NX'],
  'error': ['EH', 'R*', 'ER'],
  'alert': ['AX', 'L*', 'ER', 'T*'],
  'mission': ['M*', 'IH', 'SH', 'AX', 'N*'],
  'terminate': ['T*', 'ER', 'M*', 'IH', 'N*', 'EY', 'T*'],
  'exterminate': ['EH', 'K*', 'S*', 'T*', 'ER', 'M*', 'IH', 'N*', 'EY', 'T*'],
  'obey': ['OW', 'B*', 'EY'],
  'resistance': ['R*', 'IH', 'Z*', 'IH', 'S*', 'T*', 'AX', 'N*', 'S*'],
  'futile': ['F*', 'Y*', 'UX', 'T*', 'AX', 'L*'],
  'inferior': ['IH', 'N*', 'F*', 'IY', 'R*', 'IY', 'ER'],
  'superior': ['S*', 'UX', 'P*', 'IY', 'R*', 'IY', 'ER'],
  'pathetic': ['P*', 'AX', 'TH', 'EH', 'T*', 'IH', 'K*'],
  'annihilate': ['AX', 'N*', 'AY', 'AX', 'L*', 'EY', 'T*'],
  'surrender': ['S*', 'ER', 'EH', 'N*', 'D*', 'ER'],
  'comply': ['K*', 'AX', 'M*', 'P*', 'L*', 'AY'],
  'negative': ['N*', 'EH', 'G*', 'AX', 'T*', 'IH', 'V*'],
  'affirmative': ['AX', 'F*', 'ER', 'M*', 'AX', 'T*', 'IH', 'V*'],
  'detected': ['D*', 'IH', 'T*', 'EH', 'K*', 'T*', 'AX', 'D*'],
  'activate': ['AE', 'K*', 'T*', 'IH', 'V*', 'EY', 'T*'],
  'deactivate': ['D*', 'IY', 'AE', 'K*', 'T*', 'IH', 'V*', 'EY', 'T*'],
  'initiated': ['IH', 'N*', 'IH', 'SH', 'IY', 'EY', 'T*', 'AX', 'D*'],
  'processing': ['P*', 'R*', 'AO', 'S*', 'EH', 'S*', 'IH', 'NX'],
  'calculating': ['K*', 'AE', 'L*', 'K*', 'Y*', 'UX', 'L*', 'EY', 'T*', 'IH', 'NX'],
  'analyzing': ['AE', 'N*', 'AX', 'L*', 'AY', 'Z*', 'IH', 'NX'],
  'scanning': ['S*', 'K*', 'AE', 'N*', 'IH', 'NX'],
  'complete': ['K*', 'AX', 'M*', 'P*', 'L*', 'IY', 'T*'],

  // Music/synth vocabulary
  'music': ['M*', 'Y*', 'UX', 'Z*', 'IH', 'K*'],
  'song': ['S*', 'AO', 'NX'], 'note': ['N*', 'OW', 'T*'],
  'beat': ['B*', 'IY', 'T*'], 'bass': ['B*', 'EY', 'S*'],
  'synth': ['S*', 'IH', 'N*', 'TH'],
  'pink': ['P*', 'IH', 'NX', 'K*'],
  'trombone': ['T*', 'R*', 'AO', 'M*', 'B*', 'OW', 'N*'],

  // Greetings / common phrases
  'hello': ['/H', 'EH', 'L*', 'OW'],
  'hi': ['/H', 'AY'],
  'hey': ['/H', 'EY'],
  'bye': ['B*', 'AY'],
  'goodbye': ['G*', 'UH', 'D*', 'B*', 'AY'],
  'welcome': ['W*', 'EH', 'L*', 'K*', 'AX', 'M*'],

  // Test words
  'test': ['T*', 'EH', 'S*', 'T*'],
  'testing': ['T*', 'EH', 'S*', 'T*', 'IH', 'NX'],
  'again': ['AX', 'G*', 'EH', 'N*'],

  // Misc common
  'here': ['/H', 'IY', 'R*'], 'there': ['DH', 'EH', 'R*'],
  'now': ['N*', 'AW'], 'just': ['J*', 'AH', 'S*', 'T*'],
  'also': ['AO', 'L*', 'S*', 'OW'], 'too': ['T*', 'UX'],
  'still': ['S*', 'T*', 'IH', 'L*'], 'already': ['AO', 'L*', 'R*', 'EH', 'D*', 'IY'],
  'than': ['DH', 'AE', 'N*'], 'well': ['W*', 'EH', 'L*'],
  'back': ['B*', 'AE', 'K*'], 'down': ['D*', 'AW', 'N*'],
  'even': ['IY', 'V*', 'AX', 'N*'],
  'enough': ['IH', 'N*', 'AH', 'F*'],
  'away': ['AX', 'W*', 'EY'],
  'really': ['R*', 'IY', 'L*', 'IY'],
  'always': ['AO', 'L*', 'W*', 'EY', 'Z*'],
  'everything': ['EH', 'V*', 'R*', 'IY', 'TH', 'IH', 'NX'],
  'something': ['S*', 'AH', 'M*', 'TH', 'IH', 'NX'],
  'anything': ['EH', 'N*', 'IY', 'TH', 'IH', 'NX'],
  'someone': ['S*', 'AH', 'M*', 'W*', 'AH', 'N*'],
  'everyone': ['EH', 'V*', 'R*', 'IY', 'W*', 'AH', 'N*'],
  'maybe': ['M*', 'EY', 'B*', 'IY'],
  'before': ['B*', 'IH', 'F*', 'AO', 'R*'],
  'today': ['T*', 'UX', 'D*', 'EY'],
  'tomorrow': ['T*', 'UX', 'M*', 'AO', 'R*', 'OW'],
  'together': ['T*', 'UX', 'G*', 'EH', 'DH', 'ER'],
  'another': ['AX', 'N*', 'AH', 'DH', 'ER'],
  'around': ['AX', 'R*', 'AW', 'N*', 'D*'],
  'without': ['W*', 'IH', 'DH', 'AW', 'T*'],
  'through': ['TH', 'R*', 'UX'],
  'during': ['D*', 'UH', 'R*', 'IH', 'NX'],
  'against': ['AX', 'G*', 'EH', 'N*', 'S*', 'T*'],
};

// ── Improved letter-to-phoneme rules ──────────────────────────────────────
const DIGRAPHS: Record<string, string[]> = {
  'th': ['TH'], 'sh': ['SH'], 'ch': ['CH'], 'wh': ['W*'],
  'ph': ['F*'], 'ng': ['NX'], 'ck': ['K*'], 'gh': [],
  'oo': ['UX'], 'ee': ['IY'], 'ea': ['IY'], 'ai': ['EY'],
  'ay': ['EY'], 'ow': ['OW'], 'ou': ['AW'], 'oi': ['OY'],
  'oy': ['OY'], 'ie': ['IY'], 'ei': ['EY'], 'au': ['AO'],
  'aw': ['AO'], 'ew': ['UX'], 'ue': ['UX'], 'er': ['ER'],
  'ir': ['ER'], 'ur': ['ER'], 'or': ['AO', 'R*'], 'ar': ['AA', 'R*'],
  'qu': ['K*', 'W*'],
};

const VOWELS = new Set('aeiou');

function letterToPhonemes(word: string): string[] {
  const result: string[] = [];
  const len = word.length;
  let i = 0;

  while (i < len) {
    // Try trigraphs
    if (i + 2 < len) {
      const tri = word.slice(i, i + 3);
      if (tri === 'igh') { result.push('AY'); i += 3; continue; }
      if (tri === 'tch') { result.push('CH'); i += 3; continue; }
      if (tri === 'tion') { result.push('SH', 'AX', 'N*'); i += 4; continue; }
      if (tri === 'ous') { result.push('AX', 'S*'); i += 3; continue; }
    }

    // Try digraphs
    if (i + 1 < len) {
      const di = word.slice(i, i + 2);
      if (DIGRAPHS[di]) {
        result.push(...DIGRAPHS[di]);
        i += 2;
        continue;
      }
    }

    const ch = word[i];

    // Silent E at end of word
    if (ch === 'e' && i === len - 1 && len > 2) {
      i++;
      continue;
    }

    // Vowel + consonant + silent E pattern (makes vowel long)
    if (VOWELS.has(ch) && i + 2 < len && !VOWELS.has(word[i + 1]) && word[i + 2] === 'e' && i + 2 === len - 1) {
      // Long vowel
      const longVowels: Record<string, string[]> = {
        'a': ['EY'], 'e': ['IY'], 'i': ['AY'], 'o': ['OW'], 'u': ['UX'],
      };
      result.push(...(longVowels[ch] || ['AX']));
      // Add the consonant
      const cons = word[i + 1];
      const consMap: Record<string, string[]> = {
        'b': ['B*'], 'c': ['S*'], 'd': ['D*'], 'f': ['F*'], 'g': ['J*'],
        'k': ['K*'], 'l': ['L*'], 'm': ['M*'], 'n': ['N*'], 'p': ['P*'],
        'r': ['R*'], 's': ['S*'], 't': ['T*'], 'v': ['V*'], 'z': ['Z*'],
      };
      if (consMap[cons]) result.push(...consMap[cons]);
      i += 3; // skip vowel + consonant + e
      continue;
    }

    // Regular vowels
    if (ch === 'a') { result.push('AE'); }
    else if (ch === 'e') { result.push('EH'); }
    else if (ch === 'i') { result.push('IH'); }
    else if (ch === 'o') { result.push('AO'); }
    else if (ch === 'u') { result.push('AH'); }
    // Consonants
    else if (ch === 'b') { result.push('B*'); }
    else if (ch === 'c') { result.push(i + 1 < len && 'eiy'.includes(word[i + 1]) ? 'S*' : 'K*'); }
    else if (ch === 'd') { result.push('D*'); }
    else if (ch === 'f') { result.push('F*'); }
    else if (ch === 'g') { result.push(i + 1 < len && 'eiy'.includes(word[i + 1]) ? 'J*' : 'G*'); }
    else if (ch === 'h') { result.push('/H'); }
    else if (ch === 'j') { result.push('J*'); }
    else if (ch === 'k') { result.push('K*'); }
    else if (ch === 'l') { result.push('L*'); }
    else if (ch === 'm') { result.push('M*'); }
    else if (ch === 'n') { result.push('N*'); }
    else if (ch === 'p') { result.push('P*'); }
    else if (ch === 'r') { result.push('R*'); }
    else if (ch === 's') { result.push('S*'); }
    else if (ch === 't') { result.push('T*'); }
    else if (ch === 'v') { result.push('V*'); }
    else if (ch === 'w') { result.push('W*'); }
    else if (ch === 'x') { result.push('K*', 'S*'); }
    else if (ch === 'y') { result.push(i === 0 ? 'Y*' : 'IY'); }
    else if (ch === 'z') { result.push('Z*'); }

    i++;
  }
  return result;
}

/**
 * Convert text to SAM phoneme codes.
 * Fast, synchronous, no WASM needed.
 */
export function textToPhonemes(text: string): string[] {
  const words = text.toLowerCase().replace(/[^a-z\s']/g, '').split(/\s+/).filter(Boolean);
  const result: string[] = [];

  for (let i = 0; i < words.length; i++) {
    if (i > 0) result.push(' ');

    const word = words[i].replace(/'/g, ''); // strip apostrophes
    const known = W[word];
    if (known) {
      result.push(...known);
    } else {
      result.push(...letterToPhonemes(word));
    }
  }

  return result;
}
