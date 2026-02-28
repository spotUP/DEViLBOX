 IFND MMV8_I
MMV8_I     SET   1
**
**
** $Filename: mmv8.i $
** $Release:  3.0 $
** $Revision: 0.1 $
** $Date: 94/02/20 $
**
** MusicMaker V8 definitions and file structures
**
** (C) 1986-94 Dire Cracks Amiga® Software, Austria.
**
**

VERSION_2_4 SET 1          * file format changed since 2.4x

* This file applies to both the mmv88.library as well the mmv8.library

* defines for LOOP/ONESHOT parameters submitted to various functions
ONESHOT equ 1
LOOP    equ 0


* code for PACKED for NewMakeTables()
TABLE_PACKED    equ  0
TABLE_UNPACKED  equ -1


* reaction given to SetAlertReaction()
REACTION_STOP   equ  0
REACTION_IGNORE equ -1


* ERROR CODES returned from LoadAndInit():
ERROR_LOADOK           equ   0  * Load successful.
ERROR_INSTFILEMISSING  equ 101  * Instrument file not found.
ERROR_INSTMEMORY       equ 102  * Not enough memory for instruments
ERROR_INSTDEPACKMEM    equ 103  * Not enough memory for depacking
ERROR_LIBDISKSET       equ 104  * Can't use LIB-DISK sets..

ERROR_SDATAFILEMISSING equ 106  * No sound data file found ...
ERROR_SDATAMEMORY      equ 107  * No memory for sound data

ERROR_MIXBUFMEMORY     equ 108  * No memory for mixbuffers (mmv88.lib ONLY!)
ERROR_VOLTABLEMEMORY   equ 109  * No memory for a requ. table (mmv88 ONLY!)

ERROR_FILEFORMAT       equ 111  * Illegal file format: Either this
*        is no sound data file, or it is an EXT/STD song, using the
*        wrong library!

ERROR_MODNOINSTS       equ 115  * module file contained no instruments
ERROR_MODNOSDATA       equ 116  * module file contained no songdata

* ERROR code returned from ALL funtions in case it appears:

ERROR_LIBSPECIAL       equ 123  * mmvx.library could not open mmv8 or mmv88.lib!


* The following information is for internal use only.

 IFD sysop

   IFND EXEC_TYPES_I
    include "exec/types.i"  * OS 2.0 includes required
   ENDC

* a standard, but COMPLETLY USELESS define
*MMV8NAME MACRO                  * eliminated due asm speed...
*   dc.b 'mmv8.library',0
*   cnop 0,2
*   ENDM
*MMV88NAME MACRO                 * eliminated due asm speed...
*   dc.b 'mmv88.library',0
*   cnop 0,2
*   ENDM
*MMVXNAME MACRO                  * eliminated due asm speed...
*   dc.b 'mmvx.library',0
*   cnop 0,2
*   ENDM

* some other useful defines

M_END         equ 999         * trackdata
M_MAX         equ 997      * trackdata
M_ILL         equ 998               *trackdata
INSTNUM       equ 36    * max inst num
LFOMAX        equ 15        * max lfo num

* the EXT-song structure *****************

 STRUCTURE mmv8song,0
   WORD   m8_songid          * see defines below
   STRUCT m8_songname,20     * simple t-e-x-t
   BYTE   m8_extid             * see defines below
    BYTE   m8_channelsonoff    * see defines below
   BYTE   m8_channelmodes        * see defines below
    BYTE   m8_hilimit
 IFND VERSION_2_4      ; pre-2.4 files
    WORD   m8_minus_one
 ELSE
    BYTE m8_filemark2_4    * see define below
    BYTE m8_bpm            * show speed as "bpm" or old number
    WORD m8_extsize        * 2+32+64 = size of data following: (may change!!!!!)
      STRUCT m8_author,32         * 1) author: t-e-x-t
      STRUCT m8_extensiondata,64  * 2) extension data; MM-interal save date, etc.
 ENDC
    WORD   m8_packedvoltables    * see defines below
   STRUCT m8_hivalues,226     * WORD-array, 113 values
   WORD   m8_pattlen          * macro length
    WORD   m8_speed      * play speed
   WORD   m8_startpos         * see user's guide
   WORD   m8_repeatpos          * see user's guide
  LABEL  m8_melodat

MMV8_EXTID  equ -1     * this identifies an ext-song as .. an ext song
MMV8_2_4ID  equ -2     * this defines a file as saved by MM V8 V2.4x
MMV8_BPM    equ -1     * show "bpm" instead of old number in MM

* the STD structure *********************

 STRUCTURE mmv4song,0
   WORD   m4_songid            * see defines below
   STRUCT m4_songname,20
 IFND VERSION_2_4
   WORD   m4_pattlen       * macro length
*  important: a patternlength can never be greater than $100, so conflict
*  in identification of ext/std songs is avoided.
 ELSE
   BYTE m4_filemark2_4    * see above
   BYTE m4_pattlen       * now a !!!!!byte!!!!!
 ENDC
   WORD   m4_speed           * play speed
   WORD   m4_startpos             * see user's guide
   WORD   m4_repeatpos         * see user's guide
 IFD VERSION_2_4
   WORD m4_extsize    * 2+1+1+32+64=size of data following (incl. length-word)
    BYTE m4_bpm        * see above
    BYTE m4_pad          * Zaphod...kludge city limits!
    STRUCT m4_author,32   * author, 32 chars
    STRUCT m4_extdata,64  * extensional data; MM-internal (song-date, version,etc)
 ENDC
  LABEL  m4_melodat

MMV8_SONGID   equ 'SE'    *general ID in beginning of file.

* ad m8_channelsonoff
* If a bit is set, the corresponding channel is enabled in playing.
* If the bit is cleared, there's no track data contained in the array !

* defines for m8_channelmodes:
* Only bits 3 to 0 used, because only a pair of channels can be set to
* either mode. If a bit set, the couple is played in SLOW (=good)
* mode.

* These structs end here. From now, the trackdata array follows.
* Each enabled channel has its WORD array, terminated by M_END.
* After the array, the *real* SOUND data follows. The sound data is
* organized in 3-byte-EVENTS.

  STRUCTURE sevent,0
     BYTE se_eventtype
     BYTE se_Arg1
     BYTE se_Arg2
    LABEL se_sizeof

INSTRUMENT_A equ $00
INSTRUMENT_B equ $10
* Full definition makes no sense.
INSTRUMENT_O equ $e0

VOLUME_SMALL_0     equ $00
VOLUME_SMALL_1     equ $01
* Full definition makes no sense.
VOLUME_9     EQU $0f

* A normal note has se_eventtype divided into nibbles: The upper one tells
* the player what instrument to use (15 only here, see below for instrs
* 16-36), the lower nibble about the volume (16 possible states.)
* The values defined above are simply OR-ed together.
* NOTE: $f as upper nibble defines a special event, see below.

* Arg1 normally contains a note index (lower 6 bits) and bits 6 and 7
* are used for some special stuff:
* Bit 7 of Arg1, in a normal note event, is used for ONESHOT or LOOP
* instrument play mode determination. If SET, it's to be played in loop mode
* NOTE: From v2.0, the players do a validity check of LOOP definitions !
* Bit 6 is used for telling the player about LPF state changes. If SET,
* Bit 6 of Arg2 contains the new LPF state.
LPFF_LPFCHANGE  equ $40
LPFB_LPFCHANGE   equ 6

* Arg2 in almost all cases (say eventtypes) contains a 6 bit number,
* specifying how many slots following this event are empty in the macro.
* This saves *quite* much memory space. Bit 6 is explained above, and
* Bit 7 is the MODULATION control bit: If SET, the player ignores the
* instrument-nibble in se_eventtype, and does ONLY use the note and volume
* parameter.
LOOPF_PLAYASLOOP equ $80
LOOPB_PLAYASLOOP  equ 7

* Some special event types
  ENUM $f1

* The Pause is symbolized by ")" in MusicMaker. Pause can be followed by
* TRUE or FALSE, specifying wether to really stop the sound, or just
* to memorize current sample position. This is used in EXT-songs only, for
* providing info for "(" - instrument continuation.
  EITEM ET_PAUSE     ;      EQU $f1

* Portamento, ">" in MusicMaker, has different Args than usual events. First
* Arg1 and Arg2 contain a normal note (see above), reflecting the origin
* where to start the portamento from. The second se_eventtype is set to
* ZERO (though it doesn't really matter as long it's not set to
* ET_MACROEND or ET_SOUNDDATAEND) and Arg1 contains portamento information
* in DELTAS. Upper nibble is volume delta (0-7,(-1)-(-8)) and the lower
* the period delta (used in the same way).
   EITEM ET_PORTAMENTO    ;  EQU $f2  * THIS EVENT TAKES 6 BYTES !

* PORTA_EXTENSION is for internal MusicMaker usage only. NOTE: Event takes
* 6 bytes and ONLY exists at the end of a macro !
   EITEM ET_PORTA_EXTENSION  ; EQU $f3  * THIS EVENT TAKES 6 BYTES !

* The loudness control event is in Arg1 followed by TRUE or FALSE, resp.
* "enable" or "disable" loudness.
   EITEM ET_LOUDNESS      ;  EQU $f4

* Custom program call has no special information saved in Arg1. Arg2
* contains normal counter info.
   EITEM ET_CUSTOMPROGRAM ;  EQU $f5

* FADECONTROL is followed by a nibble containing the actual fading speed. A
* negative speed means FADEOUT. 
   EITEM ET_FADECONTROL   ;  EQU $f6

* FADECONTROL is followed by FALSE or +1 or -1. It sets the FADESTATE.
* Zero means NO MORE FADE, in MusicMaker it's the "|". -1 says SET TO LOW,
* +1 means "SET TO HIGH".
   EITEM ET_FADESTATE    ;   EQU $f7

* For usage of instruments 16-36 (P-9): EVENT_EXTENSION's Arg1 contains
* a value added to the FOLLOWING se_eventtype/upper_nibble. Arg2 not used.
  EITEM ET_EVENT_EXTENSION  ; EQU $f8  * EVENT HAS SECOND SUB-EVENT

* WARP: Arg1 contains values similar to PORTAMENTO. Important: No origin,
* therefore 3 bytes only this time !
  EITEM ET_WARP         ;   EQU $f9

* SETUP_LFO: Arg1 contains number of LFO-curve to enable for specified
* instrument.
  EITEM ET_SETUP_LFO    ;   EQU $fa

* The following special event works EXACTLY the same way as the normal
* PORTAMENTO (see above), BUT the period delta is multiplied by 2. This
* allows faster sliding. MusicMaker automatically calculates the required
* PORTAMENTO type.
  EITEM ET_FASTPORTAMENTO  ; EQU $fb

* Speed Change only supported in STD songs. Arg1 contains speed factor
* in a special way: Speed is MULTIPLIED by (upper/lower) nibble.
  EITEM ET_SPEEDCHANGE  ;   EQU $fc

* The following special event is for MusicMaker internal use only. Using
* this event in a constructed song will cause FIRECRACKING_DISPLAY.
  EITEM ET_NOTALLOWED   ;   EQU $fd

* The SOUNDDATAEND marks the sound data end. This is a single byte event.
  EITEM ET_SOUNDDATAEND  ;   EQU $fe

* This is set at a macro's end. If the macro is empty, MusicMaker will
* save a single MACROEND mark. This event consists in this single byte.
  EITEM ET_MACROEND  ;      EQU $ff

**
** The Instruments
**

* There is a basic difference in the instrument files depending on the
* save type used. Currently, there are 3 types available:
* DATA, LIB-DISK and PACKED.
* The first two file types have the same name appendix, ".i", while the
* packed instruments are being always saved in a file that ends with ".ip".
* This only for historical reasons.

* First the general format:

 STRUCTURE Instrumentsheader,0
   LONG ih_ID1
   WORD ih_ID2
   WORD ih_INSTNUM
   STRUCT ih_cdataA,8
   STRUCT ih_cdataB,8
   STRUCT ih_cdataC,8
   STRUCT ih_cdataD,8
   STRUCT ih_cdataE,8
   STRUCT ih_cdataF,8
   STRUCT ih_cdataG,8
   STRUCT ih_cdataH,8
   STRUCT ih_cdataI,8
   STRUCT ih_cdataJ,8
   STRUCT ih_cdataK,8
   STRUCT ih_cdataL,8
   STRUCT ih_cdataM,8
   STRUCT ih_cdataN,8
   STRUCT ih_cdataO,8
   STRUCT ih_cdataP,8
   STRUCT ih_cdataQ,8
   STRUCT ih_cdataR,8
   STRUCT ih_cdataS,8
   STRUCT ih_cdataT,8
   STRUCT ih_cdataU,8
   STRUCT ih_cdataV,8
   STRUCT ih_cdataW,8
   STRUCT ih_cdataX,8
   STRUCT ih_cdataY,8
   STRUCT ih_cdataZ,8
   STRUCT ih_cdata0,8
   STRUCT ih_cdata1,8
   STRUCT ih_cdata2,8
   STRUCT ih_cdata3,8
   STRUCT ih_cdata4,8
   STRUCT ih_cdata5,8
   STRUCT ih_cdata6,8
   STRUCT ih_cdata7,8
   STRUCT ih_cdata8,8
   STRUCT ih_cdata9,8
   LABEL realidata
inst_ID1 equ 'SEI1'
inst_ID2 equ 'XX'
* In DATA files, here the sounddata followes. In packed instrument files,
* now the depacking header comes:
   WORD ih_packqual
*  STRUCT ih_packdeltas,1<<packqual *
* Note: The size of the deltas is BYTE, and there are 1<<packqual of them
* here.
* This structure only applies to PACKED and DATA save types.

* LIB DISK is different:

  STRUCTURE libdiskfile,0
    LONG libdiskid1     * set to LIBDISK_ID
    LONG libdiskid2     * set to LIBDISK_ID
    LABEL lfoinfo_start

LIBDISK_ID equ -1

* After all, in all save types, it goes like this:

    STRUCTURE LFOFLAGS,(LFOMAX*2)
    LABEL lfodata_start

* These FLAGS are, in  fact, no flags as such, but the length info for
* the calculated curves.
* Now the LFO data itself followes.

* Then the file ends, but it may grow in the future.

* Thanks AMIGA.
* From Magrathea with love.

  ENDC  ; !MMV8_I

 ENDC  ; !sysop

