;******************************************************************
;       Interrupt-Routine zur Einbindung in eigene Programme
;       SOUNDFACTORY (c) 1989 by PROFITEAM
;******************************************************************

Einsprung:
   bra.s Start_Musik   ;Startet die Musik im VBI
   bra.s Stop_Musik    ;Stoppt die Musik und restauriert alten IRQ-Vektor
Musikadr:
   dc.l 0              ;Hier muß die Adresse des Musik-Objectfiles einge-
                       ;tragen werden
IRQ_Music_Code:
   dc.l 0              ;Hier muß die Adresse der Abspielroutine
                       ;(IRQ_Music.Code) eingetragen werden
MusikNr:
   dc.b 0

   even
Stop_Musik:
   move.l $6c,a0            ;läuft überhaupt eine SF-Musik ?
   cmp.w #$4e71,(a0)        ;Erkennungszeichen: der NOP-Befehl ($4e71)
   bne Nix                  ;Es läuft keine Musik, STOP
   move.l IRQ_Music_code(pc),a1
   jsr 8(a1)                ;Musik stoppen (IRQ_Music.Code + 8)
   move.l HilfIRQ+2(pc),$6c ;alten IRQ-Vektor wieder herstellen
   rts
Start_Musik:
   move.l $6c,a0            ;läuft schon eine SF-Musik ?
   cmp.w #$4e71,(a0)        ;Erkennungszeichen: NOP-Befehl am Anfang
   beq.s Nix                ;Es läuft schon eine Musik, STOP
   move.l Musikadr(pc),a0   ;Zeiger auf Musik nach A0
   move.b MusikNr(pc),d0
   move.l IRQ_Music_Code(pc),a1
   jsr (a1)                 ;Musik starten (IRQ_Music.Code)
   lea HilfIRQ+2(pc),a2     ;alten IRQ-Vektor ans Ende der neuen
   move.l $6c,(a2)          ;Interrupt-Routine eintragen
   lea IRQ(PC),a0           ;in den Vertical-Blanking-Interrupt
   move.l a0,$6c            ;(VBI) mit einhängen
Nix:
   rts

IRQ:                            ;Neue Interrupt-Routine
   Nop                          ;Erkennungszeichen: SF-Musik läuft
   movem.l d0-d7/a0-a6,-(sp)    ;alle Register retten
   btst #5,$dff01f              ;Ist der ausgelöste Interrupt ein VBI?
   beq.s NixVBI                 ;Nein, dann Abspielroutine überspringen
   move.l IRQ_Music_Code(pc),a0
   jsr 4(a0)                    ;Musik spielen (IRQ_Music.Code + 4)
NixVBI:
   movem.l (sp)+,d0-d7/a0-a6    ;alle Register wieder vom Stapel holen
HilfIRQ:
   jmp $ffffe                   ;und zurück zur alten Interrupt-Routine
Ende:
