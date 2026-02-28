; SF-Linker zu Soundfactory   09.07.1989
;
; © 1989 Profiteam Software!

ExecBase = 4                        ;Const
Irq_Music_roh = 5066                ;Länge von "IRQ_Music.Code"
Irq_Music_Kopf = 748                ; = Folge1-CLI_Anfang
Irq_Music_Len = Irq_Music_roh+Irq_Music_Kopf       ;Summe
Open_Library = -408   ;Exec-Sprungadressen
Close_Library = -414
AllocMem = -198
FreeMem = -210
Signal = -324
Wait = -318
AllocSignal = -330
FreeSignal = -336
Open = -30            ;Dos-Sprungadressen
Close = -36
Read = -42
Write = -48
Seek = -66
Output = -60
Forbid = -132
Permit = -138
Disable = -120
Enable = -126
OpenDevice = -444
CloseDevice = -450
DeleteFile = -72
Mode_Old = 1005       ;Modi für File-öffnen
Mode_New = 1006

Start:
   move.l sp,Stack_Old     ;Stackpointer retten
   movem.l d0/a0,-(sp)
   lea Dos_Name,a1
   move.l ExecBase,a6
   jsr Open_Library(a6)    ;Dos_Library öffnen
   move.l d0,Dos_Base
   bne.s m1
   move.b #1,d0            ;Fehler beim öffnen der Dos_Library
   bra Ende
m1:
   movem.l (sp)+,d0/a0
   cmp.b #1,d0
   bne.s m2
   move.b #2,d0            ;Kein Parameter angegeben -> USAGE
   bra Ende
m2:
   lea File_Name,a1
loop1:
   move.b (a0)+,(a1)+
   subq.b #1,d0
   bne.s loop1             ;Source-Namen holen
   clr.b -1(a1)            ;mit 0 abschließen
   cmp.b #".",-3(a1)       ;Abfrage auf .a
   bne Anhaengen
   cmp.b #"A",-2(a1)
   beq NixAnhaengen
   cmp.b #"a",-2(a1)
   beq NixAnhaengen
Anhaengen:                 ;hängt ein .a an den Namen an
   move.b #".",-1(a1)
   move.b #"a",(a1)
   clr.b 1(a1)
   add.l #2,a1
NixAnhaengen:
   move.l a1,-(sp)
   move.l #File_Name,d1
   move.l #Mode_Old,d2
   move.l Dos_Base,a6
   jsr Open(a6)            ;Source-File öffnen
   move.l d0,Source_Handle
   bne m3
   move.b #3,d0
   bra Ende
m3:
   move.l (sp)+,a1
   clr.b -3(a1)               ;.a wegstreichen
   move.l d0,d1
   move.l #Puffer,d2
   move.l #4,d3
   jsr Read(a6)               ;22 Bytes einlesen
   cmp.b #4,d0
   beq m34
   move.b #6,d0
   bra Ende                   ;Lesefehler
m34:
   move.l Puffer,d0           ;Länge des Soundfiles holen
   add.l #IRQ_Music_Len,d0
   move.l d0,Hilf
   move.b d0,d1
   and.b #3,d1
   beq.s m4
   addq.l #4,d0               ;auf 4er Adresse aufstocken
m4:
   addq.l #4,d0
   lsr.l #2,d0
   move.l d0,Hunk_Len
   lsl.l #2,d0
   sub.l Hilf,d0
   move.l d0,hilf
   move.l #IRQ_Music,d1
   move.l #Mode_Old,d2
   jsr Open(a6)               ;IRQ_Music.code öffnen
   move.l d0,Music_Handle
   bne.s m5
   move.b #4,d0
   bra Ende
m5:
   move.l #File_Name,d1       ;Destination-File öffnen
   move.l #Mode_New,d2
   jsr Open(a6)
   move.l d0,Dest_Handle
   bne.s m6
   move.b #5,d0
   bra Ende
m6:
   move.l Hunk_Len,d0
   move.l d0,Folge1+32        ;Länge des 1. Hunks
   move.l d0,Folge1+20        ;Folge 1 ergänzen
   move.b #$40,Folge1+20      ;automatisches Laden ins CHIP-MEM
   move.l Dest_Handle,d1
   move.l #Folge1,d2
   move.l #36,d3
   jsr Write(a6)
   cmp.b #36,d0
   beq m7
   move.b #8,d0
   bra Ende                   ;Write Error
m7:
   move.l #IRQ_Music_Len,d0
   clr.l d1
   move.l ExecBase,a6
   move.l d0,Big_Puffer_Len
   jsr AllocMem(a6)           ;Speicher für IRQ_Music reservieren
   move.l d0,Big_Puffer
   bne m78
   move.b #9,d0               ;Kann keinen Speicher reservieren
   bra Ende
m78:
   move.l Dos_Base,a6
   move.l Music_Handle,d1
   move.l Big_Puffer,d2
   move.l #IRQ_Music_roh,d3   ;Länge ohne Kopf
   jsr Read(a6)               ;IRQ_Music-file einlesen
   cmp.l #IRQ_Music_roh,d0
   beq m8
   move.b #7,d0
   bra Ende                   ;Lesefehler
m8:
   move.l #CLI_Anfang,d2
   move.l Dest_Handle,d1
   move.l #Irq_Music_Kopf,d3
   jsr Write(a6)              ;Kopf des IRQ-Music Anfangs schreiben
   cmp.l #Irq_Music_Kopf,d0   ;gehört eigentlich zu IRQ-Music, ist jedoch
   beq m89                    ;nicht auf Diskette mit dem Rest des Files
   move.b #8,d0               ;sondern in dem Linker, damit Disketten-
   bra Ende                   ;version dir Rohversion ist.
m89:
   move.l Dest_Handle,d1
   move.l Big_Puffer,d2
   move.l #IRQ_Music_roh,d3
   jsr Write(a6)              ;und in Dest-File schreiben
   cmp.l #IRQ_Music_roh,d0
   beq m9
   move.b #8,d0
   bra Ende                   ;Write Error
m9:
   move.l Source_Handle,d1
   move.l #-1,d3
   clr.l d2
   jsr Seek(a6)               ;Sourcefilezeiger auf Fileanfang
   move.l Big_Puffer,a1
   move.l Big_Puffer_Len,d0
   move.l ExecBase,a6
   jsr FreeMem(a6)
   move.l Puffer,d0           ;Länge des Musikstückes
   clr.l d1
   jsr AllocMem(a6)
   move.l d0,Big_Puffer
   bne mA
   move.b #9,d0
   bra Ende                   ;Allocate Error
mA:
   move.l Puffer,Big_Puffer_Len
   move.l Dos_Base,a6
   move.l Source_Handle,d1
   move.l Big_Puffer,d2
   move.l Big_Puffer_Len,d3
   jsr Read(a6)               ;Source-file einlesen
   cmp.l Big_Puffer_Len,d0
   beq t8
   move.b #6,d0
   bra Ende                   ;Lesefehler
t8:
   move.l Dest_Handle,d1
   move.l Big_Puffer,d2
   move.l Big_Puffer_Len,d3
   jsr Write(a6)              ;und in Dest-File schreiben
   cmp.l Big_Puffer_Len,d0
   beq t9
   move.b #8,d0
   bra Ende                   ;Write Error
t9:
   move.l Dest_Handle,d1
   move.l #Puffer,d2
   clr.l d3
   move.b Hilf+3,d3
   jsr Write(a6)              ;noch ein paar bytes zur Abrundung
   cmp.b hilf+3,d0
   beq t7
   move.b #8,d0
   bra Ende                   ;Write Error
t7:
   move.l Dest_Handle,d1
   move.l #Folge2,d2
   move.l #24,d3
   jsr Write(a6)              ;Folge 2 schreiben
   cmp.b #24,d0
   beq t6
   move.b #8,d0
   bra Ende                   ;Write Error
t6:
   clr.l d0                   ;Alles OK

Ende:
   move.l d0,ErrorNr
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
   move.l Music_Handle,d1
   beq Ende3
   move.l #1,d2
   jsr Close(a6)              ;IRQ_Music schließen
Ende3:
   move.l Dest_Handle,d1
   beq.s Ende4
   move.l #1,d2
   jsr Close(a6)              ;Destinationfile schließen
   tst.l ErrorNr
   beq.s Ende4                ;falls Fehler<>0, dann wieder löschen
   move.l #File_Name,d1
   jsr DeleteFile(a6)
Ende4:
   move.l Big_Puffer,d0
   beq Ende5
   move.l d0,a1
   move.l Big_Puffer_Len,d0
   move.l ExecBase,a6
   jsr FreeMem(a6)
Ende5:
   move.l Dos_Base,a1
   move.l ExecBase,a6
   jsr Close_Library(a6)      ;Dos_Library schließen
Schluss:
   move.l Stack_Old,sp
   move.l ErrorNr,d0
   rts

ErrorNr: dc.l 0

ErrTable:
   dc.l Error0,Error2,Error2,Error3,Error4,Error5,Error6,Error7
   dc.l Error8,Error9,ErrorA

Error0: dc.b 10,"Ok, executable file generated.",10,10
Error2: dc.b 10,"USAGE: SF-Linker <music-objectfile[.a]>",10
        dc.b "© 1989 Profiteam Software !!",10,10
Error3: dc.b 10,"Error while opening sourcefile !",10,10
Error4: dc.b 10,"Error while opening 'IRQ_Music.Code' !",10,10
Error5: dc.b 10,"Error while opening destinationfile !",10,10
Error6: dc.b 10,"Read error from sourcefile.",10,10
Error7: dc.b 10,"Read error from 'IRQ_Music.Code'.",10,10
Error8: dc.b 10,"Write error on destinationfile.",10,10
Error9: dc.b 10,"Cannot allocate memory !",10,10
ErrorA:

   even

Cli_Anfang:
   move.l $6c,a2
   cmp.w #$4e71,(a2)                ;Test auf laufende Musik (nop)
   beq feddig
   lea Out2+2(pc),a1
   move.l a2,(a1)                   ;normaler IRQ an den Schluss
   clr.w d1                         ;d1=Musiknr. (0-15)
   clr.w d2                         ;d2=Mode (0=normal/1=master/2=slave)

ParamAuswert:
   move.b (a0)+,d0
   cmp.b #10,d0
   beq.s ParamOK                    ;10=Ende der Parameterzeile
   cmp.b #" ",d0
   beq.s ParamAuswert               ;Space überlesen
   cmp.b #"-",d0
   bne.s Par1                       ;Option
GetOpt:
   move.b (a0)+,d0
   cmp.b #10,d0
   beq.s ParamOK                    ;keine Option
   cmp.b #" ",d0
   beq.s GetOpt
   cmp.b #"s",d0
   beq.s Slave
   cmp.b #"S",d0
   beq.s Slave
   cmp.b #"m",d0
   beq.s Master
   cmp.b #"M",d0
   bne.s ParamAuswert
Master:
   move.b #1,d2
   bra.s ParamAuswert              ;Master mode
Slave:
   move.b #2,d2
   bra.s ParamAuswert              ;Slave mode
Par1:
   sub.b #49,d0
   cmp.b #9,d0
   bhs feddig
   tst.b d0
   bne.s Funny
   move.b (a0),d1
   cmp.b #10,d1
   beq.s Funny
   sub.b #48,d1
   cmp.b #7,d1
   bhs feddig
   add.b #9,d1
Funny:
   move.b d0,d1
ParamOK:
   addq.b #1,d1                     ;in d0 Musiknr. (1-16)

   lea Vars(pc),a0
   move.b d2,(a0)+                  ;Variablen speichern
   move.b d1,(a0)

   cmp.b #1,d2
   bhi SlaveMode
   blo.s NormalMode
MasterMode:
   bsr AllocPort
   bsr Sig0                         ;0, daß Musik gestartet ist
   lea Folge1+IRQ_Music_Roh(pc),a0  ;bei Folge1 steht dann IRQ_Music.code
   move.b Vars+1(pc),d0
   bsr Folge1                       ;Musik starten
   bsr Sig1
   bra.s sammel
NormalMode:
   lea Folge1+IRQ_Music_Roh(pc),a0  ;bei Folge1 steht dann IRQ_Music.code
   move.b Vars+1(pc),d0
   bsr Folge1                       ;Musik starten

Sammel:                             ;Mode normal und master
   move.l ExecBase,a6
   sub.l a1,a1
   jsr -294(a6)                     ;Find-this-Task
   lea task(pc),a0
   move.l d0,2(a0)
   move.l #16,d0
   jsr AllocSignal(a6)              ;Signal reservieren
   cmp.b #16,d0
   bne.s StopMusic
   lea IRQ(pc),a0
   move.l a0,$6c                    ;neuen IRQ_Zeiger setzen
   move.l #16,d0
   jsr Wait(a6)                     ;Warten auf Signal
   move.l Out2+2(pc),$6c            ;alten IRQ-Vektor
   move.l #16,d0
   jsr FreeSignal(a6)
StopMusic:
   bsr Folge1+8
fertig1:
   lea Vars(pc),a0
   tst.b (a0)
   beq.s feddig
   bsr FreePort                     ;Port freigeben
feddig:
   clr.l d0
   rts                              ;Stop Music

Vars: dc.w 0   ;Playmode/Musiknr.

SlaveMode:                          ;MasterSlave Modus
   bsr AllocPort
   bsr Sig0             ;???
   move.l ExecBase,a6
   jsr Forbid(a6)                   ;Multitasking aus
   jsr disable(a6)
   bsr Wait0
   lea Folge1+IRQ_Music_Roh(pc),a0  ;bei Folge1 steht dann IRQ_Music.code
   move.b Vars+1(pc),d0
   bsr Folge1                       ;Musik starten
 PlayLoop:
   bsr Wait1
   bsr Wait0
   bsr Folge1+4                     ;Play_Music
   lea Folge1(pc),a0
   tst.b 33(a0)                     ;Stimmen alle aus
   beq.s p_AllAus
   btst #6,$bfe001
   bne.s PlayLoop                   ;linke Maustaste?
   btst #2,$dff016                  ;rechte " "
   bne.s PlayLoop
p_AllAus:                           ;Musik zuende
   move.l ExecBase,a6
   jsr enable(a6)
   jsr Permit(a6)                   ;Multitasking an
   bra.s StopMusic

irq:
   nop
   movem.l d0-d7/a0-a6,-(sp)
   move.w $dff006,d0
   lsr.w #8,d0                      ;auch richtiger Interrupt?
   cmp.b #2,d0
   bhi.s out
   lea Vars(pc),a0
   tst.b (a0)
   beq.s nix0
   bsr Sig0
nix0:
   bsr Folge1+4                     ;Play_Music
   lea Vars(pc),a0
   tst.b (a0)
   beq.s nix1
   bsr Sig1
nix1:
   lea Folge1(pc),a0
   tst.b 33(a0)                     ;Stimmen alle aus
   beq.s AllAus
   btst #6,$bfe001
   bne.s out                          ;linke Maustaste?
   btst #2,$dff016                  ;rechte " "
   bne.s out
AllAus:
   move.l ExecBase,a6
   move.l #16,d0
task:
   move.l #$ffffff,a1
   jsr Signal(a6)                   ;Signal setzen
out:
   movem.l (sp)+,d0-d7/a0-a6
out2:
   jmp $fffffe                      ;zum Rest des IRQ's

AllocPort:
     lea ParName(pc),a0
     lea iostruct(pc),a1
     clr.l d0
     clr.l d1
     move.l ExecBase,a6
     jsr OpenDevice(a6)
     tst.l d0
     bne.s AllocError
     bsr Sig1
     move.b #1,$bfe301        ;Richtung D0=aus
     rts
AllocError:                   ;Zurück
     move.l (sp)+,d0
     clr.l d0
     rts

FreePort:
     clr.b $bfe301            ;Richtung alles ein
     lea iostruct(pc),a1
     move.l execbase,a6
     jsr CloseDevice(a6)
     rts

Sig0:
     bclr #0,$bfe101
     rts
Sig1:
     bset #0,$bfe101
     rts

Wait0:
     move.b $bfe101,d0
     btst #1,d0
     beq.s WaitOK
     btst #6,$bfe001
     bne.s Wait0
     btst #2,$dff016
     bne.s Wait0
WaitOK:
     rts

Wait1:
     move.b $bfe101,d0
     btst #1,d0
     bne.s WaitOK
     btst #6,$bfe001
     bne.s Wait1
     btst #2,$dff016
     bne.s Wait1
     rts

ioStruct: blk.l 20,0                 ;IO-Struktur
parName:  dc.b "parallel.device",0

Folge1:           dc.l $3f3,0,2,0,1,0,1,$3e9,0
Folge2:           dc.l $3ec,0,$3f2,$3eb,1,$3f2
IRQ_Music:        dc.b "SF:IRQ_Music.Code",0
Kopierschutz:     dc.b "A2",0,0
Dos_Name:         dc.b "dos.library",0
Puffer:           dc.l 0   ;Puffer zum Einlesen der Länge
File_Name:        blk.b 40,0
DeleteFlag:       dc.w 0   ;Flag=1, wenn Destfile schon existiert
Stack_Old:        dc.l 0   ;alter Stackpointer
Dos_Base:         dc.l 0   ;Dos Basisadresse
Source_Handle:    dc.l 0   ;Source File
Hilf:             dc.l 0   ;Hilfsvariable
Hunk_Len:         dc.l 0   ;Länge des Haupthunks
Music_Handle:     dc.l 0   ;IRQ_Music Handle
Dest_Handle:      dc.l 0   ;Destinationfilehandler
Big_Puffer:       dc.l 0   ;Zeiger auf großen Puffer
Big_Puffer_Len:   dc.l 0   ;und dessen Größe

