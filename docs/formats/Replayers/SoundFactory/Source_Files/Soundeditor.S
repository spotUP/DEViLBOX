;*******************************************************************
;
;             Soundeditor zum IRQ-Music-Assembler
;                    (c) 1989 by PROFITEAM
;
;              Last Update: 20.7.1989
;
;*******************************************************************

IRQ_Music_Len = 5066       ;Länge von "IRQ_Music.Code" in Bytes
Soundtabelle  = 232        ;Offset zum Anfang v. IRQ_Music.Code !
VarBase       = 102        ; " "
Sound_Max_Len = 40000      ;Maximale Länge des Sound-Befehls

DMACON       = $dff096     ;DMA-Steuerregister
VHPOSR       = $bfd800     ;vertikale und horizontale Rasterstrahlpos.
OpenScreen   = -198        ;Screen öffnen
CloseScreen  = -66         ;Screen schließen
CloseLibrary = -414        ;Library schließen
OpenLib      = -408        ;Library öffnen
OpenWindow   = -204        ;Window öffnen
CloseWindow  = -72         ;Window schließen
PrintIText   = -216        ;Textausgabe
SetMenuStrip = -264        ;Menü einschalten
ClearMenuStrip = -54       ;Menü entfernen
DrawBorder   = -108        ;Rahmen zeichnen
DrawImage    = -114        ;Image zeichnen
ShowTitle    = -282        ;Screentitel zeigen
ExecBase     = 4           ;EXEC-Basisadresse
RefreshGadgets = -222      ;Wie der Name schon sagt
AutoRequest  = -348        ;Erzeugt einen Requester
Request      = -240        ;Zeigt einen Requester an
EndRequest   = -120        ;Schließt einen Requester
OnGadget     = -186        ;Enabled ein Gadget
OffGagdet    = -174        ;Disabled ein Gadget
GetMsg       = -372        ;IDCMP-Flag holen
ReplyMsg     = -378        ;Message bestätigen
WaitPort     = -384        ;wartet auf eine Message
AllocMem     = -198        ;Speicher reservieren
FreeMem      = -210        ;Speicher freigeben
FindTask     = -294        ;Task suchen
Lock         = -84         ;Datei suchen
UnLock       = -90         ;Lock-Speicher freigeben
Seek         = -66         ;Zeiger verschieben
Examine      = -102        ;Datei-Informationen holen
Execute      = -222        ;CLI-Befehl ausführen
ExNext       = -108        ;Nächsten Directory-Eintrag ermitteln
CurrentDir   = -126        ;aktuelles Verzeichnis setzen
Open         = -30         ;File öffnen
Close        = -36         ;File schließen
Read         = -42         ;aus einem File lesen
Write        = -48         ;in ein File schreiben
Input        = -54         ;Standard-Eingabe ermitteln
Output       = -60         ;Standard-Ausgabe ermitteln
IoErr        = -132        ;Ein-/Ausgabefehler ermitteln
DeleteFile   = -72         ;Datei löschen
Delay        = -198        ;(d1) 50-tel Sekunden warten
RectFill     = -306        ;Fläche füllen
Flood        = -330        ;Fläche füllen
InitTmpRas   = -468        ;Initialisiert TmpRas-Struktur
SetAPen      = -342        ;Setzt die Zeichenfarbe für JAM1
SetBPen      = -348        ;Setzt die Zeichenfarbe für JAM2
Draw         = -246        ;Zeichnet eine Linie
Move         = -240        ;Bewegt Grafikcursor
WritePixel   = -324        ;Plot
SetDrMd      = -354        ;Zeichenmodus setzen
Mode_Old     = 1005        ;Code für Lesen
Mode_New     = 1006        ;Code für Schreiben
Access_Read  = -2          ;Code für Lesezugriff für Lock

     SECTION Prog,CODE

run:
     bra run2
     cnop 0,4
FileInfo:
     ds.b 260              ;FileInfo-Block muß an 4er Adresse stehen
run2:
     move.l a0,-(sp)       ;Zeiger auf Parameter merken
     move.l ExecBase,a6
     sub.l a1,a1
     jsr FindTask(a6)      ;eigenen Task suchen
     move.l d0,a4
     tst.l $ac(a4)         ;CLI oder Workbench ?
     bne fromCLI
     move.l (sp)+,a0       ;Parameterzeiger vergessen
     bsr opendos
     tst.l d0
     beq Finito
     lea $5c(a4),a0	   ;WB-Message abwarten
     move.l ExecBase,a6
     jsr WaitPort(a6)
     jsr GetMsg(a6)
     move.l d0,a0
     move.l d0,WB_Message
     move.l $24(a0),a0     ;sm_ArgList: Zeiger auf Argumente
     move.l (a0),d1
     move.l dosbase,a6
     jsr CurrentDir(a6)    ;aktuelles Directory setzen
;***************** Hier könnte noch eine weitere Auswertung stehen ******
     bra No_Parameter

fromCLI:
     bsr opendos           ;DOS-Library öffnen
     move.l (sp)+,a0
     tst.l d0              ;erfolgreich ?
     beq Finito            ;Nein, dann Programm abbrechen
ParaLop1:                  ;Leerzeichen überlesen
     cmp.b #" ",(a0)+
     beq.s ParaLop1
     cmp.b #10,-1(a0)      ;noch ein Parameter vorhanden ?
     beq No_Parameter      ;nein, dann Programm starten
     cmp.b #"-",-1(a0)     ;Option ?
     bne Cli_Error1        ;nein, dann USAGE ausgeben
     cmp.b #"s",(a0)       ;Size-Option ?
     beq.s Size_it
     cmp.b #"S",(a0)
     beq.s Size_it
     cmp.b #"e",(a0)       ;Editorname-Option ?
     beq Get_Editor
     cmp.b #"E",(a0)
     bne Cli_Error1
Size_it:
     add.l #1,a0
Size_it2:
     cmp.b #" ",(a0)+      ;weitere Leerzeichen überlesen
     beq.s Size_it2
     clr.l d6
     clr.l d0
     sub.l #1,a0
Size_it3:
     move.b (a0),d0
     cmp.b #"0",d0
     bcs.s Size_it4
     cmp.b #"9",d0
     bhi.s Size_it4
     mulu #10,d6
     sub.b #"0",d0
     add.l d0,d6
     add.l #1,a0
     bra.s Size_it3
Size_it4:
     tst.l d6
     beq Cli_Error1
     move.l d6,Mem_Size    ;Speichergröße bestimmt
     cmp.l #256,d6         ;min. 256 Bytes ?
     bcc ParaLop1          ;ja, dann gucken, ob weitere Parameter
     move.l #256,Mem_Size  ;nein, dann auf 256 Bytes setzen
     bra ParaLop1

Get_Editor:
     add.l #1,a0
Get_Edit2:
     cmp.b #" ",(a0)+      ;weitere Leerzeichen überlesen
     beq.s Get_Edit2
     sub.l #1,a0
     cmp.b #10,(a0)        ;doch kein Name vorhanden ?
     beq Cli_Error1        ;ja, dann Fehler
     lea Kommando,a1       ;Editorname-Adresse nach a1
Get_Edit4:
     move.b (a0),d0
     cmp.b #10,d0
     beq.s Get_Edit3
     cmp.b #" ",d0
     beq.s Get_Edit3
     move.b d0,(a1)+
     add.l #1,a0
     bra.s Get_Edit4
Get_Edit3:
     move.b #" ",(a1)+
     lea Editor_Source,a2
Get_Edit5:
     move.b (a2)+,(a1)+    ;"Temp-SF:T.m",0 anhängen
     bne.s Get_Edit5
     clr.b (a1)            ;Endemarkierung setzen
     move.b #1,Editor_Flag ;Flag, daß alternativer Editor benutzt wird
     bra ParaLop1

Cli_Error1:
     bsr Usage
     bra Finito

No_Parameter:
     move.l ExecBase,a6
     move.l #200*38,d0     ;Speichergröße
     move.l #$10000,d1     ;Speicherblock löschen
     jsr AllocMem(a6)      ;Speicher reservieren (für Files)
     tst.l d0
     bne Ok1
     bsr No_Mem_Free       ;Ausgabe von 'Not enough Memory'
     bra Finito
Ok1:
     move.l d0,PufferAdr

     move.l #IRQ_Music_Len,d0
     move.l #$10002,d1     ;Chipmem
     jsr AllocMem(a6)      ;Speicher reservieren (für IRQ_Music.Code)
     tst.l d0
     bne.s Ok2
     bsr No_Mem_Free       ;kein freier Speicher
     bra Schluss5
Ok2:
     move.l d0,IRQ_Music_Buffer

     move.l Mem_Size,d0
     add.l #Sound_Overhead,d0
     move.l #2,d1          ;Chip-Mem
     jsr AllocMem(a6)      ;Speicher reservieren (für Sample-Daten)
     tst.l d0
     bne.s Ok3
     bsr No_Mem_Free       ;kein freier Speicher
     bra Schluss4
Ok3:
     move.l d0,SoundAdr

     clr.b Requesterflag   ;File-Requester noch nicht aufgerufen worden

     bsr openint           ;Intuition öffnen
     tst.l IntBase
     bne Ok5
     bsr Intui_trouble
     bra Schluss3
Ok5:
     bsr opengfx           ;Graphics öffnen
     tst.l GfxBase
     bne Ok6
     bsr Gfx_trouble
     bra Schluss7
Ok6:
     bsr scropen           ;Screen öffnen
     tst.l screenhd
     bne Ok7
     bsr No_Mem_Free
     bra Schluss8
Ok7:
     bsr windopen          ;Fenster öffnen
     tst.l windowhd
     bne Ok8
     bsr No_Mem_Free
     bra Schluss9
Ok8:
     bsr Load_IRQ_Music    ;IRQ_Music.Code laden
     tst.l d0              ;erfolgreich geladen ?
     beq Schluss2          ;Nein, dann zu schluss2
     bsr openNIL           ;Leerkanal öffnen
     tst.l NILHandle
     beq Schluss2
     bsr WriteTeil1        ;schreibt den 1. Teil der Musikdaten in Puffer
     bsr SetDefault1       ;setzt alle Werte des 1. Teils auf Default
     bsr SetPulse_100      ;schreibt einen 100 Bytes langen Rechteck-Sample
     bsr WriteTeil2        ;hängt den 2. Teil der Musikdaten an
     bsr LED_On            ;schaltet Filter-LED ein
     bsr MakeGadgets       ;berechnet alle Gadgets neu & zeigt sie an
Gimme_Copyright:
     bsr wind3open         ;Copyright-Fenster öffnen
     tst.l windowhd3
     bne Ok9
     bsr No_Mem_Free
     bra Schluss2
Ok9:
     bsr Wait_CloseReq     ;wartet auf Ok!- Gadget
     clr.l windowhd3
     bsr MakeGadgets
     bsr SetMenu           ;Menu aktivieren

;------------------ HAUPTSCHLEIFE ------------------

MainLoop:
     move.l ExecBase,a6
     move.l windowhd,a0
     move.l 86(a0),a0
     move.l a0,-(sp)
     jsr WaitPort(a6)
     move.l (sp)+,a0
     jsr GetMsg(a6)
     move.l d0,a1
     move.l $14(a1),Ereignis
     move.w $18(a1),MenuPick
     cmp.l #$100,Ereignis
     beq.s No_Gadg_Ptr
     move.l $1c(a1),a0
     move.l a0,Gadget_Pointer
     move.w 38(a0),GadgetID
No_Gadg_Ptr:
     move.w $20(a1),MouseX
     move.w $22(a1),MouseY
     jsr ReplyMsg(a6)

     cmp.l #$100,Ereignis  ;Menüpunkt angewählt ?
     beq Menu_Switch       ;Ja, dann zu Menu_Switch

     cmp.l #$40,Ereignis
     bne MainLoop

     cmp.w #45,GadgetID    ;Quit ?
     beq Quit_clicked

     cmp.w #38,GadgetID    ;Start ?
     bne q1
     move.l $6c,a0
     cmp.w #$4e71,(a0)
     beq q01
     move.l SoundAdr,a0
     move.l #1,d0
     move.l IRQ_Music_Buffer,a1
     jsr (a1)
     tst.b LED
     bne.s q001
     bsr LED_Off
q001:
     move.l $6c,HilfIRQ+2
     move.l #MeinIRQ,$6c
     bra MainLoop
q01:                       ;Es läuft schon ein SF-Interrupt
     move.l #btex4a,btext+12
     move.l #btex4b,btext2+12
     bsr Requester
     bra MainLoop
q1:
     cmp.w #39,GadgetID    ;Stop ?
     bne q2
     bsr Musik_aus
     bra MainLoop
Musik_aus:
     clr.b Play_Flag
     cmp.l #MeinIRQ,$6c
     bne Musik_aus_1
     move.l HilfIRQ+2,$6c
     move.l IRQ_Music_Buffer,a0
     adda.l #8,a0
     jmp (a0)
Musik_aus_1:
     rts
q2:
     cmp.w #5,GadgetID     ;Attack-Time ?
     bne q3
     clr.l d0
     move.w propinf5+4,d0
     divu #1040,d0
     move.b #63,d1
     sub.b d0,d1
     move.l SoundAdr,a0
     move.b d1,296(a0)
     bra MainLoop
q3:
     cmp.w #6,GadgetID     ;Sustain-Time ?
     bne q4
     clr.l d0
     move.w propinf6+4,d0
     divu #1040,d0
     move.b #63,d1
     sub.b d0,d1
     move.l SoundAdr,a0
     move.b d1,297(a0)
     bra MainLoop
q4:
     cmp.w #7,GadgetID     ;Sustain-Level ?
     bne q5
     clr.l d0
     move.w propinf7+4,d0
     divu #1040,d0
     move.b #63,d1
     sub.b d0,d1
     addq.b #1,d1
     move.l SoundAdr,a0
     move.b d1,298(a0)
     bra MainLoop
q5:
     cmp.w #8,GadgetID     ;Release-Time ?
     bne q6
     clr.l d0
     move.w propinf8+4,d0
     divu #516,d0
     move.b #127,d1
     sub.b d0,d1
     move.l SoundAdr,a0
     move.b d1,299(a0)
     bra MainLoop
q6:
     cmp.w #22,GadgetID    ;Release On/Off ?
     bne q7
     move.l SoundAdr,a0
     bchg #5,284(a0)
     btst #5,284(a0)
     bne q6_1
     bsr Release_On
     bra q6_2
q6_1:
     bsr Release_Off
q6_2:
     bsr Refresh_All
     bra MainLoop
q7:
     cmp.w #23,GadgetID    ;Arpeggio On/Off
     bne q8
     move.l SoundAdr,a0
     bchg #2,284(a0)
     btst #2,284(a0)
     bne q7_1
     bsr Arpeggio_Off
     bra q7_2
q7_1:
     bsr Arpeggio_On
q7_2:
     bsr Refresh_All
     bra MainLoop
q8:
     cmp.w #9,GadgetID     ;Arpeggio-Speed ?
     bne q9
     clr.l d0
     move.w propinf9+4,d0
     divu #4369,d0
     addq.b #1,d0
     move.l SoundAdr,a0
     move.b d0,291(a0)
     bra MainLoop
q9:
     cmp.w #24,GadgetID    ;Vibrato On/Off
     bne q10
     move.l SoundAdr,a0
     bchg #1,284(a0)
     btst #1,284(a0)
     bne q9_1
     bsr Vibrato_Off
     bra q9_2
q9_1:
     bsr Vibrato_On
q9_2:
     bsr Refresh_All
     bra MainLoop
q10:
     cmp.w #10,GadgetID     ;Vibrato-Delay ?
     bne q11
     clr.l d0
     move.w propinf10+4,d0
     divu #1040,d0
     move.b #63,d1
     sub.b d0,d1
     move.l SoundAdr,a0
     move.b d1,292(a0)
     bra MainLoop
q11:
     cmp.w #11,GadgetID     ;Vibrato-Speed ?
     bne q12
     clr.l d0
     move.w propinf11+4,d0
     divu #4369,d0
     addq.b #1,d0
     move.l SoundAdr,a0
     move.b d0,293(a0)
     bra MainLoop
q12:
     cmp.w #12,GadgetID     ;Vibrato-Step ?
     bne q13
     clr.l d0
     move.w propinf12+4,d0
     divu #4369,d0
     move.b #16,d1
     sub.b d0,d1
     move.l SoundAdr,a0
     move.b d1,294(a0)
     bra MainLoop
q13:
     cmp.w #13,GadgetID     ;Vibrato-Range ?
     bne q14
     clr.l d0
     move.w propinf13+4,d0
     divu #9362,d0
     move.b #8,d1
     sub.b d0,d1
     move.l SoundAdr,a0
     move.b d1,295(a0)
     bra MainLoop
q14:
     cmp.w #25,GadgetID    ;Tremolo On/Off
     bne q15
     move.l SoundAdr,a0
     bchg #6,284(a0)
     btst #6,284(a0)
     bne q14_1
     bsr Tremolo_Off
     bra q14_2
q14_1:
     bsr Tremolo_On
q14_2:
     bsr Refresh_All
     bra MainLoop
q15:
     cmp.w #14,GadgetID    ;Tremolo-Speed ?
     bne q16
     clr.l d0
     move.w propinf14+4,d0
     divu #4369,d0
     addq.b #1,d0
     move.l SoundAdr,a0
     move.b d0,285(a0)
     bra MainLoop
q16:
     cmp.w #15,GadgetID    ;Tremolo-Step ?
     bne q17
     clr.l d0
     move.w propinf15+4,d0
     divu #516,d0
     move.b #128,d1
     sub.b d0,d1
     move.l SoundAdr,a0
     move.b d1,286(a0)
     bra MainLoop
q17:
     cmp.w #16,GadgetID    ;Tremolo-% ?
     bne q18
     clr.l d0
     move.w propinf16+4,d0
     divu #257,d0
     move.l SoundAdr,a0
     move.b d0,287(a0)
     bra MainLoop
q18:
     cmp.w #26,GadgetID    ;Portamento On/Off
     bne q19
     move.l SoundAdr,a0
     bchg #4,284(a0)
     btst #4,284(a0)
     bne q18_1
     bsr Portamento_Off
     bra q18_2
q18_1:
     bsr Portamento_On
q18_2:
     bsr Refresh_All
     bra MainLoop
q19:
     cmp.w #17,GadgetID    ;Portamento-Speed ?
     bne q20
     clr.l d0
     move.w propinf17+4,d0
     divu #4369,d0
     addq.b #1,d0
     move.l SoundAdr,a0
     move.b d0,290(a0)
     bra MainLoop
q20:
     cmp.w #18,GadgetID    ;Portamento-Step ?
     bne q21
     clr.l d0
     move.w propinf18+4,d0
     divu #1040,d0
     move.w #64,d1
     sub.w d0,d1
     move.l SoundAdr,a0
     move.w d1,288(a0)
     bra MainLoop
q21:
     cmp.w #40,GadgetID    ;Loop-Mode On/Off
     bne q22
     move.l SoundAdr,a0
     bchg #0,284(a0)
     btst #0,284(a0)
     bne q21_1
     bsr Loop_On
     bra q21_2
q21_1:
     bsr Loop_Off
q21_2:
     bsr Refresh_All
     bra MainLoop
q22:
     cmp.w #27,GadgetID    ;Filter On/Off
     bne q23
     move.l SoundAdr,a0
     bchg #7,284(a0)
     btst #7,284(a0)
     bne q22_1
     bsr Filter_Off
     bra q22_2
q22_1:
     bsr Filter_On
q22_2:
     bsr Refresh_All
     bra MainLoop
q23:
     cmp.w #28,GadgetID    ;Number of sampled Periods
     bne q24
     move.l SoundAdr,a0
     move.b sinfo28+31,304(a0)
     bra MainLoop
q24:
     cmp.w #2,GadgetID     ;Length
     bne q25
     move.l sinfo2+28,d0
     cmp.l Mem_Size,d0
     bcs.s q24_2
     move.l Mem_Size,sinfo2+28
q24_2:
     bsr Musik_aus
     move.l SoundAdr,a0
     move.w sinfo2+30,d0
     lsr.w #1,d0
     bne q24_1
     move.w #1,d0
q24_1:
     move.w d0,280(a0)
     add.w #19,d0
     move.w d0,278(a0)
     bsr WriteTeil2
     bsr MakeGadgets
     bra MainLoop
q25:
     cmp.w #4,GadgetID     ;Period for "Note"
     bne q26
     move.l SoundAdr,a0
     move.w sinfo4+30,282(a0)
     bra MainLoop
q26:
     cmp.w #3,GadgetID     ;Note für angegebene Sample-Period
     bne q27
     move.l SoundAdr,a0
     move.b sinfo3+31,305(a0)
     bra MainLoop
q27:
     cmp.w #36,GadgetID    ;Notenlänge Note 1
     bne q28
     move.b sinfo36+30,Teil2+3
     move.b sinfo36+31,Teil2+4
     bsr WriteTeil2
     bra MainLoop
q28:
     cmp.w #37,GadgetID    ;Notenlänge Note 2
     bne q29
     move.b sinfo37+30,Teil2+6
     move.b sinfo37+31,Teil2+7
     bsr WriteTeil2
     bra MainLoop
q29:
     cmp.w #34,GadgetID    ;Note 1
     bne q30
     lea strpuff34,a1
     bsr Decode_Note
     move.b d0,Teil2+2
     bsr WriteTeil2
     bra MainLoop
q30:
     cmp.w #35,GadgetID    ;Note 2
     bne q31
     lea strpuff35,a1
     bsr Decode_Note
     move.b d0,Teil2+5
     bsr WriteTeil2
     bra MainLoop
q31:
     cmp.w #42,GadgetID    ;Load Sample
     bne q32
     bsr Musik_aus
     bsr Test_Instrument
     bsr Copy_Name2
     bsr FileRequest
     tst.l d0
     beq MainLoop
Load_Raw_Data:
     move.l d0,-(sp)
     move.l d0,d1
     move.l #Access_Read,d2
     move.l DosBase,a6
     jsr Lock(a6)
     tst.l d0
     bne Lock_Ok
     move.l (sp)+,d0
     bra q31_1
Lock_Ok:
     move.l d0,Locksav
     move.l d0,d1
     move.l #FileInfo,d2
     move.l DosBase,a6
     jsr Examine(a6)
     move.l d0,-(sp)
     move.l Locksav,d1
     move.l DosBase,a6
     jsr Unlock(a6)
     move.l (sp)+,d0
     move.l (sp)+,d1
     tst.l d0
     beq q31_1
     move.l FileInfo+124,d7
     cmp.l Mem_Size,d7
     bcs.s enough_mem1
     move.l #btex14a,btext+12
     move.l #btex14b,btext2+12
     bsr Requester         ;Not enough memory !
     bra q31_1
enough_mem1:
     move.l #Mode_Old,d2
     move.l DosBase,a6
     jsr Open(a6)
     tst.l d0
     beq q31_1
     move.l d0,Locksav        ;Filehandle des Sounds
     move.l d0,d1
     move.l SoundAdr,d2
     add.l #314,d2
     move.l FileInfo+124,d3
     move.l DosBase,a6
     jsr Read(a6)
     move.l Locksav,d1
     move.l DosBase,a6
     jsr Close(a6)
     move.l SoundAdr,a1
     move.l FileInfo+124,d0
     lsr.l #1,d0
     move.w d0,280(a1)
     add.w #19,d0
     move.w d0,278(a1)
     bsr Mix_it
     bsr WriteTeil2
     bsr Copy_Name
q31_1:
     bsr Free_Mix_Buffer
     bsr MakeGadgets
     bra MainLoop
q32:
     cmp.w #41,GadgetID    ;Load Instrument
     bne q33
     bsr Musik_aus
     bsr Test_Instrument
     bsr Copy_Name2
     bsr FileRequest
     tst.l d0
     beq MainLoop
Load_SOUNDFACTORY:
     move.l d0,d1
     move.l #Mode_Old,d2
     move.l dosbase,a6
     jsr Open(a6)          ;Soundfile öffnen
     tst.l d0
     beq q31_1
     move.l d0,Locksav     ;Filehandle retten
     move.l Locksav,d1
     move.l #FileInfo,d2   ;Hilfspuffer
     move.l #6,d3          ;Kennung und Länge einlesen
     jsr Read(a6)
     cmp.l #-1,d0
     beq Load_Sound_Ende
     cmp.l #"IRQ"*256,FileInfo
     beq Load_Sound_Ok
     move.l #btex1a,btext+12
     move.l #btex1b,btext2+12
     bsr Requester
     bra Load_Sound_Ende   ;Fehler, File ist kein Soundfile
Load_Sound_Ok:
     clr.l d3
     move.w FileInfo+4,d3
     subq.l #1,d3
     lsl.l #1,d3
     move.l Mem_Size,d7
     add.l #40,d7
     cmp.l d7,d3
     bcs.s enough_mem2
     move.l #btex14a,btext+12
     move.l #btex14b,btext2+12
     bsr Requester         ;Not enough memory !
     bra Load_Sound_Ende
enough_mem2:
     move.l SoundAdr,a0
     move.w FileInfo+4,278(a0)
     move.l SoundAdr,d2
     add.l #280,d2
     move.l Locksav,d1
     jsr Read(a6)          ;Rest einlesen
     bsr Mix_it
     bsr Copy_name
Load_Sound_Ende:
     move.l Locksav,d1
     jsr Close(a6)         ;und Soundfile wieder schließen
     bsr Free_Mix_Buffer
     bsr WriteTeil2
     bsr MakeGadgets
     bra MainLoop
q33:
     cmp.w #44,GadgetID    ;Save Instrument
     bne q34
Save_Instr_as:
     bsr Musik_aus
     move.l #"SAVE",F_ITextText19 ;Requestertext auf "SAVE" umbiegen
     bsr Test_Instrument
     bsr Copy_Name2
     bsr FileRequest
     move.l #"LOAD",F_ITextText19 ;Requestertext wieder normal
Save_Instr:                ;in d0 Zeiger auf Namen (mit Pfad)
     tst.l d0
     beq MainLoop
     move.l d0,a0
     tst.b (a0)
     beq MainLoop
     move.l d0,d1
     move.l #Mode_New,d2
     move.l dosbase,a6
     jsr Open(a6)          ;File zum Schreiben öffnen
     tst.l d0
     beq q33_1
     move.l d0,Locksav
     move.l #"IRQ"*256,FileInfo
     move.l Locksav,d1
     move.l #FileInfo,d2
     move.l #4,d3
     jsr Write(a6)         ;Instrumentenkennung schreiben (IRQ+chr$(0))
     cmp.l #-1,d0
     beq q33_2
     move.l Locksav,d1
     move.l SoundAdr,a0
     clr.l d3
     move.w 278(a0),d3
     subq.l #1,d3
     lsl.l #1,d3
     move.l a0,d2
     add.l #278,d2
     jsr Write(a6)         ;Sound abspeichern
q33_2:
     move.l Locksav,d1
     jsr Close(a6)         ;und File wieder schließen
     clr.b Requesterflag   ;Dir beim nächsten Requesteraufruf neu einlesen
q33_1:
     bra MainLoop
q34:
     cmp.w #19,GadgetID    ;Filter-Speed ?
     bne q35
     clr.l d0
     move.w propinf19+4,d0
     divu #4369,d0
     addq.b #1,d0
     move.l SoundAdr,a0
     move.b d0,308(a0)
     bra MainLoop
q35:
     cmp.w #20,GadgetID    ;Filter-Frequency ?
     bne q36
     clr.l d0
     move.w propinf20+4,d0
     divu #516,d0
     move.b #128,d1
     sub.b d0,d1
     move.l SoundAdr,a0
     move.b d1,307(a0)
     move.b 306(a0),d1
     bra q36a
q36:
     cmp.w #21,GadgetID    ;Filter-Step ?
     bne q37
     clr.l d0
     move.w propinf21+4,d0
     divu #4369,d0
     move.b #16,d1
     sub.b d0,d1
     move.l SoundAdr,a0
     move.b d1,306(a0)
q36a:
     cmp.b 307(a0),d1
     bls q36_1
     move.b 307(a0),306(a0)
     bsr MakeGadgets
q36_1:
     bra MainLoop
q37:
     cmp.w #29,GadgetID    ;Phasing-Speed ?
     bne q38
     clr.l d0
     move.w propinf29+4,d0
     divu #4369,d0
     addq.b #1,d0
     move.l SoundAdr,a0
     move.b d0,302(a0)
     bra MainLoop
q38:
     cmp.w #30,GadgetID    ;Phasing-Step ?
     bne q39
     clr.l d0
     move.w propinf30+4,d0
     divu #9362,d0
     move.b #8,d1
     sub.b d0,d1
     move.l SoundAdr,a0
     move.b d1,303(a0)
     bra MainLoop
q39:
     cmp.w #33,GadgetID    ;Phasing On/Off ?
     bne q40
     move.l SoundAdr,a0
     bchg #3,284(a0)
     btst #3,284(a0)
     beq q39_1
     bsr Phasing_On
     bra q39_2
q39_1:
     bsr Phasing_Off
q39_2:
     bsr Refresh_All
     bra MainLoop
q40:
     cmp.w #31,GadgetID    ;Mark Phasing Start ?
     bne q41
     move.l #PhasingTxt_a,Phasing_Txt+12
     move.l windowhd,a1
     lea Phasing_Requester,a0
     move.l intbase,a6
     jsr Request(a6)       ;Requester anzeigen (Phasing)
     move.l #7,d4          ;linke Grenze
     move.l SoundAdr,a1
     clr.l d5
     clr.l d0
     move.b 301(a1),d5
     lsl.w #8,d5
     move.w 280(a1),d0
     lsl.w #1,d0
     divu d0,d5            ;rechte Grenze (berechnet aus Phasing End)
     addq.w #7,d5
     bsr q40sub            ;holt gültigen Mausklick im Sample in D0
     move.b d0,300(a1)
     move.l windowhd,a1
     lea Phasing_Requester,a0
     jsr EndRequest(a6)    ;Requester löschen
     bsr Clr_Phasing_Start
     bsr Refresh_All
     bra MainLoop
Clr_Phasing_Start:
     lea gadg31,a4
     bsr Clr_Gadget
     clr.w gadg31+12
     rts
Clr_Gadget:                ;löscht Gadget (a4)
     move.l GfxBase,a6
     move.l WindowHd,a0
     move.l 50(a0),a5      ;Rastport Adresse in a5
     move.l #0,d0
     move.l a5,a1
     jsr SetAPen(a6)
     move.l a5,a1
     clr.l d0
     move.w 4(a4),d0
     clr.l d1
     move.w 6(a4),d1
     move.l d0,d2
     add.w 8(a4),d2
     move.l d1,d3
     add.w 10(a4),d3
     jsr RectFill(a6)
     rts
Clr_Phasing_On:
     lea gadg33,a4
     bra Clr_Gadget
Clr_Filter_On:
     lea gadg27,a4
     bra Clr_Gadget

q40sub:
     move.l windowhd,a0
q40loop:
     btst #6,$bfe001       ;linke Maustaste gedrückt ?
     bne q40loop
     move.w 12(a0),d0
     cmp.w #143,d0         ;Y-Pos obere Grenze
     bcs q40loop
     cmp.w #206,d0         ;Y-Pos untere Grenze
     bhi q40loop
     move.w 14(a0),d0
     cmp.w d4,d0           ;X-Pos linke Grenze
     bls q40loop
     cmp.w d5,d0           ;X-Pos rechte Grenze
     bcc q40loop
     subq.w #7,d0
     move.l SoundAdr,a0
     move.w 280(a0),d1
     lsl.w #1,d1
     mulu d1,d0
     lsr.l #8,d0
     rts

q41:
     cmp.w #32,GadgetID    ;Mark Phasing End ?
     bne q42
     move.l #PhasingTxt_b,Phasing_Txt+12
     move.l windowhd,a1
     lea Phasing_Requester,a0
     move.l intbase,a6
     jsr Request(a6)       ;Requester anzeigen (Phasing)
     move.l #262,d5        ;rechte Grenze
     move.l SoundAdr,a1
     clr.l d4
     clr.l d0
     move.b 300(a1),d4
     lsl.w #8,d4
     move.w 280(a1),d0
     lsl.w #1,d0
     divu d0,d4            ;linke Grenze (berechnet aus Phasing End)
     addq.w #7,d4
     bsr q40sub            ;holt gültigen Mausklick im Sample in D0
     move.b d0,301(a1)
     move.l windowhd,a1
     lea Phasing_Requester,a0
     jsr EndRequest(a6)    ;Requester löschen
     bsr Clr_Phasing_End
     bsr Refresh_All
     bra MainLoop
Clr_Phasing_End:
     lea gadg32,a4
     bsr Clr_Gadget
     clr.w gadg32+12
     rts
q42:
     cmp.w #46,GadgetID    ;Loop-Point Start
     bne q43
     move.l SoundAdr,a0
     move.l sinfo46+28,d0
     lsr.l #1,d0
     move.w d0,310(a0)
     bsr MakeGadgets
     bra MainLoop
q43:
     cmp.w #47,GadgetID    ;Loop-Point End
     bne q44
     move.l SoundAdr,a0
     move.l sinfo47+28,d0
     lsr.l #1,d0
     move.w d0,312(a0)
     bsr MakeGadgets
     bra MainLoop
q44:
     cmp.w #50,GadgetID    ;Rechteck-Sample erzeugen
     bne q45
     bsr Musik_aus
     bsr Rangecheck
     move.l SoundAdr,a1
     clr.l 310(a1)         ;Loop-Points löschen
     bsr SetPulse
     bsr WriteTeil2
     bsr MakeGadgets
     bra MainLoop
q45:
     cmp.w #53,GadgetID    ;Schwingung komprimieren
     bne q46
     bsr Musik_aus
     move.l SoundAdr,a1
     cmp.w #1,280(a1)
     beq MainLoop
     move.w 280(a1),d0
     move.w d0,d1
     lsr.w #1,d1
     move.w d1,280(a1)
     add.w #19,d1
     move.w d1,278(a1)
     lsl.w 282(a1)
     lsr.w 310(a1)
     lsr.w 312(a1)
     bclr #0,300(a1)
     lsr.w 300(a1)
     add.l #314,a1
     move.l a1,a2
q45_Loop1:
     move.b (a1)+,(a2)+
     addq.l #1,a1
     subq.w #1,d0
     bne q45_Loop1
     bsr WriteTeil2
     bsr MakeGadgets
     bra MainLoop
q46:
     cmp.w #48,GadgetID    ;Sinus-Sample erzeugen
     bne q47
     bsr Musik_aus
     bsr Rangecheck
     clr.l d0
     clr.l d1
     clr.l d2
     lea Sinus_tab,a0
     move.l SoundAdr,a1
     clr.l 310(a1)         ;Loop-Points löschen
     move.w 280(a1),d4
     lsl.w #1,d4
     add.l #314,a1
Sinus_Loop:
     move.b 0(a0,d1.w),d3
     move.b d3,0(a1,d2.w)
     add.w #256,d0
q46_1:
     cmp.w d0,d4
     bhi q46_2
     sub.w d4,d0
     addq.w #1,d1
     bra q46_1
q46_2:
     add.w #1,d2
     cmp.w d2,d4
     bne Sinus_Loop
     bsr WriteTeil2
     bsr MakeGadgets
     bra MainLoop
q47:
     cmp.w #51,GadgetID    ;Sägezahn-Sample erzeugen
     bne q48
     bsr Musik_aus
     bsr Rangecheck
     clr.w d0              ;von (d0)
     move.l SoundAdr,a1
     clr.l 310(a1)         ;Loop-Points löschen
     move.w 280(a1),d1
     lsl.w #1,d1
     move.w #-127,d2       ;von Wert (d2)
     move.w #127,d3        ;bis Wert (d3)
     bsr CalcSample        ;berechnet die Schwingung
     bsr WriteTeil2
     bsr MakeGadgets
     bra MainLoop
CalcSample:
     cmp.w d2,d3
     blt CalcSample_1
     move.w d3,d4
     sub.w d2,d4
     move.w #1,d5          ;Richtung
     bra CalcSample_2
CalcSample_1:
     move.w d2,d4
     sub.w d3,d4
     move.w #-1,d5
CalcSample_2:
     clr.w d6
     move.w d1,d7
     sub.w d0,d7           ;in D7 Positionsdifferenz
     move.l SoundAdr,a1
     add.l #314,a1
CalcSample_Loop:
     move.b d2,0(a1,d0.w)
     add.w d4,d6
CalcSample_3:
     cmp.w d6,d7
     bhi CalcSample_4
     sub.w d7,d6
     add.w d5,d2
     bra CalcSample_3
CalcSample_4:
     addq.w #1,d0
     cmp.w d0,d1
     bne CalcSample_Loop
     rts

q48:
     cmp.w #49,GadgetID    ;Dreieck-Sample erzeugen
     bne q49
     bsr Musik_aus
     bsr Rangecheck
     clr.w d0              ;von (d0)
     move.l SoundAdr,a1
     clr.l 310(a1)         ;Loop-Points löschen
     move.w 280(a1),d1
     lsl.w #1,d1
     move.w d1,Locksav     ;Locksav wird zur Zwischenspeicherung mißbraucht
     move.w d1,-(sp)
     lsr.w #2,d1
     sub.w d1,Locksav
     clr.w d2
     move.w #127,d3
     bsr CalcSample
     move.w #-127,d3
     move.w Locksav,d1
     bsr CalcSample
     clr.w d3
     move.w (sp)+,d1
     bsr CalcSample
     bsr WriteTeil2
     bsr MakeGadgets
     bra MainLoop
q49:
     cmp.w #52,GadgetID    ;Freihand-Sample erzeugen
     bne q50
     bsr Musik_aus
     move.l windowhd,a1
     lea FreeHand_Requester,a0
     move.l intbase,a6
     jsr Request(a6)       ;Requester anzeigen (FreeHand)
     move.l SoundAdr,a1
     move.w #128,280(a1)
     move.w #147,278(a1)
     clr.l 310(a1)         ;Loop-Points löschen
     bsr MakeGadgets
     clr.b Locksav
q49_Loop2:
     bsr ShowSample
     move.l windowhd,a0
     move.l SoundAdr,a1
     add.l #314,a1
q49_Loop:
     btst #2,$dff016
     beq q49_Ende
     btst #6,$bfe001
     beq q49_2
     clr.b Locksav
     bra q49_Loop
q49_2:
     move.w 12(a0),d0
     cmp.w #143,d0
     bcs q49_Loop
     cmp.w #206,d0
     bhi q49_Loop
     move.w 14(a0),d1
     cmp.w #6,d1
     bls q49_Loop
     cmp.w #263,d1
     bcc q49_Loop
     subq.w #7,d1
     move.w #174,d2
     sub.w d0,d2
     asl.w #2,d2
     tst.b Locksav
     bne q49_1
     move.b #1,Locksav
     move.w d1,MouseX
     move.w d2,MouseY
     move.b d2,0(a1,d1.w)
     bra q49_Loop2
q49_1:                        ;d1 = x.neu ; d2 = y.neu
     move.w d2,d3
     move.w MouseX,d0
     move.w MouseY,d2
     move.w d1,MouseX
     move.w d3,MouseY
     cmp.w d0,d1
     bne q49_3
     move.b d3,0(a1,d1.w)
     bra q49_Loop2
q49_3:
     bhi q49_4
     exg d0,d1
     exg d2,d3
q49_4:
     bsr CalcSample
     bra q49_Loop2
q49_Ende:
     lea gadg52,a4
     bsr Clr_Gadget
     move.w #4,gadg52+12
     move.l windowhd,a1
     move.l intbase,a6
     lea FreeHand_Requester,a0
     jsr EndRequest(a6)    ;Requester löschen
     bsr WriteTeil2
     bsr MakeGadgets
     bra MainLoop
q50:
     cmp.w #43,GadgetID    ;Load IFF
     bne q51
     bsr Musik_aus
     bsr Test_Instrument
     bsr Copy_Name2
     bsr FileRequest
     tst.l d0
     beq MainLoop
Load_IFF:
     move.l d0,d1
     move.l #Mode_Old,d2
     move.l dosbase,a6
     jsr Open(a6)          ;Soundfile öffnen
     tst.l d0
     beq q50_1
     move.l d0,Locksav     ;Filehandle retten
     move.l Locksav,d1
     move.l #FileInfo,d2   ;Hilfspuffer
     move.l #12,d3         ;Kennung und Länge einlesen
     jsr Read(a6)
     cmp.l #-1,d0
     beq Load_IFF_Ende
     cmp.l #"FORM",FileInfo
     beq Load_IFF_Ok
     move.l #btex1c,btext2+12
q50_2:
     move.l #btex1aa,btext+12
q50_4:
     bsr Requester       ;Fehler, File ist kein Soundfile
     move.l Locksav,d1
     move.l DosBase,a6
     jsr Close(a6)
Make_Default:
     bsr SetDefault1
     bsr SetPulse_100
     bsr WriteTeil2
     bsr MakeGadgets
     bra MainLoop
Load_IFF_Ok:
     cmp.l #"8SVX",FileInfo+8
     beq Load_8SVX_Ok
     move.l #btex1d,btext2+12
     bra q50_2
Load_8SVX_Ok:
     clr.b VHDR_Found
     clr.b BODY_Found

Load_IFF_Loop:
     tst.b VHDR_Found
     beq q50_8
     tst.b BODY_Found
     bne Load_IFF_Ende
q50_8:
     move.l Locksav,d1
     move.l #FileInfo,d2
     move.l #8,d3
     jsr Read(a6)          ;CHUNK-Header einlesen (Chunktyp & Länge)
     cmp.l #-1,d0
     bne q50_3
q50_6:                     ;Trouble with IFF-Instrument
     move.l #btex3a,btext+12
     move.l #btex3c,btext2+12
     bra q50_4
q50_3:
     move.l FileInfo+4,d0
     addq.l #1,d0
     bclr #0,d0
     move.l d0,FileInfo+4  ;Chunk-Länge auf nächste gerade Zahl aufrunden
     cmp.l #"VHDR",FileInfo
     bne q50_5
     move.b #1,VHDR_Found
     move.l Locksav,d1
     move.l #FileInfo+8,d2
     move.l FileInfo+4,d3
     jsr Read(a6)          ;VHDR-Chunk einlesen
     cmp.l #-1,d0
     beq q50_6
     tst.b FileInfo+23     ;IFF-File Compressed ?
     beq.s q50_Loop2
     move.l #btex5a,btext+12   ; I cannot handle compressed Soundfiles
     move.l #btex5b,btext2+12
     bra q50_4
q50_Loop2:
     move.b FileInfo+22,d0
     add.b #"0",d0
     move.b d0,IFFTxt2+15
     move.b FileInfo+22,d0
     add.b #1,d0
     lsr.b #1,d0
     clr.l d1
     move.b d0,d1
     add.b #"0",d0
     move.b d0,IFF_strpuff1
     move.l d1,IFF_sinfo1+28
     move.b #" ",IFF_strpuff1+1
     move.b #" ",IFF_strpuff1+2
     move.l windowhd,a1
     lea IFF_Requester,a0
     move.l intbase,a6
     jsr Request(a6)       ;Requester anzeigen (Oktaven)
     clr.b IFF_strpuff1+1
     clr.b IFF_strpuff1+2
     move.w #1,IFF_sinfo1+16
q50_Loop:
     move.l ExecBase,a6
     move.l windowhd,a0
     move.l 86(a0),a0
     move.l a0,-(sp)
     jsr WaitPort(a6)      ;auf Beantwortung warten
     move.l (sp)+,a0
     jsr GetMsg(a6)
     move.l d0,a1
     move.l $14(a1),Ereignis
     move.l $1c(a1),a0
     move.l a0,Gadget_Pointer
     move.w 38(a0),GadgetID
     jsr ReplyMsg(a6)      ;Message empfangen
     cmp.l #$1000,Ereignis
     bne q50_Loop
     move.l intbase,a6
     move.l windowhd,a1
     lea IFF_Requester,a0
     jsr EndRequest(a6)    ;Requester löschen
     move.l dosbase,a6
     move.l IFF_sinfo1+28,d0
     beq q50_Loop2         ;ungültige Eingabe (0)
     cmp.b FileInfo+22,d0
     bhi q50_Loop2         ;ungültige Eingabe (Zahl > Oktave#)
     move.l FileInfo+8,d1
     move.l d1,d3
     add.l FileInfo+12,d1
     move.l d1,d4
     move.b FileInfo+22,d2
     sub.b d0,d2
     lsl.l d2,d1
     lsl.l d2,d3
     move.l SoundAdr,a0
     lsr.l #1,d1
     lsr.l #1,d3
     clr.w 310(a0)
     clr.w 312(a0)
     move.b #%00100001,d6  ;Release Off/Loop Off
     cmp.w d1,d3
     beq No_IFF_Loop
     move.b #%00100000,d6  ;Release Off/Loop On
     move.w d3,310(a0)     ;Loop-Point Start
     move.w d1,312(a0)     ;Loop-Point End
No_IFF_Loop:
     move.w d1,280(a0)     ;Samplelen
     add.w #19,d1
     move.w d1,278(a0)     ;Setsound-Len
     move.b d6,284(a0)     ;Effektbyte setzen
     clr.b 296(a0)         ;AttackTime = 0
     clr.b 297(a0)         ;SustainTime = 0
     move.b #64,298(a0)    ;SustainLevel = 64
     move.b #3,305(a0)     ;Oktave 3
     move.b #1,304(a0)     ;Anzahl gesampleter Schwingungen = 1
     clr.w d0
     bset d2,d0
     subq.w #1,d0
     mulu d4,d0            ;Anzahl der zu überlesenden Bytes berechnen
     move.l d0,Overread    ;Bytes=(2^(MaxOktave-Oktave)-1)*SampleLen
     clr.l d0
     move.w FileInfo+20,d0
     lsl.l #8,d0
     divu #4999,d0
     move.w d0,282(a0)     ;Samplingrate berechnet
     bra Load_IFF_Loop
q50_5:
     cmp.l #"BODY",FileInfo
     bne q50_9
     tst.b VHDR_Found
     bne q50_10
     move.l #btex6a,btext+12  ;Sorry, IFF-Chunks are not in correct order
     move.l #btex6b,btext2+12
     bra q50_4
q50_10:
     move.b #1,BODY_Found
     move.l Locksav,d1
     move.l Overread,d2
     clr.l d3
     jsr Seek(a6)          ;Überflüssige Bytes überlesen
     move.l Locksav,d1
     move.l SoundAdr,d2
     move.l d2,a0
     add.l #314,d2
     clr.l d3
     move.w 280(a0),d3
     lsl.l #1,d3
     cmp.l Mem_Size,d3
     bcs.s enough_mem3
     move.l #btex14a,btext+12
     move.l #btex14b,btext2+12  ;Not enough memory !
     bra q50_4
enough_mem3:
     jsr Read(a6)          ;Sample einlesen
     bsr Mix_it
     bra Load_IFF_Loop
q50_9:
     move.l FileInfo+4,d2
     clr.l d3
     move.l Locksav,d1
     jsr Seek(a6)          ;Chunk überlesen
     bra Load_IFF_Loop
Load_IFF_Ende:
     move.l Locksav,d1
     jsr Close(a6)         ;und Soundfile wieder schließen
     bsr WriteTeil2
q50_1:
     bsr Copy_Name
     bsr MakeGadgets
     bsr Free_Mix_Buffer
     bra MainLoop
q51:
     cmp.w #54,GadgetID    ;Play Realtime
     bne q52
     bsr Musik_aus
     bsr wind4open
     move.l SoundAdr,a5
     add.l #276,a5
     lea 0,a0
     clr.b d1
     sub.l a2,a2
     move.b M_MenuItem8a+12,d7
     and.b #1,d7
     bsr Play_alone
     tst.l windowhd4
     beq MainLoop
     bsr wind4close
     bra MainLoop
q52:
     cmp.w #55,GadgetID    ;LED On/Off
     bne q53
     tst.b LED
     beq.s q52_1
     bsr LED_Off
     bra.s q52_2
q52_1:
     bsr LED_On
q52_2:
     bsr Refresh_All
     bra MainLoop
q53:
     bra MainLoop


Menu_Switch:               ;Ab hier Menu-Dispatch
     move.w MenuPick,d0    ;welcher Menüpunkt ?
     move.w d0,d1
     lsr.w #5,d1
     and.w #63,d1
     and.w #31,d0
     cmp.w #0,d0           ;Erster Menüpunkt ?
     bne NotM1
     cmp.w #2,d1           ;Dritter Eintrag ? (Load)
     bne NotE1
     tst.b ChangeFlag
     beq PrL1
     move.l #ctex1a,ctext+12
     move.l #ctex1b,ctext2+12 ;Overwrite old project ?
     bsr SicherRequest
     tst.b d0
     beq PrL2              ;rechter Knopf -> zurück
PrL1:
     bsr Musik_aus
     bset #7,LT_LT1+13
     bclr #7,LT_LT2+13
     bclr #7,LT_LT3+13
     bclr #0,LT_LT1+12     ;alle vier Gadgets enablen
     bclr #0,LT_LT2+12
     bclr #0,LT_LT3+12
     bclr #0,LT_LT4+12
     move.l #"LOAD",LT_ITextText7
     move.l #"LOAD",LT_ITextText5
     move.l windowhd,a1
     lea Type_Requester,a0
     move.l intbase,a6
     jsr Request(a6)       ;Requester anzeigen (LOAD-Type)
Project_Load1:
     move.l ExecBase,a6
     move.l windowhd,a0
     move.l 86(a0),a0
     move.l a0,-(sp)
     jsr WaitPort(a6)      ;auf Beantwortung warten
     move.l (sp)+,a0
     jsr GetMsg(a6)
     move.l d0,a1
     move.l $14(a1),Ereignis
     move.l $1c(a1),a0
     move.l a0,Gadget_Pointer
     move.w 38(a0),GadgetID
     jsr ReplyMsg(a6)      ;Message empfangen
     cmp.l #$40,Ereignis
     bne ProLoad2
     cmp.w #4,GadgetID
     bne Project_Load2
     bchg #7,LT_LT1+13
     bchg #7,LT_LT2+13
     bchg #7,LT_LT3+13
     lea 0,a2
     lea LT_GadgetList1,a0
     move.l windowhd,a1
     move.l intbase,a6
     jsr RefreshGadgets(a6)   ;alle Gadgets anzeigen
     bset #7,LT_LT1+13
     bset #7,LT_LT2+13
     bset #7,LT_LT3+13
     bra Project_Load1
Project_Load2:
     cmp.w #5,GadgetID
     bne Project_Load1
     move.l intbase,a6
     move.l windowhd,a1
     lea Type_Requester,a0
     jsr EndRequest(a6)    ;Requester löschen
     bsr Wait_CloseReq
     tst.b LT_LT1+13
     bmi ProLo_weiter
     tst.b LT_LT2+13
     bmi ProLo_weiter
     tst.b LT_LT3+13
     bpl PrL1              ;gar kein Gadget selektiert -> wiederholen
ProLo_weiter:
     bsr Copy_Name3
     bsr FileRequest
     tst.l d0              ;wirklich ein File selektiert ?
     beq MainLoop          ;nein, dann abbrechen
     move.l d0,a0
     tst.b (a0)
     beq MainLoop
     move.b LT_LT1+13,d5
     move.b LT_LT2+13,d6
     move.b LT_LT3+13,d7
     move.l d0,a0
     move.l d0,a1
PrLoop1:                   ;von vorne Endemarkierung suchen (0)
     tst.b (a0)+
     bne.s PrLoop1
     cmp.b #".",-3(a0)     ;.a oder .m abtrennen
     bne.s PrL3
     clr.b -3(a0)
     sub.l #2,a0
PrL3:                      ;A0 zeigt direkt hinter den Namen
     move.b #"a",TempName+10 ;TempName auf .a setzen
     lea PName,a2
     move.l a1,a3
PrL3_Loop:                 ;Namen als Projektnamen übertragen
     move.b (a3)+,(a2)+
     tst.b (a3)
     bne.s PrL3_Loop
     clr.b (a2)
PrLPlp:
     move.b -(a3),d4
     cmp.b #":",d4
     beq.s Halt_1
     cmp.b #"/",d4
     beq.s Halt_1
     cmp.l a3,a1
     bne.s PrLPlp
     bra.s Cont_xx
Halt_1:
     addq.l #1,a3       ;a3 zeigt nun auf Anfang des tatsächl. Namen
Cont_xx:
     lea Projectname,a2
Copy_Lp_2:
     move.b (a3)+,(a2)+
     tst.b (a3)
     bne.s Copy_Lp_2
     clr.b (a2)
     move.l intbase,a6
     movem.l d5-d7/a0/a1,-(sp)
     move.l #-1,d0
     move.l screenhd,a0
     jsr ShowTitle(a6)     ;neue Titelleiste anzeigen
     bsr Del_TempFiles     ;alte Arbeitsfiles löschen
     movem.l (sp)+,d5-d7/a0/a1
     tst.b d6              ;soll ein OBJECT-File geladen werden ?
     bpl PrL4              ;falls nicht, dann zu PrL4
     move.b #".",-1(a0)
     move.b #"a",(a0)
     clr.b 1(a0)           ;.a an den Filenamen anhängen
     movem.l d5-d7/a0/a1,-(sp)
     lea Komm1Name,a3
     bsr PrepCOPY          ;kopiert Filenamen von (a1) nach Komm1Name
     move.l dosbase,a6
     clr.l d2
     move.l NILHandle,d3   ;Output nach NIL:
;     move.l #Kommando1,d1
     move.l #Komm1Name,d1
     jsr Copy ;Execute(a6)       ;COPY-Befehl ausführen
     movem.l (sp)+,d5-d7/a0/a1
     cmp.l #-1,d0
     bne PrL5
;    tst.l d0
;    beq.s PrL4a
;     movem.l d5-d7/a0/a1,-(sp)
;     jsr IoErr(a6)
;     movem.l (sp)+,d5-d7/a0/a1
;     tst.w d0              ;COPY erfolgreich ?
;     beq PrL5              ;Ja, dann zu PrL5 (kein EXE-File mehr laden)
PrL4a:
     clr.b d6              ;Nein, dann Erfolgsflag löschen
PrL4:
     tst.b d7              ;soll ein EXE-File geladen werden ?
     bpl PrL5              ;nein, dann zu PrL5
     clr.b -1(a0)          ;Filenamen bereinigen
     movem.l d5-d7/a0/a1,-(sp)
     move.l dosbase,a6
     move.l a1,d1
     move.l #Mode_Old,d2
     jsr Open(a6)          ;File öffnen
     movem.l (sp)+,d5-d7/a0/a1
     move.l d0,Locksav
     bne.s PrL6
     clr.b d7              ;falls nicht erfolgreich, Erfolgsflag löschen
     bra PrL5              ;und zu PrL5
PrL6:
     movem.l d5-d7/a0/a1,-(sp)
     move.l Locksav,d1
     move.l #IRQ_Music_Len+784,d2
     clr.l d3
     jsr Seek(a6)                 ;5850 Bytes überlesen
     movem.l (sp)+,d5-d7/a0/a1
     cmp.l #-1,d0                 ;konnten 5850 Bytes überlesen werden ?
     bne.s PrL7
PrL8:
     clr.b d7                     ;nein, dann Erfolgsflag löschen
     movem.l d5-d7/a0/a1,-(sp)
     move.l Locksav,d1            ;und File wieder schliessen
     jsr Close(a6)
     movem.l (sp)+,d5-d7/a0/a1
     bra PrL5                     ;und zu PrL5 springen
PrL7:
     movem.l d5-d7/a0/a1,-(sp)
     move.l Locksav,d1
     move.l #Komm1Name,d2
     move.l #4,d3
     jsr Read(a6)                 ;4 Bytes (Länge) nach Komm1Name lesen
     movem.l (sp)+,d5-d7/a0/a1
     cmp.l #4,d0                  ;konnten 4 Bytes gelesen werden ?
     bne.s PrL8                   ;nein, dann zu Prl8
     movem.l d5-d7/a0/a1,-(sp)
     move.l Execbase,a6
     move.l Komm1Name,d0
     clr.l d1
     jsr AllocMem(a6)             ;Versuchen (Komm1Name) Bytes zu allok.
     movem.l (sp)+,d5-d7/a0/a1
     move.l d0,Komm1Name+4        ;erfolgreich reserviert ?
     beq So_ein_Scheiss           ;nein...
     move.l dosbase,a6
     move.l Locksav,d1
     move.l Komm1Name+4,d2
     addq.l #4,d2
     move.l Komm1Name,d3
     subq.l #4,d3                 ;gesamtes File an reservierten
     movem.l d3/d5-d7/a0/a1,-(sp)
     jsr Read(a6)                 ;Speicher + 4 laden
     movem.l (sp)+,d3/d5-d7/a0/a1
     cmp.l d3,d0                  ;konnte geladen werden ?
     beq.s PrL9
     clr.b d7                     ;nein, dann Erfolgsflag löschen
     bra Prl10                    ;und zu PrL10 (Close & FreeMem)
PrL9:
     movem.l d5-d7/a0/a1,-(sp)
     move.l Locksav,d1
     jsr Close(a6)                ;Sourcefile schliessen
     move.l #TempName,d1
     move.l #Mode_New,d2
     jsr Open(a6)                 ;Zielfile öffnen (Temp-SF:T.a)
     movem.l (sp)+,d5-d7/a0/a1
     move.l d0,Locksav            ;konnte Zielfile geöffnet werden ?
     bne.s PrL11
     clr.b d7                     ;nein, dann Erfolgsflag löschen
     movem.l d5-d7/a0/a1,-(sp)
     bra PrL12                    ;und Speicher freigeben
PrL11:
     move.l d0,d1
     move.l Komm1Name+4,d2
     move.l Komm1Name,d3
     movem.l d3/d5-d7/a0/a1,-(sp)
     move.l d2,a0
     move.l d3,(a0)
     jsr Write(a6)                ;gesamtes File schreiben
     movem.l (sp)+,d3/d5-d7/a0/a1
     cmp.l d3,d0                  ;konnte File geschrieben werden ?
     beq.s PrL10
     clr.b d7                     ;nein, dann Erfolgsflag löschen
PrL10:
     movem.l d5-d7/a0/a1,-(sp)
     move.l Locksav,d1
     jsr Close(a6)
PrL12:
     move.l Komm1Name+4,a1
     move.l Komm1Name,d0
     move.l Execbase,a6
     jsr FreeMem(a6)
     movem.l (sp)+,d5-d7/a0/a1
     bra Prl5
So_ein_Scheiss:                   ;alternative COPY-Routine
     move.l Irq_Music_Buffer,a2
     add.l #Irq_Music_Len-1024,a2 ;a2=^Ladepuffer
     movem.l d5-d7/a0-a2,-(sp)
     move.l #TempName,d1
     move.l #Mode_New,d2
     move.l dosbase,a6
     jsr Open(a6)                 ;Zielfile öffnen (Temp-SF:T.a)
     movem.l (sp)+,d5-d7/a0-a2
     move.l d0,Komm1Name+8        ;konnte Zielfile geöffnet werden ?
     beq PrL8                     ;nein, dann File schließen
     movem.l d5-d7/a0-a2,-(sp)
     move.l Komm1Name+8,d1
     move.l #Komm1Name,d2
     move.l #4,d3
     jsr Write(a6)                ;File-Länge schreiben
     movem.l (sp)+,d5-d7/a0-a2
     cmp.l #4,d0                  ;Fehler beim Schreiben ?
     bne.s PrL14                  ;ja, dann alles schliessen
     move.l Komm1Name,d1
     subq.l #4,d1
     move.l d1,Komm1Name
Coppy_Loop:
     move.l Locksav,d1
     move.l a2,d2
     move.l Komm1Name,d3
     cmp.l #1024,d3               ;noch weniger als 1025 Bytes ?
     bls Cpp1                     ;ja, dann ok
     move.l #1024,d3              ;sonst nur 1024 Bytes lesen
Cpp1:
     sub.l d3,Komm1Name           ;Anzahl gelesener Bytes abziehen
     movem.l d5-d7/a0-a2,-(sp)
     jsr Read(a6)                 ;immer 1024 Bytes lesen
     movem.l (sp)+,d5-d7/a0-a2
     cmp.l #-1,d0                 ;Lesefehler ?
     bne PrL13
PrL14:
     move.l Komm1Name+8,d1
     movem.l d5-d7/a0/a1,-(sp)
     jsr Close(a6)                ;Ja, dann Zielfile schliessen
     movem.l (sp)+,d5-d7/a0/a1
     bra PrL8                     ;und Rest schliessen
PrL13:
     move.l d0,Komm1Name+12       ;Länge zwischenspeichern
     move.l Komm1Name+8,d1
     move.l a2,d2
     move.l d0,d3
     movem.l d5-d7/a0-a2,-(sp)
     jsr Write(a6)
     movem.l (sp)+,d5-d7/a0-a2
     cmp.l Komm1Name+12,d0        ;Fehler aufgetreten ?
     bne.s PrL14                  ;ja, dann alles schliessen
     cmp.l #1024,d0               ;Alle Teile kopiert ?
     beq Coppy_Loop               ;nein, dann weiter kopieren
     move.l Komm1Name+8,d1
     movem.l d5-d7/a0/a1,-(sp)
     jsr Close(a6)                ;Zielfile schliessen
     move.l Locksav,d1
     jsr Close(a6)                ;Sourcefile schliessen
     movem.l (sp)+,d5-d7/a0/a1

PrL5:
     move.b #"m",TempName+10 ;TempName auf .m setzen
     tst.b d5              ;soll ein SOURCE-File geladen werden ?
     bpl PrL_Statistik     ;falls nicht, dann zu PrL_Statistik
     move.b #".",-1(a0)
     move.b #"m",(a0)
     clr.b 1(a0)           ;.m an den Filenamen anhängen
     movem.l d5-d7/a0/a1,-(sp)
     lea Komm1Name,a3
     bsr PrepCOPY          ;kopiert Filenamen von (a1) nach Komm1Name
     move.l dosbase,a6
     clr.l d2
     move.l NILHandle,d3
;     move.l #Kommando1,d1
     move.l #Komm1Name,d1
     jsr Copy ;Execute(a6)       ;COPY-Befehl ausführen
     movem.l (sp)+,d5-d7/a0/a1
     cmp.l #-1,d0
     bne PrL_Statistik
;     tst.l d0
;     beq.s PrLLL
;     movem.l d5-d7/a0/a1,-(sp)
;     jsr IoErr(a6)
;     movem.l (sp)+,d5-d7/a0/a1
;     tst.w d0              ;COPY erfolgreich ?
;     beq PrL_Statistik     ;Ja, dann zu PrL_Statistik
PrLLL:
     clr.b d5              ;Nein, dann Erfolgsflag löschen
PrL_Statistik:
     clr.b ChangeFlag
     clr.b CodeFlag
     move.b d5,SourceFlag
     move.b d6,ObjectFlag
     or.b d7,ObjectFlag
     move.l #"LOAD",LS_ITextText2
     bsr MakeStatus
     bsr ShowStatus
     bra MainLoop

Kommando1: dc.b "SF:Copy >NIL: "
Komm1Name: dcb.b 66,32
TempName:  dc.b "Temp-SF:T.a",0

PrL2:
     bra MainLoop
ProLoad2:
     cmp.l #$1000,Ereignis
     bne Project_Load1
     bra MainLoop

Wait_CloseReq:             ;wartet auf Close-Message
     move.l ExecBase,a6
     move.l windowhd,a0
     move.l 86(a0),a0
     move.l a0,-(sp)
     jsr WaitPort(a6)      ;auf Beantwortung warten
     move.l (sp)+,a0
     jsr GetMsg(a6)
     move.l d0,a1
     move.l $14(a1),Ereignis
     move.l $1c(a1),a0
     move.l a0,Gadget_Pointer
     move.w 38(a0),GadgetID
     jsr ReplyMsg(a6)      ;Message empfangen
     cmp.l #$1000,Ereignis
     bne Wait_CloseReq
     rts

PrepCOPY:                  ;kopiert Filenamen von (a1) nach (a3)
     move.l a3,a2
     move.b #66,d0
PrLop2:                    ;Filenamen für COPY-Befehl mit Leerzeichen
     move.b #" ",(a2)+     ;löschen
     subq.b #1,d0
     bne.s PrLop2
PrLop:                     ;Filenamen eintragen
     move.b (a1)+,(a3)+
     tst.b (a1)
     bne.s PrLop

GetFileSize:               ;bestimmt Größe des Files in TempName
     move.l #TempName,d1
GetFileSize2:
     movem.l d5-d7/a0/a1,-(sp)
     move.l #Access_Read,d2
     move.l DosBase,a6
     jsr Lock(a6)
     tst.l d0
     bne Locki_Ok
Locki_nix_Ok:
     move.l #-1,d0
     movem.l (sp)+,d5-d7/a0/a1
     rts
Locki_Ok:
     move.l d0,Locksav
     move.l d0,d1
     move.l #FileInfo,d2
     move.l DosBase,a6
     jsr Examine(a6)
     move.l d0,-(sp)
     move.l Locksav,d1
     move.l DosBase,a6
     jsr Unlock(a6)
     move.l (sp)+,d0
     tst.l d0
     beq Locki_nix_Ok
     move.l FileInfo+124,d0
     movem.l (sp)+,d5-d7/a0/a1
     rts

MakeStatus:                ;erzeugt Inhalt des Status-Requesters
     move.l #"/   ",LS_ITextText4
     move.w #"  ",LS_ITextText4+4
     move.l #"/   ",LS_ITextText6
     move.w #"  ",LS_ITextText6+4
     tst.b LT_LT1+13       ;sollte SOURCE geladen werden ?
     bpl PrL15             ;nein, dann bei "/" belassen
     move.l #"Erro",LS_ITextText4
     move.b #"r",LS_ITextText4+4
     tst.b d5              ;Fehler aufgetreten ?
     bpl PrL15             ;ja, dann bei "Error" belassen
     move.l #"load",LS_ITextText4
     move.w #"ed",LS_ITextText4+4
     move.b #".",TempName+9
     move.b #"m",TempName+10
     bsr GetFileSize       ;Filegröße bestimmen
     cmp.l #-1,d0          ;konnte Größe nicht bestimmt werden ?
     bne.s PrL15_toll
     move.w #"??",LS_ITextText6 ;nein, dann ?? eintragen
     bra.s PrL15
PrL15_toll:
     movem.l a0/a1,-(sp)
     lea LS_ITextText6,a1
     bsr Make_Number       ;Filegröße eintragen
     move.b #" ",(a1)
     movem.l (sp)+,a0/a1
PrL15:
     tst.b d6
     bmi PrL15a
     tst.b d7
     bpl PrL15b
PrL15a:
     move.b #".",TempName+9
     move.b #"a",TempName+10
     bsr GetFileSize
     move.l d0,Locksav     ;Filegröße merken
PrL15b:
     move.l #"/   ",LS_ITextText8
     move.w #"  ",LS_ITextText8+4
     move.l #"/   ",LS_ITextText10
     move.w #"  ",LS_ITextText10+4
     tst.b LT_LT2+13       ;sollte OBJECT geladen werden ?
     bpl PrL16             ;nein, dann bei "/" belassen
     move.l #"Erro",LS_ITextText8
     move.b #"r",LS_ITextText8+4
     tst.b d6              ;Fehler aufgetreten ?
     bpl PrL16             ;ja, dann bei "Error" belassen
     move.l #"load",LS_ITextText8
     move.w #"ed",LS_ITextText8+4
     cmp.l #-1,Locksav     ;konnte Größe nicht bestimmt werden ?
     bne.s PrL16_toll
     move.w #"??",LS_ITextText10 ;nein, dann ?? eintragen
     bra.s PrL16
PrL16_toll:
     movem.l a0/a1,-(sp)
     lea LS_ITextText10,a1
     move.l Locksav,d0
     bsr Make_Number       ;Filegröße eintragen
     move.b #" ",(a1)
     movem.l (sp)+,a0/a1
PrL16:
     move.l #"/   ",LS_ITextText12
     move.w #"  ",LS_ITextText12+4
     move.l #"/   ",LS_ITextText14
     move.w #"  ",LS_ITextText14+4
     tst.b LT_LT3+13       ;sollte EXE geladen werden ?
     bpl PrL17             ;nein, dann bei "/" belassen
     move.l #"Erro",LS_ITextText12
     move.b #"r",LS_ITextText12+4
     tst.b d7              ;Fehler aufgetreten ?
     bpl PrL17             ;ja, dann bei "Error" belassen
     move.l #"load",LS_ITextText12
     move.w #"ed",LS_ITextText12+4
     cmp.l #-1,Locksav     ;konnte Größe nicht bestimmt werden ?
     bne.s PrL17_toll
     move.w #"??",LS_ITextText14 ;nein, dann ?? eintragen
     bra.s PrL17
PrL17_toll:
     movem.l a0/a1,-(sp)
     lea LS_ITextText14,a1
     move.l Locksav,d0
     add.l #IRQ_Music_Len+328,d0
     bsr Make_Number       ;Filegröße eintragen
     move.b #" ",(a1)
     movem.l (sp)+,a0/a1
PrL17:
     rts

ShowStatus:                ;zeigt Status-Requester an
     move.l windowhd,a1
     lea LOAD_Status,a0
     move.l intbase,a6
     jsr Request(a6)       ;Requester anzeigen (LOAD-Status)
PrL18:
     move.l ExecBase,a6
     move.l windowhd,a0
     move.l 86(a0),a0
     move.l a0,-(sp)
     jsr WaitPort(a6)      ;auf Beantwortung warten
     move.l (sp)+,a0
     jsr GetMsg(a6)
     move.l d0,a1
     move.l $14(a1),Ereignis
     move.l $1c(a1),a0
     move.l a0,Gadget_Pointer
     move.w 38(a0),GadgetID
     move.w $20(a1),MouseX
     move.w $22(a1),MouseY
     jsr ReplyMsg(a6)      ;Message empfangen
     cmp.l #$1000,Ereignis
     bne PrL18
     rts

NotE1:			   ;NotE2 existiert bis jetzt nicht
     cmp.w #4,d1           ;Vierter Eintrag ? (Save as)
     bne NotE3
     tst.b ObjectFlag
     bne.s PrSA1
     tst.b SourceFlag
     beq MainLoop
PrSA1:
     bsr Copy_Name3
     move.l #"SAVE",F_ITextText19 ;Requestertext auf "SAVE" umbiegen
     bsr FileRequest
     move.l #"LOAD",F_ITextText19 ;Requestertext wieder normal
     tst.l d0              ;wirklich ein File selektiert ?
     beq MainLoop          ;nein, dann abbrechen
     move.l d0,a0
     tst.b (a0)
     beq MainLoop
     move.l d0,a0
     move.l d0,a1
PrSALoop1:                 ;von vorne Endemarkierung suchen (0)
     tst.b (a0)+
     bne.s PrSALoop1
     cmp.b #".",-3(a0)     ;.a oder .m abtrennen
     bne.s PrSA3
     clr.b -3(a0)
     sub.l #2,a0
PrSA3:                     ;A0 zeigt direkt hinter den Namen
     move.b #"a",TempName+10 ;TempName auf .a setzen
     lea PName,a2
     move.l a1,a3
PrSA3_Loop:                ;Namen als Projektnamen übertragen
     move.b (a3)+,(a2)+
     tst.b (a3)
     bne.s PrSA3_Loop
     clr.b (a2)
PrSAPlp:
     move.b -(a3),d4
     cmp.b #":",d4
     beq.s HaltSA_1
     cmp.b #"/",d4
     beq.s HaltSA_1
     cmp.l a3,a1
     bne.s PrSAPlp
     bra.s ContSA_xx
HaltSA_1:
     addq.l #1,a3       ;a3 zeigt nun auf Anfang des tatsächl. Namen
ContSA_xx:
     lea Projectname,a2
CopySA_Lp_2:
     move.b (a3)+,(a2)+
     tst.b (a3)
     bne.s CopySA_Lp_2
     clr.b (a2)
     move.l intbase,a6
     move.l #-1,d0
     move.l screenhd,a0
     jsr ShowTitle(a6)     ;neue Titelleiste anzeigen
     bsr Musik_aus
     bra PrS_nochmal
  ;-------
     bra MainLoop
NotE3:
     cmp.w #0,d1           ;Erster Eintrag ? (About)
     bne NotE4
     bsr ClearMenu
     bsr Musik_aus
     bra Gimme_Copyright
NotE4:
     cmp.w #10,d1           ;Neunter Eintrag ? (Quit)
     bne NotE5
Quit_clicked:              ;Einsprung für QUIT-Gadget
     move.l #ctex2a,ctext+12
     move.l #ctex2b,ctext2+12 ;Sure you want to quit ?
     bsr SicherRequest
     tst.b d0
     beq PrL2              ;rechter Knopf -> nicht beenden
     bsr Del_TempFiles
     bra Schluss
NotE5:
     cmp.w #5,d1           ;Sechster Eintrag (Clear)
     bne NotE6
     tst.b ChangeFlag
     beq.s NotE5_ok
     move.l #ctex3a,ctext+12
     move.l #ctex3b,ctext2+12 ;Sure you want to discard changes ?
     bsr SicherRequest
     tst.b d0
     beq PrL2              ;rechter Knopf -> kein Clear
NotE5_ok:
     bsr Musik_aus
     clr.b CodeFlag
     clr.b ChangeFlag
     clr.b SourceFlag
     clr.b ObjectFlag
     bsr Del_TempFiles
     lea Projectname,a0
     move.b #"u",(a0)+
     move.b #"n",(a0)+
     move.b #"t",(a0)+
     move.b #"i",(a0)+
     move.b #"t",(a0)+
     move.b #"l",(a0)+
     move.b #"e",(a0)+
     move.b #"d",(a0)+
     clr.b (a0)
     move.l intbase,a6
     move.l #-1,d0
     move.l screenhd,a0
     jsr ShowTitle(a6)     ;neue Titelleiste anzeigen
     bra MainLoop

Del_TempFiles:             ;löscht die Tempfiles
     move.b #".",TempName+9
     move.b #"m",TempName+10
     move.l dosbase,a6
     move.l #TempName,d1
     jsr DeleteFile(a6)    ;Sourcefile löschen
Del_Object:                ;löscht Object & Exe Temp-Files
     move.l dosbase,a6
     clr.b TempName+9
     move.l #TempName,d1
     jsr DeleteFile(a6)    ;EXE-File löschen
     move.b #".",TempName+9
     move.b #"a",TempName+10
     move.l #TempName,d1
     jsr DeleteFile(a6)    ;Objectfile löschen
     rts

NotE6:
     cmp.w #7,d1           ;Fünfter Eintrag ? (Status)
     bne NotE7
     move.l #"File",LS_ITextText2
     clr.b d5
     clr.b d6
     clr.b d7
     tst.b ObjectFlag
     beq NotE6a
     move.b #$80,d6
     move.b d6,d7
NotE6a:
     tst.b SourceFlag
     beq NotE6b
     move.b #$80,d5
NotE6b:
     move.b d5,LT_LT1+13
     move.b d6,LT_LT2+13
     move.b d7,LT_LT3+13
     bsr MakeStatus
     tst.b ObjectFlag
     beq NotE6c
     move.l #"Ok"*65536,LS_ITextText8
     move.l #"Ok"*65536,LS_ITextText12
NotE6c:
     tst.b SourceFlag
     beq NotE6d
     move.l #"Ok"*65536,LS_ITextText4
NotE6d:
     bsr ShowStatus
PjS2:
     bra MainLoop

NotE7:
     cmp.w #3,d1           ;Dritter Eintrag ? (Save)
     bne NotE8
     bsr Musik_aus
PrS_nochmal:
     bset #7,LT_LT1+13
     bset #7,LT_LT2+13
     bclr #7,LT_LT3+13
     bclr #0,LT_LT1+12     ;alle drei Gadgets enablen
     bclr #0,LT_LT2+12
     bclr #0,LT_LT3+12
     bset #0,LT_LT4+12     ;All-Gadget disablen
     tst.b SourceFlag
     bne.s PjS1
     bclr #7,LT_LT1+13
     bset #0,LT_LT1+12
     tst.b ObjectFlag
     beq.s PjS2
PjS1:
     tst.b ObjectFlag
     bne.s PjS3
     bclr #7,LT_LT2+13
PjS3:
     move.l #"SAVE",LT_ITextText7
     move.l #"SAVE",LT_ITextText5
     move.l windowhd,a1
     lea Type_Requester,a0
     move.l intbase,a6
     jsr Request(a6)       ;Requester anzeigen (SAVE-Type)
Project_Save1:
     move.l ExecBase,a6
     move.l windowhd,a0
     move.l 86(a0),a0
     move.l a0,-(sp)
     jsr WaitPort(a6)      ;auf Beantwortung warten
     move.l (sp)+,a0
     jsr GetMsg(a6)
     move.l d0,a1
     move.l $14(a1),Ereignis
     move.l $1c(a1),a0
     move.l a0,Gadget_Pointer
     move.w 38(a0),GadgetID
     jsr ReplyMsg(a6)      ;Message empfangen
     cmp.l #$40,Ereignis
     bne ProSave2
     cmp.w #4,GadgetID
     bne Project_Save2
     bchg #7,LT_LT1+13
     bchg #7,LT_LT2+13
     bchg #7,LT_LT3+13
     lea 0,a2
     lea LT_GadgetList1,a0
     move.l windowhd,a1
     move.l intbase,a6
     jsr RefreshGadgets(a6)   ;alle Gadgets anzeigen
     bset #7,LT_LT1+13
     bset #7,LT_LT2+13
     bset #7,LT_LT3+13
     bra Project_Save1
Project_Save2:
     cmp.w #5,GadgetID
     bne Project_Save1
     move.l intbase,a6
     move.l windowhd,a1
     lea Type_Requester,a0
     jsr EndRequest(a6)    ;Requester löschen
     bsr Wait_CloseReq
     tst.b LT_LT1+13
     bmi ProSa_weiter
     tst.b LT_LT2+13
     bmi ProSa_weiter
     tst.b LT_LT3+13
     bpl PrS_nochmal       ;gar kein Gadget selektiert -> wiederholen
ProSa_weiter:
     lea PName,a0
PrSLoop1:                  ;von vorne Endemarkierung suchen (0)
     tst.b (a0)+
     bne.s PrSLoop1        ;A0 zeigt hinter den Namen+Pfad
     clr.b Requesterflag
     tst.b LT_LT1+13       ;SOURCE-File speichern ?
     bpl PrS2              ;nein, dann zu PrS2
     move.b #"m",TempName2+10
     move.b #".",TempName2+9
     move.b #".",-1(a0)
     move.b #"m",(a0)
     clr.b 1(a0)           ;.m an den Filenamen anhängen
     movem.l a0,-(sp)
     move.l dosbase,a6
     clr.l d2
     move.l NILHandle,d3   ;Output nach NIL:
;     move.l #Kommando2,d1
     move.l #TempName2,d1
     jsr Copy ;Execute(a6)       ;COPY-Befehl ausführen
;     jsr IoErr(a6)
     movem.l (sp)+,a0
     clr.b -1(a0)          ;Projektnamen wieder in Ordnung bringen
     cmp.l #-1,d0
     bne.s PrS2b
;     tst.w d0              ;COPY erfolgreich ?
;     beq.s PrS2b           ;Ja, dann zu PrS2b (Changeflag löschen)
     move.l #ctex5a,ctext+12
     move.l #ctex5b,ctext2+12 ;Cannot save sourcefile, continue ?
     move.l a0,-(sp)
     bsr SicherRequest
     move.l (sp)+,a0
     tst.b d0
     beq PrS4              ;rechter Knopf -> Abbruch
     bra.s PrS2
PrS2b:
     clr.b ChangeFlag
PrS2:
     tst.b LT_LT2+13       ;OBJECT-File speichern ?
     bpl PrS3              ;nein, dann zu PrS3
     tst.b ObjectFlag      ;existiert ein gültiges Object-File ?
     bne PrS2a
PrS2z:
     move.l a0,-(sp)
     bsr Open_Working
     move.l NILHandle,d3   ;SF-Ass Ausgaben nach NIL:
     bsr Assemble          ;nein, dann assembliere Source-File
     bsr Close_Working
     move.l (sp)+,a0
     tst.b ObjectFlag      ;Assemblierung erfolgreich ?
     bne PrS2a             ;ja, dann zur Speicherung
     move.l #btex8a,btext+12
     move.l #btex8b,btext2+12
     bsr Requester         ;Error in sourcefile! Cannot continue
     bra PrS4
PrS2a:
     tst.b LT_LT2+13       ;soll wirklich OBJECT gesaved werden ?
     bpl PrS3a
     move.b #"a",TempName2+10
     move.b #".",TempName2+9
     move.b #".",-1(a0)
     move.b #"a",(a0)
     clr.b 1(a0)           ;.a an den Filenamen anhängen
     movem.l a0,-(sp)
     move.l dosbase,a6
     clr.l d2
     move.l NILHandle,d3   ;Output nach NIL:
;     move.l #Kommando2,d1
     move.l #TempName2,d1
     jsr Copy ;Execute(a6)       ;COPY-Befehl ausführen
;     jsr IoErr(a6)
     movem.l (sp)+,a0
     clr.b -1(a0)          ;Projektnamen wieder in Ordnung bringen
     cmp.l #-1,d0
     bne.s PrS3
 ;    tst.w d0              ;COPY erfolgreich ?
 ;    beq PrS3              ;Ja, dann zu PrS3
     move.l #ctex6a,ctext+12
     move.l #ctex5b,ctext2+12 ;Cannot save objectfile, continue ?
     move.l a0,-(sp)
     bsr SicherRequest
     move.l (sp)+,a0
     tst.b d0
     beq PrS4              ;rechter Knopf -> Abbruch
PrS3:
     tst.b LT_LT3+13       ;soll EXE-File gesaved werden ?
     bpl PrS4              ;nein, dann zu PrS4
     bclr #7,LT_LT2+13
     tst.b ObjectFlag      ;existiert ein Object-File ?
     beq PrS2z             ;nein, dann erst assemblieren
PrS3a:
     clr.b CodeFlag
     bsr Open_Working
     move.l NILHandle,d3
     move.l #LinkBegin,d1
     clr.l d2
     move.l dosbase,a6
     jsr Execute(a6)
     bsr Close_Working
     move.b #$ff,CodeFlag
     clr.b TempName+9
     bsr GetFileSize
     cmp.l #-1,d0          ;Fehler aufgetreten ?
     bne.s LinkenOk
     clr.b CodeFlag        ;ja, dann CodeFlag löschen
LinkenOk:
     tst.b CodeFlag        ;Linker erfolgreich ?
     bne ExeSave
     move.l #btex9a,btext+12
     move.l #btex8b,btext2+12
     bsr Requester         ;Linker error! Cannot continue
     bra PrS4
ExeSave:
     move.b #" ",TempName2+10
     move.b #" ",TempName2+9
     move.l dosbase,a6
     clr.l d2
     move.l NILHandle,d3   ;Output nach NIL:
;     move.l #Kommando2,d1
     move.l #TempName2,d1
     jsr Copy ;Execute(a6)       ;COPY-Befehl ausführen
;     jsr IoErr(a6)
     cmp.l #-1,d0
     bne.s PrS4
;     tst.w d0              ;COPY erfolgreich ?
;     beq PrS4              ;Ja, dann zu PrS4
     move.l #btex10a,btext+12
     move.l #btex10b,btext2+12
     bsr Requester         ;Cannot save executable

PrS4:
     bra MainLoop
ProSave2:
     cmp.l #$1000,Ereignis
     bne Project_Save1
     bra MainLoop
NotE8:
     bra MainLoop

NotM1:
     cmp.w #2,d0           ;Dritter Menüpunkt ?
     bne NotM2
     cmp.w #0,d1           ;Erster Eintrag ? (Edit)
     bne NotE1_1
     bsr Musik_aus
     tst.b SourceFlag
     bne NotM1c
     tst.b ObjectFlag
     beq NotM1c
     move.l #ctex4a,ctext+12
     move.l #ctex4b,ctext2+12 ;Sure you want to drop the Object&Exe files?
     bsr SicherRequest
     tst.b d0
     beq NotM1a            ;rechter Knopf -> kein Edit
     bsr Del_TempFiles     ;alte Arbeitsfiles löschen
NotM1c:
     tst.b Editor_Flag
     bne.s NotM1z
     move.l windowhd,a1
     lea Ed_Requester,a0
     move.l intbase,a6
     jsr Request(a6)       ;Requester anzeigen
NotM1z:
     move.l dosbase,a6
     move.l NILhandle,d2
     move.l NILhandle,d3
     move.l #Kommando,d1
     jsr Execute(a6)
     tst.b Editor_Flag
     bne.s NotM1y
     move.l intbase,a6
     move.l windowhd,a1
     lea Ed_Requester,a0
     jsr EndRequest(a6)    ;Requester löschen
NotM1y:
     move.b #$ff,ChangeFlag
     clr.b ObjectFlag      ;altes Objectfile jetzt ungültig
     move.b #$ff,SourceFlag
NotM1a:
     bra MainLoop
Kommando:
     dc.b "c:Ed Temp-SF:T.m",0
     ds.b 60
   even
NotE1_1:
     cmp.w #2,d1           ;Zweiter Eintrag ? (Check)
     bne NotE2_1
     bsr Musik_aus
     tst.b SourceFlag
     bne NotE2_1c
     move.l #btex7a,btext+12
     move.l #btex7b,btext2+12
     bsr Requester
     bra MainLoop
NotE2_1c:
     bsr OpenAssWindow
     move.l conhandle,d3
     beq NotE1_1a
     bsr Assemble
     move.l conhandle,d1
     move.l #HitAKey,d2
     move.l #HitAKey1-HitAKey,d3
     move.l dosbase,a6
     jsr Write(a6)         ;Press any key to continue...
     move.l conhandle,d1
     move.l #Locksav,d2
     move.l #1,d3
     jsr Read(a6)
     bsr CloseAssWindow
NotE1_1a:
     bra MainLoop
HitAKey:
     dc.b 10,13,"Press any key to continue...",10
HitAKey1:
   even
AssBegin:
     dc.b "SF:SF-Ass Temp-SF:T",0,0,0,0
   even
LinkBegin:
     dc.b "SF:SF-Linker Temp-SF:T",0,0,0,0
   even

Assemble:                  ;assembliert "T.m" Parameter: D3.L enthält
     move.l d3,-(sp)       ;Output-Handle
     bsr Del_Object        ;altes Objectfile löschen
     move.l (sp)+,d3
     move.l #AssBegin,d1
     clr.l d2
     jsr Execute(a6)
     move.b #$ff,ObjectFlag
     move.b #".",TempName+9
     move.b #"a",TempName+10
     bsr GetFileSize
     cmp.l #-1,d0          ;Fehler aufgetreten ?
     bne.s NotE1_1b
     clr.b ObjectFlag      ;ja, dann ObjectFlag löschen
NotE1_1b:
     rts

NotE2_1:
     cmp.w #6,d1           ;Vierter Eintrag ? (Player)
     bne NotE3_1
     bsr Musik_aus
     clr.b Play_Flag
     move.l #P_Image33,P_Gadget17+18
     bclr #7,P_Gadget17+13
     move.l #P_Image35,P_Gadget18+18
     move.l #P_Image37,P_Gadget19+18
     bclr #7,P_Gadget19+13
     bclr #7,P_Gadget25+13
     move.l #P_Image49,P_Gadget25+18
     tst.b ObjectFlag      ;Objectfile vorhanden ?
     bne Play_Ok1
     tst.b SourceFlag      ;nein, dann: Sourcefile vorhanden ?
     beq.s Nix_Play        ;nein, dann zurück
     bsr Open_Working
     move.l NILHandle,d3
     bsr Assemble          ;Sourcefile assemblieren
     bsr Close_Working
     tst.b ObjectFlag      ;Assemblierung erfolgreich ?
     bne.s Play_Ok1
     move.l #btex8a,btext+12  ;nein, dann Fehler
     move.l #btex8c,btext2+12
     bsr Requester         ;Error in sourcefile! Cannot continue !
Nix_Play:
     bra MainLoop
Play_Ok1:
     bsr Get_Object        ;holt Objectfile ins CHIPMEM (Adr. in Object)
     tst.l Object          ;Länge in Objectlength
     bne.s Play_It
     move.l #btex14a,btext+12
     move.l #btex14b,btext2+12
     bsr Requester         ;Not enough memory !
     beq Nix_Play
Play_It:
     move.l windowhd,a1
     lea Player_Requester,a0
     move.l intbase,a6
     jsr Request(a6)       ;Requester anzeigen (Player)
     bsr Player_Effekt1
     move.b #1,AktSong
     move.b #15,AktVoices  ;alle Stimmen eingeschaltet
     bsr SetVoices
     bsr SetSongActive     ;schaltet LED des aktiven Songs ein
     bsr Refresh_Player
     move.l intbase,a6
     move.l windowhd,a0
     move.l 50(a0),a0
     lea Z_Image1,a1
     move.l #100,d0
     move.l #80,d1
     jsr DrawImage(a6)
Player_Loop1:
     tst.b Play_Flag       ;spielt eine Musik ?
     bne Playing
     move.l ExecBase,a6    ;nein...
     move.l windowhd,a0
     move.l 86(a0),a0
     move.l a0,-(sp)
     jsr WaitPort(a6)      ;auf Beantwortung warten
     move.l (sp)+,a0
     jsr GetMsg(a6)
Player_Loop2:
     move.l d0,a1
     move.l $14(a1),Ereignis
     move.l $1c(a1),a0
     move.l a0,Gadget_Pointer
     move.w 38(a0),GadgetID
     jsr ReplyMsg(a6)      ;Message empfangen
     cmp.l #$20,Ereignis
     beq Pl8               ;Gadget gedrückt -> vielleicht Forward ?
     cmp.l #$40,Ereignis
     bne Player_Loop1
     cmp.w #17,GadgetID    ;Play
     bne Pl2
     tst.b P_Gadget19+13   ;Pause aktiviert ?
     bmi Player_Loop1
Start_Play:
     move.l $6c,a0
     cmp.w #$4e71,(a0)     ;läuft schon eine Musik ?
     beq PlayErr1
     move.b #1,Play_Flag
     move.l #P_Image34,P_Gadget17+18
     bsr Clr_Timer
     move.l Object,a0
     clr.l d0
     move.b AktSong,d0
     move.l IRQ_Music_Buffer,a1
     jsr (a1)
     tst.b LED
     bne.s Play_LEDon
     bsr LED_Off
Play_LEDon:
     move.l IRQ_Music_Buffer,a1
     move.b AktVoices,d0
     jsr 28(a1)
     move.l $6c,HilfIRQ+2
     move.l #MeinIRQ,$6c
     bclr #7,P_Gadget17+13
     bsr Refresh_Player
     bsr SV4
     bra Player_Loop1
Playing:
     move.l ExecBase,a6
     move.l windowhd,a0
     move.l 86(a0),a0
     jsr GetMsg(a6)
     tst.l d0
     bne Player_Loop2
     tst.b Timer_Flag
     beq Player_Loop1
     clr.b Timer_Flag
     bsr ShowTime
     bsr Check_Songende
     tst.b d0
     beq Player_Loop1
     cmp.b #2,d0
     bne nix_Musi3
     move.w #10,d0
     move.l IRQ_Music_Buffer,a1
     jsr 12(a1)            ;FADE-Out einleiten
Warte_auf_aus:
     move.l IRQ_Music_Buffer,a1
     jsr 24(a1)
     tst.b d0
     bne.s Warte_auf_aus
nix_Musi3:
     bsr nix_Musi
     tst.b P_Gadget25+13
     bpl Player_Loop1
     bra Start_Random

PlayErr1:                  ;es läuft schon eine Musik!
     move.l #btex4a,btext+12
     move.l #btex4b,btext2+12
     bsr Requester
     bra Player_Loop1
Clr_Timer:
     clr.w Timer
     clr.b Timer_low
     clr.b Timer_Sek
     clr.b Timer_Flag
     clr.b Timer_Min
     bra ShowTime
Pl2:
     cmp.w #17,GadgetID    ;eine der Songnummern ist gedrückt
     bcc Pl3
     bsr Musik_aus
     bsr Clr_Timer
     bsr SetSongInactive
     move.l #P_Image33,P_Gadget17+18
     bclr #7,P_Gadget17+13
     move.l #P_Image37,P_Gadget19+18
     bclr #7,P_Gadget19+13
     bclr #7,P_Gadget25+13
     move.l #P_Image49,P_Gadget25+18
     move.b GadgetID+1,AktSong
     bsr SetSongActive
     move.b #15,AktVoices
     bsr SetVoices
     bsr Refresh_Player
     bra Player_Loop1
Pl3:
     cmp.w #20,GadgetID    ;Stop
     bne Pl4
     bclr #7,P_Gadget25+13
     move.l #P_Image49,P_Gadget25+18
     bsr nix_Musi
     bra Player_Loop1

nix_Musi:
     tst.b P_Gadget19+13
     bpl.s nix_Musi2
     move.l #MeinIRQ,$6c
nix_Musi2:
     bsr Musik_aus
     move.l #P_Image33,P_Gadget17+18
     bclr #7,P_Gadget17+13
     move.l #P_Image35,P_Gadget18+18
     move.l #P_Image37,P_Gadget19+18
     bclr #7,P_Gadget19+13
     bsr Refresh_Player
     rts
Pl4:
     cmp.w #21,GadgetID    ;Voice 1
     bne Pl5
     bchg #0,AktVoices
Pl4a:
     move.l IRQ_Music_Buffer,a1
     move.b AktVoices,d0
     jsr 28(a1)
     bsr SetVoices
     bsr Refresh_Player
     bra Player_Loop1
Pl5:
     cmp.w #22,GadgetID    ;Voice 2
     bne.s Pl6
     bchg #1,AktVoices
     bra Pl4a
Pl6:
     cmp.w #23,GadgetID    ;Voice 3
     bne.s Pl7
     bchg #2,AktVoices
     bra Pl4a
Pl7:
     cmp.w #24,GadgetID    ;Voice 4
     bne Pl9
     bchg #3,AktVoices
     bra Pl4a
Pl8:
     cmp.w #18,GadgetID    ;Forward
     bne Player_Loop1
     tst.b Play_Flag       ;spielt eine Musik ?
     beq Player_Loop1      ;nein, dann zurück
     tst.b P_Gadget19+13   ;Pause aktiviert ?
     bmi Player_Loop1      ;ja, dann zurück
     move.l HilfIRQ+2,$6c  ;Abspielroutine aus dem Interrupt nehmen
     move.l #P_Image36,P_Gadget18+18
Pl8_Loop1:
     bsr MeinIRQ2
     tst.b Timer_Flag
     beq.s Pl8_Loop2
     clr.b Timer_Flag
     bsr ShowTime
     bsr Check_Songende    ;d0 = 1, falls Song zu Ende
     tst.b d0
     beq.s Pl8_Loop2
     move.l #MeinIRQ,$6c
     bra nix_Musi3
Pl8_Loop2:
     btst #6,$bfe001        ;linke Maustaste noch gedrückt ?
     beq Pl8_Loop1          ;ja, dann weiter in der Schleife bleiben
     move.l #MeinIRQ,$6c
     move.l #P_Image35,P_Gadget18+18
     bsr Refresh_Player
     bra Player_Loop1
Pl9:
     cmp.w #19,GadgetID    ;Pause
     bne Pl10
     tst.b Play_Flag
     bne.s Pl9a
     bclr #7,P_Gadget19+13
     bsr Refresh_Player
     bra Player_Loop1
Pl9a:
     tst.b P_Gadget19+13
     bpl Pl9b
     move.l HilfIRQ+2,$6c  ;Abspielroutine aus dem Interrupt nehmen
     move.w #15,DMACON     ;DMA ausschalten
     move.l #P_Image38,P_Gadget19+18
     bra Player_Loop1
Pl9b:
     move.l #P_Image37,P_Gadget19+18
     move.l #MeinIRQ,$6c
     bsr Refresh_Player
     bra Player_Loop1
Pl10:
     cmp.w #26,GadgetID    ;Scan
     bne Pl11
     tst.b Play_Flag
     beq.s Pl10b
     bclr #7,P_Gadget26+13
     bsr Refresh_Player
     bra Player_Loop1
Pl10b:
     move.l #P_Image52,P_Gadget26+18
     bsr Clr_Timer
     bsr ShowTime
     move.l Object,a0
     clr.l d0
     move.b AktSong,d0
     move.l IRQ_Music_Buffer,a1
     jsr (a1)
     move.l IRQ_Music_Buffer,a1
     clr.b d0
     jsr 28(a1)
     move.w #15,DMACON     ;DMA ausschalten
Pl10_Loop1:
     bsr MeinIRQ2
     tst.b Timer_Flag
     beq.s Pl10_Loop2
     clr.b Timer_Flag
     move.b Timer_Sek,d0
     and.b #$0f,d0
     bne.s nix_ShowTime
     bsr ShowTime
nix_ShowTime:
     bsr Check_Songende    ;d0 = 1, falls Song zu Ende
     tst.b d0
     bne.s Pl10a
Pl10_Loop2:
     btst #6,$bfe001        ;linke Maustaste noch gedrückt ?
     bne Pl10_Loop1         ;ja, dann weiter in der Schleife bleiben
Pl10a:
     move.l IRQ_Music_Buffer,a1
     jsr 8(a1)
     move.l #P_Image51,P_Gadget26+18
     bclr #7,P_Gadget26+13
     bsr ShowTime
     bra Player_Loop1
Pl11:
     cmp.w #25,GadgetID    ;Shuffle
     bne Pl12
     tst.b Play_Flag
     beq.s Pl11b
     bclr #7,P_Gadget25+13
     move.l #P_Image49,P_Gadget25+18
     bsr Refresh_Player
     bra Player_Loop1
Pl11b:
     move.l #P_Image50,P_Gadget25+18
     bsr Calc_Songtable    ;schaut nach, welche Songs existieren
Start_Random:
     bsr SetSongInactive
     bsr Player_Effekt1
     bsr Get_Song          ;holt eine Song# nach d0 (0 = keiner mehr)
     tst.b d0
     bne.s Pl11c
     move.b #1,AktSong
     bsr SetSongActive
     bclr #7,P_Gadget25+13
     move.l #P_Image49,P_Gadget25+18
     bsr Refresh_Player
     bra Player_Loop1
Pl11c:
     move.b d0,AktSong
     bsr SetSongActive
     bra Start_Play

Calc_Songtable:
     lea Songtab,a0
     move.l Object,a1
     clr.w d0
Pl11d:
     move.b #$ff,d1
     tst.b 4(a1,d0.w)
     bne.s Pl11e
     clr.b d1
Pl11e:
     move.b d1,0(a0,d0.w)
     addq.b #1,d0
     cmp.b #16,d0
     bne.s Pl11d
     rts

Get_Song:
     lea Songtab,a0
     clr.w d0
Pl11f:
     tst.b 0(a0,d0.w)
     bne.s Pl11g
     addq.b #1,d0
     cmp.b #16,d0
     bne.s Pl11f
     clr.b d0
     rts
Pl11g:
     clr.w d0
     move.b VHPOSR,d0
     move.b $dff007,d1
     eor.b d1,d0
     and.b #15,d0
     lea Songtab,a0
     tst.b 0(a0,d0.w)
     beq.s Pl11g           ;nein, dann neuen Song auswählen
     clr.b 0(a0,d0.w)
     addq.b #1,d0
     rts
Songtab:
     dcb.b 16,0
Pl12:
     cmp.w #28,GadgetID    ;EXIT
     bne Player_Loop1
     bsr Musik_aus
     bsr SetSongInactive
     move.l ExecBase,a6
     move.l Object,a1
     move.l Objectlength,d0
     jsr FreeMem(a6)       ;Speicher für Backgrndsong wieder freigeben
     move.l intbase,a6
     move.l windowhd,a1
     lea Player_Requester,a0
     jsr EndRequest(a6)    ;Requester löschen
     bsr Wait_CloseReq
     bra MainLoop
Refresh_Player:            ;Refreshed alle Player-Requester-Gadgets
     move.l windowhd,a1
     move.l intbase,a6
     lea P_GadgetList1,a0
     lea Player_Requester,a2
     jsr RefreshGadgets(a6)
     rts
Refresh_Player2:           ;Refreshed Player-Requester-Gadgets
     move.l windowhd,a1
     move.l intbase,a6
     lea P_Gadget26,a0
     lea Player_Requester,a2
     jsr RefreshGadgets(a6)
     rts
SetSongActive:
     lea P_Active(pc),a2
     bra SelectSong
SetSongInactive:
     lea P_Inactive(pc),a2
SelectSong:
     clr.w d0
     move.b AktSong,d0
     subq.w #1,d0
     lsl.w #2,d0
     lea P_ZielAdr(pc),a0
     move.l 0(a0,d0.w),a1
     move.l 0(a2,d0.w),d1
     move.l d1,10(a1)
     rts
SetVoices:
     move.l #P_ImageData41,P_Image41+10
     move.l #P_ImageData43,P_Image43+10
     move.l #P_ImageData45,P_Image45+10
     move.l #P_ImageData47,P_Image47+10
     btst #0,AktVoices
     beq.s SV1
     move.l #P1_ImageData1,P_Image41+10
SV1:
     btst #1,AktVoices
     beq.s SV2
     move.l #P1_ImageData2,P_Image43+10
SV2:
     btst #2,AktVoices
     beq.s SV3
     move.l #P1_ImageData3,P_Image45+10
SV3:
     btst #3,AktVoices
     beq.s SV4
     move.l #P1_ImageData4,P_Image47+10
SV4:
     clr.w d0
     move.b AktVoices,d0
     eor.b #$f,d0
     move.w d0,DMACON
     rts
Check_Songende:            ;liefert 1 in d0, falls Musik beendet
     move.l IRQ_Music_Buffer,a1
     jsr 24(a1)            ;holt alle noch eingesch. Stimmen
     moveq.b #1,d1
     tst.b d0
     beq.s CSE1
     move.b #2,d1
     move.w P_P_Gadget28SInfo+30,d0
     cmp.w Timer,d0
     bls.s CSE1
     clr.b d1
CSE1:
     move.b d1,d0
     rts

Player_Effekt1:
     move.b #1,Locksav
PlEff2:
     move.b Locksav,d7
     move.b #4,d6
PlEff1
     move.b d7,AktSong
     bsr SetSongActive
     addq.b #4,d7
     subq.b #1,d6
     bne PlEff1
     move.l dosbase,a6
     move.l #3,d1
;     jsr Delay(a6)
     bsr Refresh_Player
     addq.b #1,Locksav
     cmp.b #5,Locksav
     bne PlEff2
     move.b #1,Locksav
PlEff4:
     move.b Locksav,d7
     move.b #4,d6
PlEff3
     move.b d7,AktSong
     bsr SetSongInactive
     addq.b #4,d7
     subq.b #1,d6
     bne PlEff3
     move.l dosbase,a6
     move.l #3,d1
;     jsr Delay(a6)
     bsr Refresh_Player
     addq.b #1,Locksav
     cmp.b #5,Locksav
     bne PlEff4
     rts
ShowTime:                  ;zeigt Timer-Stand an
     clr.w d0
     move.b Timer_Sek,d0
     and.b #$f,d0
     bsr CalcDigit         ;errechnet aus d0 einen Zeiger in d1
     move.l d1,Z_Image5+10
     clr.w d0
     move.b Timer_Sek,d0
     lsr.b #4,d0
     bsr CalcDigit         ;errechnet aus d0 einen Zeiger in d1
     move.l d1,Z_Image4+10
     clr.w d0
     move.b Timer_Min,d0
     and.b #$f,d0
     bsr CalcDigit         ;errechnet aus d0 einen Zeiger in d1
     move.l d1,Z_Image2+10
     clr.w d0
     move.b Timer_Min,d0
     lsr.b #4,d0
     bsr CalcDigit         ;errechnet aus d0 einen Zeiger in d1
     move.l d1,Z_Image1+10
     bsr Refresh_Player2
     rts

CalcDigit:
     lsl.w #2,d0
     lea Digit_Tab,a0
     move.l 0(a0,d0.w),d1
     rts
Digit_Tab:
     dc.l Z_ImageData1,Z_ImageData2
     dc.l Z_ImageData3,Z_ImageData4,Z_ImageData5
     dc.l Z_ImageData6,Z_ImageData7,Z_ImageData8
     dc.l Z_ImageData9,Z_ImageData10
P_ZielAdr:
     dc.l P_Image1,P_Image3,P_Image5,P_Image7
     dc.l P_Image9,P_Image11,P_Image13,P_Image15
     dc.l P_Image17,P_Image19,P_Image21,P_Image23
     dc.l P_Image25,P_Image27,P_Image29,P_Image31
P_Active:
     dc.l P1_ImageData1,P1_ImageData2,P1_ImageData3,P1_ImageData4
     dc.l P1_ImageData5,P1_ImageData6,P1_ImageData7,P1_ImageData8
     dc.l P1_ImageData9,P1_ImageData10,P1_ImageData11,P1_ImageData12
     dc.l P1_ImageData13,P1_ImageData14,P1_ImageData15,P1_ImageData16
P_Inactive:
     dc.l P_ImageData1,P_ImageData3,P_ImageData5,P_ImageData7
     dc.l P_ImageData9,P_ImageData11,P_ImageData13,P_ImageData15
     dc.l P_ImageData17,P_ImageData19,P_ImageData21,P_ImageData23
     dc.l P_ImageData25,P_ImageData27,P_ImageData29,P_ImageData31

NotE3_1:
     cmp.w #4,d1           ;Dritter Eintrag ? (Record)
     bne NotE4_1
     bsr Musik_aus
     clr.l Record_Buffer   ;noch keine Aufnahme vorhanden
     clr.l Record_length
     clr.l Nota_Buffero
     bclr #0,R_Gadget5+12  ;Backgroundsoung enablen
     bclr #0,R_Gadget2+12  ;Buffersize enablen
     tst.b ObjectFlag      ;Objectfile vorhanden ?
     bne Rec_Ok1
     tst.b SourceFlag      ;nein, dann: Sourcefile vorhanden ?
     beq Rec_Ok2           ;nein, dann Backgroundsong disablen
     bsr Open_Working
     move.l NILHandle,d3
     bsr Assemble          ;Sourcefile assemblieren
     bsr Close_Working
     tst.b ObjectFlag      ;Assemblierung erfolgreich ?
     bne Rec_Ok1
     move.l #btex8a,ctext+12  ;nein, dann Fehler
     move.l #ctex7b,ctext2+12
     bsr SicherRequest     ;Error in Sourcefile, continue anyway ?
     tst.b d0
     beq Nix_Record        ;rechter Knopf -> Abbruch
Rec_Ok2:
     bclr #7,R_Gadget5+13
     bset #0,R_Gadget5+12  ;Backgroundsoung disablen
     clr.l Object
     bra Rec_Ok3
Rec_Ok1:
     bsr Get_Object        ;holt Objectfile ins CHIPMEM (Adr. in Object)
     tst.l Object          ;Länge in Objectlength
     bne.s Rec_Ok3
     move.l #btex14a,btext+12
     move.l #btex14b,btext2+12
     bsr Requester         ;Not enough memory !
     bra Nix_Record
Rec_Ok3:
     move.w #1,R_R_Gadget6SInfo+30
     move.w #"1"*256,R_R_Gadget6SIBuff
Show_Record:
     bsr CalcVoices
     bclr #0,R_Gadget6+12  ;Song# enablen
     btst #0,R_Gadget5+12  ;Backgroundsong disabled ?
     beq.s Rec_Ok4
     bsr Voices_off        ;ja, dann alle Voices disablen
     bset #0,R_Gadget6+12  ;Song# auch disablen
Rec_Ok4:
     move.l windowhd,a1
     lea Record_Requester,a0
     move.l intbase,a6
     jsr Request(a6)       ;Requester anzeigen (Record Part)
Record_Loop1:
     move.l ExecBase,a6
     move.l windowhd,a0
     move.l 86(a0),a0
     move.l a0,-(sp)
     jsr WaitPort(a6)      ;auf Beantwortung warten
     move.l (sp)+,a0
     jsr GetMsg(a6)
     move.l d0,a1
     move.l $14(a1),Ereignis
     move.l $1c(a1),a0
     move.l a0,Gadget_Pointer
     move.w 38(a0),GadgetID
     jsr ReplyMsg(a6)      ;Message empfangen
     cmp.l #$40,Ereignis
     bne Record_Loop1
     cmp.w #6,GadgetID     ;Song#
     bne Re1
     tst.w R_R_Gadget6SInfo+30
     bne Re1a
Re1c:
     move.w #1,R_R_Gadget6SInfo+30
     move.w #"1"*256,R_R_Gadget6SIBuff
Re1b:
     move.l intbase,a6
     move.l windowhd,a1
     lea Record_Requester,a0
     jsr EndRequest(a6)    ;Requester löschen
     bsr Wait_CloseReq
     bra Show_Record
Re1ba:
     move.l intbase,a6
     move.l windowhd,a1
     lea Record_Requester,a0
     jsr EndRequest(a6)    ;Requester löschen
     bsr Wait_CloseReq
     bra Rec_Ok4
Re1a:
     cmp.w #17,R_R_Gadget6SInfo+30
     bcc.s Re1c
     bra.s Re1b
Re1:
     cmp.w #11,GadgetID    ;Play
     bne Re2
     move.l SoundAdr,a5
     add.l #276,a5
     clr.b d1
     move.b R_R_Gadget6SInfo+31,d4
     subq.b #1,d4
     move.l Object,a0
     sub.l a2,a2
     tst.b R_Gadget5+13    ;Backgroundsong eingeschaltet ?
     bmi.s Re1az           ;ja, dann eingesch. Stimmen bestimmen
     sub.l a0,a0
     bra Re1ae             ;nein, dann a0:=0 und Play
Re1az:
     clr.b d0
     tst.b R_Gadget7+13
     bpl.s Re1aa
     bset #0,d0
Re1aa:
     tst.b R_Gadget8+13
     bpl.s Re1ab
     bset #1,d0
Re1ab:
     tst.b R_Gadget9+13
     bpl.s Re1ac
     bset #2,d0
Re1ac:
     tst.b R_Gadget10+13
     bpl.s Re1ad
     bset #3,d0
Re1ad:
     cmp.b #15,d0          ;4 Stimmen eingeschaltet ?
     bne.s Re1ae
     move.l #btex11a,btext+12  ;ja, dann Fehler
     move.l #btex11b,btext2+12
     bsr Requester         ;Hey, you MUST keep one voice for play !
     bra Record_Loop1
Re1ae:
     movem.l d0-d7/a0-a6,-(sp)
     bsr wind4open
     movem.l (sp)+,d0-d7/a0-a6
     move.b M_MenuItem8a+12,d7
     and.b #1,d7
     bsr Play_Alone
     tst.l windowhd4
     beq Record_Loop1
     bsr wind4close
     bra Record_Loop1
Re2:
     cmp.w #12,GadgetID    ;Record
     bne Re3
     tst.l Record_Buffer   ;schon Speicher für Record-Puffer vorhanden ?
     bne.s Re2a
     move.l ExecBase,a6    ;nein, dann welchen anfordern
     move.l R_R_Gadget2SInfo+28,d0 ;Buffersize
     clr.l d1
     jsr AllocMem(a6)
     move.l d0,Record_Buffer
     bne.s Re2aaa
     move.l #btex12a,btext+12  ;ja, dann Fehler
     move.l #btex12b,btext2+12
     bsr Requester         ;Not enough memory for recording-buffer !
     bra Record_Loop1
Re2aaa:
     move.l R_R_Gadget2SInfo+28,d0
     clr.l d1
     jsr AllocMem(a6)      ;Speicher für REPLAY anfordern
     move.l d0,Nota_Buffero
Re2a:
     bset #0,R_Gadget2+12  ;Buffersize Gadget disablen
     move.l SoundAdr,a5
     add.l #276,a5
     move.b R_R_Gadget3SInfo+31,d1 ;Quantizing
     move.b R_R_Gadget6SInfo+31,d4 ;Song#
     subq.b #1,d4
     move.l Object,a0
     tst.b R_Gadget5+13    ;Backgroundsong eingeschaltet ?
     bmi Re2az             ;ja, dann eingesch. Stimmen bestimmen
     sub.l a0,a0
     bra Re2ae             ;nein, dann a0:=0 und Play

Get_All_Voices:
     clr.b d0
     tst.b R_Gadget7+13
     bpl.s Re2aa
     bset #0,d0
Re2aa:
     tst.b R_Gadget8+13
     bpl.s Re2ab
     bset #1,d0
Re2ab:
     tst.b R_Gadget9+13
     bpl.s Re2ac
     bset #2,d0
Re2ac:
     tst.b R_Gadget10+13
     bpl.s Re2ad
     bset #3,d0
Re2ad:
     rts

Re2az:
     bsr Get_All_Voices
     cmp.b #15,d0          ;4 Stimmen eingeschaltet ?
     bne.s Re2ae
     move.l #btex11a,btext+12  ;ja, dann Fehler
     move.l #btex11b,btext2+12
     bsr Requester         ;Hey, you MUST keep one voice for play !
     bra Re1ba             ;Requester löschen & neu anzeigen
Re2ae:
     move.l Record_Buffer,a1
     move.l R_R_Gadget2SInfo+28,d2
     clr.b d3
     tst.b R_Gadget4+13    ;Record from first keystroke ?
     bpl.s Re2b
     move.b #1,d3
Re2b:
     movem.l d0-d7/a0-a6,-(sp)
     bsr wind4open
     movem.l (sp)+,d0-d7/a0-a6
     move.l Nota_Buffero,a2
     move.b M_MenuItem8a+12,d7
     and.b #1,d7
     bsr Play_Alone
     move.l d0,Record_length
     move.b d1,-(sp)
     tst.l windowhd4
     beq.s Re2c
     bsr wind4close
Re2c:
     move.b (sp)+,d1
     tst.b d1              ;Puffer voll ?
     beq.s Re2d
     move.l #btex13a,btext+12  ;ja, dann Fehler
     move.l #btex13b,btext2+12
     bsr Requester         ;Recording-buffer full !
Re2d:
     bra Re1ba             ;Requester löschen & neu anzeigen

Re3:
     cmp.w #13,GadgetID    ;REPLAY
     bne Re4
     tst.l Nota_Buffero    ;überhaupt schon was aufgenommen ?
     beq Record_Loop1      ;nee, dann zurück
     tst.b R_Gadget5+13    ;Backgroundsong eingeschaltet ?
     bmi Re3a              ;ja, dann weiter
     move.l SoundAdr,a0
     clr.b 4(a0)           ;keine Stimme eingeschaltet
     move.l IRQ_Music_Buffer,a1
     move.l #1,d0
     jsr (a1)              ;Initmusic
     move.l IRQ_Music_Buffer,a0
     move.b #1,VarBase-69(a0) ;aktuelle Stimme einschalten
     move.l Nota_Buffero,VarBase-52(a0) ;Zeiger auf nächste Note
     move.l SoundAdr,a5
     add.l #276,a5
     move.l a5,Soundtabelle+124(a0) ;Sound 31 ist gleich dem Editorsound
     move.b #31,VarBase-28(a0)
     move.l SoundAdr,a0
     move.b #1,4(a0)       ;Stimme 1 einschalten
     bsr Anhoeren
     move.l SoundAdr,a0
     move.l #276,20(a0)    ;Veränderungen wieder rückgängig machen
     bra Record_Loop1      ;und zurück
Re3a:
     bsr Get_All_Voices    ;bestimmt alle eingeschalteten Stimmen
     cmp.b #15,d0          ;4 Stimmen eingeschaltet ?
     bne.s Re3b
     move.l #btex11a,btext+12  ;ja, dann Fehler
     move.l #btex11b,btext2+12
     bsr Requester         ;Hey, you MUST keep one voice for play !
  bra Record_Loop1 ;   bra Re1b    ;Requester löschen & neu anzeigen
Re3b:
     clr.l d1
     clr.l d2
Re3c:
     btst d1,d0
     beq.s Re3d            ;freie Stimme bestimmt
     addq.b #1,d1
     bra.s Re3c
Re3d:
     bset d1,d2            ;d1 = freie Stimme; d2 = Bit# (d1)
     move.b R_R_Gadget6SInfo+31,d4 ;Song#
     clr.l d3              ;d0 = eingeschaltete Stimmen
     move.b d4,d3
     subq.b #1,d3
     move.l Object,a0
     move.b 4(a0,d3.w),Locksav ;Originalstimmen merken
     move.l d3,d6          ;d3 merken (Song# 0-15)
     move.b d0,4(a0,d6.w)  ;eingeschaltete Stimmen setzen
     move.l IRQ_Music_Buffer,a1
     movem.l d0-d6/a0-a1,-(sp)
     clr.l d0
     move.b d4,d0
     jsr (a1)
     movem.l (sp),d0-d6/a0-a1 ;Register wiederholen, SP aber lassen
     move.b Locksav,4(a0,d3.w) ;Originalstimmen wieder reparieren
     lsl.l #2,d1
     move.l Nota_Buffero,VarBase-52(a1,d1.w) ;Zeiger auf nächste Note
     lsr.l #2,d1
     move.b d2,VarBase-69(a1) ;aktuelle Stimme einschalten
     move.l SoundAdr,a5
     add.l #276,a5
     move.l a5,Soundtabelle+124(a1) ;Sound 31 ist gleich dem Editorsound
     move.b #31,VarBase-28(a1,d1.w)
     jsr 4(a1)             ;einmal Play aufrufen
     movem.l (sp)+,d0-d6/a0-a1 ;Register wiederholen, SP aber lassen
     or.b d2,d0
     move.b d0,VarBase-69(a1) ;jetzt alle benutzten Stimmen einsch.
     bsr Anhoeren
     bra Record_Loop1      ;und zurück

Anhoeren:
     move.l $6c,a0
     cmp.w #$4e71,(a0)     ;läuft schon eine Musik ?
     beq Anh_Ende
     move.l IRQ_Music_Buffer,a1
     move.l #15,d0
     jsr 28(a1)
     tst.b LED
     bne.s Play_LEDonx
     bsr LED_Off
Play_LEDonx:
     move.l $6c,HilfIRQ+2
     move.l #MeinIRQ,$6c
Anh_m1:
     move.l IRQ_Music_Buffer,a1
     jsr 24(a1)            ;holt alle noch eingesch. Stimmen
     tst.b d0
     beq.s Anh_Ende2
     btst #6,$bfe001
     bne.s Anh_m1
Anh_Ende2:
     bsr Musik_aus
Anh_Ende:
     rts

Re4:
     cmp.w #14,GadgetID    ;CANCEL
     bne Record_Loop1
     tst.l Record_length
     beq Rec_Ende0
     move.l #ctex8a,ctext+12  ;Save recorded part to Temp-SF: ?
     move.l #ctex8b,ctext2+12
     bsr SicherRequest
     tst.b d0
     beq Rec_Ende0         ;rechter Knopf -> Abbruch
     move.l dosbase,a6
     move.l #Record_Name,d1
     move.l #Mode_new,d2
     jsr Open(a6)          ;Datei zum schreiben öffnen
     move.l d0,Locksav     ;Fehler aufgetreten ?
     beq RecSaveErr1
     move.l d0,d1          ;nein
     move.l Record_Buffer,d2
     move.l Record_length,d3
     jsr Write(a6)         ;recorded part schreiben
     move.l d0,-(sp)
     move.l Locksav,d1
     jsr Close(a6)         ;Datei wieder schliessen
     move.l (sp)+,d0
     cmp.l Record_length,d0 ;Fehler ?
     beq Rec_Ende0         ;nein, dann weitermachen
RecSaveErr1:
     move.l #ctex9a,ctext+12  ;Cannot save part, return anyway ?
     move.l #ctex9b,ctext2+12
     bsr SicherRequest
     tst.b d0
     bne.s Rec_Ende0       ;linker Knopf -> Abbruch
     bra Record_Loop1
Rec_Ende0:
     tst.l Object
     beq.s Rec_Ende1
     move.l ExecBase,a6
     move.l Object,a1
     move.l Objectlength,d0
     jsr FreeMem(a6)       ;Speicher für Backgrndsong wieder freigeben
Rec_Ende1:
     tst.l Record_Buffer
     beq.s Rec_Ende2
     move.l ExecBase,a6
     move.l Record_Buffer,a1
     move.l R_R_Gadget2SInfo+28,d0
     jsr FreeMem(a6)       ;Speicher für Record wieder freigeben
Rec_Ende2:
     tst.l Nota_Buffero
     beq.s Rec_Ende3
     move.l ExecBase,a6
     move.l Nota_Buffero,a1
     move.l R_R_Gadget2SInfo+28,d0
     jsr FreeMem(a6)       ;Speicher für Record wieder freigeben
Rec_Ende3:
     move.l intbase,a6
     move.l windowhd,a1
     lea Record_Requester,a0
     jsr EndRequest(a6)    ;Requester löschen
     bsr Wait_CloseReq
  ;-------
Nix_Record:
     bra MainLoop

Get_Object:                ;lädt Objectfile ins CHIPMEM nach (Object)
     ; es fehlt noch Abfrage, ob wirklich Object vorhanden
     clr.l Object
     move.b #".",TempName+9
     move.b #"a",TempName+10
     bsr GetFileSize       ;Länge vom Objectfile bestimmen
     cmp.l #-1,d0          ;Fehler ?
     beq Get_Object_end
     move.l d0,Objectlength ;Länge merken (für FreeMem)
     move.l ExecBase,a6
     move.l #2,d1          ;CHIPMEM
     jsr AllocMem(a6)
     move.l d0,Object
     beq Get_Object_end
     move.l DosBase,a6
     move.l #TempName,d1
     move.l #Mode_old,d2
     jsr Open(a6)          ;Objectfile zum Lesen öffnen
     move.l d0,Locksav
     bne.s Get_Object_m1   ;hat es geklappt ?
Get_Object_m3:
     move.l ExecBase,a6    ;nein, dann Speicher wieder freigeben
     move.l Objectlength,d0
     move.l Object,a1
     jsr FreeMem(a6)
     clr.l Object          ;Object auf 0 setzen (Fehler)
     rts
Get_Object_m1:
     move.l Locksav,d1
     move.l Object,d2
     move.l Objectlength,d3
     jsr Read(a6)          ;Objectfile jetzt lesen
     move.l d0,-(sp)
     move.l Locksav,d1     ;File schließen
     jsr Close(a6)
     move.l (sp)+,d0
     cmp.l Objectlength,d0 ;Fehler beim Lesen aufgetreten ?
     bne.s Get_Object_m3   ;ja, dann zur Fehlerbehandlung
Get_Object_end:
     rts

CalcVoices:                ;berechnet zur aktuellen Song# die
     move.w R_R_Gadget6SInfo+30,d0 ;einschaltbaren Stimmen
     move.l Object,a0
     move.b 3(a0,d0.w),d0
     bsr Voices_off
     btst #0,d0            ;1. Stimme vorhanden ?
     beq CVm1
     bclr #0,R_Gadget7+12  ;ja, dann Gadget einschalten
     bset #7,R_Gadget7+13
CVm1:
     btst #1,d0
     beq CVm2
     bclr #0,R_Gadget8+12
     bset #7,R_Gadget8+13
CVm2:
     btst #2,d0
     beq CVm3
     bclr #0,R_Gadget9+12
     bset #7,R_Gadget9+13
CVm3:
     btst #3,d0
     beq CVm4
     bclr #0,R_Gadget10+12
     bset #7,R_Gadget10+13
CVm4:
     rts

Voices_off:
     bclr #7,R_Gadget7+13
     bclr #7,R_Gadget8+13
     bclr #7,R_Gadget9+13
     bclr #7,R_Gadget10+13
     bset #0,R_Gadget7+12  ;alle Voice-Gadgets disablen
     bset #0,R_Gadget8+12
     bset #0,R_Gadget9+12
     bset #0,R_Gadget10+12
     rts

Refresh_Record:            ;Refreshed alle Record-Requester-Gadgets
     move.l windowhd,a1
     move.l intbase,a6
     lea R_GadgetList1,a0
     lea Record_Requester,a2
     jsr RefreshGadgets(a6)
     rts

NotE4_1:
     bra MainLoop

NotM2:
     cmp.w #1,d0           ;2. Menü ?
     bne NotM3
     cmp.w #4,d1           ;Default ?
     bne.s NotE1_2
     bsr Musik_aus
     clr.b Strpuff1        ;Namen auch löschen
     bra Make_Default
NotE1_2:
     cmp.w #2,d1           ;Save as ?
     bne.s NotE2_2
     bra Save_Instr_as
NotE2_2:
     cmp.w #1,d1           ;Save ?
     bne NotE3_2
     lea strpuff1,a0
     tst.b (a0)
     beq MainLoop
     move.l #"Inst",Strpuffer1
     move.l #"rume",Strpuffer1+4
     move.l #"nts:",Strpuffer1+8
     lea strpuff1,a0       ;Instrumentenname
     lea Strpuffer1+12,a1
Save_Instr_Loop1:
     move.b (a0)+,(a1)+
     tst.b -1(a0)
     bne.s Save_Instr_Loop1
     move.l #Strpuffer1,d0
     bra Save_Instr
NotE3_2:
     cmp.w #0,d1           ;Load ?
     bne NotE4_2
     bsr Musik_aus
Load_Instrument:
     bsr Test_Instrument
     bsr Copy_Name2
     bsr FileRequest
     tst.l d0
     bne.s Load_Instrument1
     bsr Free_Mix_Buffer
     bra MainLoop
Load_Instrument1:
     move.l d0,FileInfo+8
     move.l d0,d1
     move.l #Mode_Old,d2
     move.l dosbase,a6
     jsr Open(a6)
     move.l d0,Locksav     ;Fehler beim öffnen ?
     beq q31_1             ;ja, dann MakeGadgets und zurück zu MainLoop
     move.l d0,d1
     move.l #4,d3
     move.l #FileInfo,d2
     jsr Read(a6)
     move.l d0,-(sp)
     move.l Locksav,d1
     jsr Close(a6)
     move.l (sp)+,d1
     cmp.l #4,d1
     bne q31_1
     cmp.l #"IRQ"*256,FileInfo
     bne.s zz1
     move.l #IT_ITextText2a,IT_IText2+12 ;Instr.-type: SOUNDFACTORY
     bsr Inst_Request
     move.l FileInfo+8,d0
     bra Load_SOUNDFACTORY
zz1:
     cmp.l #"FORM",FileInfo
     bne.s zz2
     move.l #IT_ITextText2c,IT_IText2+12 ;Instr.-type: IFF
     bsr Inst_Request
     move.l FileInfo+8,d0
     bra Load_IFF
zz2:
     move.l #IT_ITextText2b,IT_IText2+12 ;Instr.-type: Raw Data
     bsr Inst_Request
     move.l FileInfo+8,d0
     bra Load_Raw_Data

Inst_Request:
     move.l windowhd,a1
     lea Instr_Type_Requester,a0
     move.l intbase,a6
     jsr Request(a6)       ;Requester anzeigen (Type of instrument)
Inst_Loop1:
     btst #6,$bfe001
     bne.s Inst_Loop1
Inst_Loop2:
     btst #6,$bfe001
     beq.s Inst_Loop2
     move.l windowhd,a1
     lea Instr_Type_Requester,a0
     jsr EndRequest(a6)    ;Requester löschen
     bsr Wait_CloseReq
     rts

NotE4_2:
     cmp.w #6,d1
     bne NotE5_2           ;Mix Waveforms ?
     bsr Musik_aus
     move.l SoundAdr,a1
     clr.l d0
     move.w 280(a1),d0
     lsl.l #1,d0           ;Speicher anfordern
     move.l d0,Mix_Length  ;d0 merken (alte Länge)
     move.l ExecBase,a6
     clr.l d1
     jsr AllocMem(a6)
     move.l d0,Mix_Buffer  ;Adresse merken
     bne.s Mix1
     move.l #btex14a,btext+12  ;ja, dann Fehler
     move.l #btex14b,btext2+12
     bsr Requester         ;Not enough memory !
     bra MainLoop
Mix1:
     move.l windowhd,a1
     lea Mix_Requester,a0
     move.l intbase,a6
     jsr Request(a6)       ;Requester anzeigen (Mix Waveforms)
     bsr Wait_CloseReq
     move.l Mix_Mix_Gadget3SInfo+28,d7
     add.l Mix_Length,d7
     cmp.l Mem_Size,d7     ;Old_length+Offset <= Soundmaxlänge ?
     bcs.s genug_mem1      ;ja, dann ok!
     move.l #btex14a,btext+12
     move.l #btex14b,btext2+12
     bsr Requester         ;Not enough memory !
     clr.l Mix_Mix_Gadget3SInfo+28
     move.w #"0"*256,Mix_Mix_Gadget3SIBuff
     bra Mix1
genug_mem1:
     move.l SoundAdr,a0
     add.l #314,a0
     move.l Mix_Buffer,a1
     move.l Mix_Length,d0
     lsr.l #1,d0
Mix_Loop1:
     move.w (a0)+,(a1)+
     subq.w #1,d0
     bne.s Mix_Loop1
     bra Load_Instrument

Mix_it:
     tst.l Mix_Buffer
     beq Nix_Mix3
     bsr Open_Working
     clr.w Ereignis	       ;Max_Wert:=0
     clr.b MouseX          ;Flag für 1. Pass :=0
Mix_MainLoop:
     move.l SoundAdr,a0
     clr.l d0
     move.w 280(a0),d0
     lsl.l #1,d0           ;d0 = Länge des neuen Samples
     add.l #314,a0         ;a0 = Zeiger auf neuen Sample
     move.l Mix_Length,d1  ;d1 = Länge des alten Samples+OLD_OFFSET
     add.l Mix_Mix_Gadget3SInfo+28,d1
     move.l Mix_Buffer,a1  ;a1 = Zeiger auf alten Sample-OLD_OFFSET
     sub.l Mix_Mix_Gadget3SInfo+28,a1
     cmp.l d1,d0
     bcc Mixing_Loop1
     move.l a0,-(sp)
     add.l d0,a0
Mixing_Loop2:		       ;Falls der alte Sample größer ist als der neue,
     clr.b (a0)+	       ;so wird der neue solange mit 0 aufgefüllt,
     addq.l #1,d0	       ;bis beide Samples gleich lang sind
     cmp.l d0,d1	       ;Dabei wird OLD_OFFSET mitberücksichtigt
     bne.s Mixing_Loop2
     lsr.l #1,d0
     move.l SoundAdr,a0
     move.w d0,280(a0)
     add.w #19,d0
     move.w d0,278(a0)
     move.l d1,d0
     move.l (sp)+,a0
Mixing_Loop1:
     move.b (a0),d2
     ext.w d2
     move.b (a1)+,d3
     ext.w d3
     cmp.l Mix_Buffer,a1
     bls.s Mix_q2
     tst.l d1
     bne.s Mix_q1
Mix_q2:
     clr.w d3
Mix_q1:
     move.w #65535,d4
     move.w #65535,d6
     sub.w Mix_Mix_Gadget1SInfo+4,d4
     sub.w Mix_Mix_Gadget2SInfo+4,d6
     move.w d3,d5
     bpl.s Mix_q3
     neg.w d5
Mix_q3:
     mulu d5,d4
     divu #256,d4
     tst.w d3
     bpl.s Mix_q4
     neg.w d4
Mix_q4:
     move.w d2,d5
     bpl.s Mix_q5
     neg.w d5
Mix_q5:
     mulu d5,d6
     divu #256,d6
     tst.w d2
     bpl.s Mix_q6
     neg.w d6
Mix_q6:
     ext.l d4
     ext.l d6
     add.l d4,d6
     asr.l #1,d6
     tst.b Mix_Gadget4+13  ;Optimieren ?
     bpl Mix_q9            ;nein, dann zu Mix_q9
     tst.b MouseX          ;schon zweiter Pass ?
     bne Mix_q10           ;ja, dann zu Mix_q10
     move.w d6,d7
     bpl.s Mix_q7
     neg.w d7
Mix_q7:
     cmp.w Ereignis,d7      ;neuer Wert > Max_Wert ?
     bls.s Mix_q8
     move.w d7,Ereignis     ;Max_Wert:=neuer Wert
Mix_q8:
     add.l #1,a0
     bra Mixi1

Mix_q10:
     divs Ereignis+2,d6
     bra.s Mixi2

Mix_q9:
     divs #255,d6
Mixi2:
     move.b d6,(a0)+
Mixi1:
     subq.l #1,d0
     beq.s Nix_Mix
     tst.l d1
     beq Mixing_Loop1
     subq.l #1,d1
     bra Mixing_Loop1
Nix_Mix:
     tst.b Mix_Gadget4+13
     bpl.s Nix_Mix2
     tst.b MouseX
     bne.s Nix_Mix2
     move.b #1,MouseX
     clr.l d5
     move.w Ereignis,d5
     divu #127,d5
     move.w d5,Ereignis+2
     bra Mix_MainLoop
Nix_Mix2:
     bsr Close_Working
Nix_Mix3:
     rts

Free_Mix_Buffer:           ;gibt eventuell benutzten Mischpuffer wieder
     tst.l Mix_Buffer      ;frei
     beq.s Free_Mix1
     move.l ExecBase,a6
     move.l Mix_Buffer,a1
     move.l Mix_Length,d0
     jsr FreeMem(a6)       ;Speicher für Mischpuffer wieder freigeben
     clr.l Mix_Buffer
Free_Mix1:
     rts

NotE5_2:
     bra MainLoop

NotM3:
     bra MainLoop

;--------------------- ENDE ------------------------

Schluss:                   ;Ende des Soundeditors
     bsr Musik_aus
     bsr ClearMenu         ;Menu entfernen
     bsr closeNIL          ;Leerkanal schliessen
Schluss2:
     bsr windclose         ;Window schließen
Schluss9:
     bsr scrclose          ;Screen schließen
Schluss8:
     bsr closeGfx          ;Gfx schließen
Schluss7:
     bsr closeint          ;Intuition schließen
Schluss3:
     move.l SoundAdr,a1
     move.l Mem_Size,d0
     add.l #Sound_Overhead,d0
     move.l ExecBase,a6
     jsr FreeMem(a6)       ;Speicherblock freigeben (Sampledaten)
Schluss4:
     move.l IRQ_Music_Buffer,a1
     move.l #IRQ_Music_Len,d0
     move.l ExecBase,a6
     jsr FreeMem(a6)       ;Speicherblock freigeben (IRQ_Music.Code)
Schluss5:
     move.l PufferAdr,a1
     move.l #200*38,d0
     move.l ExecBase,a6
     jsr FreeMem(a6)       ;Speicherblock freigeben (File-Einträge)
     bsr closedos          ;DOS schließen
Finito:
     tst.l WB_Message
     beq.s wirklich_schluss
     move.l ExecBase,a6
     jsr Forbid(a6)
     move.l WB_Message,a1
     jsr ReplyMsg(a6)
wirklich_schluss:
     clr.l d0
     rts

;--------------------------------------------------------------------------

Load_IRQ_Music:            ;lädt IRQ_Music.Code
     move.l DosBase,a6
     move.l #IRQ_Music,d1
     move.l #Mode_Old,d2
     jsr Open(a6)
     tst.l d0
     beq Load_IRQ_Music_Error
     move.l d0,d1
     move.l d0,locksav     ;locksav wird Mißbraucht zur Speicherung des
     move.l IRQ_Music_Buffer,d2  ;Datei-handles
     move.l #IRQ_Music_Len,d3
     move.l d3,Requesthd   ;Requesthd wird Mißbraucht als Flag, ob
     jsr Read(a6)          ;IRQ_Music.Code geladen werden konnte
     cmp.l #IRQ_Music_Len,d0
     beq Load_IRQ_Music_Ok
     move.l #btex3a,btext+12
     move.l #btex3b,btext2+12
     bsr Requester
     clr.l Requesthd
Load_IRQ_Music_Ok:
     move.l DosBase,a6
     move.l locksav,d1
     jsr Close(a6)
     move.l Requesthd,d0
     rts
Load_IRQ_Music_Error:
     move.l #btex2a,btext+12
     move.l #btex2b,btext2+12
     bsr Requester
     clr.l d0
     rts

WriteTeil1:                ;schreibt Teil 1 in Musikpuffer
     move.l #Teil1,a0
     move.l SoundAdr,a1
     move.w #278,d0         ;278 Bytes kopieren
WrLoop1:
     move.b (a0)+,(a1)+
     subq.w #1,d0
     bne WrLoop1
     rts

SetDefault1:               ;setzt alle Sounddaten auf Default
     move.l #Default1,a0
     move.l SoundAdr,a1
     adda.l #282,a1
     move.b #32,d0         ;32 Bytes kopieren
SDLoop1:
     move.b (a0)+,(a1)+
     subq.b #1,d0
     bne SDLoop1
     rts

SetPulse_100:              ;Setzt einen 100 Bytes langen Rechteck-Sample
     move.l SoundAdr,a1
     move.w #69,278(a1)
     move.w #50,280(a1)

SetPulse:                  ;Setzt einen Rechteck-Sample
     move.l SoundAdr,a1
     bclr #0,284(a1)        ;Loop-Modus an
     clr.l 310(a1)          ;Loop-Points entfernen
     move.w 280(a1),d1
     adda.l #314,a1
     move.w d1,d0
SPLoop1:
     move.b #100,(a1)+
     subq.b #1,d0
     bne SPLoop1
     move.w d1,d0
SPLoop2:
     move.b #-100,(a1)+
     subq.b #1,d0
     bne SPLoop2
     rts

Rangecheck:                ;testet Samplelen auf 256 und verkürzt evtl.
     move.l SoundAdr,a1
     bclr #0,284(a1)
     clr.w 282(a1)
     cmp.w #2,280(a1)
     bhs Range_Ok2
     move.w #2,280(a1)
     move.w #21,278(a1)
     rts
Range_Ok2:
     cmp.w #128,280(a1)
     bls Range_Ok
     move.w #128,280(a1)
     move.w #147,278(a1)
Range_Ok:
     rts

WriteTeil2:                ;schreibt 2. Teil der Musikdaten in Puffer
     move.l #Teil2,a0
     move.l SoundAdr,a1
     clr.l d1
     move.w 280(a1),d1
     lsl.l #1,d1
     clr.w d0
     move.b 301(a1),d0
     cmp.w d0,d1
     bhs Write_2
     move.w #$0002,300(a1)
Write_2:
     add.l #314,d1
     adda.l d1,a1
     move.b #9,d0          ;9 Bytes kopieren
WrLoop2:
     move.b (a0)+,(a1)+
     subq.b #1,d0
     bne WrLoop2
     rts

MeinIRQ:                   ;Interrupt-Routine (wird alle 1/50 sec. aufger.)
     nop                   ;Erkennungszeichen SOUNDFACTORY
     movem.l d0/d1/d2/d3/d4/d5/d6/d7/a0/a1/a2/a3/a4/a5/a6,-(sp)
     move.w $dff006,d0
     lsr.w #8,d0           ;auch richtiger Interrupt?
     cmp.b #2,d0
     bhi.s nixVBI2
     bsr MeinIRQ2
nixVBI2:
     movem.l (sp)+,d0/d1/d2/d3/d4/d5/d6/d7/a0/a1/a2/a3/a4/a5/a6
HilfIRQ:
     jmp $fc0cd8
MeinIRQ2:
     move.l IRQ_Music_Buffer,a0
     adda.l #4,a0
     jsr (a0)
     addq.b #1,Timer_low
     cmp.b #50,Timer_low
     bne nixVBI
     clr.b Timer_low
     move.b #1,Timer_Flag
     addq.w #1,Timer
     clr.b d0
     clr.b d1
     abcd d0,d1
     move.b Timer_Sek,d0
     moveq.b #1,d1
     abcd d1,d0
     move.b d0,Timer_Sek
     cmp.b #$60,Timer_Sek
     bne.s nixVBI
     clr.b Timer_Sek
     clr.b d0
     clr.b d1
     abcd d0,d1
     move.b Timer_Min,d0
     move.b #1,d1
     abcd d1,d0
     move.b d0,Timer_Min
nixVBI:
     rts

MakeGadgets:               ;berechnet alle Gadgets neu & zeigt sie an
     move.l SoundAdr,a0
     adda.l #280,a0         ;Quelladresse bestimmt
     clr.l d0
     move.w (a0)+,d0       ;Länge des Samples
     lsl.l #1,d0
     move.l d0,sinfo2+28
     lea strpuff2,a1
     bsr Make_Number
     clr.l d0
     move.w (a0)+,d0       ;Sampling-Rate für Note
     move.l d0,sinfo4+28
     lea strpuff4,a1
     bsr Make_Number
     move.b (a0)+,Effektbyte
     clr.l d0
     move.b (a0)+,d0
     subq.b #1,d0
     mulu #4369,d0
     move.w d0,propinf14+4 ;Tremolo-Speed (1-16)
     move.l #128,d0
     sub.b (a0)+,d0
     mulu #516,d0
     move.w d0,propinf15+4 ;Tremolo-Step (1-128)
     clr.l d0
     move.b (a0)+,d0
     mulu #257,d0
     move.w d0,propinf16+4 ;Tremolo-% (1-256, 0 = 256)
     move.l #64,d0
     sub.w (a0)+,d0
     mulu #1040,d0
     move.w d0,propinf18+4 ;Portamento-Step (1-64)
     clr.l d0
     move.b (a0)+,d0
     subq.b #1,d0
     mulu #4369,d0
     move.w d0,propinf17+4 ;Portamento-Speed (1-16)
     clr.l d0
     move.b (a0)+,d0
     subq.b #1,d0
     mulu #4369,d0
     move.w d0,propinf9+4  ;Arpeggio-Speed (1-16)
     move.l #63,d0
     sub.b (a0)+,d0
     mulu #1040,d0
     move.w d0,propinf10+4 ;Vibrato-Delay (0-63)
     clr.l d0
     move.b (a0)+,d0
     subq.b #1,d0
     mulu #4369,d0
     move.w d0,propinf11+4 ;Vibrato-Speed (1-16)
     move.l #16,d0
     sub.b (a0)+,d0
     mulu #4369,d0
     move.w d0,propinf12+4 ;Vibrato-Step (1-16)
     move.l #8,d0
     sub.b (a0)+,d0
     mulu #9362,d0
     move.w d0,propinf13+4 ;Vibrato-Range (1-8)
     move.l #63,d0
     sub.b (a0)+,d0
     mulu #1040,d0
     move.w d0,propinf5+4  ;Attack-Time (0-63)
     move.l #63,d0
     sub.b (a0)+,d0
     mulu #1040,d0
     move.w d0,propinf6+4  ;Sustain-Time (0-63)
     move.l #64,d0
     sub.b (a0)+,d0
     mulu #1040,d0
     move.w d0,propinf7+4  ;Sustain-Level (1-64)
     move.l #127,d0
     sub.b (a0)+,d0
     mulu #516,d0
     move.w d0,propinf8+4  ;Release-Time (0-63)
     move.b (a0)+,Phasing_Start
     move.b (a0)+,Phasing_End
     clr.l d0
     move.b (a0)+,d0
     subq.b #1,d0
     mulu #4369,d0
     move.w d0,propinf29+4 ;Phasing-Speed (1-16)
     move.l #8,d0
     sub.b (a0)+,d0
     mulu #9362,d0
     move.w d0,propinf30+4 ;Phasing-Step (1-8)
     clr.l d0
     lea strpuff28,a1
     move.b (a0)+,d0
     move.l d0,sinfo28+28
     bsr Make_Number       ;Anzahl gesampleter Perioden
     clr.l d0
     move.b (a0)+,d0
     move.l d0,sinfo3+28
     lea strpuff3,a1
     bsr Make_Number       ;Note für angegebene Sampling-Rate
     move.l #16,d0
     sub.b (a0)+,d0
     mulu #4369,d0
     move.w d0,propinf21+4 ;Filter Step (1-16)
     move.l #128,d0
     sub.b (a0)+,d0
     mulu #516,d0
     move.w d0,propinf20+4 ;Filter Frequency (1-128)
     clr.l d0
     move.b (a0)+,d0
     subq.b #1,d0
     mulu #4369,d0
     move.w d0,propinf19+4 ;Filter Speed (1-16)
     move.b (a0)+,d0       ;Leerbyte überlesen
     clr.l d0
     lea strpuff46,a1
     move.w (a0)+,d0
     lsl.l #1,d0
     move.l d0,sinfo46+28
     bsr Make_Number       ;Loop-Point Start
     clr.l d0
     lea strpuff47,a1
     move.w (a0)+,d0
     lsl.l #1,d0
     move.l d0,sinfo47+28
     bsr Make_Number       ;Loop-Point End
     btst #5,Effektbyte    ;Release On/Off
     beq r2
     bsr Release_Off
     bra r3
r2:
     bsr Release_On
r3:
     btst #2,Effektbyte    ;Arpeggio On/Off
     beq r4
     bsr Arpeggio_On
     bra r5
r4:
     bsr Arpeggio_Off
r5:
     btst #1,Effektbyte    ;Vibrato On/Off
     beq r6
     bsr Vibrato_On
     bra r7
r6:
     bsr Vibrato_Off
r7:
     btst #6,Effektbyte    ;Tremolo On/Off
     beq r8
     bsr Tremolo_On
     bra r9
r8:
     bsr Tremolo_Off
r9:
     btst #4,Effektbyte    ;Portamento On/Off
     beq r10
     bsr Portamento_On
     bra r11
r10:
     bsr Portamento_Off
r11:
     btst #0,Effektbyte    ;Loop-Mode On/Off
     beq r12
     bsr Loop_Off
     bra r13
r12:
     bsr Loop_On
r13:
     btst #7,Effektbyte    ;Filter On/Off
     beq r14
     bsr Filter_On
     bra r15
r14:
     bsr Filter_Off
r15:
     btst #3,Effektbyte    ;Phasing On/Off
     beq r16
     bsr Phasing_On
     bra r17
r16:
     bsr Phasing_Off
r17:
     clr.w gadg27+12
     clr.w gadg33+12
     bsr Clr_Filter_On
     bsr Clr_Phasing_On
     move.l SoundAdr,a0
     cmp.w #128,280(a0)
     bls r18
     bsr Filter_Off
     bsr Phasing_Off
     move.w #$100,gadg27+12
     move.w #$100,gadg33+12
r18:

Refresh_All:               ;Refreshed alle Soundeditor-Gadgets
     lea 0,a2
     lea gadg1,a0
     move.l windowhd,a1
     move.l intbase,a6
     jsr RefreshGadgets(a6)   ;alle Gadgets anzeigen
     bsr ShowSample
     rts

Release_On:                ;Auto-Release einschalten
     move.l #tex22,gadg22+26
     move.l SoundAdr,a0
     bclr #5,284(a0)
     rts

Release_Off:               ;Auto-Release ausschalten
     move.l #tex22_1,gadg22+26
     move.l SoundAdr,a0
     bset #5,284(a0)
     rts

Arpeggio_On:               ;Arpeggio einschalten
     move.l #tex23,gadg23+26
     move.l SoundAdr,a0
     bset #2,284(a0)
     rts

Arpeggio_Off:              ;Arpeggio ausschalten
     move.l #tex23_1,gadg23+26
     move.l SoundAdr,a0
     bclr #2,284(a0)
     rts

Vibrato_On:                ;Vibrato einschalten
     move.l #tex24,gadg24+26
     move.l SoundAdr,a0
     bset #1,284(a0)
     rts

Vibrato_Off:               ;Vibrato ausschalten
     move.l #tex24_1,gadg24+26
     move.l SoundAdr,a0
     bclr #1,284(a0)
     rts

Tremolo_On:                ;Tremolo einschalten
     move.l #tex25,gadg25+26
     move.l SoundAdr,a0
     bset #6,284(a0)
     rts

Tremolo_Off:               ;Tremolo ausschalten
     move.l #tex25_1,gadg25+26
     move.l SoundAdr,a0
     bclr #6,284(a0)
     rts

Portamento_On:             ;Portamento einschalten
     move.l #tex26,gadg26+26
     move.l SoundAdr,a0
     bset #4,284(a0)
     rts

Portamento_Off:            ;Portamento ausschalten
     move.l #tex26_1,gadg26+26
     move.l SoundAdr,a0
     bclr #4,284(a0)
     rts

Loop_On:                   ;Loop-Mode einschalten
     move.l #tex40,gadg40+26
     move.l SoundAdr,a0
     bclr #0,284(a0)
     rts

Loop_Off:                  ;Loop-Mode ausschalten
     move.l #tex40_1,gadg40+26
     move.l SoundAdr,a0
     bset #0,284(a0)
     rts

LED_On:                   ;LED-Mode einschalten
     move.l #tex55,gadg55+26
     bclr #1,$bfe001
     move.b #1,LED
     rts

LED_Off:                  ;LED-Mode ausschalten
     move.l #tex55_1,gadg55+26
     bset #1,$bfe001
     clr.b LED
     rts

Filter_On:                 ;Filter einschalten
     move.l #tex27,gadg27+26
     move.w #$100,gadg21+12
     move.l SoundAdr,a0
     bset #7,284(a0)
     rts

Filter_Off:                ;Filter ausschalten
     move.l #tex27_1,gadg27+26
     clr.w gadg21+12
     move.l SoundAdr,a0
     bclr #7,284(a0)
     rts

Phasing_On:                ;Phasing einschalten
     move.l #tex33,gadg33+26
     bsr Clr_Phasing_Start
     bsr Clr_Phasing_End
     move.l SoundAdr,a0
     bset #3,284(a0)
     rts

Phasing_Off:               ;Phasing ausschalten
     move.l #tex33_1,gadg33+26
     move.w #$100,gadg31+12
     move.w #$100,gadg32+12
     move.l SoundAdr,a0
     bclr #3,284(a0)
     rts

Make_Number:               ;schreibt den Wert in D0 als ASCII nach (A1)
     clr.l d1              ;Arbeitsregister löschen
     clr.b d2              ;Zähler für Stellen
Make_Loop:
     divu #10,d0
     swap d0
     rol.l #4,d1
     or.b d0,d1
     clr.w d0
     swap d0
     addq.b #1,d2
     tst.w d0
     bne Make_Loop
Make_Loop2:
     move.b d1,d0
     and.b #$0f,d0
     add.b #48,d0
     move.b d0,(a1)+
     ror.l #4,d1
     subq.b #1,d2
     bne Make_Loop2
     clr.b (a1)
     rts

Make_Note:                 ;schreibt die Note in D0 als ASCII nach (A1)
     clr.l d1
     move.b d0,d1
     divu #12,d1
     move.w d1,d0          ;in D0 jetzt die Oktave
     swap d1
     lsl.b #1,d1
     lea Notentabelle,a2
     move.b 0(a2,d1.w),(a1)+
     tst.b 1(a2,d1.w)
     beq MakeN1
     move.b 1(a2,d1.w),(a1)+
MakeN1:
     add.b #48,d0
     move.b d0,(a1)+
     clr.b (a1)
     rts

Decode_Note:               ;wandelt Note bei (A1) in Dezimalwert um
     clr.w d0
     lea Notentabelle,a2
     move.l a1,a3
DecNotLoop1:
     move.b (a1),d2
     cmp.b 0(a2,d0.w),d2
     beq Note_gefunden
     addq.b #2,d0
     cmp.b #24,d0
     bne DecNotLoop1
Falsche_Note:
     move.l a3,a1
     move.b #"c",(a1)
     move.b #"3",1(a1)
     clr.w 2(a1)
     bsr Refresh_All
     move.b #36,d0
     rts
Note_gefunden:
     lsr.b #1,d0
     adda #1,a1
     cmp.b #"#",(a1)
     bne NoteFnd1
     adda #1,a1
     addq.b #1,d0
NoteFnd1:
     clr.w d1
     move.b (a1)+,d1
     sub.b #48,d1
     cmp.b #10,d1          ;ist d1 auch wirklich Ziffer ?
     bhs Falsche_Note
     mulu #12,d1
     add.b d1,d0
     rts

Copy_Name:                 ;kopiert den Dateinamen von strpuffer2 zu
     lea strpuffer2,a0     ;strpuff1 (nach dem Laden eines Sounds aufrufen)
     lea strpuff1,a1
Copy_Name_Loop:
     tst.b (a0)
     beq Copy_Name_Fertig
     move.b (a0)+,(a1)+
     bra Copy_Name_Loop
Copy_Name_Fertig:
     clr.b (a1)
     rts

Copy_Name2:                ;kopiert den Dateinamen von strpuff1 zu
     lea strpuffer2,a1     ;strpuffer2 (wird vom Filerequester aufgerufen)
     lea strpuff1,a0
Copy_Name_Loop2:
     tst.b (a0)
     beq Copy_Name_Fertig2
     move.b (a0)+,(a1)+
     bra Copy_Name_Loop2
Copy_Name_Fertig2:
     clr.b (a1)
     rts

Copy_Name3:                ;kopiert den Projektnamen nach strpuffer2
     bsr Test_Projekt
     lea strpuffer2,a1
     lea Projectname,a0
     bsr Copy_Name_Loop2
     lea PName,a1
     move.l a1,a3
CN1:
     tst.b (a1)+
     bne.s CN1
     move.l a1,a2
CN2:
     move.b -(a1),d4
     cmp.b #":",d4
     beq.s CN3
     cmp.b #"/",d4
     beq.s CN3
     cmp.l a1,a3
     bne.s CN2
     clr.b strpuffer1
     rts
CN3:
     lea strpuffer1,a0
CN4:
     move.b (a3)+,(a0)+
     cmp.l a3,a2
     bne.s CN4
     rts

Test_Instrument:
     cmp.b #1,Last_Dir
     beq.s TtI1
     clr.b Requesterflag
     move.b #1,Last_Dir
     move.l #"Inst",Strpuffer1
     move.l #"rume",Strpuffer1+4
     move.l #"nts:",Strpuffer1+8
     clr.b Strpuffer1+12
TtI1:
     rts

Test_Projekt:
     cmp.b #2,Last_Dir
     beq.s TtI1
     move.b #2,Last_Dir
     clr.b Requesterflag
     rts

;------ Zeichnet die Schwingung in dem Grafikfenster -------------

ShowSample:
     move.l GfxBase,a6
     move.l WindowHd,a0
     move.l 50(a0),a5      ;Rastport Adresse in a5
     move.l #1,d0
     move.l a5,a1
     jsr SetAPen(a6)
     move.l a5,a1
     move.l #7,d0
     move.l #143,d1
     move.l #7+255,d2
     move.l #143+63,d3
     jsr RectFill(a6)
     move.l #0,d0
     move.l a5,a1
     jsr SetAPen(a6)
     move.l a5,a1
     move.l #7,d0
     move.l #31+143,d1
     jsr Move(a6)
     move.l a5,a1
     move.l #7+255,d0
     move.l #31+143,d1
     jsr Draw(a6)
     move.l SoundAdr,a0
     btst #3,284(a0)        ;Phasing On ?
     beq No_Phasing
     clr.l d0
     clr.l d1
     move.b 300(a0),d0
     lsl.l #8,d0
     move.w 280(a0),d1
     lsl.w #1,d1
     divu d1,d0
     addq.w #7,d0
     move.l #143,d1
     move.l d0,-(sp)
     move.l a5,a1
     jsr Move(a6)
     move.l a5,a1
     move.l (sp)+,d0
     move.l #143+63,d1
     jsr Draw(a6)

     clr.l d0
     clr.l d1
     move.l SoundAdr,a0
     move.b 301(a0),d0
     lsl.l #8,d0
     move.w 280(a0),d1
     lsl.w #1,d1
     divu d1,d0
     addq.w #7,d0
     move.l #143,d1
     move.l d0,-(sp)
     move.l a5,a1
     jsr Move(a6)
     move.l a5,a1
     move.l (sp)+,d0
     move.l #143+63,d1
     jsr Draw(a6)
No_Phasing:
     move.l #2,d0
     move.l a5,a1
     jsr SetAPen(a6)
     clr.l d7
     clr.l d6
     clr.l d5
     move.l SoundAdr,a0
     move.l a0,d0
     add.l #314,d0
     move.l d0,a4          ;Sampleadresse
     move.w 280(a0),d7
     lsl.l #1,d7
     clr.l d3
SwLoop:
     move.l a5,a1
     move.l d3,d0
     add.l #7,d0
     clr.l d1
     move.b 0(a4,d6),d1
     eor.b #255,d1
     add.b #128,d1
     lsr.b #2,d1
     add.w #143,d1
     movem.l d0-d7/a0-a6,-(sp)
     tst.b d3
     bne Linie
     jsr Move(a6)
     bra Continue
Linie:
     jsr Draw(a6)
Continue:
     movem.l (sp)+,d0-d7/a0-a6
     add.l d7,d5
     move.l d5,d0
     lsr.l #8,d0
     add.l d0,d6
     and.l #255,d5
     addq.b #1,d3
     bne SwLoop
     rts

Requester:                 ;Zeigt einen Requester an und wartet auf OK!
     movem.l d0-d7/a0-a6,-(sp)
     move.l windowhd,a0
     lea btext,a1          ;Zeiger auf Requestertext
     lea 0,a2              ;kein linker Text
     lea rtext,a3          ;Zeiger auf OK!-Text
     clr.l d0              ;Nur durch anklicken zu beantworten
     clr.l d1              ; ------ " ------
     move.l #240,d2        ;Breite
     move.l #60,d3         ;Höhe
     move.l intbase,a6
     jsr AutoRequest(a6)
     movem.l (sp)+,d0-d7/a0-a6
     rts

SicherRequest:             ;Zeigt einen Requester an und wartet Gadget
     movem.l d1-d7/a0-a6,-(sp)
     move.l windowhd,a0
     lea ctext,a1
     lea rtext,a2
     lea ltext,a3
     clr.l d0
     clr.l d1
     move.l #240,d2        ;Breite
     move.l #60,d3         ;Höhe
     move.l intbase,a6
     jsr AutoRequest(a6)
     movem.l (sp)+,d1-d7/a0-a6  ;in D0 0=links, 1=rechts
     rts




openint:   ;* System initialisieren und öffnen
     move.l ExecBase,a6    ;EXEC-Basisadresse
     lea IntName,a1        ;Name der Intuition-Bibliothek
     jsr OpenLib(a6)       ;Intuition öffnen
     move.l d0,intbase     ;Intuition-Basisadresse retten
     rts

closeint:   ;* Intuition schließen
     move.l ExecBase,a6    ;EXEC-Basisadresse in A6
     move.l intbase,a1     ;Intuition-Basisadresse in A1
     jsr CloseLibrary(a6)  ;Intuition schließen
     rts

opendos:   ;* Dos initialisieren und öffnen
     move.l ExecBase,a6    ;EXEC-Basisadresse
     lea DosName,a1        ;Name der Dos-Bibliothek
     jsr OpenLib(a6)       ;Dos öffnen
     move.l d0,Dosbase     ;Dos-Basisadresse retten
     rts

closedos:   ;* Dos schließen
     move.l ExecBase,a6    ;EXEC-Basisadresse
     move.l Dosbase,a1     ;Dos-Basisadresse in A1
     jsr CloseLibrary(a6)  ;Dos schließen
     rts

opengfx:   ;* Gfx initialisieren und öffnen
     move.l ExecBase,a6    ;EXEC-Basisadresse
     lea GfxName,a1        ;Name der Gfx-Bibliothek
     jsr OpenLib(a6)       ;Gfx öffnen
     move.l d0,Gfxbase     ;Gfx-Basisadresse retten
     rts

closegfx:   ;* Gfx schließen
     move.l ExecBase,a6    ;EXEC-Basisadresse
     move.l Gfxbase,a1     ;Gfx-Basisadresse in A1
     jsr CloseLibrary(a6)  ;Gfx schließen
     rts

scropen:   ;* Screen öffnen
     move.l intbase,a6     ;Intuition-Basisadresse in A6
     lea screen_defs,a0    ;Zeiger auf Tabelle
     jsr openscreen(a6)    ;und öffnen
     move.l d0,screenhd    ;Handle des Screens retten
     rts

scrclose:   ;* Screen schließen
     move.l intbase,a6     ;Intuition-Basisadresse in A6
     move.l screenhd,a0    ;Screen-Handle in A0
     jsr CloseScreen(a6)   ;Screen schließen
     rts

ReqOpen:     ;* Window öffnen (Requester)
     move.l windowhd,a1
     lea File_Requester,a0
     move.l intbase,a6
     jsr Request(a6)       ;Requester anzeigen (FileRequester)
     rts

windopen:    ;* Window öffnen (Soundeditor)
     move.l intbase,a6
     lea window_defs,a0
     jsr openwindow(a6)
     move.l d0,windowhd
     rts

wind3open:   ;* Window öffnen (Copyright-Vermerk)
     move.l windowhd,a1
     lea Copyright_Requester,a0
     move.l intbase,a6
     bset #7,Co_Gadget1+13
     jsr Request(a6)       ;Requester anzeigen (FileRequester)
     bclr #7,Co_Gadget1+13
     move.l d0,windowhd3
     rts

wind4open:   ;* Window öffnen (On keyboard play)
     move.l screenhd,screenhd4 ;Screen-Handle in Fensterstruktur eintragen
     move.l intbase,a6
     lea PlayWindow,a0
     jsr openwindow(a6)
     move.l d0,windowhd4
     beq.s nix_window4
     move.l d0,a0
     move.l 50(a0),a0      ;Rastport Adresse in a0
     lea Play_Text,a1
     move.l #8,d0
     move.l #8,d1
     jsr PrintIText(a6)
nix_window4:
     rts

SetMenu:   ;aktiviert Menu
     move.l intbase,a6
     move.l windowhd,a0
     lea Menu1,a1
     jsr SetMenuStrip(a6)
     rts

ClearMenu: ;Entfernt Menu
     move.l intbase,a6
     move.l windowhd,a0
     jsr ClearMenuStrip(a6)
     rts

openNIL:                    ;öffnet NIL: Kanal
     move.l #NIL_Name,d1
     move.l #Mode_New,d2
     move.l dosbase,a6
     jsr Open(a6)
     move.l d0,NILHandle
     rts

closeNIL:                   ;schließt NIL-Kanal
     move.l NILHandle,d1
     beq ClNIL
     move.l dosbase,a6
     jsr Close(a6)
     clr.l NILHandle
ClNIL:
     rts

Open_Working:
     movem.l d0-d7/a0-a6,-(sp)
     move.l windowhd,a1
     lea Working_Requester,a0
     move.l intbase,a6
     jsr Request(a6)       ;Requester anzeigen (Working)
     movem.l (sp)+,d0-d7/a0-a6
     rts

Close_Working:
     movem.l d0-d7/a0-a6,-(sp)
     move.l intbase,a6
     move.l windowhd,a1
     lea Working_Requester,a0
     jsr EndRequest(a6)    ;Requester löschen
     bsr Wait_CloseReq
     movem.l (sp)+,d0-d7/a0-a6
     rts

Reqclose:    ;* Window schließen (FileRequester)
     move.l intbase,a6
     move.l windowhd,a1
     lea File_Requester,a0
     jsr EndRequest(a6)    ;Requester löschen
     bsr Wait_CloseReq
     rts

windclose:   ;* Window schließen (Soundeditor)
     move.l intbase,a6     ;Intuition-Basis in A6
     move.l windowhd,a0    ;Fenster-Handle
     jsr closewindow(a6)   ;Fenster schließen
     rts

wind4close:  ;* Window schließen (On keyboard play)
     move.l intbase,a6     ;Intuition-Basis in A6
     move.l windowhd4,a0   ;Fenster-Handle
     jsr closewindow(a6)   ;Fenster schließen
     rts

Intui_trouble:             ;Intuition-Library kann nicht geöffnet werden
     move.l #Intui,d2
     move.l #34,d3
     bra CLI_Message

Gfx_trouble:               ;Graphics-Library kann nicht geöffnet werden
     move.l #Gfx,d2
     move.l #33,d3
     bra.s CLI_Message

Usage:
     move.l #Usage_String,d2 ;USAGE ausgeben
     move.l #Usg_End-Usage_String,d3
     bra.s CLI_Message

No_Mem_Free:               ;kein freier Speicher mehr
     move.l #No_Mem,d2
     move.l #22,d3         ;Länge in Bytes

CLI_Message:               ;Fehlermeldung im CLI-Fenster ausgeben
     tst.l WB_Message
     bne.s nix_Message
     move.l d2,-(sp)
     move.l d3,-(sp)
     move.l DosBase,a6
     jsr Output(a6)
     move.l (sp)+,d3
     move.l (sp)+,d2
     move.l d0,d1
     jsr Write(a6)
     move.l ExecBase,a6
nix_Message:
     rts

OpenAssWindow:             ;Öffnet Fenster für Linker & Assembler
     move.l dosbase,a6
     move.l #mode_old,d2
     move.l #AssWindow,d1
     jsr Open(a6)
     move.l d0,conhandle
     rts
   even
AssWindow:
     dc.b "RAW:50/50/500/100/*** Message-window ***",0
   even

CloseAssWindow:            ;Schließt Fenster für Linker & Assembler
     move.l dosbase,a6
     move.l conhandle,d1
     jsr Close(a6)
     rts

   even

   include Player.Inc
   include Copy.Inc
   include FileRequester.Inc
   include MiscData.Inc
   include Requesters.Inc
   include MainGadgets.Inc
   include Gadgets.Inc
   include Menus.Inc
   include Images.Inc
