; PT3 player wrapper for ZX Spectrum 128. Core: S.V.Bulba universal PT2/PT3 player (third-party/pt3play).
; Licence of the core source is not stated upstream; see thoughts/spot/2026-11-17_zx-pt3-export.md.
ZX=1
MSX=0
RC=0
CurPosCounter=0
ACBBAC=0
LoopChecker=1
Id=0
MDLADDR EQU 0xC000
	ORG 0x8000
BOOT	LD SP,0x7F00
	LD A,(BANK)
	LD BC,0x7FFD
	OUT (C),A
	PUSH AF
	CALL SCRINIT
	POP AF
	CALL START
MAINLP	EI
	HALT
	DI
	CALL START+5
	PUSH AF			; keep PLAY's exit flags across the screen code
	CALL SCRFRAME
	POP AF
TonA	EQU 0
TonB	EQU 2
TonC	EQU 4
Noise	EQU 6
Mixer	EQU 7
AmplA	EQU 8
AmplB	EQU 9
AmplC	EQU 10
Env	EQU 11
EnvTp	EQU 13

;Entry and other points
	JR MAINLP
BANK	DB 16
;START initialize playing of module at MDLADDR
;START+3 initialization with module address in HL
;START+5 play one quark
;START+8 mute
;START+10 setup and status flags
;START+11 current position value (byte) (optional)

START
	LD HL,MDLADDR
	JR INIT
	JP PLAY
	JR MUTE
SETUP	DB 0 ;set bit0, if you want to play without looping
	     ;(optional);
	     ;set bit1 for PT2 and reset for PT3 before
	     ;calling INIT;
	     ;bits2-3: %00-ABC, %01 ACB, %10 BAC (optional);
	     ;bits4-6 are not used
	     ;bit7 is set each time, when loop point is passed
	     ;(optional)
	IF CurPosCounter
CurPos	DB 0 ;for visualization only (i.e. no need for playing)
	ENDIF

;Identifier
	IF Id
	DB "=Uni PT2 and PT3 Player r.",Release,"="
	ENDIF

	IF LoopChecker
CHECKLP	LD HL,SETUP
	SET 7,(HL)
	BIT 0,(HL)
	RET Z
	POP HL
	LD HL,DelyCnt
	INC (HL)
	LD HL,ChanA+CHP.NtSkCn
	INC (HL)
	ENDIF

MUTE	XOR A
	LD H,A
	LD L,A
	LD (AYREGS+AmplA),A
	LD (AYREGS+AmplB),HL
	JP ROUT

INIT
;HL - AddressOfModule
	LD A,(START+10)
	AND 2
	JR NZ,INITPT2

	CALL SETMDAD
	PUSH HL
	LD DE,100
	ADD HL,DE
	LD A,(HL)
	LD (Delay),A
	PUSH HL
	POP IX
	ADD HL,DE
	LD (CrPsPtr),HL
	LD E,(IX+102-100)
	INC HL

	IF CurPosCounter
	LD A,L
	LD (PosSub+1),A
	ENDIF

	ADD HL,DE
	LD (LPosPtr),HL
	POP DE
	LD L,(IX+103-100)
	LD H,(IX+104-100)
	ADD HL,DE
	LD (PatsPtr),HL
	LD HL,169
	ADD HL,DE
	LD (OrnPtrs),HL
	LD HL,105
	ADD HL,DE
	LD (SamPtrs),HL
	LD A,(IX+13-100) ;EXTRACT VERSION NUMBER
	SUB #30
	JR C,L20
	CP 10
	JR C,L21
L20	LD A,6
L21	LD (Version),A
	PUSH AF ;VolTable version
	CP 4
	LD A,(IX+99-100) ;TONE TABLE NUMBER
	RLA
	AND 7
	PUSH AF ;NoteTable number
	LD HL,(e_-SamCnv-2)*256+#18
	LD (SamCnv),HL
	LD A,#BA
	LD (OrnCP),A
	LD (SamCP),A
	LD A,#7B
	LD (OrnLD),A
	LD (SamLD),A
	LD A,#87
	LD (SamClc2),A
	LD BC,PT3PD
	LD HL,0
	LD DE,PT3EMPTYORN
	JR INITCOMMON

INITPT2	LD A,(HL)
	LD (Delay),A
	PUSH HL
	PUSH HL
	PUSH HL
	INC HL
	INC HL
	LD A,(HL)
	INC HL
	LD (SamPtrs),HL
	LD E,(HL)
	INC HL
	LD D,(HL)
	POP HL
	AND A
	SBC HL,DE
	CALL SETMDAD
	POP HL
	LD DE,67
	ADD HL,DE
	LD (OrnPtrs),HL
	LD E,32
	ADD HL,DE
	LD C,(HL)
	INC HL
	LD B,(HL)
	LD E,30
	ADD HL,DE
	LD (CrPsPtr),HL
	LD E,A
	INC HL

	IF CurPosCounter
	LD A,L
	LD (PosSub+1),A
	ENDIF

	ADD HL,DE
	LD (LPosPtr),HL
	POP HL
	ADD HL,BC
	LD (PatsPtr),HL
	LD A,5
	LD (Version),A
	PUSH AF
	LD A,2
	PUSH AF
	LD HL,#51CB
	LD (SamCnv),HL
	LD A,#BB
	LD (OrnCP),A
	LD (SamCP),A
	LD A,#7A
	LD (OrnLD),A
	LD (SamLD),A
	LD A,#80
	LD (SamClc2),A
	LD BC,PT2PD
	LD HL,#8687
	LD DE,PT2EMPTYORN

INITCOMMON

	LD (PTDECOD+1),BC
	LD (PsCalc),HL
	PUSH DE

;note table data depacker
;(c) Ivan Roshin
	LD DE,T_PACK
	LD BC,T1_+(2*49)-1
TP_0	LD A,(DE)
	INC DE
	CP 15*2
	JR NC,TP_1
	LD H,A
	LD A,(DE)
	LD L,A
	INC DE
	JR TP_2
TP_1	PUSH DE
	LD D,0
	LD E,A
	ADD HL,DE
	ADD HL,DE
	POP DE
TP_2	LD A,H
	LD (BC),A
	DEC BC
	LD A,L
	LD (BC),A
	DEC BC
	SUB #F8*2
	JR NZ,TP_0

	IF LoopChecker
	LD HL,SETUP
	RES 7,(HL)

	IF CurPosCounter
	INC HL
	LD (HL),A
	ENDIF

	ELSE

	IF CurPosCounter
	LD (CurPos),A
	ENDIF

	ENDIF

	LD HL,VARS
	LD (HL),A
	LD DE,VARS+1
	LD BC,VAR0END-VARS-1
	LDIR
	LD (AdInPtA),HL ;ptr to zero
	INC A
	LD (DelyCnt),A
	LD HL,#F001 ;H - CHP.Volume, L - CHP.NtSkCn
	LD (ChanA+CHP.NtSkCn),HL
	LD (ChanB+CHP.NtSkCn),HL
	LD (ChanC+CHP.NtSkCn),HL
	POP HL
	LD (ChanA+CHP.OrnPtr),HL
	LD (ChanB+CHP.OrnPtr),HL
	LD (ChanC+CHP.OrnPtr),HL

	POP AF

;NoteTableCreator (c) Ivan Roshin
;A - NoteTableNumber*2+VersionForNoteTable
;(xx1b - 3.xx..3.4r, xx0b - 3.4x..3.6x..VTII1.0)

	LD HL,NT_DATA
	PUSH DE
	LD D,B
	ADD A,A
	LD E,A
	ADD HL,DE
	LD E,(HL)
	INC HL
	SRL E
	SBC A,A
	AND #A7 ;#00 (NOP) or #A7 (AND A)
	LD (L3),A
	EX DE,HL
	POP BC ;BC=T1_
	ADD HL,BC

	LD A,(DE)
	ADD A,T_
	LD C,A
	ADC A,T_/256
	SUB C
	LD B,A
	PUSH BC
	LD DE,NT_
	PUSH DE

	LD B,12
L1	PUSH BC
	LD C,(HL)
	INC HL
	PUSH HL
	LD B,(HL)

	PUSH DE
	EX DE,HL
	LD DE,23
	LD IXH,8

L2	SRL B
	RR C
L3	DB #19	;AND A or NOP
	LD A,C
	ADC A,D	;=ADC 0
	LD (HL),A
	INC HL
	LD A,B
	ADC A,D
	LD (HL),A
	ADD HL,DE
	DEC IXH
	JR NZ,L2

	POP DE
	INC DE
	INC DE
	POP HL
	INC HL
	POP BC
	DJNZ L1

	POP HL
	POP DE

	LD A,E
	CP TCOLD_1
	JR NZ,CORR_1
	LD A,#FD
	LD (NT_+#2E),A

CORR_1	LD A,(DE)
	AND A
	JR Z,TC_EXIT
	RRA
	PUSH AF
	ADD A,A
	LD C,A
	ADD HL,BC
	POP AF
	JR NC,CORR_2
	DEC (HL)
	DEC (HL)
CORR_2	INC (HL)
	AND A
	SBC HL,BC
	INC DE
	JR CORR_1

TC_EXIT

	POP AF

;VolTableCreator (c) Ivan Roshin
;A - VersionForVolumeTable (0..4 - 3.xx..3.4x;
			   ;5.. - 2.x,3.5x..3.6x..VTII1.0)

	CP 5
	LD HL,#11
	LD D,H
	LD E,H
	LD A,#17
	JR NC,M1
	DEC L
	LD E,L
	XOR A
M1      LD (M2),A

	LD IX,VT_+16

	LD C,#F
INITV2  PUSH HL

	ADD HL,DE
	EX DE,HL
	SBC HL,HL

	LD B,#10
INITV1  LD A,L
M2      DB #7D
	LD A,H
	ADC A,0
	LD (IX),A
	INC IX
	ADD HL,DE
	DJNZ INITV1

	POP HL
	LD A,E
	CP #77
	JR NZ,M3
	INC E
M3      DEC C
	JR NZ,INITV2

	JP ROUT

SETMDAD	LD (MODADDR),HL
	LD (MDADDR1),HL
	LD (MDADDR2),HL
	RET

PTDECOD JP #C3C3

;PT2 pattern decoder
PD2_SAM	CALL SETSAM
	JR PD2_LOOP

PD2_EOff LD (IX-12+CHP.Env_En),A
	JR PD2_LOOP

PD2_ENV	LD (IX-12+CHP.Env_En),16
	LD (AYREGS+EnvTp),A
	LD A,(BC)
	INC BC
	LD L,A
	LD A,(BC)
	INC BC
	LD H,A
	LD (EnvBase),HL
	JR PD2_LOOP

PD2_ORN	CALL SETORN
	JR PD2_LOOP

PD2_SKIP INC A
	LD (IX-12+CHP.NNtSkp),A
	JR PD2_LOOP

PD2_VOL	RRCA
	RRCA
	RRCA
	RRCA
	LD (IX-12+CHP.Volume),A
	JR PD2_LOOP

PD2_DEL	CALL C_DELAY
	JR PD2_LOOP

PD2_GLIS SET 2,(IX-12+CHP.Flags)
	INC A
	LD (IX-12+CHP.TnSlDl),A
	LD (IX-12+CHP.TSlCnt),A
	LD A,(BC)
	INC BC
        LD (IX-12+CHP.TSlStp),A
	ADD A,A
	SBC A,A
        LD (IX-12+CHP.TSlStp+1),A
	SCF
	JR PD2_LP2

PT2PD	AND A

PD2_LP2	EX AF,AF'

PD2_LOOP LD A,(BC)
	INC BC
	ADD A,#20
	JR Z,PD2_REL
	JR C,PD2_SAM
	ADD A,96
	JR C,PD2_NOTE
	INC A
	JR Z,PD2_EOff
	ADD A,15
	JP Z,PD_FIN
	JR C,PD2_ENV
	ADD A,#10
	JR C,PD2_ORN
	ADD A,#40
	JR C,PD2_SKIP
	ADD A,#10
	JR C,PD2_VOL
	INC A
	JR Z,PD2_DEL
	INC A
	JR Z,PD2_GLIS
	INC A
	JR Z,PD2_PORT
	INC A
	JR Z,PD2_STOP
	LD A,(BC)
	INC BC
	LD (IX-12+CHP.CrNsSl),A
	JR PD2_LOOP

PD2_PORT RES 2,(IX-12+CHP.Flags)
	LD A,(BC)
	INC BC
	INC BC ;ignoring precalc delta to right sound
	INC BC
	SCF
	JR PD2_LP2

PD2_STOP LD (IX-12+CHP.TSlCnt),A
	JR PD2_LOOP

PD2_REL	LD (IX-12+CHP.Flags),A
	JR PD2_EXIT

PD2_NOTE LD L,A
	LD A,(IX-12+CHP.Note)
	LD (PrNote+1),A
	LD (IX-12+CHP.Note),L
	XOR A
	LD (IX-12+CHP.TSlCnt),A
	SET 0,(IX-12+CHP.Flags)
	EX AF,AF'
	JR NC,NOGLIS2
	BIT 2,(IX-12+CHP.Flags)
	JR NZ,NOPORT2
	LD (LoStep),A
	ADD A,A
	SBC A,A
	EX AF,AF'
	LD H,A
	LD L,A
	INC A
	CALL SETPORT
NOPORT2	LD (IX-12+CHP.TSlCnt),1
NOGLIS2	XOR A


PD2_EXIT LD (IX-12+CHP.PsInSm),A
	LD (IX-12+CHP.PsInOr),A
	LD (IX-12+CHP.CrTnSl),A
	LD (IX-12+CHP.CrTnSl+1),A
	JP PD_FIN

;PT3 pattern decoder
PD_OrSm	LD (IX-12+CHP.Env_En),0
	CALL SETORN
PD_SAM_	LD A,(BC)
	INC BC
	RRCA

PD_SAM	CALL SETSAM
	JR PD_LOOP

PD_VOL	RRCA
	RRCA
	RRCA
	RRCA
	LD (IX-12+CHP.Volume),A
	JR PD_LP2

PD_EOff	LD (IX-12+CHP.Env_En),A
	LD (IX-12+CHP.PsInOr),A
	JR PD_LP2

PD_SorE	DEC A
	JR NZ,PD_ENV
	LD A,(BC)
	INC BC
	LD (IX-12+CHP.NNtSkp),A
	JR PD_LP2

PD_ENV	CALL SETENV
	JR PD_LP2

PD_ORN	CALL SETORN
	JR PD_LOOP

PD_ESAM	LD (IX-12+CHP.Env_En),A
	LD (IX-12+CHP.PsInOr),A
	CALL NZ,SETENV
	JR PD_SAM_

PT3PD	LD A,(IX-12+CHP.Note)
	LD (PrNote+1),A
	LD L,(IX-12+CHP.CrTnSl)
	LD H,(IX-12+CHP.CrTnSl+1)
	LD (PrSlide+1),HL

PD_LOOP	LD DE,#2010
PD_LP2	LD A,(BC)
	INC BC
	ADD A,E
	JR C,PD_OrSm
	ADD A,D
	JR Z,PD_FIN
	JR C,PD_SAM
	ADD A,E
	JR Z,PD_REL
	JR C,PD_VOL
	ADD A,E
	JR Z,PD_EOff
	JR C,PD_SorE
	ADD A,96
	JR C,PD_NOTE
	ADD A,E
	JR C,PD_ORN
	ADD A,D
	JR C,PD_NOIS
	ADD A,E
	JR C,PD_ESAM
	ADD A,A
	LD E,A
	LD HL,SPCCOMS+#FF20-#2000
	ADD HL,DE
	LD E,(HL)
	INC HL
	LD D,(HL)
	PUSH DE
	JR PD_LOOP

PD_NOIS	LD (Ns_Base),A
	JR PD_LP2

PD_REL	RES 0,(IX-12+CHP.Flags)
	JR PD_RES

PD_NOTE	LD (IX-12+CHP.Note),A
	SET 0,(IX-12+CHP.Flags)
	XOR A

PD_RES	LD (PDSP_+1),SP
	LD SP,IX
	LD H,A
	LD L,A
	PUSH HL
	PUSH HL
	PUSH HL
	PUSH HL
	PUSH HL
	PUSH HL
PDSP_	LD SP,#3131

PD_FIN	LD A,(IX-12+CHP.NNtSkp)
	LD (IX-12+CHP.NtSkCn),A
	RET

C_PORTM LD A,(BC)
	INC BC
;SKIP PRECALCULATED TONE DELTA (BECAUSE
;CANNOT BE RIGHT AFTER PT3 COMPILATION)
	INC BC
	INC BC
	EX AF,AF'
	LD A,(BC) ;SIGNED TONE STEP
	INC BC
	LD (LoStep),A
	LD A,(BC)
	INC BC
	AND A
	EX AF,AF'
	LD L,(IX-12+CHP.CrTnSl)
	LD H,(IX-12+CHP.CrTnSl+1)

;Set portamento variables
;A - Delay; A' - Hi(Step); ZF' - (A'=0); HL - CrTnSl

SETPORT	RES 2,(IX-12+CHP.Flags)
	LD (IX-12+CHP.TnSlDl),A
	LD (IX-12+CHP.TSlCnt),A
	PUSH HL
	LD DE,NT_
	LD A,(IX-12+CHP.Note)
	LD (IX-12+CHP.SlToNt),A
	ADD A,A
	LD L,A
	LD H,0
	ADD HL,DE
	LD A,(HL)
	INC HL
	LD H,(HL)
	LD L,A
	PUSH HL
PrNote	LD A,#3E
	LD (IX-12+CHP.Note),A
	ADD A,A
	LD L,A
	LD H,0
	ADD HL,DE
	LD E,(HL)
	INC HL
	LD D,(HL)
	POP HL
	SBC HL,DE
	LD (IX-12+CHP.TnDelt),L
	LD (IX-12+CHP.TnDelt+1),H
	POP DE
Version EQU $+1
	LD A,#3E
	CP 6
	JR C,OLDPRTM ;Old 3xxx for PT v3.5-
PrSlide	LD DE,#1111
	LD (IX-12+CHP.CrTnSl),E
	LD (IX-12+CHP.CrTnSl+1),D
LoStep	EQU $+1
OLDPRTM	LD A,#3E
	EX AF,AF'
	JR Z,NOSIG
	EX DE,HL
NOSIG	SBC HL,DE
	JP P,SET_STP
	CPL
	EX AF,AF'
	NEG
	EX AF,AF'
SET_STP	LD (IX-12+CHP.TSlStp+1),A
	EX AF,AF'
	LD (IX-12+CHP.TSlStp),A
	LD (IX-12+CHP.COnOff),0
	RET

C_GLISS	SET 2,(IX-12+CHP.Flags)
	LD A,(BC)
	INC BC
	LD (IX-12+CHP.TnSlDl),A
	AND A
	JR NZ,GL36
	LD A,(Version) ;AlCo PT3.7+
	CP 7
	SBC A,A
	INC A
GL36	LD (IX-12+CHP.TSlCnt),A
	LD A,(BC)
	INC BC
	EX AF,AF'
	LD A,(BC)
	INC BC
	JR SET_STP

C_SMPOS	LD A,(BC)
	INC BC
	LD (IX-12+CHP.PsInSm),A
	RET

C_ORPOS	LD A,(BC)
	INC BC
	LD (IX-12+CHP.PsInOr),A
	RET

C_VIBRT	LD A,(BC)
	INC BC
	LD (IX-12+CHP.OnOffD),A
	LD (IX-12+CHP.COnOff),A
	LD A,(BC)
	INC BC
	LD (IX-12+CHP.OffOnD),A
	XOR A
	LD (IX-12+CHP.TSlCnt),A
	LD (IX-12+CHP.CrTnSl),A
	LD (IX-12+CHP.CrTnSl+1),A
	RET

C_ENGLS	LD A,(BC)
	INC BC
	LD (Env_Del),A
	LD (CurEDel),A
	LD A,(BC)
	INC BC
	LD L,A
	LD A,(BC)
	INC BC
	LD H,A
	LD (ESldAdd),HL
	RET

C_DELAY	LD A,(BC)
	INC BC
	LD (Delay),A
	RET

SETENV	LD (IX-12+CHP.Env_En),E
	LD (AYREGS+EnvTp),A
	LD A,(BC)
	INC BC
	LD H,A
	LD A,(BC)
	INC BC
	LD L,A
	LD (EnvBase),HL
	XOR A
	LD (IX-12+CHP.PsInOr),A
	LD (CurEDel),A
	LD H,A
	LD L,A
	LD (CurESld),HL
C_NOP	RET

SETORN	ADD A,A
	LD E,A
	LD D,0
	LD (IX-12+CHP.PsInOr),D
OrnPtrs EQU $+1
	LD HL,#2121
	ADD HL,DE
	LD E,(HL)
	INC HL
	LD D,(HL)
MDADDR2 EQU $+1
	LD HL,#2121
	ADD HL,DE
	LD (IX-12+CHP.OrnPtr),L
	LD (IX-12+CHP.OrnPtr+1),H
	RET

SETSAM	ADD A,A
	LD E,A
	LD D,0
SamPtrs EQU $+1
	LD HL,#2121
	ADD HL,DE
	LD E,(HL)
	INC HL
	LD D,(HL)
MDADDR1	EQU $+1
	LD HL,#2121
	ADD HL,DE
	LD (IX-12+CHP.SamPtr),L
	LD (IX-12+CHP.SamPtr+1),H
	RET

;ALL 16 ADDRESSES TO PROTECT FROM BROKEN PT3 MODULES
SPCCOMS DW C_NOP
	DW C_GLISS
	DW C_PORTM
	DW C_SMPOS
	DW C_ORPOS
	DW C_VIBRT
	DW C_NOP
	DW C_NOP
	DW C_ENGLS
	DW C_DELAY
	DW C_NOP
	DW C_NOP
	DW C_NOP
	DW C_NOP
	DW C_NOP
	DW C_NOP

CHREGS	XOR A
	LD (Ampl),A
	BIT 0,(IX+CHP.Flags)
	PUSH HL
	JP Z,CH_EXIT
	LD (CSP_+1),SP
	LD L,(IX+CHP.OrnPtr)
	LD H,(IX+CHP.OrnPtr+1)
	LD SP,HL
	POP DE
	LD H,A
	LD A,(IX+CHP.PsInOr)
	LD L,A
	ADD HL,SP
	INC A
		;PT2	PT3
OrnCP	INC A	;CP E	CP D
	JR C,CH_ORPS
OrnLD	DB 1	;LD A,D	LD A,E
CH_ORPS	LD (IX+CHP.PsInOr),A
	LD A,(IX+CHP.Note)
	ADD A,(HL)
	JP P,CH_NTP
	XOR A
CH_NTP	CP 96
	JR C,CH_NOK
	LD A,95
CH_NOK	ADD A,A
	EX AF,AF'
	LD L,(IX+CHP.SamPtr)
	LD H,(IX+CHP.SamPtr+1)
	LD SP,HL
	POP DE
	LD H,0
	LD A,(IX+CHP.PsInSm)
	LD B,A
	ADD A,A
SamClc2	ADD A,A ;or ADD A,B for PT2
	LD L,A
	ADD HL,SP
	LD SP,HL
	LD A,B
	INC A
		;PT2	PT3
SamCP	INC A	;CP E	CP D
	JR C,CH_SMPS
SamLD	DB 1	;LD A,D	LD A,E
CH_SMPS	LD (IX+CHP.PsInSm),A
	POP BC
	POP HL

;Convert PT2 sample to PT3
		;PT2		PT3
SamCnv	POP HL  ;BIT 2,C	JR e_
	POP HL
	LD H,B
	JR NZ,$+8
	EX DE,HL
	AND A
	SBC HL,HL
	SBC HL,DE
	LD D,C
	RR C
	SBC A,A
	CPL
	AND #3E
	RR C
	RR B
	AND C
	LD C,A
	LD A,B
	RRA
	RRA
	RR D
	RRA
	AND #9F
	LD B,A

e_	LD E,(IX+CHP.TnAcc)
	LD D,(IX+CHP.TnAcc+1)
	ADD HL,DE
	BIT 6,B
	JR Z,CH_NOAC
	LD (IX+CHP.TnAcc),L
	LD (IX+CHP.TnAcc+1),H
CH_NOAC EX DE,HL
	EX AF,AF'
	ADD A,NT_
	LD L,A
	ADC A,NT_/256
	SUB L
	LD H,A
	LD SP,HL
	POP HL
	ADD HL,DE
	LD E,(IX+CHP.CrTnSl)
	LD D,(IX+CHP.CrTnSl+1)
	ADD HL,DE
CSP_	LD SP,#3131
	EX (SP),HL
	XOR A
	OR (IX+CHP.TSlCnt)
	JR Z,CH_AMP
	DEC (IX+CHP.TSlCnt)
	JR NZ,CH_AMP
	LD A,(IX+CHP.TnSlDl)
	LD (IX+CHP.TSlCnt),A
	LD L,(IX+CHP.TSlStp)
	LD H,(IX+CHP.TSlStp+1)
	LD A,H
	ADD HL,DE
	LD (IX+CHP.CrTnSl),L
	LD (IX+CHP.CrTnSl+1),H
	BIT 2,(IX+CHP.Flags)
	JR NZ,CH_AMP
	LD E,(IX+CHP.TnDelt)
	LD D,(IX+CHP.TnDelt+1)
	AND A
	JR Z,CH_STPP
	EX DE,HL
CH_STPP SBC HL,DE
	JP M,CH_AMP
	LD A,(IX+CHP.SlToNt)
	LD (IX+CHP.Note),A
	XOR A
	LD (IX+CHP.TSlCnt),A
	LD (IX+CHP.CrTnSl),A
	LD (IX+CHP.CrTnSl+1),A
CH_AMP	LD A,(IX+CHP.CrAmSl)
	BIT 7,C
	JR Z,CH_NOAM
	BIT 6,C
	JR Z,CH_AMIN
	CP 15
	JR Z,CH_NOAM
	INC A
	JR CH_SVAM
CH_AMIN	CP -15
	JR Z,CH_NOAM
	DEC A
CH_SVAM	LD (IX+CHP.CrAmSl),A
CH_NOAM	LD L,A
	LD A,B
	AND 15
	ADD A,L
	JP P,CH_APOS
	XOR A
CH_APOS	CP 16
	JR C,CH_VOL
	LD A,15
CH_VOL	OR (IX+CHP.Volume)
	ADD A,VT_
	LD L,A
	ADC A,VT_/256
	SUB L
	LD H,A
	LD A,(HL)
CH_ENV	BIT 0,C
	JR NZ,CH_NOEN
	OR (IX+CHP.Env_En)
CH_NOEN	LD (Ampl),A
	BIT 7,B
	LD A,C
	JR Z,NO_ENSL
	RLA
	RLA
	SRA A
	SRA A
	SRA A
	ADD A,(IX+CHP.CrEnSl) ;SEE COMMENT BELOW
	BIT 5,B
	JR Z,NO_ENAC
	LD (IX+CHP.CrEnSl),A
NO_ENAC	LD HL,AddToEn
	ADD A,(HL) ;BUG IN PT3 - NEED WORD HERE
	LD (HL),A
	JR CH_MIX
NO_ENSL RRA
	ADD A,(IX+CHP.CrNsSl)
	LD (AddToNs),A
	BIT 5,B
	JR Z,CH_MIX
	LD (IX+CHP.CrNsSl),A
CH_MIX	LD A,B
	RRA
	AND #48
CH_EXIT	LD HL,AYREGS+Mixer
	OR (HL)
	RRCA
	LD (HL),A
	POP HL
	XOR A
	OR (IX+CHP.COnOff)
	RET Z
	DEC (IX+CHP.COnOff)
	RET NZ
	XOR (IX+CHP.Flags)
	LD (IX+CHP.Flags),A
	RRA
	LD A,(IX+CHP.OnOffD)
	JR C,CH_ONDL
	LD A,(IX+CHP.OffOnD)
CH_ONDL	LD (IX+CHP.COnOff),A
	RET

PLAY    XOR A
	LD (AddToEn),A
	LD (AYREGS+Mixer),A
	DEC A
	LD (AYREGS+EnvTp),A
	LD HL,DelyCnt
	DEC (HL)
	JP NZ,PL2
	LD HL,ChanA+CHP.NtSkCn
	DEC (HL)
	JR NZ,PL1B
AdInPtA EQU $+1
	LD BC,#0101
	LD A,(BC)
	AND A
	JR NZ,PL1A
	LD D,A
	LD (Ns_Base),A
CrPsPtr EQU $+1
	LD HL,#2121
	INC HL
	LD A,(HL)
	INC A
	JR NZ,PLNLP

	IF LoopChecker
	CALL CHECKLP
	ENDIF

LPosPtr EQU $+1
	LD HL,#2121
	LD A,(HL)
	INC A
PLNLP	LD (CrPsPtr),HL
	DEC A
		;PT2		PT3
PsCalc	DEC A	;ADD A,A	NOP
	DEC A	;ADD A,(HL)	NOP
	ADD A,A
	LD E,A
	RL D

	IF CurPosCounter
	LD A,L
PosSub	SUB #D6
	LD (CurPos),A
	ENDIF

PatsPtr EQU $+1
	LD HL,#2121
	ADD HL,DE
MODADDR	EQU $+1
	LD DE,#1111
	LD (PSP_+1),SP
	LD SP,HL
	POP HL
	ADD HL,DE
	LD B,H
	LD C,L
	POP HL
	ADD HL,DE
	LD (AdInPtB),HL
	POP HL
	ADD HL,DE
	LD (AdInPtC),HL
PSP_	LD SP,#3131
PL1A	LD IX,ChanA+12
	CALL PTDECOD
	LD (AdInPtA),BC

PL1B	LD HL,ChanB+CHP.NtSkCn
	DEC (HL)
	JR NZ,PL1C
	LD IX,ChanB+12
AdInPtB	EQU $+1
	LD BC,#0101
	CALL PTDECOD
	LD (AdInPtB),BC

PL1C	LD HL,ChanC+CHP.NtSkCn
	DEC (HL)
	JR NZ,PL1D
	LD IX,ChanC+12
AdInPtC	EQU $+1
	LD BC,#0101
	CALL PTDECOD
	LD (AdInPtC),BC

Delay	EQU $+1
PL1D	LD A,#3E
	LD (DelyCnt),A

PL2	LD IX,ChanA
	LD HL,(AYREGS+TonA)
	CALL CHREGS
	LD (AYREGS+TonA),HL
	LD A,(Ampl)
	LD (AYREGS+AmplA),A
	LD IX,ChanB
	LD HL,(AYREGS+TonB)
	CALL CHREGS
	LD (AYREGS+TonB),HL
	LD A,(Ampl)
	LD (AYREGS+AmplB),A
	LD IX,ChanC
	LD HL,(AYREGS+TonC)
	CALL CHREGS
	LD (AYREGS+TonC),HL

	LD HL,(Ns_Base_AddToNs)
	LD A,H
	ADD A,L
	LD (AYREGS+Noise),A

AddToEn EQU $+1
	LD A,#3E
	LD E,A
	ADD A,A
	SBC A,A
	LD D,A
	LD HL,(EnvBase)
	ADD HL,DE
	LD DE,(CurESld)
	ADD HL,DE
	LD (AYREGS+Env),HL

	XOR A
	LD HL,CurEDel
	OR (HL)
	JR Z,ROUT
	DEC (HL)
	JR NZ,ROUT
Env_Del	EQU $+1
	LD A,#3E
	LD (HL),A
ESldAdd	EQU $+1
	LD HL,#2121
	ADD HL,DE
	LD (CurESld),HL

ROUT
	IF ACBBAC
	LD A,(SETUP)
	AND 12
	JR Z,ABC
	ADD A,CHTABLE
	LD E,A
	ADC A,CHTABLE/256
	SUB E
	LD D,A
	LD B,0
	LD IX,AYREGS
	LD HL,AYREGS
	LD A,(DE)
	INC DE
	LD C,A
	ADD HL,BC
	LD A,(IX+TonB)
	LD C,(HL)
	LD (IX+TonB),C
	LD (HL),A
	INC HL
	LD A,(IX+TonB+1)
	LD C,(HL)
	LD (IX+TonB+1),C
	LD (HL),A
	LD A,(DE)
	INC DE
	LD C,A
	ADD HL,BC
	LD A,(IX+AmplB)
	LD C,(HL)
	LD (IX+AmplB),C
	LD (HL),A
	LD A,(DE)
	INC DE
	LD (RxCA1),A
	XOR 8
	LD (RxCA2),A
	LD HL,AYREGS+Mixer
	LD A,(DE)
	AND (HL)
	LD E,A
	LD A,(HL)
RxCA1	LD A,(HL)
	AND %010010
	OR E
	LD E,A
	LD A,(HL)
	AND %010010
RxCA2	OR E
	OR E
	LD (HL),A
ABC
	ENDIF

	IF RC
	XOR A
	LD C,#D8
	LD HL,AYREGS
LOUT	OUT (C),A
	LD C,#D0
	OUTI
	LD C,#D8
	INC A
	CP 13
	JR NZ,LOUT
	OUT (C),A
	LD A,(HL)
	AND A
	RET M
	LD C,#D0
	OUT (C),A
	RET
	ENDIF

	IF ZX
	XOR A
	LD DE,#FFBF
	LD BC,#FFFD
	LD HL,AYREGS
LOUT	OUT (C),A
	LD B,E
	OUTI
	LD B,D
	INC A
	CP 13
	JR NZ,LOUT
	OUT (C),A
	LD A,(HL)
	AND A
	RET M
	LD B,E
	OUT (C),A
	RET
	ENDIF

	IF MSX
;MSX version of ROUT (c)Dioniso
	XOR A
	LD C,#A0
	LD HL,AYREGS
LOUT	OUT (C),A
	INC C
	OUTI
	DEC C
	INC A
	CP 13
	JR NZ,LOUT
	OUT (C),A
	LD A,(HL)
	AND A
	RET M
	INC C
	OUT (C),A
	RET
	ENDIF

	IF ACBBAC
CHTABLE	EQU $-4
	DB 4,5,15,%001001,0,7,7,%100100
	ENDIF

NT_DATA	DB (T_NEW_0-T1_)*2
	DB TCNEW_0-T_
	DB (T_OLD_0-T1_)*2+1
	DB TCOLD_0-T_
	DB (T_NEW_1-T1_)*2+1
	DB TCNEW_1-T_
	DB (T_OLD_1-T1_)*2+1
	DB TCOLD_1-T_
	DB (T_NEW_2-T1_)*2
	DB TCNEW_2-T_
	DB (T_OLD_2-T1_)*2
	DB TCOLD_2-T_
	DB (T_NEW_3-T1_)*2
	DB TCNEW_3-T_
	DB (T_OLD_3-T1_)*2
	DB TCOLD_3-T_

T_

TCOLD_0	DB #00+1,#04+1,#08+1,#0A+1,#0C+1,#0E+1,#12+1,#14+1
	DB #18+1,#24+1,#3C+1,0
TCOLD_1	DB #5C+1,0
TCOLD_2	DB #30+1,#36+1,#4C+1,#52+1,#5E+1,#70+1,#82,#8C,#9C
	DB #9E,#A0,#A6,#A8,#AA,#AC,#AE,#AE,0
TCNEW_3	DB #56+1
TCOLD_3	DB #1E+1,#22+1,#24+1,#28+1,#2C+1,#2E+1,#32+1,#BE+1,0
TCNEW_0	DB #1C+1,#20+1,#22+1,#26+1,#2A+1,#2C+1,#30+1,#54+1
	DB #BC+1,#BE+1,0
TCNEW_1 EQU TCOLD_1
TCNEW_2	DB #1A+1,#20+1,#24+1,#28+1,#2A+1,#3A+1,#4C+1,#5E+1
	DB #BA+1,#BC+1,#BE+1,0

PT3EMPTYORN EQU $-1
	DB 1,0

;first 12 values of tone tables (packed)

T_PACK	DB #06EC*2/256,#06EC*2
	DB #0755-#06EC
	DB #07C5-#0755
	DB #083B-#07C5
	DB #08B8-#083B
	DB #093D-#08B8
	DB #09CA-#093D
	DB #0A5F-#09CA
	DB #0AFC-#0A5F
	DB #0BA4-#0AFC
	DB #0C55-#0BA4
	DB #0D10-#0C55
	DB #066D*2/256,#066D*2
	DB #06CF-#066D
	DB #0737-#06CF
	DB #07A4-#0737
	DB #0819-#07A4
	DB #0894-#0819
	DB #0917-#0894
	DB #09A1-#0917
	DB #0A33-#09A1
	DB #0ACF-#0A33
	DB #0B73-#0ACF
	DB #0C22-#0B73
	DB #0CDA-#0C22
	DB #0704*2/256,#0704*2
	DB #076E-#0704
	DB #07E0-#076E
	DB #0858-#07E0
	DB #08D6-#0858
	DB #095C-#08D6
	DB #09EC-#095C
	DB #0A82-#09EC
	DB #0B22-#0A82
	DB #0BCC-#0B22
	DB #0C80-#0BCC
	DB #0D3E-#0C80
	DB #07E0*2/256,#07E0*2
	DB #0858-#07E0
	DB #08E0-#0858
	DB #0960-#08E0
	DB #09F0-#0960
	DB #0A88-#09F0
	DB #0B28-#0A88
	DB #0BD8-#0B28
	DB #0C80-#0BD8
	DB #0D60-#0C80
	DB #0E10-#0D60
	DB #0EF8-#0E10

; ---- Player screen: thoughts/shared/design/player-ui/player-screens.html entry 'zx', drawn with the screen.inc tiles.
; Static parts once before playback (SCRINIT); per frame (SCRFRAME, after PLAY wrote the AY) the three bars, the clock
; and every 8th frame the coarse scroller. The worst frame (all bars jump 0 -> full) stays well inside the 69888 T frame,
; so the HALT after it still catches the next interrupt and the AY writes keep their frames.
; Colours (design npal(ZX_HW)): text bright white #47, dim white #07, bar yellow #06, cap + time cyan #05, logo red #02.
NBARS	EQU 3			; stubs for screen.inc's NES-style screen_static, which this player does not call
chiptxt	EQU s_chip
statustxt EQU s_chip
bartxt	EQU s_chip
scrtxt	EQU msgbuf
SCRLEN	EQU 33
BARTOP	EQU 40			; bar rows 5-18: pixel lines 40-151
BARBOT	EQU 152

SCRINIT	XOR A
	OUT (#FE),A
	LD HL,#4000
	LD DE,#4001
	LD BC,#1AFF
	LD (HL),A
	LDIR
	LD HL,s_attr
.a1	LD D,(HL)
	LD A,D
	CP #FF
	JR Z,.a9
	INC HL
	LD E,(HL)
	INC HL
	LD B,(HL)
	INC HL
	LD C,(HL)
	INC HL
	PUSH HL
	CALL attrptr
.a2	LD (HL),C
	INC HL
	DJNZ .a2
	POP HL
	JR .a1
.a9	LD HL,MDLADDR+30	; PT3 header: title at +30, author at +66 (32 characters each)
	LD DE,titlebuf
	LD B,32
	CALL scrsan
	LD HL,MDLADDR+66
	LD DE,authbuf
	LD B,32
	CALL scrsan
	LD DE,msgbuf		; scroller: DEVILBOX - <title> BY <author> - AY-3-8912 (design 2600 marquee; PT3 has no comments)
	LD HL,m_head
	LD BC,11
	LDIR
	LD HL,titlebuf
	CALL scrcpy
	LD HL,authbuf
	LD B,32
.m1	LD A,(HL)		; author all spaces: leave out " BY "
	INC HL
	CP " "
	JR NZ,.m2
	DJNZ .m1
	JR .m3
.m2	LD HL,m_by
	LD BC,4
	LDIR
	LD HL,authbuf
	CALL scrcpy
.m3	LD HL,m_tail
	LD BC,m_end-m_tail
	LDIR
	LD (msgend),DE
	LD HL,s_text
	CALL st1		; screen.inc's text-table loop (row, col, length, string; #FF ends)
	LD A,73			; play glyph
	LD DE,20*256+1
	CALL puttile
	LD HL,msgbuf		; scroller row 22, columns 1-30
	LD DE,22*256+1
.s1	PUSH HL
	LD A,(HL)
	SUB #20
	CALL puttile
	POP HL
	CALL msgnext
	INC E
	LD A,E
	CP 31
	JR NZ,.s1
	LD (msgin),HL
	RET

scrsan	LD A,(HL)		; B characters HL -> DE, lower case folded, outside #20-#5F shown as ?
	CP "a"
	JR C,.n1
	CP "z"+1
	JR NC,.n1
	SUB #20
.n1	CP #20
	JR C,.n2
	CP #60
	JR C,.n3
.n2	LD A,"?"
.n3	LD (DE),A
	INC HL
	INC DE
	DJNZ scrsan
	RET

scrcpy	PUSH HL			; HL 32-character field -> DE without its trailing spaces
	LD BC,32
	ADD HL,BC
	LD B,C
.t1	DEC HL
	LD A,(HL)
	CP " "
	JR NZ,.t2
	DJNZ .t1
	POP HL
	RET
.t2	LD C,B
	LD B,0
	POP HL
	LDIR
	RET

msgnext	INC HL			; HL = next scroller character, wrapping at msgend; keeps DE
	PUSH DE
	LD DE,(msgend)
	OR A
	SBC HL,DE
	ADD HL,DE
	POP DE
	RET C
	LD HL,msgbuf
	RET

SCRFRAME
	LD IX,barst
	LD HL,AYREGS+AmplA
	LD B,3
.b1	PUSH BC
	PUSH HL
	LD A,(HL)		; driver volume 0-15, hardware envelope = 15
	BIT 4,A
	JR Z,.b2
	LD A,15
.b2	AND 15
	LD E,A
	LD D,0
	LD HL,voltab
	ADD HL,DE
	LD C,(HL)		; C = target height in pixels
	LD A,(IX+0)		; instant attack, fall 3 pixels a frame
	CP C
	JR C,.b4
	SUB 3
	JR C,.b4
	CP C
	JR NC,.b5
.b4	LD A,C
.b5	LD (IX+0),A
	CP (IX+1)		; peak cap: holds 32 frames, then falls 1 pixel a frame
	JR C,.b6
	LD (IX+1),A
	LD (IX+2),32
	JR .b8
.b6	LD A,(IX+2)
	OR A
	JR Z,.b7
	DEC (IX+2)
	JR .b8
.b7	LD A,(IX+1)
	DEC A
	CP (IX+0)
	JR NC,.b7a
	LD A,(IX+0)
.b7a	LD (IX+1),A
.b8	LD A,(IX+3)		; old threshold and cap lines
	LD (otr),A
	LD A,(IX+5)
	LD (ocb),A
	LD A,(IX+4)
	LD (ocy),A
	LD A,BARBOT
	SUB (IX+0)
	LD (IX+3),A		; thr: lines >= thr are lit
	LD DE,#FFFF
	LD A,(IX+1)
	OR A
	JR Z,.b9
	LD A,BARBOT-2		; cy = max(top, bot - cap - 2); the cap cell is (cy + 1) >> 3, cy shows only inside it
	SUB (IX+1)
	CP BARTOP
	JR NC,.b8a
	LD A,BARTOP
.b8a	LD D,A
	INC A
	LD E,A
	AND 7
	JR NZ,.b9
	LD D,#FF
.b9	LD (IX+4),D
	LD (IX+5),E
	LD A,(otr)		; cells between the old and new threshold
	LD C,A
	LD A,(IX+3)
	CP C
	JR Z,.c3
	JR C,.c1
	LD L,A
	LD A,C
	LD C,L
.c1	DEC C			; A = low line, C = high line - 1
	RRCA
	RRCA
	RRCA
	AND #1F
	LD L,A
	LD A,C
	RRCA
	RRCA
	RRCA
	AND #1F
	LD H,A
.c2	LD D,L
	PUSH HL
	CALL barcell
	POP HL
	LD A,L
	INC L
	CP H
	JR NZ,.c2
.c3	LD A,(ocb)		; cap moved: redraw the old and the new cap cell
	CP (IX+5)
	JR NZ,.c4
	LD A,(ocy)
	CP (IX+4)
	JR Z,.c6
.c4	LD A,(ocb)
	CALL capcell
	LD A,(IX+5)
	CALL capcell
.c6	LD DE,7
	ADD IX,DE
	POP HL
	INC HL
	POP BC
	DEC B
	JP NZ,.b1
	LD HL,clkfr		; clock MM:SS, one second = 50 frames
	INC (HL)
	LD A,(HL)
	CP 50
	JR C,.k9
	LD (HL),0
	LD HL,clocktxt+4
	LD B,4
.k1	INC (HL)
	LD A,(HL)
	CP "9"+1
	JR Z,.k2
	CP "6"
	JR NZ,.k3
	LD A,B
	CP 3
	JR NZ,.k3
.k2	LD (HL),"0"
	DEC HL
	LD A,B
	CP 3
	JR NZ,.k2a
	DEC HL			; skip ':'
.k2a	DJNZ .k1
.k3	LD HL,clocktxt
	LD B,5
	LD DE,20*256+3
	CALL puttext
.k9	LD HL,scrfr		; coarse scroller: one character every 8 frames
	INC (HL)
	LD A,(HL)
	AND 7
	RET NZ
	LD HL,#50C2		; row 22 column 2 -> column 1, 8 pixel lines
	LD B,8
.r1	PUSH BC
	PUSH HL
	LD D,H
	LD E,#C1
	LD BC,29
	LDIR
	POP HL
	POP BC
	INC H
	DJNZ .r1
	LD HL,(msgin)
	LD A,(HL)
	SUB #20
	CALL msgnext
	LD (msgin),HL
	LD DE,22*256+30
	JP puttile

capcell	CP #FF			; A = cap line (or #FF): redraw its cell
	RET Z
	RRCA
	RRCA
	RRCA
	AND #1F
	LD D,A
barcell				; D = row of bar IX: pixels from (IX+3..5), attribute cap colour on the cap cell
	LD E,(IX+6)
	PUSH DE
	CALL cellptr
	LD A,D
	ADD A,A
	ADD A,A
	ADD A,A
	LD C,A			; C = first line of the cell
	LD D,(IX+3)
	LD A,(IX+5)
	AND #F8
	CP C
	JR Z,.g1		; the cap cell: line by line
	LD A,C
	CP D
	JR NC,.f2		; whole cell at or below the threshold: lit
	ADD A,7
	CP D
	JR NC,.g1		; threshold inside the cell
	XOR A
	JR .f1
.f2	LD A,#FF
.f1	LD B,A
	RES 0,B
	DUP 8
	LD (HL),A
	INC L
	LD (HL),A
	INC L
	LD (HL),A
	INC L
	LD (HL),B
	DEC L
	DEC L
	DEC L
	INC H
	EDUP
	JR .g9
.g1	LD E,(IX+4)
	LD B,(IX+5)
.g2	LD A,C
	CP D
	JR NC,.g3
	CP E
	JR Z,.g3
	CP B
	JR Z,.g3
	XOR A
	JR .g4
.g3	LD A,#FF
.g4	LD (HL),A
	INC L
	LD (HL),A
	INC L
	LD (HL),A
	INC L
	AND #FE
	LD (HL),A
	DEC L
	DEC L
	DEC L
	INC H
	INC C
	LD A,C
	AND 7
	JR NZ,.g2
.g9	POP DE
	CALL attrptr
	LD A,(IX+5)
	RRCA
	RRCA
	RRCA
	AND #1F
	CP D
	LD A,#06
	JR NZ,.h1
	LD A,#05
.h1	LD (HL),A
	INC L
	LD (HL),A
	INC L
	LD (HL),A
	INC L
	LD (HL),A
	RET

; 7 bytes per bar: 0 level, 1 cap, 2 hold, 3 thr, 4 cap line cy (#FF = hidden), 5 cap line cy + 1 (#FF = no cap), then column
barst	DB 0,0,0,BARBOT,#FF,#FF,10
	DB 0,0,0,BARBOT,#FF,#FF,14
	DB 0,0,0,BARBOT,#FF,#FF,18
voltab				; round(v * 112 / 15)
v = 0
	DUP 16
	DB (v * 112 * 2 + 15) / 30
v = v + 1
	EDUP
otr	DB 0
ocb	DB 0
ocy	DB 0
clkfr	DB 0
scrfr	DB 0
msgin	DW 0
msgend	DW 0
clocktxt DB "00:00"
; row, col, length, attribute
s_attr	DB 1,1,8,#02, 1,10,21,#47, 2,1,30,#07, 3,1,9,#06, 3,20,11,#07
r = 5
	DUP 14
	DB r,10,12,#06
r = r + 1
	EDUP
	DB 19,11,9,#07, 20,1,7,#05, 20,23,8,#47, 22,1,30,#47, #FF
; row, col, length, string (design layout(): logo, title, BY author, chip + platform, labels, time, song)
s_text	DB 1,1,8
	DW s_logo
	DB 1,10,21
	DW titlebuf
	DB 2,1,3
	DW s_by
	DB 2,4,27
	DW authbuf
	DB 3,1,9
	DW s_chip
	DB 3,20,11
	DW s_plat
	DB 19,11,1
	DW s_lab
	DB 19,15,1
	DW s_lab+1
	DB 19,19,1
	DW s_lab+2
	DB 20,3,5
	DW clocktxt
	DB 20,23,8
	DW s_song
	DB #FF
s_logo	DB "DEVILBOX"
s_by	DB "BY "
s_chip	DB "AY-3-8912"
s_plat	DB "ZX SPECTRUM"
s_lab	DB "123"
s_song	DB "SONG 1/1"
m_head	DB "DEVILBOX - "
m_by	DB " BY "
m_tail	DB " - AY-3-8912   "
m_end
titlebuf DS 32
authbuf	DS 32
msgbuf	DS 11 + 32 + 4 + 32 + 15
	include "screen.inc"


;vars from here can be stripped
;you can move VARS to any other address

VARS

;ChannelsVars
	STRUCT	CHP
;reset group
PsInOr	DB 0
PsInSm	DB 0
CrAmSl	DB 0
CrNsSl	DB 0
CrEnSl	DB 0
TSlCnt	DB 0
CrTnSl	DW 0
TnAcc	DW 0
COnOff	DB 0
;reset group

OnOffD	DB 0

;IX for PTDECOD here (+12)
OffOnD	DB 0
OrnPtr	DW 0
SamPtr	DW 0
NNtSkp	DB 0
Note	DB 0
SlToNt	DB 0
Env_En	DB 0
Flags	DB 0
 ;Enabled - 0,SimpleGliss - 2
TnSlDl	DB 0
TSlStp	DW 0
TnDelt	DW 0
NtSkCn	DB 0
Volume	DB 0
	ENDS

ChanA	DS CHP
ChanB	DS CHP
ChanC	DS CHP

;GlobalVars
DelyCnt	DB 0
CurESld	DW 0
CurEDel	DB 0
Ns_Base_AddToNs
Ns_Base	DB 0
AddToNs	DB 0

AYREGS

VT_	DS 256 ;CreatedVolumeTableAddress

EnvBase	EQU VT_+14

T1_	EQU VT_+16 ;Tone tables data depacked here

T_OLD_1	EQU T1_
T_OLD_2	EQU T_OLD_1+24
T_OLD_3	EQU T_OLD_2+24
T_OLD_0	EQU T_OLD_3+2
T_NEW_0	EQU T_OLD_0
T_NEW_1	EQU T_OLD_1
T_NEW_2	EQU T_NEW_0+24
T_NEW_3	EQU T_OLD_3

PT2EMPTYORN EQU VT_+31 ;1,0,0 sequence

NT_	DS 192 ;CreatedNoteTableAddress

;local var
Ampl	EQU AYREGS+AmplC

VAR0END	EQU VT_+16 ;INIT zeroes from VARS to VAR0END-1

VARSEND EQU $
