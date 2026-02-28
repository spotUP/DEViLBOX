


* ************************************************************ *  
** ***            SID-MONITOR - PLAY ROUTINE              *** **  
*** ****------------------------------------------------**** *** 
*** ******************************************************** *** 
*** ****------------------------------------------------**** ***  
** ****            CREATED BY REINIER V VLIET             *** **  
* ************************************************************ *  
                                                                 




MAIN:
	bsr	init
	bsr	interon
mouzer:
	andi.b	#64,$bfe001
	bne	mouzer
	bsr	interoff
	rts

init:
	move.w	#$000f,$dff096
	lea	datas(pc),a0
	move.l	#19,d0
clear:
	clr.l	(a0)+
	dbf	d0,clear
	
	move.l	#3,d0
	lea	datas(pc),a0
	lea	audiochannel1,a1
	move.l	#$dff0a0,a3
loop1:
	move.l	(a1)+,a2
	move.l	a2,(a0)+
	move.l	(a2),a4
	move.l	a4,(a0)+
;	move.l	2(a1),a2
;	move.l	a2,(a0)+
	clr.l	(a0)+
	clr.l	(a0)+
	clr.l	(a0)+
	clr.l	(a0)+
	clr.l	(a0)+
	lea	4(a3),a3
	move.w	#$10,(a3)+
	lea	2(a3),a3
	move.w	#$40,(a3)
	lea	8(a3),a3
	dbf	d0,loop1
	move.w	#$800f,$dff096
	rts

interon:
	move.l	$6c,oldirqvec+2
	move.l	#muzakplay,$6c
	rts
interoff:
	move.l	oldirqvec+2,$6c
	move.w	#$000f,$dff096
	rts

muzakplay:
	movem.l	d0-d7/a0-a6,-(a7)
	lea	datas(pc),a0
	move.l	#$dff0a0,a1	
	lea	audiochannel1,a5
	bsr	play
	lea	datas+28,a0
	lea	$dff0b0,a1	
	lea	audiochannel2,a5
	bsr	play
	lea	datas+56,a0
	lea	$dff0c0,a1
	lea	audiochannel3,a5
	bsr	play	
	lea	datas+84,a0
	lea	$dff0d0,a1
	lea	audiochannel4,a5
	bsr	play	
	movem.l	(a7)+,d0-d7/a0-a6
oldirqvec:
	jmp	$00000000


play:
	clr.l	audpoint
	clr.l	audper

	cmp.b	#0,19(a0)
	bne	envelopehandler
	move.w	#$0fff,$dff180
	move.l	4(a0),a2
	cmp.w	#$ffff,(a2)
	bne	noendofpat
	add.l	#6,(a0)
	move.l	(a0),a4
	cmp.l	#$ffffffff,(a4)
	bne	noendofsong
	move.l	(a5),(a0)
	move.l	(a0),a4
noendofsong:
	move.l	(a4),d2
	move.l	d2,4(a0)
	move.l	d2,a2
noendofpat:
	cmp.w	#$fffe,(a2)
	bne	noinstrument
	lea	2(a2),a2
	move.l	(a2),a3
	move.l	(a3),audpoint		;wave in audiochan
	move.l	a3,8(a0)		;cur inst
	lea	4(a2),a2
	clr.b	18(a0)			;envelope timer
	clr.w	26(a0)
	clr.w	22(a0)
noinstrument:
	clr.l	d1
	move.b	(a2)+,d1		;note
	lea	frequencies,a3
	move.l	(a0),a4
	add.w	4(a4),d1	;pattern transpose!
	asl.l	#1,d1
	move.w	0(a3,d1),d2
	move.w	d2,12(a0)	;cur freq
	move.b	d1,16(a0)	;last note
	move.w	d2,audper	;audioper
	clr.b	18(a0)		;envelopetimer
	move.b	(a2)+,19(a0)	;notetimer
	clr.w	20(a0)		;envelopes
	clr.w	22(a0)		;pitchcount
	clr.w	26(a0)
	move.b	(a2)+,14(a0)	;end note for bending
	move.b	(a2)+,15(a0)	;pitch speed
	move.l	a2,4(a0)	;cur pattern
	bra	nosub
envelopehandler:
	sub.b	#1,19(a0)	;notetimer
nosub:
	move.l	8(a0),a3	;cur inst
	lea	20(a3),a3	;envelopes
	clr.w	d3
	clr.w	d2
	clr.w	d1
	move.b	18(a0),d1
	cmp.b	#0,d1
	beq	attack
	add.l	#2,a3
	cmp.b	#2,d1
	beq	decay
	add.l	#2,a3
	cmp.b	#4,d1
	beq	sustain
	add.l	#2,a3
	cmp.b	#6,d1
	beq	release
	bra	envelopegone
attack:
	move.b	(a3),d1
	move.b	1(a3),d2		
	move.b	20(a0),d3
	add.w	d1,d3
	move.w	d3,audvol
	move.b	d3,20(a0)
	cmp.w	d2,d3
	bls	envelopegone
	add.b	#2,18(a0)
	move.w	d2,audvol	;audio vol
	move.b	d2,20(a0)	;cur vol
	bra	envelopegone

decay:
	move.b	(a3),d1
	move.b	1(a3),d2		
	move.b	20(a0),d3
	sub.w	d1,d3
	move.w	d3,audvol
	move.b	d3,20(a0)
	cmp.w	d2,d3
	bls	pasaan
	cmp.w	#$ff00,d3
	bhs	pasaan
	bra	envelopegone
pasaan:
	add.b	#2,18(a0)
	move.w	d2,audvol	;audio vol
	move.b	d2,20(a0)	;cur vol
	move.b	2(a3),21(a0)	;sustain time
	bra	envelopegone

sustain:
	move.b	20(a0),d3
	move.w	d3,audvol
	sub.b	#1,21(a0)
	cmp.b	#0,21(a0)
	bne	envelopegone
	add.b	#2,18(a0)
	bra	envelopegone

release:
	move.b	(a3),d1
	move.b	1(a3),d2		
	move.b	20(a0),d3
	sub.w	d1,d3
	move.w	d3,audvol
	move.b	d3,20(a0)
	cmp.w	d2,d3
	bls	pasaan2
	cmp.w	#$ff00,d3
	bhi	pasaan2
	bra	envelopegone
pasaan2:
	add.b	#2,18(a0)
	move.w	d2,audvol	;audio vol
	move.b	d2,20(a0)	;cur vol

envelopegone:		;end of envelopehandler

	move.l	8(a0),a2
	add.b	#1,17(a0)
	and.b	#15,17(a0)
	clr.l	d1
	move.b	17(a0),d1
	lea	4(a2),a2
	add.l	d1,a2		;pointer to arpeggio
	move.b	(a2),d1
	clr.l	d2
	move.b	16(a0),d2
	asl.w	#1,d1
	add.b	d1,d2
	lea	frequencies,a2
	add.l	d2,a2
	move.w	(a2),d2
	move.w	d2,12(a0)
	move.w	d2,audper	;arpeggio ready

	clr.w	d3
	move.b	15(a0),d3	;pitchbend speed
	cmp.b	#0,d3		;no pitchbendings
	beq	audioinit
	neg.b	d3
	ext.w	d3
	clr.l	d4
	move.b	14(a0),d4
	asl.w	#1,d4
	lea	frequencies,a4
	add.l	d4,a4
	move.w	(a4),d4		;end-frequencie
	btst	#15,d3
	beq	up		;pitchdown or up?
	move.w	22(a0),d2
	add.w	d3,d2
	add.w	d2,12(a0)	;cur freq
	move.w	d2,22(a0)
	move.w	12(a0),d2
	cmp.w	d2,d4
	blo	audioinit
	move.b	14(a0),d3
	asl.b	#1,d3
	move.b	d3,16(a0)
	move.w	d4,12(a0)
	clr.w	22(a0)
	move.b	#0,15(a0)
	bra	audioinit
up:
	move.w	22(a0),d2
	add.w	d3,d2
	add.w	d2,12(a0)	;cur freq
	move.w	d2,22(a0)
	move.w	12(a0),d2
	cmp.w	d2,d4
	bhi	audioinit
	move.b	14(a0),d3
	asl.b	#1,d3
	move.b	d3,16(a0)
	move.w	d4,12(a0)
	clr.w	22(a0)
	move.b	#0,15(a0)
audioinit:	
	cmp.b	#0,24(a0)
	bne	audio2
	move.l	8(a0),a4
	move.b	29(a4),24(a0)	;phasespeed
	eor.b	#1,25(a0)	;phasing
	btst	#1,25(a0)
	beq	on
	move.b	28(a4),d1
	and.w	#$00ff,d1
	add.w	d1,12(a0)
	bra	audio3
on:
	move.b	28(a4),d1
	and.w	#$00ff,d1
	sub.w	d1,12(a0)
	bra	audio3


audio2:
	sub.b	#1,24(a0)
audio3:
	move.l	8(a0),a4
	move.w	30(a4),d4
	neg.w	d4
	add.w	d4,26(a0)
	move.w	26(a0),d4
	add.w	d4,12(a0)




	cmp.l	#0,audpoint
	beq	skip1
	move.l	audpoint,(a1)
skip1:
	cmp.l	#0,audper
	beq	skip2
	move.w	12(a0),6(a1)
skip2:
	cmp.l	#0,audvol
	beq	skip3
	move.w	audvol,d0
	asr.w	#2,d0
	move.w	d0,8(a1)
skip3:
	rts





audpoint:	dc.l	0
audper:		dc.w	0
audvol:		dc.w	0


datas:
	dc.l	0	;currentsong
	dc.l	0	;currentpattern
	dc.l	0	;currentinstrument
	dc.w	0	;curfreq
	dc.b	0	;end note
	dc.b	0	;bend speed
	dc.b	0	;last note
	dc.b	0	;arpeggiocount
	dc.b	0	;envelopecount
	dc.b	0	;notetimer
	dc.b	0	;last volumie
	dc.b	0	;sustaincount
	dc.w	0	;pitch-count
	dc.b	0	;phasetimer
	dc.b	0	;phase flipflop
	dc.w	0	;pitchfallcount
	blk.b	28*3,0



audiochannel1:
	dc.l	song1		;00000000 = no song
audiochannel2:
	dc.l	song4
audiochannel3:
	dc.l	song3
audiochannel4:
	dc.l	song2


song1:
	dc.l	pattern1	;pointer to pattern
	dc.w	0		;transpose for notes
	dc.l	pattern1
	dc.w	0
	dc.l	pattern1
	dc.w	0
	dc.l	pattern1
	dc.w	0
	dc.l	pattern1
	dc.w	0
	dc.l	pattern1
	dc.w	0
	dc.l	pattern1
	dc.w	0
	dc.l	pattern1
	dc.w	0
	dc.l	pattern1
	dc.w	0
	dc.l	$ffffffff	;afsluiting song (00000000=no repeat!)

song2:
	dc.l	patternoff
	dc.w	0
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	$ffffffff

song3:
	dc.l	patternoff
	dc.w	0
	dc.l	patternoff
	dc.w	0
	dc.l	pattern3
	dc.w	0
	dc.l	pattern3
	dc.w	3
	dc.l	pattern3
	dc.w	-2
	dc.l	pattern3
	dc.w	0
	dc.l	pattern4
	dc.w	0
	dc.l	pattern4
	dc.w	3
	dc.l	pattern4
	dc.w	-2
	dc.l	pattern4
	dc.w	0
	dc.l	pattern4
	dc.w	0
	dc.l	pattern4
	dc.w	3
	dc.l	pattern4
	dc.w	-2
	dc.l	pattern4
	dc.w	0
	dc.l	pattern4
	dc.w	0
	dc.l	pattern4
	dc.w	3
	dc.l	pattern4
	dc.w	-2
	dc.l	pattern4
	dc.w	0
	dc.l	pattern4
	dc.w	0
	dc.l	pattern4
	dc.w	3
	dc.l	pattern4
	dc.w	-2
	dc.l	pattern4
	dc.w	0
	dc.l	pattern4
	dc.w	0
	dc.l	pattern4
	dc.w	3
	dc.l	pattern4
	dc.w	-2
	dc.l	pattern4
	dc.w	0
	dc.l	pattern7
	dc.w	0
	dc.l	$ffffffff
song4:
	dc.l	patternoff
	dc.w	0
	dc.l	patternoff
	dc.w	0
	dc.l	patternoff
	dc.w	0
	dc.l	patternoff
	dc.w	0
	dc.l	pattern5
	dc.w	0
	dc.l	pattern6
	dc.w	0
	dc.l	pattern5
	dc.w	0
	dc.l	pattern6
	dc.w	0
	dc.l	patternoff
	dc.w	0
	dc.l	$ffffffff

patternoff:
	dc.w	$fffe
	dc.l	noinst
	dc.b	0,79,0,0
	dc.b	0,79,0,0
	dc.b	0,79,0,0
	dc.b	0,79,0,0
	dc.w	$ffff

pattern1:
	dc.w	$fffe		;control word for new intrument!
	dc.l	inst3		;pointer to instrument datalist
	dc.b	48,79		;note and length(notes to skip!)
	dc.b	0,0		;pitchbend to + pitchspeed(0=none)
	dc.w	$fffe
	dc.l	inst4
	dc.b	51,79
	dc.b	0,0
	dc.b	46,79
	dc.b	0,0
	dc.w	$fffe
	dc.l	inst3
	dc.b	48,79
	dc.b	0,0
	dc.w	$ffff		;afsluiting pattern

pattern2:
	dc.w	$fffe
	dc.l	inst1
	dc.b	48,19
	dc.b	0,0
	dc.b	48,19
	dc.b	0,0
	dc.b	48,19
	dc.b	0,0
	dc.b	48,4
	dc.b	0,0
	dc.b	48,4
	dc.b	0,0
	dc.b	48,4
	dc.b	0,0
	dc.b	48,4
	dc.b	0,0
	dc.w	$ffff


pattern3:
	dc.w	$fffe
	dc.l	inst5
	dc.b	36,39,0,0
	dc.b	36,39,0,0
	dc.w	$ffff

pattern4:
	dc.w	$fffe
	dc.l	inst5
	dc.b	36,9,0,0
	dc.b	48,9,0,0
	dc.b	36,9,0,0
	dc.b	48,9,0,0
	dc.b	36,9,0,0
	dc.b	48,9,0,0
	dc.b	36,9,0,0
	dc.b	48,9,0,0
	dc.w	$ffff
pattern5:
	dc.w	$fffe
	dc.l	inst7
	dc.b	36,79,51,6
	dc.w	$fffe
	dc.l	inst6
	dc.b	51,79,0,0
	dc.b	46,79,0,0
	dc.b	48,09,0,0
	dc.b	46,09,0,0
	dc.b	43,59,0,0
	dc.w	$ffff

pattern6:
	dc.w	$fffe
	dc.l	inst7
	dc.b	36,79,51,6
	dc.w	$fffe
	dc.l	inst6
	dc.b	51,79,0,0
	dc.b	53,79,0,0
	dc.b	55,09,0,0
	dc.b	58,09,0,0
	dc.b	60,59,0,0
	dc.w	$ffff

pattern7:
	dc.w	$fffe
	dc.l	inst2
	dc.b	48,79,0,0
	dc.w	$fffe
	dc.l	inst2b
	dc.b	51,79,0,0
	dc.b	46,79,0,0
	dc.w	$fffe
	dc.l	inst2
	dc.b	48,79,36,-10
	dc.w	$ffff


;DATA LIST FOR FIRST INSTRUMENT

noinst:
	dc.l	empty		;pointer to waveform

	dc.l	$00000000,$00000000
	dc.l	$00000000,$00000000 ;current arpeggio
	
	dc.b	0,0,0,0,0,0,0,0	;A-D-S-R

	dc.b	0		;phase
	dc.b	0		;phasespeed (0=fast $ff=slow)
	dc.w	0		;pitchfall

inst1:
	dc.l	waveform1		;pointer to waveform

	dc.l	$00000000,$00000000
	dc.l	$00000000,$00000000 ;current arpeggio
	
	dc.b	200,200,10,0,0,0,0,0	;A-D-S-R

	dc.b	0		;phase
	dc.b	0		;phasespeed (0=fast $ff=slow)
	dc.w	-80		;pitchfall

inst2:
	dc.l	waveform2		;pointer to waveform

	dc.l	$0003070c,$0c070300
	dc.l	$0003070c,$0c070300 ;current arpeggio
	
	dc.b	10,255,5,128,6,0,2,0	;A-D-S-R

	dc.b	0		;phase
	dc.b	0		;phasespeed (0=fast $ff=slow)
	dc.w	0		;pitchfall

inst2b:
	dc.l	waveform2		;pointer to waveform

	dc.l	$0004070c,$0c070400
	dc.l	$0004070c,$0c070400 ;current arpeggio
	
	dc.b	10,255,5,128,6,0,2,0	;A-D-S-R

	dc.b	0		;phase
	dc.b	0		;phasespeed (0=fast $ff=slow)
	dc.w	0		;pitchfall


inst3:
	dc.l	waveform1		;pointer to waveform

	dc.l	$0003070c,$0003070c
	dc.l	$0003070c,$0003070c ;current arpeggio
	
	dc.b	180,180,0,0,8,0,2,0	;A-D-S-R

	dc.b	0		;phase
	dc.b	0		;phasespeed (0=fast $ff=slow)
	dc.w	0		;pitchfall

inst4:
	dc.l	waveform1		;pointer to waveform

	dc.l	$0004070c,$0004070c
	dc.l	$0004070c,$0004070c ;current arpeggio
	
	dc.b	180,180,0,0,8,0,2,0	;A-D-S-R

	dc.b	0		;phase
	dc.b	0		;phasespeed (0=fast $ff=slow)
	dc.w	0		;pitchfall


inst5:
	dc.l	waveform4		;pointer to waveform

	dc.l	$00000000,$00000000
	dc.l	$00000000,$00000000 ;current arpeggio
	
	dc.b	255,255,3,200,8,0,10,0	;A-D-S-R

	dc.b	0		;phase
	dc.b	0		;phasespeed (0=fast $ff=slow)
	dc.w	0		;pitchfall

inst6:
	dc.l	waveform5		;pointer to waveform

	dc.l	$00000000,$00000000
	dc.l	$00000000,$00000000 ;current arpeggio
	
	dc.b	255,255,2,200,8,0,4,0	;A-D-S-R

	dc.b	2		;phase
	dc.b	2		;phasespeed (0=fast $ff=slow)
	dc.w	0		;pitchfall

inst7:
	dc.l	waveform5		;pointer to waveform

	dc.l	$00000000,$00000000
	dc.l	$00000000,$00000000 ;current arpeggio
	
	dc.b	255,255,0,0,0,0,0,0	;A-D-S-R

	dc.b	2		;phase
	dc.b	2		;phasespeed (0=fast $ff=slow)
	dc.w	0		;pitchfall


empty:	blk.b	32,0

waveform1:
	blk.b	16,127
	blk.b	16,-128

waveform2:
dc.b 127,127,127,127,127,127,127,127,-128,-128  
dc.b -128,127,127,-128,-128,-128,127,127,127,127,127
dc.b 127,127,127,127,127,127,127,127,127,127,127

waveform3:
dc.b 127,127,127,127,127,127,127,127,-128,-128  
dc.b -128,127,127,-128,-128,-128,127,127,127,127,127
dc.b 127,127,127,127,127,127,127,127,127,127,127

waveform4:
dc.b -128,-120,-112,-104,-96,-88,-80,-72,-64,-56  
dc.b -48,-40,-32,-24,-16,-8,0,8,16,24,32
dc.b 40,48,56,64,72,80,88,96,104,112,127

waveform5:
dc.b -128,-128,-128,-128,-128,-128,-128,-128,127,127  
dc.b 127,127,127,127,127,127,-128,-98,-68,-38,-8,28
dc.b 58,78,98,118,120,122,124,125,126,127





frequencies:
dc.w 6848,6464,6096,5760,5424,5120,4832,4560,4304,4064,3840,3616;oct1
dc.w 3424,3232,3048,2880,2712,2560,2416,2280,2152,2032,1920,1808;oct2
dc.w 1712,1616,1524,1440,1356,1280,1208,1140,1076,1016,0960,0904;oct3
dc.w 0856,0808,0762,0720,0678,0640,0604,0570,0538,0508,0480,0452;oct4
dc.w 0428,0404,0381,0360,0339,0320,0302,0285,0269,0254,0240,0226;oct5
dc.w 0214,0202,0190,0180,0170,0160,0151,0143,0135,0127		;oct6

;    c    c#   d    d#   e    f    f#   g    g#   a    a#   b

blk.l	18,0

buffer:
blk.l	20,0



* ************************************************************ *  
** ***            SID-MONITOR - PLAY ROUTINE              *** **  
*** ****------------------------------------------------**** *** 
*** ******************************************************** *** 
*** ****------------------------------------------------**** ***  
** ****            CREATED BY REINIER V VLIET             *** **  
* ************************************************************ *  
                                                                 




MAIN:
	bsr	init
	bsr	interon
mouzer:
	andi.b	#64,$bfe001
	bne	mouzer
	bsr	interoff
	rts

init:
	move.w	#$000f,$dff096
	lea	datas(pc),a0
	move.l	#19,d0
clear:
	clr.l	(a0)+
	dbf	d0,clear
	
	move.l	#3,d0
	lea	datas(pc),a0
	lea	audiochannel1,a1
	move.l	#$dff0a0,a3
loop1:
	move.l	(a1)+,a2
	move.l	a2,(a0)+
	move.l	(a2),a4
	move.l	a4,(a0)+
;	move.l	2(a1),a2
;	move.l	a2,(a0)+
	clr.l	(a0)+
	clr.l	(a0)+
	clr.l	(a0)+
	clr.l	(a0)+
	clr.l	(a0)+
	lea	4(a3),a3
	move.w	#$10,(a3)+
	lea	2(a3),a3
	move.w	#$40,(a3)
	lea	8(a3),a3
	dbf	d0,loop1
	move.w	#$800f,$dff096
	rts

interon:
	move.l	$6c,oldirqvec+2
	move.l	#muzakplay,$6c
	rts
interoff:
	move.l	oldirqvec+2,$6c
	move.w	#$000f,$dff096
	rts

muzakplay:
	movem.l	d0-d7/a0-a6,-(a7)
	lea	datas(pc),a0
	move.l	#$dff0a0,a1	
	lea	audiochannel1,a5
	bsr	play
	lea	datas+28,a0
	lea	$dff0b0,a1	
	lea	audiochannel2,a5
	bsr	play
	lea	datas+56,a0
	lea	$dff0c0,a1
	lea	audiochannel3,a5
	bsr	play	
	lea	datas+84,a0
	lea	$dff0d0,a1
	lea	audiochannel4,a5
	bsr	play	
	movem.l	(a7)+,d0-d7/a0-a6
oldirqvec:
	jmp	$00000000


play:
	clr.l	audpoint
	clr.l	audper

	cmp.b	#0,19(a0)
	bne	envelopehandler
	move.w	#$0fff,$dff180
	move.l	4(a0),a2
	cmp.w	#$ffff,(a2)
	bne	noendofpat
	add.l	#6,(a0)
	move.l	(a0),a4
	cmp.l	#$ffffffff,(a4)
	bne	noendofsong
	move.l	(a5),(a0)
	move.l	(a0),a4
noendofsong:
	move.l	(a4),d2
	move.l	d2,4(a0)
	move.l	d2,a2
noendofpat:
	cmp.w	#$fffe,(a2)
	bne	noinstrument
	lea	2(a2),a2
	move.l	(a2),a3
	move.l	(a3),audpoint		;wave in audiochan
	move.l	a3,8(a0)		;cur inst
	lea	4(a2),a2
	clr.b	18(a0)			;envelope timer
	clr.w	26(a0)
	clr.w	22(a0)
noinstrument:
	clr.l	d1
	move.b	(a2)+,d1		;note
	lea	frequencies,a3
	move.l	(a0),a4
	add.w	4(a4),d1	;pattern transpose!
	asl.l	#1,d1
	move.w	0(a3,d1),d2
	move.w	d2,12(a0)	;cur freq
	move.b	d1,16(a0)	;last note
	move.w	d2,audper	;audioper
	clr.b	18(a0)		;envelopetimer
	move.b	(a2)+,19(a0)	;notetimer
	clr.w	20(a0)		;envelopes
	clr.w	22(a0)		;pitchcount
	clr.w	26(a0)
	move.b	(a2)+,14(a0)	;end note for bending
	move.b	(a2)+,15(a0)	;pitch speed
	move.l	a2,4(a0)	;cur pattern
	bra	nosub
envelopehandler:
	sub.b	#1,19(a0)	;notetimer
nosub:
	move.l	8(a0),a3	;cur inst
	lea	20(a3),a3	;envelopes
	clr.w	d3
	clr.w	d2
	clr.w	d1
	move.b	18(a0),d1
	cmp.b	#0,d1
	beq	attack
	add.l	#2,a3
	cmp.b	#2,d1
	beq	decay
	add.l	#2,a3
	cmp.b	#4,d1
	beq	sustain
	add.l	#2,a3
	cmp.b	#6,d1
	beq	release
	bra	envelopegone
attack:
	move.b	(a3),d1
	move.b	1(a3),d2		
	move.b	20(a0),d3
	add.w	d1,d3
	move.w	d3,audvol
	move.b	d3,20(a0)
	cmp.w	d2,d3
	bls	envelopegone
	add.b	#2,18(a0)
	move.w	d2,audvol	;audio vol
	move.b	d2,20(a0)	;cur vol
	bra	envelopegone

decay:
	move.b	(a3),d1
	move.b	1(a3),d2		
	move.b	20(a0),d3
	sub.w	d1,d3
	move.w	d3,audvol
	move.b	d3,20(a0)
	cmp.w	d2,d3
	bls	pasaan
	cmp.w	#$ff00,d3
	bhs	pasaan
	bra	envelopegone
pasaan:
	add.b	#2,18(a0)
	move.w	d2,audvol	;audio vol
	move.b	d2,20(a0)	;cur vol
	move.b	2(a3),21(a0)	;sustain time
	bra	envelopegone

sustain:
	move.b	20(a0),d3
	move.w	d3,audvol
	sub.b	#1,21(a0)
	cmp.b	#0,21(a0)
	bne	envelopegone
	add.b	#2,18(a0)
	bra	envelopegone

release:
	move.b	(a3),d1
	move.b	1(a3),d2		
	move.b	20(a0),d3
	sub.w	d1,d3
	move.w	d3,audvol
	move.b	d3,20(a0)
	cmp.w	d2,d3
	bls	pasaan2
	cmp.w	#$ff00,d3
	bhi	pasaan2
	bra	envelopegone
pasaan2:
	add.b	#2,18(a0)
	move.w	d2,audvol	;audio vol
	move.b	d2,20(a0)	;cur vol

envelopegone:		;end of envelopehandler

	move.l	8(a0),a2
	add.b	#1,17(a0)
	and.b	#15,17(a0)
	clr.l	d1
	move.b	17(a0),d1
	lea	4(a2),a2
	add.l	d1,a2		;pointer to arpeggio
	move.b	(a2),d1
	clr.l	d2
	move.b	16(a0),d2
	asl.w	#1,d1
	add.b	d1,d2
	lea	frequencies,a2
	add.l	d2,a2
	move.w	(a2),d2
	move.w	d2,12(a0)
	move.w	d2,audper	;arpeggio ready

	clr.w	d3
	move.b	15(a0),d3	;pitchbend speed
	cmp.b	#0,d3		;no pitchbendings
	beq	audioinit
	neg.b	d3
	ext.w	d3
	clr.l	d4
	move.b	14(a0),d4
	asl.w	#1,d4
	lea	frequencies,a4
	add.l	d4,a4
	move.w	(a4),d4		;end-frequencie
	btst	#15,d3
	beq	up		;pitchdown or up?
	move.w	22(a0),d2
	add.w	d3,d2
	add.w	d2,12(a0)	;cur freq
	move.w	d2,22(a0)
	move.w	12(a0),d2
	cmp.w	d2,d4
	blo	audioinit
	move.b	14(a0),d3
	asl.b	#1,d3
	move.b	d3,16(a0)
	move.w	d4,12(a0)
	clr.w	22(a0)
	move.b	#0,15(a0)
	bra	audioinit
up:
	move.w	22(a0),d2
	add.w	d3,d2
	add.w	d2,12(a0)	;cur freq
	move.w	d2,22(a0)
	move.w	12(a0),d2
	cmp.w	d2,d4
	bhi	audioinit
	move.b	14(a0),d3
	asl.b	#1,d3
	move.b	d3,16(a0)
	move.w	d4,12(a0)
	clr.w	22(a0)
	move.b	#0,15(a0)
audioinit:	
	cmp.b	#0,24(a0)
	bne	audio2
	move.l	8(a0),a4
	move.b	29(a4),24(a0)	;phasespeed
	eor.b	#1,25(a0)	;phasing
	btst	#1,25(a0)
	beq	on
	move.b	28(a4),d1
	and.w	#$00ff,d1
	add.w	d1,12(a0)
	bra	audio3
on:
	move.b	28(a4),d1
	and.w	#$00ff,d1
	sub.w	d1,12(a0)
	bra	audio3


audio2:
	sub.b	#1,24(a0)
audio3:
	move.l	8(a0),a4
	move.w	30(a4),d4
	neg.w	d4
	add.w	d4,26(a0)
	move.w	26(a0),d4
	add.w	d4,12(a0)




	cmp.l	#0,audpoint
	beq	skip1
	move.l	audpoint,(a1)
skip1:
	cmp.l	#0,audper
	beq	skip2
	move.w	12(a0),6(a1)
skip2:
	cmp.l	#0,audvol
	beq	skip3
	move.w	audvol,d0
	asr.w	#2,d0
	move.w	d0,8(a1)
skip3:
	rts





audpoint:	dc.l	0
audper:		dc.w	0
audvol:		dc.w	0


datas:
	dc.l	0	;currentsong
	dc.l	0	;currentpattern
	dc.l	0	;currentinstrument
	dc.w	0	;curfreq
	dc.b	0	;end note
	dc.b	0	;bend speed
	dc.b	0	;last note
	dc.b	0	;arpeggiocount
	dc.b	0	;envelopecount
	dc.b	0	;notetimer
	dc.b	0	;last volumie
	dc.b	0	;sustaincount
	dc.w	0	;pitch-count
	dc.b	0	;phasetimer
	dc.b	0	;phase flipflop
	dc.w	0	;pitchfallcount
	blk.b	28*3,0



audiochannel1:
	dc.l	song1		;00000000 = no song
audiochannel2:
	dc.l	song4
audiochannel3:
	dc.l	song3
audiochannel4:
	dc.l	song2


song1:
	dc.l	pattern1	;pointer to pattern
	dc.w	0		;transpose for notes
	dc.l	pattern1
	dc.w	0
	dc.l	pattern1
	dc.w	0
	dc.l	pattern1
	dc.w	0
	dc.l	pattern1
	dc.w	0
	dc.l	pattern1
	dc.w	0
	dc.l	pattern1
	dc.w	0
	dc.l	pattern1
	dc.w	0
	dc.l	pattern1
	dc.w	0
	dc.l	$ffffffff	;afsluiting song (00000000=no repeat!)

song2:
	dc.l	patternoff
	dc.w	0
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	pattern2
	dc.w	0	
	dc.l	$ffffffff

song3:
	dc.l	patternoff
	dc.w	0
	dc.l	patternoff
	dc.w	0
	dc.l	pattern3
	dc.w	0
	dc.l	pattern3
	dc.w	3
	dc.l	pattern3
	dc.w	-2
	dc.l	pattern3
	dc.w	0
	dc.l	pattern4
	dc.w	0
	dc.l	pattern4
	dc.w	3
	dc.l	pattern4
	dc.w	-2
	dc.l	pattern4
	dc.w	0
	dc.l	pattern4
	dc.w	0
	dc.l	pattern4
	dc.w	3
	dc.l	pattern4
	dc.w	-2
	dc.l	pattern4
	dc.w	0
	dc.l	pattern4
	dc.w	0
	dc.l	pattern4
	dc.w	3
	dc.l	pattern4
	dc.w	-2
	dc.l	pattern4
	dc.w	0
	dc.l	pattern4
	dc.w	0
	dc.l	pattern4
	dc.w	3
	dc.l	pattern4
	dc.w	-2
	dc.l	pattern4
	dc.w	0
	dc.l	pattern4
	dc.w	0
	dc.l	pattern4
	dc.w	3
	dc.l	pattern4
	dc.w	-2
	dc.l	pattern4
	dc.w	0
	dc.l	pattern7
	dc.w	0
	dc.l	$ffffffff
song4:
	dc.l	patternoff
	dc.w	0
	dc.l	patternoff
	dc.w	0
	dc.l	patternoff
	dc.w	0
	dc.l	patternoff
	dc.w	0
	dc.l	pattern5
	dc.w	0
	dc.l	pattern6
	dc.w	0
	dc.l	pattern5
	dc.w	0
	dc.l	pattern6
	dc.w	0
	dc.l	patternoff
	dc.w	0
	dc.l	$ffffffff

patternoff:
	dc.w	$fffe
	dc.l	noinst
	dc.b	0,79,0,0
	dc.b	0,79,0,0
	dc.b	0,79,0,0
	dc.b	0,79,0,0
	dc.w	$ffff

pattern1:
	dc.w	$fffe		;control word for new intrument!
	dc.l	inst3		;pointer to instrument datalist
	dc.b	48,79		;note and length(notes to skip!)
	dc.b	0,0		;pitchbend to + pitchspeed(0=none)
	dc.w	$fffe
	dc.l	inst4
	dc.b	51,79
	dc.b	0,0
	dc.b	46,79
	dc.b	0,0
	dc.w	$fffe
	dc.l	inst3
	dc.b	48,79
	dc.b	0,0
	dc.w	$ffff		;afsluiting pattern

pattern2:
	dc.w	$fffe
	dc.l	inst1
	dc.b	48,19
	dc.b	0,0
	dc.b	48,19
	dc.b	0,0
	dc.b	48,19
	dc.b	0,0
	dc.b	48,4
	dc.b	0,0
	dc.b	48,4
	dc.b	0,0
	dc.b	48,4
	dc.b	0,0
	dc.b	48,4
	dc.b	0,0
	dc.w	$ffff


pattern3:
	dc.w	$fffe
	dc.l	inst5
	dc.b	36,39,0,0
	dc.b	36,39,0,0
	dc.w	$ffff

pattern4:
	dc.w	$fffe
	dc.l	inst5
	dc.b	36,9,0,0
	dc.b	48,9,0,0
	dc.b	36,9,0,0
	dc.b	48,9,0,0
	dc.b	36,9,0,0
	dc.b	48,9,0,0
	dc.b	36,9,0,0
	dc.b	48,9,0,0
	dc.w	$ffff
pattern5:
	dc.w	$fffe
	dc.l	inst7
	dc.b	36,79,51,6
	dc.w	$fffe
	dc.l	inst6
	dc.b	51,79,0,0
	dc.b	46,79,0,0
	dc.b	48,09,0,0
	dc.b	46,09,0,0
	dc.b	43,59,0,0
	dc.w	$ffff

pattern6:
	dc.w	$fffe
	dc.l	inst7
	dc.b	36,79,51,6
	dc.w	$fffe
	dc.l	inst6
	dc.b	51,79,0,0
	dc.b	53,79,0,0
	dc.b	55,09,0,0
	dc.b	58,09,0,0
	dc.b	60,59,0,0
	dc.w	$ffff

pattern7:
	dc.w	$fffe
	dc.l	inst2
	dc.b	48,79,0,0
	dc.w	$fffe
	dc.l	inst2b
	dc.b	51,79,0,0
	dc.b	46,79,0,0
	dc.w	$fffe
	dc.l	inst2
	dc.b	48,79,36,-10
	dc.w	$ffff


;DATA LIST FOR FIRST INSTRUMENT

noinst:
	dc.l	empty		;pointer to waveform

	dc.l	$00000000,$00000000
	dc.l	$00000000,$00000000 ;current arpeggio
	
	dc.b	0,0,0,0,0,0,0,0	;A-D-S-R

	dc.b	0		;phase
	dc.b	0		;phasespeed (0=fast $ff=slow)
	dc.w	0		;pitchfall

inst1:
	dc.l	waveform1		;pointer to waveform

	dc.l	$00000000,$00000000
	dc.l	$00000000,$00000000 ;current arpeggio
	
	dc.b	200,200,10,0,0,0,0,0	;A-D-S-R

	dc.b	0		;phase
	dc.b	0		;phasespeed (0=fast $ff=slow)
	dc.w	-80		;pitchfall

inst2:
	dc.l	waveform2		;pointer to waveform

	dc.l	$0003070c,$0c070300
	dc.l	$0003070c,$0c070300 ;current arpeggio
	
	dc.b	10,255,5,128,6,0,2,0	;A-D-S-R

	dc.b	0		;phase
	dc.b	0		;phasespeed (0=fast $ff=slow)
	dc.w	0		;pitchfall

inst2b:
	dc.l	waveform2		;pointer to waveform

	dc.l	$0004070c,$0c070400
	dc.l	$0004070c,$0c070400 ;current arpeggio
	
	dc.b	10,255,5,128,6,0,2,0	;A-D-S-R

	dc.b	0		;phase
	dc.b	0		;phasespeed (0=fast $ff=slow)
	dc.w	0		;pitchfall


inst3:
	dc.l	waveform1		;pointer to waveform

	dc.l	$0003070c,$0003070c
	dc.l	$0003070c,$0003070c ;current arpeggio
	
	dc.b	180,180,0,0,8,0,2,0	;A-D-S-R

	dc.b	0		;phase
	dc.b	0		;phasespeed (0=fast $ff=slow)
	dc.w	0		;pitchfall

inst4:
	dc.l	waveform1		;pointer to waveform

	dc.l	$0004070c,$0004070c
	dc.l	$0004070c,$0004070c ;current arpeggio
	
	dc.b	180,180,0,0,8,0,2,0	;A-D-S-R

	dc.b	0		;phase
	dc.b	0		;phasespeed (0=fast $ff=slow)
	dc.w	0		;pitchfall


inst5:
	dc.l	waveform4		;pointer to waveform

	dc.l	$00000000,$00000000
	dc.l	$00000000,$00000000 ;current arpeggio
	
	dc.b	255,255,3,200,8,0,10,0	;A-D-S-R

	dc.b	0		;phase
	dc.b	0		;phasespeed (0=fast $ff=slow)
	dc.w	0		;pitchfall

inst6:
	dc.l	waveform5		;pointer to waveform

	dc.l	$00000000,$00000000
	dc.l	$00000000,$00000000 ;current arpeggio
	
	dc.b	255,255,2,200,8,0,4,0	;A-D-S-R

	dc.b	2		;phase
	dc.b	2		;phasespeed (0=fast $ff=slow)
	dc.w	0		;pitchfall

inst7:
	dc.l	waveform5		;pointer to waveform

	dc.l	$00000000,$00000000
	dc.l	$00000000,$00000000 ;current arpeggio
	
	dc.b	255,255,0,0,0,0,0,0	;A-D-S-R

	dc.b	2		;phase
	dc.b	2		;phasespeed (0=fast $ff=slow)
	dc.w	0		;pitchfall


empty:	blk.b	32,0

waveform1:
	blk.b	16,127
	blk.b	16,-128

waveform2:
dc.b 127,127,127,127,127,127,127,127,-128,-128  
dc.b -128,127,127,-128,-128,-128,127,127,127,127,127
dc.b 127,127,127,127,127,127,127,127,127,127,127

waveform3:
dc.b 127,127,127,127,127,127,127,127,-128,-128  
dc.b -128,127,127,-128,-128,-128,127,127,127,127,127
dc.b 127,127,127,127,127,127,127,127,127,127,127

waveform4:
dc.b -128,-120,-112,-104,-96,-88,-80,-72,-64,-56  
dc.b -48,-40,-32,-24,-16,-8,0,8,16,24,32
dc.b 40,48,56,64,72,80,88,96,104,112,127

waveform5:
dc.b -128,-128,-128,-128,-128,-128,-128,-128,127,127  
dc.b 127,127,127,127,127,127,-128,-98,-68,-38,-8,28
dc.b 58,78,98,118,120,122,124,125,126,127





frequencies:
dc.w 6848,6464,6096,5760,5424,5120,4832,4560,4304,4064,3840,3616;oct1
dc.w 3424,3232,3048,2880,2712,2560,2416,2280,2152,2032,1920,1808;oct2
dc.w 1712,1616,1524,1440,1356,1280,1208,1140,1076,1016,0960,0904;oct3
dc.w 0856,0808,0762,0720,0678,0640,0604,0570,0538,0508,0480,0452;oct4
dc.w 0428,0404,0381,0360,0339,0320,0302,0285,0269,0254,0240,0226;oct5
dc.w 0214,0202,0190,0180,0170,0160,0151,0143,0135,0127		;oct6

;    c    c#   d    d#   e    f    f#   g    g#   a    a#   b

blk.l	18,0

buffer:
blk.l	20,0
