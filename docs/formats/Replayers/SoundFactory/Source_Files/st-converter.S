;*********************************************************************
;                                                                    *
;  Converter von Soundtracker-Song-Files in Soundfactory-Music-Files *
;                                                                    *
;                 ©  1989 Profiteam Software!                        *
;                         22.-23.1.89                                *
; Last Update:  03.02.1990                                           *
;*********************************************************************

Puffer_Len     = 70000     ;Zu reservierende Länge fürs SF-File
ExecBase       = 4         ;Const
Open_Library   = -408      ;Exec-Sprungadressen
Close_Library  = -414
AllocMem       = -198
FreeMem        = -210
Open           = -30       ;Dos-Sprungadressen
Close          = -36
Read           = -42
Write          = -48
Seek           = -66
Output         = -60
Mode_Old       = 1005      ;Modi für File-öffnen
Mode_New       = 1006

run:
   move.l sp,Stack_Old     ;Stackpointer retten
   movem.l d0/a0,-(sp)
   lea Dos_Name,a1
   move.l ExecBase,a6
   jsr Open_Library(a6)    ;Dos_Library öffnen
   move.l d0,Dos_Base
   bne m1
   move.b #1,d0            ;Fehler beim öffnen der Dos_Library
   bra Ende
m1:
   movem.l (sp)+,d0/a0
   cmp.b #1,d0
   bne m2
   move.b #2,d0            ;Kein Parameter angegeben -> USAGE
   bra Ende
m2:
   clr.b Inst_Flag
   cmp.b #"-",(a0)
   bne mit_Inst
   cmp.b #"n",1(a0)
   bne BadArgs
   move.b #1,Inst_Flag
   addq.l #3,a0
   subq.b #3,d0
   cmp.b #2,d0
   bcc mit_Inst
BadArgs:
   move.b #3,d0
   bra Ende                ;Ungenügende Parameter
mit_Inst:
   lea File_Name,a1
loop1:
   move.b (a0)+,(a1)+
   subq.b #1,d0
   bne loop1               ;Source-Namen holen
   clr.b -1(a1)            ;mit 0 abschließen
   move.l a1,-(sp)
   move.l #File_Name,d1
   move.l #Mode_Old,d2
   move.l Dos_Base,a6
   jsr Open(a6)            ;Source-File öffnen
   move.l d0,Source_Handle
   bne m3
   move.b #4,d0
   bra Ende
m3:
   move.l (sp)+,a1
   move.b #".",-1(a1)
   move.b #"m",(a1)
   clr.b 1(a1)             ;.m an Name anhängen fürs Destination File
   clr.l d1
   move.l ExecBase,a6
   move.l #66136,d0
   jsr AllocMem(a6)           ;Speicher für ST-Song reservieren
   move.l d0,Source_Adr
   bne m4
   move.b #5,d0
   bra Ende
m4:
   move.l Dos_Base,a6
   move.l Source_Handle,d1
   move.l Source_Adr,d2
   move.l #66136,d3
   jsr Read(a6)               ;ST-Song einlesen (max. 66136 Bytes)
   cmp.l #-1,d0
   bne m5
   move.b #6,d0
   bra Ende                   ;Lesefehler
m5:
   move.l Source_Adr,a0
   cmp.l #"PACK",(a0)
   bne mm5
   move.b #14,d0
   bra Ende
mm5:
   move.l Source_Handle,d1
   move.l #1,d2
   jsr Close(a6)              ;Source_File schließen
   clr.l Source_Handle
   tst.b Inst_Flag
   bne m8
   move.l ExecBase,a6
   clr.l d1
   move.l #33000,d0
   jsr AllocMem(a6)           ;Speicher für Samples reservieren
   move.l d0,Sample_Adr
   bne m6
   move.b #5,d0
   bra Ende
m6:
   move.l #20,d6
   move.l Dos_Base,a6
L0:
   move.l d6,d0
   add.l Source_Adr,d0
   move.l d0,a0               ; a0 ^ auf Instrument-Parameter (30 Bytes)

   move.l d6,-(sp)
   bsr Convert_Instr          ; Instrument convertieren
   move.l (sp)+,d6
m7:
   add.w #30,d6
   cmp.w #470,d6
   bne L0
   move.l ExecBase,a6
   move.l Sample_Adr,a1
   move.l #33000,d0           ;Instrument Speicher freigeben
   jsr FreeMem(a6)
   clr.l Sample_Adr           ;Instrumente nun konvertiert
m8:
   move.l ExecBase,a6
   clr.l d1
   move.l #Puffer_Len,d0
   jsr AllocMem(a6)           ;Speicher für SF-File reservieren
   move.l d0,Ziel_Adr
   bne m9
   move.b #5,d0
   bra Ende
m9:
   move.l Ziel_Adr,a5         ;a5 ist Zeiger im Puffer auf Ende
   move.b #";",(a5)+          ;Semikolon
   move.l Source_Adr,a0
   bsr Print                  ;Name des Musikstückes
   lea Kommentar,a0
   bsr Print                  ;Kommentar
   move.b #4,d7               ;Stimme
L3:
   lea Voice,a0
   bsr Print
   clr.w d0
   move.b d7,d0
   bsr Print_Zahl             ;Gibt die Zahl in d0.w aus
   bsr DLF                    ;Double-Linefeed
   lea Vol,a0
   bsr Print
   cmp.b #4,d7
   bne q1
   clr.l d6
L4:
   move.l Source_Adr,a1
   clr.l d0
   move.b d6,d0
   mulu #30,d0
   add.w #20,d0
   add.l d0,a1                ;a1 Adr. des Namens des Instr. d6+1
   move.l a1,d0
Srch:
   cmp.b #":",(a1)+
   beq.s CorName
   tst.b (a1)
   bne.s Srch
   move.l d0,a1
CorName:
   tst.b (a1)
   beq q2
   lea Setsound,a0
   bsr Print
   move.w d6,d0
   addq.b #1,d0
   bsr Print_Zahl
   move.b #",",(a5)+
   move.l a1,a0
   bsr Print
   bsr LF
q2:
   addq.b #1,d6
   cmp.b #15,d6
   bne L4
q1:
   bsr LF                     ;alle Setsounds geschrieben

   move.l Source_Adr,a4
   add.l #472,a4
   clr.l d6
L5:
   lea Gosub,a0
   bsr Print
   clr.w d0
   move.b d7,d0
   bsr Print_Zahl
   move.b #$5f,(a5)+          ; "_"
   move.b 0(a4,d6),d0
   bsr Print_Zahl
   bsr LF
   addq.b #1,d6
   cmp.b -2(a4),d6
   bne L5                     ;Hauptmelodie geschrieben
   lea Loop,a0
   bsr Print
   subq.b #1,d7
   bne L3
   bsr DLF                    ;2 Linefeeds

   clr.l d7
L6:
   lea Patternflags,a0
   move.w #127,d0
L7:
   clr.b 0(a0,d0.w)           ;alle 128 Flags bei Source_Adr löschen
   subq.b #1,d0
   bpl L7
   move.b #6,Speed
   clr.b Vol_Flag
   clr.l d6
L8:
   clr.l d0
   move.b 0(a4,d6.w),d0       ;Patternnr.
   tst.b 0(a0,d0.w)
   bne q3
   move.b #1,0(a0,d0.w)
   movem.l d6-d7/a0/a4,-(sp)
   bsr Convert_Pattern
   movem.l (sp)+,d6-d7/a0/a4
q3:
   addq.b #1,d6
   cmp.b -2(a4),d6
   bne L8                     ;Next Pattern
   addq.b #1,d7
   cmp.b #4,d7
   bne L6                     ;Next Voice

   move.l Dos_Base,a6         ;alles abspeichern
   move.l #File_Name,d1
   move.l #Mode_New,d2
   jsr Open(a6)               ;Ziel-File öffnen
   move.l d0,Source_Handle
   bne W4
   move.b #11,d0
   bra Ende
W4:
   move.l d0,d1
   move.l Ziel_Adr,d2
   move.l a5,d3
   sub.l Ziel_Adr,d3
   move.l d3,-(sp)
   jsr Write(a6)              ;File schreiben
   move.l (sp)+,d3
   cmp.l d3,d0
   beq W5
   move.b #12,d0
   bra Ende
W5:
   clr.b d0                   ;Ende Gut alles Gut !!
   bra Ende                   ;Korrektes Beenden des Programms.

;----- Ausgabetexte --------------------------------------------------

Vol:        dc.b "Vol 255",10,10,0
Loop:       dc.b "Loop",10,10,0
Gosub:      dc.b "Gosub Pattern_",0
Setsound:   dc.b "Setsound ",0
Voice:      dc.b "Voice 1,",0
Kommentar:  dc.b 10,";Konvertiert mit dem ST-Converter in eine SF-Musik."
            dc.b 10,";   © 1989 Profiteam Software !!",10,10,0
Patt:       dc.b "Pattern_",0
Return:     dc.b 10,10,"Return",10,10,0
Vol2:       dc.b "Vol 255:",0
Sound:      dc.b "Sound ",0
asr:        dc.b "Vol ",0
even

;-------- Unterprogramme ---------------------------------------------

Convert_Pattern:              ;d7 = Voice ; d0 = Pattern
   lea Patt,a0
   bsr Print
   move.l d0,d6
   move.l d7,d0
   addq.b #1,d0
   bsr Print_Zahl
   move.b #$5f,(a5)+          ;"_"
   move.l d6,d0
   bsr Print_Zahl
   bsr DLF

   move.l d6,d0
   mulu #1024,d0
   add.l #600,d0
   add.l Source_Adr,d0
   move.l d0,a0               ;a0=Adresse des Patterns
   clr.l d5                   ;Notenzähler
   clr.l d4                   ;Len
   clr.b Akt_Sound
L10:
   clr.l d0
   clr.l d1
L11:
   move.l 0(a0,d1.w),d2
   cmp.b d0,d7
   bne V1
   move.l d2,d3               ;Aktuelle Note in d3
V1:
   and.w #$0fff,d2
   cmp.w #$f00,d2
   bcs V2
   move.b d2,Speed            ;Neuen Speed einstellen
V2:
   addq.b #4,d1
   addq.b #1,d0
   cmp.b #4,d0
   bne L11
   tst.b d5
   beq V3
   tst.l d3
   bne V5
   clr.w d0
   move.b Speed,d0
   add.w d0,d4
   bra V4
V5:
   move.l d4,d0
   bsr Print_Zahl             ;Len ausgeben
   bsr LF
   clr.l d4
V3:
   move.l a0,-(sp)
   bsr Neue_Note              ;Neue Note anfangen
   move.l (sp)+,a0
V4:
   add.l #16,a0
   addq.b #1,d5               ;Next Note
   cmp.b #64,d5
   bne L10
   move.l d4,d0
   bsr Print_Zahl             ;Letzte Len ausgeben

   lea Return,a0
   bsr Print
   rts

Neue_Note:                    ;Neue Note anfangen
   move.w d3,d0
   and.w #$f000,d0
   beq N1
   tst.b Vol_Flag
   beq N0
   lea Vol2,a0
   bsr Print
   clr.b Vol_Flag
N0:
   lsr.w #8,d0
   lsr.w #4,d0
   cmp.b Akt_Sound,d0
   beq N1
   move.b d0,Akt_Sound
   lea Sound,a0
   bsr Print
   bsr Print_Zahl
   move.b #":",(a5)+          ;Sound x
N1:
   move.w d3,d0
   and.w #$0f00,d0
   cmp.w #$0c00,d0
   bne N2
   lea asr,a0
   bsr Print
   clr.w d0
   move.b d3,d0
   mulu #255,d0
   move.l Source_Adr,a0
   clr.w d1
   move.b Akt_Sound,d1
   mulu #30,d1
   add.w #14,d1
   move.w 0(a0,d1.w),d1
   bne NY
NZ:
   move.w #1,d0
   bra NX
NY:
   divu d1,d0
   tst.w d0
   beq NZ
   cmp.w #255,d0
   bls NX
   move.w #255,d0
NX:
   bsr Print_Zahl
   move.b #1,Vol_Flag
   move.b #":",(a5)+         ;Neuen Volume
N2:
   swap d3
   tst.w d3
   bne N4
   move.b #"p",(a5)+          ;Pause
   bra N3
N4:
   bsr Calc_Note
N3:
   clr.l d4
   move.b Speed,d4
   rts

Calc_Note:                    ;Note aus Peridendauer berechnen
   lea Periods,a1
   clr.l d0
CN1:
   move.w (a1)+,d1
   cmp.w d1,d3
   beq CN2
   addq.b #1,d0
   cmp.w #$ffff,d1
   bne CN1
   move.b #13,d0              ;Unbekannte Periodendauer
   bra Ende
CN2:
   divu #12,d0                ;d0 = Note
   move.l d0,d2
   addq.b #1,d0
   move.b #"o",(a5)+
   bsr Print_Zahl             ;Oktave
   move.b #":",(a5)+
   swap d2
   lsl.w #1,d2
   lea Noten,a1
   move.w 0(a1,d2.w),d2       ;d2 = 2 Buchstaben
   move.b d2,(a5)+
   lsr.w #8,d2
   move.b d2,(a5)+
   rts

Noten:   dc.b " c#c d#d e f#f g#g a#a h"

Periods:                      ;Bekannte Periods
   dc.w $358,$328,$2fa,$2d0,$2a6,$280,$25c,$23a
   dc.w $21a,$1fc,$1e0,$1c5,$1ac,$194,$17d,$168
   dc.w $153,$140,$12e,$11d,$10d,$0fe,$0f0,$0e2
   dc.w $0d6,$0ca,$0be,$0b4,$0aa,$0a0,$097,$08f
   dc.w $087,$07f,$078,$071,$ffff

Print_Zahl:                   ;Gibt Zahl aus d0 aus (max. 3-stellig)
   clr.b d1
   swap d0
   clr.w d0
   swap d0
   divu #100,d0
   bsr Digit
   clr.w d0
   swap d0
   divu #10,d0
   bsr Digit
   move.b #1,d1
   swap d0
Digit:
   tst.b d0
   bne Digit1
   tst.b d1
   beq DigRet
Digit1:
   move.b #1,d1
   add.b #"0",d0
   move.b d0,(a5)+
DigRet:
   rts

Print:                        ;Gibt den Text aus a0 nach d5 aus
   move.b (a0)+,(a5)+
   tst.b (a0)
   bne Print
   rts

DLF:
   move.b #10,(a5)+           ;Double-Linefeed
LF:                           ;Linefeed
   move.b #10,(a5)+
   rts

Convert_Instr:
   clr.w d0
CC0:
   tst.b 0(a0,d0.w)
   beq CC1
   addq.b #1,d0
   bra CC0                    ;d0 = Anzahl der Zeichen des Namens
CC1:
   tst.b d0
   bne CC2
   rts                        ;falls Name leer, dann zurück
CC2:
   subq.b #1,d0
   beq CC3
   cmp.b #":",0(a0,d0.w)
   beq CC4
   cmp.b #"/",0(a0,d0.w)
   bne CC2
CC4:
   addq.b #1,d0
CC3:                          ;d0 = Offset zum richtigen Namen (o. Pfad)
   tst.b 0(a0,d0.w)
   bne CC5                    ;falls 1.Zeichen vom Name=0 , fertig
   rts
CC5:
   move.b d0,-(sp)
   move.l a0,-(sp)
   move.l a0,d1
   move.l #Mode_Old,d2
   jsr Open(a6)               ;Instrument-File öffnen
   move.l d0,Instr_Handle
   bne C1
   move.b #7,d0
   bra Ende
C1:
   move.l d0,d1
   move.l Sample_Adr,d2
   add.l #40,d2
   move.l (sp),a0
   clr.l d3
   move.w 22(a0),d3
   lsl.l #1,d3
   move.l d3,-(sp)
   jsr Read(a6)               ;Instrument einlesen
   move.l (sp)+,d3
   cmp.l d3,d0
   beq C2
   move.b #8,d0
   bra Ende
C2:
   move.l Instr_Handle,d1
   move.l #1,d2
   jsr Close(a6)              ;Instrument_File schließen
   clr.l Instr_Handle
   move.l Sample_Adr,a0
   lea Default,a1
   move.b #20,d0
L2:
   move.w (a1)+,(a0)+         ;Default Parameter kopieren (20 Words)
   subq.b #1,d0
   bne L2
   move.l (sp),a0
   move.l Sample_Adr,a1       ;Korrigieren:
   move.w 22(a0),d1           ;Länge
   move.w d1,6(a1)
   add.w #19,d1
   move.w d1,4(a1)
   move.w d1,Hilf             ;in Hilf Länge des Samples in Words
   move.b 25(a0),d0           ;Sustain-Level
   move.b d0,24(a1)
   move.w 26(a0),d0           ;Loop-Points
   beq C3
   lsr.w #1,d0
   move.w d0,36(a1)
   add.w 28(a0),d0
   move.w d0,38(a1)
C3:
   move.l (sp)+,a0
   clr.l d0
   move.b (sp)+,d0            ;d0 = Offset des Namens
   add.l d0,a0
   lea Instr_Name,a1
   add.l #12,a1
L23:
   move.b (a0)+,(a1)+         ;Name an Instruments: anhängen
   tst.b -1(a0)
   bne L23
   move.l #Instr_Name,d1
   move.l #Mode_New,d2
   jsr Open(a6)               ;File öffnen
   move.l d0,Instr_Handle
   bne C4
   move.b #9,d0
   bra Ende
C4:
   move.l d0,d1
   move.l Sample_Adr,d2
   clr.l d3
   move.w Hilf,d3
   lsl.l #1,d3
   add.l #40,d3
   move.l d3,-(sp)
   jsr Write(a6)              ;neues Instrument schreiben
   move.l (sp)+,d3
   cmp.l d3,d0
   beq C5
   move.b #10,d0
   bra Ende
C5:
   move.l Instr_Handle,d1
   move.l #1,d2
   jsr Close(a6)              ;und wieder schliessen
   clr.l Instr_Handle
   rts

;-------- Ende des Programms -----------------------------------------

Ende:
   cmp.b #1,d0
   beq Schluss                ;kein Dos vorhanden
   move.b d0,-(sp)
   move.l Dos_Base,a6
   jsr Output(a6)
   move.l d0,d1               ;CLI_Handle
   clr.l d0
   move.b (sp),d0
   lsl.b #2,d0
   lea ErrTable,a0
   move.l 0(a0,d0),d2
   move.l 4(a0,d0),d3
   sub.l d2,d3
   jsr Write(a6)              ;Fehlermeldung ausgeben

   move.l Source_Handle,d1
   beq Ende2
   move.l #1,d2
   jsr Close(a6)              ;Source_File schließen
Ende2:
   move.l Instr_Handle,d1
   beq Ende3
   move.l #1,d2
   jsr Close(a6)              ;Instrument_File schließen
Ende3:
   move.l ExecBase,a6
   move.l Sample_Adr,d0
   beq Ende4
   move.l d0,a1
   move.l #33000,d0           ;Instrument Speicher freigeben
   jsr FreeMem(a6)
Ende4:
   move.l Source_Adr,d0
   beq Ende5
   move.l d0,a1
   move.l #66136,d0           ;ST-Song Speicher freigeben
   jsr FreeMem(a6)
Ende5:
   move.l Ziel_Adr,d0
   beq Ende6
   move.l d0,a1
   move.l #Puffer_Len,d0      ;SF-Music Speicher freigeben
   jsr FreeMem(a6)
Ende6:
   move.l Dos_Base,a1
   move.l ExecBase,a6
   jsr Close_Library(a6)      ;Dos_Library schließen

Schluss:
   move.l Stack_Old,sp
   clr.l d0
   rts

;---------------------- Default Parameter ----------------------------

even
Default:
   dc.b "IRQ",0,0,0,0,0,0,214,33,1,6,255,0,1,1,1,0,1,1,1,0,0
   dc.b 64,30,0,20,1,1,1,3,1,8,1,0,0,0,0,0
Instr_Name: dc.b "Instruments:------------------------"
even
ErrTable:
   dc.l Error0,Error2,Error2,Error3,Error4,Error5,Error6,Error7
   dc.l Error8,Error9,Error10,Error11,Error12,Error13,Error14
   dc.l Error15

Error0: dc.b 10,"Ok. Soundfactory-File is ready.",10,10
Error2: dc.b 10,"USAGE: ST-Converter [-n] <Soundtracker-Song>",10
        dc.b "-n = don't convert the Instruments.",10
        dc.b "Converts the ST-Song in a Soundfactory-Music in"
        dc.b " same Directory.",10,10
        dc.b "© 1989 Profiteam-Software !!",10,10
Error3: dc.b 10,"Bad args",10,10
Error4: dc.b 10,"Error while opening the Soundtracker Song-File.",10,10
Error5: dc.b 10,"Out of Memory Error.",10,10
Error6: dc.b 10,"Soundtracker-Song: Read Error.",10,10
Error7: dc.b 10,"Error while opening a ST-Instrument-File.",10,10
Error8: dc.b 10,"Read Error in a ST-Instrument-File !",10,10
Error9: dc.b 10,"Error while opening a SoundFactory-Instrument-File.",10,10
Error10: dc.b 10,"Write Error in a SF-Instrument-File !",10,10
Error11: dc.b 10,"Error while opening the Destination-File !",10,10
Error12: dc.b 10,"Write Error of the Destination-File !",10,10
Error13: dc.b 10,"Unknown Period.",10,10
Error14: dc.b 10,"Song is packed. please save it from ST normally.",10,10
Error15:

even
Dos_Name:         dc.b "dos.library",0
Stack_Old:        dc.l 0   ;alter Stackpointer
Dos_Base:         dc.l 0   ;Dos Basisadresse
Source_Handle:    dc.l 0   ;vom Soundtracker Song
File_Name:        blk.b 40,0 ;Platz für den Namen des ST-Songs
Source_Adr:       dc.l 0   ;Adresse des ST-Songs
Sample_Adr:       dc.l 0   ;Adresse der Samples
Instr_Handle:     dc.l 0   ;wie der Name schon sagt
Ziel_Adr:         dc.l 0   ;Zeiger auf Output-File
Hilf:             dc.w 0   ;Hilfsvariable
Inst_Flag:        dc.b 0   ;Flag, ob Instrumente auch convertieren
Speed:            dc.b 0   ;Aktueller Speed
Akt_Sound:        dc.b 0   ;Aktueller Sound
Vol_Flag:         dc.b 0   ;Flag, ob Vol verändert
PatternFlags:     blk.b 128,0    ;Flags

;--- © 1989 Profiteam! -----------------------------------------------

