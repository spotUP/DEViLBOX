  OPT O+,OW-

;***************************************************************
;                                                              *
;               IRQ-MUSIC-ASSEMBLER 05.8.1989 ¤                *
;   (mit Pfad als Instrumentname)                              *
;                   © 1989 by PROFITEAM !                      *
;                                                              *
;***************************************************************

ExecBase = 4
OldOpenLibrary = -408
CloseLib = -414
Open = -30
Close = -36
Output = -60
Read = -42
Write = -48
AllocMem = -198
FreeMem = -210
Lock = -84
UnLock = -90
Examine = -102
DeleteFile = -72
Mode_Old = 1005         ;CONST: Lesen
Mode_New = 1006         ;CONST: Schreiben

start:
   move.l sp,Stack_Old  ;Stackpointer retten (für den Fall eines Fehlers)
   lea SymTable,a1
   move.l a1,Last_Var   ;Letzter Eintrag ist Symtable (also 0)
   clr.l SymTable
   movem.l d0/a0,-(sp)
   move.l ExecBase,a6
   lea DOS_Name,a1
   jsr OldOpenLibrary(a6)
   move.l d0,DOS_Base
   move.l d0,a6         ;in A6 DOS-Base
   bne ok1
   move.b #1,d0
   bra Ende             ;falls Fehler, dann zu OpenError
ok1:
   jsr Output(a6)       ;Adresse des CLI-Handles bestimmen
   move.l d0,CLI_Handle

   movem.l (sp)+,d0/a0
   cmp.w #1,d0          ;kein Parameter ?
   bne Parameter
Usage:
   move.b #2,d0
   bra Ende             ;Helptext ausgeben und Ende

Parameter:
   lea SourceName,a1
Loop1:                  ;Source-Filenamen holen
   move.b (a0)+,(a1)+
   subq.w #1,d0
   bne Loop1
   clr.b -1(a1)         ;Filenamen mit 0 beenden
   cmp.b #".",-3(a1)
   bne Anhaengen
   cmp.b #"m",-2(a1)
   beq NixAnhaengen
   cmp.b #"M",-2(a1)
   beq NixAnhaengen
Anhaengen:
   move.b #".",-1(a1)
   move.b #"m",(a1)     ;eventuell noch .m anhängen
   clr.b 1(a1)
NixAnhaengen:
   lea DestName,a1
   lea SourceName,a0
Loop3:                  ;Destination-Filenamen bauen
   move.b (a0)+,(a1)+
   tst.b (a0)
   bne Loop3            ;zweiter Parameter bestimmt
   clr.b (a1)
   move.b #"a",-1(a1)   ; .a statt .m

   move.l #SourceName,d1
   move.l #-2,d2
   move.l Dos_Base,a6
   jsr Lock(a6)         ;Dateischlüssel ermitteln Modus 'lesen'
   move.l d0,d1
   bne FoundSource
   move.b #3,d0
   bra Ende
FoundSource:
   move.l d1,-(sp)
   move.l #260,d0
   clr.l d1
   move.l ExecBase,a6
   jsr AllocMem(a6)     ;Speicher füe FileInfo Block reservieren
   move.l d0,FileInfo
   bne FoundMem
   move.b #7,d0
   bra Ende
FoundMem:
   move.l d0,d2
   move.l (sp),d1
   move.l Dos_Base,a6
   jsr Examine(a6)      ;Datei-Informationen holen
   move.l FileInfo,a0
   move.l 124(a0),SourceLen   ;Länge des Source-Files bestimmen
   move.l (sp)+,d1
   jsr UnLock(a6)       ;Lock entfernen
   move.l FileInfo,a1
   move.l #260,d0
   move.l ExecBase,a6
   jsr FreeMem(a6)      ;Speicher wieder freigeben

   move.l SourceLen,d0
   clr.l d1
   jsr AllocMem(a6)     ;Speicher für Sourcefile reservieren
   move.l d0,SourceBlock
   bne AloocOk
   move.b #7,d0
   bra Ende
AloocOk:
   move.l #SourceName,d1
   move.l #Mode_Old,d2
   move.l DOS_Base,a6
   jsr Open(a6)         ;Source-File öffnen
   move.l d0,Source_Handle
   bne SourceOK
   move.b #3,d0
   bra Ende             ;Source-File Error und Ende
SourceOK:
   move.l Source_Handle,d1
   move.l SourceBlock,d2
   move.l SourceLen,d3
   jsr Read(a6)         ;gesamtes Sourcefile einlesen
   cmp.l SourceLen,d0
   beq ReadOK
   move.b #6,d0
   bra Ende
ReadOK:
   move.l Source_Handle,d1
   move.l #1,d2
   jsr Close(a6)        ;Sourcefile schliessen
   clr.l Source_Handle

   clr.b Pass           ;1. Pass
   move.b #4,Oktave

Pass_Loop:
   move.b Pass,d0
   add.b #49,d0
   move.b d0,PassNr+5
   moveq #7,d3
   move.l CLI_Handle,d1
   move.l #PassNr,d2
   move.l Dos_Base,a6
   jsr write(a6)           ;Pass ausgeben

   clr.w LineNr
   clr.b Cursor
   clr.b EOF_Flag
   clr.l SourcePtr      ;Zeiger auf nächstes Zeichen

   cmp.b #1,Pass        ;schon zweiter Pass ?
   bne Weiter1

   move.l #DestName,d1
   move.l #Mode_New,d2
   move.l Dos_Base,a6
   jsr Open(a6)         ;Destination-File öffnen
   move.l d0,Dest_Handle
   bne DestOK
   move.b #4,d0
   bra Ende             ;Dest.-File Error
DestOK:
   add.l #276,PrC
   move.l Dest_Handle,d1
   move.l #PrC,d2
   move.l #276,d3
   move.l Dos_Base,a6
   jsr Write(a6)
   cmp.l #-1,d0
   bne Weiter1
   move.b #5,d0
   bra Ende             ;Fehler beim Schreiben in Dest-File

PassNr:  dc.b "Pass 0",10,0

Weiter1:
   clr.l PrC
   bsr GetChar          ;nächstes Zeichen holen

;---------------------- Hauptschleife

MainLoop:               ;Assembler-Hauptschleife
   clr.b d0
   bsr HoleWort         ;Wort holen
   lea Wort,a1          ;a1 = Zeiger auf Wort
   move.b d6,d1         ;d1 = Länge vom Wort

   clr.l d5             ;Suchen des Namens in der Liste
SuchLoop:
   lea CommandsLen,a0
   move.b 0(a0,d5.w),d0 ;Länge des akt. Befehls
   bmi Kein_Opcode
   lea CommandsText,a0
   lsl.w #2,d5
   move.l 0(a0,d5.w),a0 ;Zeiger auf Namen des akt. Befehls
   bsr Compare_Words
   beq FoundCommand     ;Befehl gefunden
   lsr.w #2,d5
   addq.b #1,d5
   bra SuchLoop
Kein_Opcode:
   tst.b d1
   bne Variable
   tst.b EOF_Flag
   bne EndPass
Variable:
   bsr Hunt_Var
   cmp.l #0,a0
   beq New_Var
   tst.b pass
   bne Var2
   move.b #11,d0
   bra Ende
New_Var:
   move.b d1,d0
   bsr Var_Neu
   move.l PrC,4(a0)
   move.b #1,9(a0)
Var2:
   move.l a0,AktLabel
   bra MainLoop

EndPass:
   addq.b #1,pass
   cmp.b #1,pass
   beq Pass_Loop
   clr.l d0
   bra Ende

FoundCommand:          ;Musikbefehl ausführen !
   lea SprungAdr,a0
   move.l 0(a0,d5.w),a0
   jsr (a0)            ;Sprungadresse
   bra MainLoop

CommandsLen:           ;Wortlängen der Musikbefehle in Zeichen
   dc.b 1,1,1,1,1,1,1,1,1,1,3,4,5,8,6,5,4,3,4,7,3,7,4,3,6,4,7,7
   dc.b 7,8,7,10,7,6,4,5,2,3,4,3,9,255 ;<-- Endemarkierung

   even
CommandsText:          ;Zeiger auf die Schreibweisen der Befehle
   dc.l C_Txt,D_Txt,E_Txt,F_Txt,G_Txt,A_Txt,H_Txt,O_Txt,Z_Txt
   dc.l P_Txt,Vol_Txt,Tune_Txt,Sound_Txt,SetSound_Txt,Return_Txt
   dc.l Gosub_Txt,Goto_Txt,For_Txt,Next_Txt,FadeOut_Txt,NOP_Txt
   dc.l Request_Txt,Loop_Txt,End_Txt,FadeIn_Txt,ASR_Txt,OneShot_Txt
   dc.l Periode_Txt,Vibrato_Txt,Arpeggio_Txt,Phasing_Txt,Portamento_Txt
   dc.l Tremolo_Txt,Filter_Txt,Stimmen_Txt,Voice_Txt,PP_Txt
   dc.l Led_Txt,Wait_Txt,ARP_Txt,Trans_Txt

SprungAdr:              ;Zeiger auf die Routinen
   dc.l C_Cmd,D_Cmd,E_Cmd,F_Cmd,G_Cmd,A_Cmd,H_Cmd,O_Cmd,Z_Cmd
   dc.l P_Cmd,Vol_Cmd,Tune_Cmd,Sound_Cmd,SetSound_Cmd,Return_Cmd
   dc.l Gosub_Cmd,Goto_Cmd,For_Cmd,Next_Cmd,FadeOut_Cmd,NOP_Cmd
   dc.l Request_Cmd,Loop_Cmd,End_Cmd,FadeIn_Cmd,ASR_Cmd,OneShot_Cmd
   dc.l Periode_Cmd,Vibrato_Cmd,Arpeggio_Cmd,Phasing_Cmd,Portamento_Cmd
   dc.l Tremolo_Cmd,Filter_Cmd,Stimmen_Cmd,Voice_Cmd,PP_Cmd
   dc.l Led_Cmd,Wait_Cmd,ARP_Cmd,Trans_Cmd

C_Txt:            dc.b "C"
D_Txt:            dc.b "D"
E_Txt:            dc.b "E"
F_Txt:            dc.b "F"
G_Txt:            dc.b "G"
A_Txt:            dc.b "A"
H_Txt:            dc.b "H"
O_Txt:            dc.b "O"
Z_Txt:            dc.b "="
P_Txt:            dc.b "P"
PP_Txt:           dc.b "PP"
Vol_Txt:          dc.b "VOL"
Led_Txt:          dc.b "LED"
Wait_Txt:         dc.b "WAIT"
Tune_Txt:         dc.b "TUNE"
Sound_Txt:        dc.b "SOUND"
SetSound_Txt:     dc.b "SETSOUND"
Return_Txt:       dc.b "RETURN"
Gosub_Txt:        dc.b "GOSUB"
Goto_Txt:         dc.b "GOTO"
For_Txt:          dc.b "FOR"
Next_Txt:         dc.b "NEXT"
FadeOut_Txt:      dc.b "FADEOUT"
NOP_Txt:          dc.b "NOP"
Request_Txt:      dc.b "REQUEST"
Loop_Txt:         dc.b "LOOP"
End_Txt:          dc.b "END"
FadeIn_Txt:       dc.b "FADEIN"
ASR_Txt:          dc.b "ADSR"
OneShot_Txt:      dc.b "ONESHOT"
Periode_Txt:      dc.b "PERIODE"
Vibrato_Txt:      dc.b "VIBRATO"
Arpeggio_Txt:     dc.b "ARPEGGIO"
Phasing_Txt:      dc.b "PHASING"
Portamento_Txt:   dc.b "PORTAMENTO"
Tremolo_Txt:      dc.b "TREMOLO"
Filter_Txt:       dc.b "FILTER"
Stimmen_Txt:      dc.b "PLAY"
Voice_Txt:        dc.b "VOICE"
ARP_Txt:          dc.b "ARP"
Trans_Txt:        dc.b "TRANSPOSE"

   even
C_Cmd:            ;Noten
   move.b #0,d0
   bra Noten
D_Cmd:
   move.b #2,d0
   bra Noten
E_Cmd:
   move.b #4,d0
   bra Noten
F_Cmd:
   move.b #5,d0
   bra Noten
G_Cmd:
   move.b #7,d0
   bra Noten
A_Cmd:
   move.b #9,d0
   bra Noten
H_Cmd:
   move.b #11,d0
Noten:
   and.w #$00ff,d0
   clr.w d1
   move.b Oktave,d1
   mulu #12,d1          ;d1=Oktave*12
   add.w d1,d0          ;d0 enthält nun die Note
   clr.b d6             ;Flag, ob unangeschlagen
NotenLoop:
   tst.b EOF_Flag
   bne nixBesonderes
   cmp.b #"#",d7        ;Halbton rauf
   beq HalbeRauf
   cmp.b #"$",d7        ;Halbton runter
   beq HalbeRunter
   cmp.b #"*",d7        ;unangeschlagen
   bne nixBesonderes
   move.b #1,d6
   bra SonderSammel
HalbeRauf:
   addq.b #1,d0
   bra SonderSammel
HalbeRunter:
   subq.b #1,d0
SonderSammel:
   move.l d0,-(sp)
   bsr GetChar
   move.l (sp)+,d0
   bra NotenLoop
nixBesonderes:
   move.b d0,-(sp)
   move.b d6,-(sp)
   bsr GetAdr
   move.b (sp)+,d6
   tst.b d5
   bne noLen
   tst.w Wert
   bne IllQuant
noLen:
   move.w Wert+2,d1
   move.b (sp)+,d2
   tst.b ARP
   bne ARPisON
   move.b d2,d4
Fertig_ARP:
   move.w d1,d5
   bra Write_Note
ARPisON:
   clr.w d3
   lea ARP_Notes,a5
ARP__Loop:
   clr.w d0
   move.b 4(a5,d3.w),d0
   cmp.w d1,d0
   bls Cont_ARP
   move.b 0(a5,d3.w),d4
   add.b d2,d4
   bra Fertig_ARP
Cont_ARP:
   tst.w d0
   beq Next_ARP
   sub.w d0,d1
   move.w d0,d5
   move.b 0(a5,d3.w),d4
   add.b d2,d4
   bsr Write_Note
Next_ARP:
   addq.b #1,d3
   cmp.b #4,d3
   bne ARP__Loop
   tst.w d1
   beq Hehe
   bra ARPisON

Write_Note:             ;Note in d4, Len in d5.w
   move.b d4,d0
   bsr PrintByte
   move.w d5,d0
   tst.b d6
   beq angeschlagen
   or.w #$8000,d0
angeschlagen:
   bsr PrintWord
Hehe:
   rts

O_Cmd:            ;Oktave
   bsr GetAdr
   bne nixO
   cmp.l #9,Wert
   bhi IllQuant
   move.b Wert+3,Oktave
nixO:
   rts

P_Cmd:
   move.b #128,d0
   bsr PrintByte
   bsr GetAdr
   bne nixP
   tst.w Wert
   bne IllQuant   ;Illegal Quantity, falls Wert>Word
nixP:
   move.w Wert+2,d0
   bra PrintWord

PP_Cmd:
   move.b #153,d0
   bsr PrintByte
   bsr GetAdr
   bne naxP
   tst.w Wert
   bne IllQuant   ;Illegal Quantity, falls Wert>Word
naxP:
   move.w Wert+2,d0
   bra PrintWord

Trans_Cmd:           ;Transposebefehl
   move.b #156,d0
   bsr PrintByte
   bsr GetAdr
   bne noxp
   tst.l Wert
   bmi noxpp
   cmp.l #128,Wert
   bhs IllQuant      ;nur Bytewert
   bra noxp
noxpp:
   cmp.l #$ffffff80,Wert
   blo IllQuant
noxp:
   move.b Wert+3,d0
   bra PrintByte

Led_Cmd:
   move.b #154,d0
   bsr PrintByte
   bsr GetAdr
   bsr tstByte
   move.b Wert+3,d0
   bra PrintByte

Wait_Cmd:
   move.b #155,d0
   bsr PrintByte
   bsr GetAdr
   bsr tstByte
   move.b Wert+3,d0
   bra PrintByte

Vol_Cmd:
   move.b #129,d0
   bsr PrintByte
   bsr GetAdr
   bne nixVol
   bsr tstByte
nixVol:
   move.b Wert+3,d0
   addq.b #1,d0
   bra PrintByte

Tune_Cmd:
   move.b #130,d0
   bsr PrintByte
   bsr GetAdr
   bne nixTune
   move.l Wert,d0
   cmp.l #128,d0
   bcs nixTune       ;Wert > 128
   neg.l d0
   cmp.l #129,d0
   bcc IllQuant      ;Wert< -128
nixTune:
   move.b Wert+3,d0
   bra PrintByte

Sound_Cmd:
   move.b #131,d0
   bsr PrintByte
   bsr GetAdr
   bne NixSound
   tst.l Wert
   beq IllQuant
   cmp.l #33,Wert
   bcc IllQuant            ;Wert > 32
nixSound:
   move.b Wert+3,d0
   subq.b #1,d0
   bra PrintByte

SetSound_Cmd:
   btst #0,PrC+3
   beq keinNOP
   bsr NOP_Cmd             ;NOP einfügen, falls Prog.Counter ungerade
keinNOP:
   move.b #132,d0
   bsr PrintByte
   bsr GetAdr              ;Soundnr.
   bne nixSet
   move.l Wert,d0
   beq IllQuant
   cmp.l #33,d0
   bcc IllQuant            ;Soundnr. nicht in 1-32
nixSet:
   move.b Wert+3,d0
   subq.b #1,d0
   bsr PrintByte
   move.b #1,d0
   bsr HoleWort            ;Instrumentname holen
   lea Wort,a0
   clr.b 0(a0,d6.w)        ;Namen mit 0 abschließen
   move.l #SoundName,d1
   cmp.b #":",d7           ;Name mit : abgeschlossen ?
   bne.s OpenIt            ;falls nein, dann wie bisher
   move.b d7,0(a0,d6.w)    ;falls ja : anhängen
   addq.w #1,d6
   ext.l d6
   add.l d6,a0             ;a0 auf nach dem : stellen
   move.l a0,-(sp)
   move.b #1,d0
   bsr HoleWort2           ;Rest des Namens holen
   move.l (sp)+,a0
   clr.b 0(a0,d6.w)        ;am Schluss mit 0
   move.l #Wort,d1         ;Nun Gesamtname ab Wort, ohne Instruments
OpenIt:
   move.l #Mode_Old,d2
   move.l DOS_Base,a6
   jsr Open(a6)            ;File öffnen
   move.l d0,SoundHandle
   bne openOK
   move.b #12,d0           ;Cannot open
   bra Ende
openOK:
   move.l SoundHandle,d1
   move.l #Wort,d2         ;Puffer
   move.l #6,d3            ;6 Bytes  (Kennung und Länge)
   jsr Read(a6)
   cmp.b #6,d0
   beq RaadOK
   move.b #13,d0
   bra Ende
RaadOK:
   cmp.l #"IRQ"*256,Wort   ;Test auf IRQ,0
   beq CopyLoop
   move.b #14,d0           ;kein IRQ-Music file
   bra Ende
CopyLoop:
   clr.l d0
   move.w Wort+4,d0
   lsl.l #1,d0
   subq.l #2,d0
   move.l d0,-(sp)
   clr.l d1
   move.l ExecBase,a6
   move.l d0,SoundLen
   jsr AllocMem(a6)        ;Speicher für Sound reservieren
   move.l d0,SoundBlock
   bne AlocOk
   move.b #7,d0
   bra Ende
AlocOk:
   move.l d0,a0
   move.w Wort+4,(a0)      ;Länge schon eintragen
   move.l SoundHandle,d1
   move.l SoundBlock,d2
   addq.l #2,d2
   move.l (sp)+,d3
   subq.l #2,d3            ;ohne SetsoundLen.w
   move.l d3,-(sp)
   move.l Dos_Base,a6
   jsr Read(a6)            ;gesamtes SoundFile einlesen
   cmp.l (sp)+,d0
   beq Readed
   move.b #13,d0           ;Read Error
   bra Ende
Readed:
   addq.l #2,d0
   add.l d0,PrC            ;Sound in Destfile schreiben
   tst.b Pass
   beq CopyEnd
   move.l d0,-(sp)
   move.l Dest_Handle,d1
   move.l SoundBlock,d2
   move.l d0,d3
   jsr Write(a6)           ;Rest des Sounds schreiben
   cmp.l (sp)+,d0
   beq CopyEnd
   move.b #5,d0
   bra Ende
CopyEnd:
   move.l SoundHandle,d1
   move.l #1,d2
   jsr Close(a6)
   clr.l SoundHandle       ;damit nicht nochmal schließen
   move.l SoundLen,d0
   move.l SoundBlock,a1
   move.l ExecBAse,a6
   jsr FreeMem(a6)         ;Soundspeicher freigeben
   clr.l SoundBlock
   rts

Return_Cmd:
   move.b #133,d0
   bra PrintByte

Gosub_Cmd:
   move.b #134,d0
   bsr PrintByte
   bsr GetAdr
   move.l Wert,d0
   sub.l PrC,d0
   subq.l #4,d0      ;Ausgleich, damit Bezug auf Gosub+5
   swap d0
   bsr PrintWord
   swap d0
   bra PrintWord

Goto_Cmd:
   move.b #135,d0
   bsr PrintByte
   bsr GetAdr
   move.l Wert,d0
   sub.l PrC,d0
   subq.l #4,d0      ;Ausgleich, damit Bezug auf Goto+5
   swap d0
   bsr PrintWord
   swap d0
   bra PrintWord

For_Cmd:
   move.b #136,d0
   bsr PrintByte
   bsr GetAdr
   bne nixFor
   bsr tstByte
nixFor:
   move.b Wert+3,d0
   bra PrintByte

Next_Cmd:
   move.b #137,d0
   bra PrintByte

FadeOut_Cmd:
   move.b #138,d0
   bsr PrintByte
   bsr GetAdr
   bne nixOut
   bsr tstByte
nixOut:
   move.b Wert+3,d0
   bra PrintByte

NOP_Cmd:
   move.b #139,d0
   bra PrintByte

Request_Cmd:
   move.b #140,d0
   bra PrintByte

Loop_Cmd:
   move.b #141,d0
   bra PrintByte

End_Cmd:
   move.b #142,d0
   bra PrintByte

FadeIn_Cmd:
   move.b #143,d0
   bsr PrintByte
   bsr GetAdr
   bne nixIn
   bsr tstByte
nixIn:
   move.b Wert+3,d0
   bra PrintByte

ASR_Cmd:
   move.b #144,d0
   bsr PrintByte
   bsr GetAdr           ;Attackzeit
   bne nixAtt
   bsr tstByte
nixAtt:
   move.b Wert+3,d0
   bsr PrintByte
   bsr GetAdr           ;Sustainzeit
   bne nixSus
   bsr tstByte
nixSus:
   move.b Wert+3,d0
   bsr PrintByte
   bsr GetAdr
   bne nixLev
   move.l Wert,d0
   cmp.l #65,d0
   bcc IllQuant
nixLev:
   move.b Wert+3,d0
   bsr PrintByte
   bsr GetAdr
   bne KeinLabel        ;hier dürfen keine Labels verwendet werden
   move.b Wert+3,d0
   bsr PrintByte
   bsr tstBit
   bne zuRTS
   bsr GetAdr           ;ReleaseZeit
   bne nixRTi
   bsr tstByte
nixRTi:
   move.b Wert+3,d0
   bra PrintByte
zuRTS:
   rts

OneShot_Cmd:
   move.b #145,d0
   bra PrintByte

Periode_Cmd:
   move.b #146,d0
   bra PrintByte

Vibrato_Cmd:
   move.b #147,d0
   bra Phasing2      ;da gleiche Parameterfolge wie Phasing

ARP_Cmd:
   bsr GetAdr
   bne KeinLabel
   move.b Wert+3,d0
   bsr tstBit
   beq ARP_ON
   clr.b ARP
   rts
ARP_ON:
   move.b #1,ARP
   clr.w d5
   lea ARP_Notes,a5
ARP_LOOP:
   move.w d5,-(sp)
   bsr GetAdr
   move.w (sp),d5
   move.b Wert+3,0(a5,d5.w)
   bsr GetAdr
   move.w (sp)+,d5
   move.b Wert+3,4(a5,d5.w)
   addq.b #1,d5
   cmp.b #4,d5
   bne ARP_Loop
   rts

Arpeggio_Cmd:
   move.b #148,d0
   bsr PrintByte
   bsr GetAdr
   bne KeinLabel
   move.b Wert+3,d0
   bsr PrintByte
   bsr tstBit
   bne zuRTS
   move.b #1,d0
   bra Filt2          ;1 Parameter holen

Phasing_Cmd:
   move.b #149,d0
Phasing2:
   bsr PrintByte
   bsr GetAdr
   bne KeinLabel
   move.b Wert+3,d0
   bsr PrintByte
   bsr tstBit
   bne zuRTS
   move.b #4,d0
   bra Filt2         ;4 Parameter holen

Portamento_Cmd:
   move.b #150,d0
   bsr PrintByte
   bsr GetAdr
   bne KeinLabel
   move.b Wert+3,d0
   bsr PrintByte
   bsr tstBit
   bne zuRTS
   move.b #1,d0
   bsr Filt2         ;1 Parameter holen
   bsr GetAdr        ;Schrittweite holen (Word)
   bne Port1
   tst.w Wert
   bne IllQuant
Port1:
   move.w Wert+2,d0
   bra PrintWord

Tremolo_Cmd:
   move.b #151,d0
   bra Filter2       ;da gleiche Parameterfolge wie Filter

Filter_Cmd:
   move.b #152,d0
Filter2:
   bsr PrintByte
   bsr GetAdr
   bne KeinLabel
   move.b Wert+3,d0
   bsr PrintByte
   bsr tstBit
   bne zuRTS
   move.b #3,d0      ;3 Parameter holen
Filt2:
   move.b d0,-(sp)
   bsr GetAdr        ;Parameter holen
   bne Filt1
   bsr tstByte
Filt1:
   move.b Wert+3,d0
   bsr PrintByte
   move.b (sp)+,d0
   subq.b #1,d0
   bne Filt2
   rts

tstByte:                ;Wert testen, ob Byte: Error falls größer
   cmp.l #$100,Wert
   bcc IllQuant
   rts

tstBit:                 ;Wert testen, ob Bit: Error falls größer
   cmp.l #1,Wert
   bhi IllQuant         ;Z-Flag gesetzt, falls 1
   rts

Z_Cmd:                  ;Zuweisung  (=)
   bsr GetAdr
   move.l AktLabel,a0
   tst.b d5
   beq inOrd
   clr.b 9(a0)
   bra MainLoop
inOrd:
   move.l wert,4(a0)
   move.b #1,9(a0)
   bra MainLoop

Stimmen_Cmd:
   bsr GetAdr
   beq StimOk
   move.b #9,d0
   bra Ende
StimOk:
   move.l Wert,d0
   and.l #$fffffff0,d0
   beq StimOk2
IllQuant:         ;Illegal Quantity Error
   move.b #10,d0
   bra Ende
StimOk2:
   move.l a0,-(sp)
   lea Stimmen,a0
   move.b Wert+3,d0
   move.b #16,d1
ST_LP_1:
   move.b d0,(a0)+
   subq.b #1,d1
   bne ST_LP_1
   move.l (sp)+,a0
   move.b #1,StimmenFlag
   bra MainLoop

Voice_Cmd:
   bsr GetAdr
   beq VoicOk
KeinLabel:
   move.b #9,d0
   bra Ende
VoicOk:
   move.l Wert,d0
   subq.l #1,d0
   and.l #$fffffff0,d0
   beq Voi_1
   move.b #10,d0
   bra Ende
Voi_1:
   move.b Wert+3,-(sp)      ;Musikstücknr.
   bsr GetAdr
   move.l Wert,d0
   subq.l #1,d0
   and.l #$fffffffc,d0
   beq VoicOk2
   move.b #10,d0
   bra Ende
VoicOk2:
   move.b wert+3,d0
   clr.w d1
   subq.b #1,d0             ;d0 = Voice Nr. (0-3)
   move.b (sp)+,d1
   subq.b #1,d1             ;d1 = Music Nr. (0-15)
   tst.b StimmenFlag
   bne nichtSetzen
   lea Stimmen,a0
   bset d0,0(a0,d1.w)       ;Bit setzen
nichtSetzen:
   lsl.b #2,d0
   lsl.b #4,d1
   or.b d1,d0
   lea Zeiger,a0
   move.l PrC,d1
   add.l #276,d1
   move.l d1,0(a0,d0.w)    ;Zeiger:=Prog.Counter+276 (Offset)
   bra MainLoop

;----------------------- Schreiben von Daten in das DestinationFile

PrintByte:
   movem.l d0/d1/d2/d3/d4/d5/d6/d7/a0/a1/a2/a3/a4/a5/a6,-(sp)
   tst.b Pass
   beq NotYet
   move.b d0,CharPuffer
   move.l #CharPuffer,d2
   move.l Dest_Handle,d1
   move.l #1,d3
   move.l Dos_Base,a6
   jsr Write(a6)
   cmp.b #1,d0
   beq NotYet
   move.b #5,d0
   bra Ende
NotYet:
   addq.l #1,PrC
   movem.l (sp)+,d0/d1/d2/d3/d4/d5/d6/d7/a0/a1/a2/a3/a4/a5/a6
   rts

PrintWord:
   move.b d0,-(sp)
   lsr.w #8,d0
   bsr PrintByte
   move.b (sp)+,d0
   bra PrintByte

Var_Neu:                ;Legt einen neuen Namen an (Variable)
                        ;A1=Name, D0=Namlen, (<) A0=Zeiger auf Eintrag
   and.l #$000000ff,d0
   move.b d0,-(sp)
   add.b #10,d0
   move.l #$10000,d1    ;Speicher löschen
   move.l ExecBase,a6
   move.l a1,-(sp)
   jsr AllocMem(a6)     ;Speicher anfordern
   move.l (sp)+,a1
   move.l d0,a0
   tst.l d0
   bne MemOK
   move.b #7,d0
   bra Ende             ;Out of Memory
MemOK:
   move.l Last_Var,a2
   move.l d0,(a2)       ;Zeiger des letzten Eintrags auf diesen stellen
   move.l d0,Last_Var   ;Dieser Eintrag ist nun der letzte
   move.b (sp)+,d0
   move.b d0,8(a0)      ;Namlen eintragen
   move.w #10,d1
Loop_X:
   move.b (a1)+,0(a0,d1.w)
   addq.b #1,d1
   subq.b #1,d0
   bne Loop_X
   rts

Hunt_Var:               ;Sucht einen Namen in der Symboltabelle
                        ;A1=Name, D1=Namlen (<) A0=Zeiger oder 0
   move.l SymTable,a0
Hunt_Loop:
   cmp.l #0,a0
   beq NotFound
   move.b 8(a0),d0
   adda.l #10,a0
   bsr Compare_Words    ;Vergleich
   beq Found
   move.l -10(a0),a0    ;Nächsten Zeiger holen
   bra Hunt_Loop
Found:
   suba.l #10,a0
NotFound:
   rts

ClearSymTable:          ;löscht die Symboltabelle
   move.l SymTable,a1
Clear_Loop:
   cmp.l #0,a1
   beq NotFound         ;fertig
   move.l (a1),-(sp)    ;nächsten Zeiger retten
   move.b 8(a1),d0
   add.b #10,d0         ;Länge des Eintrags
   jsr FreeMem(a6)      ;Speicher freigeben
   move.l (sp)+,a1      ;Nächsten Zeiger holen
   bra Clear_Loop

   even
Wert: dc.l 0            ;Enthält den Wert aus Getadr

Space_Ueberlesen:       ;Überliest Spaces
   cmp.b #" ",d7
   bne herrlich
   tst.b EOF_Flag
   bne herrlich
   bsr GetChar
   bra Space_Ueberlesen
herrlich:
   rts

GetAdr:                 ;Holt einen numerischen Ausdruck
   move.b #"+",d4       ;d4=Verknüpfungszeichen
   clr.l Wert           ;Wert löschen
   move.b #0,d5         ;Wert ok:=true
   tst.b EOF_Flag
   bne AdrEnde
   bsr Space_Ueberlesen
   cmp.b #",",d7
   bne AdrLoop2
Testen:
   tst.b EOF_Flag
   bne AdrEnde
   bsr Getchar
AdrLoop2:
   bsr Space_Ueberlesen
   cmp.b #"+",d7
   beq Verknpf
   cmp.b #"-",d7
   bne Adr2
Verknpf:
   move.b d7,d4         ;Verknüpfungszeichen neu
   bra Testen
Adr2:
   cmp.b #",",d7
   beq AdrEnde
   cmp.b #":",d7
   beq AdrEnde
   cmp.b #";",d7
   beq AdrEnde
   cmp.b #10,d7
   beq AdrEnde
   cmp.b #13,d7
   bne Adr3
AdrEnde:
   tst.b d5
   rts
Adr3:
   cmp.b #"0",d7
   bcs SyntaxE
   cmp.b #"9",d7
   bls Ziffer
   cmp.b #"A",d7
   bcs SyntaxE
   cmp.b #"Z",d7
   bls Buchstabe
SyntaxE:
   move.b #8,d0
   bra Ende

Ziffer:
   bsr Getzahl          ;Holt Zahl in d0
   cmp.b #"+",d4
   bne Abzieh
   add.l d0,Wert
   bra AdrLoop2
Abzieh:
   sub.l d0,Wert
   bra AdrLoop2

GetZahl:                ;Holt Zahl in d0
   clr.l d0
ZahlLoop:
   mulu #10,d0
   sub.b #"0",d7
   add.w d7,d0
   tst.b EOF_Flag
   bne ZahlEnde
   bsr GetChar
   cmp.b #"0",d7
   bcs ZahlEnde
   cmp.b #"9",d7
   bls ZahlLoop
ZahlEnde:
   rts

Buchstabe:
   clr.b d0
   bsr HoleWort
   lea Wort,a1
   move.b d6,d1
   bsr Hunt_Var
   cmp.l #0,a0
   bne Buch1
Undefiniert:
   move.b #1,d5         ;Wert ungültig, da unbekanntes Label verwendet
   tst.b Pass
   beq Glueck
   move.b #9,d0
   bra Ende             ;Undefined Label in Pass 2
Buch1:
   tst.b 9(a0)
   beq Undefiniert
Glueck:
   move.l Wert,d0
   cmp.b #"+",d4
   bne Abziehen
   add.l 4(a0),d0
   bra Buch2
Abziehen:
   sub.l 4(a0),d0
Buch2:
   move.l d0,Wert
   bra AdrLoop2

Compare_Words:          ;Vergleicht zwei Wörter miteinander Erg in Flags
   movem.l d0/a0/a1,-(sp)
   cmp.b d0,d1          ;in a0 und a1 Zeiger auf Wörter, d0 & d1 Wortlänge
   bne NixGleich
Compare_Loop:
   move.b (a0)+,d2
   cmp.b (a1)+,d2
   bne NixGleich
   subq.b #1,d0
   bne Compare_Loop
NixGleich:
   movem.l (sp)+,d0/a0/a1
   rts

GetChar:                ;holt ein Zeichen aus dem Source-File
   movem.l d0/d1/d2/d3/a0,-(sp)
   move.l #" ",d7
   tst.b EOF_Flag
   bne NixChar
   move.l SourcePtr,d1
   cmp.l SourceLen,d1
   bne NotEnd
   move.b #1,EOF_Flag
   bra NixChar
NotEnd:
   move.l SourceBlock,a0
   move.b 0(a0,d1),d7    ;Zeichen aus dem Sourcefile holen
   addq.l #1,SourcePtr     ;Zeiger erhöhen
   cmp.b #10,d7
   bne noLineFeed
   addq.w #1,LineNr
   move.w LineNr,d0
   and.b #15,d0
   bne notshow
   move.b #7,d3
   bsr ShowLineNr          ;Zeilennr. ausgeben
notshow:
   move.b cursor,cursoralt
   clr.b Cursor
   bra GoOn
noLineFeed:
   clr.w d0
   move.b cursor,d0
   lea Line,a6
   move.b d7,0(a6,d0.w)
   clr.b 1(a6,d0.w)
   addq.b #1,Cursor
GoOn:
   cmp.b #"ä",d7
   beq UpCase
   cmp.b #"ü",d7
   beq UpCase
   cmp.b #"ö",d7
   beq UpCase
   cmp.b #"a",d7
   bcs NixChar
   cmp.b #"z",d7
   bhi NixChar
UpCase:
   sub.b #"a"-"A",d7
NixChar:
   movem.l (sp)+,d0/d1/d2/d3/a0
   rts

ShowLineNr:             ;Zeigt Zeilennummer an
   move.w #4,d0
   lea SLine,a0
   clr.l d1
   move.w LineNr,d1
Show_Nr:
   divu #10,d1
   swap d1
   add.b #48,d1
   move.b d1,0(a0,d0.w)
   clr.w d1
   swap d1
   subq.b #1,d0
   bpl Show_Nr
   and.l #$f,d3
   move.l CLI_Handle,d1
   move.l a0,d2
   move.l Dos_Base,a6
   jsr write(a6)           ;Zeilennr ausgeben
   rts

SLine: dc.b "00000",10,11,10

Ende:                   ;Fehlerbehandlung
   and.l #$000000ff,d0
   move.l d0,ErrorNr
   move.b d0,-(sp)
   cmp.b #1,d0
   beq Schluss
   move.w d0,-(sp)
   move.b #8,d3
   bsr ShowLineNr
   move.w (sp)+,d0
   move.l CLI_Handle,d1
   lsl.b #2,d0
   lea ErrTable,a0
   move.l 0(a0,d0.w),d2
   move.l 4(a0,d0.w),d3
   sub.l d2,d3
   move.l Dos_Base,a6
   jsr Write(a6)        ;Fehlermeldung ausgeben
   tst.b (sp)
   bne Error
   move.b #7,(sp)       ;Fehler 7, wenn 0, damit alles schliessen
Error:
   cmp.b #8,(sp)
   bcs Ende1            ;Zeile ausgeben?
   clr.l d3
   move.b Cursor,d3
   bne woiter
   move.b CursorAlt,d3
   subq.w #1,LineNr
woiter:
   addq.w #1,LineNr      ;aus Zeile 0 wird 1 usw.
   move.w #4,d0
ZLoop:
   clr.l d1
   move.w LineNr,d1
   divu #10,d1
   move.w d1,LineNr
   clr.w d1
   swap d1
   add.b #48,d1
   lea InLine,a0
   move.b d1,0(a0,d0.w)  ;Ziffer in Text eintragen
   subq.b #1,d0
   bpl ZLoop

   addq.b #2,d3
   lea Line,a0
   move.b #$0a,-2(a0,d3.w)
   move.b #$0a,-1(a0,d3.w) ;noch 2 LF
   addq.b #6,d3
   move.l CLI_Handle,d1
   move.l #InLine,d2
   jsr write(a6)           ;Zeilennummer und Zeile ausgeben

Ende1:
   move.l SoundHandle,d1   ;Sound-File geöffnet?
   beq Ende0
   move.l #1,d2
   move.l Dos_Base,a6
   jsr Close(a6)           ;Sound-File schließen
Ende0:
   move.l Dest_Handle,d1
   beq Ende2
   move.l #1,d2
   move.l Dos_Base,a6
   jsr Close(a6)
   tst.l ErrorNr
   beq Ende2             ;Falls Fehler<>0, dann File wieder löschen
   move.l #DestName,d1
   jsr DeleteFile(a6)
Ende2:
   move.l Source_Handle,d1
   beq Ende3
   move.l Dos_Base,a6
   move.l #1,d2
   jsr Close(a6)           ;Source-File schliessen
Ende3:
   move.l Dos_Base,a1
   move.l ExecBase,a6
   jsr CloseLib(a6)
   bsr ClearSymTable       ;Symboltabelle löschen
   move.l SoundBlock,d0
   beq Ende4
   move.l d0,a1
   move.l SoundLen,d0
   jsr FreeMem(a6)         ;Speicher für Sound freigeben
Ende4:
   move.l SourceBlock,d0
   beq Schluss
   move.l d0,a1
   move.l SourceLen,d0
   jsr FreeMem(a6)         ;Speicher für Sourcefile freigeben
Schluss:
   move.l Stack_Old,sp
   move.l ErrorNr,d0
   rts

ErrTable:
   dc.l Error1,Error2,Error2,Error3,Error4,Error5,Error6,Error7,Error8
   dc.l Error9,Error10,Error11,Error12,Error13,Error14,Error15
Fall: dc.w 0             ;1, falls Instrumentname, sonst 0

HoleWort:               ;Holt einen String nach Wort
   lea Wort,a0
HoleWort2:
   move.b d0,Fall
   clr.l d6             ;in d6 Wortlänge
   bsr Muell_Ueberlesen ;überliest alles bis zu einem Buchstaben
   tst.b EOF_Flag
   bne WortEnde
   cmp.b #"=",d7
   bne HoleLoop
   move.b d7,Wort
   move.w #1,d6
   bra GetChar          ;Gleichheitszeichen geholt und Ende
HoleLoop:
   move.b d7,0(a0,d6.w)
   addq.b #1,d6
   bsr GetChar
   tst.b EOF_Flag
   bne WortEnde

   tst.b Fall
   beq keinInstr
   cmp.b #"+",d7
   beq HoleLoop
   cmp.b #"-",d7
   beq HoleLoop
   cmp.b #"/",d7
   beq HoleLoop
keinInstr:
   cmp.b #".",d7
   beq HoleLoop
   cmp.b #"_",d7
   beq HoleLoop
   cmp.b #"Ä",d7
   beq HoleLoop
   cmp.b #"Ö",d7
   beq HoleLoop
   cmp.b #"Ü",d7
   beq HoleLoop
   cmp.b #"ß",d7
   beq HoleLoop
   cmp.b #"Z",d7
   bhi WortEnde
   cmp.b #"A",d7
   bcc HoleLoop
   cmp.b #"9",d7
   bhi WortEnde
   cmp.b #"0",d7
   bcs WortEnde
   cmp.b #1,d6          ;es ist eine Zahl
   bne HoleLoop         ;und vorher war nur ein Buchstabe
   move.b Wort,d0
   cmp.b #"O",d0
   beq WortEnde         ;und der war von  O,P,C,D,E,F,G,A,H
   cmp.b #"P",d0
   beq WortEnde
   cmp.b #"C",d0
   beq WortEnde
   cmp.b #"D",d0
   beq WortEnde         ;dann schon Wort beenden
   cmp.b #"E",d0
   beq WortEnde
   cmp.b #"F",d0
   beq WortEnde
   cmp.b #"G",d0
   beq WortEnde
   cmp.b #"A",d0
   beq WortEnde
   cmp.b #"H",d0
   bne HoleLoop         ;sonst in Schleife zurück
WortEnde:
   rts

Muell_Ueberlesen:       ;Überliest alles bis zum nächsten Buchstaben
   tst.b EOF_Flag
   bne WortEnde
   cmp.b #" ",d7
   beq Muell1
   cmp.b #":",d7
   beq Muell1
   cmp.b #",",d7
   beq Muell1
   cmp.b #10,d7
   beq Muell1
   cmp.b #13,d7
   beq Muell1
   cmp.b #"=",d7
   beq WortEnde
   cmp.b #"-",d7
   beq WortEnde
   cmp.b #"A",d7
   bcs Muell2
   cmp.b #"Z",d7
   bls WortEnde
Muell2:
   cmp.b #";",d7
   bne SyntaxError
Muell_Loop:             ;Kommentar, also Rest der Zeile überlesen
   bsr GetChar
   tst.b EOF_Flag
   bne WortEnde
   cmp.b #10,d7
   beq Muell_Ueberlesen
   cmp.b #13,d7
   beq Muell_Ueberlesen
   bne Muell_Loop
Muell1:
   bsr GetChar
   bra Muell_Ueberlesen

SyntaxError:            ;Syntax-Error ausgeben und beenden
   move.b #8,d0
   bra Ende

Error1:   dc.b 10,"Ok, music-objectfile generated !",10,10
Error2:   dc.b "USAGE:",10,10
          dc.b "SF-ASS <music-sourcefile[.m]>",10
          dc.b "© 1989 Profiteam Software !!",10,10
Error3:   dc.b 10,"Cannot open sourcefile error !",10,10
Error4:   dc.b 10,"Cannot open destinationfile error !",10,10
Error5:   dc.b 10,"Error while writing to destination !",10,10
Error6:   dc.b 10,"Error while reading from source !",10,10
Error7:   dc.b 10,"Out of memory error !",10,10
Error8:   dc.b 10,"Syntax error !!",10,10
Error9:   dc.b 10,"Undefined label or variable !",10,10
Error10:  dc.b 10,"Illegal quantity error !",10,10
Error11:  dc.b 10,"Redefinition error !",10,10
Error12:  dc.b 10,"Cannot open instrument !",10,10
Error13:  dc.b 10,"Error while reading from instrument !",10,10
Error14:  dc.b 10,"Not a SOUNDFACTORY instrument !",10,10
Error15:

   even
DOS_Name:               dc.b "dos.library",0
DOS_Base:               dc.l 0
CLI_Handle:             dc.l 0
Source_Handle:          dc.l 0
Dest_Handle:            dc.l 0
Stack_Old:              dc.l 0            ;Enthält Stack der Hauptebene
SymTable:               dc.l 0            ;Wurzelzeiger der Symboltabelle
Last_Var:               dc.l 0            ;Zeiger auf letzten Eintrag " "
FileInfo:               dc.l 0            ;Zeiger auf FileInfo Block
SourceBlock:            dc.l 0            ;Zeiger auf Sourcefile Speicher
SoundBlock:             dc.l 0            ;Zeiger auf Speicher für Sounds
SoundLen:               dc.l 0            ;Länge des Sounds
SourceLen:              dc.l 0            ;Länge des Source-Files
SourcePtr:              dc.l 0            ;Zeiger auf nächstes Zeichen
SourceName:             dcb.b 60,0        ;Puffer für Source-Filename
DestName:               dcb.b 60,0        ;Puffer für Destination-Filename
Soundname:              dc.b "Instruments:"
Wort:                   dcb.b 80,0        ;Puffer für Wort einlesen
SoundHandle:            dc.l 0            ;Handle für Soundfiles
AktLabel:               dc.l 0            ;Zeiger auf akt. Variable
CharPuffer:             dc.b 0            ;Puffer für GetChar
Pass:                   dc.b 0            ;Assemblerdurchlaufzähler
EOF_Flag:               dc.b 0            ;Flag, ob Ende des Files erreicht
Oktave:                 dc.b 0            ;Oktave
InLine:                 dc.b "00000:"
Line:                   dcb.b 79,32
Cursor:                 dc.b 0
LineNr:                 dc.w 0
CursorAlt:              dc.b 0
StimmenFlag:            dc.b 0            ;Flag, ob Stimmen angegeben ist
ARP:                    dc.b 0            ;ARP Mode
   even
ARP_Notes:              dcb.b 8,0         ;ARP Noten und Längen
ErrorNr:                dc.l 0            ;Nr. des Error für Rückgabe
   even
PrC:                    dc.l 0         ; | Programmzähler
Stimmen:                dcb.b 16,0     ; | Eingeschaltete Stimmen (16 Songs)
Zeiger:                 dcb.l 64,276   ; | 16x4 Zeiger auf Daten

;-------------------------------------------------------- © 1989 Profiteam!
