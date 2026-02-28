; Seriennummer für Soundfactory
;
; © 1989 Profiteam Software!

ExecBase = 4          ;Const
Abstand = $8ca        ;Abstand der Seriennummer vom Fileanfang
Len = 2696            ;Länge von SF-Linker
Open_Library = -408   ;Exec-Sprungadressen
Close_Library = -414
AllocMem = -198
FreeMem = -210
Open = -30            ;Dos-Sprungadressen
Close = -36
Read = -42
Write = -48
Seek = -66
Output = -60
Mode_Old = 1005       ;Modi für File-öffnen
Mode_New = 1006

run:
   clr.l d3
   cmp.b #1,d0
   beq.s Lesen
   move.b #1,SchLes
   clr.w d0
NextZiffer:
   move.b (a0)+,d0
   cmp.b #10,d0
   beq.s Schreiben
   sub.b #48,d0
   cmp.b #10,d0
   bhs.L Error
   move.w Nummer,d1
   mulu #10,d1
   add.w d0,d1
   move.w d1,Nummer
   bra.s NextZiffer
Schreiben:
   lea SchreibText+8,a0
   bsr BINtoBCD
   lea SchreibText,a0
   move.b #89,d3
   bra.s Abz1
Lesen:
   lea LesText,a0
   move.b #85,d3
Abz1:
   bsr Print

Maus:
   btst #6,$bfe001
   beq.s DoIt
   btst #2,$dff016
   bne.s Maus
   beq Fertig
DoIt:
   move.l #Mode_old,d2
   tst.b SchLes
   beq.s m2
   move.l #RamFile,d1
   move.w #Mode_old,d2
   move.l Dos_Base,a6
   jsr Open(a6)
   move.l d0,Ram_Handle
   beq Error
   move.w #Mode_new,d2
m2:
   move.l #FileName,d1
   move.l Dos_Base,a6
   jsr Open(a6)
   move.l d0,File_Handle
   beq Error

   tst.b SchLes
   bne NrSchreiben
NrLesen:
   move.l d0,d1               ;File Handle
   move.l #-1,d3              ;Modus
   move.l #Abstand,d2         ;Abstand
   move.l Dos_Base,a6
   jsr Seek(a6)
   move.l File_Handle,d1
   move.l #Nummer,d2
   move.l #2,d3
   jsr Read(a6)
   cmp.b #2,d0
   bne Error
   bsr Decode
   lea Antwort+22,a0
   bsr BINtoBCD
   lea Antwort,a0
   move.l #30,d3
   bsr Print
   move.l File_Handle,d1
   move.l Dos_Base,a6
   jsr Close(a6)              ;File schliessen
   clr.l File_Handle
   bra Lesen

NrSchreiben:
   move.l #3000,d0            ;Speicher reservieren
   clr.l d1
   move.l ExecBase,a6
   jsr AllocMem(a6)
   move.l d0,Puffer
   beq Error

   move.l Ram_Handle,d1       ;Teil 1 einlesen
   move.l Puffer,d2
   move.l #Abstand,d3
   move.l Dos_Base,a6
   jsr Read(a6)
   cmp.l #Abstand,d0
   bne Error

   move.l File_Handle,d1       ;Teil 1 schreiben
   move.l Puffer,d2
   move.l #Abstand,d3
   jsr Write(a6)
   cmp.l #Abstand,d0
   bne Error

   move.l Ram_Handle,d1       ;2 Bytes überlesen
   move.l Puffer,d2
   move.l #2,d3
   jsr Read(a6)

   bsr Code                   ;Seriennummer schreiben
   move.l File_Handle,d1
   move.l #Nummer,d2
   move.l #2,d3
   jsr Write(a6)
   cmp.b #2,d0
   bne Error

   move.l Ram_Handle,d1       ;Teil 2 einlesen
   move.l Puffer,d2
   move.l #Len-Abstand-2,d3
   move.l Dos_Base,a6
   jsr Read(a6)
   cmp.l #Len-Abstand-2,d0
   bne Error

   move.l File_Handle,d1       ;Teil 2 schreiben
   move.l Puffer,d2
   move.l #Len-Abstand-2,d3
   jsr Write(a6)
   cmp.l #Len-Abstand-2,d0
   bne Error

   lea Antwort2,a0
   move.l #44,d3
   bsr Print
   bsr Decode
   addq.w #1,Nummer
   move.l File_Handle,d1
   move.l Dos_Base,a6
   jsr Close(a6)
   clr.l File_Handle
   move.l Ram_Handle,d1
   jsr Close(a6)
   clr.l Ram_Handle
   bra Schreiben

;------------------ Routinen ------------------ Variablen -------------

Code:
   move.w Nummer,d0
   ror.w #3,d0
   eor.w #113*256+117,d0
   move.w d0,Nummer
   rts

Decode:
   move.w Nummer,d0
   eor.w #113*256+117,d0
   rol.w #3,d0
   move.w d0,Nummer
   rts

BINtoBCD:
   clr.w d0
Loesch:
   move.b #" ",0(a0,d0.w)
   addq.b #1,d0
   cmp.b #4,d0
   bne.s Loesch
   clr.l d1
   move.w Nummer,d1
Ziffer2:
   divu #10,d1
   swap d1
   add.b #48,d1
   move.b d1,0(a0,d0.w)
   subq.b #1,d0
   clr.w d1
   swap d1
   tst.w d1
   bne.s Ziffer2
   rts

Print:                     ;a0=Text  d3=Len
   move.l a0,d2
   movem.l d2/d3,-(sp)
   tst.l Dos_Base
   bne.s SchonOffen
   lea Dos_Name,a1
   move.l ExecBase,a6
   jsr Open_Library(a6)    ;Dos_Library öffnen
   move.l d0,Dos_Base
SchonOffen:
   move.l Dos_Base,a6
   jsr Output(a6)
   movem.l (sp)+,d2/d3
   move.l d0,d1               ;CLI_Handle
   jsr Write(a6)              ;Text ausgeben
   rts

Error:
   lea ErrorTXT,a0
   move.l #29,d3
   bsr Print
Fertig:
   move.l File_Handle,d1
   beq.s Err1
   move.l Dos_Base,a6
   jsr Close(a6)              ;File schliessen
Err1:
   move.l Ram_Handle,d1
   beq.s Err2
   move.l Dos_Base,a6
   jsr Close(a6)              ;File schliessen
Err2:
   move.l Dos_Base,a1
   move.l ExecBase,a6
   jsr Close_Library(a6)      ;Dos_Library schließen
   move.l Puffer,d0
   beq.s Err3
   move.l d0,a1
   move.l #3000,d0
   jsr FreeMem(a6)
Err3:
   rts

Antwort:          dc.b "Die Seriennummer ist:      ",10,10,10,0
   even
Antwort2:         dc.b "Ok. (und schon wieder 129 DM verdient) !!?",10,10,0
   even
ErrorTXT:         dc.b "******* F E H L E R *******",10,10,0
   even
FileName:         dc.b "df0:Soundfactory/SF/SF-Linker",0
   even
RamFile:          dc.b "Ram:SF-Linker",0
   even
Dos_Name:         dc.b "dos.library",0
   even
SchreibText:      dc.b "Ser.Nr. 00000 SCHREIBEN in DF0:",10
                  dc.b "   linker Mausknopf = Start",10
                  dc.b "   rechter Mausknopf = Ende",10,10,0
   even
LesText:          dc.b "Seriennummer in DF0: LESEN:",10
                  dc.b "   linker Mausknopf = Start",10
                  dc.b "   rechter Mausknopf = Ende",10,10,0
   even
File_Handle:      dc.l 0   ;Handle für Linker
Ram_Handle:       dc.l 0   ;Handle für Ram:Linker
Dos_Base:         dc.l 0   ;Dos Basisadresse
Nummer:           dc.w 0   ;Seriennummer
Puffer:           dc.l 0   ;Zeiger auf Puffer
SchLes:           dc.w 0   ;Schreiben=0 oder Lesen=1

