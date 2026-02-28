FOLLOWMOUSE = 8
PROPGADGET = 3
AUTOKNOB = 1
FREEVERT = 4


FileRequest:               ;FileRequester-Routine (D0=Zeiger auf Filenamen)
     bsr FindEnd           ;sucht rückwärts nach / oder : im Pfadnamen
     bset #7,F_Gadget12+13
     bset #7,F_Gadget13+13
     bset #7,F_Gadget14+13
     bset #7,F_Gadget15+13
     bset #7,F_Gadget16+13
     bset #7,F_Gadget17+13
     bset #7,F_Gadget18+13
     bset #7,F_Gadget19+13
     bset #7,F_Gadget20+13
     bset #7,F_Gadget21+13
     bsr ReqOpen           ;Requester öffnen
     bclr #7,F_Gadget12+13
     bclr #7,F_Gadget13+13
     bclr #7,F_Gadget14+13
     bclr #7,F_Gadget15+13
     bclr #7,F_Gadget16+13
     bclr #7,F_Gadget17+13
     bclr #7,F_Gadget18+13
     bclr #7,F_Gadget19+13
     bclr #7,F_Gadget20+13
     bclr #7,F_Gadget21+13
     bsr ShowList
     tst.b Requesterflag   ;schon mal aufgerufen ?
     bne Loop2             ;ja, dann zu weiter1
Loop1:
     clr.b first           ;1. sichtbarer Eintrag
     clr.b Requesterflag
     clr.b Entries         ;aktuelle Anzahl von Einträgen
     clr.w F_PropInfo+4
     bsr Anzeige_loeschen
     bsr Clr_Rest
     bsr ShowList
     move.l dosbase,a6
     move.l #StrPuffer1,d1
     move.l #Access_Read,d2
     jsr Lock(a6)
     tst.l d0
     beq DiskError2
     move.l d0,locksav
     move.l d0,d1
     move.l #fileinfo,d2
     jsr Examine(a6)
     tst.l d0
     beq DiskError
Loop2:
     tst.b Requesterflag   ;noch weitere Einträge ?
     beq.s weiter1
     move.l ExecBase,a6    ;nein, dann auf Message warten
     move.l windowhd,a0
     move.l 86(a0),a0
     jsr WaitPort(a6)      ;auf Beantwortung warten
     bra weiter2
weiter1:
     move.l dosbase,a6
     move.l locksav,d1
     move.l #fileinfo,d2
     jsr ExNext(a6)        ;nächsten Directory-Eintrag holen
     tst.l d0              ;keiner mehr ?
     beq.s Alles_Roger     ;dann zu Alle_Bestimmt (Unlock etc.)
     bsr Einsortieren      ;sonst Filenamen einsortieren
     cmp.b #200,Entries
     bne.s weiter3aa
Alles_Roger:
     bsr Create_ShowList
     bsr ShowList
     bra Alle_Bestimmt
weiter3aa:
     move.b Entries,d0
     and.b #3,d0
     bne.s weiter2
weiter3:
     bsr Create_ShowList   ;Gadgets neu berechnen
     bsr ShowList          ;8 Filenamen anzeigen
weiter2:
     move.l ExecBase,a6
     move.l windowhd,a0
     move.l 86(a0),a0
     jsr GetMsg(a6)        ;Message vorhanden ?
     tst.l d0
     beq Loop2             ;nein, dann zurück zu Loop2
     move.l d0,a1
     move.l $14(a1),Ereignis
     move.l $1c(a1),a0
     move.l a0,Gadget_Pointer
     move.w 38(a0),GadgetID
     jsr ReplyMsg(a6)      ;Message beantworten
     cmp.l #$10,Ereignis   ;Mousemove ?
     beq Schieberegler
     cmp.l #$40,Ereignis   ;ungültige Message ?
     bne Loop2             ;ja, dann zurück zu Loop2
     cmp.w #20,GadgetID    ;LOAD ?
     bne xxx1
Lets_Load:
     lea StrPuffer1,a0
wloop1:
     tst.b (a0)+
     bne.s wloop1
     subq.l #1,a0
     lea StrPuffer2,a1
wloop2:
     move.b (a1)+,(a0)+
     tst.b -1(a1)
     bne.s wloop2
     move.l #StrPuffer1,d0
     bra Ende
xxx1:
     cmp.w #4,GadgetID     ;ein Filename angeklickt ?
     blo xxx2
     cmp.w #11,GadgetID
     bhi xxx2
     subq.w #4,GadgetID
     clr.l d0
     move.w GadgetID,d0
     add.b First,d0
     mulu #38,d0
     move.l PufferAdr,a0
     tst.b 0(a0,d0.w)      ;überhaupt ein File vorhanden ?
     beq Loop2             ;nein, dann abbrechen
     btst #7,31(a0,d0.w)   ;Directory ?
     bne xxx1a             ;nein, dann zu xxx1a
     lea StrPuffer1,a1
xxx1_Loop1:
     tst.b (a1)+           ;Schlußbyte im Pfad suchen
     bne.s xxx1_Loop1
     subq.l #1,a1
xxx1_Loop2:
     move.b 0(a0,d0.w),(a1)+  ;Dir-Name an den Pfad anhängen
     addq.w #1,d0
     tst.b 0(a0,d0.w)
     bne.s xxx1_Loop2
     move.b #"/",(a1)+
     clr.b (a1)
weiter4:
     tst.b Requesterflag
     bne.s weiter4a
     move.l locksav,d1     ;durch Lock belegten Speicher freigeben
     move.l dosbase,a6
     jsr UnLock(a6)
weiter4a:
     bra Loop1
xxx1a:
     lea StrPuffer2,a1
xxx1_Loop3:
     move.b 0(a0,d0.w),(a1)+
     addq.w #1,d0
     tst.b 0(a0,d0.w)
     bne.s xxx1_Loop3
     clr.b (a1)
     bsr ShowList
     bra Loop2
xxx2:
     cmp.w #13,GadgetID    ;Instruments: ?
     bne xxx3
     move.l #"Inst",Strpuffer1
     move.l #"rume",Strpuffer1+4
     move.l #"nts:",Strpuffer1+8
     clr.b Strpuffer1+12
     bra.s weiterx2
weiterx:
     move.l d0,Strpuffer1
     clr.b Strpuffer1+4
weiterx2:
     clr.w F_F_Gadget1SInfo+8
     bra weiter4
xxx3:
     cmp.w #14,GadgetID    ;df0: ?
     bne xxx4
     move.l #"df0:",d0
     bra weiterx
xxx4:
     cmp.w #15,GadgetID    ;df1: ?
     bne xxx5
     move.l #"df1:",d0
     bra weiterx
xxx5:
     cmp.w #16,GadgetID    ;df2: ?
     bne xxx6
     move.l #"df2:",d0
     bra weiterx
xxx6:
     cmp.w #17,GadgetID    ;ram: ?
     bne xxx7
     move.l #"ram:",d0
     bra weiterx
xxx7:
     cmp.w #18,GadgetID    ;dh0: ?
     bne xxx8
     move.l #"dh0:",d0
     bra weiterx
xxx8:
     cmp.w #19,GadgetID    ;jh0: ?
     bne xxx9
     move.l #"jh0:",d0
     bra weiterx
xxx9:
     cmp.w #22,GadgetID    ;CANCEL ?
     bne xxx10
     clr.l d0
     bra Ende
xxx10:
     cmp.w #3,GadgetID     ;Schieberegler ?
     bne xxx11
Schieberegler:
     cmp.b #8,Entries      ;weniger als 8 Einträge
     bhi.s xxx10a
     clr.b first
     bra weiter3
xxx10a:
     move.b first,d2
     clr.l d0
     move.b Entries,d0
     sub.b #8,d0
     mulu F_PropInfo+4,d0
     divu #65535,d0
     move.b d0,first
     cmp.b first,d2
     beq weiter2
     bra weiter3
xxx11:
     cmp.w #1,GadgetID     ;Path:
     bne xxx12
     lea StrPuffer1,a0
     tst.b (a0)            ;Pfadname vorhanden ?
     beq.s xxx11a          ;nein, dann weiter
xxx11b:
     tst.b (a0)+
     bne.s xxx11b
     cmp.b #"/",-2(a0)
     beq.s xxx11a
     cmp.b #":",-2(a0)
     beq.s xxx11a
     move.b #"/",-1(a0)
     clr.b (a0)
xxx11a:
     bra weiter4
xxx12:
     cmp.w #21,GadgetID    ;Parent ?
     bne xxx13
     lea StrPuffer1,a0
     tst.b (a0)
     beq weiter2
xxx12a:
     tst.b (a0)+
     bne.s xxx12a
     cmp.b #"/",-2(a0)
     bne weiter2
     subq.l #2,a0
xxx12b:
     cmp.b #":",-(a0)
     beq.s xxx12c
     cmp.b #"/",(a0)
     beq.s xxx12c
     cmp.l #StrPuffer1,a0
     bne.s xxx12b
     clr.b StrPuffer1
xxx12c:
     clr.b 1(a0)
     bra weiter4
xxx13:
     cmp.w #12,GadgetID    ;Typ ?
     bne.s xxx14
     bra weiter4
xxx14:
     cmp.w #2,GadgetID     ;Name ?
     bne.s xxx15
     bra Lets_Load
xxx15:
     bra weiter2


Einsortieren:              ;sortiert den aktuellen Filenamen in die
     lea F_F_Gadget11SIBuff,a0
     lea FileInfo+8,a1
     tst.b (a0)
     beq Eins_m2           ;ok, keine Typ-Beschreibung vorhanden
     btst #7,FileInfo+4
     beq Eins_m2           ;ok, Eintrag ist ein Directory
     move.l a1,a2
Eins_Loop2:
     tst.b (a2)
     beq Eins_nein         ;falls kein '.' vorhanden, dann nicht einsort.
     cmp.b #".",(a2)+
     bne.s Eins_Loop2
Eins_Loop3:
     tst.b (a2)
     beq.s Eins_m3
     tst.b (a0)
     beq Eins_nein
     move.b (a2)+,d0
     bsr UpperCase
     move.b d0,d2
     move.b (a0)+,d0
     bsr UpperCase
     cmp.b d0,d2
     beq.s Eins_Loop3
     bra Eins_nein
Eins_m3:
     tst.b (a0)
     bne Eins_nein
Eins_m2:
     clr.b d0
     btst #7,FileInfo+4
     beq.s Eins_m4
     bsr Find_Position     ;sucht Einfügeposition für Filenamen
Eins_m4:
     bsr Insert
Eins_nein:
     rts

Insert:                    ;ab d0 bis Entries einen Eintrag einschieben
     move.l PufferAdr,a1
     move.b Entries,d1
     beq Insert_fertig
     move.l PufferAdr,a0
     clr.l d2
     move.b d1,d2
     mulu #38,d2
     add.l d2,a0
     sub.l #1,a0
     clr.l d2
     move.b d0,d2
     mulu #38,d2
     add.l d2,a1
     cmp.b Entries,d0
     beq.s Insert_Fertig
     subq.l #1,a1
Insert_loop1:
     move.b (a0),38(a0)
     subq.l #1,a0
     cmp.l a0,a1
     bne.s Insert_loop1
     addq.l #1,a1
Insert_fertig:
     lea FileInfo+8,a0
     move.l a1,a3          ;a1 merken (Zeiger auf richtigen Platz)
     move.b #30,d1
Insert_Loop2:
     move.b (a0)+,(a1)+
     beq.s Insert_m1
     subq.b #1,d1
     bne.s Insert_Loop2    ;30 Bytes übertragen
Insert_m1:
     clr.b (a1)            ;Namen auf jeden Fall mit 0 abschliessen
     move.b FileInfo+4,31(a3) ;FileInfo+4 merken
     addq.b #1,Entries     ;Eintraganzahl erhöhen
     rts

UpperCase:                 ;wandelt Zeichen in d0 in Großbuchstaben
     cmp.b #"a",d0
     blo.s UC_m1
     cmp.b #"z",d0
     bhi.s UC_m1
     sub.b #$20,d0
UC_m1:
     rts

Find_Position:		   ;findet richtige Insertposition
     move.b Entries,d0
     beq.s UC_m1
     clr.b d7
     move.l PufferAdr,a0
     lea FileInfo+8,a1
FiPo_Loop1:
     tst.b (a0)
     beq FiPo_m1
     btst #7,31(a0)
     bne.s FiPo_m2
FiPo_m3:
     addq.b #1,d7
     add.l #38,a0
     bra.s FiPo_Loop1
FiPo_m2:
     clr.l d1
FiPo_Loop2:
     move.b 0(a0,d1.w),d0
     bne.s FiPo_m4
     tst.b 0(a1,d1.w)
     beq FiPo_m1
     bra FiPo_m3
FiPo_m4:
     bsr UpperCase
     move.b d0,d2
     move.b 0(a1,d1.w),d0
     beq FiPo_m1
     bsr UpperCase
     cmp.b d0,d2
     bcs FiPo_m3
     bhi.s FiPo_m1
     addq.w #1,d1
     bra.s FiPo_Loop2
FiPo_m1:
     move.b d7,d0
     rts

Anzeige_loeschen:
     move.b #8,d0
     lea F_ITextText2,a0
ShLoop1:
     move.b #30,d1
ShLoop2:
     move.b #" ",(a0)+
     subq.b #1,d1
     bne.s ShLoop2
     clr.w (a0)+
     subq.b #1,d0
     bne.s ShLoop1
     rts

Create_ShowList:           ;schreibt 8 Filenamen in die entspr. Gadgets
     bsr Anzeige_loeschen
     move.b #8,d0          ;max. 8 Namen anzeigen
     clr.l d2
     lea F_ITextText2,a0
     move.l PufferAdr,a1
ShLoop4:
     move.l a0,a2
     clr.l d1
     move.b first,d1
     mulu #38,d1
     lea F_IText2,a3
     move.b #2,0(a3,d2.w)
     btst #7,31(a1,d1.w)   ;Directory ?
     bne.s ShLoop3
     move.b #0,0(a3,d2.w)  ;ja, dann Farbe auf Dunkelgrau
ShLoop3:
     tst.b 0(a1,d1.w)
     beq.s Sh_m1
     move.b 0(a1,d1.w),(a0)+
     addq.w #1,d1
     bra.s ShLoop3
Sh_m1:
     add.l #38,a1
     move.l a2,a0
     add.l #32,a0
     add.l #20,d2
     subq.b #1,d0
     bne.s ShLoop4
     rts

ShowList:                  ;führt Refresh-Gadgets aus
     move.w #65535,F_PropInfo+8
     cmp.b #8,Entries
     bls.s ShowList2
     clr.l d0
     move.b Entries,d0
     subq.b #1,d0
     lsr.w #3,d0
     addq.w #1,d0
     move.l #65535,d1
     divu d0,d1
     move.w d1,F_PropInfo+8
ShowList2:
     lea 0,a2
     lea F_Gadget1,a0
     move.l windowhd,a1
     move.l intbase,a6
     jsr RefreshGadgets(a6)
     rts

DiskError:
     clr.b Entries
     bra Alle_Bestimmt     ;füllt alle restlichen Einträge mit 0 + Unlock
DiskError2:
     bra Alle_Bestimmt2    ;füllt alle restlichen Einträge mit 0

Alle_Bestimmt:
     move.l locksav,d1     ;durch Lock belegten Speicher freigeben
     move.l dosbase,a6
     jsr UnLock(a6)
Alle_Bestimmt2:
     move.b #$ff,Requesterflag
     bsr Clr_Rest
     bra weiter2

Clr_Rest:
     move.l PufferAdr,d0
     add.l #200*38,d0
     clr.l d1
     move.b Entries,d1
     mulu #38,d1
     add.l PufferAdr,d1
     move.l d1,a4
Clr_Rest1:                 ;von (a4) bis zum Eintragsspeicherende löschen
     cmp.l a4,d0
     beq.s Clr_Rest2
     clr.b (a4)+
     bra.s Clr_Rest1
Clr_Rest2:
     rts

FindEnd:                   ;sucht Ende des Pfadnamen und löscht evtl. Filen.
     lea strpuffer1,a0
     move.w #0,d0
FindLoop1:                 ;von vorne Endemarkierung suchen (0)
     tst.b 0(a0,d0.w)
     beq.s FindM1
     addq.w #1,d0
     bra.s FindLoop1
FindM1:
     cmp.b #":",0(a0,d0.w)
     beq.s FindM2
     cmp.b #"/",0(a0,d0.w)
     beq.s FindM2
     subq.w #1,d0
     bne.s FindM1
     move.l #"df0:",strpuffer1
     clr.b strpuffer1+4
     clr.b Requesterflag
     rts
FindM2:
     clr.b 1(a0,d0.w)
     rts

Ende:
     move.l d0,-(sp)
     bsr Reqclose          ;Fenster schließen
     tst.b Requesterflag
     bne.s Ende1
     move.l locksav,d1     ;durch Lock belegten Speicher freigeben
     move.l dosbase,a6
     jsr UnLock(a6)
Ende1:
     move.l (sp)+,d0
     rts                   ;fertig !


File_Requester:
	dc.l	NULL
	dc.w	158,23
	dc.w	296,158
	dc.w	0,0
	dc.l	F_GadgetList1
	dc.l F_Border
	dc.l	NULL
	dc.w	NULL
	dc.b	3,0
	dc.l	NULL
	dcb.b 32,0
	dc.l	NULL
	dc.l	NULL
	dcb.b 36,0
UNDOBUFFER2:
	dcb.b 66,0
	cnop 0,2
F_Border:
     dc.w 0,0
     dc.b 2,3,0,5
     dc.l F_kord,0
F_kord:
     dc.w 0,0,295,0,295,157,0,157,0,0
F_GadgetList1:
F_Gadget1:
	dc.l	F_Gadget2
	dc.w	48,15
	dc.w	240,8
	dc.w	NULL
	dc.w	RELVERIFY
	dc.w	STRGADGET+REQGADGET
	dc.l	F_Border1
	dc.l	NULL
	dc.l	F_IText1
	dc.l	NULL
	dc.l	F_F_Gadget1SInfo
	dc.w	1
	dc.l	NULL
F_F_Gadget1SInfo:
	dc.l StrPuffer1
	dc.l	UNDOBUFFER2
	dc.w	0
	dc.w	66
	dc.w	0
	dc.w	0,0,0,0,0
	dc.l	0
	dc.l	0
	dc.l	NULL
StrPuffer1:
	dcb.b 66,0
	cnop 0,2
F_Border1:
	dc.w	-41,-1
	dc.b	1,2,RP_JAM2
	dc.b	5
	dc.l	F_BorderVectors1
	dc.l	NULL
F_BorderVectors1:
	dc.w	0,0
	dc.w	281,0
	dc.w	281,9
	dc.w	0,9
	dc.w	0,1
F_IText1:
	dc.b	2,1,RP_JAM1,0
	dc.w	-40,0
	dc.l	NULL
	dc.l	F_ITextText1
	dc.l	NULL
F_ITextText1:
	dc.b	'Path:',0
	cnop 0,2
F_Gadget2:
	dc.l	F_Gadget3
	dc.w	8,28
	dc.w	240,8
	dc.w	NULL
	dc.w	RELVERIFY
	dc.w	BOOLGADGET+REQGADGET
	dc.l	F_Border2
	dc.l	NULL
	dc.l	F_IText2
	dc.l	NULL
	dc.l	NULL
	dc.w	4
	dc.l	NULL
F_Border2:
	dc.w	-1,-1
	dc.b	1,0,RP_JAM1
	dc.b	5
	dc.l	F_BorderVectors2
	dc.l	NULL
F_BorderVectors2:
	dc.w	0,0
	dc.w	241,0
	dc.w	241,65
	dc.w	0,65
	dc.w	0,0
F_Gadget3:
	dc.l	F_Gadget4
	dc.w	8,36
	dc.w	240,8
	dc.w	NULL
	dc.w	RELVERIFY
	dc.w	BOOLGADGET+REQGADGET
	dc.l	NULL
	dc.l	NULL
	dc.l	F_IText3
	dc.l	NULL
	dc.l	NULL
	dc.w	5
	dc.l	NULL
F_Gadget4:
	dc.l	F_Gadget5
	dc.w	8,44
	dc.w	240,8
	dc.w	NULL
	dc.w	RELVERIFY
	dc.w	BOOLGADGET+REQGADGET
	dc.l	NULL
	dc.l	NULL
	dc.l	F_IText4
	dc.l	NULL
	dc.l	NULL
	dc.w	6
	dc.l	NULL
F_Gadget5:
	dc.l	F_Gadget6
	dc.w	8,52
	dc.w	240,8
	dc.w	NULL
	dc.w	RELVERIFY
	dc.w	BOOLGADGET+REQGADGET
	dc.l	NULL
	dc.l	NULL
	dc.l	F_IText5
	dc.l	NULL
	dc.l	NULL
	dc.w	7
	dc.l	NULL
F_Gadget6:
	dc.l	F_Gadget7
	dc.w	8,60
	dc.w	240,8
	dc.w	NULL
	dc.w	RELVERIFY
	dc.w	BOOLGADGET+REQGADGET
	dc.l	NULL
	dc.l	NULL
	dc.l	F_IText6
	dc.l	NULL
	dc.l	NULL
	dc.w	8
	dc.l	NULL
F_Gadget7:
	dc.l	F_Gadget8
	dc.w	8,68
	dc.w	240,8
	dc.w	NULL
	dc.w	RELVERIFY
	dc.w	BOOLGADGET+REQGADGET
	dc.l	NULL
	dc.l	NULL
	dc.l	F_IText7
	dc.l	NULL
	dc.l	NULL
	dc.w	9
	dc.l	NULL
F_Gadget8:
	dc.l	F_Gadget9
	dc.w	8,76
	dc.w	240,8
	dc.w	NULL
	dc.w	RELVERIFY
	dc.w	BOOLGADGET+REQGADGET
	dc.l	NULL
	dc.l	NULL
	dc.l	F_IText8
	dc.l	NULL
	dc.l	NULL
	dc.w	10
	dc.l	NULL
F_Gadget9:
	dc.l	F_Gadget10
	dc.w	8,84
	dc.w	240,8
	dc.w	NULL
	dc.w	RELVERIFY
	dc.w	BOOLGADGET+REQGADGET
	dc.l	NULL
	dc.l	NULL
	dc.l	F_IText9
	dc.l	NULL
	dc.l	NULL
	dc.w	11
	dc.l	NULL
F_Gadget10:
	dc.l	F_Gadget11
	dc.w	48,97
	dc.w	240,8
	dc.w	NULL
	dc.w	RELVERIFY
	dc.w	STRGADGET+REQGADGET
	dc.l	F_Border9
	dc.l	NULL
	dc.l	F_IText10
	dc.l	NULL
	dc.l	F_F_Gadget10SInfo
	dc.w	2
	dc.l	NULL
F_F_Gadget10SInfo:
	dc.l StrPuffer2
	dc.l	UNDOBUFFER2
	dc.w	0
	dc.w	31
	dc.w	0
	dc.w	0,0,0,0,0
	dc.l	0
	dc.l	0
	dc.l	NULL
StrPuffer2:
	dcb.b 32,0
	cnop 0,2
F_Border9:
	dc.w	-41,-1
	dc.b	1,2,RP_JAM2
	dc.b	5
	dc.l	F_BorderVectors9
	dc.l	NULL
F_BorderVectors9:
	dc.w	0,0
	dc.w	281,0
	dc.w	281,9
	dc.w	0,9
	dc.w	0,1
F_IText10:
	dc.b	2,1,RP_JAM1,0
	dc.w	-40,0
	dc.l	NULL
	dc.l	F_ITextText10
	dc.l	NULL
F_ITextText10:
	dc.b	'Name:',0
	cnop 0,2
F_Gadget11:
	dc.l	F_Gadget22
	dc.w	48,110
	dc.w	96,8
	dc.w	NULL
	dc.w	RELVERIFY
	dc.w	STRGADGET+REQGADGET
	dc.l	F_Border10
	dc.l	NULL
	dc.l	F_IText11
	dc.l	NULL
	dc.l	F_F_Gadget11SInfo
	dc.w	12
	dc.l	NULL
F_F_Gadget11SInfo:
	dc.l	F_F_Gadget11SIBuff
	dc.l	NULL
	dc.w	0
	dc.w	13
	dc.w	0
	dc.w	0,0,0,0,0
	dc.l	0
	dc.l	0
	dc.l	NULL
F_F_Gadget11SIBuff:
	dcb.b 14,0
	cnop 0,2
F_Border10:
	dc.w	-41,-1
	dc.b	1,0,RP_JAM1
	dc.b	5
	dc.l	F_BorderVectors10
	dc.l	NULL
F_BorderVectors10:
	dc.w	0,0
	dc.w	137,0
	dc.w	137,9
	dc.w	0,9
	dc.w	0,1
F_IText11:
	dc.b	2,1,RP_JAM1,0
	dc.w	-40,0
	dc.l	NULL
	dc.l	F_ITextText11
	dc.l	NULL
F_ITextText11:
	dc.b	'Type:',0
	cnop 0,2
F_Gadget12:
	dc.l	F_Gadget13
	dc.w	152,110
	dc.w	136,8
	dc.w	NULL
	dc.w	RELVERIFY
	dc.w	BOOLGADGET+REQGADGET
	dc.l	F_Border11
	dc.l	NULL
	dc.l	F_IText12
	dc.l	NULL
	dc.l	NULL
	dc.w	13
	dc.l	NULL
F_Border11:
	dc.w	-1,-1
	dc.b	1,0,RP_JAM1
	dc.b	5
	dc.l	F_BorderVectors11
	dc.l	NULL
F_BorderVectors11:
	dc.w	0,0
	dc.w	137,0
	dc.w	137,9
	dc.w	0,9
	dc.w	0,0
F_IText12:
	dc.b	1,0,RP_JAM2,0
	dc.w	0,0
	dc.l	NULL
	dc.l	F_ITextText12
	dc.l	NULL
F_ITextText12:
	dc.b	'  Instruments:   ',0
	cnop 0,2
F_Gadget13:
	dc.l	F_Gadget14
	dc.w	8,123
	dc.w	40,8
	dc.w	NULL
	dc.w	RELVERIFY
	dc.w	BOOLGADGET+REQGADGET
	dc.l	F_Border12
	dc.l	NULL
	dc.l	F_IText13
	dc.l	NULL
	dc.l	NULL
	dc.w	14
	dc.l	NULL
F_Border12:
	dc.w	-1,-1
	dc.b	1,0,RP_JAM1
	dc.b	5
	dc.l	F_BorderVectors12
	dc.l	NULL
F_BorderVectors12:
	dc.w	0,0
	dc.w	41,0
	dc.w	41,9
	dc.w	0,9
	dc.w	0,0
F_IText13:
	dc.b	1,0,RP_JAM2,0
	dc.w	4,0
	dc.l	NULL
	dc.l	F_ITextText13
	dc.l	NULL
F_ITextText13:
	dc.b	'df0:',0
	cnop 0,2
F_Gadget14:
	dc.l	F_Gadget15
	dc.w	56,123
	dc.w	40,8
	dc.w	NULL
	dc.w	RELVERIFY
	dc.w	BOOLGADGET+REQGADGET
	dc.l	F_Border13
	dc.l	NULL
	dc.l	F_IText14
	dc.l	NULL
	dc.l	NULL
	dc.w	15
	dc.l	NULL
F_Border13:
	dc.w	-1,-1
	dc.b	1,0,RP_JAM1
	dc.b	5
	dc.l	F_BorderVectors13
	dc.l	NULL
F_BorderVectors13:
	dc.w	0,0
	dc.w	41,0
	dc.w	41,9
	dc.w	0,9
	dc.w	0,0
F_IText14:
	dc.b	1,0,RP_JAM2,0
	dc.w	4,0
	dc.l	NULL
	dc.l	F_ITextText14
	dc.l	NULL
F_ITextText14:
	dc.b	'df1:',0
	cnop 0,2
F_Gadget15:
	dc.l	F_Gadget16
	dc.w	104,123
	dc.w	40,8
	dc.w	NULL
	dc.w	RELVERIFY
	dc.w	BOOLGADGET+REQGADGET
	dc.l	F_Border14
	dc.l	NULL
	dc.l	F_IText15
	dc.l	NULL
	dc.l	NULL
	dc.w	16
	dc.l	NULL
F_Border14:
	dc.w	-1,-1
	dc.b	1,0,RP_JAM1
	dc.b	5
	dc.l	F_BorderVectors14
	dc.l	NULL
F_BorderVectors14:
	dc.w	0,0
	dc.w	41,0
	dc.w	41,9
	dc.w	0,9
	dc.w	0,0
F_IText15:
	dc.b	1,0,RP_JAM2,0
	dc.w	4,0
	dc.l	NULL
	dc.l	F_ITextText15
	dc.l	NULL
F_ITextText15:
	dc.b	'df2:',0
	cnop 0,2
F_Gadget16:
	dc.l	F_Gadget17
	dc.w	152,123
	dc.w	40,8
	dc.w	NULL
	dc.w	RELVERIFY
	dc.w	BOOLGADGET+REQGADGET
	dc.l	F_Border15
	dc.l	NULL
	dc.l	F_IText16
	dc.l	NULL
	dc.l	NULL
	dc.w	17
	dc.l	NULL
F_Border15:
	dc.w	-1,-1
	dc.b	1,0,RP_JAM1
	dc.b	5
	dc.l	F_BorderVectors15
	dc.l	NULL
F_BorderVectors15:
	dc.w	0,0
	dc.w	41,0
	dc.w	41,9
	dc.w	0,9
	dc.w	0,0
F_IText16:
	dc.b	1,0,RP_JAM2,0
	dc.w	4,0
	dc.l	NULL
	dc.l	F_ITextText16
	dc.l	NULL
F_ITextText16:
	dc.b	'ram:',0
	cnop 0,2
F_Gadget17:
	dc.l	F_Gadget18
	dc.w	200,123
	dc.w	40,8
	dc.w	NULL
	dc.w	RELVERIFY
	dc.w	BOOLGADGET+REQGADGET
	dc.l	F_Border16
	dc.l	NULL
	dc.l	F_IText17
	dc.l	NULL
	dc.l	NULL
	dc.w	18
	dc.l	NULL
F_Border16:
	dc.w	-1,-1
	dc.b	1,0,RP_JAM1
	dc.b	5
	dc.l	F_BorderVectors16
	dc.l	NULL
F_BorderVectors16:
	dc.w	0,0
	dc.w	41,0
	dc.w	41,9
	dc.w	0,9
	dc.w	0,0
F_IText17:
	dc.b	1,0,RP_JAM2,0
	dc.w	4,0
	dc.l	NULL
	dc.l	F_ITextText17
	dc.l	NULL
F_ITextText17:
	dc.b	'dh0:',0
	cnop 0,2
F_Gadget18:
	dc.l	F_Gadget19
	dc.w	248,123
	dc.w	40,8
	dc.w	NULL
	dc.w	RELVERIFY
	dc.w	BOOLGADGET+REQGADGET
	dc.l	F_Border17
	dc.l	NULL
	dc.l	F_IText18
	dc.l	NULL
	dc.l	NULL
	dc.w	19
	dc.l	NULL
F_Border17:
	dc.w	-1,-1
	dc.b	1,0,RP_JAM1
	dc.b	5
	dc.l	F_BorderVectors17
	dc.l	NULL
F_BorderVectors17:
	dc.w	0,0
	dc.w	41,0
	dc.w	41,9
	dc.w	0,9
	dc.w	0,0
F_IText18:
	dc.b	1,0,RP_JAM2,0
	dc.w	4,0
	dc.l	NULL
	dc.l	F_ITextText18
	dc.l	NULL
F_ITextText18:
	dc.b	'jh0:',0
	cnop 0,2
F_Gadget19:
	dc.l	F_Gadget20
	dc.w	8,139
	dc.w	72,13
	dc.w	NULL
	dc.w	RELVERIFY
	dc.w	BOOLGADGET+REQGADGET
	dc.l	F_Border18
	dc.l	NULL
	dc.l	F_IText19
	dc.l	NULL
	dc.l	NULL
	dc.w	20
	dc.l	NULL
F_Border18:
	dc.w	-1,-1
	dc.b	1,0,RP_JAM1
	dc.b	5
	dc.l	F_BorderVectors18
	dc.l	NULL
F_BorderVectors18:
	dc.w	0,0
	dc.w	73,0
	dc.w	73,14
	dc.w	0,14
	dc.w	0,0
F_IText19:
	dc.b	1,0,RP_JAM2,0
	dc.w	19,3
	dc.l	NULL
	dc.l	F_ITextText19
	dc.l	NULL
F_ITextText19:
	dc.b	'LOAD',0
	cnop 0,2
F_Gadget20:
	dc.l	F_Gadget21
	dc.w	216,139
	dc.w	72,13
	dc.w	NULL
	dc.w	RELVERIFY
	dc.w	BOOLGADGET+REQGADGET
	dc.l	F_Border19
	dc.l	NULL
	dc.l	F_IText20
	dc.l	NULL
	dc.l	NULL
	dc.w	22
	dc.l	NULL
F_Border19:
	dc.w	-1,-1
	dc.b	1,0,RP_JAM1
	dc.b	5
	dc.l	F_BorderVectors19
	dc.l	NULL
F_BorderVectors19:
	dc.w	0,0
	dc.w	73,0
	dc.w	73,14
	dc.w	0,14
	dc.w	0,0
F_IText20:
	dc.b	1,0,RP_JAM2,0
	dc.w	12,3
	dc.l	NULL
	dc.l	F_ITextText20
	dc.l	NULL
F_ITextText20:
	dc.b	'CANCEL',0
	cnop 0,2
F_Gadget21:
	dc.l	NULL
	dc.w	112,139
	dc.w	73,8
	dc.w	NULL
	dc.w	RELVERIFY
	dc.w	BOOLGADGET+REQGADGET
	dc.l	F_Border20
	dc.l	NULL
	dc.l	F_IText21
	dc.l	NULL
	dc.l	NULL
	dc.w	21
	dc.l	NULL
F_Border20:
	dc.w	-1,-1
	dc.b	1,0,RP_JAM1
	dc.b	5
	dc.l	F_BorderVectors20
	dc.l	NULL
F_BorderVectors20:
	dc.w	0,0
	dc.w	74,0
	dc.w	74,9
	dc.w	0,9
	dc.w	0,0
F_IText21:
	dc.b	1,0,RP_JAM2,0
	dc.w	13,0
	dc.l	NULL
	dc.l	F_ITextText21
	dc.l	NULL
F_ITextText21:
	dc.b	'Parent',0
	cnop 0,2
F_Gadget22:
	dc.l	F_Gadget12
	dc.w	261,27
	dc.w	27,66
	dc.w	NULL
	dc.w	FOLLOWMOUSE+RELVERIFY+GADGIMMEDIATE
	dc.w	PROPGADGET+REQGADGET
	dc.l	F_Image1
	dc.l	NULL
	dc.l	NULL
	dc.l	NULL
	dc.l	F_PropInfo
	dc.w	3
	dc.l	NULL
F_PropInfo:
	dc.w	AUTOKNOB+FREEVERT
	dc.w	0,0
	dc.w	0,8191
	dc.w	0,0,0,0,0,0
F_Image1:
	dc.w	0,39
	dc.w	19,8
	dc.w	0
	dc.l	NULL
	dc.b	$0000,$0000
	dc.l	NULL

F_ITextText2:
     dcb.b 30," "
     dc.b 0,0
F_ITextText3:
     dcb.b 30," "
     dc.b 0,0
F_ITextText4:
     dcb.b 30," "
     dc.b 0,0
F_ITextText5:
     dcb.b 30," "
     dc.b 0,0
F_ITextText6:
     dcb.b 30," "
     dc.b 0,0
F_ITextText7:
     dcb.b 30," "
     dc.b 0,0
F_ITextText8:
     dcb.b 30," "
     dc.b 0,0
F_ITextText9:
     dcb.b 30," "
     dc.b 0,0

   even
F_IText2:
	dc.b	2,1,RP_JAM1,0     ;20 Bytes Länge pro Struktur
	dc.w	0,0
	dc.l	NULL
	dc.l	F_ITextText2
	dc.l	NULL
F_IText3:
	dc.b	2,1,RP_JAM1,0
	dc.w	0,0
	dc.l	NULL
	dc.l	F_ITextText3
	dc.l	NULL
F_IText4:
	dc.b	2,1,RP_JAM1,0
	dc.w	0,0
	dc.l	NULL
	dc.l	F_ITextText4
	dc.l	NULL
F_IText5:
	dc.b	2,1,RP_JAM1,0
	dc.w	0,0
	dc.l	NULL
	dc.l	F_ITextText5
	dc.l	NULL
F_IText6:
	dc.b	2,1,RP_JAM1,0
	dc.w	0,0
	dc.l	NULL
	dc.l	F_ITextText6
	dc.l	NULL
F_IText7:
	dc.b	2,1,RP_JAM1,0
	dc.w	0,0
	dc.l	NULL
	dc.l	F_ITextText7
	dc.l	NULL
F_IText8:
	dc.b	2,1,RP_JAM1,0
	dc.w	0,0
	dc.l	NULL
	dc.l	F_ITextText8
	dc.l	NULL
F_IText9:
	dc.b	2,1,RP_JAM1,0
	dc.w	0,0
	dc.l	NULL
	dc.l	F_ITextText9
	dc.l	NULL
   even
