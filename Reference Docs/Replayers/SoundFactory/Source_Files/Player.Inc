;---- Play und/oder Record über die Tastatur mit/ohne Hintergrundsong ----
;                                                                        |
;  (c) 1989 by Zuheir Urwani (Profiteam Software !!)                     |
;                                                                        |
;  last update:   19.7.89         (Midi-fähig)                           |
;                                                                        |
;  Übergabeparameter: (Voraussetzung keine Musik spielt zur Zeit)        |
; -------------------                                                    |
;                                                                        |
; a0:  l   Zeiger auf Musiken für Hintergrundmelodie oder 0, falls keine |
;  d4: b   Nr. des zu spielenden Songs (0-15)                            |
;  d0: b   Stimmen, die gespielt werden sollen  (auf keinen Fall=15)     |
; d1:  b   Record-Rate oder 0, falls kein Record sondern nur Play        |
;  a1: l   Zeiger auf Textpuffer                                         |
;  a2: l   Zeiger auf Notenpuffer (oder 0, falls no mem)                 |
;  d2: l   Länge des Textpuffers                                         |
;  d3: b   Flag, ob Aufnahme ab Start (0), oder ab erster Note (1)       |
; a5:  l   Zeiger auf Sound, mit dem gespielt werden soll !!             |
; d7:  b   0=Tastatur, sonst über Midi   !!!!!!!!!!!!!!!!!               |
;                                                                        |
;  Rückgabeparameter:                          Thomas was here!!!        |
; -------------------                          Zuheir came back !!       |
;                                                                        |
;  d0: l   Länge des aufgenommenen Textes (nur falls Record)             |
;  d1: l   Status (0=OK, 1=Puffer voll)                                  |
;                                                                        |
;-------------------------------------------------------------------------

Notendauer = -36        ; 4 w. Zähler für verbleibende Spielzeit einer Note
Notendauer2 = 64        ; 4 w. Zähler bis Release-Phase Start=Notendauer/2
forbid = -132           ; Exec-Konstante
permit = -138           ;  "     "
serdatr = $dff018
serdat  = $dff030       ;für Midi
serper  = $dff032
intena  = $dff09a
intreq  = $dff09c
Level_5_irq = $74

TextPuffer: dc.l 0
RecordRate: dc.b 0
ObFlag:     dc.b 0
BuffLen:    dc.l 0
Counter:    dc.l 0        ;IRQ-Zähler, wird alle 1/50 s erhöht
fifo:       dc.l 0
Aktiv:      dc.l 0
FirstFlag:  dc.w 0        ;ist nur 0 vor der 1. Note
Spalte:     dc.b 0        ;Spalte im Text
OldOkt:     dc.b 0        ;bereits notierte Oktave
Notenbuffer: dc.l 0       ;Zeiger auf Notenpuffer
Midi:       dc.w 0        ;Einspielen über Midi?
MidiPtrIn:  dc.w 0        ;Pointer auf nächsten freien Platz   rel.
MidiPtrOut: dc.w 0        ; "       "    "  auszuwertende Note rel.
PuufferLen      = 512     ;Länge des Midi-Ringpuffers (2-er Potenz)
MidiPuffer: dcb.b 512,0   ;Ringpuffer für Midi-Daten

Play_Alone:
   move.l Level_5_Irq,endirq+2   ;alten Level 5 IRQ wegspeichern
   move.b d7,Midi
   tst.b d7
   beq.s Tasten1
   move.w #$0800,serdat          ;Datenbyte löschen
   move.w #114,serper            ;Übertragungsrate auf 114
   move.l #L5IRQ,Level_5_Irq     ;neuen IRQ einbinden
   move.w #$8800,intena          ;Serieller-Port-IRQ erlauben
   move.w #$0800,intreq          ;eventuell vorhandener IRQ löschen
   clr.l MidiPtrIn               ;Pointer auf Pufferanfang setzen
Tasten1:
   move.l a2,Notenbuffer
   lea Voices,a2
   move.l #$8001008d,d7             ;alle Stimmen am Anfang auf Pausen
   move.l d7,(a2)+
   move.l d7,(a2)+
   move.l d7,(a2)+
   move.l d7,(a2)
   move.l a0,a6
   sub.l #Melody,a6                 ;a6=Differenz zw. alter Base u. neuer
   lea Melody+20,a2                 ;Ptr auf die 4 Stimmenpointer
   move.l a0,a3
   cmp.l #0,a0
   beq.s noBack
   and.w #15,d4                     ;Musiknr. zw. 0-15
   lsl.w #4,d4
   move.b #4,d6
Loop_1:
   move.l 20(a0,d4.w),a4
   add.l a6,a4
   move.l a4,(a2)+
   addq.w #4,d4
   subq.b #1,d6
   bne.s Loop_1                     ;4 Pointer des Songs kopieren
   bra.s Cont_1
noBack:
   clr.w d0
Cont_1:             ;in d0 welche Stimmen eingeschaltet für Backgroundsong
   move.b d0,d5
   move.b #1,d6
   clr.b d7
   move.w #20,a3
   move.l #36,d4
   lea Melody,a2
Loop_2:
   lsr.b #1,d5
   bcs.s Cont_2
   tst.b d7                         ;Stimme d6 ist noch frei
   bne.s Cont_3
   move.b d6,d7                     ;d7=Record-Stimme
Cont_3:
   move.l d4,0(a2,a3.w)
Cont_2:
   add.w #4,a3
   addq.b #4,d4
   asl.b #1,d6
   cmp.b #16,d6
   bne.s Loop_2                     ;dann in d7 Record-Stimme
   tst.b d1
   beq.s Cont_4
   move.b d0,d6
   or.b d7,d6
   bra.s Cont_5
Cont_4:
   move.b #15,d6
Cont_5:
   move.b d6,4(a2)
   eor.b #15,d0
   tst.b d1
   beq.s Cont_6
   move.b d7,d0
Cont_6:                             ;d0=Stimmen über Tastatur
   movem.l d0-d3/a1/a5,-(sp)
   move.l IRQ_Music_Buffer,a1
   move.l a2,a0                     ;Nr. (31)
   move.l #1,d0
   jsr (a1)                         ;Musik starten
   tst.b LED
   bne.s Cont_jaja
   bsr LED_Off
Cont_jaja:
   movem.l (sp)+,d0-d3/a1/a5
   move.l IRQ_Music_Buffer,a0
   move.l a5,Soundtabelle+124(a0)   ;Sound als letzten Sound eintragen
   move.b d0,d7
   clr.w d6
Loop_3:
   lsr.b #1,d7
   bcc.s Cont_7
   move.b #31,Varbase-28(a0,d6.w)   ;Aktuelle Sounds der spielenden Stim.
Cont_7:
   addq.b #1,d6
   cmp.b #4,d6
   bne.s Loop_3                     ;alle Stim. über Tast. mit Stimme 31
   clr.l Counter                    ;Zähler im IRQ für Record
   move.l $6c,IRQ_Out+2
   move.l #My_IRQ,$6c               ;und in IRQ einbinden

   bsr Nun_Spielen            ;in den eigentlichen Play/Record gehen

   movem.l d0/d1,-(sp)
   move.l IRQ_Out+2,$6c             ;old irq
   move.l IRQ_Music_Buffer,a0
   jsr 8(a0)                        ;Stop Musik
   move.w #$0800,intena             ;Seriellen-IRQ sperren
   move.l endirq+2,Level_5_Irq      ;IRQ auf normale Adresse biegen
   movem.l (sp)+,d0/d1
   rts                              ;alles Roger !?

My_IRQ:                             ;Interrupt-Routine
   nop
   movem.l d0-d7/a0-a6,-(sp)
   btst #5,$dff01f
   beq.s oout                       ;auch richtiger Interrupt?
   move.l IRQ_Music_Buffer,a0
   jsr 4(a0)                        ;Play_Music
   addq.l #1,Counter                ;Zähler erhöhen
oout:
   movem.l (sp)+,d0-d7/a0-a6
IRQ_out:
   jmp $fffffe                      ;zum Rest des IRQ's

Melody:                             ;ab hier die Melodie
   dcb.l 9,0                        ;Musik-Header
Voices:
   dc.b 128,1,0,141                 ;pausen
   dc.b 128,1,0,141                 ;pausen
   dc.b 128,1,0,141                 ;pausen
   dc.b 128,1,0,141                 ;pausen

L5IRQ:                           ;neue Level 5 Interrupt-Routine
   btst #14,serdatr              ;ist es auch der Serielle IRQ ?
   beq.s endirq                  ;falls nein, dann weg hier
   movem.l d0/d1/a0,-(sp)
   move.w serdatr,d0             ;Daten auslesen
   move.w MidiPtrIn,d1
   lea MidiPuffer,a0
   move.b d0,0(a0,d1.w)          ;und in Puffer schreiben
   addq.w #1,d1
   and.w #PuufferLen-1,d1
   move.w d1,MidiPtrIn           ;Pointer wieder abspeichern
   move.w #$0800,intreq          ;IRQ-Request löschen
   movem.l (sp)+,d0/d1/a0
endirq:
   jmp $fffffe                   ;Rücksprung zur originalen Routine

;---- hier die tastaturabfrage und notenänderung ------------------

GetKey:                 ;Holt Tastencode nach d4.L
   clr.l d4
   tst.b Midi
   bne.s FromMidi
   move.b $bfec01,d4    ;von der Tastatur
   eor.b #255,d4
   move.b d4,-(sp)
   lsr.b #1,d4
   move.b (sp)+,d4
   ror.b #1,d4
   rts
FromMidi:
   movem.l d0-d3/a0,-(sp)
   move.w MidiPtrOut,d0
   cmp.w MidiPtrIn,d0
   bne.s Something
SyncError:
   move.w d0,MidiPtrOut
   move.b #128,d4       ;128=nix im Puffer
reet:
   movem.l (sp)+,d0-d3/a0
   rts
Something:              ;es ist was da
   lea MidiPuffer,a0
   bsr WaitNE
   move.b d4,d2
   btst #7,d4
   beq.s SyncError      ;1.Wert muß > 128 sein (Synchronisation)
   bsr WaitNE
   btst #4,d2
   bne.s angeschl
   bset #7,d4
angeschl:
   move.l d4,d2
   bsr WaitNE
   move.l d2,d4
   move.w d0,MidiPtrOut
   bra.s reet
WaitNE:
   btst #2,$dff016
   beq.s SyncError
   cmp.w MidiPtrIn,d0
   beq.s WaitNE
   move.b 0(a0,d0.w),d4
   addq.w #1,d0
   and.w #PuufferLen-1,d0
   rts

Nun_Spielen:        ;d0=zu spielende Stimmen; d1=Record Rate (bzw. 0 Play)
   move.l 4,a6      ;d2=Länge des Textpuffers; d3=Flag ob von Anfang
   jsr forbid(a6)   ;a1=^Textpuffer
   move.l a1,Textpuffer                ;a1=Akt. Textptr
   move.b d1,Recordrate
   move.b d3,ObFlag
   move.l d2,BuffLen
   bsr GetKey
   move.b d4,d7                        ;d7=old Key
   clr.w d6                            ;d6=Fifo In Ptr
   clr.w d5                            ;d5=Fifo Out Ptr
   move.w #2,d3                        ;d3=Oktave
   clr.l Aktiv
   move.l #$00010203,Fifo
   lea fifo,a0                         ;a0=Fifo
   clr.w d1
Loop_X:
   lsr.b #1,d0
   bcs.s Cont_X
   move.b #255,0(a0,d1.w)
Cont_X:
   addq.b #1,d1
   cmp.b #4,d1                         ;nun: Fifo=00 01 FF 03 (nur zugel-
   bne.s Loop_x                        ;     assene Stimmen noch drin)
   lea aktiv,a4                        ;a4=aktiv
   lea Voices,a2                       ;a2=Voices
   lea Keymap,a3                       ;a3=Keymap
   move.l IRQ_Music_Buffer,a6
   add.l #Varbase,a6                   ;a6=Varbase
   move.l #8,FirstFlag                 ;FirstFlag=0 Spalte=0 und OldOkt=8

   ;Reg.: d7_b=alte Taste, d6,d5_w=Zeiger in Fifo, d3_w=Oktave
   ;      a0=^Fifo, a4=^aktiv, a2=^Voices, a3=^Keymap
   ;      a6=^Varbase, a1=^Textpuffer (a0-a7,d3-d7 außer d4,a5 belegt)

Spiel_Loop:
   bsr GetKey
   cmp.b d4,d7                         ;d4=Akt. Key
   bne.s Oh_Neu
All_Here:
   btst #2,$dff016
   bne.s Spiel_Loop

   tst.b Recordrate                    ;Ende von Play/Record
   beq.s RecEnd
   tst.b FirstFlag
   beq.s nochnix
   move.l Counter,d1
   bsr TrackIt
   bsr PrintZahl                        ;letzte Notenlänge ausgeben
   move.b #10,-1(a1)
   lea RetTxt,a0
   move.b #7,d0
TxtLP:
   move.b (a0)+,(a1)+
   subq.b #1,d0
   bne.s TxtLP
   subq.l #7,BuffLen
nochnix:
   clr.l d1
RecEnd:
   movem.l d1/a1,-(sp)
   move.l 4,a6
   jsr permit(a6)                      ;Ende der Play-Alone Routine
   movem.l (sp)+,d1/a1
   tst.l Notenbuffer
   beq.s TestIll
   move.l Notenbuffer,a0
   move.b #142,(a0)
TestIll:
   move.l a1,d0
   sub.l TextPuffer,d0
   rts                        ;Rücksprung in die Hauptschleife

Oh_Neu:
   move.b d4,d7
   btst #7,d4
   beq Gedrueckt
   and.b #127,d4
   beq all_here
   move.w #3,d0
S_Loop:
   cmp.b 0(a4,d0.w),d4
   beq.s Found_1
   subq.b #1,d0
   bpl.s S_Loop
   bra All_here
Found_1:                            ;Taste zu Stimme d0.w losgelassen
   clr.b 0(a4,d0.w)
   move.b d0,0(a0,d5.w)
   lsl.b #1,d0
   move.w #1,Notendauer2(a6,d0.w)       ;Notendauer2:=1
   lsl.b #1,d0
   move.w #$8001,0(a2,d0.w)             ;Pause
   addq.b #1,d5
   and.b #3,d5
   bra All_Here
Gedrueckt:
   tst.b Midi
   bne.s Midi_1
   cmp.b #$50,d4
   bne.s not_f1
   tst.b d3                   ;f1
   beq All_Here
   subq.b #1,d3
   bra All_Here
not_f1:
   cmp.b #$51,d4
   bne.s not_f2
   cmp.b #6,d3                ;f2
   beq All_here
   addq.b #1,d3
   bra All_here
not_f2:
   cmp.b #$3a,d4
   bhi All_here
   clr.l d2
   move.b 0(a3,d4.w),d2       ;d2.L=Note
   cmp.b #255,d2
   beq All_here
Midi_1:
   clr.w d0                   ;sicher: neue richtig gedr. Taste
   cmp.l #-1,(a0)
   bne.s again
Lp_P:
   tst.b 0(a4,d0.w)           ;bei keiner freien Stimme mehr muss die
   bne.s fnd                  ;erstbeste Stimme wieder freigemacht
   addq.b #1,d0               ;werden
   bra.s Lp_P
fnd:
   clr.b 0(a4,d0.w)
   move.b d0,(a0)             ;d0.w=Nr. der einzigen Stimme
   lsl.w #1,d0
   move.w #1,Notendauer2(a6,d0.w) ;letzte Stimme wieder frei bei Record
again:
   move.l Counter,-(sp)       ;Länge der alten Note ist klar
   clr.l Counter
   clr.l d0
again2:
   move.b 0(a0,d6.w),d0
   cmp.b #255,d0
   bne.s yeah
   addq.b #1,d6
   and.b #3,d6
   bra.s again2
yeah:                         ;d0.l=Stimme, mit der neue Note gespielt wird
   move.b #255,0(a0,d6.w)
   addq.b #1,d6
   and.b #3,d6
   move.b d4,0(a4,d0.w)       ;welche Taste die Stimme aktivierte
   tst.b Midi
   bne.s Midi_2
   move.w d3,d1
   mulu #12,d1
   add.b d2,d1                ;in d1 nun richtige SF-Note (0-127)
   bra.s NoteSml
Midi_2:
   clr.l d1
   move.b d4,d1
   sub.b #24,d1               ;immer Oktaven 1-5  (-36+12)
   clr.l d2
   move.b d1,d2
   divu #12,d2
   move.b d2,d3               ;in d3 ist Oktave
   clr.w d2
   swap d2                    ;in d2 ist Restnote
NoteSml:
   move.b d1,Noete            ;Note zwischenspeichern
   lsl.b #2,d0
   lsl.w #8,d1
   or.w #$7f,d1
   move.w d1,0(a2,d0.w)
   lsr.b #1,d0
   move.w #1,d1
   move.w d1,Notendauer(a6,d0.w)    ;spielt ab jetzt richtig.
   move.l (sp)+,d0                  ;d0=alte Notenlänge
   tst.b RecordRate
   beq All_here                     ;falls nur Play

   tst.b ObFlag
   bne.s nixOb
   bsr IncName
   move.w #"P ",d1
   bsr Print                       ;ab hier Pause
   move.b #128,d1
   bsr InNotes                     ;Pause in Notenbuffer
   move.w d0,d1
   bsr TrackIt
   bsr PrintZahl                   ;Länge der Pause
   move.b #1,ObFlag
   move.b #1,FirstFlag
   bra.s lm1
nixOb:
   tst.b FirstFlag
   bne.s nixFirst
   move.b #1,FirstFlag
   bsr IncName
   bra.s lm1
nixFirst:
   move.w d0,d1
   bsr TrackIt
   bsr PrintZahl                  ;Länge der Note  (reine Note)
lm1:
   cmp.l #10,BuffLen
   bhi.s hoho
   move.l #1,d1                  ;Overflow Error
   bra RecEnd
hoho:
   move.b Noete,d1
   bsr InNotes                     ;Note in Notenbuffer
   move.w d3,d1
   tst.b Midi
   bne.s lm2
lm3:
   cmp.b #11,d2
   bls.s lm2
   sub.b #12,d2
   addq.b #1,d1
   bra.s lm3
lm2:
   cmp.b OldOkt,d1
   beq.s SameOkt
   move.b d1,OldOkt
   move.w d1,-(sp)
   move.w #"O ",d1
   bsr Print                       ;Oktave
   move.w (sp)+,d1
   bsr PrintZahl                   ;Oktavennummer
   tst.l Notenbuffer
   beq.s SameOkt
   subq.l #2,NotenBuffer
SameOkt:
   lsl.b #1,d2
   and.w #255,d2
   lea Bij,a0
   move.w 0(a0,d2.w),d1
   lea Fifo,a0
   bsr Print                       ;Notenschreibweise ausgeben
   bra All_here

IncName:             ;Gibt den String "MusInc:" aus
   sub.l #14,BuffLen
   move.l a0,-(sp)
   lea IncNMTxt,a0
   move.b #14,d1
incLp:
   move.b (a0)+,(a1)+
   subq.b #1,d1
   bne.s incLp
   move.l (sp)+,a0
   rts

IncNMTxt:   dc.b "Music_Inc:",10,"   "
Noete: dc.w 0             ;Hilfsvariable

InNotes:                  ;trägt ein Byte von d1 in Notenbuffer
   tst.l NotenBuffer
   beq.s nixSchreib
   move.l a0,-(sp)
   move.l NotenBuffer,a0
   move.b d1,(a0)+
   move.l a0,Notenbuffer
   move.l (sp)+,a0
nixSchreib:
   rts

Print:               ;überträgt 2 Bytes aus D1 in Textpuffer
   move.b d1,-(sp)
   lsr.w #8,d1
   move.b d1,(a1)+
   move.b (sp)+,d1
   move.b d1,(a1)+
   subq.l #2,BuffLen
   addq.b #2,Spalte
   rts

RetTxt:
   dc.b "Return",10,0

PrintZahl:               ;Gibt Zahl in Puffer mit ":" bzw. LF
   movem.l d0/d3,-(sp)
   tst.l Notenbuffer
   beq.s nixSchreib2
   movem.l d1/a0,-(sp)
   move.l NotenBuffer,a0
   move.b d1,1(a0)
   lsr.w #8,d1
   move.b d1,(a0)
   addq.l #2,a0
   move.l a0,Notenbuffer
   movem.l (sp)+,d1/a0
nixSchreib2:
   clr.b d0
   move.w #10000,d3
   ext.l d1
PZLP:
   divu d3,d1
   tst.b d1
   bne.s pop1
   tst.b d0
   beq.s pop2
pop1:
   move.b #1,d0
   add.b #48,d1
   move.b d1,(a1)+
   addq.b #1,Spalte
   subq.l #1,BuffLen
pop2:
   clr.w d1
   swap d1
   ext.l d3
   divu #10,d3
   tst.b d3
   bne.s PZLP
   cmp.b #60,Spalte
   bhi.s pop3
   move.b #":",(a1)+
   addq.b #1,Spalte
   bra.s pop4
pop3:
   move.b #10,(a1)+
   move.b #32,(a1)+
   move.b #32,(a1)+
   move.b #32,(a1)+
   subq.l #3,BuffLen
   clr.b Spalte
pop4:
   subq.l #1,BuffLen
   movem.l (sp)+,d0/d3
   rts

TrackIt:          ;macht aus D1 ein Vielfaches von RecordRate
   movem.l d0/d2,-(sp)
   clr.w d0
   move.b RecordRate,d0
   ext.l d1
   divu d0,d1
   swap d1
   lsr.b #1,d0
   clr.w d2
   cmp.b d1,d0
   bhs.s ti1
   move.b #1,d2
ti1:
   swap d1
   add.w d2,d1
   bne.s ti2
   move.b #1,d1
ti2:
   move.b RecordRate,d0
   mulu d0,d1
   movem.l (sp)+,d0/d2
   rts

Bij:
   dc.w "C ","C#","D ","D#","E ","F ","F#","G ","G#","A ","A#","H "

Keymap:
   dc.b 255,255,13,15,255,18,20,22,255,25,27,255,30,32,255,255
   dc.b 12,14,16,17,19,21,23,24,26,28,29,31,255,255,255,255
   dc.b 255,1,3,255,6,8,10,255,13,15,255,255,255,255,255,255
   dc.b 255,0,2,4,5,7,9,11,12,14,16

;---------------------------------------------------------------------
