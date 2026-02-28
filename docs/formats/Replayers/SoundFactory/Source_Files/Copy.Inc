   even
Copy:                                  ;Copy Routine  d1=Zeiger auf Par.
   move.l d1,a0
   move.l a0,SSource
Copy_Lop1:
   adda.l #1,a0
   cmp.b #" ",(a0)
   bne.s Copy_Lop1
   clr.b (a0)                          ;Sourcename fertig
   move.l a0,HilfAdr
Copy_Lop2:
   adda.l #1,a0
   cmp.b #" ",(a0)
   beq.s Copy_Lop2
   move.l a0,a1

   move.l SSource,a0
   move.l a1,DDest
   move.l a0,d1
   bsr GetFileSize2                    ;d0=Len (source)
   cmp.l #-1,d0
   beq CopyError
   move.l d0,PPufferLen
   clr.l d1
   move.l ExecBase,a6
   jsr AllocMem(a6)                    ;Speicher reservieren
   move.l d0,PPuffer
   beq SecondMode
                                       ;einfaches Copy, da genug mem
   move.l SSource,d1
   move.l #Mode_Old,d2
   move.l DosBase,a6
   jsr Open(a6)                        ;Sourcefile öffnen
   move.l d0,SHandle
   beq CopyError
   move.l d0,d1
   move.l PPuffer,d2
   move.l PPufferLen,d3
   jsr Read(a6)                        ;Source komplett einlesen
   cmp.l PPufferLen,d0
   bne CopyError
   move.l DDest,d1
   move.l #Mode_New,d2
   jsr Open(a6)                        ;Destfile öffnen
   move.l d0,DHandle
   beq CopyError
   move.l d0,d1
   move.l PPuffer,d2
   move.l PPufferLen,d3
   jsr Write(a6)                       ;und schreiben
   cmp.l PPufferLen,d0
   bne CopyError
   beq CopyOK
                           ;2. etwas komplexere Methode
SecondMode:
   move.l SSource,d1
   move.l #Mode_Old,d2
   move.l DosBase,a6
   jsr Open(a6)                        ;Sourcefile öffnen
   move.l d0,SHandle
   beq CopyError
   move.l DDest,d1
   move.l #Mode_New,d2
   jsr Open(a6)                        ;Destfile öffnen
   move.l d0,DHandle
   beq CopyError

   move.l PPufferLen,RestCopy          ;noch zu kopierende Bytes
   move.l IRQ_Music_Buffer,d0
   add.l #IRQ_Music_Len-1024,d0
   move.l d0,Block
CCopyLoop:
   move.l RestCopy,d3
   cmp.l #1025,d3
   blo.s CCCopy
   move.l #1024,d3
CCCopy:                    ;in d3 wieviel Bytes jetzt kopieren
   sub.l d3,RestCopy
   move.l d3,CopyNow
   move.l SHandle,d1
   move.l Block,d2
   jsr Read(a6)          ;lesen
   cmp.l CopyNow,d0
   bne CopyError
   move.l DHandle,d1
   move.l Block,d2
   move.l CopyNow,d3
   jsr Write(a6)         ;schreiben
   cmp.l CopyNow,d0
   bne CopyError
   tst.l RestCopy
   bne.s CCopyLoop
   bra CopyOK

Beenden:
   move.l PPuffer,d0
   beq.s Bee1
   move.l d0,a1
   move.l PPufferLen,d0
   move.l ExecBase,a6
   jsr FreeMem(a6)               ;Speicher freigeben
   clr.l PPuffer
   clr.l PPufferLen
Bee1:
   move.l DosBase,a6
   move.l SHandle,d1
   beq.s Bee2
   jsr Close(a6)                ;Source schliessen
   clr.l SHandle
Bee2:
   move.l DHandle,d1
   beq.s Bee3
   jsr Close(a6)                ;Dest schliessen
   clr.l DHandle
Bee3:
   move.l HilfAdr,a0
   move.b #" ",(a0)
   rts

CopyOK:
   bsr Beenden
   clr.l d0
   rts                                 ;Rückgabe 0 in d0 = OK
CopyError:
   bsr Beenden
   move.l #-1,d0                       ;Rückgabe -1 in d0 = Fehler
   rts

FileLen:       dc.l 0                  ;Länge des Sourcefiles
PPuffer:       dc.l 0                  ;Puffer für Copy
PPufferLen:    dc.l 0                  ;Länge des Puffers
SSource:       dc.l 0                  ;^ Sourcename
DDest:         dc.l 0                  ;^ Destname
SHandle:       dc.l 0                  ;Sourcehandle
DHAndle:       dc.l 0                  ;Desthandle
Block:         dc.l 0                  ;Adresse des 1KB Blocks
CopyNow:       dc.l 0                  ;Bytes in diesem Durchgang kop.
RestCopy:      dc.l 0                  ;noch zu kopierende Bytes
HilfAdr:       dc.l 0                  ;Hilfsspeicher
