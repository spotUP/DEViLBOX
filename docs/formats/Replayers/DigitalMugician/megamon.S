;---------------------------------------------------------------------

**********************************************************************
************* THE AUTHENTIC MEGAMON BASED ON SIDMON V2.1 *************
**********************************************************************


;MEGAMON IS A TRADEMARK OF SOFTEYES INC.

;MEGAMON IS FOR INTERNAL USE ONLY.

;MEGAMON IS DEDICATED TO OUR TOP-MUSIC-PROFESSIONAL : RAMON

;---------------------------------------------------------------------

org	$30000
load	$30000

main:
movem.l	d0-d7/a0-a6,-(a7)
bsr	muzaxon

wait:

btst	#6,$bfe001
bne	wait
bsr	muzaxoff
movem.l	(a7)+,d0-d7/a0-a6
rts



muzaxon:
	moveq	#3,d7
	lea	datach1,a0
	lea	datach1,a1
initizer:
	move.w	songnr,d0
	move.w	d0,(a0)+
	clr.w	(a0)+
	clr.w	(a0)+
	clr.w	(a0)+
	clr.w	(a0)+
	clr.w	(a0)+
	clr.w	(a0)+	;eff. bits
	clr.w	(a0)+
	clr.w	(a0)+
	clr.w	(a0)+	;zet ch. weer aan flg.
	clr.w	(a0)+
	clr.w	(a0)+
	clr.w	(a0)+
	clr.w	(a0)+
	clr.w	(a0)+
	lea	40(a1),a1
	lea	(a1),a0
	dbf	d7,initizer


	moveq	#0,d0
	moveq	#0,d1
	move.w	songnr,d0
	asl.w	#2,d0
	lea	songdata2,a0
	lea	(a0,d0),a0
	move.b	3(a0),d1
	move.w	d1,songlength
	move.b	2(a0),d1
	move.w	d1,songspd
	move.w	d1,songdelay

	move.w	#1,newpatflg
	move.w	#1,newnoteflg

	lea	player(pc),a0
	lea	hasan(pc),a1
	move.l	$6c,2(a1)
	move.l	a0,$6c
	move.w	#$000f,$dff096
	rts

muzaxoff:
	lea	hasan(pc),a1
	move.l	2(a1),$6c
	move.w	#$000f,$dff096
	rts

player:
	cmp.b	#$60,$dff006
	bne	player
	move.w	#$0f0f,$dff180

	movem.l	d0-d7/a0-a6,-(a7)

	bsr	samplereinit
***
	lea	playerdat,a1		;very impo(r)tent
***
	lea	$dff0a0,a6
	lea	datach1,a5
	move.w	#$0001,10(a1)		;dma
	moveq	#0,d6		;add up with songdata
	bsr	playit
	lea	16(a6),a6
	lea	40(a5),a5
	moveq	#2,d6		;add up with songdata
	move.w	d6,10(a1)		;dma
	bsr	playit
	lea	16(a6),a6
	lea	40(a5),a5
	moveq	#4,d6		;add up with songdata
	move.w	d6,10(a1)
	bsr	playit
	lea	16(a6),a6
	lea	40(a5),a5
	move.w	#$0008,10(a1)
	moveq	#6,d6		;add up with songdata
	bsr	playit

***

	lea	-$30(a6),a6		;$dff0a0
	lea	-120(a5),a5		;datach1
	bsr	playit2
	lea	16(a6),a6
	lea	40(a5),a5
	bsr	playit2
	lea	16(a6),a6
	lea	40(a5),a5
	bsr	playit2
	lea	16(a6),a6
	lea	40(a5),a5
	bsr	playit2

***
***
	clr.l	2(a1)			;npatflag
	sub.w	#1,(a1)			;songdelay
	bne	interweg
	move.w	14(a1),(a1)
	move.w	#1,4(a1)
	add.w	#1,8(a1)
	move.w	18(a1),d5
	cmp.w	8(a1),d5	;cmp.w	patcnt,d5
	bne	interweg
	clr.w	8(a1)
	move.w	#1,2(a1)
	add.w	#1,6(a1)
	move.w	16(a1),d5
	cmp.w	6(a1),d5
	bne	interweg

	lea	songdata2,a0
	moveq	#0,d0
	move.w	12(a1),d0
	asl.w	#2,d0	
;	lea	(a0,d0),a0
	tst.b	(a0,d0)		;loopflg
	beq	afnokke
	move.b	1(a0,d0),7(a1)	;songcnt+1
	clr.b	6(a1)
	bra	interweg
afnokke:
	move.w	#$0fff,$dff180
	bsr	muzaxoff
interweg:
	move.w	#$800f,$dff096
	movem.l	(a7)+,d0-d7/a0-a6
	clr.w	$dff180
hasan:	jmp	$00000000

playit:
	moveq	#0,d0
	tst.w	2(a1)
	beq	notnewpat
	lea	songdata,a0
	move.w	(a5),d0
	ror.w	#6,d0
	lea	(a0,d0),a0
	move.w	6(a1),d0
	asl.w	#3,d0
;	lea	(a0,d0),a0
	add.w	d0,d6
	move.b	(a0,d6),3(a5)	;cur. patnr
	move.b	1(a0,d6),9(a5)	;cur. trspose
notnewpat:
	tst.w	4(a1)
	beq	insthandle
	lea	patdata,a0
	move.w	2(a5),d0
	asl.w	#8,d0
	lea	(a0,d0),a0
	move.w	8(a1),d0
	asl.w	#2,d0
	tst.b	(a0,d0)
	beq	insthandle

;GROOTTE INIT
	lea	(a0,d0),a0
	move.b	(a0),7(a5)	;last note played
	move.b	1(a0),5(a5)	;cur.instnr.
	and.b	#63,5(a5)
	move.b	1(a0),15(a5)	;cur effect
	and.b	#192,15(a5)
	move.b	2(a0),11(a5)	;endnote
	move.b	3(a0),13(a5)	;pitch.spd
	
	lea	instdata,a4
	move.w	4(a5),d0	;cur.instnr.
	asl.w	#3,d0		;ver. met 8 !	
	lea	(a4,d0),a4
	moveq	#0,d1
	lea	wavedata,a3
	move.b	(a4),d1		;cur wavef.
	cmp.b	#32,d1		;sample of waveform??
	bhs	sampletjen
	asl.w	#7,d1		;128 bytes per wavef.
	lea	(a3,d1),a3
	move.l	a3,(a6)		;ch1.waveform
	moveq	#0,d1
	move.b	1(a4),d1	;wavelength
	move.w	d1,4(a6)	;ch1.length
	move.w	10(a1),$dff096	;ch.uit
sampletrug:
	clr.w	22(a5)		;volumecnt
	move.b	3(a4),25(a5)	;volspd.
	move.b	7(a4),29(a5)	;phasedelay
	clr.w	30(a5)		;phasecnt
	clr.w	26(a5)		;arpcnt
	move.b	8(a4),19(a5)	;f.tune
insthandle:
	rts

playit2:moveq	#0,d0
	lea	instdata,a4
	move.w	4(a5),d0	;cur.instnr.
	asl.w	#3,d0		;ver. met 8 !	
	lea	(a4,d0),a4

;eerst volume updaten

	tst.w	24(a5)
	beq	geenvolmeer	;volume changing stoppen?
	sub.w	#1,24(a5)	;vol.spd.
;	tst.w	24(a5)		;volume al veranderen?
	bne	geenvolmeer
	move.b	3(a4),25(a5)	;vol.spd
	add.w	#1,22(a5)	;vol.cnt
	and.w	#$7f,22(a5)
;	tst.w	22(a5)		
	bne	okgagang
	btst	#1,6(a4)	;vol loopen??
	bne	okgagang
	clr.w	24(a5)		;stop volume
	bra	geenvolmeer
okgagang:
	move.w	22(a5),d0	;vol.cnt
	moveq	#0,d1
	lea	wavedata,a3
	move.b	2(a4),d1	;vol.wave
	asl.w	#7,d1
;	lea	(a3,d1),a3	;goed wavef.
;	lea	(a3,d0),a3	;+vol.cnt
	add.w	d0,d1
	lea	(a3,d1),a3
	moveq	#0,d1
	move.b	(a3),d1		;vol.
	move.w	d1,8(a6)	;ch1.vol

geenvolmeer:

;nu de freq.handler

	lea	frequencies,a2
	moveq	#0,d0
	moveq	#0,d1
	move.w	6(a5),d1	;lastnotenr
	btst	#0,6(a4)	;arp.aan?
	beq	noarp

	lea	arpdata,a3
	move.b	4(a4),d0	;arp.point
	asl.w	#5,d0
	lea	(a3,d0),a3
	move.w	26(a5),d0	;arpcnt

	add.b	(a3,d0),d1	;notenr	ophogen met arpwaarde!
	add.w	#1,26(a5)
	and.w	#31,26(a5)
noarp:
	
	move.w	8(a5),d0
	ext.w	d0
	add.w	d0,d1	;pat.transpose

	move.w	18(a5),d0	;fine tuning
	asl.w	#7,d0
	lea	(a2,d0),a2	;finetune erby
	add.w	d1,d1
;	lea	(a2,d1),a2	;note erby
	move.w	(a2,d1),16(a5)	;cur.freq

	tst.b	5(a4)	;pitch change
	beq	nopitch
	tst.b	29(a5)	;pitchdelay
	beq	okpitzen
	sub.b	#1,29(a5)
	bra	nopitch
okpitzen:
	lea	wavedata,a3
	moveq	#0,d1
	move.b	5(a4),d1
	asl.w	#7,d1
	lea	(a3,d1),a3
	move.w	30(a5),d1	;phasecnt.
	add.w	#1,30(a5)
	and.w	#127,30(a5)
;	lea	(a3,d1),a3
	move.b	(a3,d1),d1
	ext.w	d1
	neg.w	d1
	add.w	d1,16(a5)	;cur.freq
nopitch:

	move.w	16(a5),6(a6)	;ch1. freq.
	rts

sampletjen:
	sub.w	#32,d1
	asl.w	#5,d1		;32 bytes per samplestruct.
	lea	samplestruct,a3
	lea	(a3,d1),a3
	move.l	a3,32(a5)	;opslaan voor over 1 beeld!
	move.w	#1,20(a5)
	lea	sampledata,a2
	lea	(a2),a0
	add.l	(a3),a0		;samplestart
	move.l	a0,(a6)		;ch1.waveform
	move.l	4(a3),d1
	sub.l	(a3),d1
	asr.w	#1,d1
	move.w	d1,4(a6)	;ch1.length
	move.w	10(a1),$dff096	;ch.uit
	bra	sampletrug

samplereinit:
	lea	sampledata,a2
	lea	empty,a4


	lea	datach1,a5
	lea	$dff0a0,a6
	moveq	#3,d5
	
slop:
	tst.w	20(a5)
	beq	next
	clr.w	20(a5)
	move.l	32(a5),a3	;point to smplestruct
	tst.l	8(a3)
	beq	noloop

	lea	(a2),a1
	add.l	8(a3),a1	;sampleloopstart
	move.l	a1,(a6)		;ch1.waveform
	move.l	4(a3),d1
	sub.l	8(a3),d1
	asr.w	#1,d1
	move.w	d1,4(a6)	;ch1.length

next:
	lea	40(a5),a5
	lea	16(a6),a6
	dbf	d5,slop
	rts
noloop:
	move.l	a4,(a6)		;ch1.wavef
	move.w	#4,4(a6)	;ch1.length

	lea	40(a5),a5
	lea	16(a6),a6
	dbf	d5,slop
	rts

empty:
	blk.b	8,0	;for smple te nokke

playerdat:
songdelay:	dc.w	0
newpatflg:	dc.w	0
newnoteflg:	dc.w	0
songcnt:	dc.w	0	;(0-7)
patcnt:		dc.w	0	;(0-63)
dma:		dc.w	0
songnr:		dc.w	0
songspd:	dc.w	5
songlength:	dc.w	1
patlength:	dc.w	64

datach1:	blk.b	40,0
datach2:	blk.b	40,0
datach3:	blk.b	40,0
datach4:	blk.b	40,0


frequencies:
dc.w 4832,4560,4304,4064,3840,3616;oct1
dc.w 3424,3232,3048,2880,2712,2560,2416,2280,2152,2032,1920,1808;oct2
dc.w 1712,1616,1524,1440,1356,1280,1208,1140,1076,1016,0960,0904;oct3
dc.w 0856,0808,0762,0720,0678,0640,0604,0570,0538,0508,0480,0452;oct4
dc.w 0428,0404,0381,0360,0339,0320,0302,0285,0269,0254,0240,0226;oct5
dc.w 0214,0202,0190,0180,0170,0160,0151,0143,0135,0127		;oct6

dc.w 0,0,0,0
dc.w 4028,3806,3584,3394,3204,3013
dc.w 2855,2696,2538,2395,2268,2141,2014,1903,1792,1697,1602,1507
dc.w 1428,1348,1269,1198,1134,1071,1007,952,896,849,801,754,714
dc.w 674,635,599,567,536,504,476,448,425,401,377,357,337,310,300
dc.w 284,268,252,238,224,213,201,189,179,169,159,150,142,134

dc.w 0,0,0,0
dc.w 3993,3773,3552,3364,3175,2987,2830,2672,2515,2374,2248,2122
dc.w 1997,1887,1776,1682,1588,1494,1415,1336,1258,1187,1124,1061
dc.w 999,944,888,841,794,747,708,668,629,594,562,531,500,472,444
dc.w 421,397,374,354,334,315,297,281,266,250,236,222,211,199,187
dc.w 177,167,158,149,141,133

dc.w 0,0,0,0
dc.w 3957,3739,3521,3334,3147,2960,2804,2648,2493,2353,2228,2103
dc.w 1979,1870,1761,1667,1574,1480,1402,1324,1247,1177,1114,1052
dc.w 990,935,881,834,787,740,701,662,624,589,557,526,495,468,441
dc.w 417,394,370,351,331,312,295,279,263,248,234,221,209,197,185
dc.w 176,166,156,148,140,132

dc.w 0,0,0,0
dc.w 3921,3705,3489,3304,3119,2933,2779,2625,2470,2331,2208,2084
dc.w 1961,1853,1745,1652,1560,1467,1390,1313,1235,1166,1104,1042
dc.w 981,927,873,826,780,734,695,657,618,583,552,521,491,464,437
dc.w 413,390,367,348,329,309,292,276,261,246,232,219,207,195,184
dc.w 174,165,155,146,138,131

dc.w 0,0,0,0
dc.w 3886,3671,3457,3274,3090,2907,2754,2601,2448,2310,2188,2065
dc.w 1943,1836,1729,1637,1545,1454,1377,1301,1224,1155,1094,1033
dc.w 972,918,865,819,773,727,689,651,612,578,547,517,486,459,433
dc.w 410,387,364,345,326,306,289,274,259,243,230,217,205,194,182
dc.w 173,163,153,145,137,130

dc.w 0,0,0,0
dc.w 3851,3638,3426,3244,3062,2880,2729,2577,2426,2289,2168,2047
dc.w 1926,1819,1713,1622,1531,1440,1365,1289,1213,1145,1084,1024
dc.w 963,910,857,811,766,720,683,645,607,573,542,512,482,455,429
dc.w 406,383,360,342,323,304,287,271,256,241,228,215,203,192,180
dc.w 171,162,152,144,136,128


clear:
	lea	songdata2,a0
	move.w	#64512,d7
clren:
	clr.l	(a0)+
	dbf	d7,clren
	rts


org	$40000
load	$40000
songdata2:

dc.b	1
dc.b	0
dc.b	3
dc.b	4

org	songdata2+34
load	songdata2+34
songdata:
;blk.b	32,0

dc.b	0,0,0,3,0,7,0,12
dc.b	0,0,0,3,0,8,0,12
dc.b	0,0,0,5,0,8,0,12
dc.b	0,-1,0,2,0,7,0,11

org	songdata+8192
load	songdata+8192
instdata:

dc.b	00,64
dc.b	01
dc.b	1
dc.b	0
dc.b	0	;0=niks
dc.b	%00000000
dc.b	40

dc.b	0	;finetune
dc.b	0
dc.b	0
dc.b	0
dc.b	0
dc.b	0
dc.b	0
dc.b	0


org	instdata+1024
load	instdata+1024
arpdata:
dc.b	0,3,7,12,0,3,7,12
dc.b	0,3,7,12,0,3,7,12
dc.b	0,3,7,12,0,3,7,12
dc.b	0,3,7,12,0,3,7,12

blk.b	32,0

org	arpdata+256
load	arpdata+256
wavedata:

blk.b	16,-127
blk.b	16,127
blk.b	16,-127
blk.b	16,127
blk.b	16,-127
blk.b	16,127
blk.b	16,-127
blk.b	16,127
;blk.b	64,-127
;blk.b	64,127

blk.b	128,64


dc.b	0,0,0,0,0,0,0,00,2,4,6,8,10,12,14,16,18,20,22,20,20,18,16
dc.b	14,12,10,8,6,4,2,0
blk.b	128,0

org	wavedata+4096
load	wavedata+4096
patdata:

dc.b	50,0,0,0
blk.b	63*4,0

org	patdata+65536
load	patdata+65536

samplestruct:

dc.l	0
dc.l	8000
dc.l	4000
blk.b	20,0

org	samplestruct+1024
load	samplestruct+1024

sampledata:
	
