serdatr = $dff018                ;Midi-Protokoll:
serdat  = $dff030
serper  = $dff032                ;aus dem SEKA starten, mit Maustaste
intena  = $dff09a                ;beenden und im Puffer nachsehen.
intreq  = $dff09c
irq     = $74

run:
   move.w #$0800,serdat          ;Datenbyte löschen
   move.w #114,serper            ;Übertragungsrate auf 114
   move.l irq,endirq+2           ;alten IRQ wegspeichern
   move.l #MeinIRQ,irq           ;neuen IRQ einbinden
   move.w #$8800,intena          ;Serieller-Port-IRQ erlauben
   move.w #$0800,intreq          ;eventuell vorhandener IRQ löschen
   move.l #Puffer,Pointer        ;Pointer auf Pufferanfang setzen
Loop:
   btst #6,$bfe001               ;auf Maustaste warten
   bne.s loop
   move.w #$0800,intena          ;Seriellen-IRQ sperren
   move.l endirq+2,irq           ;IRQ auf normale Adresse biegen
   rts

meinirq:                         ;neue Level 5 Interrupt-Routine
   btst #14,serdatr              ;ist es auch der Serielle IRQ ?
   beq.s endirq                  ;falls nein, dann weg hier
   movem.l d0/a0,-(sp)
   move.w serdatr,d0             ;Daten auslesen
   move.l Pointer,a0
   move.b d0,(a0)+               ;und in Puffer schreiben
   move.l a0,Pointer             ;Pointer wieder abspeichern
   move.w #$0800,intreq          ;IRQ-Request löschen
   movem.l (sp)+,d0/a0
endirq:
   jmp $fffffe                   ;Rücksprung zur originalen Routine

Pointer:    dc.l 0               ;Pointer auf nächsten freien Platz
puffer:     blk.b 3000,0         ;Puffer für max. 500 Anschläge
