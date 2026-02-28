;-------------------------------------------------------------!
;                                                             !
;                       IRQ-Music           06.07.1989        !
;                                                             !
; Ein Musikprogramm geschrieben in 68000´er Maschinensprache  !
;              für den Commodore Amiga von                    !
;                                                             !
; Zuheir Urwani  &  Thomas Kolbe                              !
;                                     (C) 1989 Profiteam !    !
;                                                             !
;-------------------------------------------------------------!

   even

run:
   jmp InitMusic(pc)    ;Musikstück komplett initialisieren (a0=Basisadr.)
   jmp PlayMusic(pc)    ;Muß alle 1/50 Sekunden aufgerufen werden
   jmp StopMusic(pc)    ;Stoppt die Musik abrupt
   jmp FadeOut(pc)      ;Leitet Fade Out ein     (d0 = Geschw.)
   jmp GetRequest(pc)   ;Holt Request in d0
   jmp SetRequest(pc)   ;Setzt Request           (d0 = Request)
   jmp GetSounds(pc)    ;Holt die eingeschalteten Stimmen
   jmp SetMask(pc)      ;Setzt Maske der Sounds  (d0 = Maske)

;-------------------------------------------------- Hardware Vektoren

RegBase = $dff080       ;Basisadresse der Hardware-Register+$80
DMACON  = $096-$80      ;DMA-Kontrollregister schreiben
ADKCON  = $09e-$80      ;Audio-Kontroll-Register

AUD0LCH = $0a0-$80      ;Kanal 0 Adresse Audiodaten Bits 16-18
AUD0LCL = $0a2-$80      ;Kanal 0 Adresse Audiodaten Bits 0-15
AUD0LEN = $0a4-$80      ;Kanal 0 Länge der Audiodaten in Words
AUD0PER = $0a6-$80      ;Kanal 0 Periodendauer
AUD0VOL = $0a8-$80      ;Kanal 0 Lautstärke

;--------------------------------------------------- globale Variablen

   blk.b 70             ; 70 Bytes Variablen wie folgt:
Request = -70           ; 1 b. Zählt Software-Impulse aus der Musik
Stimmen = -69           ; 1 b. Bits 0-3 ; wenn 1, dann ist entspr. Stimme an
StartPointer = -68      ; 4 l. Pointer auf Startadresse der Stimmen
Pointer = -52           ; 4 l. Pointer auf nächste zu spielende Note
Notendauer = -36        ; 4 w. Zähler für verbleibende Spielzeit einer Note
AktuellSound = -28      ; 4 b. Enthält die Soundnummern der 4 Stimmen
Volume = -24            ; 4 b. Volume-Regler (1-256) bezieht sich auf Sustain
Tune = -20              ; 4 b. Verstimmung der 4 Stimmen
Period = -16            ; 4 w. Berechnete Sampling-Perioden aller Stimmen
Note = -8               ; 4 b. Enthält Notennummer 0-127, Pause = >127
Stackptr = -4           ; 4 b. Stackpointer auf freien Stack

VarBase:   blk.b 130    ;Basisadresse der globalen Variablen
                        ;-----------------------------------

TremoloCnt = 0          ; 4 b. Tremolo Verzögerungszähler
TremoloDir = 4          ; 4 b. Tremolo Richtungszeiger (= ± Schrittgröße)
TremoloVol = 8          ; 4 b. Aktueller Anteil der hörbaren Lautstärke
                        ;      (256(0) - TremoloRange)
AktPeriod = 12          ; 4 w. Aktuelle Periode (nur bei Portamento)
PortCnt = 20            ; 4 b. Verzögerungszähler Portamento Geschwindigkeit

ArpeggioCnt = 24        ; 4 b. Verzögerungszähler Arpeggio Geschwindigkeit
ArpeggioFlag = 28       ; 4 b. 1 = Freq*2, 0 = Normal

VibratoWait = 32        ; 4 b. 0 = Vibrato an, sonst Countdown bis Start
VibratoCnt = 36         ; 4 b. Verzögerungszähler Vibrato Geschwindigkeit
VibratoRel = 40         ; 4 w. Offset für AktPeriod (zw. +Range & -Range)
VibratoDir = 48         ; 4 b. Vibrato Richtungszeiger (±Schrittgröße)
VibratoCnt2 = 52        ; 4 b. wie oft noch in dieser Richtung

ASR_Phase = 56          ; 4 b. Envelope-Phase: 0=Attack,1=Sustain,2=Release
ASR_Cnt = 60            ; 4 b. Zähler für Attack & Release Steigung
Notendauer2 = 64        ; 4 w. Zähler bis Release-Phase Start=Notendauer/2
AktVolume = 72          ; 4 b. Aktuelle Lautstärke nach ASR (0 - Sustain)

PhasingCnt = 76         ; 4 b. Verzögerungszähler Phasing Geschwindigkeit
PhasingDir = 80         ; 4 b. Phasing Richtungszeiger
PhasingRel = 84         ; 4 b. Aktuelle relative Verschiebung beider Kurven

FadeOutFlag = 88        ; 1 b. Fade Out an=1 oder aus=0
FadeOutCnt = 89         ; 1 b. Verzögerungszähler für Feed Out
FadeOutVol = 90         ; 1 b. Anteil der noch zu hörenden Musik (256(0)-1)
FadeOutSpeed = 91       ; 1 b. Fade Out-Geschwindigkeit
FadeInFlag =92          ; 1 b. Fade In an=1 oder aus=0

FilterCnt = 94          ; 4 b. Verzögerungszähler Filter Geschw.
FilterRel = 98          ; 4 b. Aktuelle Schrittgröße
FilterDir = 102         ; 4 b. Aktuelle Richtung (1,-1)
AusFlag = 106           ; 4 b. Flags, ob Note gerade erst angefangen hat
AusFlag1 = 110          ; 4 b. Hilfsflags zu AusFlag
SetIt = 114             ; 2 b. zu setzenden Stimmen
RealPeriod = 116        ; 4 w. tatsächl. Periode momentan
SoundMask = 124         ; 1 b. Maske der Stimmen
Transposes = 126        ; 4 b. Halbnoten-Offsets zu den Noten

;--------------------------------------------------- Tabellen und Puffer

Soundtabelle: blk.l 32  ; 32 Zeiger auf verschiedene Sounds
Stack:        blk.b 320 ; 4 Stacks à 80 Bytes
Realy:        dc.w 0    ;Flag, wegen DMA und Maske

;----------------------------------------------- Konstante Tabellen u.ä.

DefaultSound:           ;voreingestellter Sound für alle Stimmen
   dc.b 132             ;OpCode für SetSound
   dc.b 0               ;Soundnummer
   dc.w $ffff           ;Länge des Setsound-OpCodes in W (incl. 132)
   dc.w 1               ;Länge der Sampling-Daten in Words
   dc.w 0               ;Samplingperiod für C , falls <>0
   dc.b %00000000       ;Effekt-Byte   Bit 0: Loop          (One Shot)
                        ;              Bit 1: Vibrato aus   (an)
                        ;              Bit 2: Arpeggio aus  (an)
                        ;              Bit 3: Phasing aus   (an)
                        ;              Bit 4: Portamento aus(an)
                        ;              Bit 5: Release an    (aus)
                        ;              Bit 6: Tremolo aus   (an)
                        ;              Bit 7: Filter an     (aus)
   dc.b 0,0,0           ;Tremolo- Geschw., Schrittgröße , Anteil (1-256)
   dc.b 0,0,0           ;Portamento-Schrittgröße.W, Geschw.B (1-255)
   dc.b 0               ;Arpeggio-Geschwindigkeit (1-255)
   dc.b 0,0,0,0         ;Vibrato- Verzögerung (0-255), Geschw. (1-255),
                        ;Schrittgröße (1-255), wie oft rauf (1-255)
   dc.b 1,0,64,30       ;ASR- Attacktime (0-255), Decay-Time (falls<>0)
                        ;Sustainlevel (0-64), Releasetime (0-255)
   dc.b 0,0,0,0         ;Phasing- Start (0 - Sample-Länge),
                        ;Ende (Start - Sample-Länge), Geschw. (1-255),
                        ;Schrittgröße (1-255)
   dc.b 1               ;Anzahl 'gesampleter' ganzer Schwingungen
   dc.b 0               ;Oktave der    eventuell gegebenen Samplingrate
   dc.b 1,50,2,0        ;Schrittgröße-Start,Ende,Geschw. (Filter)
   dc.w 0,0             ;falls One-Shot-Mode und beide Words <> 0,dann
                        ;Digitized-ASR-Mode:
                        ; 1.Word: Offset der Sustain Phase in Words
                        ; 2.Word: Offset der Release Phase  "    "
   dc.b 100,-100
                        ;Offsets der Sounddaten relativ zum SETSOUND
SampleLen   = 4
SamplingPer = 6
Effektbyte  = 8
TremSpeed   = 9
TremStep    = 10
TremRange   = 11
PortStep    = 12
PortSpeed   = 14
ArpSpeed    = 15
VibWait     = 16
VibSpeed    = 17
VibStep     = 18
VibSteps    = 19
AttackTime  = 20
DecayTime   = 21
SustainLev  = 22
ReleaseTime = 23
PhasStart   = 24
PhasEnd     = 25
PhasSpeed   = 26
PhasStep    = 27
SchwingZahl = 28
Octave      = 29
FilterFreq  = 30
FilterEnd   = 31
FilterSpeed = 32
DASR_S      = 34
DASR_R      = 36
Sample      = 38

GetRequest:
   move.l a6,-(sp)
   lea Varbase(pc),a6
   clr.l d0
   move.b Request(a6),d0
   move.l (sp)+,a6
   rts

SetRequest:
   move.l a6,-(sp)
   lea Varbase(pc),a6
   move.b d0,Request(a6)
   move.l (sp)+,a6
   rts

GetSounds:
   move.l a6,-(sp)
   lea Varbase(pc),a6
   clr.l d0
   move.b Stimmen(a6),d0
   move.l (sp)+,a6
   rts

SetMask:
   move.l a6,-(sp)
   lea Varbase(pc),a6
   move.b d0,SoundMask(a6)
   and.w #$f,d0
   eor.b #$f,d0
   move.w d0,$dff096			;DMA ausschalten
   move.l (sp)+,a6
   rts

;----------------------------------------------------- Init Music

InitMusic:              ;Übergabeparameter:
                        ;A0 = Zeiger auf Musikstücke
                        ;D0 = Musiknr. (1-16)
   lea VarBase(pc),a6
   lea RegBase,a5                ;alle Basisadressen initialisieren
   subq.w #1,d0
   and.w #$f,d0                  ;Musiknr. (0-15).W

   move.b 4(a0,d0.w),Stimmen(a6) ;eingeschaltete Stimmen
   move.b 4(a0,d0.w),SoundMask(a6)
   move.w d0,d1
   lsl.w #4,d1                   ;d1 = Musiknr. * 16

   move.l a0,d0
   move.l 32(a0,d1.w),a3         ;relative Startadr. nach a0-a3
   move.l 28(a0,d1.w),a2
   move.l 24(a0,d1.w),a1
   move.l 20(a0,d1.w),a0
   add.l d0,a0                   ;relativ zu absolut wandeln
   add.l d0,a1
   add.l d0,a2
   add.l d0,a3
   move.l a0,Startpointer(a6)    ;alle Pointer initialisieren
   move.l a1,Startpointer+4(a6)
   move.l a2,Startpointer+8(a6)
   move.l a3,Startpointer+12(a6)
   move.l a0,Pointer(a6)
   move.l a1,Pointer+4(a6)
   move.l a2,Pointer+8(a6)
   move.l a3,Pointer+12(a6)

   moveq #1,d0
   move.w d0,Notendauer(a6)      ;alle Notendauern auf 1 setzen
   move.w d0,Notendauer+2(a6)
   move.w d0,Notendauer+4(a6)
   move.w d0,Notendauer+6(a6)

   clr.l Tune(a6)                ;alle Verstimmungen (Tune) auf 0 setzen
   clr.l Stackptr(a6)            ;Stackpointer initialisieren
   clr.l AktuellSound(a6)        ;alle 4 Stimmen auf Default-Sound 0 setzen
   clr.l Transposes(a6)          ;alle Halbnotenoffsets auf 0

   clr.b FadeOutFlag(a6)         ;Fade In/Out ausschalten
   clr.b FadeInFlag(a6)
   clr.b FadeOutVol(a6)
   clr.b FadeOutCnt(a6)

   clr.b Request(a6)             ;Ereigniszähler auf 0 setzen
   clr.l AusFlag1(a6)            ;AusFlags auf 0 setzen
   clr.l Volume(a6)              ;Lautstärke auf volle Pulle

   lea DefaultSound(pc),a0       ;Sound 0 ist Default-Sound
   lea Soundtabelle(pc),a1
   moveq #32,d0
All_Default:
   move.l a0,(a1)+
   subq.b #1,d0
   bne.s All_Default

   move.w #$00ff,ADKCON(a5)      ;Hardware-Modulationen ausschalten
   move.w #$000f,DMACON(a5)      ;Audio-DMA sperren
   bclr #1,$bfe001               ;Led anschalten
   clr.w SetIt(a6)

;----------------------------------------------------- Play Music

PlayMusic:                       ;keine Übergabeparameter

   lea VarBase(pc),a6
   lea RegBase,a5

   tst.b FadeInFlag(a6)          ;Fade In bearbeiten
   bne.s FadeInOut
   tst.b FadeOutFlag(a6)
   beq.s weiter2
FadeInOut:
   move.b FadeOutCnt(a6),d0
   add.b FadeOutSpeed(a6),d0
   move.b d0,d1
   and.b #3,d0
   move.b d0,FadeOutCnt(a6)
   lsr.b #2,d1
   move.b FadeOutVol(a6),d0
   tst.b FadeInFlag(a6)
   beq.s FadeItOut
   add.b d1,d0
   bcc.s Weiter3
   clr.b FadeInFlag(a6)
   clr.b FadeOutVol(a6)
   bra.s Weiter2
FadeItOut:
   tst.b d0
   bne.s fadenorm
   sub.b d1,d0
   bra.s Weiter3
fadenorm:
   sub.b d1,d0
   beq.s StopMusic
   bcc.s Weiter3

StopMusic:                       ;Stoppt die Musikausgabe
   lea Varbase(pc),a6            ;Kann auch direkt aufgerufen werden
   lea RegBase,a5
   clr.l d0
   move.b d0,Stimmen(a6)         ;Stimmen ausschalten
   move.b d0,FadeOutFlag(a6)
   move.b d0,FadeInFlag(a6)
   move.w #$000f,DMACON(a5)
   move.w d0,AUD0VOL(a5)
   move.w d0,AUD0VOL+16(a5)
   move.w d0,AUD0VOL+32(a5)
   move.w d0,AUD0VOL+48(a5)
   rts

Weiter3:
   move.b d0,FadeOutVol(a6)
Weiter2:
   moveq #3,d7
   moveq #6,d6
   moveq #12,d5
   moveq #48,d4
   move.w #$8000,d1
   move.b SetIt+1(a6),d1
   and.b SoundMask(a6),d1
   beq.s Play_Ok
   move.w d1,DMACON(a5) ;DMA einschalten
Play_Ok:
   clr.w SetIt(a6)

Loop1:
   btst d7,Stimmen(a6)
   beq.s Weiter1        ;Stimme nicht eingeschaltet

   bsr play             ;Stimme bearbeiten

Weiter1:
   sub.b #16,d4
   subq.b #4,d5
   subq.b #2,d6
   subq.b #1,d7
   bpl.s Loop1
   move.w #$8000,d1
   move.b SetIt(a6),d1
   beq.s Play_Ok1
   move.w d1,DMACON(a5) ;DMA einschalten
Play_Ok1:
   rts

;-------------------------------------------------------------

Muell:                              ;Platz für Hardware-Pokes (Emulation)
   blk.b 36,0
   dc.b "Profiteam-Soundfactory V1.0 !!"    ;Erkennungsmarke eingeschoben
   blk.b 32,0

;------------------------------------------------------ Play -

Play:                   ;Globale Register D4,D5,D6,D7,A5,A6,A7(SP)
                        ;keinen davon verändern

   lea Realy(pc),a0
   clr.b (a0)
   btst d7,SoundMask(a6)
   beq.s PO1
   lea RegBase,a5
   bra.s PO3
PO1:
   lea Muell(pc),a5
   move.b #1,(a0)
PO3:
   bsr SoundPtr                  ;Soundpointer nach a4
   move.b Effektbyte(a4),d3      ;Effektbyte in d3
   subq.w #1,Notendauer(a6,d6.w)   ;Notendauer dekrementieren
   bne Modulator

;------------------------------------------ nächsten Musikcode bearbeiten

Naechstenote:
   bsr HoleCode               ;holt den nächsten Music-Code nach d0
   btst #7,d0
   beq NeueNote               ;Wenn Bit 7=0 dann Note
   lea Sprungtab(pc),a1       ;Sonst Musikbefehl
   and.b #127,d0
   move.b d0,-(sp)
   asl.b #1,d0
   move.w 0(a1,d0.w),d0
   jsr 0(a1,d0.w)
   move.b (sp)+,d0
   tst.b d0
   bne.s NaechsteNote         ;bei Pause Schluss hier
   rts                        ;falls nicht Pause oder PP
Note_Dauer_0:
   move.w (sp)+,d0            ;Falls Notenlänge=0, dann kommt er hierher
   bra.s NaechsteNote

Sprungtab:
   dc.w PauseOp-Sprungtab,VolOp-Sprungtab,TuneOp-Sprungtab,SoundOp-Sprungtab
   dc.w SetSoundOp-Sprungtab,ReturnOp-Sprungtab,GosubOp-Sprungtab
   dc.w GotoOP-Sprungtab,ForOp-Sprungtab,NextOp-Sprungtab
   dc.w FadeOutOp-Sprungtab,NOPOp-Sprungtab,RequestOp-Sprungtab
   dc.w LoopOp-Sprungtab,EndOp-Sprungtab,FadeInOp-Sprungtab
   dc.w ASROp-Sprungtab,OneShotOp-Sprungtab,PeriodeOp-Sprungtab
   dc.w VibratoOp-Sprungtab,ArpeggioOp-Sprungtab,PhasingOp-Sprungtab
   dc.w PortamentoOp-Sprungtab,TremoloOp-Sprungtab,FilterOp-Sprungtab
   dc.w PPOp-Sprungtab,LedOp-Sprungtab,WaitOp-Sprungtab,TransOp-Sprungtab
   ; *** erweiterbar ***

;----------------------------------------------- Holt nächsten Musikcode

HoleCode:               ;Übergabeparameter: d0 = nächsten Musikcode

   clr.l d0
   move.l Pointer(a6,d5.w),a0
   move.b (a0),d0
   addq.l #1,Pointer(a6,d5.w)
   rts

HoleWord:               ;Übergabeparameter: d0 = nächstes Musikword

   clr.l d1
   bsr HoleCode
   move.b d0,d1
   lsl.w #8,d1
   bsr HoleCode
   or.w d1,d0
   rts

;------------------------------- Zeiger auf eingestellten Sound nach a4

SoundPtr:
   clr.l d1
   lea Soundtabelle(pc),a4
   move.b AktuellSound(a6,d7.w),d1
   lsl.b #2,d1
   move.l 0(a4,d1.w),a4          ;a4 enthält Adresse des eingestellten Sounds
   rts

;---------------------------------------------- Push und Pull auf Stack

CalcStack:              ;Bringt die Basisadr. des Stacks der akt. Stimme
   lea Stack(pc),a0     ;nach a0  = Stack+Stimme*80
   move.l d2,-(sp)
   move.l d7,d2
   lsl.w #4,d2
   move.w d2,d1
   lsl.w #2,d2
   add.w d1,d2
   add.l d2,a0          ;A0 enthält nun die Adresse des Stacks der Stimme
   move.l (sp)+,d2
   rts

PushByte:               ;Bringt d0.b auf den Stack der akt. Stimme
   bsr CalcStack
   clr.w d1
   move.b Stackptr(a6,d7.w),d1
   move.b d0,0(a0,d1.w)
   addq.b #2,Stackptr(a6,d7.w)
   rts

PushLong:               ;Bringt d0.l auf den Stack der akt. Stimme
   bsr CalcStack
   clr.w d1
   move.b Stackptr(a6,d7.w),d1
   move.l d0,0(a0,d1.w)
   addq.b #4,Stackptr(a6,d7.w)
   rts

PullByte:
   bsr CalcStack
   subq.b #2,Stackptr(a6,d7.w)
   clr.w d1
   move.b Stackptr(a6,d7.w),d1
   move.b 0(a0,d1.w),d0
   rts

PullLong:
   bsr CalcStack
   subq.b #4,Stackptr(a6,d7.w)
   clr.w d1
   move.b Stackptr(a6,d7.w),d1
   move.l 0(a0,d1.w),d0
   rts

;---------------------------------------------- Musik Opcodes

PauseOp:                ;Pause-OpCode
   bsr HoleWord
   move.w d0,Notendauer(a6,d6.w)
   rts

PPOp:                   ;Pause-OpCode (unangeschlagen)
   bsr HoleWord
   move.w d0,Notendauer(a6,d6.w)
   clr.w d2
   bset d7,d2
   move.w d2,DMACON(a5)        ;DMA der akt. Stimme sperren
   clr.b 4(sp)                 ;Pause vorgaukeln
   rts

VolOp:                  ;Volume-OpCode
   bsr HoleCode
   move.b d0,Volume(a6,d7.w)
   rts

TransOp:                ;Transpose
   bsr HoleCode
   move.b d0,Transposes(a6,d7.w)
   rts

LedOp:                  ;Low-Pass Filter (LED)
   bsr HoleCode
   tst.b d0
   beq.s LedOff
   bclr #1,$bfe001      ;Led on
   rts
LedOff:
   bset #1,$bfe001      ;Led off
   rts

TuneOp:                 ;Tune-OpCode
   bsr HoleCode
   move.b d0,Tune(a6,d7.w)
   rts

SoundOp:                ;Neuen Sound setzen
   bsr HoleCode
   move.b d0,AktuellSound(a6,d7.w)
   bsr SoundPtr         ;Neuen Soundpointer in a4
   rts

NOPOp:                  ;Nichts tun
   rts

LoopOp:                 ;Musikpointer wieder an den Anfang setzen
   move.l Startpointer(a6,d5.w),Pointer(a6,d5.w)
   rts

RequestOp:
   addq.b #1,Request(a6)
   rts

WaitOp:                 ;Warten, bis Request einen bestimmten Wert hat
   bsr HoleCode
   cmp.b Request(a6),d0
   bne.s OjeOje
   rts
OjeOje:                 ;Nun warten
   subq.l #2,Pointer(a6,d5.w)      ;PC zwei Bytes zurück
   move.w #1,Notendauer(a6,d6.w)   ;bis nächsten Interrupt Pause
   clr.b 4(sp)                   ;Pause vorgaukeln
   rts

SetSoundOp:             ;Neues Sound definieren
   bsr HoleCode
   asl.b #2,d0
   move.l Pointer(a6,d5.w),d2
   subq.l #2,d2
   lea Soundtabelle(pc),a0
   move.l d2,0(a0,d0.w)
   bsr HoleWord
   lsl.l #1,d0          ;da Länge in Words
   add.l d0,d2
   move.l d2,Pointer(a6,d5.w)
   rts

EndOp:                  ;Musik für diese Stimme beenden
   clr.l d0
   bset d7,d0
   move.w d0,DMACON(a5)         ;DMA-Kanal der aktuellen Stimme aus
   move.w d0,d1
   asl.w #7,d1
   clr.w AUD0VOL(a5,d4.w)     ;Lautstärke auf 0 setzen
   moveq #15,d1
   eor.b d1,d0
   and.b d0,Stimmen(a6)         ;Stimme ausschalten
   clr.b 4(sp)              ;letzen Opcode in eine 0 verwandeln
   rts

FadeOutOp:
   bsr HoleCode
FadeOut:                         ;Kann auch direkt aufgerufen werden
   lea Varbase(pc),a6
   move.b d0,FadeOutSpeed(a6)
   clr.b FadeInFlag(a6)
   clr.b FadeOutCnt(a6)
   move.b #1,FadeOutFlag(a6)
   rts

GotoOp:
   bsr HoleWord
   swap d0
   move.l d0,-(sp)
   bsr HoleWord
   or.l (sp),d0
   add.l d0,Pointer(a6,d5.w)
   move.l (sp)+,d0
   rts

GosubOp:
   bsr HoleWord
   swap d0
   move.l d0,-(sp)
   bsr HoleWord
   or.l (sp),d0
   move.l (sp)+,d2
   move.l d0,d2
   move.l Pointer(a6,d5.w),d0
   add.l d0,d2
   bsr PushLong
   move.l d2,Pointer(a6,d5.w)
   rts

ReturnOp:
   bsr PullLong
   move.l d0,Pointer(a6,d5.w)
   rts

ForOp:
   bsr HoleCode
   bsr PushByte
   move.l Pointer(a6,d5.w),d0
   bsr PushLong
   rts

NextOp:
   bsr PullLong
   move.l d0,a3
   bsr PullByte
   subq.b #1,d0
   beq.s EndLoop
   move.l a3,Pointer(a6,d5.w)
   bsr PushByte
   move.l a3,d0
   bsr PushLong
EndLoop:
   rts

ASROp:
   bsr HoleCode
   move.b d0,AttackTime(a4)
   bsr HoleCode
   move.b d0,DecayTime(a4)
   bsr HoleCode
   move.b d0,SustainLev(a4)
   bsr HoleCode
   tst.b d0
   beq.s ReleaseAus
   and.b #255-32,Effektbyte(a4)
   bra.s WeiterASR
ReleaseAus:
   or.b #32,Effektbyte(a4)
   rts
WeiterASR:
   bsr HoleCode
   move.b d0,ReleaseTime(a4)
   rts

OneShotOp:
   or.b #1,Effektbyte(a4)
   rts

PeriodeOp:
   and.b #254,Effektbyte(a4)
   rts

VibratoOp:
   bsr HoleCode
   tst.b d0
   bne.s VibOn
   and.b #255-2,Effektbyte(a4)
   rts
VibOn:
   or.b #2,Effektbyte(a4)
   bsr HoleCode
   move.b d0,VibWait(a4)
   bsr HoleCode
   move.b d0,VibSpeed(a4)
   bsr HoleCode
   move.b d0,VibStep(a4)
   bsr HoleCode
   move.b d0,VibSteps(a4)
   rts

PhasingOp:
   bsr HoleCode
   tst.b d0
   bne.s PhasOn
   and.b #255-8,Effektbyte(a4)
   rts
PhasOn:
   or.b #8,Effektbyte(a4)
   bsr HoleCode
   move.b d0,PhasStart(a4)
   bsr HoleCode
   move.b d0,PhasEnd(a4)
   bsr HoleCode
   move.b d0,PhasSpeed(a4)
   bsr HoleCode
   move.b d0,PhasStep(a4)
   rts

TremoloOp:
   bsr HoleCode
   tst.b d0
   bne.s TremOn
   and.b #255-64,Effektbyte(a4)
   rts
TremOn:
   or.b #64,Effektbyte(a4)
   bsr HoleCode
   move.b d0,TremSpeed(a4)
   bsr HoleCode
   move.b d0,TremStep(a4)
   bsr HoleCode
   move.b d0,TremRange(a4)
   rts

PortamentoOp:
   bsr HoleCode
   tst.b d0
   bne.s PortOn
   and.b #255-16,Effektbyte(a4)
   rts
PortOn:
   or.b #16,Effektbyte(a4)
   bsr HoleCode
   move.b d0,PortSpeed(a4)
   bsr HoleWord
   move.w d0,PortStep(a4)
   rts

ArpeggioOp:
   bsr HoleCode
   tst.b d0
   bne.s ArpOn
   and.b #255-4,Effektbyte(a4)
   rts
ArpOn:
   or.b #4,Effektbyte(a4)
   bsr HoleCode
   move.b d0,ArpSpeed(a4)
   rts

FadeInOp:
   bsr HoleCode
   move.b d0,FadeOutSpeed(a6)
   move.b #1,FadeInFlag(a6)
   tst.b FadeOutVol(a6)
   bne.s fadeinn
   move.b #1,FadeOutVol(a6)
fadeinn:
   clr.b FadeOutCnt(a6)
   clr.b FadeOutFlag(a6)
   rts

FilterOp:
   bsr HoleCode
   tst.b d0
   bne.s FiltOn
   and.b #255-128,Effektbyte(a4)
   rts
FiltOn:
   or.b #128,Effektbyte(a4)
   bsr HoleCode
   move.b d0,FilterFreq(a4)
   bsr HoleCode
   move.b d0,FilterEnd(a4)
   bsr HoleCode
   move.b d0,FilterSpeed(a4)
   rts

;------------------------------------------------------ Neue Note spielen

NeueNote:                      ;Übergabeparameter:  D0 = Note (0-127)
   add.b Transposes(a6,d7.w),d0
   and.b #127,d0               ;Offset dazuaddieren
   clr.w d2
   bset d7,d2
   move.w d2,DMACON(a5)        ;DMA der akt. Stimme sperren !!!
   move.b d0,Note(a6,d7.w)
   move.b Effektbyte(a4),d3    ;Effektbyte nach d3

   btst #4,d3                  ;Test auf Portamento
   beq.s noPortamento
   move.w Period(a6,d6.w),AktPeriod(a6,d6.w)
   move.b #1,PortCnt(a6,d7.w)
noPortamento:
   bsr CalcPeriod              ;berechnet die SamplingPeriod in d0.w
   move.w d0,Period(a6,d6.w)
   bsr HoleWord
   move.w d0,-(sp)             ;Notendauer auf Stack wegen Bit 15
   and.w #$7fff,d0
   beq Note_Dauer_0
   move.w d0,Notendauer(a6,d6.w)
   lsr.w #1,d0
   move.w d0,Notendauer2(a6,d6.w)
   move.b #1,AusFlag(a6,d7.w)  ;markieren, daß neue Note
   btst #2,d3                  ;Test auf Arpeggio
   beq.s noArpeggio
   move.b #0,ArpeggioFlag(a6,d7.w)
   move.b ArpSpeed(a4),ArpeggioCnt(a6,d7.w) ;Arpeggio Geschwindigkeit
noArpeggio:
   btst #1,d3                  ;Test auf Vibrato
   beq.s noVibrato
   move.b VibWait(a4),VibratoWait(a6,d7.w) ;Vibrato Verzögerung
   bne.s noVibrato
   move.b VibStep(a4),VibratoDir(a6,d7.w)  ;Schrittgröße
   move.w #0,VibratoRel(a6,d6.w)
   move.b VibSpeed(a4),VibratoCnt(a6,d7.w)  ;Geschwindigkeit
   move.b VibSteps(a4),VibratoCnt2(a6,d7.w)
noVibrato:
   btst #6,d3                  ;Test auf Tremolo
   beq.s noTremolo
   move.b #1,TremoloCnt(a6,d7.w)
   move.b TremStep(a4),d0            ;Schrittgröße
   neg.b d0
   move.b d0,TremoloDir(a6,d7.w)
   move.b #0,TremoloVol(a6,d7.w)
noTremolo:
   move.w (sp)+,d0
   bmi.s Cont                          ;unangeschlagene Note
   clr.b ASR_Cnt(a6,d7.w)
   tst.b AttackTime(a4)                ;Attack=0?
   bne.s WithAttack
   tst.b DecayTime(a4)                 ;Attack=0. Decay?
   bne.s OnlyDecay
OnlySustain:
   move.b #2,ASR_Phase(a6,d7.w)               ;    => Sustainphase
   move.b SustainLev(a4),AktVolume(a6,d7.w)   ;       Vol=SustainLevel
   bra.s Cont
OnlyDecay:
   cmp.b #64,SustainLev(a4)            ;falls SL=64, dann Sustain
   beq.s OnlySustain
   move.b #64,AktVolume(a6,d7.w)       ;Decay-Phase
   move.b #1,ASR_Phase(a6,d7.w)
   bra.s Cont
WithAttack:
   clr.b d0                            ;Attack-Phase
   move.b d0,AktVolume(a6,d7.w)
   move.b d0,ASR_Phase(a6,d7.w)
Cont:
   btst #3,d3                 ;Test auf Phasing
   bne.s PhasingOn
   move.l a4,d0
   add.l #Sample,d0
   move.l d0,AUD0LCH(a5,d4.w)
   bra.s noPhasing
PhasingOn:
   move.b PhasSpeed(a4),PhasingCnt(a6,d7.w)  ;Phasing Geschwindigkeit
   move.b PhasStep(a4),PhasingDir(a6,d7.w)   ;Phasing Schrittgröße
   move.b PhasStart(a4),PhasingRel(a6,d7.w)  ;Phasing Start
   bsr Mix                          ;Mixt die Kurven & a1 Adr.d.Puffers
   move.l a1,AUD0LCH(a5,d4.w)
noPhasing:
   btst #7,d3
   beq.s noFilter                             ;Test auf Filter
   move.b FilterSpeed(a4),FilterCnt(a6,d7.w)
   move.b FilterFreq(a4),FilterRel(a6,d7.w)
   move.b #1,FilterDir(a6,d7.w)
   bsr FilterSample
   move.l a1,AUD0LCH(a5,d4.w)
noFilter:
   tst.l DASR_S(a4)
   beq.s NormLen
   move.w DASR_R(a4),AUD0LEN(a5,d4.w)         ;Digi_ASR
   bra.s LenCont
NormLen:
   move.w SampleLen(a4),AUD0LEN(a5,d4.w)      ;Länge der Schwingung in Words
LenCont:
   move.w RealPeriod(a6,d6.w),-(sp)           ;alte Periode retten
   bsr InHardware
   lea Realy(pc),a0
   tst.b (a0)
   bne.s notsett
   bset d7,SetIt+1(a6)                ;vermerken, daß nächstemal einschalten
notsett:
   move.w (sp)+,d0
   cmp.w #390,d0
   bhi.s bleibtdabei                  ;wirklich erst nächstes mal
   tst.b (a0)
   bne.s bleibtdabei
   bset d7,SetIt(a6)
bleibtdabei:
   rts

;----------------------------------------------------- Modulator

Modulator:                    ;moduliert Period und Vol je nach Effekt
   move.b Effektbyte(a4),d3            ;Effektbyte nach d3

   tst.b AusFlag1(a6,d7.w)
   beq.s noAus
   cmp.b #2,AusFlag1(a6,d7.w)
   beq.s dochAus              ;DASR-Mode auf Leersound nach Release
   tst.l DASR_S(a4)
   bne.s Au_Ja
   btst #0,d3                     ;Für One-Shot-Mode auf Leersound setzen
   beq.s noAus
dochAus:
   move.w #1,AUD0LEN(a5,d4.w)          ;One-Shot-Mode
   lea LeerSound(pc),a0
   move.l a0,AUD0LCH(a5,d4.w)
   bra.s noAus
Au_Ja:                                 ;Digitized One-Shot-Mode
   move.l a4,d0
   add.l #Sample,d0
   clr.l d1
   move.w DASR_S(a4),d1
   lsl.l #1,d1
   add.l d1,d0
   move.l d0,AUD0LCH(a5,d4.w)          ;Anfang der Sustain-Loop
   move.w DASR_R(a4),d0
   sub.w DASR_S(a4),d0
   move.w d0,AUD0LEN(a5,d4.w)

noAus:
   move.b AusFlag(a6,d7.w),AusFlag1(a6,d7.w)
   clr.b AusFlag(a6,d7.w)
   btst #6,d3                          ;Test auf Tremolo-Effekt
   beq.s nixTremolo
   subq.b #1,TremoloCnt(a6,d7.w)
   bne.s nixTremolo
   move.b TremSpeed(a4),TremoloCnt(a6,d7.w)
   move.b TremoloDir(a6,d7.w),d0
   add.b d0,TremoloVol(a6,d7.w)
   move.b TremRange(a4),d0    ;Untere Grenze des Tremolo-Vol-Anteil
   cmp.b TremoloVol(a6,d7.w),d0
   bcs.s nixTremolo
   neg.b TremoloDir(a6,d7.w)
nixTremolo:
   btst #4,d3                          ;Test auf Portamento
   beq.s nixPortamento
   move.w Period(a6,d6.w),d0
   cmp.w Aktperiod(a6,d6.w),d0
   beq.s nixPortamento
   subq.b #1,PortCnt(a6,d7.w)
   bne.s nixPortamento
   move.b PortSpeed(a4),PortCnt(a6,d7.w) ;Portamento Geschwindigkeit
   move.w PortStep(a4),d2
   cmp.w Aktperiod(a6,d6.w),d0
   bcs.s AktRunter
AktRauf:
   add.w d2,Aktperiod(a6,d6.w)         ;Portamento Schrittgröße
   cmp.w Aktperiod(a6,d6.w),d0
   bcc.s nixPortamento
   move.w d0,Aktperiod(a6,d6.w)
   bra.s nixPortamento
AktRunter:
   sub.w d2,Aktperiod(a6,d6.w)         ;Portamento Schrittgröße
   cmp.w Aktperiod(a6,d6.w),d0
   bcs.s nixPortamento
   move.w d0,Aktperiod(a6,d6.w)
nixPortamento:
   btst #2,d3                          ;Test auf Arpeggio
   beq.s nixArpeggio
   subq.b #1,ArpeggioCnt(a6,d7.w)
   bne.s nixArpeggio
   move.b ArpSpeed(a4),ArpeggioCnt(a6,d7.w)   ;Arpeggio Geschwindigkeit
   moveq #1,d0
   eor.b d0,ArpeggioFlag(a6,d7.w)
nixArpeggio:
   btst #1,d3                          ;Test auf Vibrato
   beq.s nixVibrato
   tst.b VibratoWait(a6,d7.w)
   beq.s VibratoOn
   subq.b #1,VibratoWait(a6,d7.w)
   bne.s nixVibrato
   move.b #1,VibratoCnt(a6,d7.w)
   move.w #0,VibratoRel(a6,d6.w)
   move.b VibStep(a4),VibratoDir(a6,d7.w)
   move.b VibSteps(a4),VibratoCnt2(a6,d7.w)
   bra.s nixVibrato
VibratoOn:
   subq.b #1,VibratoCnt(a6,d7.w)
   bne.s nixVibrato
   move.b VibSpeed(a4),VibratoCnt(a6,d7.w)     ;Vibrato Geschwindigkeit
   clr.w d0
   move.b VibratoDir(a6,d7.w),d0
   ext.w d0                            ;d0 auf Wortlänge vergrößern
   add.w d0,VibratoRel(a6,d6.w)
   subq.b #1,VibratoCnt2(a6,d7.w)
   bne.s nixVibrato
   move.b VibSteps(a4),d0
   lsl.b #1,d0
   move.b d0,VibratoCnt2(a6,d7.w)
   neg.b VibratoDir(a6,d7.w)
nixVibrato:
   cmp.b #3,ASR_Phase(a6,d7.w)         ;Release?
   bne.s nixRelease
   tst.b AktVolume(a6,d7.w)
   beq Ok_ADSR
   move.b SustainLev(a4),d0
   add.b d0,ASR_Cnt(a6,d7.w)           ;um Sustain erhöhen
m2:move.b ASR_Cnt(a6,d7.w),d0
   cmp.b ReleaseTime(a4),d0            ;mit Release vergleichen
   blo OK_ADSR
   move.b ReleaseTime(a4),d2
   sub.b d2,ASR_Cnt(a6,d7.w)
   subq.b #1,AktVolume(a6,d7.w)
   bne.s m2
   bra OK_ADSR
nixRelease:
   btst #5,d3                          ;Release eingeschaltet?
   bne.s neneRelease
   tst.w Notendauer2(a6,d6.w)
   beq.s WaitRelease
   subq.w #1,Notendauer2(a6,d6.w)
WaitRelease:
   bne.s neneRelease
   cmp.b #2,ASR_Phase(a6,d7.w)
   bne.s neneRelease
   move.b #3,ASR_Phase(a6,d7.w)        ;Release-Phase einleiten
   clr.b ASR_Cnt(a6,d7.w)
   btst #0,d3
   beq OK_ADSR
   tst.l DASR_S(a4)
   beq OK_ADSR
   move.w SampleLen(a4),d0             ;Release-Phase bei DASR
   sub.w DASR_S(a4),d0
   move.w d0,AUD0LEN(a5,d4.w)
   move.b #2,AusFlag(a6,d7.w)          ;markieren
   bra OK_ADSR
neneRelease:
   cmp.b #1,ASR_Phase(a6,d7.w)         ;Sustain?
   bhi OK_ADSR
   bne.s zuAttack
   move.b #64,d0                       ;Decay
   sub.b SustainLev(a4),d0
   add.b d0,ASR_Cnt(a6,d7.w)           ;um (64-SL) erhöhen
mx:move.b ASR_Cnt(a6,d7.w),d0
   cmp.b DecayTime(a4),d0              ;mit Decay-Time vergleichen
   blo.s vielleicht
   move.b DecayTime(a4),d2
   sub.b d2,ASR_Cnt(a6,d7.w)
   subq.b #1,AktVolume(a6,d7.w)
   bne.s mx
vielleicht:
   move.b SustainLev(a4),d0
   cmp.b AktVolume(a6,d7.w),d0
   blo OK_ADSR
zuSustain:
   move.b #2,ASR_Phase(a6,d7.w)
   bra OK_ADSR
zuAttack:
   move.b #64,d1                       ;Attack
   tst.b DecayTime(a4)
   bne.s ganzrauf
   move.b SustainLev(a4),d1
ganzrauf:
   add.b d1,ASR_Cnt(a6,d7.w)           ;um Zielwert erhöhen
m1:move.b ASR_Cnt(a6,d7.w),d0
   cmp.b AttackTime(a4),d0             ;Vergleich mit Attack
   bcs.s nixAttack
   move.b AttackTime(a4),d2
   beq.s nixAttack
   sub.b d2,ASR_Cnt(a6,d7.w)
   addq.b #1,AktVolume(a6,d7.w)
   bra.s m1
nixAttack:
   cmp.b AktVolume(a6,d7.w),d1
   bne.s OK_ADSR
   tst.b DecayTime(a4)
   beq.s zuSustain
   clr.b ASR_Cnt(a6,d7.w)
   cmp.b #64,SustainLev(a4)
   beq.s zuSustain
   move.b #1,ASR_Phase(a6,d7.w)
OK_ADSR:
   clr.b d1                            ;Flag, ob Mix u./od. Filtern
   btst #3,d3                          ;Test auf Phasing
   beq.s nixPhasing
   subq.b #1,PhasingCnt(a6,d7.w)
   bne.s nixPhasing
   move.b PhasSpeed(a4),PhasingCnt(a6,d7.w) ;Phasing Geschwindigkeit
   clr.l d0
   move.b PhasingRel(a6,d7.w),d0
   move.b PhasingDir(a6,d7.w),d2
   ext.w d2
   add.w d2,d0
   move.b d0,PhasingRel(a6,d7.w)
   tst.w d0
   bmi.s ChangeDir
   clr.w d2
   move.b PhasEnd(a4),d2
   cmp.w d2,d0
   bhs.s ChangeDir
   move.b PhasStart(a4),d2
   cmp.w d2,d0
   bhi.s noChange
ChangeDir:
   neg.b PhasingDir(a6,d7.w)
noChange:
   moveq #1,d1                         ;Flag für mixen
nixPhasing:
   btst #7,d3                          ;Test auf Filtermodulation
   beq.s nixFilter
   subq.b #1,FilterCnt(a6,d7.w)
   bne.s nixFilter
   move.b FilterSpeed(a4),FilterCnt(a6,d7.w)
   move.b FilterDir(a6,d7.w),d0
   add.b d0,FilterRel(a6,d7.w)
   move.b FilterRel(a6,d7.w),d0
   cmp.b FilterFreq(a4),d0
   beq.s ndir
   cmp.b FilterEnd(a4),d0
   bne.s machFilter
ndir:
   neg.b FilterDir(a6,d7.w)
machFilter:
   moveq #1,d1                         ;Flag fürs Filtern
nixFilter:
   tst.b d1
   beq.s AllClear                      ;keine Berechnungen
   btst #3,d3
   beq.s nixMix
   bsr Mix                             ;Mixen für Phasing
nixMix:
   btst #7,d3
   beq.s AllClear
   bsr FilterSample                    ;Filtern der Kurve
AllClear:
   ;bsr InHardware
   ;rts

;---------------------------------------------------------- in Hardware

InHardware:                            ;Übergabeparameter d3=Effektbyte
   clr.w d0
   clr.w d1
   move.b AktVolume(a6,d7.w),d0
   btst #6,d3
   beq.s ih1
   move.b TremoloVol(a6,d7.w),d1
   beq.s ih1
   mulu d1,d0
   lsr.w #8,d0                         ;d0=(d0*TremoloVol)div256
ih1:
   move.b Volume(a6,d7.w),d1
   beq.s ih2
   mulu d1,d0
   lsr.w #8,d0                         ;d0=(d0*Volume)div256
ih2:
   tst.b FadeOutFlag(a6)
   bne.s mixauch
   tst.b FadeInFlag(a6)
   beq.s ih3
mixauch:
   move.b FadeOutVol(a6),d1
   beq.s ih3
   mulu d1,d0
   lsr.w #8,d0                         ;d0=(d0*FadeOutVol)div256
ih3:
   move.w d0,AUD0VOL(a5,d4.w)          ;Volume in Hardwareregister

   move.w Period(a6,d6.w),d0
   btst #4,d3
   beq.s ih4
   move.w AktPeriod(a6,d6.w),d0
ih4:
   btst #1,d3
   beq.s ih5
   tst.b VibratoWait(a6,d7.w)
   bne.s ih5
   add.w VibratoRel(a6,d6.w),d0        ;d0=d0+VibratoRel
ih5:
   btst #2,d3
   beq.s ih6
   tst.b ArpeggioFlag(a6,d7.w)
   beq.s ih6
   lsr.w #1,d0                         ;d0=d0div2
ih6:
   move.b Tune(a6,d7.w),d1
   add.w d1,d0                         ;d0=d0+Tune
   move.w d0,AUD0PER(a5,d4.w)          ;Period in Hardwareregister
   move.w d0,RealPeriod(a6,d6.w)       ;tatsächliche akt. Periode
   rts

;------------------------------------- mixen der Audiodaten für Phasing

Mix:
   movem.l d3/d4,-(sp)
   move.w SampleLen(a4),d4
   lsl.w #1,d4                         ;Länge der Schwingung = d4.w
   move.l a4,d0
   add.l #Sample,d0                    ;Adresse der Schwingung = a0
   move.l d0,a0
   clr.l d0
   move.b d7,d0
   lsl.w #8,d0
   lea PhasingBuff(pc),a1
   add.l a1,d0                         ;Adresse des Puffers = a1
   move.l d0,a1
   clr.w d0
   move.b PhasingRel(a6,d7.w),d0       ;Verschiebung des 2. Samples
   move.w d4,d3
   sub.w d0,d3                         ;d3 = 2.Zähler
   clr.w d2                            ;d2 = 1.Zähler
MixLoop:
   move.b 0(a0,d3.w),d0
   move.b 0(a0,d2.w),d1
   ext.w d0
   ext.w d1
   add.w d1,d0                         ;d0 = Summer der Werte
   lsr.w #1,d0
   move.b d0,0(a1,d2.w)
   addq.w #1,d3
   cmp.w d3,d4
   bne MixWeiter
   clr.w d3
MixWeiter:
   addq.w #1,d2
   cmp.w d4,d2
   bne MixLoop
   movem.l (sp)+,d3/d4
   rts

LeerSound: dc.w 0

CalcPeriod:                            ;berechnet die Samplingperiode
   clr.l d0
   move.b Note(a6,d7.w),d0
   divu #12,d0
   move.w d0,d1
   clr.w d0
   swap d0                       ;d0 = Halbnote (0-11), d1 = Oktave (0-7)
   tst.w SamplingPer(a4)         ;Samplingperiode vielleicht gegeben?
   bne.s noCalc
   lsl.w #1,d0
   lea Sampletab(pc),a0
   move.w 0(a0,d0.w),d0
   cmpi.b #1,Schwingzahl(a4)           ;Anzahl gesampleter Schwingungen
   beq.s Calc2
   clr.l d2
   move.b Schwingzahl(a4),d2
   mulu d2,d0
Calc2:
   cmpi.w #1,SampleLen(a4)             ;Länge der Schwingung(en) in Words
   beq.s Calc3
   divu SampleLen(a4),d0
   and.l #$0000ffff,d0
Calc3:
   tst.b d1
   beq.s Calc4
   lsr.l #1,d0
   subq.b #1,d1
   bne.s Calc3
Calc4:
   lsl.w #1,d0
   rts

noCalc:                                ;gegebene Samplinperiode
   move.l d3,-(sp)
   move.l d4,-(sp)                     ;d1 = gewünschte Oktave.b
   clr.w d2
   move.b d0,d2                        ;d2 = gewünschte Halbnote.w
   move.w SamplingPer(a4),d0           ;d0 = aktuelle Samplingrate.w
CalcLoop1:
   lsl.w #1,d2
   lea MulTab(pc),a0
   move.w 0(a0,d2.w),d3                ;d3 = Multiplikator.w
   mulu d3,d0
   lsl.l #1,d0
   swap d0                             ;d0 = Samplingrate der Halbnote.w
   move.b Octave(a4),d4                ;d4 = aktuelle Oktave
CalcLoop2:
   cmp.b d1,d4
   beq.s CalcEnd
   bcs.s Halbieren
   lsl.w #1,d0
   subq.b #1,d4
   bra.s CalcLoop2
Halbieren:
   lsr.w #1,d0
   addq.b #1,d4
   bra.s CalcLoop2
CalcEnd:
   and.l #$0000ffff,d0
   move.l (sp)+,d4
   move.l (sp)+,d3
   rts

MulTab:
   dc.w 32768,30929,29193,27555,26008,24549,23171,21870
   dc.w 20643,19484,18391,17359

Sampletab:
   dc.w 54728,51656,48757,46020,43437,40999,38698,36526,34476
   dc.w 32541,30715,28964

FilterSample:
   movem.l d3/d4/d5/d6/d7/a5,-(sp)

   move.w SampleLen(a4),d2
   lsl.w #1,d2                         ;d2 = Länge der Schwingung.w

   clr.w d1
   move.b FilterRel(a6,d7.w),d1        ;d1 = FilterRel.w

   lsl.w #8,d7
   lea PhasingBuff(pc),a1
   add.l d7,a1                         ;a1 = Adresse des Puffers.l

   move.l a4,a0
   add.l #Sample,a0
   btst #3,Effektbyte(a4)
   beq.s FiltS1
   move.l a1,a0                        ;a0 = von wo Schwingung holen.l
FiltS1:
   cmp.b #1,d1
   bne.s Filt9                         ;bei Rel=1 originalkopieren
   cmp.l a0,a1
   beq.s Filt0                         ;brauch nich mal kopieren
   move.l a1,-(sp)
   lsr.w #2,d2
   cmp.b #64,d2
   beq.s FiltS2
   addq.b #1,d2                        ;soviele Longwörter kopieren
FiltS2:
   move.l (a0)+,(a1)+
   subq.b #1,d2
   bne.s FiltS2
   move.l (sp)+,a1
   bra.s Filt0

Filt9:
   move.w d1,d3
   lsr.b #1,d3                         ;d3 = Schrittgröße/2 = Schleifenz.w

   lea 0,a5                            ;a5 = Flag, wenn fertig.l

   clr.l d0
   bsr Durchschnitt                    ;d0 = Anfangsdurchschnitt.w

FilterLoop1:
   move.w d0,d4                        ;d4 = alter Wert.w

   move.w d1,d0
   lsr.b #1,d0
   add.w d3,d0
   cmp.w d2,d0
   blo.s Filt3
   sub.w d2,d0
Filt3:                                 ;d0 = neuer Durchschnitt ab
   bsr Durchschnitt                    ;d3+d1/2 .w

   move.w d0,d7                        ;Linie von (d3/d4) nach Wert d0
   sub.w d4,d7                         ;Länge d1
   bmi.s Filt4
   move.w #1,d5
   bra.s Filt5
Filt4:
   move.w #-1,d5
   neg.w d7
Filt5:
   clr.w d6
   move.w d0,-(sp)                     ;d0 retten
   move.w d1,d0

FilterLoop2:                           ;Line
   move.b d4,0(a1,d3.w)
   add.w d7,d6
Filt7:
   cmp.w d6,d1
   bhi.s Filt6
   sub.w d1,d6
   add.w d5,d4
   bra.s Filt7
Filt6:
   addq.w #1,d3
   cmp.w d2,d3
   blo.s Filt8
   sub.w d2,d3
   lea 1,a5
Filt8:
   subq.b #1,d0
   bne.s FilterLoop2

   move.w (sp)+,d0                     ;d0 zurückholen
   cmpa.w #0,a5
   beq FilterLoop1                     ;bis Grenze überschritten
Filt0:
   movem.l (sp)+,d3/d4/d5/d6/d7/a5
   rts

Durchschnitt:                          ;Übergabeparameter:
                                       ;   d0 = Anfangsoffset/d1 = Anzahl
                                       ; < d0 = Durchschnitt
   movem.l d3/d4,-(sp)
   move.w d1,-(sp)
   clr.w d4
   clr.w d3
DurchLoop:
   move.b 0(a0,d0.w),d3                ;Wert aus Setsound
   ext.w d3
   add.w d3,d4
   addq.w #1,d0
   cmp.w d2,d0
   bne.s Filt2
   clr.w d0
Filt2:
   subq.b #1,d1
   bne.s DurchLoop
   move.w (sp)+,d1
   ext.l d4
   divs d1,d4
   move.w d4,d0
   movem.l (sp)+,d3/d4
   rts

;----- Phasingpuffer kann ohne Phasing/Filter weggelassen werden -----
;------ er muss immer am Ende bleiben, wegen Soundfactory-Load  ------

PhasingBuff:  blk.b 1024               ;4 Phasing-Puffer à 256 Bytes

Musik:                                 ;Endmarke (unbenutzt)

;------------- IRQ-Music ------- (c) 1989 Profiteam! -----------------


