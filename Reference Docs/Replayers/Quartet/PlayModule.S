***********  PLAY MODULE **********
******** ©1990 Dan Lennard ********     

; This is the source code for the Play routine. Once you have
; loaded your samples and music, use ' jsr Play ' to start
; your music running. Once 'Play' has been called the music is
; maintained by the Vertical Blanking interrupt. Music files are
; terminated with $ffff words and the routine below turns the music
; off when this point is reached. Since the $ffff words are placed
; right after the last note, you should terminate your final
; note with a dummy zero volume note. This should be placed far 
; enough away from the final note, so that it does not effect the
; final note's duration. So, if the final note of the music lasts
; for about three time periods, the dummy note would be placed
; three time periods after it. I've provided an alternative 
; 'TurnOffMusic' subroutine which loops the music; to use this
; remove all the semi-colons from the subroutine and remove the
; original 'TurnOffMusic' subroutine. 


; INSTRUCTIONS:
;
; To incorporate the Play subroutine in your program:
;
; Music: Firstly, change the Tempo and MusicStart Registers to
; reflect where you have loaded your music.
;
; Set: if you're using a Quartet  'Set', you need only change
; the contents of 'SetPointer' to the address where you have
; loaded your set (low 512K!), the 'LoopWord' to this
; address + 336, and 'Offsets' to this address + 140384.
;
;
; If not using a Quartet 'Set' then change the components of the
; SampleBase table to the start addresses of your samples and
; their respective lengths in words. Also remove the indicated
; lines of the subroutines 'GNNote0, GNNote1, GnNote2, GNNote3';
; these subroutines take care of sample loops, start offsets
; and special lengths made by Quartet's sample editor. Also,
; remove the call to 'SampleAddressMake' in the 'Play' routine.
;
; 'LoopWord' is the sample looping control word. Each bit (0-15)
; controls whether that sample should loop or not. Within
; a Quartet set it is the word with offset 336. You'll need
; to set up your own LoopWord if not using a set.
; e.g.
;	LoopWord:	dc.l 0		; No Loops
; 
;
;
;
; For those interested: In a Quartet created 'Set', the first sample
; starts 352 bytes after the address where you load the
; set; this is due to the set header. Then comes 140K of sample
; space. The length of the samples within this space
; (in words) is specified by the sixteen words following
; Setstart + 140352. The subroutine 'SampleAddressMake',
; calculates the sample addresses from these lengths, the samples
; being stored contiguously. The final sixteen long words in the
; set are two words for each sample, specifying the start offset
; and the special length (0 if no special length) of that sample.
; 
;
;
; Calling the Play subroutine starts the interrupt driven music.
; Firstly it installs the interrupts, including the Vertical
; Blanking interrupt Server.
; If you have an existing Vertical Blanking interrupt in your code,
; delete the indicated lines in the 'InterruptsSetup' and
; 'UnLoadInterrupts' subroutines, and call 'GetNextBeat' from your
; interrupt.
;
; The subroutine 'GetNextBeat' is enabled by bit 0 of 'PlaySignal',
; clearing this bit will disenable the routine and thus suspend the
; music. To terminate the music completely, call the 'UnLoadInterrupts'
; routine.
;
; From Assemblers:
; Once you've loaded a set and some music (use Monam's 'Load Binary
; File' or Seka's 'ri'), you can call 'Start' from DevPac2 by selecting
; the Run option, and from Seka with 'g Start (BreakPoint = end)'.
;
; From Programs:
; Sets and music can be read in with the dos library Open() and Read()
; routines. See the source code for the demo if in doubt. Call the
; 'Play' subroutine to start the music.
;
; The 'Start' subroutine is for test purposes. It starts the music
; by calling 'Play' and then waits until you press the mouse button
; or the music reaches its specified end, whereupon the subroutine
; 'UnLoadInterrupts' is executed.
;
;
; In summary, assuming you don't have another Vert-Blank interrupt, just
; call the 'Play' subroutine to start the music (having loaded your
; samples and music). Call 'UnLoadInterrupts' to turn off the music.


; For the interested, each note is stored as two consecutive bytes:

;			01 111111    0001 0003 
;			/    |         |    \
;		  Octave   Volume    Sample  Note Value
;		  (0-2)    (1-63)    (0-15)   (1-12 = F#-G)
;
;
; Notes succeeded by a XX000000 11111110 word are slide notes.




*        ------------------------------------------------	 *
*			CODE STARTS HERE			 * 
*        ------------------------------------------------	 *


	bra Start	; This is for the benefit of a DevPac2 Run.

***** MUSIC *****

Tempo = $5d000		; This should be set to the music start
			; address, since the tempo is Stored
			; in the first byte of the music file.

MusicStart:
	dc.l $5d002	; This long word should contain the music
			; start address + 2.


*****  SET  *****

SetPointer:
	dc.l $3a560	; Contains address of set start point.

LoopWord = $3a6b0	; Should set to the above + 336.

Offsets = $5c9c0	; Should be set to the above + 140384

SampleBase:
***         Block 1          ***
	dc.l $3a6c2,4998	; Address and length of blk1 smpl 1
	dc.l $3cdd2,4998	; Address and length of blk1 smpl 2
	dc.l $3f4e2,4998	; etc ..
	dc.l $41bf2,4998	; etc ...
***         Block 2          ***
	dc.l $44302,4998
	dc.l $46a12,4998
	dc.l $49122,4998
	dc.l $4b832,4998
***         Block 3          ***
	dc.l $4df42,4998
	dc.l $50652,4998
	dc.l $52d62,4998
	dc.l $55472,4998
***         Block 4          ***
	dc.l $57b82,2498
	dc.l $58f0a,2498
	dc.l $5a292,2498
	dc.l $5b61a,2498

Play:	
	bsr InterruptsSetup
	bsr SampleAddressMake	; Use only with Quartet Sets.

** The following 8 instructions force the sound channels
** to their idling state, ready to be re-started.

	move.w #$000f,$dff096
	move.w #12,$dff0a6
	move.w #12,$dff0b6
	move.w #12,$dff0c6
	move.w #12,$dff0d6
	move.w #$8780,$dff09c
	move.w #$8780,$dff09a
	
	move.w #288,ChZeroPer		; Initialize Sound
	move.w #288,ChOnePer		; variables.
	move.w #288,ChTwoPer
	move.w #288,ChThreePer
	clr.w ChZeroVol
	clr.w ChOneVol
	clr.w ChTwoVol
	clr.w ChThreeVol
		
	move.l MusicStart,AudPos	; Initialize Music Pointer.	
			
	move.w #$800f,$dff096		; Enable audio DMA.

	move.b Tempo,TempoCounter	; Initialize counter.
	bset #0,PlaySignal		; Enable 'GetNextBeat'.
	rts


InterruptsSetup:		; Sets up sound and Vert-Blank
	move.w #$0780,$dff09a	; interrupts.
	move.l $004,a6
	move.l #7,d0		; Channel 0 int number.
	lea Data0,a1		; Channel 0 int data.
	jsr -162(a6)		; SetIntVector().
	move.l #8,d0		; Channel 1 int number.
	lea Data1,a1		; etc etc.
	jsr -162(a6)
	move.l #9,d0
	lea Data2,a1
	jsr -162(a6)
	move.l #10,d0
	lea Data3,a1
	jsr -162(a6)
	move.l #5,d0		; REMOVE THESE THREE LINES
	lea Data4,a1		; IF USING EXISTING VERT-BLANKING
	jsr -168(a6)		; INTERRUPT.
	rts

; The Interrupt Data.	

Data0:
	dc.l $00000902
	dc.w 0,0,0,0,0,0,0
	dc.l AudIntZero

Data1:
	dc.l $00000902,0,0,0
	dc.w 0
	dc.l AudIntOne

Data2:
	dc.l $00000902,0,0,0
	dc.w 0
	dc.l AudIntTwo

Data3:
	dc.l $00000902,0,0,0
	dc.w 0
	dc.l AudIntThree

Data4:
	dc.l $00000902,0,0,0
	dc.w 0
	dc.l GetNextBeat

TempoCounter:
	dc.b 1

	even

GetNextBeat:			; This subroutine should be called
	move.w #$0020,$dff09c	; once every Vertical Blank.
	btst #0,PlaySignal
	bne DoPlay
	rts
DoPlay:	
	tst.b SlideSignals
	beq NoSlides
	jsr SlideServicer
NoSlides:
	subq.b #1,TempoCounter
	beq NextNotePeriod
	rts

NextNotePeriod:
	movem.l a3/a1/a0/d7/d3/d0,-(a7)
	move.l AudPos,a1
	cmpi.w #$ffff,(a1)	; Have we reached end of music?
	beq TurnOffMusic
	cmpi.w #$ffff,2(a1)
	beq TurnOffMusic
	cmpi.w #$ffff,4(a1)
	beq TurnOffMusic
	cmpi.w #$ffff,6(a1)
	beq TurnOffMusic
PlayNotes:
	move.b Tempo,TempoCounter	; Reset Tempo counter.

TryNewNoteCh0:
	tst.b (a1)
	beq TryNewNoteCh1
	cmpi.b #$fe,1(a1)
	beq TryNewNoteCh1	
	move.w #2,$dff0a6
	move.w #$0001,$dff096
	move.w #$8080,$dff09c
	bsr GNNote0
	bclr #0,SignalCh0
	move.l ChZeroLoc,$dff0a0
	move.w ChZeroLen,$dff0a4
	move.w ChZeroPer,$dff0a6
	move.w ChZeroVol,$dff0a8
	move.w #$8001,$dff096
	cmpi.b #$fe,9(a1)
	bne TryNewNoteCh1
	jsr MakeSlideCh0

TryNewNoteCh1:
	tst.b 2(a1)
	beq TryNewNoteCh2
	cmpi.b #$fe,3(a1)
	beq TryNewNoteCh2	
	move.w #2,$dff0b6
	move.w #$0002,$dff096
	move.w #$8100,$dff09c
	bsr GNNote1
	bclr #0,SignalCh1
	move.l ChOneLoc,$dff0b0
	move.w ChOneLen,$dff0b4
	move.w ChOnePer,$dff0b6
	move.w ChOneVol,$dff0b8
	move.w #$8002,$dff096
	cmpi.b #$fe,11(a1)
	bne TryNewNoteCh2
	jsr MakeSlideCh1

TryNewNoteCh2:
	tst.b 4(a1)
	beq TryNewNoteCh3 
	cmpi.b #$fe,5(a1)
	beq TryNewNoteCh3	
	move.w #2,$dff0c6
	move.w #$0004,$dff096
	move.w #$8200,$dff09c
	bsr GNNote2
	move.l ChTwoLoc,$dff0c0
	move.w ChTwoLen,$dff0c4
	move.w ChTwoPer,$dff0c6
	move.w ChTwoVol,$dff0c8
	bclr #0,SignalCh2
	move.w #$8004,$dff096
	cmpi.b #$fe,13(a1)
	bne TryNewNoteCh3
	jsr MakeSlideCh2

TryNewNoteCh3:
	tst.b 6(a1)
	beq Vertblend
	cmpi.b #$fe,7(a1)
	beq Vertblend	
	move.w #2,$dff0d6
	move.w #$0008,$dff096
	move.w #$8400,$dff09c
	bsr GNNote3
	move.l ChThreeLoc,$dff0d0
	move.w ChThreeLen,$dff0d4
	move.w ChThreePer,$dff0d6
	move.w ChThreeVol,$dff0d8
	bclr #0,SignalCh3
	move.w #$8008,$dff096
	cmpi.b #$fe,15(a1)
	bne Vertblend
	jsr MakeSlideCh3
Vertblend:
	addq.l #8,AudPos
	movem.l (a7)+,a3/a1/a0/d7/d3/d0
	rts

TurnOffMusic:
	clr.w $dff0a8
	clr.w $dff0b8
	clr.w $dff0c8
	clr.w $dff0d8
	move.w #$000f,$dff096
	move.w #$0780,$dff09a
	move.w #$0780,$dff09c
	bclr #0,PlaySignal
	bra Vertblend

;TurnOffMusic:			; USE THIS SUBROUTINE FOR LOOPING MUSIC.
;	move.l MusicStart,AudPos	
;	move.l AudPos,a1
;	bra PlayNotes

	
AudIntZero:			; Interrupt for Channel 0.
	move.w #$0080,$dff09c
	btst #0,SignalCh0
	beq donowt0
	clr.w $dff0a8
donowt0:
	bset #0,SignalCh0
	rts

AudIntOne:			; Interrupt for Channel 0.
	move.w #$0100,$dff09c
	btst #0,SignalCh1
	beq donowt1
	clr.w $dff0b8
donowt1:
	bset #0,SignalCh1
	rts

AudIntTwo:			; Interrupt for Channel 0.
	move.w #$0200,$dff09c
	btst #0,SignalCh2
	beq donowt2
	clr.w $dff0c8
donowt2:
	bset #0,SignalCh2
	rts

AudIntThree:			; Interrupt for Channel 0.
	move.w #$0400,$dff09c
	btst #0,SignalCh3
	beq donowt3
	clr.w $dff0d8
donowt3:
	bset #0,SignalCh3
	rts

SignalCh0:
	dc.b 0
SignalCh1:
	dc.b 0
SignalCh2:
	dc.b 0
SignalCh3:
	dc.b 0

Delay:
	move.w #$150,d0
Delay2:
	dbf d0,Delay2
	rts

GetNextNoteChannel0:
	bsr Delay
	bclr #0,SlideSignals
	moveq #0,d0
	move.b (a1),d7		; a1 contains AudPos
	andi.l #$3f,d7
	addq.b #1,d7
	move.w d7,ChZeroVol
	move.b 1(a1),d7
	andi.l #$f0,d7		; Extract Sample Number.
	lsr.b #1,d7
	lea SampleBase,a3
	move.l (a3,d7),ChZeroLoc
	move.w 6(a3,d7),ChZeroLen
	move.b 1(a1),d7
	and.b #$0f,d7		; Extract note.
	subq.b #1,d7
	asl.b #1,d7
	lea PeriodBase,a3
	move.w (a3,d7),d3	; D3 contains Period.
	move.b (a1),d7
	lsr.b #6,d7		; Extract Octave.
	btst #1,d7
	beq lat0
	lsr.w #1,d3
lat0:	
	tst.b d7
	bne Leave0
	asl.w #1,d3
Leave0:
	move.w d3,ChZeroPer	; Octave modulated Period.
	rts

GetNextNoteChannel1:
	bsr Delay
	bclr #1,SlideSignals
	moveq #2,d0
	move.b (a1,d0),d7
	andi.l #$3f,d7
	addq.b #1,d7
	move.w d7,ChOneVol
	move.b 1(a1,d0),d7
	andi.l #$f0,d7		; Extract Sample.
	lsr.b #1,d7
	lea SampleBase,a3
	move.l (a3,d7),ChOneLoc
	move.w 6(a3,d7),ChOneLen
	move.b 1(a1,d0),d7
	and.b #$0f,d7		; Extract note.
	subq.b #1,d7
	asl.b #1,d7
	lea PeriodBase,a3
	move.w (a3,d7),d3	; D3 contains Period.
	move.b (a1,d0),d7
	lsr.b #6,d7		; Extract Octave.
	btst #1,d7
	beq lat1
	lsr.w #1,d3
lat1:	
	tst.b d7
	bne Leave1
	asl.w #1,d3
Leave1:
	move.w d3,ChOnePer	; Octave modulated Period.
	rts


GetNextNoteChannel2:
	bsr Delay
	bclr #2,SlideSignals
	moveq #4,d0
	move.b (a1,d0),d7
	andi.l #$3f,d7
	addq.b #1,d7
	move.w d7,ChTwoVol
	move.b 1(a1,d0),d7
	andi.l #$f0,d7		; Extract Sample.
	lsr.b #1,d7
	lea SampleBase,a3
	move.l (a3,d7),ChTwoLoc
	move.w 6(a3,d7),ChTwoLen
	move.b 1(a1,d0),d7
	and.b #$0f,d7		; Extract note.
	subq.b #1,d7
	asl.b #1,d7
	lea PeriodBase,a3
	move.w (a3,d7),d3	; D3 contains Period.
	move.b (a1,d0),d7
	lsr.b #6,d7		; Extract Octave.
	btst #1,d7
	beq lat2
	lsr.w #1,d3
lat2:	
	tst.w d7
	bne Leave2
	asl.w #1,d3
Leave2:
	move.w d3,ChTwoPer	; Octave modulated Period.
	rts

GetNextNoteChannel3:
	bsr Delay
	bclr #3,SlideSignals
	moveq #6,d0
	move.b (a1,d0),d7
	andi.l #$3f,d7
	addq.b #1,d7
	move.w d7,ChThreeVol
	move.b 1(a1,d0),d7
	andi.l #$f0,d7		; Extract Sample.
	lsr.b #1,d7
	lea SampleBase,a3
	move.l (a3,d7),ChThreeLoc
	move.w 6(a3,d7),ChThreeLen
	move.b 1(a1,d0),d7
	and.b #$0f,d7		; Extract note.
	subq.b #1,d7
	asl.b #1,d7
	lea PeriodBase,a3
	move.w (a3,d7),d3	; D3 contains Period.
	move.b (a1,d0),d7
	lsr.b #6,d7		; Extract Octave.
	btst #1,d7
	beq lat3
	lsr.w #1,d3
lat3:	
	tst.w d7
	bne Leave3
	asl.w #1,d3
Leave3:
	move.w d3,ChThreePer	; Octave modulated Period.
	rts

PeriodBase:
	dc.w 204,216,229,242,257,272,288,305,323,343,363,384
	dc.b 102,108,114,121,128,136,144,153,162,171,181,192
AudPos:
	dc.l 0
ChZeroLoc:
	dc.l 0
ChZeroLen:
	dc.w 0
ChZeroPer:
	dc.w 0
ChZeroVol:
	dc.w 0
ChOneLoc:
	dc.l 0
ChOneLen:
	dc.w 0
ChOnePer:
	dc.w 0
ChOneVol:	
	dc.w 0
ChTwoLoc:
	dc.l 0
ChTwoLen:
	dc.w 0
ChTwoPer:
	dc.w 0
ChTwoVol:
	dc.w 0
ChThreeLoc:
	dc.l 0
ChThreeLen:
	dc.w 0
ChThreePer:
	dc.w 0
ChThreeVol:
	dc.w 0

ChZeroLocStore:
	dc.l 0
ChZeroLenStore:
	dc.w 0
ChZeroPerStore:
	dc.w 0
ChZeroVolStore:
	dc.w 0
ChOneLocStore:
	dc.l 0
ChOneLenStore:
	dc.w 0
ChOnePerStore:
	dc.w 0
ChOneVolStore:	
	dc.w 0
ChTwoLocStore:
	dc.l 0
ChTwoLenStore:
	dc.w 0
ChTwoPerStore:
	dc.w 0
ChTwoVolStore:
	dc.w 0
ChThreeLocStore:
	dc.l 0
ChThreeLenStore:
	dc.w 0
ChThreePerStore:
	dc.w 0
ChThreeVolStore:
	dc.w 0
PlaySignal:
	dc.b 0,0

	
NextNoteGet:
	moveq #0,d3
	moveq #1,d0
FindLoop:
	addq.b #1,d0
	addq.l #8,a3
	move.b (a3),d3
	andi.b #$3f,d3
	bne NextNoteFound
	cmpi.b #36,d0
	blt FindLoop
	move.w #0,d0
	rts
NextNoteFound:
	move.b 1(a3),d3
	andi.b #$0f,d3
	subq.b #1,d3
	asl.b #1,d3
	lea PeriodBase,a0
	move.w (a0,d3),d7
	move.b (a3),d3
	lsr.b #6,d3
	btst #0,d3
	bne MulTempo
	btst #1,d3
	beq Loct
	lsr.w #1,d7
	bra MulTempo
Loct:
	asl.w #1,d7
MulTempo:
	move.b Tempo,d3
	muls d3,d0
	rts

MakeSlideCh0:
	lea 8(a1),a3
	jsr NextNoteGet
	tst.w d0
	beq ExitSlide
	bset #0,SlideSignals
	move.w #1,SecondaryIncCh0
	sub.w ChZeroPer,d7
	bgt PosIncCh0
	move.w #-1,SecondaryIncCh0 
PosIncCh0:
	move.w d7,d3
	ext.l d3
	divs d0,d3
	move.w d3,BaseIncCh0
	swap d3
	move.w d3,RemCh0
	bge nonNeg0
	neg.w RemCh0
nonNeg0:
	move.w d0,NumberOfVBsCh0
	clr.w RemCountCh0
ExitSlide:
	rts

MakeSlideCh1:
	lea 10(a1),a3
	jsr NextNoteGet
	tst.w d0
	beq ExitSlide
	bset #1,SlideSignals
	move.w #1,SecondaryIncCh1
	sub.w ChOnePer,d7
	bgt PosIncCh1
	move.w #-1,SecondaryIncCh1 
PosIncCh1:
	move.w d7,d3
	ext.l d3
	divs d0,d3
	move.w d3,BaseIncCh1
	swap d3
	move.w d3,RemCh1
	bge nonNeg1
	neg.w RemCh1
nonNeg1:
	move.w d0,NumberOfVBsCh1
	clr.w RemCountCh1
	rts

MakeSlideCh2:
	lea 12(a1),a3
	jsr NextNoteGet
	tst.w d0
	beq ExitSlide
	bset #2,SlideSignals
	move.w #1,SecondaryIncCh2
	sub.w ChTwoPer,d7
	bgt PosIncCh2
	move.w #-1,SecondaryIncCh2 
PosIncCh2:
	move.w d7,d3
	ext.l d3
	divs d0,d3
	move.w d3,BaseIncCh2
	swap d3
	move.w d3,RemCh2
	bge NonNeg2
	neg.w RemCh2
NonNeg2:
	move.w d0,NumberOfVBsCh2
	clr.w RemCountCh2
	rts

MakeSlideCh3:
	lea 14(a1),a3
	jsr NextNoteGet
	tst.w d0
	beq ExitSlide
	bset #3,SlideSignals
	move.w #1,SecondaryIncCh3
	sub.w ChThreePer,d7
	bgt PosIncCh3
	move.w #-1,SecondaryIncCh3 
PosIncCh3:
	move.w d7,d3
	ext.l d3
	divs d0,d3
	move.w d3,BaseIncCh3
	swap d3
	move.w d3,RemCh3
	bge nonNeg3
	neg.w RemCh3
nonNeg3:
	move.w d0,NumberOfVBsCh3
	clr.w RemCountCh3
	rts


SlideServicer:
	btst #0,SlideSignals
	beq NoSlideOnCh0
	bsr DoSlideCh0
NoSlideOnCh0:
	btst #1,SlideSignals
	beq NoSlideOnCh1
	bsr DoSlideCh1
NoSlideOnCh1:
	btst #2,SlideSignals
	beq NoSlideOnCh2
	bsr DoSlideCh2
NoSlideOnCh2:
	btst #3,SlideSignals
	beq NoSlideOnCh3
	bsr DoSlideCh3
NoSlideOnCh3:
	rts

DoSlideCh0:
	movem.l d4/d3,-(a7)
	move.w BaseIncCh0,d3
	add.w d3,ChZeroPer
	move.w RemCountCh0,d3
	add.w RemCh0,d3
	cmp.w NumberOfVBsCh0,d3
	blt NoExtraCh0
	move.w SecondaryIncCh0,d4
	add.w d4,ChZeroPer
	sub.w NumberOfVBsCh0,d3
NoExtraCh0:
	move.w d3,RemCountCh0
	move.w ChZeroPer,$dff0a6
	movem.l (a7)+,d4/d3
	rts
	
DoSlideCh1:
	movem.l d4/d3,-(a7)
	move.w BaseIncCh1,d3
	add.w d3,ChOnePer
	move.w RemCountCh1,d3
	add.w RemCh1,d3
	cmp.w NumberOfVBsCh1,d3
	blt NoExtraCh1
	move.w SecondaryIncCh1,d4
	add.w d4,ChOnePer
	sub.w NumberOfVBsCh1,d3
NoExtraCh1:
	move.w d3,RemCountCh1
	move.w ChOnePer,$dff0b6
	movem.l (a7)+,d4/d3
	rts	

DoSlideCh2:
	movem.l d4/d3,-(a7)
	move.w BaseIncCh2,d3
	add.w d3,ChTwoPer
	move.w RemCountCh2,d3
	add.w RemCh2,d3
	cmp.w NumberOfVBsCh2,d3
	blt NoExtraCh2
	move.w SecondaryIncCh2,d4
	add.w d4,ChTwoPer
	sub.w NumberOfVBsCh2,d3
NoExtraCh2:
	move.w d3,RemCountCh2
	move.w ChTwoPer,$dff0c6
	movem.l (a7)+,d4/d3
	rts	

DoSlideCh3:
	movem.l d4/d3,-(a7)
	move.w BaseIncCh3,d3
	add.w d3,ChThreePer
	move.w RemCountCh3,d3
	add.w RemCh3,d3
	cmp.w NumberOfVBsCh3,d3
	blt NoExtraCh3
	move.w SecondaryIncCh3,d4
	add.w d4,ChThreePer
	sub.w NumberOfVBsCh3,d3
NoExtraCh3:
	move.w d3,RemCountCh3
	move.w ChThreePer,$dff0d6
	movem.l (a7)+,d4/d3
	rts	

SlideSignals:
	dc.b 0,0
RemCh0:
	dc.w 0
RemCountCh0:
	dc.w 0
BaseIncCh0:
	dc.w 0
SecondaryIncCh0:
	dc.w 0


RemCh1:
	dc.w 0
RemCountCh1:
	dc.w 0
BaseIncCh1:
	dc.w 0
SecondaryIncCh1:
	dc.w 0

RemCh2:
	dc.w 0
RemCountCh2:
	dc.w 0
BaseIncCh2:
	dc.w 0
SecondaryIncCh2:
	dc.w 0

RemCh3:
	dc.w 0
RemCountCh3:
	dc.w 0
BaseIncCh3:
	dc.w 0
SecondaryIncCh3:
	dc.w 0

NumberOfVBsCh0:
	dc.w 0
NumberOfVBsCh1:
	dc.w 0
NumberOfVBsCh2:
	dc.w 0
NumberOfVBsCh3:
	dc.w 0


GNNote0:
; If not using a Quartet Set remove all the following 
; asterisked lines to disable the start offset and special
; length functions.

	move.w #$8080,$dff09a
	jsr GetNextNoteChannel0

	movem.l a2/d1,-(a7)	;*
	move.b 1(a1),d7			
	andi.l #$f0,d7		
	lsr.b #2,d7		
	clr.l d1		;*
	lea Offsets,a2		;*
	move.w (a2,d7),d1	;*
	add.l d1,ChZeroLoc	;*
	move.w 2(a2,d7),d1	;*
	beq NoSpecLength0	;*	
	move.w d1,ChZeroLen	;*
NoSpecLength0:			;*
	movem.l (a7)+,a2/d1	;*

	lsr.b #2,d7
	move.w LoopWord,d0
	btst d7,d0
	beq LeaveIntOn0
	move.w #$0080,$dff09a
LeaveIntOn0:
	rts

GNNote1:
	move.w #$8100,$dff09a
	jsr GetNextNoteChannel1

	movem.l a2/d1,-(a7)	;*
	move.b 3(a1),d7
	andi.l #$f0,d7
	lsr.b #2,d7
	clr.l d1		;*
	lea Offsets,a2		;*
	move.w (a2,d7),d1	;*
	add.l d1,ChOneLoc	;*
	move.w 2(a2,d7),d1	;*
	beq NoSpecLength1	;*
	move.w d1,ChOneLen	;*
NoSpecLength1:			;*
	movem.l (a7)+,a2/d1	;*

	lsr.b #2,d7	
	move.w LoopWord,d0
	btst d7,d0
	beq LeaveIntOn1
	move.w #$0100,$dff09a
LeaveIntOn1:
	rts

GNNote2:
	move.w #$8200,$dff09a
	jsr GetNextNoteChannel2

	movem.l a2/d1,-(a7)	;*
	move.b 5(a1),d7
	andi.l #$f0,d7
	lsr.b #2,d7
	clr.l d1		;*
	lea Offsets,a2		;*
	move.w (a2,d7),d1	;*
	add.l d1,ChTwoLoc	;*
	move.w 2(a2,d7),d1	;*
	beq NoSpecLength2	;*
	move.w d1,ChTwoLen	;*
NoSpecLength2:			;*
	movem.l (a7)+,a2/d1	;*

	lsr.b #2,d7
	move.w LoopWord,d0
	btst d7,d0
	beq LeaveIntOn2
	move.w #$0200,$dff09a
LeaveIntOn2:
	rts


GNNote3:
	move.w #$8400,$dff09a
	jsr GetNextNoteChannel3

	movem.l a2/d1,-(a7)	;*
	move.b 7(a1),d7
	andi.l #$f0,d7
	lsr.b #2,d7
	clr.l d1		;*
	lea Offsets,a2		;*
	move.w (a2,d7),d1	;*
	add.l d1,ChThreeLoc	;*
	move.w 2(a2,d7),d1	;*
	beq NoSpecLength3	;*
	move.w d1,ChThreeLen	;*
NoSpecLength3:			;*
	movem.l (a7)+,a2/d1	;*

	lsr.b #2,d7
	move.w LoopWord,d0
	btst d7,d0
	beq LeaveIntOn3
	move.w #$0400,$dff09a
LeaveIntOn3:
	rts


SampleAddressMake:
	lea $5c9a0,a1
	lea SampleBase,a2
	move.b #16,d0
	move.l #$3a6c2,d1
	clr.l d2
MSBLoop:
	move.l d1,(a2)+
	move.w (a1)+,d2
	cmp.l #50,d2
	ble MakeFifty
	move.l d2,(a2)+
	addq.w #2,d2
	asl.w #1,d2
	add.l d2,d1
MFBack:
	subq.b #1,d0
	bne MSBLoop
	rts
MakeFifty:
	move.l #50,(a2)+
	bra MFBack



UnLoadInterrupts:
	bclr #0,PlaySignal
	move.w #$000f,$dff096		; Turn-off Audio DMA.
	move.w #$0780,$dff09a		; Disable Sound Interrupts.

	move.l $04,a6			; **  DELETE THESE 4
	move.l #5,d0			; LINES IF USING
	lea Data4,a1			; EXISTING VERT-BLANKING
	jsr -174(a6)			; INTERRUPT  **

end:
	rts

Start:	
	bsr Play
Waitbutton:	
	btst #0,PlaySignal
	beq UnLoadInterrupts
	btst #6,$bfe0ff			; Is mouse button pressed.
	bne Waitbutton			; If not loop.
	bra UnLoadInterrupts		; If so then Exit.

