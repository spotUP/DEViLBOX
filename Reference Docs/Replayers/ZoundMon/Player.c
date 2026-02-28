#asm
  global     _AudioTemp,200    ;
  public     _KillZound        ;
  public     _SetUpInterrupt   ;
newlevel3                      ; This is the new interrupt
  btst.b     #5,$dff01f        ; Was it a VertB ??
  beq        backtoexec        ; If not let exec process it
  movem.l    D0-D7/A0-A6,-(A7) ; Save registers
  bsr        _intrMusic        ; Our music !
  movem.l    (A7)+,D0-D7/A0-A6 ; Prepare to reenter exec
backtoexec   dc.w       $4ef9  ; This means JMP
oldlevel3    dc.l       0      ; So jump to exec interrupt handlers
trueA4       dc.l       0      ; Storage for A4

_SetUpInterrupt:
  move.l  #49,D0           ;
  lea     _AudioTemp,A0    ; First we clean up
clearaudio                 ; The 200 audio bytes
  clr.l   (A0)+            ; This is handy for the editor
  dbra    D0,clearaudio    ;
  move.w  #1,_AudioTemp+6  ; Set Audio[i]->DMA
  move.w  #2,_AudioTemp+46 ;
  move.w  #4,_AudioTemp+86 ;
  move.w  #8,_AudioTemp+126;
  clr.w   $dff0a8          ; kill voices
  clr.w   $dff0b8          ;  ,,
  clr.w   $dff0c8          ;  ,,
  clr.w   $dff0d8          ;  ,,
  clr.b   _partvec         ; partvec = 0
  move.b  _StartTab,_tabvec; start position of song
  move.b  _speed,D0        ;
  sub.b   #1,D0            ;
  move.b  D0,_count        ;
  lea     trueA4,A0        ; Save A4
  move.l  A4,(A0)          ; To be used in interrupt
  move.w  #$4000,$dff09a   ; Disable interrupts
  lea     oldlevel3,A0     ; Get old interrupt and
  move.l  $6c,(A0)         ; Store somewhere
  move.l  #newlevel3,$6c   ; Replace it by our interrupt
  move.w  #$c000,$dff09a   ; Enable interrupts
  rts

_KillZound:
  move.w  #$4000,$dff09a   ; Disable interrupts
  move.l  oldlevel3,$6c    ; Restore old interrupt vector
  move.w  #$c000,$dff09a   ; Enable interrupts
  move.w  #15,$dff096      ; Switch off DMA
  rts

_intrMusic
  move.l   trueA4,A4       ; Get the right A4 !
  addq.b   #1,_count       ; Count++;
  move.b   _count,D1       ; Compare count with speed;
  cmp.b    _speed,D1       ; If equal:
  beq      newvoices       ;     start a new note
  tst.w    _dmaconhulp     ; Any voices to be switched on ?
  beq      nodma           ; If not: skip a while
  move.w   _dmaconhulp,D0  ; Get the voices to be switched on
  or.w     #$8200,D0       ; Prepare to set some bits
  move.w   D0,$dff096      ; Let the sound come out!
  clr.w    _dmaconhulp     ; clearit !
nodma
  movea.l  #$dff0a0,A3     ; Get voices's registerbase
  move.l   #20,D0          ; This waiting loop is nessacary
wait                       ; because the hardware ain't fast
  dbra     D0,wait         ; enough to change voice1's replen quickly
  move.l   #3,D5           ; We have 4 voices to handle so 3 ! (Thanx Dave!!)
  lea      _AudioTemp,A2   ; Get audio in A2
loop
  bsr      specials        ;
  adda.l   #40,A2          ; Let A2 point to next audiohulp
  adda.l   #16,A3          ; And A1 to next voice-registers
  dbra     D5,loop         ; Any voices left ? then handle them !
  rts                      ; Leave my music routine

specials
  btst.b   #0,21(A2)       ; Do we have Arpeggio here ?
  beq      noarpeggio      ; Yes it is beq here !
  btst.b   #1,21(A2)       ; If both bit 0 and bit 1 are set
  bne      superslide      ; Then use my superslide routine
  add.w    #1,30(A2)       ; Increment arpeggio counter
  btst.b   #0,31(A2)       ; If odd : resume loop
  bne      noslidehere     ;    else: poke new period
  move.w   30(A2),D1       ; Get count in D1
  asr.l    #1,D1           ; Divide by 2
  divu.w   #3,D1           ;
  swap     D1              ; Get count%3 in D1
  clr.l    D2              ;
  move.b   22(A2,D1.w),D2  ; Get current arpdata
  add.b    20(A2),D2       ; Add audio->basenote in D2
  asl.l    #1,D2           ; Mutiply with 2 because periods are words
  lea      _Periods,A0     ; Get the Periods table
  move.w   (A0,D2.l),6(A3) ; Poke the period
  bra      noslidehere     ;
superslide
  move.w   30(A2),D0       ; Compare count
  cmp.w    34(A2),D0       ; With Maxcount
  beq      noslidehere     ; If ready: exit
  addq.w   #1,D0           ;
  move.w   D0,30(A2)       ; Increment counter
  move.w   32(A2),D2       ; Get the Period difference
  muls.w   D0,D2           ; Multiply with counter
  divs.w   34(A2),D2       ; Divide by maxcount
  add.w    4(A2),D2        ; Add the period to it.
  move.w   D2,6(A3)        ; Let the sound come out.
  bra      noslidehere     ; 
noarpeggio
  btst.b   #1,21(A2)       ; Perhaps a Sliding note?
  beq      noslidehere     ;
  move.w   2(A2),D1        ; Get slidespeed in D1
  add.w    4(A2),D1        ; Add the period to it
  move.w   D1,4(A2)        ; Store it in the audio period
  move.w   D1,6(A3)        ; Let the sound come out!
noslidehere
  move.l   16(A2), (A3)    ; Poke audio->start
  move.w   10(A2),4(A3)    ; Poke audio->length
  rts

GetVolume
  clr.l     D0             ;
  move.w    26(A2),D0      ; Put audio->Samplevol in D0
  move.l    D4,D1          ; Put data in D1
  lsr.w     #8,D1          ; Shift it to get the Volume-add
  ext.w     D1             ; - may be negative
  add.w     D1,D0          ; Add it to the volume we've got
  move.b    1(A5),D1       ; Get intab->volume
  ext.w     D1             ; Extend to word
  add.w     D1,D0          ; Add it to the volume we've got
  cmp.w     #64,D0         ; If it exceeds the maximum
  bcs       volumeOK       ;   legal volume then
  tst.w     D0             ;
  bmi       negative       ;
  move.w    #64,D0         ; Put the volume on maximum
  bra       volumeOK       ;
negative
  clr.w     D0             ;
volumeOK
  move.w    D0,(A2)        ; Store it in audio->volume
  rts

newvoices
  clr.b     _count         ;
  move.l    #3,D5          ; 4 Voices...So set it to 3 (Thanx dave!)
  lea       _AudioTemp,A2  ;
  movea.l   #$dff0a0,A3    ; Install register voice base
  lea       _Table,A5      ; Get Tablebase
  clr.l     D0             ;
  move.b    _tabvec,D0     ; Add 16*tabvec
  asl.l     #4,D0          ;
  adda.l    D0,A5          ;
nvs
  btst.b    #0,29(A2)      ; Test if data is used for sliding
  beq       allOK          ;
  bclr.b    #0,29(A2)      ; Clear flag.
  bsr       specials       ; Do sliding ea
  bra       dontplayit     ; Handle next voice
allOK
  clr.l     D0             ;
  move.b    (A5),D0        ; Intab->partno in D0
  asl.l     #7,D0          ; Multiply with 128   (32 longwords)
  clr.l     D1             ;
  move.b    _partvec,D1    ; Partvec in D1
  asl.l     #2,D1          ; Multiply with 4
  add.l     D1,D0          ; Add it to the offset
  lea       _Parts,A1      ; Get partsbase in A1
  move.l    (A1,D0.l),D4   ; Get some usefull data out of it
  move.l    4(A1,D0.l),D7  ; Get next Data in D7
  move.l    D4,D0          ; Data in D0
  move.l    #24,D1         ; Shift it 24 to the right
  asr.l     D1,D0          ; Now got the note to be played
  and.b     #$3f,D0        ;
  bne       newnote        ; We don't play Zero's
  bsr       specials       ; Do the effects
  bra       dontplayit     ; 
newnote
  move.b    D0,20(A2)      ; Store it in audio->basenote
  move.l    D4,D0          ; Get data in D0
  and.l     #$f0000,D0     ; And it to get the control nibble
  move.l    #16,D1         ; Shift it 16 bits to the right
  asr.l     D1,D0          ;
  move.b    D0,21(A2)      ; And store it in audio->control
  btst.b    #2,21(A2)      ; Is the NONOTEADD flag set ?
  bne       nonoteadd      ;
  move.b    3(A5),D0       ; Else add intab->noteadd
  add.b     D0,20(A2)      ; To audio->basenote
nonoteadd
  clr.w     D0             ; Clever Aztec Code
  move.b    20(A2),D0      ;   Which I can't improve
  asl.w     #1,D0          ;   ;
  lea       _Periods,A0    ;   ;
  move.w    (A0,D0.w),4(A2);   ;
  btst.b    #0,21(A2)      ; Do we have an arpeggio here ?
  beq       noarp          ;
  btst.b    #1,21(A2)      ; Do we have UltraSlide ?
  bne       ultraslide     ;
  move.l    D4,D0          ; Get data in D0
  lsr.b     #4,D0          ; Put data>>4 in arpdata1
  move.b    D0,23(A2)      ;
  move.l    D4,D0          ; Get Data again
  and.b     #15,D0         ; Use the rightmost nibble
  move.b    D0,24(A2)      ; Store it in arpdata2
  clr.w     30(A2)         ; Reset counter
  bra       noslide        ;
ultraslide
  bset.b    #0,29(A2)      ; Notice that next data is used for sliding
  move.l    #24,D0         ;
  move.l    D7,D1          ;
  asr.l     D0,D1          ; Get Next note to be played
  btst.l    #18,D7         ; Test for NONOTEADD flag
  bne       ohboy          ; If not set:
  add.b     3(A5),D1       ; Add the noteadd to it
ohboy
  and.w     #$3f,D1        ; Dump the DMA-bits
  asl.w     #1,D1          ;
  lea       _Periods,A0    ;
  move.w    (A0,D1.w),D0   ; Next Period to be played
  sub.w     4(A2),D0       ; Substract the current period
  move.w    D0,32(A2)      ; Store it in period difference
  clr.w     30(A2)         ; Reset counter
  move.w    D4,D0          ; Get current data
  and.w     #$ff,D0        ; Extract time
  clr.w     D1             ;
  move.b    _speed,D1      ; Multiply by speed
  mulu.w    D1,D0          ;
  move.w    D0,34(A2)      ; Store it in maxcount
  bra       noslide        ;
noarp
  btst.b    #1,21(A2)      ; Do we want slide here ?
  beq       noslide        ;
  move.l    D4,D0          ; Get data in D0
  and.w     #$ff,D0        ; Use the rightmost byte
  ext.w     D0             ; Extend it to a word
  move.w    D0,2(A2)       ; Store it in audio->slidespeed
noslide
  move.l    D4,D0          ; Get Data again
  and.l     #$f00000,D0    ; Extract sample
  move.w    #20,D1         ; By shifting it 20 
  asr.l     D1,D0          ; To the right
  beq       oldsample      ; If zero, use old sample
  btst.b    #3,21(A2)      ; Is the NOINSTRADD bit set ?
  bne       noinstradd     ;
  add.b     2(A5),D0       ; Add the instrument add to tempbyte
noinstradd 
  bne       newsample      ;
oldsample                  ;
  bsr       GetVolume      ; Get the volume
  bra       nextvoice      ; If zero, Use the old Sample
newsample
  cmp.b     37(A2),D0      ; Maybe user made stupid music data...
  beq       oldsample      ; We do allready have this sample !!!
  move.b    D0,37(A2)      ; Save sampleno
  sub.l     #1,D0          ; Calculate new sample
  mulu.w    #54,D0         ;
  lea       _Sample,A6     ; Put it in A6
  adda.l    D0,A6          ;
  move.b    44(A6),D0      ;   !      Nasty things happen
  ext.w     D0             ;  !!!  if you use a byte address
  move.w    D0,26(A2)      ; !!!!!     as a word adress
  bsr       GetVolume      ; Well, that's clear (isn't it ?)
  move.l    (A6),12(A2)    ; Put Sample's start in audio->samplestart
  move.w    46(A6),8(A2)   ; Put Sample's length in audio->length
  move.w    48(A6),10(A2)  ; Put Sample's replen in audio->oneblowlen
  clr.l     D0             ;
  move.w    50(A6),D0      ; Get Sample's restart data in D0
  asl.l     #1,D0          ; Mutiply with 2
  add.l     12(A2),D0      ; Add audio->samplestart to it
  move.l    D0,16(A2)      ; And store it in audio->restart
nextvoice
  btst.l   #31,D4          ; Check for DMA off/on switch
  beq      DMAonoff        ;
  move.b   37(A2),D0       ; Check for sample yet to play
  cmp.b    36(A2),D0       ; If equal to last used sample
  beq      nonewDMA        ; Then don't start it.
  move.b   D0,36(A2)       ; Update last used sample
DMAonoff                   ; Switch it on anyway
  move.w    6(A2),$dff096  ; Turn voice off
  cmp.b    #63,20(A2)      ; If(audio->basenote==63)
  beq      dontplayit      ;
  move.w   6(A2),D0        ; dmaconhulp|=audio->dma;
  or.w     D0,_dmaconhulp  ;
  move.l   12(A2), (A3)    ; Poke Samplestart
  move.w    8(A2),4(A3)    ; Poke SampleLength
nonewDMA
  move.w    4(A2),6(A3)    ; Poke Period
  move.w     (A2),8(A3)    ; Poke Volume
dontplayit                 ;
  add.l    #40,A2          ; Get new AudioTemp
  add.l    #16,A3          ; Get new voice's registerbase
  addq.l   #4,A5           ; Get new intab
  dbra     D5,nvs          ; Have we processed all voices allready?
  addq.b   #1,_partvec     ; Next note
  cmpi.b   #32,_partvec    ; Are at the end of this part?
  bne      exit            ; If not: exit
  clr.b    _partvec        ; Install new part
  add.b    #1,_tabvec      ; Next tabel position
  move.b   _tabvec,D1      ;
  cmp.b    _EndTab,D1      ; Are we at the end of the song?
  bne      exit            ; If not: exit
  move.b  _StartTab,_tabvec; Restart song
exit
  rts
#endasm
