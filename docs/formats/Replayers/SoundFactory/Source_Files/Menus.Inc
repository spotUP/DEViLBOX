MENUENABLED = 1
NULL = 0
ITEMTEXT = 2
ITEMENABLED = 16
HIGHCOMP = 64
CHECKIT = 1
MENUTOGGLE = 8
RP_COMPLEMENT = 2
MENUNULL = 0
RP_JAM1 = 1
RP_JAM2 = 0
RELVERIFY = 1
ENDGADGET = 4
TOGGLESELECT = $100
GADGIMMEDIATE = 2
BOOLGADGET = 1
REQGADGET = $1000
STRGADGET = 4
STRINGRIGHT = $400
LONGINT = $800
GADGHIMAGE = 2
GADGIMAGE = 4

   even
Menu1:
	dc.l	M_Menu2
	dc.w	0,0
	dc.w	87,0
	dc.w	MENUENABLED
	dc.l	M_Menu1Name
	dc.l	M_MenuItem1
	dc.w	0,0,0,0
M_Menu1Name:
	dc.b	' Project  ',0
	cnop 0,2
M_MenuItem1:
	dc.l	M_MenuItem2
	dc.w	0,0
	dc.w	96,8
	dc.w	ITEMTEXT+ITEMENABLED+HIGHCOMP
	dc.l	0
	dc.l	M_IText1
	dc.l	NULL
	dc.b	NULL
	dc.b	NULL
	dc.l	NULL
	dc.w	MENUNULL
M_IText1:
	dc.b	3,1,RP_COMPLEMENT,0
	dc.w	0,0
	dc.l	NULL
	dc.l	M_ITextText1
	dc.l	NULL
M_ITextText1:
	dc.b	' About',0
	cnop 0,2
M_MenuItem2:
	dc.l	M_MenuItem3
	dc.w	0,8
	dc.w	96,8
	dc.w	ITEMTEXT+HIGHCOMP
	dc.l	0
	dc.l	M_IText2
	dc.l	NULL
	dc.b	NULL
	dc.b	NULL
	dc.l	NULL
	dc.w	MENUNULL
M_IText2:
	dc.b	3,1,RP_COMPLEMENT,0
	dc.w	0,0
	dc.l	NULL
	dc.l	M_ITextText2
	dc.l	NULL
M_ITextText2:
	dc.b	'------------',0
	cnop 0,2
M_MenuItem3:
	dc.l	M_MenuItem4
	dc.w	0,16
	dc.w	96,8
	dc.w	ITEMTEXT+ITEMENABLED+HIGHCOMP
	dc.l	0
	dc.l	M_IText3
	dc.l	NULL
	dc.b	NULL
	dc.b	NULL
	dc.l	NULL
	dc.w	MENUNULL
M_IText3:
	dc.b	3,1,RP_COMPLEMENT,0
	dc.w	0,0
	dc.l	NULL
	dc.l	M_ITextText3
	dc.l	NULL
M_ITextText3:
	dc.b	' Load',0
	cnop 0,2
M_MenuItem4:
	dc.l	M_MenuItem5
	dc.w	0,24
	dc.w	96,8
	dc.w	ITEMTEXT+ITEMENABLED+HIGHCOMP
	dc.l	0
	dc.l	M_IText4
	dc.l	NULL
	dc.b	NULL
	dc.b	NULL
	dc.l	NULL
	dc.w	MENUNULL
M_IText4:
	dc.b	3,1,RP_COMPLEMENT,0
	dc.w	0,0
	dc.l	NULL
	dc.l	M_ITextText4
	dc.l	NULL
M_ITextText4:
	dc.b	' Save',0
	cnop 0,2
M_MenuItem5:
	dc.l	M_MenuItem6
	dc.w	0,32
	dc.w	96,8
	dc.w	ITEMTEXT+ITEMENABLED+HIGHCOMP
	dc.l	0
	dc.l	M_IText5
	dc.l	NULL
	dc.b	NULL
	dc.b	NULL
	dc.l	NULL
	dc.w	MENUNULL
M_IText5:
	dc.b	3,1,RP_COMPLEMENT,0
	dc.w	0,0
	dc.l	NULL
	dc.l	M_ITextText5
	dc.l	NULL
M_ITextText5:
	dc.b	' Save as',0
	cnop 0,2
M_MenuItem6:
	dc.l	M_MenuItem7
	dc.w	0,40
	dc.w	96,8
	dc.w	ITEMTEXT+ITEMENABLED+HIGHCOMP
	dc.l	0
	dc.l	M_IText6
	dc.l	NULL
	dc.b	NULL
	dc.b	NULL
	dc.l	NULL
	dc.w	MENUNULL
M_IText6:
	dc.b	3,1,RP_COMPLEMENT,0
	dc.w	0,0
	dc.l	NULL
	dc.l	M_ITextText6
	dc.l	NULL
M_ITextText6:
	dc.b	' Clear',0
	cnop 0,2
M_MenuItem7:
	dc.l	M_MenuItem8
	dc.w	0,48
	dc.w	96,8
	dc.w	ITEMTEXT+HIGHCOMP
	dc.l	0
	dc.l	M_IText7
	dc.l	NULL
	dc.b	NULL
	dc.b	NULL
	dc.l	NULL
	dc.w	MENUNULL
M_IText7:
	dc.b	3,1,RP_COMPLEMENT,0
	dc.w	0,0
	dc.l	NULL
	dc.l	M_ITextText7
	dc.l	NULL
M_ITextText7:
	dc.b	'------------',0
	cnop 0,2
M_MenuItem8:
	dc.l	M_MenuItem8a
	dc.w	0,56
	dc.w	96,8
	dc.w	ITEMTEXT+ITEMENABLED+HIGHCOMP
	dc.l	0
	dc.l	M_IText8
	dc.l	NULL
	dc.b	NULL
	dc.b	NULL
	dc.l	NULL
	dc.w	MENUNULL
M_IText8:
	dc.b	3,1,RP_COMPLEMENT,0
	dc.w	0,0
	dc.l	NULL
	dc.l	M_ITextText8
	dc.l	NULL
M_ITextText8:
	dc.b	' Status',0
	cnop 0,2
M_MenuItem8a:
	dc.l	M_MenuItem9
	dc.w	0,64
	dc.w	96,8
	dc.w	ITEMTEXT+ITEMENABLED+HIGHCOMP+CHECKIT+MENUTOGGLE
	dc.l	0
	dc.l	M_IText8a
	dc.l	NULL
	dc.b	NULL
	dc.b	NULL
	dc.l	NULL
	dc.w	MENUNULL
M_IText8a:
	dc.b	3,1,RP_COMPLEMENT,0
	dc.w	0,0
	dc.l	NULL
	dc.l	M_ITextText8a
	dc.l	NULL
M_ITextText8a:
	dc.b	'  MIDI',0
	cnop 0,2
M_MenuItem9:
	dc.l	M_MenuItem10
	dc.w	0,72
	dc.w	96,8
	dc.w	ITEMTEXT+HIGHCOMP
	dc.l	0
	dc.l	M_IText9
	dc.l	NULL
	dc.b	NULL
	dc.b	NULL
	dc.l	NULL
	dc.w	MENUNULL
M_IText9:
	dc.b	3,1,RP_COMPLEMENT,0
	dc.w	0,0
	dc.l	NULL
	dc.l	M_ITextText9
	dc.l	NULL
M_ITextText9:
	dc.b	'------------',0
	cnop 0,2
M_MenuItem10:
	dc.l	NULL
	dc.w	0,80
	dc.w	96,8
	dc.w	ITEMTEXT+ITEMENABLED+HIGHCOMP
	dc.l	0
	dc.l	M_IText10
	dc.l	NULL
	dc.b	NULL
	dc.b	NULL
	dc.l	NULL
	dc.w	MENUNULL
M_IText10:
	dc.b	3,1,RP_COMPLEMENT,0
	dc.w	0,0
	dc.l	NULL
	dc.l	M_ITextText10
	dc.l	NULL
M_ITextText10:
	dc.b	' Quit',0
	cnop 0,2
M_Menu2:
	dc.l	M_Menu3
	dc.w	94,0
	dc.w	87,0
	dc.w	MENUENABLED
	dc.l	M_Menu2Name
	dc.l	M_MenuItem11
	dc.w	0,0,0,0
M_Menu2Name:
	dc.b	'Instrument',0
	cnop 0,2
M_MenuItem11:
	dc.l	M_MenuItem12
	dc.w	0,0
	dc.w	80,8
	dc.w	ITEMTEXT+ITEMENABLED+HIGHCOMP
	dc.l	0
	dc.l	M_IText11
	dc.l	NULL
	dc.b	NULL
	dc.b	NULL
	dc.l	NULL
	dc.w	MENUNULL
M_IText11:
	dc.b	3,1,RP_COMPLEMENT,0
	dc.w	0,0
	dc.l	NULL
	dc.l	M_ITextText11
	dc.l	NULL
M_ITextText11:
	dc.b	' Load',0
	cnop 0,2
M_MenuItem12:
	dc.l	M_MenuItem13
	dc.w	0,8
	dc.w	80,8
	dc.w	ITEMTEXT+ITEMENABLED+HIGHCOMP
	dc.l	0
	dc.l	M_IText12
	dc.l	NULL
	dc.b	NULL
	dc.b	NULL
	dc.l	NULL
	dc.w	MENUNULL
M_IText12:
	dc.b	3,1,RP_COMPLEMENT,0
	dc.w	0,0
	dc.l	NULL
	dc.l	M_ITextText12
	dc.l	NULL
M_ITextText12:
	dc.b	' Save',0
	cnop 0,2
M_MenuItem13:
	dc.l	M_MenuItem14
	dc.w	0,16
	dc.w	80,8
	dc.w	ITEMTEXT+ITEMENABLED+HIGHCOMP
	dc.l	0
	dc.l	M_IText13
	dc.l	NULL
	dc.b	NULL
	dc.b	NULL
	dc.l	NULL
	dc.w	MENUNULL
M_IText13:
	dc.b	3,1,RP_COMPLEMENT,0
	dc.w	0,0
	dc.l	NULL
	dc.l	M_ITextText13
	dc.l	NULL
M_ITextText13:
	dc.b	' Save as',0
	cnop 0,2
M_MenuItem14:
	dc.l	M_MenuItem15
	dc.w	0,24
	dc.w	80,8
	dc.w	ITEMTEXT+HIGHCOMP
	dc.l	0
	dc.l	M_IText14
	dc.l	NULL
	dc.b	NULL
	dc.b	NULL
	dc.l	NULL
	dc.w	MENUNULL
M_IText14:
	dc.b	3,1,RP_COMPLEMENT,0
	dc.w	0,0
	dc.l	NULL
	dc.l	M_ITextText14
	dc.l	NULL
M_ITextText14:
	dc.b	'----------',0
	cnop 0,2
M_MenuItem15:
	dc.l M_MenuItem14a
	dc.w	0,32
	dc.w	80,8
	dc.w	ITEMTEXT+ITEMENABLED+HIGHCOMP
	dc.l	0
	dc.l	M_IText15
	dc.l	NULL
	dc.b	NULL
	dc.b	NULL
	dc.l	NULL
	dc.w	MENUNULL
M_IText15:
	dc.b	3,1,RP_COMPLEMENT,0
	dc.w	0,0
	dc.l	NULL
	dc.l	M_ITextText15
	dc.l	NULL
M_ITextText15:
	dc.b	' Default',0
	cnop 0,2
M_MenuItem14a:
	dc.l	M_MenuItem15a
	dc.w	0,40
	dc.w	80,8
	dc.w	ITEMTEXT+HIGHCOMP
	dc.l	0
	dc.l	M_IText14
	dc.l	NULL
	dc.b	NULL
	dc.b	NULL
	dc.l	NULL
	dc.w	MENUNULL
	cnop 0,2
M_MenuItem15a:
	dc.l NULL
	dc.w	0,48
	dc.w	80,8
	dc.w	ITEMTEXT+ITEMENABLED+HIGHCOMP
	dc.l	0
	dc.l	M_IText15a
	dc.l	NULL
	dc.b	NULL
	dc.b	NULL
	dc.l	NULL
	dc.w	MENUNULL
M_IText15a:
	dc.b	3,1,RP_COMPLEMENT,0
	dc.w	0,0
	dc.l	NULL
	dc.l	M_ITextText15a
	dc.l	NULL
M_ITextText15a:
	dc.b	' Mix',0
	cnop 0,2
M_Menu3:
	dc.l	NULL
	dc.w	188,0
	dc.w	103,0
	dc.w	MENUENABLED
	dc.l	M_Menu3Name
	dc.l	M_MenuItem16
	dc.w	0,0,0,0
M_Menu3Name:
	dc.b	' Actions    ',0
	cnop 0,2
M_MenuItem16:
	dc.l	M_MenuItem17
	dc.w	0,0
	dc.w	104,8
	dc.w	ITEMTEXT+ITEMENABLED+HIGHCOMP
	dc.l	0
	dc.l	M_IText16
	dc.l	NULL
	dc.b	NULL
	dc.b	NULL
	dc.l	NULL
	dc.w	MENUNULL
M_IText16:
	dc.b	3,1,RP_COMPLEMENT,0
	dc.w	0,0
	dc.l	NULL
	dc.l	M_ITextText16
	dc.l	NULL
M_ITextText16:
	dc.b	' Edit Song',0
	cnop 0,2
M_MenuItem17:
	dc.l	M_MenuItem18
	dc.w	0,8
	dc.w	104,8
	dc.w	ITEMTEXT+HIGHCOMP
	dc.l	0
	dc.l	M_IText17
	dc.l	NULL
	dc.b	NULL
	dc.b	NULL
	dc.l	NULL
	dc.w	MENUNULL
M_IText17:
	dc.b	3,1,RP_COMPLEMENT,0
	dc.w	0,0
	dc.l	NULL
	dc.l	M_ITextText17
	dc.l	NULL
M_ITextText17:
	dc.b	'-------------',0
	cnop 0,2
M_MenuItem18:
	dc.l	M_MenuItem19
	dc.w	0,16
	dc.w	104,8
	dc.w	ITEMTEXT+ITEMENABLED+HIGHCOMP
	dc.l	0
	dc.l	M_IText18
	dc.l	NULL
	dc.b	NULL
	dc.b	NULL
	dc.l	NULL
	dc.w	MENUNULL
M_IText18:
	dc.b	3,1,RP_COMPLEMENT,0
	dc.w	0,0
	dc.l	NULL
	dc.l	M_ITextText18
	dc.l	NULL
M_ITextText18:
	dc.b	' Check Song',0
	cnop 0,2
M_MenuItem19:
	dc.l	M_MenuItem20
	dc.w	0,24
	dc.w	104,8
	dc.w	ITEMTEXT+HIGHCOMP
	dc.l	0
	dc.l	M_IText19
	dc.l	NULL
	dc.b	NULL
	dc.b	NULL
	dc.l	NULL
	dc.w	MENUNULL
M_IText19:
	dc.b	3,1,RP_COMPLEMENT,0
	dc.w	0,0
	dc.l	NULL
	dc.l	M_ITextText19
	dc.l	NULL
M_ITextText19:
	dc.b	'-------------',0
	cnop 0,2
M_MenuItem20:
	dc.l	M_MenuItem21
	dc.w	0,32
	dc.w	104,8
	dc.w	ITEMTEXT+ITEMENABLED+HIGHCOMP
	dc.l	0
	dc.l	M_IText20
	dc.l	NULL
	dc.b	NULL
	dc.b	NULL
	dc.l	NULL
	dc.w	MENUNULL
M_IText20:
	dc.b	3,1,RP_COMPLEMENT,0
	dc.w	0,0
	dc.l	NULL
	dc.l	M_ITextText20
	dc.l	NULL
M_ITextText20:
	dc.b	' Record Part ',0
	cnop 0,2
M_MenuItem21:
	dc.l	M_MenuItem22
	dc.w	0,40
	dc.w	104,8
	dc.w	ITEMTEXT+HIGHCOMP
	dc.l	0
	dc.l	M_IText21
	dc.l	NULL
	dc.b	NULL
	dc.b	NULL
	dc.l	NULL
	dc.w	MENUNULL
M_IText21:
	dc.b	3,1,RP_COMPLEMENT,0
	dc.w	0,0
	dc.l	NULL
	dc.l	M_ITextText21
	dc.l	NULL
M_ITextText21:
	dc.b	'-------------',0
	cnop 0,2
M_MenuItem22:
	dc.l	NULL
	dc.w	0,48
	dc.w	104,8
	dc.w	ITEMTEXT+ITEMENABLED+HIGHCOMP
	dc.l	0
	dc.l	M_IText22
	dc.l	NULL
	dc.b	NULL
	dc.b	NULL
	dc.l	NULL
	dc.w	MENUNULL
M_IText22:
	dc.b	3,1,RP_COMPLEMENT,0
	dc.w	0,0
	dc.l	NULL
	dc.l	M_ITextText22
	dc.l	NULL
M_ITextText22:
	dc.b	' Player',0
	cnop 0,2


; end of PowerWindows source generation
