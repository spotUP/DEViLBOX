// Source for the "amiga-standard-effects" help topic: Amiga native formats whose importer writes STANDARD
// effect ids (the ProTracker/FastTracker numbering) into the cells. Per format, the ids come from the literal
// `effTyp = <number>` / `effTyp: <number>` assignments found by grep in its parser(s) under
// src/lib/import/formats; src/utils/__tests__/amigaStandardEffects.test.ts re-reads those parsers and fails
// when a listed id is no longer written there. Names and parameter meaning come from FT2_EFFECT_DESCRIPTIONS
// (the table the editor shows). `fromTable: true` marks a parser that also sets effTyp from a variable or a
// per-format table, so its list can be incomplete. Gaps: thoughts/spot/2026-11-12_effect-mapping-gaps.md.
import { FT2_EFFECT_DESCRIPTIONS } from '../../../src/utils/ft2EffectDescriptions';

export const AMIGA_STANDARD_TOPIC = 'amiga-standard-effects';

export interface AmigaStandardRow {
  formatId: string;
  parsers: readonly string[];
  /** Literal standard effTyp ids the parser writes. */
  ids: readonly number[];
  /** The parser also sets effTyp from a variable or table: the list may be incomplete. */
  fromTable?: boolean;
}

export const AMIGA_STANDARD_ROWS: readonly AmigaStandardRow[] = [
  { formatId: 'deltaMusic2', parsers: ['DeltaMusic2Parser.ts'], ids: [1,2,3,15,16], fromTable: true },
  { formatId: 'fc', parsers: ['FCParser.ts'], ids: [1,2,4,15] },
  { formatId: 'soundmon', parsers: ['SoundMonParser.ts'], ids: [1,2,4,11,14,15], fromTable: true },
  { formatId: 'sidmon1', parsers: ['SidMon1Parser.ts'], ids: [3,15] },
  { formatId: 'jamcracker', parsers: ['JamCrackerParser.ts'], ids: [3,4,15] },
  { formatId: 'quadraComposer', parsers: ['QuadraComposerParser.ts'], ids: [], fromTable: true },
  { formatId: 'amosMusicBank', parsers: ['AMOSMusicBankParser.ts'], ids: [1,2,11,14,15], fromTable: true },
  { formatId: 'sonicArranger', parsers: ['SonicArrangerParser.ts'], ids: [11,13,14,15,16] },
  { formatId: 'inStereo2', parsers: ['InStereo2Parser.ts'], ids: [3,10,11,12,13,15] },
  { formatId: 'inStereo1', parsers: ['InStereo1Parser.ts'], ids: [12,15] },
  { formatId: 'tfmx', parsers: ['TFMXParser.ts'], ids: [3,4,10,13], fromTable: true },
  { formatId: 'artOfNoise', parsers: ['ArtOfNoiseParser.ts'], ids: [] },
  { formatId: 'digitalSymphony', parsers: ['DigitalSymphonyParser.ts'], ids: [3,4,5,6,7,8,9,11,12,13,14,15], fromTable: true },
  { formatId: 'graoumfTracker2', parsers: ['GraoumfTracker2Parser.ts'], ids: [1,2,3,4,7,8,10,11,12,13,14,15,20,27] },
  { formatId: 'symphoniePro', parsers: ['SymphonieProParser.ts'], ids: [1,2,3,4,7,9,10,15,27] },
  { formatId: 'digiBoosterPro', parsers: ['DigiBoosterProParser.ts'], ids: [], fromTable: true },
  { formatId: 'pumaTracker', parsers: ['PumaTrackerParser.ts'], ids: [1,2,12,15] },
  { formatId: 'synthesis', parsers: ['SynthesisParser.ts'], ids: [3,12,15] },
  { formatId: 'digitalSoundStudio', parsers: ['DigitalSoundStudioParser.ts'], ids: [1,2,3,11,12,15] },
  { formatId: 'chuckBiscuits', parsers: ['ChuckBiscuitsParser.ts'], ids: [14], fromTable: true },
  { formatId: 'musicLine', parsers: ['MusicLineParser.ts'], ids: [1,2,3,10,12,15], fromTable: true },
  { formatId: 'gameMusicCreator', parsers: ['GameMusicCreatorParser.ts'], ids: [], fromTable: true },
  { formatId: 'kris', parsers: ['KrisHatlelidParser.ts','KRISParser.ts'], ids: [], fromTable: true },
  { formatId: 'deltaMusic1', parsers: ['DeltaMusic1Parser.ts'], ids: [1,2,3,12,15], fromTable: true },
  { formatId: 'ams', parsers: ['AMSParser.ts'], ids: [], fromTable: true },
  { formatId: 'richardJoseph', parsers: ['RichardJosephParser.ts'], ids: [3,4,15] },
  { formatId: 'pt36', parsers: ['PT36Parser.ts'], ids: [], fromTable: true },
  { formatId: 'jeroenTel', parsers: ['JeroenTelParser.ts'], ids: [], fromTable: true },
  { formatId: 'zoundMonitor', parsers: ['ZoundMonitorParser.ts'], ids: [1,2,3] },
  { formatId: 'steveTurner', parsers: ['SteveTurnerParser.ts'], ids: [14], fromTable: true },
  { formatId: 'jochenHippelST', parsers: ['JochenHippelSTParser.ts'], ids: [], fromTable: true },
  { formatId: 'fashionTracker', parsers: ['FashionTrackerParser.ts'], ids: [], fromTable: true },
  { formatId: 'peterVerswyvelenPacker', parsers: ['PeterVerswyvelenPackerParser.ts'], ids: [], fromTable: true },
  { formatId: 'anders0land', parsers: ['Anders0landParser.ts'], ids: [], fromTable: true },
  { formatId: 'jochenHippel7V', parsers: ['JochenHippel7VParser.ts'], ids: [], fromTable: true },
  { formatId: 'midiLoriciel', parsers: ['MIDILoricielParser.ts'], ids: [], fromTable: true },
  { formatId: 'cheesecutter', parsers: ['CheeseCutterParser.ts'], ids: [12], fromTable: true },
  { formatId: 'stoneTracker', parsers: ['StoneTrackerParser.ts'], ids: [], fromTable: true },
  { formatId: 'ems', parsers: ['EMSParser.ts','EMSv6Parser.ts'], ids: [], fromTable: true },
  { formatId: 'hvl', parsers: ['HivelyParser.ts'], ids: [1,2,3,5,8,10,11,13,14,15], fromTable: true },
  { formatId: 'mugician', parsers: ['DigitalMugicianParser.ts'], ids: [1,2,3,14,15], fromTable: true },
  { formatId: 'iceTracker', parsers: ['ICEParser.ts'], ids: [], fromTable: true },
  { formatId: 'musicMaker4V', parsers: ['MusicMakerParser.ts'], ids: [15] },
  { formatId: 'musicMaker8V', parsers: ['MusicMakerParser.ts'], ids: [15] },
  { formatId: 'c64sid', parsers: ['SIDParser.ts'], ids: [15] },
  { formatId: 'imagesMusicSystem', parsers: ['IMSParser.ts'], ids: [4], fromTable: true },
];

/** effTyp 0..35 is the key 0-9 then A-Z in the editor's effect table. */
export const standardKey = (effTyp: number): string => effTyp.toString(36).toUpperCase();

const describeId = (effTyp: number): string => {
  const d = FT2_EFFECT_DESCRIPTIONS[standardKey(effTyp)];
  return d ? `${effTyp} (${d.command}, ${d.name}; parameter: ${d.parameters})` : `${effTyp} (no entry in the editor table)`;
};

const renderRow = (r: AmigaStandardRow): string => {
  const head = `### ${r.formatId} (parser: ${r.parsers.join(', ')})`;
  if (!r.ids.length) return `${head}\n\nNo literal effect id found in the parser: it sets effect numbers from a table or through another parser. Effect ids not documented.\n`;
  const note = r.fromTable ? '\nThe parser also sets effect ids from a table or variable; this list may be incomplete.\n' : '';
  return `${head}\n\n${r.ids.map((id) => `- effTyp ${describeId(id)}`).join('\n')}\n${note}`;
};

export const AMIGA_STANDARD_DOC = `# Amiga native formats mapped onto standard effect ids

Source: the importers in src/lib/import/formats (literal effTyp assignments) with names and parameters from the editor's effect table (src/utils/ft2EffectDescriptions.ts). These formats store ProTracker-style standard effects in the cell: effTyp is the standard id and eff is the operand. The format's own meaning of a native command is already folded into the standard id by the importer, so write the standard id with set_cells and the operand the standard table states.

Cell example: {"note":60,"instrument":1,"effTyp":15,"eff":6} sets speed 6.

Treat the lists below as "ids this importer is known to write", not as "the only ids the format can play": a row marked incomplete, or with no id found, needs a real song of that format as reference.

${AMIGA_STANDARD_ROWS.map(renderRow).join('\n')}
## Not verified

- Ids were found by grep in the parser source, not by playing each command.
- Zero is not listed: it is both arpeggio and the empty cell, and the parsers write it as the default.
`;
