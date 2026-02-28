
***    Demo Source   ***
** © 1990 Dan Lennard **

; This is the source code for the Raw Demo. It should 
; compile on a half-meg Amiga, but make sure the files
; are loaded to a safe part of memory, i.e. somewhere
; where the assembler isn't in residence! The program exits
; if it can't get the memory it wants, before reading.
;
; The program grabs memory, loads the picture, music and
; samples and then displays the picture and starts the music.
; It then waits in a loop until the mouse is pressed or the 
; music terminates. The length of the music file is obtained
; with the 'GetLength' subroutine. A memory block of this length
; is then requested in the 'Read' routine before the file is
; loaded.
;
; The picture is displayed and removed by the ScreenIn and
; ScreenOut subroutines. ScreenIn firstly sets up the colour 
; and bitplane registers in the copper list before relocating
; it in display memory.
;
;
; INSTRUCTIONS:

; You can run this from Devpac2 by selecting the RUN option,
; and from Seka with ' g ReserveMem (BreakPoint = End)'. Make
; sure you're not in any disk directories, in which case the
; program would fail to find the sample, music and picture files.

; This program incorporates the main PlayModule, also on this
; disk, mated with a file reader, to read in the two files used
; by that module as well as the picture file. I've commented the
; bits you might want to change.
;
;
; Happy Hacking!




;      *************************************************
;      **              Code Starts Here:	      **
;      *************************************************

; The following section of code, responds to the Multi-Tasking
; overhead for a clicked icon; your Geru will meditate without it!
; It is however, also fatal if ran from an assembler, so I've commented
; it out for now; remove the semi-colons to re-activate; there's also 
; an 'rts' in the ReturnDos subroutine which should be removed if
; you're creating an executable object file.

;	move.l $04,a6
;	suba.l a1,a1
;	jsr -294(a6)		; FindTask().
;	move.l d0,a4
;	tst.l $ac(a4)
;	bne ReserveMem
;	lea $5c(a4),a0
;	jsr -384(a6)		; Waitport().
;	lea $5c(a4),a0
;	jsr -372(a6)		; GetMsg().

	
ReserveMem:

; This section, reserves the memory required by the samples,
; the music data and the picture. If you change this, also change
; the GiveBackMem subroutine so that the number of bytes correspond.

	bsr NTSCChecker
	move.l $04,a6		; ExecBase in A6.
	move.l #192530,d0	; Number of bytes to reserve.
	lea $3a560,a1		; Where to reserve from.
	jsr -204(a6)		; AllocAbs().
	tst.l d0		; Did we get the memory?
	beq WarningMessage	; If so, message and exit.
	bsr Messagedo		; Credit message.
	bra Read		; Read the files from disk.
BackFromRead:
	bsr TempoVerify
	bsr ScreenIn		; Put up our screen.
	bset #1,$bfe0ff		; Turn off Low Pass Filter.
	bsr Play		; Start playing the music.
	bsr WaitforMouse	; Waits until mouse clicked. 
	move.w #$000f,$dff096	; Turn off sound channels.
	move.w #$0780,$dff09a	; Turn off sound interrupts.
	bclr #1,$bfe0ff		; Turn on Low Pass Filter.
	bsr ScreenOut		; Return WorkBench screen.
	jsr UnLoad		; Remove all interrupts.
GeneralReturn:	
	bsr GiveBackMem		; Return memory
	bra CloseWindow		; Close the message window
				; and return to dos.

GiveBackMem:
	move.l $04,a6		; Execbase in a6.
	move.l #192530,d0	; 215712 bytes to give back.
	lea $3a560,a1		; Memory from $3a560.
	jsr -210(a6)		; FreeMem().

	move.l $04,a6		; Execbase in a6.
	move.l MusicLength,d0	; Music bytes to give back.
	beq NoneToReturn
	move.l MusicStart,a1	; Where in MusicStart.
	sub.l #2,a1
	jsr -210(a6)		; FreeMem().
NoneToReturn:
	rts


Dosopen:			; Open dos library.
	move.l $004,a6
	lea dos,a1		; Dos library definition.
	jsr -408(a6)		; OldOpenLibrary().
	move.l d0,DosBase	; Store dos base.
	move.l d0,a6		; Leave in A6.
	rts


WaitforMouse:
	btst #6,$bfe0ff		; Is Mouse button currently pressed?
	beq WaitforMouse	; If so wait.
Waitbutton:
	btst #0,PlaySignal
	beq MusicEnded		; Has Music terminated?
	btst #6,$bfe0ff		; Is left mouse button pressed?
	bne Waitbutton		; If not, loop.
WaitMouse2:
	btst #6,$bfe0ff		; Is mouse button still pressed?
	beq WaitMouse2		; If so wait.
MusicEnded:
	rts



Read:	
	bsr Dosopen		; Open dos library.
	lea Setname,a1		; File name stored from $Setname
	move.l a1,d1		; terminated with a zero.
	move.l #1005,d2		; Existing file mode.
	jsr -30(a6)		; Open() file.
	move.l d0,d1		; Move File ref.no. to d1.
	beq GeneralReturn	; If file not opened then return.
	move.l #$3a560,d2	; Where to read Set into.
	move.l #141000,d3	; Length of set.
	jsr -42(a6)		; Read().
	beq GeneralReturn	; Return if Read failed.

	move.l DosBase,a6
	lea PictureName,a1	; Picture file name stored from
	move.l a1,d1		; $PictureName.
	move.l #1005,d2		; Existing file mode.
	jsr -30(a6)		; Open() file.
	move.l d0,d1		; Move file ref.no to d1.
	beq GeneralReturn	; If file not opened then return.
	move.l #$5cc28,d2	; Where to read picture into
	move.l #51264,d3	; Length of Picture.
	jsr -42(a6)		; Read() Picture file.
	beq GeneralReturn	; Return if Read failed.

	move.l #Musicname,d1
	bsr GetLength		; Get Music Length.
	move.l d0,MusicLength
	clr.l d1		; No special requirments.
	move.l $04,a6
	jsr -198(a6)		; Ask for enough music mem.
	beq MusicTooLong
	move.l d0,MusicStart
	add.l #2,MusicStart

	move.l DosBase,a6
	lea Musicname,a1	; Music file name stored from
	move.l a1,d1		; $MusicName.
	move.l #1005,d2		; Existing file mode.
	jsr -30(a6)		; Open() file.
	move.l d0,d1		; Move file ref.no to d1.
	beq GeneralReturn	; If file not opened then return.
	move.l MusicStart,d2	; Where to read music into
	subq.l #2,d2		; Allow for Tempo Header.
	move.l MusicLength,d3	; Max Length of Music.
	jsr -42(a6)		; Read() Music file.
	beq GeneralReturn	; Return if Read failed.
	move.l MusicStart,a1
	move.b -2(a1),Tempo
	move.b -1(a1),Tempo+1

	bra BackFromRead	; Back to main routine.

MusicTooLong:
	clr.l MusicLength
	bra GeneralReturn

Messagedo:
	bsr Dosopen
	lea ConsolName,a1	; Window definition stored
	move.l #1005,d0		; from $ConsolName.
	move.l d0,d2
	move.l a1,d1
	jsr -30(a6)		; Open window.
	beq NoWindow		; Return if failed.
	move.l d0,WindowHandle	; Save window ref.no.
	move.l WindowHandle,d1	; Put window ref.no in d1. 
	move.l #message,d2	; Message stored from $Message.
	move.l #endmessage-message,d3	;Length of message in  d3.
	move.l DosBase,a6
	jsr -48(a6)		; Write to window.
NoWindow:
	rts

CloseWindow:
	move.l WindowHandle,d1	; Put Window ref.no in d1.
	move.l DosBase,a6
	jsr -36(a6)		; Close window.


ReturnDos:
end:
	rts			; REMOVE THIS IF WRITNG OBJECT
				; FILE (SEKA) OR ASSEMBLING
				; TO DISK (DEVPAC).
	bsr Dosopen
	move.w #$0780,$dff09a	; Turn off Sound interrupts.
	moveq #0,d1		; Default Return code.
	move.l DosBase,a6
	jmp -144(a6)		; Exit() to Workbench.


***********  PLAY MODULE **********
******** ©1990 Dan Lennard ********     


***** MUSIC *****

Tempo:
	dc.b 0,0

MusicStart:
	dc.l 0		; This long word should contain the music
			; start address + 2.

MusicLength:
	dc.l 0

*****  SET  *****

SetPointer:
	dc.l $3a560	; Contains address of set start point.

LoopWord = $3a6b0	; Should be set to the above + 336.

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



UnLoad:
	bclr #0,PlaySignal
	move.w #$000f,$dff096		; Turn-off Audio DMA.
	move.w #$0780,$dff09a		; Disable Sound Interrupts.

	move.l $04,a6			; **  DELETE THESE 4
	move.l #5,d0			; LINES IF USING
	lea Data4,a1			; EXISTING VERT-BLANKING
	jsr -174(a6)			; INTERRUPT  **
	rts



DosBase:
	dc.l 0

	even

WindowHandle:
	dc.l 0
ConsolName:
	dc.b 'RAW:100/54/440/77/Demo Music',0,0
	even

message:
	dc.b 10,'		 Loading Music Created',10
	dc.b 10,"               with Microdeal's QUARTET",10
	dc.b 10,'                 <Click> to Terminate..'
	dc.b 10
endmessage:


	even
dos:
	dc.b 'dos.library',0,0
	even
Setname:
	dc.b 'DemoSet',0,0
	even
Musicname:
	dc.b 'DemoMusic',0,0
	even
PictureName:
	dc.b 'QuartetDemoPic',0,0
	even



*****     Picture Display Routines     *******

; ScreenIn first establishes whether picture is NTSC or
; PAL, it then sets up the bitplanes and display window
; accordingly.

ScreenIn:
	bsr GetFileLength	; NTSC or PAL?
	tst.l d0
	bne PokeBplns
	rts
PokeBplns:
	sub.l #64,d0
	lea $5cc28,a1	
	add.l d0,a1		; Colour list ptr in a1.
	move.l #8000,d1		; Bitplane size in d1.
	cmp.l #40000,d0
	beq NoLenChange		; NTSC pic.
	move.b #$ff,DisplayWindow+2	; Increase window for PAL.
	move.l #10240,d1	; Increase bitplane size
NoLenChange:
	lea BitPlanes+2,a3
	move.l #$5cc28,d2
	move.b #5,d3
BplLoop:
	swap d2
	move.w d2,(a3)
	addq.l #4,a3
	swap d2
	move.w d2,(a3)
	addq.l #4,a3
	add.l d1,d2
	subq.b #1,d3
	bne BplLoop

; Poke In cols
	lea ColsHere+2,a2	; CopperList ptr in A2,
	move.b #32,d0		; A1 points to cols.
PokeColsLoop:
	move.w (a1)+,(a2)	; Poke the 32 colours
	addq.l #4,a2		; into the copper list.
	subq.b #1,d0
	bne PokeColsLoop

; Relocate the copperlist in display memory.
	lea $69478,a1		; Destination in a1,
	lea CopList(PC),a2	; Source in a2.
	lea EndCopper(PC),a3
RelocateLoop:
	move.w (a2)+,(a1)+
	cmpa.l a3,a2
	blt RelocateLoop

; Now Display Our picture.
	move.l $04,a6
	move.l $90(a6),a1
	move.l (a1),a2
	move.l $0e(a2),a1
	move.l $32(a1),oldscreen
	move.l #$69478,$32(a1)
	rts


ScreenOut:
; Restore WorkBench Screen.
	move.l $04,a6
	move.l $90(a6),a1
	move.l (a1),a2
	move.l $0e(a2),a1
	move.l oldscreen,$32(a1)
wait:
	btst #5,$dff01f
	beq wait
	move.w #$8100,$dff096
	rts

oldscreen:dc.l 0


GetFileLength:			; Used to determine if file
	move.l #PictureName,d1	; is NTSC or PAL.
	bra GetLength


GetLength:			; File name ptr in d1.
	move.l d1,-(a7)		; Length returned in d0.
	bsr Dosopen
	move.l (a7)+,d1
	move.l #-2,d2
	jsr -84(a6)	; Lock()
	beq NoSuchFile
	move.l d0,Lock
	move.l d0,d1
	move.l #FileInfoBlock,d2
	jsr -102(a6)	; Examine()	
	move.l FileInfoBlock+124,d0
	move.l d0,d1
	andi.l #$ff000000,d1
	beq OkayLength
	swap d0
OkayLength:
	rts
NoSuchFile:
	moveq #0,d0
	rts

Lock:
	dc.l 0

	cnop 0,4	; Replace with 'ALIGN 4' with Seka

FileInfoBlock:
	ds.b 300	; Replace with 'BLK.B 300' with Seka


;Copperlist
CopList:
	dc.w $1001,$ff00
BitPlanes:
	dc.w $00e0,$0006
	dc.w $00e2,$0e90
	dc.w $00e4,$0006
	dc.w $00e6,$3690
	dc.w $00e8,$0006
	dc.w $00ea,$5e90
	dc.w $00ec,$0006
	dc.w $00ee,$8690
	dc.w $00f0,$0006
	dc.w $00f2,$ae90
	dc.w $0120,$0006	; Loose
	dc.w $0122,$abcd	; pointer.
	dc.w $0100,$5200
	dc.w $0102,$00ee
	dc.w $0108,$0000
	dc.w $010a,$0000
	dc.w $0092,$0033
	dc.w $0094,$00ca
	dc.w $008e,$2c7f
DisplayWindow:
	dc.w $0090,$f4bf	; $ffbf if PAL
ColsHere:
	dc.w $0180,$0000
	dc.w $0182,$0fff
	dc.w $0184,$0cde
	dc.w $0186,$0abd
	dc.w $0188,$08ab
	dc.w $018a,$078a
	dc.w $018c,$0579
	dc.w $018e,$0468
	dc.w $0190,$0257
	dc.w $0192,$0246
	dc.w $0194,$0134
	dc.w $0196,$0023
	dc.w $0198,$0012
	dc.w $019a,$00f3
	dc.w $019c,$0b88
	dc.w $019e,$0000
	dc.w $01a0,$0620
	dc.w $01a2,$0013
	dc.w $01a4,$0fff
	dc.w $01a6,$0ffe
	dc.w $01a8,$0fec
	dc.w $01aa,$0feb
	dc.w $01ac,$0fe9
	dc.w $01ae,$0fd8
	dc.w $01b0,$0fd7
	dc.w $01b2,$0fd7
	dc.w $01b4,$0f85
	dc.w $01b6,$0c64
	dc.w $01b8,$0fc1
	dc.w $01ba,$0ddd
	dc.w $01bc,$0eae
	dc.w $01be,$0fff
	dc.w $0096,$8010
	dc.w $2c01,$ff00
	dc.w $0102,$00ee
	dc.w $f501,$ff00
	dc.w $0090,$1fbf
	dc.w $ffff,$fffe
EndCopper:		


TempoVerify:
	lea TempoList,a1
	clr.l d1
TVPoke:
	move.b Tempo,d0
TVLoop:
	cmp.b (a1)+,d0
	beq OkTempo
	addq.b #1,d1
	cmpi.b #$ff,(a1)
	bne TVLoop
TVPoke2:
	move.w #$0650,Tempo
	move.b #5,d1
OkTempo:
	bsr PALorNTSC
OKPoke:
	cmpi.b #$4e,Tempo+1
	beq NTSCmusic
;PALMusic
	cmpa.l #0,a1
	bne ConvPALtoNTSC
AndPutno:
	rts

NTSCmusic:
	cmpa.l #0,a1
	bne AndPutno

ConvNTSCtoPAL:
	move.b #$50,Tempo+1	; Put 'P' in music buffer
	lea PALvals,a2
ConvPoke:
	move.b (a2,d1),Tempo
	bra AndPutno
	
		
ConvPALtoNTSC:
	move.b #$4e,Tempo+1	; Put 'N' in music buffer
	lea NTSCvals,a2
ConvPoke2:
	move.b (a2,d1),Tempo
	bra AndPutno

NTSCvals:
	dc.b 1,2,4,5,6,8,10,15,20,30,30

PALvals:
	dc.b 1,2,3,3,4,5,6,8,15,20,30

	even

PALorNTSC:
	move.l $04,a1
	cmpi.b #50,530(a1)
	bne NTSC
	lea $0,a1
NTSC:
	rts	

TempoList:
	dc.b 1,2,3,4,5,6,8,10,15,20,30,$ff

	even

WarningMessage:
	bsr Dosopen
	lea WarnConsolname(PC),a1
	move.l #1005,d0
	move.l d0,d2
	move.l a1,d1
	jsr -30(a6)
	beq ReturnDos
	lea WinHandle(PC),a1
	move.l d0,(a1)
	move.l (a1),d1

	lea Warnmessage(PC),a1
	move.l a1,d2
	lea Warnendmessage(PC),a2
	suba.l a1,a2
	move.l a2,d3
	lea DosBase(PC),a1
	move.l (a1),a6
	jsr -48(a6)
wait1:
	cmpi.b #$77,$bfec01
	bne wait1
wait2:
	cmpi.b #$77,$bfec01
	beq wait2

	lea WinHandle(PC),a1
	move.l (a1),d1
	lea DosBase(PC),a1
	move.l (a1),a6
	jsr -36(a6)		; closewindow
	bra ReturnDos

WinHandle:
	dc.l 0

WarnConsolname:
	dc.b 'RAW:100/55/430/75/MEMORY',0,0
	even

Warnmessage:
	dc.b 10,'             Required Memory Unavailable.'
	dc.b 10
	dc.b 10,'               Refer to "Demos.Readme"'
	dc.b 10
	dc.b 10,'                      <RETURN>',10,0
Warnendmessage:






	even

NTSCChecker:
	clr.b Timing
	move.l $6c,VectorStore
	bsr NewChkSum

	move.l #Int,$6c	
	move.w d1,82(a6)

	move.b #0,$bfee01	; turn off clock
	move.b #$ff,$bfe401	; Set Counter latch
	move.b #$ff,$bfe501

	bset #0,Timing	
AwaitSignal:
	tst.b Timing
	bne AwaitSignal

	move.b $bfe501,d0
	asl.w #8,d0
	add.b $bfe401,d0

	move.w #$ffff,Timing
	sub.w d0,Timing

RemoveInt:
	move.l $04,a6
	move.l VectorStore,$6c
	move.w OldChkSum,82(a6)	

	move.b #50,530(a6)
	move.w Timing,d0
	cmpi.w #$3600,d0
	blt.s NTSCSet
End:
	rts

NTSCSet:
	move.b #60,530(a6)
	rts
	

NewChkSum:
	move.l $04,a6
	move.w 82(a6),OldChkSum
	bsr EvalChk
	move.l #Int,d0
	sub.w $6c,d1
	sub.w $6e,d1
	add.w d0,d1
	swap d0
	add.w d0,d1
	not.w d1
	rts

OldChkSum:
	dc.w 0

EvalChk:
	moveq #0,d1
	lea 34(a6),a0
	move.w #$0016,d0
TheCount:
	add.w (a0)+,d1
	dbf d0,TheCount
	rts

IntStore:
	dc.w 0

	
VectorStore:
	dc.l 0

Int:
	move.w #$0020,$dff09c
	tst.b Timing
	beq NoTimer
	btst #1,Timing
	bne TimerStop
TimerStart:
	move.b #01,$bfee01	;start timer
	bset #1,Timing
NoTimer:
	rte
TimerStop:
	move.b #0,$bfee01
	clr.b Timing
	rte

Timing:
	dc.b 0,0

