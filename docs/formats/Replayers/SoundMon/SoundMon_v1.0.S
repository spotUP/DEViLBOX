*----------------------------------------------------
; The Brian's SoundMon Player Routine (C)1988
; By Brian Postma
; J.v.Hartenstraat 51
; 7576VX Oldenzaal (NL)
; Tel:05410-14763
*----------------------------------------------------

bpstart:
 bsr		bpinit
 lea		inter,a1
 moveq		#5,d0
 move.l		4,a6
 jsr		-168(a6)	; Interrupt on

bpwait:
 btst		#6,$bfe001
 bne		bpwait

 move.l		4,a6
 moveq		#32,d0
 lea		inter,a1
 jsr		-174(a6)	; Interrupt Off
 move.w		#$f,$dff096
 clr.l		d0
 rts

bpinit:
 lea		samples,a0
 lea		bpsong,a1
 move.l		#512,d0
 move.w		30(a1),d1	;d1 now contains length in steps
 move.l		#1,d2		;1 is highest pattern number
 mulu		#4,d1		;4 voices per step
 subq.w		#1,d1		;correction for DBRA
findhighest:
 cmp.w		(a1,d0),d2	;Is it higher
 bge		nothigher	;No
 move.w		(a1,d0),d2	;Yes, so let D2 be highest
nothigher:
 addq.l		#4,d0		;Next Voice
 dbra		d1,findhighest	;And search
 move.w		30(a1),d1
 mulu		#16,d1		;16 bytes per step
 move.l		#512,d0		;header is 512 bytes
 mulu		#48,d2		;48 bytes per pattern
 add.l		d2,d0
 add.l		d1,d0		;offset for samples

 move.l		#14,d1		;15 samples
 add.l		#32+24,a1
 add.l		#bpsong,d0
initloop:
 move.l		d0,(a0)+
 move.w		(a1),d2
 mulu		#2,d2		;Length is in words
 add.l		d2,d0		;offset next sample
 add.l		#32,a1		;Length of Sample Part in header
 dbra		d1,initloop
 rts

bpnewirq:
 movem.l	d0-d7/a0-a6,-(a7)
 bsr		bpmusic
 movem.l	(a7)+,d0-d7/a0-a6
 moveq		#0,d0
 rts

bpmusic:
 subq.b		#1,arpcount
 move.l		#3,d0
 lea		bpcurrent,a0
 move.l		#$dff0a0,a1
bploop1:
 move.b		12(a0),d4
 ext.w		d4
 add.w		d4,(a0)
 move.w		(a0),6(a1)
 move.l		4(a0),(a1)
 move.w		8(a0),4(a1)
 tst.b		11(a0)
 bne		bpdoarp
 tst.b		13(a0)
 beq		not2
bpdoarp:
 tst.b		arpcount
 bne		not0
 move.b		11(a0),d3
 move.b		13(a0),d4
 and.w		#240,d4
 and.w		#240,d3
 lsr.w		#4,d3
 lsr.w		#4,d4
 add.w		d3,d4
 add.b		10(a0),d4
 bsr		bpplayarp
 bra		not2
not0:
 cmpi.b		#1,arpcount 
 bne		not1
 move.b		11(a0),d3
 move.b		13(a0),d4
 and.w		#15,d3
 and.w		#15,d4
 add.w		d3,d4
 add.b		10(a0),d4
 bsr		bpplayarp
 bra		not2
not1:
 move.b		10(a0),d4
 bsr		bpplayarp
not2:
 lea		$10(a1),a1
 lea		$e(a0),a0
 dbra		d0,bploop1
 tst.b		arpcount
 bne		arpnotzero
 move.b		#3,arpcount
arpnotzero:
 subq.b		#1,bpcount
 beq		bpskip1
 rts
bpskip1:
 move.b		bpdelay,bpcount
bpplay:
 bsr		bpnext
 move.w		dma,$dff096
 move.l		#$1f4,d0
bpxx:
 dbf		d0,bpxx
 move.l		#3,d0
 move.l		#$dff0a0,a1
 move.w		#1,d1
 lea		bpcurrent,a2
bploop2:
 btst		#15,(a2)
 beq		bpskip7
 bsr		bpplayit
bpskip7:
 asl.w		#1,d1
 lea		$10(a1),a1
 lea		$e(a2),a2
 dbra		d0,bploop2
 rts

bpnext:
 clr.w		dma
 lea		bpsong,a0
 move.l		#$dff0a0,a3
 move.l		#3,d0
 move.w		#1,d7
 lea		bpcurrent,a1
bploop3:
 clr.l		d1
 move.w		bpstep,d1
 lsl.w		#4,d1
 move.l		d0,d2
 lsl.l		#2,d2
 add.l		d2,d1
 add.l		#512,d1
 move.w		(a0,d1),d2
 move.b		2(a0,d1),st
 move.b		3(a0,d1),tr
 subq.w		#1,d2
 mulu		#48,d2
 clr.l		d3
 move.w		30(a0),d3
 lsl.w		#4,d3
 add.l		d2,d3
 move.l	  	#$00000200,d4
 move.b		bppatcount,d4
 add.l		d3,d4
 move.l		d4,a2
 add.l		a0,a2

 clr.l		d3 
 move.b		(a2),d3
 tst.b		d3
 bne		bpskip4
 bra		bpoptionals
bpskip4:
 clr.w		12(a1)	  ;Clear autoslide/autoarpeggio
 move.b		1(a2),d4
 and.b		#15,d4
 cmpi.b		#10,d4    ;Option 10->transposes off
 bne		bp_do1
 move.b		2(a2),d4
 and.b		#240,d4	  ;Higher nibble=transpose
 bne		bp_not1
bp_do1:
 add.b		tr,d3
bp_not1:
 move.b		d3,10(a1) ; Voor Arpeggio's
 lea		bpper,a4
 lsl.w		#1,d3
 move.w		-2(a4,d3.w),(a1)
 bset		#15,(a1)
 move.b		#$ff,2(a1)

 clr.w		d3
 move.b		1(a2),d3
 lsr.b		#4,d3
 and.b		#15,d3
 tst.b		d3
 bne		bpskip5
 move.b		3(a1),d3 
bpskip5: 
 move.b		1(a2),d4
 and.b		#15,d4
 cmpi.b		#10,d4		;option 10
 bne		bp_do2
 move.b		2(a2),d4
 and.b		#15,d4
 bne		bp_not2
bp_do2:
 add.b		st,d3
bp_not2:
 cmpi.w		#1,8(a1)
 beq		bpsamplechange
 cmpi.b		3(a1),d3
 beq		bpoptionals
bpsamplechange:
 move.b		d3,3(a1)
 or.w		d7,dma
 
bpoptionals: 
 clr.l		d3
 clr.l		d4
 move.b		1(a2),d3
 and.b		#15,d3
 move.b		2(a2),d4
 
; Optionals Here
 cmpi.b		#0,d3
 bne		notopt0
 move.b		d4,11(a1)
notopt0:
 cmpi.b		#1,d3
 bne		bpskip3
 move.w		d4,8(a3)
 move.b		d4,2(a1) ; Volume ook in BPCurrent
bpskip3:
 cmpi.b		#2,d3  ; Set Speed
 bne		bpskip9
 move.b		d4,bpcount
 move.b		d4,bpdelay
bpskip9:
 cmpi.b		#3,d3 ; Filter = LED control
 bne		bpskipa
 tst.b		d4
 bne		bpskipb
 bset		#1,$bfe001
 bra		bpskip2
bpskipb:
 bclr		#1,$bfe001
bpskipa:
 cmpi.b		#4,d3 ; PortUp
 bne		noportup
 sub.w		d4,(a1) ; Slide data in BPCurrent
 move.w		(a1),6(a3) ; En in AudPer reg.
 clr.b		11(a1) ; Arpeggio's uit
noportup:
 cmpi.b		#5,d3 ; PortDown
 bne		noportdn
 add.w		d4,(a1) ; Slide down
 clr.b		11(a1)
 move.w		(a1),6(a3)
noportdn:
 cmpi.b		#6,d3	; SetRepCount
 bne		notopt6
 move.b		d4,bprepcount
notopt6:
 cmpi.b		#7,d3	; DBRA repcount
 bne		notopt7
 subq.b		#1,bprepcount
 beq		notopt7
 move.w		d4,bpstep
notopt7:
 cmpi.b		#8,d3	;Set AutoSlide
 bne		notopt8
 move.b		d4,12(a1)
notopt8:
 cmpi.b		#9,d3	;Set AutoArpeggio
 bne		notopt9
 move.b		d4,13(a1)
notopt9:
bpskip2:
 lea		$10(a3),a3
 lea		$e(a1),a1
 asl.w		#1,d7
 dbra		d0,bploop3 				
 addq.b		#3,bppatcount
 cmpi.b		#48,bppatcount
 bne		bpskip8
 move.b		#0,bppatcount
 addq.w		#1,bpstep
 lea		bpsong,a0
 move.w		30(a0),d1
 cmp.w		bpstep,d1
 bne		bpskip8
 move.w		#0,bpstep
bpskip8:
 rts

bpplayit:
 bclr		#15,(a2)
 move.w		(a2),6(a1)
 clr.l		d7
 move.b		3(a2),d7
 move.l		d7,d6
 lea		bpsong,a3
 lsl.l		#2,d6
 lea		samples,a4
 move.l		-4(a4,d6),d4
 beq		bp_nosamp
 move.l		d4,(a1)
 lsl.l		#5,d7
 add.l		#24,d7
 move.w		(a3,d7),4(a1)
 move.b		2(a2),9(a1)
 cmpi.b		#$ff,2(a2)
 bne		skipxx
 move.w		6(a3,d7),8(a1)
skipxx: 
 move.w		4(a3,d7),8(a2)
 clr.l		d6
 move.w		2(a3,d7),d6
 add.l		d6,d4
 move.l		d4,4(a2)
 cmpi.w		#1,8(a2)
 bne		bpskip6
bp_nosamp:
 move.l		#null,4(a2)
 bra		bpskip10
bpskip6:
 move.w		8(a2),4(a1)
 move.l		4(a2),(a1)
bpskip10:
 add.w		#$8000,d1
 move.w		d1,$dff096
 rts
bpplayarp:
 lea		bpper,a4
 and.w		#$ff,d4
 lsl.w		#1,d4
 move.w		-2(a4,d4.w),6(a1)
 rts
  
inter:
 dc.l	0,0
 dc.b	2,127
 dc.l	0,0
 dc.l	bpnewirq
					    
null: dc.w 0
bpcurrent: dc.w 0,0	;periode,instrument
	   dc.l null	;start
           dc.w 1	;length (words)
	   dc.b 0,0,0,0 ;noot,arpeggio,autoslide,autoarpeggio

           dc.w 0,0
	   dc.l null
	   dc.w 1,0,0

 	   dc.w 0,0
	   dc.l null
	   dc.w 1,0,0

	   dc.w 0,0
	   dc.l null
	   dc.w 1,0,0
bpstep: dc.w 0
bppatcount: dc.b 0
st: dc.b 0
tr: dc.b 0
bpcount: dc.b 1
bpdelay: dc.b 6
arpcount: dc.b 1
bprepcount: dc.b 1
 even
dma: dc.w 0
bpper:
 dc.w	856,808,760,720,680,640,604,572,540,508,480,452
 dc.w	428,404,380,360,340,320,302,286,270,254,240,226
 dc.w	214,202,190,180,170,160,151,143,135,127,120,113
samples:
 dc.l	s1,s2,s3,s4,s5,s6,s7,s8,s9,sa,sb,sc,sd,se,sf

bpsong: blk.b 0,0
s1:	blk.b 0,0
s2: 	blk.b 0,0
s3: 	blk.b 0,0
s4: 	blk.b 0,0
s5: 	blk.b 0,0
s6:	blk.b 0,0
s7:	blk.b 0,0
s8:	blk.b 0,0
s9:	blk.b 0,0
sa:	blk.b 0,0
sb: 	blk.b 0,0
sc: 	blk.b 0,0
sd: 	blk.b 0,0
se:	blk.b 0,0
sf:	blk.b 0,0
