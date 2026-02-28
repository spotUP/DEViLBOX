
Mix_Requester:             ;Mix Waveforms - Requester
	dc.l	NULL
	dc.w	159,26
	dc.w	266,76
	dc.w	0,0
	dc.l	Mix_GadgetList1
	dc.l Mix_Border
	dc.l	Mix_IntuiTextList1
	dc.w	NULL
	dc.b	2,0
	dc.l	NULL
	dcb.b 32,0
	dc.l	NULL
	dc.l	NULL
	dcb.b 36,0
Mix_Border:
     dc.w 0,0
     dc.b 3,3,0,5
     dc.l Mix_kord,0
Mix_kord:
     dc.w 0,0,265,0,265,75,0,75,0,0
Mix_GadgetList1:
Mix_Gadget1:
	dc.l	Mix_Gadget2
	dc.w	47,17
	dc.w	13,44
	dc.w	NULL
	dc.w	RELVERIFY
	dc.w	PROPGADGET+REQGADGET
	dc.l	Mix_Image1
	dc.l	NULL
	dc.l	Mix_IText1
	dc.l	NULL
	dc.l	Mix_Mix_Gadget1SInfo
	dc.w	NULL
	dc.l	NULL
Mix_Mix_Gadget1SInfo:
	dc.w	AUTOKNOB+FREEVERT
	dc.w	-1,0
	dc.w	-1,4095
	dc.w	0,0,0,0,0,0
Mix_Image1:
	dc.w	0,0
	dc.w	5,4
	dc.w	0
	dc.l	NULL
	dc.b	$0000,$0000
	dc.l	NULL
Mix_IText1:
	dc.b	3,0,RP_JAM2,0
	dc.w	-35,0
	dc.l	NULL
	dc.l	Mix_ITextText1
	dc.l	Mix_IText2
Mix_ITextText1:
	dc.b	'100%',0
	cnop 0,2
Mix_IText2:
	dc.b	3,0,RP_JAM2,0
	dc.w	-19,37
	dc.l	NULL
	dc.l	Mix_ITextText2
	dc.l	Mix_IText3
Mix_ITextText2:
	dc.b	'0%',0
	cnop 0,2
Mix_IText3:
	dc.b	1,0,RP_JAM2,0
	dc.w	-6,48
	dc.l	NULL
	dc.l	Mix_ITextText3
	dc.l	NULL
Mix_ITextText3:
	dc.b	'Old',0
	cnop 0,2
Mix_Gadget2:
	dc.l	Mix_Gadget3
	dc.w	82,17
	dc.w	13,44
	dc.w	NULL
	dc.w	RELVERIFY
	dc.w	PROPGADGET+REQGADGET
	dc.l	Mix_Image2
	dc.l	NULL
	dc.l	Mix_IText4
	dc.l	NULL
	dc.l	Mix_Mix_Gadget2SInfo
	dc.w	NULL
	dc.l	NULL
Mix_Mix_Gadget2SInfo:
	dc.w	AUTOKNOB+FREEVERT
	dc.w	-1,0
	dc.w	-1,4095
	dc.w	0,0,0,0,0,0
Mix_Image2:
	dc.w	0,0
	dc.w	5,4
	dc.w	0
	dc.l	NULL
	dc.b	$0000,$0000
	dc.l	NULL
Mix_IText4:
	dc.b	1,0,RP_JAM2,0
	dc.w	-4,48
	dc.l	NULL
	dc.l	Mix_ITextText4
	dc.l	NULL
Mix_ITextText4:
	dc.b	'New',0
	cnop 0,2
Mix_Gadget3:
	dc.l	Mix_Gadget4
	dc.w	199,19
	dc.w	48,10
	dc.w	NULL
	dc.w	RELVERIFY+STRINGRIGHT+LONGINT
	dc.w	STRGADGET+REQGADGET
	dc.l	Mix_Border1
	dc.l	NULL
	dc.l	Mix_IText5
	dc.l	NULL
	dc.l	Mix_Mix_Gadget3SInfo
	dc.w	NULL
	dc.l	NULL
Mix_Mix_Gadget3SInfo:
	dc.l	Mix_Mix_Gadget3SIBuff
	dc.l	NULL
	dc.w	0
	dc.w	6
	dc.w	0
	dc.w	0,0,0,0,0
	dc.l	0
	dc.l	0
	dc.l	NULL
Mix_Mix_Gadget3SIBuff:
	dc.b	'0',0
PWstringlen	set	*-Mix_Mix_Gadget3SIBuff
	dcb.b 6-PWstringlen,0
	cnop 0,2
Mix_Border1:
	dc.w	-92,-2
	dc.b	3,0,RP_JAM2
	dc.b	5
	dc.l	Mix_BorderVectors1
	dc.l	NULL
Mix_BorderVectors1:
	dc.w	0,0
	dc.w	141,0
	dc.w	141,11
	dc.w	0,11
	dc.w	0,1
Mix_IText5:
	dc.b	2,1,RP_JAM1,0
	dc.w	-89,0
	dc.l	NULL
	dc.l	Mix_ITextText5
	dc.l	NULL
Mix_ITextText5:
	dc.b	'Old offset:',0
	cnop 0,2
Mix_Gadget4:
	dc.l	Mix_Gadget5
	dc.w	108,37
	dc.w	140,10
	dc.w	NULL
	dc.w	RELVERIFY+TOGGLESELECT
	dc.w	BOOLGADGET+REQGADGET
	dc.l	Mix_Border2
	dc.l	NULL
	dc.l	Mix_IText6
	dc.l	NULL
	dc.l	NULL
	dc.w	NULL
	dc.l	NULL
Mix_Border2:
	dc.w	-1,-1
	dc.b	3,0,RP_JAM1
	dc.b	5
	dc.l	Mix_BorderVectors2
	dc.l	NULL
Mix_BorderVectors2:
	dc.w	0,0
	dc.w	141,0
	dc.w	141,11
	dc.w	0,11
	dc.w	0,0
Mix_IText6:
	dc.b	1,0,RP_JAM2,0
	dc.w	35,1
	dc.l	NULL
	dc.l	Mix_ITextText6
	dc.l	NULL
Mix_ITextText6:
	dc.b	'Optimize',0
	cnop 0,2
Mix_Gadget5:
	dc.l	NULL
	dc.w	208,59
	dc.w	40,10
	dc.w	NULL
	dc.w	RELVERIFY+ENDGADGET
	dc.w	BOOLGADGET+REQGADGET
	dc.l	Mix_Border3
	dc.l	NULL
	dc.l	Mix_IText7
	dc.l	NULL
	dc.l	NULL
	dc.w	NULL
	dc.l	NULL
Mix_Border3:
	dc.w	-1,-1
	dc.b	3,0,RP_JAM1
	dc.b	5
	dc.l	Mix_BorderVectors3
	dc.l	NULL
Mix_BorderVectors3:
	dc.w	0,0
	dc.w	41,0
	dc.w	41,11
	dc.w	0,11
	dc.w	0,0
Mix_IText7:
	dc.b	1,0,RP_JAM2,0
	dc.w	8,1
	dc.l	NULL
	dc.l	Mix_ITextText7
	dc.l	NULL
Mix_ITextText7:
	dc.b	'Mix',0
	cnop 0,2
Mix_IntuiTextList1:
Mix_IText8:
	dc.b	1,3,RP_JAM1,0
	dc.w	1,0
	dc.l	NULL
	dc.l	Mix_ITextText8
	dc.l	NULL
Mix_ITextText8:
	dc.b	' Mix waveforms                      ',0
	cnop 0,2


Instr_Type_Requester:      ;Type of Instrument - Requester
	dc.l	NULL
	dc.w	187,50
	dc.w	229,57
	dc.w	0,0
	dc.l	NULL
	dc.l IT_Border
	dc.l	IT_IntuiTextList1
	dc.w	NULL
	dc.b	2,0
	dc.l	NULL
	dcb.b 32,0
	dc.l	NULL
	dc.l	NULL
	dcb.b 36,0
IT_Border:
     dc.w 0,0
     dc.b 3,3,0,5
     dc.l IT_kord,0
IT_kord:
     dc.w 0,0,228,0,228,56,0,56,0,0
IT_IntuiTextList1:
IT_IText1:
	dc.b	3,0,RP_JAM2,0
	dc.w	9,5
	dc.l	NULL
	dc.l	IT_ITextText1
	dc.l	IT_IText2
IT_ITextText1:
	dc.b	'Type of instrument:',0
	cnop 0,2
IT_IText2:
	dc.b	1,0,RP_JAM2,0
	dc.w	63,20
	dc.l	NULL
	dc.l	IT_ITextText2a
	dc.l	IT_IText3
IT_ITextText2a:
	dc.b	'SOUNDFACTORY',0
	cnop 0,2
IT_ITextText2b:
     dc.b '  Raw Data',0
     cnop 0,2
IT_ITextText2c:
     dc.b '    IFF',0
     cnop 0,2
IT_IText3:
	dc.b	3,0,RP_JAM2,0
	dc.w	23,44
	dc.l	NULL
	dc.l	IT_ITextText3
	dc.l	NULL
IT_ITextText3:
	dc.b	'Press left mousebutton...',0
	cnop 0,2


Copyright_Requester:       ;Copyright-Requester
	dc.l	NULL
	dc.w	140,20
	dc.w	343,128
	dc.w	0,0
	dc.l	Co_GadgetList1
	dc.l	NULL
	dc.l	Co_IntuiTextList1
	dc.w	NULL
	dc.b	3,0
	dc.l	NULL
	dcb.b 32,0
	dc.l	NULL
	dc.l	NULL
	dcb.b 36,0
Co_GadgetList1:
Co_Gadget1:
	dc.l	NULL
	dc.w	276,111
	dc.w	56,11
	dc.w	NULL
	dc.w	RELVERIFY+ENDGADGET
	dc.w	BOOLGADGET+REQGADGET
	dc.l	Co_Border1
	dc.l	NULL
	dc.l	Co_IText1
	dc.l	NULL
	dc.l	NULL
	dc.w	NULL
	dc.l	NULL
Co_Border1:
	dc.w	-1,-1
	dc.b	1,0,RP_JAM1
	dc.b	5
	dc.l	Co_BorderVectors1
	dc.l	NULL
Co_BorderVectors1:
	dc.w	0,0
	dc.w	57,0
	dc.w	57,12
	dc.w	0,12
	dc.w	0,0
Co_IText1:
	dc.b	1,0,RP_JAM2,0
	dc.w	20,2
	dc.l	NULL
	dc.l	Co_ITextText1
	dc.l	NULL
Co_ITextText1:
	dc.b	'Ok',0
	cnop 0,2
Co_IntuiTextList1:
Co_IText2:
	dc.b	2,0,RP_JAM2,0
	dc.w	71,4
	dc.l	NULL
	dc.l	Co_ITextText2
	dc.l	Co_IText3
Co_ITextText2:
	dc.b	'S O U N D F A C T O R Y',0
	cnop 0,2
Co_IText3:
	dc.b	0,0,RP_JAM2,0
	dc.w	9,24
	dc.l	NULL
	dc.l	Co_ITextText3
	dc.l	Co_IText4
Co_ITextText3:
	dc.b	'Written in 1989 by',0
	cnop 0,2
Co_IText4:
	dc.b	2,0,RP_JAM2,0
	dc.w	8,36
	dc.l	NULL
	dc.l	Co_ITextText4
	dc.l	Co_IText5
Co_ITextText4:
	dc.b	'Thomas Kolbe',0
	cnop 0,2
Co_IText5:
	dc.b	2,0,RP_JAM2,0
	dc.w	8,45
	dc.l	NULL
	dc.l	Co_ITextText5
	dc.l	Co_IText6
Co_ITextText5:
	dc.b	'Wildermannstr. 62',0
	cnop 0,2
Co_IText6:
	dc.b	2,0,RP_JAM2,0
	dc.w	8,54
	dc.l	NULL
	dc.l	Co_ITextText6
	dc.l	Co_IText7
Co_ITextText6:
	dc.b	'4350 Recklinghausen',0
	cnop 0,2
Co_IText7:
	dc.b	2,0,RP_JAM2,0
	dc.w	183,54
	dc.l	NULL
	dc.l	Co_ITextText7
	dc.l	Co_IText8
Co_ITextText7:
	dc.b	'4350 Recklinghausen',0
	cnop 0,2
Co_IText8:
	dc.b	2,0,RP_JAM2,0
	dc.w	182,45
	dc.l	NULL
	dc.l	Co_ITextText8
	dc.l	Co_IText9
Co_ITextText8:
	dc.b	'Hochlarmarkstr. 29',0
	cnop 0,2
Co_IText9:
	dc.b	2,0,RP_JAM2,0
	dc.w	183,36
	dc.l	NULL
	dc.l	Co_ITextText9
	dc.l	Co_IText10
Co_ITextText9:
	dc.b	'Zuheir Urwani',0
	cnop 0,2
Co_IText10:
	dc.b	1,0,RP_JAM2,0
	dc.w	92,67
	dc.l	NULL
	dc.l	Co_ITextText10
	dc.l	Co_IText11
Co_ITextText10:
	dc.b	'(C) 1989 PROFITEAM',0
	cnop 0,2
Co_IText11:
	dc.b	0,0,RP_JAM2,0
	dc.w	8,83
	dc.l	NULL
	dc.l	Co_ITextText11
	dc.l	Co_IText12
Co_ITextText11:
	dc.b	'Published by ',0
	cnop 0,2
Co_IText12:
	dc.b	2,0,RP_JAM2,0
	dc.w	106,95
	dc.l	NULL
	dc.l	Co_ITextText12
	dc.l	Co_IText13
Co_ITextText12:
	dc.b	'SPHINX Software',0
	cnop 0,2
Co_IText13:
	dc.b	2,0,RP_JAM2,0
	dc.w	106,104
	dc.l	NULL
	dc.l	Co_ITextText13
	dc.l	Co_IText14
Co_ITextText13:
	dc.b	'Am Tyrol 10',0
	cnop 0,2
Co_IText14:
	dc.b	2,0,RP_JAM2,0
	dc.w	106,113
	dc.l	NULL
	dc.l	Co_ITextText14
	dc.l	NULL
Co_ITextText14:
	dc.b	'5860 Iserlohn',0
	cnop 0,2


Working_Requester:         ;Working - Please Wait! - Requester
   dc.l   NULL
   dc.w   192,12
   dc.w   219,42
   dc.w   0,0
   dc.l   NULL
   dc.l   W_Border
   dc.l   W_IntuiTextList1
   dc.w   NULL
   dc.b   2,0
   dc.l   NULL
   dcb.b 32,0
   dc.l   NULL
   dc.l   NULL
   dcb.b 36,0
W_Border:
     dc.w 0,0
     dc.b 3,3,0,5
     dc.l W_kord,0
W_kord:
     dc.w 0,0,218,0,218,41,0,41,0,0
W_IntuiTextList1:
W_IText1:
   dc.b   1,2,RP_JAM1,0
   dc.w   25,16
   dc.l   NULL
   dc.l   W_ITextText1
   dc.l   NULL
W_ITextText1:
   dc.b   'Working. Please Wait!',0
   cnop 0,2

Z_Image1:
   dc.w   -225,0
   dc.w   25,23
   dc.w   2
   dc.l   Z_ImageData1
   dc.b   $0003,$0000
   dc.l Z_Image2
Z_Image2:
   dc.w   -200,0
   dc.w   25,23
   dc.w   2
   dc.l   Z_ImageData1
   dc.b   $0003,$0000
   dc.l Z_Image3
Z_Image3:
   dc.w   -175,0
   dc.w   25,23
   dc.w   2
   dc.l   Z_ImageData11
   dc.b   $0003,$0000
   dc.l Z_Image4
Z_Image4:
   dc.w   -150,0
   dc.w   25,23
   dc.w   2
   dc.l   Z_ImageData1
   dc.b   $0003,$0000
   dc.l Z_Image5
Z_Image5:
   dc.w   -125,0
   dc.w   25,23
   dc.w   2
   dc.l   Z_ImageData1
   dc.b   $0003,$0000
   dc.l   NULL

   even
Player_Requester:
   dc.l   NULL
   dc.w   36,20
   dc.w   490,108
   dc.w   0,0
   dc.l   P_GadgetList1
   dc.l P_Border
   dc.l   P_IntuiTextList1
   dc.w   NULL
   dc.b   0,0
   dc.l   NULL
   dcb.b 32,0
   dc.l   NULL
   dc.l   NULL
   dcb.b 36,0
P_Border:
     dc.w 0,0
     dc.b 2,3,0,5
     dc.l P_kord,0
P_kord:
     dc.w 0,0,489,0,489,107,0,107,0,0
P_GadgetList1:
P_Gadget1:
   dc.l   P_Gadget2
   dc.w   22,28
   dc.w   26,10
   dc.w   GADGHIMAGE+GADGIMAGE
   dc.w   RELVERIFY
   dc.w   BOOLGADGET+REQGADGET
   dc.l   P_Image1
   dc.l   P_Image2
   dc.l   NULL
   dc.l   NULL
   dc.l   NULL
   dc.w   1
   dc.l   NULL
P_Image1:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData1
   dc.b   $0003,$0000
   dc.l   NULL
P_Image2:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData2
   dc.b   $0003,$0000
   dc.l   NULL
P_Gadget2:
   dc.l   P_Gadget3
   dc.w   54,28
   dc.w   26,10
   dc.w   GADGHIMAGE+GADGIMAGE
   dc.w   RELVERIFY
   dc.w   BOOLGADGET+REQGADGET
   dc.l   P_Image3
   dc.l   P_Image4
   dc.l   NULL
   dc.l   NULL
   dc.l   NULL
   dc.w   2
   dc.l   NULL
P_Image3:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData3
   dc.b   $0003,$0000
   dc.l   NULL
P_Image4:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData4
   dc.b   $0003,$0000
   dc.l   NULL
P_Gadget3:
   dc.l   P_Gadget4
   dc.w   86,28
   dc.w   26,10
   dc.w   GADGHIMAGE+GADGIMAGE
   dc.w   RELVERIFY
   dc.w   BOOLGADGET+REQGADGET
   dc.l   P_Image5
   dc.l   P_Image6
   dc.l   NULL
   dc.l   NULL
   dc.l   NULL
   dc.w   3
   dc.l   NULL
P_Image5:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData5
   dc.b   $0003,$0000
   dc.l   NULL
P_Image6:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData6
   dc.b   $0003,$0000
   dc.l   NULL
P_Gadget4:
   dc.l   P_Gadget5
   dc.w   118,28
   dc.w   26,10
   dc.w   GADGHIMAGE+GADGIMAGE
   dc.w   RELVERIFY
   dc.w   BOOLGADGET+REQGADGET
   dc.l   P_Image7
   dc.l   P_Image8
   dc.l   NULL
   dc.l   NULL
   dc.l   NULL
   dc.w   4
   dc.l   NULL
P_Image7:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData7
   dc.b   $0003,$0000
   dc.l   NULL
P_Image8:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData8
   dc.b   $0003,$0000
   dc.l   NULL
P_Gadget5:
   dc.l   P_Gadget6
   dc.w   22,42
   dc.w   26,10
   dc.w   GADGHIMAGE+GADGIMAGE
   dc.w   RELVERIFY
   dc.w   BOOLGADGET+REQGADGET
   dc.l   P_Image9
   dc.l   P_Image10
   dc.l   NULL
   dc.l   NULL
   dc.l   NULL
   dc.w   5
   dc.l   NULL
P_Image9:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData9
   dc.b   $0003,$0000
   dc.l   NULL
P_Image10:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData10
   dc.b   $0003,$0000
   dc.l   NULL
P_Gadget6:
   dc.l   P_Gadget7
   dc.w   54,42
   dc.w   26,10
   dc.w   GADGHIMAGE+GADGIMAGE
   dc.w   RELVERIFY
   dc.w   BOOLGADGET+REQGADGET
   dc.l   P_Image11
   dc.l   P_Image12
   dc.l   NULL
   dc.l   NULL
   dc.l   NULL
   dc.w   6
   dc.l   NULL
P_Image11:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData11
   dc.b   $0003,$0000
   dc.l   NULL
P_Image12:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData12
   dc.b   $0003,$0000
   dc.l   NULL
P_Gadget7:
   dc.l   P_Gadget8
   dc.w   86,42
   dc.w   26,10
   dc.w   GADGHIMAGE+GADGIMAGE
   dc.w   RELVERIFY
   dc.w   BOOLGADGET+REQGADGET
   dc.l   P_Image13
   dc.l   P_Image14
   dc.l   NULL
   dc.l   NULL
   dc.l   NULL
   dc.w   7
   dc.l   NULL
P_Image13:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData13
   dc.b   $0003,$0000
   dc.l   NULL
P_Image14:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData14
   dc.b   $0003,$0000
   dc.l   NULL
P_Gadget8:
   dc.l   P_Gadget9
   dc.w   118,42
   dc.w   26,10
   dc.w   GADGHIMAGE+GADGIMAGE
   dc.w   RELVERIFY
   dc.w   BOOLGADGET+REQGADGET
   dc.l   P_Image15
   dc.l   P_Image16
   dc.l   NULL
   dc.l   NULL
   dc.l   NULL
   dc.w   8
   dc.l   NULL
P_Image15:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData15
   dc.b   $0003,$0000
   dc.l   NULL
P_Image16:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData16
   dc.b   $0003,$0000
   dc.l   NULL
P_Gadget9:
   dc.l   P_Gadget10
   dc.w   22,56
   dc.w   26,10
   dc.w   GADGHIMAGE+GADGIMAGE
   dc.w   RELVERIFY
   dc.w   BOOLGADGET+REQGADGET
   dc.l   P_Image17
   dc.l   P_Image18
   dc.l   NULL
   dc.l   NULL
   dc.l   NULL
   dc.w   9
   dc.l   NULL
P_Image17:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData17
   dc.b   $0003,$0000
   dc.l   NULL
P_Image18:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData18
   dc.b   $0003,$0000
   dc.l   NULL
P_Gadget10:
   dc.l   P_Gadget11
   dc.w   54,56
   dc.w   26,10
   dc.w   GADGHIMAGE+GADGIMAGE
   dc.w   RELVERIFY
   dc.w   BOOLGADGET+REQGADGET
   dc.l   P_Image19
   dc.l   P_Image20
   dc.l   NULL
   dc.l   NULL
   dc.l   NULL
   dc.w   10
   dc.l   NULL
P_Image19:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData19
   dc.b   $0003,$0000
   dc.l   NULL
P_Image20:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData20
   dc.b   $0003,$0000
   dc.l   NULL
P_Gadget11:
   dc.l   P_Gadget12
   dc.w   86,56
   dc.w   26,10
   dc.w   GADGHIMAGE+GADGIMAGE
   dc.w   RELVERIFY
   dc.w   BOOLGADGET+REQGADGET
   dc.l   P_Image21
   dc.l   P_Image22
   dc.l   NULL
   dc.l   NULL
   dc.l   NULL
   dc.w   11
   dc.l   NULL
P_Image21:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData21
   dc.b   $0003,$0000
   dc.l   NULL
P_Image22:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData22
   dc.b   $0003,$0000
   dc.l   NULL
P_Gadget12:
   dc.l   P_Gadget13
   dc.w   118,56
   dc.w   26,10
   dc.w   GADGHIMAGE+GADGIMAGE
   dc.w   RELVERIFY
   dc.w   BOOLGADGET+REQGADGET
   dc.l   P_Image23
   dc.l   P_Image24
   dc.l   NULL
   dc.l   NULL
   dc.l   NULL
   dc.w   12
   dc.l   NULL
P_Image23:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData23
   dc.b   $0003,$0000
   dc.l   NULL
P_Image24:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData24
   dc.b   $0003,$0000
   dc.l   NULL
P_Gadget13:
   dc.l   P_Gadget14
   dc.w   22,70
   dc.w   26,10
   dc.w   GADGHIMAGE+GADGIMAGE
   dc.w   RELVERIFY
   dc.w   BOOLGADGET+REQGADGET
   dc.l   P_Image25
   dc.l   P_Image26
   dc.l   NULL
   dc.l   NULL
   dc.l   NULL
   dc.w   13
   dc.l   NULL
P_Image25:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData25
   dc.b   $0003,$0000
   dc.l   NULL
P_Image26:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData26
   dc.b   $0003,$0000
   dc.l   NULL
P_Gadget14:
   dc.l   P_Gadget15
   dc.w   54,70
   dc.w   26,10
   dc.w   GADGHIMAGE+GADGIMAGE
   dc.w   RELVERIFY
   dc.w   BOOLGADGET+REQGADGET
   dc.l   P_Image27
   dc.l   P_Image28
   dc.l   NULL
   dc.l   NULL
   dc.l   NULL
   dc.w   14
   dc.l   NULL
P_Image27:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData27
   dc.b   $0003,$0000
   dc.l   NULL
P_Image28:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData28
   dc.b   $0003,$0000
   dc.l   NULL
P_Gadget15:
   dc.l   P_Gadget16
   dc.w   86,70
   dc.w   26,10
   dc.w   GADGHIMAGE+GADGIMAGE
   dc.w   RELVERIFY
   dc.w   BOOLGADGET+REQGADGET
   dc.l   P_Image29
   dc.l   P_Image30
   dc.l   NULL
   dc.l   NULL
   dc.l   NULL
   dc.w   15
   dc.l   NULL
P_Image29:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData29
   dc.b   $0003,$0000
   dc.l   NULL
P_Image30:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData30
   dc.b   $0003,$0000
   dc.l   NULL
P_Gadget16:
   dc.l   P_Gadget17
   dc.w   118,70
   dc.w   26,10
   dc.w   GADGHIMAGE+GADGIMAGE
   dc.w   RELVERIFY
   dc.w   BOOLGADGET+REQGADGET
   dc.l   P_Image31
   dc.l   P_Image32
   dc.l   NULL
   dc.l   NULL
   dc.l   NULL
   dc.w   16
   dc.l   NULL
P_Image31:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData31
   dc.b   $0003,$0000
   dc.l   NULL
P_Image32:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData32
   dc.b   $0003,$0000
   dc.l   NULL
P_Gadget17:
   dc.l   P_Gadget18
   dc.w   182,28
   dc.w   28,12
   dc.w   GADGHIMAGE+GADGIMAGE
   dc.w   RELVERIFY+TOGGLESELECT
   dc.w   BOOLGADGET+REQGADGET
   dc.l   P_Image33
   dc.l   P_Image34
   dc.l   NULL
   dc.l   NULL
   dc.l   NULL
   dc.w   17
   dc.l   NULL
P_Image33:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData33
   dc.b   $0003,$0000
   dc.l   NULL
P_Image34:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData34
   dc.b   $0003,$0000
   dc.l   NULL
P_Gadget18:
   dc.l   P_Gadget19
   dc.w   214,28
   dc.w   28,12
   dc.w   GADGHIMAGE+GADGIMAGE
   dc.w   RELVERIFY+GADGIMMEDIATE
   dc.w   BOOLGADGET+REQGADGET
   dc.l   P_Image35
   dc.l   P_Image36
   dc.l   NULL
   dc.l   NULL
   dc.l   NULL
   dc.w   18
   dc.l   NULL
P_Image35:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData35
   dc.b   $0003,$0000
   dc.l   NULL
P_Image36:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData36
   dc.b   $0003,$0000
   dc.l   NULL
P_Gadget19:
   dc.l   P_Gadget20
   dc.w   246,28
   dc.w   28,12
   dc.w   GADGHIMAGE+GADGIMAGE
   dc.w   RELVERIFY+TOGGLESELECT
   dc.w   BOOLGADGET+REQGADGET
   dc.l   P_Image37
   dc.l   P_Image38
   dc.l   NULL
   dc.l   NULL
   dc.l   NULL
   dc.w   19
   dc.l   NULL
P_Image37:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData37
   dc.b   $0003,$0000
   dc.l   NULL
P_Image38:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData38
   dc.b   $0003,$0000
   dc.l   NULL
P_Gadget20:
   dc.l   P_Gadget21
   dc.w   278,28
   dc.w   28,12
   dc.w   GADGHIMAGE+GADGIMAGE
   dc.w   RELVERIFY
   dc.w   BOOLGADGET+REQGADGET
   dc.l   P_Image39
   dc.l   P_Image40
   dc.l   NULL
   dc.l   NULL
   dc.l   NULL
   dc.w   20
   dc.l   NULL
P_Image39:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData39
   dc.b   $0003,$0000
   dc.l   NULL
P_Image40:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData40
   dc.b   $0003,$0000
   dc.l   NULL
P_Gadget21:
   dc.l   P_Gadget22
   dc.w   342,28
   dc.w   26,10
   dc.w   GADGHIMAGE+GADGIMAGE
   dc.w   RELVERIFY
   dc.w   BOOLGADGET+REQGADGET
   dc.l   P_Image41
   dc.l   P_Image42
   dc.l   NULL
   dc.l   NULL
   dc.l   NULL
   dc.w   21
   dc.l   NULL
P_Image41:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData41
   dc.b   $0003,$0000
   dc.l   NULL
P_Image42:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData42
   dc.b   $0003,$0000
   dc.l   NULL
P_Gadget22:
   dc.l   P_Gadget23
   dc.w   374,28
   dc.w   26,10
   dc.w   GADGHIMAGE+GADGIMAGE
   dc.w   RELVERIFY
   dc.w   BOOLGADGET+REQGADGET
   dc.l   P_Image43
   dc.l   P_Image44
   dc.l   NULL
   dc.l   NULL
   dc.l   NULL
   dc.w   22
   dc.l   NULL
P_Image43:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData43
   dc.b   $0003,$0000
   dc.l   NULL
P_Image44:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData44
   dc.b   $0003,$0000
   dc.l   NULL
P_Gadget23:
   dc.l   P_Gadget24
   dc.w   406,28
   dc.w   26,10
   dc.w   GADGHIMAGE+GADGIMAGE
   dc.w   RELVERIFY
   dc.w   BOOLGADGET+REQGADGET
   dc.l   P_Image45
   dc.l   P_Image46
   dc.l   NULL
   dc.l   NULL
   dc.l   NULL
   dc.w   23
   dc.l   NULL
P_Image45:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData45
   dc.b   $0003,$0000
   dc.l   NULL
P_Image46:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData46
   dc.b   $0003,$0000
   dc.l   NULL
P_Gadget24:
   dc.l   P_Gadget25
   dc.w   438,28
   dc.w   26,10
   dc.w   GADGHIMAGE+GADGIMAGE
   dc.w   RELVERIFY
   dc.w   BOOLGADGET+REQGADGET
   dc.l   P_Image47
   dc.l   P_Image48
   dc.l   NULL
   dc.l   NULL
   dc.l   NULL
   dc.w   24
   dc.l   NULL
P_Image47:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData47
   dc.b   $0003,$0000
   dc.l   NULL
P_Image48:
   dc.w   0,0
   dc.w   28,12
   dc.w   2
   dc.l   P_ImageData48
   dc.b   $0003,$0000
   dc.l   NULL
P_Gadget25:
   dc.l   P_Gadget26
   dc.w   341,56
   dc.w   62,12
   dc.w   GADGHIMAGE+GADGIMAGE
   dc.w   RELVERIFY+TOGGLESELECT
   dc.w   BOOLGADGET+REQGADGET
   dc.l   P_Image49
   dc.l   P_Image50
   dc.l   NULL
   dc.l   NULL
   dc.l   NULL
   dc.w   25
   dc.l   NULL
P_Image49:
   dc.w   0,0
   dc.w   62,12
   dc.w   2
   dc.l   P_ImageData49
   dc.b   $0003,$0000
   dc.l   NULL
P_Image50:
   dc.w   0,0
   dc.w   62,12
   dc.w   2
   dc.l   P_ImageData50
   dc.b   $0003,$0000
   dc.l   NULL
P_Gadget26:
   dc.l   P_Gadget27
   dc.w   407,56
   dc.w   62,12
   dc.w   GADGHIMAGE+GADGIMAGE
   dc.w   RELVERIFY+TOGGLESELECT
   dc.w   BOOLGADGET+REQGADGET
   dc.l   P_Image51
   dc.l   P_Image52
   dc.l   NULL
   dc.l   NULL
   dc.l   NULL
   dc.w   26
   dc.l   NULL
P_Image51:
   dc.w   0,0
   dc.w   62,12
   dc.w   2
   dc.l   P_ImageData51
   dc.b   $0003,$0000
   dc.l Z_Image1
P_Image52:
   dc.w   0,0
   dc.w   62,12
   dc.w   2
   dc.l   P_ImageData52
   dc.b   $0003,$0000
   dc.l Z_Image1
P_Gadget27:
   dc.l   P_Gadget28
   dc.w   216,91
   dc.w   53,11
   dc.w   NULL
   dc.w   RELVERIFY
   dc.w   BOOLGADGET+REQGADGET
   dc.l   P_Border1
   dc.l   NULL
   dc.l   P_IText1
   dc.l   NULL
   dc.l   NULL
   dc.w   28
   dc.l   NULL
P_Border1:
   dc.w   -1,-1
   dc.b   3,0,RP_JAM1
   dc.b   5
   dc.l   P_BorderVectors1
   dc.l   NULL
P_BorderVectors1:
   dc.w   0,0
   dc.w   54,0
   dc.w   54,12
   dc.w   0,12
   dc.w   0,0
P_IText1:
   dc.b   1,0,RP_JAM2,0
   dc.w   11,2
   dc.l   NULL
   dc.l   P_ITextText1
   dc.l   NULL
P_ITextText1:
   dc.b   'EXIT',0
   cnop 0,2
P_Gadget28:
   dc.l   NULL
   dc.w   436,74
   dc.w   32,11
   dc.w   NULL
   dc.w   RELVERIFY+LONGINT
   dc.w   STRGADGET+REQGADGET
   dc.l   P_Border2
   dc.l   NULL
   dc.l   P_IText2
   dc.l   NULL
   dc.l   P_P_Gadget28SInfo
   dc.w   27
   dc.l   NULL
P_P_Gadget28SInfo:
   dc.l   P_P_Gadget28SIBuff
   dc.l   NULL
   dc.w   0
   dc.w   4
   dc.w   0
   dc.w   0,0,0,0,0
   dc.l   0
   dc.l 120
   dc.l   NULL
P_P_Gadget28SIBuff:
   dc.b   '120',0
   cnop 0,2
P_Border2:
   dc.w   -94,-3
   dc.b   1,0,RP_JAM1
   dc.b   5
   dc.l   P_BorderVectors2
   dc.l   NULL
P_BorderVectors2:
   dc.w   0,0
   dc.w   125,0
   dc.w   125,12
   dc.w   0,12
   dc.w   0,1
P_IText2:
   dc.b   3,0,RP_JAM2,0
   dc.w   -88,0
   dc.l   NULL
   dc.l   P_ITextText2
   dc.l   NULL
P_ITextText2:
   dc.b   'Maxtime/s:',0
   cnop 0,2
P_IntuiTextList1:
P_IText3:
   dc.b   3,0,RP_JAM2,0
   dc.w   22,17
   dc.l   NULL
   dc.l   P_ITextText3
   dc.l   P_IText4
P_ITextText3:
   dc.b   'Song-Selector',0
   cnop 0,2
P_IText4:
   dc.b   3,0,RP_JAM2,0
   dc.w   182,17
   dc.l   NULL
   dc.l   P_ITextText4
   dc.l   P_IText5
P_ITextText4:
   dc.b   'Function',0
   cnop 0,2
P_IText5:
   dc.b   3,0,RP_JAM2,0
   dc.w   342,17
   dc.l   NULL
   dc.l   P_ITextText5
   dc.l   P_IText6
P_ITextText5:
   dc.b   'Voices',0
   cnop 0,2
P_IText6:
   dc.b   3,0,RP_JAM2,0
   dc.w   181,45
   dc.l   NULL
   dc.l   P_ITextText6
   dc.l   P_IText7
P_ITextText6:
   dc.b   'Time Display',0
   cnop 0,2
P_IText7:
   dc.b   3,0,RP_JAM2,0
   dc.w   342,45
   dc.l   NULL
   dc.l   P_ITextText7
   dc.l   P_IText8
P_ITextText7:
   dc.b   'Specials',0
   cnop 0,2
P_IText8:
   dc.b   1,0,RP_JAM2,0
   dc.w   22,3
   dc.l   NULL
   dc.l   P_ITextText8
   dc.l   NULL
P_ITextText8:
   dc.b   'The SOUNDFACTORY MUSIC PLAYER',0
   cnop 0,2

   even
Record_Requester:         ;Record Part Requester
   dc.l   NULL
   dc.w   20,10
   dc.w   406,71
   dc.w   0,0
   dc.l   R_GadgetList1
   dc.l R_Border
   dc.l   R_IntuiTextList1
   dc.w   NULL
   dc.b   2,0
   dc.l   NULL
   dcb.b 32,0
   dc.l   NULL
   dc.l   NULL
   dcb.b 36,0
UNDOBUFFER:
   dcb.b 30,0
   cnop 0,2
R_Border:
     dc.w 0,0
     dc.b 3,3,0,5
     dc.l R_kord,0
R_kord:
     dc.w 0,0,405,0,405,70,0,70,0,0
R_GadgetList1:
R_Gadget1:
   dc.l   R_Gadget2
   dc.w   86,6
   dc.w   160,10
   dc.w   NULL
   dc.w   RELVERIFY
   dc.w   STRGADGET+REQGADGET
   dc.l   R_Border1
   dc.l   NULL
   dc.l   R_IText1
   dc.l   NULL
   dc.l   R_R_Gadget1SInfo
   dc.w   1
   dc.l   NULL
R_R_Gadget1SInfo:
   dc.l   R_R_Gadget1SIBuff
   dc.l   UNDOBUFFER
   dc.w   0
   dc.w   30
   dc.w   0
   dc.w   0,0,0,0,0
   dc.l   0
   dc.l   0
   dc.l   NULL
Record_name:               ;Name für Aufnahmespeicherung
     dc.b "Temp-SF:"
R_R_Gadget1SIBuff:
   dc.b   'Part1',0
PWstringlen   set   *-R_R_Gadget1SIBuff
   dcb.b 30-PWstringlen,0
   cnop 0,2
R_Border1:
   dc.w   -80,-2
   dc.b   3,0,RP_JAM1
   dc.b   5
   dc.l   R_BorderVectors1
   dc.l   NULL
R_BorderVectors1:
   dc.w   0,0
   dc.w   243,0
   dc.w   243,11
   dc.w   0,11
   dc.w   0,1
R_IText1:
   dc.b   2,1,RP_JAM1,0
   dc.w   -76,0
   dc.l   NULL
   dc.l   R_ITextText1
   dc.l   NULL
R_ITextText1:
   dc.b   'Filename:',0
   cnop 0,2
R_Gadget2:
   dc.l   R_Gadget3
   dc.w   350,6
   dc.w   48,10
   dc.w   NULL
   dc.w   RELVERIFY+LONGINT
   dc.w   STRGADGET+REQGADGET
   dc.l   R_Border2
   dc.l   NULL
   dc.l   R_IText2
   dc.l   NULL
   dc.l   R_R_Gadget2SInfo
   dc.w   2
   dc.l   NULL
R_R_Gadget2SInfo:
   dc.l   R_R_Gadget2SIBuff
   dc.l   UNDOBUFFER
   dc.w   0
   dc.w   6
   dc.w   0
   dc.w   0,0,0,0,0
   dc.l   0
   dc.l 5000                     ;R_R_Gadget2SInfo + 28
   dc.l   NULL
R_R_Gadget2SIBuff:
   dc.b   '5000',0
PWstringlen   set   *-R_R_Gadget2SIBuff
   dcb.b 6-PWstringlen,0
   cnop 0,2
R_Border2:
   dc.w   -94,-2
   dc.b   3,0,RP_JAM1
   dc.b   5
   dc.l   R_BorderVectors2
   dc.l   NULL
R_BorderVectors2:
   dc.w   0,0
   dc.w   143,0
   dc.w   143,11
   dc.w   0,11
   dc.w   0,1
R_IText2:
   dc.b   2,1,RP_JAM1,0
   dc.w   -90,0
   dc.l   NULL
   dc.l   R_ITextText2
   dc.l   NULL
R_ITextText2:
   dc.b   'Buffersize:',0
   cnop 0,2
R_Gadget3:
   dc.l   R_Gadget4
   dc.w   101,21
   dc.w   24,10
   dc.w   NULL
   dc.w   RELVERIFY+LONGINT
   dc.w   STRGADGET+REQGADGET
   dc.l   R_Border3
   dc.l   NULL
   dc.l   R_IText3
   dc.l   NULL
   dc.l   R_R_Gadget3SInfo
   dc.w   3
   dc.l   NULL
R_R_Gadget3SInfo:
   dc.l   R_R_Gadget3SIBuff
   dc.l   UNDOBUFFER
   dc.w   0
   dc.w   3
   dc.w   0
   dc.w   0,0,0,0,0
   dc.l   0
   dc.l 6
   dc.l   NULL
R_R_Gadget3SIBuff:
   dc.b   '6',0
PWstringlen   set   *-R_R_Gadget3SIBuff
   dcb.b 3-PWstringlen,0
   cnop 0,2
R_Border3:
   dc.w   -95,-2
   dc.b   3,0,RP_JAM1
   dc.b   5
   dc.l   R_BorderVectors3
   dc.l   NULL
R_BorderVectors3:
   dc.w   0,0
   dc.w   121,0
   dc.w   121,11
   dc.w   0,11
   dc.w   0,1
R_IText3:
   dc.b   2,1,RP_JAM1,0
   dc.w   -91,0
   dc.l   NULL
   dc.l   R_ITextText3
   dc.l   NULL
R_ITextText3:
   dc.b   'Quantizing:',0
   cnop 0,2
R_Gadget4:
   dc.l   R_Gadget5
   dc.w   135,20
   dc.w   264,10
   dc.w $80
   dc.w   RELVERIFY+TOGGLESELECT
   dc.w   BOOLGADGET+REQGADGET
   dc.l   R_Border4
   dc.l   NULL
   dc.l   R_IText4
   dc.l   NULL
   dc.l   NULL
   dc.w   4
   dc.l   NULL
R_Border4:
   dc.w   -1,-1
   dc.b   3,0,RP_JAM1
   dc.b   5
   dc.l   R_BorderVectors4
   dc.l   NULL
R_BorderVectors4:
   dc.w   0,0
   dc.w   265,0
   dc.w   265,11
   dc.w   0,11
   dc.w   0,0
R_IText4:
   dc.b   1,0,RP_JAM2,0
   dc.w   23,1
   dc.l   NULL
   dc.l   R_ITextText4
   dc.l   NULL
R_ITextText4:
   dc.b   'Record from first keystroke',0
   cnop 0,2
R_Gadget5:
   dc.l   R_Gadget6
   dc.w   7,35
   dc.w   120,10
   dc.w   NULL
   dc.w   RELVERIFY+TOGGLESELECT
   dc.w   BOOLGADGET+REQGADGET
   dc.l   R_Border5
   dc.l   NULL
   dc.l   R_IText5
   dc.l   NULL
   dc.l   NULL
   dc.w   5
   dc.l   NULL
R_Border5:
   dc.w   -1,-1
   dc.b   3,0,RP_JAM1
   dc.b   5
   dc.l   R_BorderVectors5
   dc.l   NULL
R_BorderVectors5:
   dc.w   0,0
   dc.w   121,0
   dc.w   121,11
   dc.w   0,11
   dc.w   0,0
R_IText5:
   dc.b   1,0,RP_JAM2,0
   dc.w   4,1
   dc.l   NULL
   dc.l   R_ITextText5
   dc.l   NULL
R_ITextText5:
   dc.b   'Backgroundsong',0
   cnop 0,2
R_Gadget6:
   dc.l   R_Gadget7
   dc.w   190,36
   dc.w   24,10
   dc.w   NULL
   dc.w   RELVERIFY+LONGINT
   dc.w   STRGADGET+REQGADGET
   dc.l   R_Border6
   dc.l   NULL
   dc.l   R_IText6
   dc.l   NULL
   dc.l   R_R_Gadget6SInfo
   dc.w   6
   dc.l   NULL
R_R_Gadget6SInfo:
   dc.l   R_R_Gadget6SIBuff
   dc.l   UNDOBUFFER
   dc.w   0
   dc.w   3
   dc.w   0
   dc.w   0,0,0,0,0
   dc.l   0
   dc.l 1
   dc.l   NULL
R_R_Gadget6SIBuff:
     dc.b "1",0,0
   cnop 0,2
R_Border6:
   dc.w   -48,-2
   dc.b   3,0,RP_JAM1
   dc.b   5
   dc.l   R_BorderVectors6
   dc.l   NULL
R_BorderVectors6:
   dc.w   0,0
   dc.w   74,0
   dc.w   74,11
   dc.w   0,11
   dc.w   0,1
R_IText6:
   dc.b   2,1,RP_JAM1,0
   dc.w   -44,0
   dc.l   NULL
   dc.l   R_ITextText6
   dc.l   NULL
R_ITextText6:
   dc.b   'Song#',0
   cnop 0,2
R_Gadget7:
   dc.l   R_Gadget8
   dc.w   285,35
   dc.w   22,10
   dc.w   NULL
   dc.w   RELVERIFY+TOGGLESELECT
   dc.w   BOOLGADGET+REQGADGET
   dc.l   R_Border7
   dc.l   NULL
   dc.l   R_IText7
   dc.l   NULL
   dc.l   NULL
   dc.w   7
   dc.l   NULL
R_Border7:
   dc.w   -1,-1
   dc.b   3,0,RP_JAM1
   dc.b   5
   dc.l   R_BorderVectors7
   dc.l   NULL
R_BorderVectors7:
   dc.w   0,0
   dc.w   23,0
   dc.w   23,11
   dc.w   0,11
   dc.w   0,0
R_IText7:
   dc.b   1,0,RP_JAM2,0
   dc.w   7,1
   dc.l   NULL
   dc.l   R_ITextText7
   dc.l   NULL
R_ITextText7:
   dc.b   '1',0
   cnop 0,2
R_Gadget8:
   dc.l   R_Gadget9
   dc.w   316,35
   dc.w   22,10
   dc.w   NULL
   dc.w   RELVERIFY+TOGGLESELECT
   dc.w   BOOLGADGET+REQGADGET
   dc.l   R_Border8
   dc.l   NULL
   dc.l   R_IText8
   dc.l   NULL
   dc.l   NULL
   dc.w   8
   dc.l   NULL
R_Border8:
   dc.w   -1,-1
   dc.b   3,0,RP_JAM1
   dc.b   5
   dc.l   R_BorderVectors8
   dc.l   NULL
R_BorderVectors8:
   dc.w   0,0
   dc.w   23,0
   dc.w   23,11
   dc.w   0,11
   dc.w   0,0
R_IText8:
   dc.b   1,0,RP_JAM2,0
   dc.w   7,1
   dc.l   NULL
   dc.l   R_ITextText8
   dc.l   NULL
R_ITextText8:
   dc.b   '2',0
   cnop 0,2
R_Gadget9:
   dc.l   R_Gadget10
   dc.w   347,35
   dc.w   22,10
   dc.w   NULL
   dc.w   RELVERIFY+TOGGLESELECT
   dc.w   BOOLGADGET+REQGADGET
   dc.l   R_Border9
   dc.l   NULL
   dc.l   R_IText9
   dc.l   NULL
   dc.l   NULL
   dc.w   9
   dc.l   NULL
R_Border9:
   dc.w   -1,-1
   dc.b   3,0,RP_JAM1
   dc.b   5
   dc.l   R_BorderVectors9
   dc.l   NULL
R_BorderVectors9:
   dc.w   0,0
   dc.w   23,0
   dc.w   23,11
   dc.w   0,11
   dc.w   0,0
R_IText9:
   dc.b   1,0,RP_JAM2,0
   dc.w   7,1
   dc.l   NULL
   dc.l   R_ITextText9
   dc.l   NULL
R_ITextText9:
   dc.b   '3',0
   cnop 0,2
R_Gadget10:
   dc.l   R_Gadget11
   dc.w   377,35
   dc.w   22,10
   dc.w   NULL
   dc.w   RELVERIFY+TOGGLESELECT
   dc.w   BOOLGADGET+REQGADGET
   dc.l   R_Border10
   dc.l   NULL
   dc.l   R_IText10
   dc.l   NULL
   dc.l   NULL
   dc.w   10
   dc.l   NULL
R_Border10:
   dc.w   -1,-1
   dc.b   3,0,RP_JAM1
   dc.b   5
   dc.l   R_BorderVectors10
   dc.l   NULL
R_BorderVectors10:
   dc.w   0,0
   dc.w   23,0
   dc.w   23,11
   dc.w   0,11
   dc.w   0,0
R_IText10:
   dc.b   1,0,RP_JAM2,0
   dc.w   7,1
   dc.l   NULL
   dc.l   R_ITextText10
   dc.l   NULL
R_ITextText10:
   dc.b   '4',0
   cnop 0,2
R_Gadget11:
   dc.l   R_Gadget12
   dc.w   7,55
   dc.w   78,11
   dc.w   NULL
   dc.w   RELVERIFY
   dc.w   BOOLGADGET+REQGADGET
   dc.l   R_Border11
   dc.l   NULL
   dc.l   R_IText11
   dc.l   NULL
   dc.l   NULL
   dc.w   11
   dc.l   NULL
R_Border11:
   dc.w   -1,-1
   dc.b   3,0,RP_JAM1
   dc.b   5
   dc.l   R_BorderVectors11
   dc.l   NULL
R_BorderVectors11:
   dc.w   0,0
   dc.w   79,0
   dc.w   79,12
   dc.w   0,12
   dc.w   0,0
R_IText11:
   dc.b   1,0,RP_JAM2,0
   dc.w   22,2
   dc.l   NULL
   dc.l   R_ITextText11
   dc.l   NULL
R_ITextText11:
   dc.b   'Play',0
   cnop 0,2
R_Gadget12:
   dc.l   R_Gadget13
   dc.w   321,55
   dc.w   78,11
   dc.w   NULL
   dc.w   RELVERIFY
   dc.w   BOOLGADGET+REQGADGET
   dc.l   R_Border12
   dc.l   NULL
   dc.l   R_IText12
   dc.l   NULL
   dc.l   NULL
   dc.w   14
   dc.l   NULL
R_Border12:
   dc.w   -1,-1
   dc.b   3,0,RP_JAM1
   dc.b   5
   dc.l   R_BorderVectors12
   dc.l   NULL
R_BorderVectors12:
   dc.w   0,0
   dc.w   79,0
   dc.w   79,12
   dc.w   0,12
   dc.w   0,0
R_IText12:
   dc.b   1,0,RP_JAM2,0
   dc.w   15,2
   dc.l   NULL
   dc.l   R_ITextText12
   dc.l   NULL
R_ITextText12:
   dc.b   'RETURN',0
   cnop 0,2
R_Gadget13:
   dc.l   R_Gadget14
   dc.w   112,55
   dc.w   78,11
   dc.w   NULL
   dc.w   RELVERIFY
   dc.w   BOOLGADGET+REQGADGET
   dc.l   R_Border13
   dc.l   NULL
   dc.l   R_IText13
   dc.l   NULL
   dc.l   NULL
   dc.w   12
   dc.l   NULL
R_Border13:
   dc.w   -1,-1
   dc.b   3,0,RP_JAM1
   dc.b   5
   dc.l   R_BorderVectors13
   dc.l   NULL
R_BorderVectors13:
   dc.w   0,0
   dc.w   79,0
   dc.w   79,12
   dc.w   0,12
   dc.w   0,0
R_IText13:
   dc.b   1,0,RP_JAM2,0
   dc.w   15,2
   dc.l   NULL
   dc.l   R_ITextText13
   dc.l   NULL
R_ITextText13:
   dc.b   'Record',0
   cnop 0,2
R_Gadget14:
   dc.l   NULL
   dc.w   216,55
   dc.w   78,11
   dc.w   NULL
   dc.w   RELVERIFY
   dc.w   BOOLGADGET+REQGADGET
   dc.l   R_Border14
   dc.l   NULL
   dc.l   R_IText14
   dc.l   NULL
   dc.l   NULL
   dc.w   13
   dc.l   NULL
R_Border14:
   dc.w   -1,-1
   dc.b   3,0,RP_JAM1
   dc.b   5
   dc.l   R_BorderVectors14
   dc.l   NULL
R_BorderVectors14:
   dc.w   0,0
   dc.w   79,0
   dc.w   79,12
   dc.w   0,12
   dc.w   0,0
R_IText14:
   dc.b   1,0,RP_JAM2,0
   dc.w   15,2
   dc.l   NULL
   dc.l   R_ITextText14
   dc.l   NULL
R_ITextText14:
   dc.b   'Replay',0
   cnop 0,2
R_IntuiTextList1:
R_IText15:
   dc.b   3,0,RP_JAM2,0
   dc.w   228,36
   dc.l   NULL
   dc.l   R_ITextText15
   dc.l   NULL
R_ITextText15:
   dc.b   'Voices',0
   cnop 0,2

LOAD_Status:              ;LOAD-Status Requester
   dc.l   NULL
   dc.w   75,85
   dc.w   295,67
   dc.w   0,0
   dc.l   LS_Gadget1
   dc.l LS_Border
   dc.l   LS_IntuiTextList1
   dc.w   NULL
   dc.b   2,0
   dc.l   NULL
   dcb.b 32,0
   dc.l   NULL
   dc.l   NULL
   dcb.b 36,0
LS_Border:
     dc.w 0,0
     dc.b 3,3,0,5
     dc.l LS_kord,0
LS_kord:
     dc.w 0,0,294,0,294,66,0,66,0,0
LS_Gadget1:
   dc.l   NULL
   dc.w   237,50
   dc.w   47,11
   dc.w   NULL
   dc.w   RELVERIFY+ENDGADGET
   dc.w   BOOLGADGET+REQGADGET
   dc.l   LS_Border1
   dc.l   NULL
   dc.l   LS_IText1
   dc.l   NULL
   dc.l   NULL
   dc.w   NULL
   dc.l   NULL
LS_Border1:
   dc.w   -1,-1
   dc.b   3,0,RP_JAM1
   dc.b   5
   dc.l   LS_BorderVectors1
   dc.l   NULL
LS_BorderVectors1:
   dc.w   0,0
   dc.w   48,0
   dc.w   48,12
   dc.w   0,12
   dc.w   0,0
LS_IText1:
   dc.b   1,0,RP_JAM2,0
   dc.w   14,2
   dc.l   NULL
   dc.l   LS_ITextText1
   dc.l   NULL
LS_ITextText1:
   dc.b   'Ok!',0
   cnop 0,2
LS_IntuiTextList1:
LS_IText2:
   dc.b   1,0,RP_JAM2,0
   dc.w   7,3
   dc.l   NULL
   dc.l   LS_ITextText2
   dc.l   LS_IText3
LS_ITextText2:
   dc.b   'LOAD Status',0
   cnop 0,2
LS_IText3:
   dc.b   1,0,RP_JAM2,0
   dc.w   7,18
   dc.l   NULL
   dc.l   LS_ITextText3
   dc.l   LS_IText4
LS_ITextText3:
   dc.b   'SOURCE:',0
   cnop 0,2
LS_IText4:
   dc.b   3,0,RP_JAM2,0
   dc.w   71,18
   dc.l   NULL
   dc.l   LS_ITextText4
   dc.l   LS_IText5
LS_ITextText4:
   dc.b   'loaded',0
   cnop 0,2
LS_IText5:
   dc.b   1,0,RP_JAM2,0
   dc.w   144,18
   dc.l   NULL
   dc.l   LS_ITextText5
   dc.l   LS_IText6
LS_ITextText5:
   dc.b   'SIZE:',0
   cnop 0,2
LS_IText6:
   dc.b   3,0,RP_JAM2,0
   dc.w   190,18
   dc.l   NULL
   dc.l   LS_ITextText6
   dc.l   LS_IText7
LS_ITextText6:
   dc.b   '000000 Bytes',0
   cnop 0,2
LS_IText7:
   dc.b   1,0,RP_JAM2,0
   dc.w   7,28
   dc.l   NULL
   dc.l   LS_ITextText7
   dc.l   LS_IText8
LS_ITextText7:
   dc.b   'OBJECT:',0
   cnop 0,2
LS_IText8:
   dc.b   3,0,RP_JAM2,0
   dc.w   71,28
   dc.l   NULL
   dc.l   LS_ITextText8
   dc.l   LS_IText9
LS_ITextText8:
   dc.b   'loaded',0
   cnop 0,2
LS_IText9:
   dc.b   1,0,RP_JAM2,0
   dc.w   144,28
   dc.l   NULL
   dc.l   LS_ITextText9
   dc.l   LS_IText10
LS_ITextText9:
   dc.b   'SIZE:',0
   cnop 0,2
LS_IText10:
   dc.b   3,0,RP_JAM2,0
   dc.w   190,28
   dc.l   NULL
   dc.l   LS_ITextText10
   dc.l   LS_IText11
LS_ITextText10:
   dc.b   '000000 Bytes',0
   cnop 0,2
LS_IText11:
   dc.b   1,0,RP_JAM2,0
   dc.w   7,38
   dc.l   NULL
   dc.l   LS_ITextText11
   dc.l   LS_IText12
LS_ITextText11:
   dc.b   'EXE   :',0
   cnop 0,2
LS_IText12:
   dc.b   3,0,RP_JAM2,0
   dc.w   71,38
   dc.l   NULL
   dc.l   LS_ITextText12
   dc.l   LS_IText13
LS_ITextText12:
   dc.b   'loaded',0
   cnop 0,2
LS_IText13:
   dc.b   1,0,RP_JAM2,0
   dc.w   144,38
   dc.l   NULL
   dc.l   LS_ITextText13
   dc.l   LS_IText14
LS_ITextText13:
   dc.b   'SIZE:',0
   cnop 0,2
LS_IText14:
   dc.b   3,0,RP_JAM2,0
   dc.w   190,38
   dc.l   NULL
   dc.l   LS_ITextText14
   dc.l   NULL
LS_ITextText14:
   dc.b   '000000 Bytes',0
   cnop 0,2

Type_Requester:               ;LOAD/SAVE-Typ Requester
   dc.l   NULL
   dc.w   20,20
   dc.w   150,90
   dc.w   0,0
   dc.l   LT_GadgetList1
   dc.l LT_Border
   dc.l   LT_IntuiTextList1
   dc.w   NULL
   dc.b   2,0
   dc.l   NULL
   dcb.b 32,0
   dc.l   NULL
   dc.l   NULL
   dcb.b 36,0
LT_Border:
     dc.w 0,0
     dc.b 3,3,0,5
     dc.l LT_kord,0
LT_kord:
     dc.w 0,0,149,0,149,89,0,89,0,0
   even
LT_GadgetList1:
LT_LT1:
   dc.l   LT_LT2
   dc.w   13,28
   dc.w   57,12
   dc.w   NULL
   dc.w   RELVERIFY+TOGGLESELECT
   dc.w   BOOLGADGET+REQGADGET
   dc.l   LT_Border1
   dc.l   NULL
   dc.l   LT_IText1
   dc.l   NULL
   dc.l   NULL
   dc.w   1
   dc.l   NULL
LT_Border1:
   dc.w   -1,-1
   dc.b   3,0,RP_JAM1
   dc.b   5
   dc.l   LT_BorderVectors1
   dc.l   NULL
LT_BorderVectors1:
   dc.w   0,0
   dc.w   58,0
   dc.w   58,13
   dc.w   0,13
   dc.w   0,0
LT_IText1:
   dc.b   3,0,RP_JAM2,0
   dc.w   5,2
   dc.l   NULL
   dc.l   LT_ITextText1
   dc.l   NULL
LT_ITextText1:
   dc.b   'Source',0
   cnop 0,2
LT_LT2:
   dc.l   LT_LT3
   dc.w   80,28
   dc.w   57,12
   dc.w   NULL
   dc.w   RELVERIFY+TOGGLESELECT
   dc.w   BOOLGADGET+REQGADGET
   dc.l   LT_Border2
   dc.l   NULL
   dc.l   LT_IText2
   dc.l   NULL
   dc.l   NULL
   dc.w   2
   dc.l   NULL
LT_Border2:
   dc.w   -1,-1
   dc.b   3,0,RP_JAM1
   dc.b   5
   dc.l   LT_BorderVectors2
   dc.l   NULL
LT_BorderVectors2:
   dc.w   0,0
   dc.w   58,0
   dc.w   58,13
   dc.w   0,13
   dc.w   0,0
LT_IText2:
   dc.b   3,0,RP_JAM2,0
   dc.w   4,2
   dc.l   NULL
   dc.l   LT_ITextText2
   dc.l   NULL
LT_ITextText2:
   dc.b   'Object',0
   cnop 0,2
LT_LT3:
   dc.l   LT_LT4
   dc.w   13,45
   dc.w   57,12
   dc.w   NULL
   dc.w   RELVERIFY+TOGGLESELECT
   dc.w   BOOLGADGET+REQGADGET
   dc.l   LT_Border3
   dc.l   NULL
   dc.l   LT_IText3
   dc.l   NULL
   dc.l   NULL
   dc.w   3
   dc.l   NULL
LT_Border3:
   dc.w   -1,-1
   dc.b   3,0,RP_JAM1
   dc.b   5
   dc.l   LT_BorderVectors3
   dc.l   NULL
LT_BorderVectors3:
   dc.w   0,0
   dc.w   58,0
   dc.w   58,13
   dc.w   0,13
   dc.w   0,0
LT_IText3:
   dc.b   3,0,RP_JAM2,0
   dc.w   10,2
   dc.l   NULL
   dc.l   LT_ITextText3
   dc.l   NULL
LT_ITextText3:
   dc.b   'Exec.',0
   cnop 0,2
LT_LT4:
   dc.l   LT_LT5
   dc.w   79,45
   dc.w   57,12
   dc.w   NULL
   dc.w   RELVERIFY+GADGIMMEDIATE
   dc.w   BOOLGADGET+REQGADGET
   dc.l   LT_Border4
   dc.l   NULL
   dc.l   LT_IText4
   dc.l   NULL
   dc.l   NULL
   dc.w   4
   dc.l   NULL
LT_Border4:
   dc.w   -1,-1
   dc.b   3,0,RP_JAM1
   dc.b   5
   dc.l   LT_BorderVectors4
   dc.l   NULL
LT_BorderVectors4:
   dc.w   0,0
   dc.w   58,0
   dc.w   58,13
   dc.w   0,13
   dc.w   0,0
LT_IText4:
   dc.b   3,0,RP_JAM2,0
   dc.w   16,2
   dc.l   NULL
   dc.l   LT_ITextText4
   dc.l   NULL
LT_ITextText4:
   dc.b   'All',0
   cnop 0,2
LT_LT5:
   dc.l   LT_LT6
   dc.w   13,72
   dc.w   57,12
   dc.w   NULL
   dc.w   RELVERIFY  ;+ENDGADGET
   dc.w   BOOLGADGET+REQGADGET
   dc.l   LT_Border5
   dc.l   NULL
   dc.l   LT_IText5
   dc.l   NULL
   dc.l   NULL
   dc.w   5
   dc.l   NULL
LT_Border5:
   dc.w   -1,-1
   dc.b   3,0,RP_JAM1
   dc.b   5
   dc.l   LT_BorderVectors5
   dc.l   NULL
LT_BorderVectors5:
   dc.w   0,0
   dc.w   58,0
   dc.w   58,13
   dc.w   0,13
   dc.w   0,0
LT_IText5:
   dc.b   1,0,RP_JAM2,0
   dc.w   13,2
   dc.l   NULL
   dc.l   LT_ITextText5
   dc.l   NULL
LT_ITextText5:
   dc.b   'LOAD',0
   cnop 0,2
LT_LT6:
   dc.l   NULL
   dc.w   79,72
   dc.w   57,12
   dc.w   NULL
   dc.w   RELVERIFY+ENDGADGET
   dc.w   BOOLGADGET+REQGADGET
   dc.l   LT_Border6
   dc.l   NULL
   dc.l   LT_IText6
   dc.l   NULL
   dc.l   NULL
   dc.w   6
   dc.l   NULL
LT_Border6:
   dc.w   -1,-1
   dc.b   3,0,RP_JAM1
   dc.b   5
   dc.l   LT_BorderVectors6
   dc.l   NULL
LT_BorderVectors6:
   dc.w   0,0
   dc.w   58,0
   dc.w   58,13
   dc.w   0,13
   dc.w   0,0
LT_IText6:
   dc.b   1,0,RP_JAM2,0
   dc.w   5,2
   dc.l   NULL
   dc.l   LT_ITextText6
   dc.l   NULL
LT_ITextText6:
   dc.b   'CANCEL',0
   cnop 0,2
LT_IntuiTextList1:
LT_IText7:
   dc.b   1,0,RP_JAM2,0
   dc.w   11,5
   dc.l   NULL
   dc.l   LT_ITextText7
   dc.l   NULL
LT_ITextText7:
   dc.b   'LOAD what?',0
   cnop 0,2


;Requesterstruktur für Aufruf des Editors

     even
Ed_Requester:
   dc.l   NULL
   dc.w   1,189
   dc.w   640,56
   dc.w   0,0
   dc.l   NULL
   dc.l Ed_Border
   dc.l   ItuiTextList1
   dc.w   NULL
   dc.b   2,0
   dc.l   NULL
   dcb.b 32,0
   dc.l   NULL
   dc.l   NULL
   dcb.b 36,0
     even
Ed_Border:
     dc.w 0,0
     dc.b 3,3,0,5
     dc.l Ed_kord,0
Ed_kord:
     dc.w 0,0,639,0,639,55,0,55,0,0
   even
ItuiTextList1:
InText1:
   dc.b   3,0,RP_JAM2,0
   dc.w   7,4
   dc.l   NULL
   dc.l   InTextText1
   dc.l   InText2
InTextText1:
   dc.b   '[Esc] [x] Quit & get changes',0
   cnop 0,2
InText2:
   dc.b   3,0,RP_JAM2,0
   dc.w   7,13
   dc.l   NULL
   dc.l   InTextText2
   dc.l   InText3
InTextText2:
   dc.b   '[Esc] [q] Quit & forget changes',0
   cnop 0,2
InText3:
   dc.b   3,0,RP_JAM2,0
   dc.w   7,22
   dc.l   NULL
   dc.l   InTextText3
   dc.l   InText4
InTextText3:
   dc.b   '[CTRL]-[B] Delete line',0
   cnop 0,2
InText4:
   dc.b   3,0,RP_JAM2,0
   dc.w   7,31
   dc.l   NULL
   dc.l   InTextText4
   dc.l   InText5
InTextText4:
   dc.b   '[Esc] [t] Top of file',0
   cnop 0,2
InText5:
   dc.b   3,0,RP_JAM2,0
   dc.w   7,40
   dc.l   NULL
   dc.l   InTextText5
   dc.l   InText6
InTextText5:
   dc.b   '[Esc] [b] End of file',0
   cnop 0,2
InText6:
   dc.b   3,0,RP_JAM2,0
   dc.w   257,4
   dc.l   NULL
   dc.l   InTextText6
   dc.l   InText7
InTextText6:
   dc.b   '[Esc] [m]n Go to line n',0
   cnop 0,2
InText7:
   dc.b   3,0,RP_JAM2,0
   dc.w   257,13
   dc.l   NULL
   dc.l   InTextText7
   dc.l   InText8
InTextText7:
   dc.b   '[Esc] [b] [s] Block start',0
   cnop 0,2
InText8:
   dc.b   3,0,RP_JAM2,0
   dc.w   257,22
   dc.l   NULL
   dc.l   InTextText8
   dc.l   InText9
InTextText8:
   dc.b   '[Esc] [b] [e] Block end',0
   cnop 0,2
InText9:
   dc.b   3,0,RP_JAM2,0
   dc.w   257,31
   dc.l   NULL
   dc.l   InTextText9
   dc.l   InText10
InTextText9:
   dc.b   '[Esc] [i] [b] Insert block',0
   cnop 0,2
InText10:
   dc.b   3,0,RP_JAM2,0
   dc.w   257,40
   dc.l   NULL
   dc.l   InTextText10
   dc.l   InText11
InTextText10:
   dc.b   '[Esc] [d] [b] Delete block',0
   cnop 0,2
InText11:
   dc.b   1,0,RP_JAM2,0
   dc.w   484,4
   dc.l   NULL
   dc.l   InTextText11
   dc.l   InText12
InTextText11:
   dc.b   'Read the Ed-manual',0
   cnop 0,2
InText12:
   dc.b   1,0,RP_JAM2,0
   dc.w   484,13
   dc.l   NULL
   dc.l   InTextText12
   dc.l   InText13
InTextText12:
   dc.b   'to get further',0
   cnop 0,2
InText13:
   dc.b   1,0,RP_JAM2,0
   dc.w   484,22
   dc.l   NULL
   dc.l   InTextText13
   dc.l   NULL
InTextText13:
   dc.b   'instructions!',0
   cnop 0,2

   even
IFF_Requester:
     dc.l 0             ;Zeiger auf alte Requester
     dc.w 100,70        ;X,Y-Position
     dc.w 216,60        ;Breite, Höhe
     dc.w 0,0           ;relative Positionen
     dc.l IFF_Gadg1     ;Zeiger auf Requester-Gadgets
     dc.l IFF_Border    ;Zeiger auf Requester-Rahmen
     dc.l IFF_Txt       ;Zeiger auf Requester-Text
     dc.w 0             ;Flags
     dc.b 2,0           ;Hintergrundfarbe
     dc.l 0             ;Zeiger auf Layer
     ds.b 32
     dc.l 0             ;Zeiger auf eigene Bitmap
     dc.l 0             ;Zeiger auf Window
     ds.b 36
   even
IFF_Border:
     dc.w 0,0
     dc.b 3,3,0,5
     dc.l IFF_kord,0
IFF_kord:
     dc.w 0,0,215,0,215,59,0,59,0,0
   even
IFF_Gadg1:              ;Oktave
     dc.l IFF_Gadg2
     dc.w 116,22,24,10,$00,$804,4
     dc.l IFF_bord1,0,0,0,IFF_sinfo1
     dc.w 1
     dc.l 0
IFF_sinfo1:
     dc.l IFF_strpuff1,IFF_un1
     dc.w 0,2,0,0,0,0,0,0
     dc.l 0,1,0
IFF_strpuff1:
     dc.b "1  ",0
     dc.l 0,0,0
IFF_un1:
     dc.l 0,0,0,0
IFF_bord1:
     dc.w 0,0
     dc.b 3,3,0,5
     dc.l IFF_kor1,0
IFF_kor1:
     dc.w -3,-2,24+2,-2,24+2,9,-3,9,-3,-2

   even
IFF_Gadg2:                 ;Ok! (Boolean-Gadget)
     dc.l 0
     dc.w 176,42,28,11,0,7,1
     dc.l IFF_bord2,0,IFF_tex2,0,0
     dc.w 2
     dc.l 0
IFF_tex2:
     dc.b 1,0,0,0
     dc.w 3,2
     dc.l 0,IFF_stex2,0
IFF_stex2:
     dc.b "OK!",0
   even
IFF_bord2:
     dc.w 0,0
     dc.b 3,3,0,5
     dc.l IFF_kor2,0
IFF_kor2:
     dc.w -1,-1,28,-1,28,11,-1,11,-1,-1

   even
IFF_Txt:
     dc.b 1,3,1,0
     dc.w 1,1
     dc.l 0,IFFTxt,IFF_Txt2
IFFTxt:
     dc.b "LOAD-IFF                   ",0
   even
IFF_Txt2:
     dc.b 1,2,1,0
     dc.w 8,12
     dc.l 0,IFFTxt2,IFF_Txt3
IFFTxt2:
     dc.b "Instrument has x Octaves,",0
   even
IFF_Txt3:
     dc.b 1,2,1,0
     dc.w 8,22
     dc.l 0,IFFTxt3,0
IFFTxt3:
     dc.b "load Octave #",0

   even
Phasing_Requester:
     dc.l 0             ;Zeiger auf alte Requester
     dc.w 100,70        ;X,Y-Position
     dc.w 176,36        ;Breite, Höhe
     dc.w 0,0           ;relative Positionen
     dc.l 0             ;Zeiger auf Requester-Gadgets
     dc.l Phasing_Border  ;Zeiger auf Requester-Rahmen
     dc.l Phasing_Txt   ;Zeiger auf Requester-Text
     dc.w 0             ;Flags
     dc.b 2,0           ;Hintergrundfarbe
     dc.l 0             ;Zeiger auf Layer
     ds.b 32
     dc.l 0             ;Zeiger auf eigene Bitmap
     dc.l 0             ;Zeiger auf Window
     ds.b 36
   even
Phasing_Border:
     dc.w 0,0
     dc.b 3,3,0,5
     dc.l Phasing_kord,0
Phasing_kord:
     dc.w 0,0,175,0,175,35,0,35,0,0
   even
Phasing_Txt:
     dc.b 1,3,1,0
     dc.w 1,1
     dc.l 0,PhasingTxt_a,Phasing_Txt2
PhasingTxt_a:
     dc.b "MARK PHASING START      ",0
   even
PhasingTxt_b:
     dc.b "MARK PHASING END        ",0
   even
Phasing_Txt2:
     dc.b 1,2,1,0
     dc.w 8,12
     dc.l 0,PhasingTxt2,Phasing_Txt3
PhasingTxt2:
     dc.b "Click inside sample-",0
   even
Phasing_Txt3:
     dc.b 1,2,1,0
     dc.w 8,22
     dc.l 0,PhasingTxt3,0
PhasingTxt3:
     dc.b "window to set mark.",0

   even
FreeHand_Requester:
     dc.l 0             ;Zeiger auf alte Requester
     dc.w 100,70        ;X,Y-Position
     dc.w 216,60        ;Breite, Höhe
     dc.w 0,0           ;relative Positionen
     dc.l 0             ;Zeiger auf Requester-Gadgets
     dc.l FreeHand_Border  ;Zeiger auf Requester-Rahmen
     dc.l FreeHand_Txt  ;Zeiger auf Requester-Text
     dc.w 0             ;Flags
     dc.b 2,0           ;Hintergrundfarbe
     dc.l 0             ;Zeiger auf Layer
     ds.b 32
     dc.l 0             ;Zeiger auf eigene Bitmap
     dc.l 0             ;Zeiger auf Window
     ds.b 36
   even
FreeHand_Border:
     dc.w 0,0
     dc.b 3,3,0,5
     dc.l FreeHand_kord,0
FreeHand_kord:
     dc.w 0,0,215,0,215,59,0,59,0,0
   even
FreeHand_Txt:
     dc.b 1,3,1,0
     dc.w 1,1
     dc.l 0,FreeHandTxt,FreeHand_Txt2
FreeHandTxt:
     dc.b "WAVEFORM-FREEHAND-DRAW      ",0
   even
FreeHand_Txt2:
     dc.b 1,2,1,0
     dc.w 8,12
     dc.l 0,FreeHandTxt2,FreeHand_Txt3
FreeHandTxt2:
     dc.b "Draw inside samplewindow",0
   even
FreeHand_Txt3:
     dc.b 1,2,1,0
     dc.w 8,22
     dc.l 0,FreeHandTxt3,FreeHand_Txt4
FreeHandTxt3:
     dc.b "to change waveform.",0
   even
FreeHand_Txt4:
     dc.b 1,2,1,0
     dc.w 8,32
     dc.l 0,FreeHandTxt4,FreeHand_Txt5
FreeHandTxt4:
     dc.b "Right mousebutton ends",0
   even
FreeHand_Txt5:
     dc.b 1,2,1,0
     dc.w 8,42
     dc.l 0,FreeHandTxt5,0
FreeHandTxt5:
     dc.b "drawing!",0

   even
Play_Text:
     dc.b 3,0,0,0
     dc.w 32,92
     dc.l 0,PText1,Play_Text2
PText1:
     dc.b "F1 - Octave down",0
   even
Play_Text2:
     dc.b 3,0,0,0
     dc.w 300,92
     dc.l 0,PText2,0
PText2:
     dc.b "F2 - Octave up",0

   even
btext:
     dc.b 0,1,0,0
     dc.w 10,6
     dc.l 0,btex1a,btext2
btext2:
     dc.b 0,1,0,0
     dc.w 10,16
     dc.l 0,btex1b,0
btex1a:
     dc.b "File is not a",0
   even
btex1aa:
     dc.b "File is not an",0
   even
btex1b:
     dc.b "Soundfactory-Instrument",0
   even
btex1c:
     dc.b "IFF-File",0
   even
btex1d:
     dc.b "8SVX-Instrument",0
   even
btex2a:
     dc.b "Cannot Find",0
   even
btex2b:
     dc.b "IRQ_Music.Code",0
   even
btex3a:
     dc.b "Sorry, I have trouble",0
   even
btex3b:
     dc.b "with IRQ_Music.Code",0
   even
btex3c:
     dc.b "with IFF-Instrument",0
   even
btex4a:
     dc.b "There's already a Music",0
   even
btex4b:
     dc.b "playing. Stop it first!",0
   even
btex5a:
     dc.b "Sorry, I cannot handle",0
   even
btex5b:
     dc.b "compressed Soundfiles!",0
   even
btex6a:
     dc.b "Sorry, IFF-Chunks are",0
   even
btex6b:
     dc.b "not in correct order!",0
   even
btex7a:
     dc.b "Sorry, there is no",0
   even
btex7b:
     dc.b "SOURCE-file to check !",0
   even
btex8a:
     dc.b "Error in sourcefile;",0
   even
btex8b:
     dc.b "cannot continue saving !",0
   even
btex8c:
     dc.b "cannot continue !",0
   even
btex9a:
     dc.b "There was a linker error;",0
   even
btex10a:
     dc.b "Cannot save executable",0
   even
btex10b:
     dc.b "file !",0
   even
btex11a:
     dc.b "Hey, you MUST keep one",0
   even
btex11b:
     dc.b "voice for freehand-play !",0
   even
btex12a:
     dc.b "Not enough memory for",0
   even
btex12b:
     dc.b "recording-buffer !",0
   even
btex13a:
     dc.b "Recording-buffer is full!",0
   even
btex13b:
     dc.b " ",0
   even
btex14a:
     dc.b "Not enough memory !",0
   even
btex14b:
     dc.b " ",0
   even
rtext:
     dc.b 0,1,0,0
     dc.w 5,3
     dc.l 0,rtex,0
rtex:
     dc.b "OK!",0
   even
ltext:
     dc.b 0,1,0,0
     dc.w 5,3
     dc.l 0,ltex,0
ltex:
     dc.b "CANCEL",0
   even
ctext:
     dc.b 0,1,0,0
     dc.w 10,6
     dc.l 0,ctex1a,ctext2
ctext2:
     dc.b 0,1,0,0
     dc.w 10,16
     dc.l 0,ctex1b,0
ctex1a:
     dc.b "Overwrite old project ?",0
   even
ctex1b:
     dc.b " ",0
   even
ctex2a:
     dc.b "Sure you want to quit ?",0
   even
ctex2b:
     dc.b " ",0
   even
ctex3a:
     dc.b "Sure you want to discard",0
   even
ctex3b:
     dc.b "changes ?",0
   even
ctex4a:
     dc.b "Sure you want to drop",0
   even
ctex4b:
     dc.b "the Object & Exe files ?",0
   even
ctex5a:
     dc.b "Cannot save sourcefile !",0
   even
ctex5b:
     dc.b "Continue ?",0
   even
ctex6a:
     dc.b "Cannot save objectfile !",0
   even
ctex7b:
     dc.b "continue anyway ?",0
   even
ctex8a:
     dc.b "Save recorded part to",0
   even
ctex8b:
     dc.b "Temp-SF: ?",0
   even
ctex9a:
     dc.b "Cannot save part; return",0
   even
ctex9b:
     dc.b "anyway ?",0
   even
