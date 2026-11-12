# Amiga native formats mapped onto standard effect ids

Source: the importers in src/lib/import/formats (literal effTyp assignments) with names and parameters from the editor's effect table (src/utils/ft2EffectDescriptions.ts). These formats store ProTracker-style standard effects in the cell: effTyp is the standard id and eff is the operand. The format's own meaning of a native command is already folded into the standard id by the importer, so write the standard id with set_cells and the operand the standard table states.

Cell example: {"note":60,"instrument":1,"effTyp":15,"eff":6} sets speed 6.

Treat the lists below as "ids this importer is known to write", not as "the only ids the format can play": a row marked incomplete, or with no id found, needs a real song of that format as reference.

### deltaMusic2 (parser: DeltaMusic2Parser.ts)

- effTyp 1 (1xx, Pitch Slide Up; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 2 (2xx, Pitch Slide Down; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 3 (3xx, Tone Portamento; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 15 (Fxx, Set Speed/BPM; parameter: xx=speed/BPM (01-1F=speed, 20-FF=BPM))
- effTyp 16 (Gxx, Set Global Volume; parameter: xx=volume (00-40 hex, 64 decimal))

The parser also sets effect ids from a table or variable; this list may be incomplete.

### fc (parser: FCParser.ts)

- effTyp 1 (1xx, Pitch Slide Up; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 2 (2xx, Pitch Slide Down; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 4 (4xy, Vibrato; parameter: x=speed (0-F hex), y=depth (0-F hex))
- effTyp 15 (Fxx, Set Speed/BPM; parameter: xx=speed/BPM (01-1F=speed, 20-FF=BPM))

### soundmon (parser: SoundMonParser.ts)

- effTyp 1 (1xx, Pitch Slide Up; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 2 (2xx, Pitch Slide Down; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 4 (4xy, Vibrato; parameter: x=speed (0-F hex), y=depth (0-F hex))
- effTyp 11 (Bxx, Position Jump; parameter: xx=position (00-FF hex))
- effTyp 14 (Exy, Extended Command; parameter: x=sub-command (0-F), y=parameter)
- effTyp 15 (Fxx, Set Speed/BPM; parameter: xx=speed/BPM (01-1F=speed, 20-FF=BPM))

The parser also sets effect ids from a table or variable; this list may be incomplete.

### sidmon1 (parser: SidMon1Parser.ts)

- effTyp 3 (3xx, Tone Portamento; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 15 (Fxx, Set Speed/BPM; parameter: xx=speed/BPM (01-1F=speed, 20-FF=BPM))

### jamcracker (parser: JamCrackerParser.ts)

- effTyp 3 (3xx, Tone Portamento; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 4 (4xy, Vibrato; parameter: x=speed (0-F hex), y=depth (0-F hex))
- effTyp 15 (Fxx, Set Speed/BPM; parameter: xx=speed/BPM (01-1F=speed, 20-FF=BPM))

### quadraComposer (parser: QuadraComposerParser.ts)

No literal effect id found in the parser: it sets effect numbers from a table or through another parser. Effect ids not documented.

### amosMusicBank (parser: AMOSMusicBankParser.ts)

- effTyp 1 (1xx, Pitch Slide Up; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 2 (2xx, Pitch Slide Down; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 11 (Bxx, Position Jump; parameter: xx=position (00-FF hex))
- effTyp 14 (Exy, Extended Command; parameter: x=sub-command (0-F), y=parameter)
- effTyp 15 (Fxx, Set Speed/BPM; parameter: xx=speed/BPM (01-1F=speed, 20-FF=BPM))

The parser also sets effect ids from a table or variable; this list may be incomplete.

### sonicArranger (parser: SonicArrangerParser.ts)

- effTyp 11 (Bxx, Position Jump; parameter: xx=position (00-FF hex))
- effTyp 13 (Dxx, Pattern Break; parameter: xx=row (00-3F hex, 0-63 decimal))
- effTyp 14 (Exy, Extended Command; parameter: x=sub-command (0-F), y=parameter)
- effTyp 15 (Fxx, Set Speed/BPM; parameter: xx=speed/BPM (01-1F=speed, 20-FF=BPM))
- effTyp 16 (Gxx, Set Global Volume; parameter: xx=volume (00-40 hex, 64 decimal))

### inStereo2 (parser: InStereo2Parser.ts)

- effTyp 3 (3xx, Tone Portamento; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 10 (Axy, Volume Slide; parameter: x=slide up speed, y=slide down speed)
- effTyp 11 (Bxx, Position Jump; parameter: xx=position (00-FF hex))
- effTyp 12 (Cxx, Set Volume; parameter: xx=volume (00-40 hex, 64 decimal))
- effTyp 13 (Dxx, Pattern Break; parameter: xx=row (00-3F hex, 0-63 decimal))
- effTyp 15 (Fxx, Set Speed/BPM; parameter: xx=speed/BPM (01-1F=speed, 20-FF=BPM))

### inStereo1 (parser: InStereo1Parser.ts)

- effTyp 12 (Cxx, Set Volume; parameter: xx=volume (00-40 hex, 64 decimal))
- effTyp 15 (Fxx, Set Speed/BPM; parameter: xx=speed/BPM (01-1F=speed, 20-FF=BPM))

### tfmx (parser: TFMXParser.ts)

- effTyp 3 (3xx, Tone Portamento; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 4 (4xy, Vibrato; parameter: x=speed (0-F hex), y=depth (0-F hex))
- effTyp 10 (Axy, Volume Slide; parameter: x=slide up speed, y=slide down speed)
- effTyp 13 (Dxx, Pattern Break; parameter: xx=row (00-3F hex, 0-63 decimal))

The parser also sets effect ids from a table or variable; this list may be incomplete.

### artOfNoise (parser: ArtOfNoiseParser.ts)

No literal effect id found in the parser: it sets effect numbers from a table or through another parser. Effect ids not documented.

### digitalSymphony (parser: DigitalSymphonyParser.ts)

- effTyp 3 (3xx, Tone Portamento; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 4 (4xy, Vibrato; parameter: x=speed (0-F hex), y=depth (0-F hex))
- effTyp 5 (5xy, Tone Porta + Vol Slide; parameter: x=vol slide up speed, y=vol slide down speed)
- effTyp 6 (6xy, Vibrato + Vol Slide; parameter: x=vol slide up speed, y=vol slide down speed)
- effTyp 7 (7xy, Tremolo; parameter: x=speed (0-F hex), y=depth (0-F hex))
- effTyp 8 (8xx, Set Panning; parameter: xx=position (00=left, 80=center, FF=right))
- effTyp 9 (9xx, Sample Offset; parameter: xx=offset (multiply by 256 samples))
- effTyp 11 (Bxx, Position Jump; parameter: xx=position (00-FF hex))
- effTyp 12 (Cxx, Set Volume; parameter: xx=volume (00-40 hex, 64 decimal))
- effTyp 13 (Dxx, Pattern Break; parameter: xx=row (00-3F hex, 0-63 decimal))
- effTyp 14 (Exy, Extended Command; parameter: x=sub-command (0-F), y=parameter)
- effTyp 15 (Fxx, Set Speed/BPM; parameter: xx=speed/BPM (01-1F=speed, 20-FF=BPM))

The parser also sets effect ids from a table or variable; this list may be incomplete.

### graoumfTracker2 (parser: GraoumfTracker2Parser.ts)

- effTyp 1 (1xx, Pitch Slide Up; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 2 (2xx, Pitch Slide Down; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 3 (3xx, Tone Portamento; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 4 (4xy, Vibrato; parameter: x=speed (0-F hex), y=depth (0-F hex))
- effTyp 7 (7xy, Tremolo; parameter: x=speed (0-F hex), y=depth (0-F hex))
- effTyp 8 (8xx, Set Panning; parameter: xx=position (00=left, 80=center, FF=right))
- effTyp 10 (Axy, Volume Slide; parameter: x=slide up speed, y=slide down speed)
- effTyp 11 (Bxx, Position Jump; parameter: xx=position (00-FF hex))
- effTyp 12 (Cxx, Set Volume; parameter: xx=volume (00-40 hex, 64 decimal))
- effTyp 13 (Dxx, Pattern Break; parameter: xx=row (00-3F hex, 0-63 decimal))
- effTyp 14 (Exy, Extended Command; parameter: x=sub-command (0-F), y=parameter)
- effTyp 15 (Fxx, Set Speed/BPM; parameter: xx=speed/BPM (01-1F=speed, 20-FF=BPM))
- effTyp 20 (no entry in the editor table)
- effTyp 27 (no entry in the editor table)

### symphoniePro (parser: SymphonieProParser.ts)

- effTyp 1 (1xx, Pitch Slide Up; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 2 (2xx, Pitch Slide Down; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 3 (3xx, Tone Portamento; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 4 (4xy, Vibrato; parameter: x=speed (0-F hex), y=depth (0-F hex))
- effTyp 7 (7xy, Tremolo; parameter: x=speed (0-F hex), y=depth (0-F hex))
- effTyp 9 (9xx, Sample Offset; parameter: xx=offset (multiply by 256 samples))
- effTyp 10 (Axy, Volume Slide; parameter: x=slide up speed, y=slide down speed)
- effTyp 15 (Fxx, Set Speed/BPM; parameter: xx=speed/BPM (01-1F=speed, 20-FF=BPM))
- effTyp 27 (no entry in the editor table)

### digiBoosterPro (parser: DigiBoosterProParser.ts)

No literal effect id found in the parser: it sets effect numbers from a table or through another parser. Effect ids not documented.

### pumaTracker (parser: PumaTrackerParser.ts)

- effTyp 1 (1xx, Pitch Slide Up; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 2 (2xx, Pitch Slide Down; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 12 (Cxx, Set Volume; parameter: xx=volume (00-40 hex, 64 decimal))
- effTyp 15 (Fxx, Set Speed/BPM; parameter: xx=speed/BPM (01-1F=speed, 20-FF=BPM))

### synthesis (parser: SynthesisParser.ts)

- effTyp 3 (3xx, Tone Portamento; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 12 (Cxx, Set Volume; parameter: xx=volume (00-40 hex, 64 decimal))
- effTyp 15 (Fxx, Set Speed/BPM; parameter: xx=speed/BPM (01-1F=speed, 20-FF=BPM))

### digitalSoundStudio (parser: DigitalSoundStudioParser.ts)

- effTyp 1 (1xx, Pitch Slide Up; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 2 (2xx, Pitch Slide Down; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 3 (3xx, Tone Portamento; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 11 (Bxx, Position Jump; parameter: xx=position (00-FF hex))
- effTyp 12 (Cxx, Set Volume; parameter: xx=volume (00-40 hex, 64 decimal))
- effTyp 15 (Fxx, Set Speed/BPM; parameter: xx=speed/BPM (01-1F=speed, 20-FF=BPM))

### chuckBiscuits (parser: ChuckBiscuitsParser.ts)

- effTyp 14 (Exy, Extended Command; parameter: x=sub-command (0-F), y=parameter)

The parser also sets effect ids from a table or variable; this list may be incomplete.

### musicLine (parser: MusicLineParser.ts)

- effTyp 1 (1xx, Pitch Slide Up; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 2 (2xx, Pitch Slide Down; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 3 (3xx, Tone Portamento; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 10 (Axy, Volume Slide; parameter: x=slide up speed, y=slide down speed)
- effTyp 12 (Cxx, Set Volume; parameter: xx=volume (00-40 hex, 64 decimal))
- effTyp 15 (Fxx, Set Speed/BPM; parameter: xx=speed/BPM (01-1F=speed, 20-FF=BPM))

The parser also sets effect ids from a table or variable; this list may be incomplete.

### gameMusicCreator (parser: GameMusicCreatorParser.ts)

No literal effect id found in the parser: it sets effect numbers from a table or through another parser. Effect ids not documented.

### kris (parser: KrisHatlelidParser.ts, KRISParser.ts)

No literal effect id found in the parser: it sets effect numbers from a table or through another parser. Effect ids not documented.

### deltaMusic1 (parser: DeltaMusic1Parser.ts)

- effTyp 1 (1xx, Pitch Slide Up; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 2 (2xx, Pitch Slide Down; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 3 (3xx, Tone Portamento; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 12 (Cxx, Set Volume; parameter: xx=volume (00-40 hex, 64 decimal))
- effTyp 15 (Fxx, Set Speed/BPM; parameter: xx=speed/BPM (01-1F=speed, 20-FF=BPM))

The parser also sets effect ids from a table or variable; this list may be incomplete.

### ams (parser: AMSParser.ts)

No literal effect id found in the parser: it sets effect numbers from a table or through another parser. Effect ids not documented.

### richardJoseph (parser: RichardJosephParser.ts)

- effTyp 3 (3xx, Tone Portamento; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 4 (4xy, Vibrato; parameter: x=speed (0-F hex), y=depth (0-F hex))
- effTyp 15 (Fxx, Set Speed/BPM; parameter: xx=speed/BPM (01-1F=speed, 20-FF=BPM))

### pt36 (parser: PT36Parser.ts)

No literal effect id found in the parser: it sets effect numbers from a table or through another parser. Effect ids not documented.

### jeroenTel (parser: JeroenTelParser.ts)

No literal effect id found in the parser: it sets effect numbers from a table or through another parser. Effect ids not documented.

### zoundMonitor (parser: ZoundMonitorParser.ts)

- effTyp 1 (1xx, Pitch Slide Up; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 2 (2xx, Pitch Slide Down; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 3 (3xx, Tone Portamento; parameter: xx=speed (01-FF hex, 00=use last))

### steveTurner (parser: SteveTurnerParser.ts)

- effTyp 14 (Exy, Extended Command; parameter: x=sub-command (0-F), y=parameter)

The parser also sets effect ids from a table or variable; this list may be incomplete.

### jochenHippelST (parser: JochenHippelSTParser.ts)

No literal effect id found in the parser: it sets effect numbers from a table or through another parser. Effect ids not documented.

### fashionTracker (parser: FashionTrackerParser.ts)

No literal effect id found in the parser: it sets effect numbers from a table or through another parser. Effect ids not documented.

### peterVerswyvelenPacker (parser: PeterVerswyvelenPackerParser.ts)

No literal effect id found in the parser: it sets effect numbers from a table or through another parser. Effect ids not documented.

### anders0land (parser: Anders0landParser.ts)

No literal effect id found in the parser: it sets effect numbers from a table or through another parser. Effect ids not documented.

### jochenHippel7V (parser: JochenHippel7VParser.ts)

No literal effect id found in the parser: it sets effect numbers from a table or through another parser. Effect ids not documented.

### midiLoriciel (parser: MIDILoricielParser.ts)

No literal effect id found in the parser: it sets effect numbers from a table or through another parser. Effect ids not documented.

### cheesecutter (parser: CheeseCutterParser.ts)

- effTyp 12 (Cxx, Set Volume; parameter: xx=volume (00-40 hex, 64 decimal))

The parser also sets effect ids from a table or variable; this list may be incomplete.

### stoneTracker (parser: StoneTrackerParser.ts)

No literal effect id found in the parser: it sets effect numbers from a table or through another parser. Effect ids not documented.

### ems (parser: EMSParser.ts, EMSv6Parser.ts)

No literal effect id found in the parser: it sets effect numbers from a table or through another parser. Effect ids not documented.

### hvl (parser: HivelyParser.ts)

- effTyp 1 (1xx, Pitch Slide Up; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 2 (2xx, Pitch Slide Down; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 3 (3xx, Tone Portamento; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 5 (5xy, Tone Porta + Vol Slide; parameter: x=vol slide up speed, y=vol slide down speed)
- effTyp 8 (8xx, Set Panning; parameter: xx=position (00=left, 80=center, FF=right))
- effTyp 10 (Axy, Volume Slide; parameter: x=slide up speed, y=slide down speed)
- effTyp 11 (Bxx, Position Jump; parameter: xx=position (00-FF hex))
- effTyp 13 (Dxx, Pattern Break; parameter: xx=row (00-3F hex, 0-63 decimal))
- effTyp 14 (Exy, Extended Command; parameter: x=sub-command (0-F), y=parameter)
- effTyp 15 (Fxx, Set Speed/BPM; parameter: xx=speed/BPM (01-1F=speed, 20-FF=BPM))

The parser also sets effect ids from a table or variable; this list may be incomplete.

### mugician (parser: DigitalMugicianParser.ts)

- effTyp 1 (1xx, Pitch Slide Up; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 2 (2xx, Pitch Slide Down; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 3 (3xx, Tone Portamento; parameter: xx=speed (01-FF hex, 00=use last))
- effTyp 14 (Exy, Extended Command; parameter: x=sub-command (0-F), y=parameter)
- effTyp 15 (Fxx, Set Speed/BPM; parameter: xx=speed/BPM (01-1F=speed, 20-FF=BPM))

The parser also sets effect ids from a table or variable; this list may be incomplete.

### iceTracker (parser: ICEParser.ts)

No literal effect id found in the parser: it sets effect numbers from a table or through another parser. Effect ids not documented.

### musicMaker4V (parser: MusicMakerParser.ts)

- effTyp 15 (Fxx, Set Speed/BPM; parameter: xx=speed/BPM (01-1F=speed, 20-FF=BPM))

### musicMaker8V (parser: MusicMakerParser.ts)

- effTyp 15 (Fxx, Set Speed/BPM; parameter: xx=speed/BPM (01-1F=speed, 20-FF=BPM))

### c64sid (parser: SIDParser.ts)

- effTyp 15 (Fxx, Set Speed/BPM; parameter: xx=speed/BPM (01-1F=speed, 20-FF=BPM))

### imagesMusicSystem (parser: IMSParser.ts)

- effTyp 4 (4xy, Vibrato; parameter: x=speed (0-F hex), y=depth (0-F hex))

The parser also sets effect ids from a table or variable; this list may be incomplete.

## Not verified

- Ids were found by grep in the parser source, not by playing each command.
- Zero is not listed: it is both arpeggio and the empty cell, and the parsers write it as the default.
