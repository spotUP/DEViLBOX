   even
PlayWindow:
	dc.w	100,45
	dc.w	476,116
	dc.b	0,1
	dc.l	0
	dc.l $21000         ;Activate & Nocarerefresh
	dc.l	GodgetList1
	dc.l	0
	dc.l	NewWindowName1
Screenhd4:
	dc.l 0
	dc.l	0
	dc.w	5,5
	dc.w	-1,-1
	dc.w 15
NewWindowName1:
	dc.b	'Play on keyboard! Press right mousebutton to quit!',0
   even
GodgetList1:
Godget1:
	dc.l	Godget2
	dc.w	15,20
	dc.w	32,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder1
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder1:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors1
	dc.l	0
BrderVectors1:
	dc.w	0,0
	dc.w	33,0
	dc.w	33,12
	dc.w	0,12
	dc.w	0,0
Godget2:
	dc.l	Godget3
	dc.w	15,36
	dc.w	46,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder2
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder2:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors2
	dc.l	0
BrderVectors2:
	dc.w	0,0
	dc.w	47,0
	dc.w	47,12
	dc.w	0,12
	dc.w	0,0
Godget3:
	dc.l	Godget4
	dc.w	53,20
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder3
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder3:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors3
	dc.l	0
BrderVectors3:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
Godget4:
	dc.l	Godget5
	dc.w	83,20
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder4
	dc.l	0
	dc.l	IText1
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder4:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors4
	dc.l	0
BrderVectors4:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText1:
	dc.b	1,0,1,0
	dc.w	4,2
	dc.l	0
	dc.l	ITextText1
	dc.l	0
ITextText1:
	dc.b	'c#',0
   even
Godget5:
	dc.l	Godget6
	dc.w	113,20
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder5
	dc.l	0
	dc.l	IText2
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder5:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors5
	dc.l	0
BrderVectors5:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText2:
	dc.b	1,0,1,0
	dc.w	4,2
	dc.l	0
	dc.l	ITextText2
	dc.l	0
ITextText2:
	dc.b	'd#',0
   even
Godget6:
	dc.l	Godget7
	dc.w	142,20
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder6
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder6:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors6
	dc.l	0
BrderVectors6:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
Godget7:
	dc.l	Godget8
	dc.w	171,20
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder7
	dc.l	0
	dc.l	IText3
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder7:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors7
	dc.l	0
BrderVectors7:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText3:
	dc.b	1,0,1,0
	dc.w	4,2
	dc.l	0
	dc.l	ITextText3
	dc.l	0
ITextText3:
	dc.b	'f#',0
   even
Godget8:
	dc.l	Godget9
	dc.w	201,20
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder8
	dc.l	0
	dc.l	IText4
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder8:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors8
	dc.l	0
BrderVectors8:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText4:
	dc.b	1,0,1,0
	dc.w	4,2
	dc.l	0
	dc.l	ITextText4
	dc.l	0
ITextText4:
	dc.b	'g#',0
   even
Godget9:
	dc.l	Godget10
	dc.w	231,20
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder9
	dc.l	0
	dc.l	IText5
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder9:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors9
	dc.l	0
BrderVectors9:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText5:
	dc.b	1,0,1,0
	dc.w	4,2
	dc.l	0
	dc.l	ITextText5
	dc.l	0
ITextText5:
	dc.b	'a#',0
   even
Godget10:
	dc.l	Godget11
	dc.w	260,20
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder10
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder10:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors10
	dc.l	0
BrderVectors10:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
Godget11:
	dc.l	Godget12
	dc.w	289,20
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder11
	dc.l	0
	dc.l	IText6
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder11:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors11
	dc.l	0
BrderVectors11:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText6:
	dc.b	1,0,1,0
	dc.w	0,2
	dc.l	0
	dc.l	ITextText6
	dc.l	0
ITextText6:
	dc.b	'c#`',0
   even
Godget12:
	dc.l	Godget13
	dc.w	318,20
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder12
	dc.l	0
	dc.l	IText7
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder12:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors12
	dc.l	0
BrderVectors12:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText7:
	dc.b	1,0,1,0
	dc.w	0,2
	dc.l	0
	dc.l	ITextText7
	dc.l	0
ITextText7:
	dc.b	'd#`',0
   even
Godget13:
	dc.l	Godget14
	dc.w	347,20
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder13
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder13:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors13
	dc.l	0
BrderVectors13:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
Godget14:
	dc.l	Godget15
	dc.w	376,20
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder14
	dc.l	0
	dc.l	IText8
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder14:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors14
	dc.l	0
BrderVectors14:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText8:
	dc.b	1,0,1,0
	dc.w	0,2
	dc.l	0
	dc.l	ITextText8
	dc.l	0
ITextText8:
	dc.b	'f#`',0
   even
Godget15:
	dc.l	Godget16
	dc.w	405,20
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder15
	dc.l	0
	dc.l	IText9
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder15:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors15
	dc.l	0
BrderVectors15:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText9:
	dc.b	1,0,1,0
	dc.w	0,2
	dc.l	0
	dc.l	ITextText9
	dc.l	0
ITextText9:
	dc.b	'g#`',0
   even
Godget16:
	dc.l	Godget17
	dc.w	434,20
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder16
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder16:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors16
	dc.l	0
BrderVectors16:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
Godget17:
	dc.l	Godget18
	dc.w	67,36
	dc.w	24,11
	dc.w	0
	dc.w	0
	dc.w	1
	dc.l	Brder17
	dc.l	0
	dc.l	IText10
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder17:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors17
	dc.l	0
BrderVectors17:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText10:
	dc.b	1,0,1,0
	dc.w	8,2
	dc.l	0
	dc.l	ITextText10
	dc.l	0
ITextText10:
	dc.b	'c',0
   even
Godget18:
	dc.l	Godget19
	dc.w	97,36
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder18
	dc.l	0
	dc.l	IText11
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder18:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors18
	dc.l	0
BrderVectors18:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText11:
	dc.b	1,0,1,0
	dc.w	7,2
	dc.l	0
	dc.l	ITextText11
	dc.l	0
ITextText11:
	dc.b	'd',0
   even
Godget19:
	dc.l	Godget20
	dc.w	127,36
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder19
	dc.l	0
	dc.l	IText12
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder19:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors19
	dc.l	0
BrderVectors19:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText12:
	dc.b	1,0,1,0
	dc.w	8,2
	dc.l	0
	dc.l	ITextText12
	dc.l	0
ITextText12:
	dc.b	'e',0
   even
Godget20:
	dc.l	Godget21
	dc.w	156,36
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder20
	dc.l	0
	dc.l	IText13
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder20:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors20
	dc.l	0
BrderVectors20:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText13:
	dc.b	1,0,1,0
	dc.w	8,2
	dc.l	0
	dc.l	ITextText13
	dc.l	0
ITextText13:
	dc.b	'f',0
   even
Godget21:
	dc.l	Godget22
	dc.w	186,36
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder21
	dc.l	0
	dc.l	IText14
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder21:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors21
	dc.l	0
BrderVectors21:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText14:
	dc.b	1,0,1,0
	dc.w	8,2
	dc.l	0
	dc.l	ITextText14
	dc.l	0
ITextText14:
	dc.b	'g',0
	even
Godget22:
	dc.l	Godget23
	dc.w	216,36
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder22
	dc.l	0
	dc.l	IText15
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder22:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors22
	dc.l	0
BrderVectors22:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText15:
	dc.b	1,0,1,0
	dc.w	7,2
	dc.l	0
	dc.l	ITextText15
	dc.l	0
ITextText15:
	dc.b	'a',0
	even
Godget23:
	dc.l	Godget24
	dc.w	245,36
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder23
	dc.l	0
	dc.l	IText16
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder23:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors23
	dc.l	0
BrderVectors23:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText16:
	dc.b	1,0,1,0
	dc.w	8,2
	dc.l	0
	dc.l	ITextText16
	dc.l	0
ITextText16:
	dc.b	'h',0
	even
Godget24:
	dc.l	Godget25
	dc.w	274,36
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder24
	dc.l	0
	dc.l	IText17
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder24:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors24
	dc.l	0
BrderVectors24:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText17:
	dc.b	1,0,1,0
	dc.w	6,2
	dc.l	0
	dc.l	ITextText17
	dc.l	0
ITextText17:
	dc.b	'c`',0
	even
Godget25:
	dc.l	Godget26
	dc.w	303,36
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder25
	dc.l	0
	dc.l	IText18
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder25:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors25
	dc.l	0
BrderVectors25:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText18:
	dc.b	1,0,1,0
	dc.w	5,2
	dc.l	0
	dc.l	ITextText18
	dc.l	0
ITextText18:
	dc.b	'd`',0
	even
Godget26:
	dc.l	Godget27
	dc.w	332,36
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder26
	dc.l	0
	dc.l	IText19
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder26:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors26
	dc.l	0
BrderVectors26:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText19:
	dc.b	1,0,1,0
	dc.w	5,2
	dc.l	0
	dc.l	ITextText19
	dc.l	0
ITextText19:
	dc.b	'e`',0
	even
Godget27:
	dc.l	Godget28
	dc.w	361,36
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder27
	dc.l	0
	dc.l	IText20
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder27:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors27
	dc.l	0
BrderVectors27:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText20:
	dc.b	1,0,1,0
	dc.w	5,2
	dc.l	0
	dc.l	ITextText20
	dc.l	0
ITextText20:
	dc.b	'f`',0
	even
Godget28:
	dc.l	Godget29
	dc.w	390,36
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder28
	dc.l	0
	dc.l	IText21
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder28:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors28
	dc.l	0
BrderVectors28:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText21:
	dc.b	1,0,1,0
	dc.w	5,2
	dc.l	0
	dc.l	ITextText21
	dc.l	0
ITextText21:
	dc.b	'g`',0
	even
Godget29:
	dc.l	Godget30
	dc.w	78,52
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder29
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder29:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors29
	dc.l	0
BrderVectors29:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
Godget30:
	dc.l	Godget31
	dc.w	15,52
	dc.w	27,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder30
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder30:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors30
	dc.l	0
BrderVectors30:
	dc.w	0,0
	dc.w	28,0
	dc.w	28,12
	dc.w	0,12
	dc.w	0,0
Godget31:
	dc.l	Godget32
	dc.w	48,52
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder31
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder31:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors31
	dc.l	0
BrderVectors31:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
Godget32:
	dc.l	Godget33
	dc.w	108,52
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder32
	dc.l	0
	dc.l	IText22
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder32:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors32
	dc.l	0
BrderVectors32:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText22:
	dc.b	1,0,1,0
	dc.w	5,2
	dc.l	0
	dc.l	ITextText22
	dc.l	0
ITextText22:
	dc.b	'C#',0
	even
Godget33:
	dc.l	Godget34
	dc.w	138,52
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder33
	dc.l	0
	dc.l	IText23
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder33:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors33
	dc.l	0
BrderVectors33:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText23:
	dc.b	1,0,1,0
	dc.w	4,2
	dc.l	0
	dc.l	ITextText23
	dc.l	0
ITextText23:
	dc.b	'D#',0
	even
Godget34:
	dc.l	Godget35
	dc.w	167,52
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder34
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder34:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors34
	dc.l	0
BrderVectors34:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
Godget35:
	dc.l	Godget36
	dc.w	197,52
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder35
	dc.l	0
	dc.l	IText24
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder35:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors35
	dc.l	0
BrderVectors35:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText24:
	dc.b	1,0,1,0
	dc.w	5,2
	dc.l	0
	dc.l	ITextText24
	dc.l	0
ITextText24:
	dc.b	'F#',0
	even
Godget36:
	dc.l	Godget37
	dc.w	226,52
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder36
	dc.l	0
	dc.l	IText25
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder36:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors36
	dc.l	0
BrderVectors36:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText25:
	dc.b	1,0,1,0
	dc.w	5,2
	dc.l	0
	dc.l	ITextText25
	dc.l	0
ITextText25:
	dc.b	'G#',0
	even
Godget37:
	dc.l	Godget38
	dc.w	255,52
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder37
	dc.l	0
	dc.l	IText26
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder37:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors37
	dc.l	0
BrderVectors37:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText26:
	dc.b	1,0,1,0
	dc.w	4,2
	dc.l	0
	dc.l	ITextText26
	dc.l	0
ITextText26:
	dc.b	'A#',0
	even
Godget38:
	dc.l	Godget39
	dc.w	284,52
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder38
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder38:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors38
	dc.l	0
BrderVectors38:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
Godget39:
	dc.l	Godget40
	dc.w	313,52
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder39
	dc.l	0
	dc.l	IText27
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder39:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors39
	dc.l	0
BrderVectors39:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText27:
	dc.b	1,0,1,0
	dc.w	4,2
	dc.l	0
	dc.l	ITextText27
	dc.l	0
ITextText27:
	dc.b	'c#',0
	even
Godget40:
	dc.l	Godget41
	dc.w	342,52
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder40
	dc.l	0
	dc.l	IText28
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder40:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors40
	dc.l	0
BrderVectors40:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText28:
	dc.b	1,0,1,0
	dc.w	4,2
	dc.l	0
	dc.l	ITextText28
	dc.l	0
ITextText28:
	dc.b	'd#',0
	even
Godget41:
	dc.l	Godget42
	dc.w	371,52
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder41
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder41:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors41
	dc.l	0
BrderVectors41:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
Godget42:
	dc.l	Godget43
	dc.w	400,52
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder42
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder42:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors42
	dc.l	0
BrderVectors42:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
Godget43:
	dc.l	Godget44
	dc.w	63,68
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder43
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder43:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors43
	dc.l	0
BrderVectors43:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
Godget44:
	dc.l	Godget45
	dc.w	15,68
	dc.w	41,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder44
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder44:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors44
	dc.l	0
BrderVectors44:
	dc.w	0,0
	dc.w	42,0
	dc.w	42,12
	dc.w	0,12
	dc.w	0,0
Godget45:
	dc.l	Godget46
	dc.w	93,68
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder45
	dc.l	0
	dc.l	IText29
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder45:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors45
	dc.l	0
BrderVectors45:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText29:
	dc.b	1,0,1,0
	dc.w	8,2
	dc.l	0
	dc.l	ITextText29
	dc.l	0
ITextText29:
	dc.b	'C',0
	even
Godget46:
	dc.l	Godget47
	dc.w	123,68
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder46
	dc.l	0
	dc.l	IText30
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder46:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors46
	dc.l	0
BrderVectors46:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText30:
	dc.b	1,0,1,0
	dc.w	8,2
	dc.l	0
	dc.l	ITextText30
	dc.l	0
ITextText30:
	dc.b	'D',0
	even
Godget47:
	dc.l	Godget48
	dc.w	153,68
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder47
	dc.l	0
	dc.l	IText31
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder47:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors47
	dc.l	0
BrderVectors47:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText31:
	dc.b	1,0,1,0
	dc.w	8,2
	dc.l	0
	dc.l	ITextText31
	dc.l	0
ITextText31:
	dc.b	'E',0
	even
Godget48:
	dc.l	Godget49
	dc.w	182,68
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder48
	dc.l	0
	dc.l	IText32
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder48:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors48
	dc.l	0
BrderVectors48:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText32:
	dc.b	1,0,1,0
	dc.w	8,2
	dc.l	0
	dc.l	ITextText32
	dc.l	0
ITextText32:
	dc.b	'F',0
	even
Godget49:
	dc.l	Godget50
	dc.w	211,68
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder49
	dc.l	0
	dc.l	IText33
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder49:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors49
	dc.l	0
BrderVectors49:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText33:
	dc.b	1,0,1,0
	dc.w	8,2
	dc.l	0
	dc.l	ITextText33
	dc.l	0
ITextText33:
	dc.b	'G',0
	even
Godget50:
	dc.l	Godget51
	dc.w	240,68
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder50
	dc.l	0
	dc.l	IText34
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder50:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors50
	dc.l	0
BrderVectors50:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText34:
	dc.b	1,0,1,0
	dc.w	8,2
	dc.l	0
	dc.l	ITextText34
	dc.l	0
ITextText34:
	dc.b	'A',0
	even
Godget51:
	dc.l	Godget52
	dc.w	269,68
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder51
	dc.l	0
	dc.l	IText35
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder51:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors51
	dc.l	0
BrderVectors51:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText35:
	dc.b	1,0,1,0
	dc.w	8,2
	dc.l	0
	dc.l	ITextText35
	dc.l	0
ITextText35:
	dc.b	'H',0
	even
Godget52:
	dc.l	Godget53
	dc.w	298,68
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder52
	dc.l	0
	dc.l	IText36
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder52:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors52
	dc.l	0
BrderVectors52:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText36:
	dc.b	1,0,1,0
	dc.w	8,2
	dc.l	0
	dc.l	ITextText36
	dc.l	0
ITextText36:
	dc.b	'c',0
	even
Godget53:
	dc.l	Godget54
	dc.w	327,68
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder53
	dc.l	0
	dc.l	IText37
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder53:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors53
	dc.l	0
BrderVectors53:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText37:
	dc.b	1,0,1,0
	dc.w	7,2
	dc.l	0
	dc.l	ITextText37
	dc.l	0
ITextText37:
	dc.b	'd',0
	even
Godget54:
	dc.l	Godget55
	dc.w	356,68
	dc.w	24,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder54
	dc.l	0
	dc.l	IText38
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder54:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors54
	dc.l	0
BrderVectors54:
	dc.w	0,0
	dc.w	25,0
	dc.w	25,12
	dc.w	0,12
	dc.w	0,0
IText38:
	dc.b	1,0,1,0
	dc.w	8,2
	dc.l	0
	dc.l	ITextText38
	dc.l	0
ITextText38:
	dc.b	'e',0
	even
Godget55:
	dc.l	Godget56
	dc.w	386,68
	dc.w	69,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder55
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder55:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors55
	dc.l	0
BrderVectors55:
	dc.w	0,0
	dc.w	70,0
	dc.w	70,12
	dc.w	0,12
	dc.w	0,0
Godget56:
	dc.l	Godget57
	dc.w	36,84
	dc.w	27,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder56
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder56:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors56
	dc.l	0
BrderVectors56:
	dc.w	0,0
	dc.w	28,0
	dc.w	28,12
	dc.w	0,12
	dc.w	0,0
Godget57:
	dc.l	Godget58
	dc.w	69,84
	dc.w	27,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder57
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder57:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors57
	dc.l	0
BrderVectors57:
	dc.w	0,0
	dc.w	28,0
	dc.w	28,12
	dc.w	0,12
	dc.w	0,0
Godget58:
	dc.l	Godget59
	dc.w	102,84
	dc.w	258,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder58
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder58:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors58
	dc.l	0
BrderVectors58:
	dc.w	0,0
	dc.w	259,0
	dc.w	259,12
	dc.w	0,12
	dc.w	0,0
Godget59:
	dc.l	Godget60
	dc.w	366,84
	dc.w	27,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder59
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder59:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors59
	dc.l	0
BrderVectors59:
	dc.w	0,0
	dc.w	28,0
	dc.w	28,12
	dc.w	0,12
	dc.w	0,0
Godget60:
	dc.l	Godget61
	dc.w	399,84
	dc.w	27,11
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder60
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder60:
	dc.w	-1,-1
	dc.b	3,0,1
	dc.b	5
	dc.l	BrderVectors60
	dc.l	0
BrderVectors60:
	dc.w	0,0
	dc.w	28,0
	dc.w	28,12
	dc.w	0,12
	dc.w	0,0
Godget61:
	dc.l	0
	dc.w	431,36
	dc.w	26,27
	dc.w	0
	dc.w	1
	dc.w	1
	dc.l	Brder61
	dc.l	0
	dc.l	0
	dc.l	0
	dc.l	0
	dc.w	0
	dc.l	0
Brder61:
	dc.w	-13,-1
	dc.b	3,0,1
	dc.b	7
	dc.l	BrderVectors61
	dc.l	0
BrderVectors61:
	dc.w	0,0
	dc.w	39,0
	dc.w	39,28
	dc.w	11,28
	dc.w	11,12
	dc.w	0,12
	dc.w	0,0
