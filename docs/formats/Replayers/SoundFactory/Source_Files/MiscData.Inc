   even
No_Mem:
     dc.b 10,"Not enough memory !",10,10
   even
Intui:
     dc.b 10,"Cannot open intuition.library !",10,10
   even
Gfx:
     dc.b 10,"Cannot open graphics.library !",10,10
   even
Usage_String:
     dc.b 10,"Profiteams -- SOUNDFACTORY --",10
     dc.b "USAGE: Soundfactory [-s Size] [-e Editorname]",10,10
Usg_End:

   even
screen_defs:    ;* hier beginnt die Screen-Tabelle
x_pos:       dc.w     0    ;X-Position
y_pos:       dc.w     0    ;Y-Position
width:       dc.w   640    ;Breite
height:      dc.w   256    ;Höhe
depth:       dc.w     2    ;Anzahl der Bitplanes
detail_pen:  dc.b     1    ;Farbe des Textes = weiß
block_pen:   dc.b     3    ;Hintergrund-Farbe = rot
view_modes:  dc.w $8002    ;Darstellungs-Modus
screen_type: dc.w     1    ;Screen-Typ: WB-Screen
font:        dc.l     0    ;Zeichensatz: Standard
title:       dc.l titel    ;Zeiger auf Titel-Text
gadgets:     dc.l     0    ;keine Gadgets
bitmap:      dc.l     0    ;keine Bitmap

intbase:     dc.l     0    ;Basisadresse des Intuition
dosbase:     dc.l     0    ;Basisadresse des DOS
Gfxbase:     dc.l     0    ;Basisadresse der Gfx
windowhd:    dc.l     0    ;Fenster-Handle
windowhd3:   dc.l     0    ;Fenster-Handle für Copyright-Vermerk
windowhd4:   dc.l     0    ;Fenster-Handle für On-Keyboard-Play
IntName:     dc.b "intuition.library",0
   even
GfxName:     dc.b "graphics.library",0
   even
DosName:     dc.b "dos.library",0
   even
IRQ_Music:   dc.b "SF:IRQ_Music.Code",0
   even
NIL_Name:    dc.b "NIL:",0
   even
Editor_Source: dc.b "Temp-SF:T.m",0
   even
titel:       dc.b "Projectname: "     ;Screen-Überschrift
Projectname: dc.b "untitled",0
             dcb.b 21,32
             dc.b 0
   even
Kommando2:   dc.b "SF:Copy >NIL: "
TempName2:   dc.b "Temp-SF:T.a "
PName:       dc.b "untitled",0
             dcb.b 57,32   ;Projekt-Name mit Pfad
             dc.b 0
   even
Ereignis:    dc.l 0        ;IDCMP-Flags
MenuPick:    dc.w 0        ;welcher Menüpunkt wurde angewählt
Gadget_Pointer: dc.l 0     ;Zeiger auf angeklicktes Gadget
GadgetID:    dc.w 0        ;Gadget-Nummer
MouseX:      dc.w 0        ;Mausposition X
MouseY:      dc.w 0        ;Mausposition Y

Entries:     dc.b 0        ;Anzahl der Files
first:       dc.b 0        ;1. Sichtbarer Filename
PufferAdr:   dc.l 0        ;Zeiger auf Puffer für Filenamen
SoundAdr:    dc.l 0        ;Zeiger auf Musik-Daten
IRQ_Music_Buffer: dc.l 0   ;Zeiger auf IRQ_Music.Code
locksav:     dc.l 0        ;Dateischlüssel
ImagePuffer: dc.l 0        ;Zeiger auf Image-Daten im ChipMem
Requesthd:   dc.l 0        ;Window-Handle des FileRequesters
Overread:    dc.l 0        ;für IFF-Load: # Bytes, die überlesen werden
Conhandle:   dc.l 0        ;Handle für Message-window
NILHandle:   dc.l 0        ;Handle für geöffnetes NIL: File
Mem_Size:    dc.l Sound_Max_Len ;Defaultwert für Samplelen
Object:      dc.l 0        ;enthält Adresse des Musik-Objectfiles
Objectlength: dc.l 0       ;enthält Länge des Musik-Objectfiles
Record_Buffer: dc.l 0      ;Adresse des Aufnahmepuffers
Record_length: dc.l 0      ;Länge der letzten Aufnahme
Mix_Buffer:  dc.l 0        ;Adresse des Mischpuffers
Mix_Length:  dc.l 0        ;Länge des Mischpuffers
Nota_Buffero: dc.l 0       ;Adresse des 2. Aufnahmepuffers
WB_Message:  dc.l 0	   ;enthält WB-Message, falls vorhanden
Phasing_Start: dc.b 0      ;Phasing-Start
Phasing_End:   dc.b 0      ;Phasing-Ende
Effektbyte:  dc.b 0        ;Effektbyte (für MakeGadgets)
Requesterflag: dc.b 0      ;Flag, ob File-Requester schon mal aufgerufen
VHDR_Found:  dc.b 0        ;Flag, ob Soundheader schon gefunden (IFF)
BODY_Found:  dc.b 0        ;Flag, ob Samplingdaten gefunden
SourceFlag:  dc.b 0        ;Flag, ob Musiksourcefile bekannt & ins Temp-
                           ;File kopiert ist
ObjectFlag:  dc.b 0        ;Flag, ob bereits ein Objectfile existiert (.a)
CodeFlag:    dc.b 0        ;Flag, ob ein Objectfile im Speicher steht
ChangeFlag:  dc.b 0        ;Flag, ob eine Änderung vorgenommen wurde
Editor_Flag: dc.b 0        ;Flag, 1 = alternativer Editor wird benutzt
AktSong:     dc.b 1        ;zu spielender Song für den Player
AktVoices:   dc.b 15       ;eingeschaltete Stimmen im Player
Timer_low:   dc.b 0        ;zählt alle 1/50-tel Sek. rauf
Timer_Flag:  dc.b 0        ;wird jede Sekunde auf 1 gesetzt
Timer_Sek:   dc.b 0        ;Sekundenzähler (BCD)
Timer_Min:   dc.b 0        ;Minutenzähler (BCD)
   even
Timer        dc.w 0        ;allgemeiner binärer Zähler
Play_Flag:   dc.b 0        ;Flag, ob eine Musik läuft
LED:         dc.b 0        ;Flag, ob Filter-LED eingeschaltet
Last_Dir:    dc.b 0        ;1=letztes Verzeichnis war Instruments:
                           ;2=Projektname + Pfad

   even
SourceName:  ds.b 66       ;Puffer für Musiknamen

   even
Notentabelle:              ;Hilfstabelle für Make_Note & Decode_Note
             dc.b "c",0,"c#","d",0,"d#","e",0,"f",0
             dc.b "f#","g",0,"g#","a",0,"a#","h",0

   even
Teil1:       dc.l 300      ;Anfang des Musik-Codes
             dc.b 1
             ds.b 15
             dc.l 276,0,0,0
             ds.l 60
             dc.b 132,0
Teil1_Ende:
Teil2:       dc.b 131,0    ;Ende des Musik-Codes
             dc.b 24,0,50
             dc.b 36,0,50
             dc.b 141
Teil2_Ende:
   even
Default1:    dc.w 0        ;Default-Soundwerte
             dc.b %00000000
             dc.b 1,6,255
             dc.b 0,1,1
             dc.b 1
             dc.b 0,1,1,1
             dc.b 5,0,64,50
             dc.b 0,20,1,1
             dc.b 1
             dc.b 0
             dc.b 1,8,1,0
             dc.w 0,0
Def_Ende:
   even

Sound_Overhead = (Teil1_Ende-Teil1)+(Teil2_Ende-Teil2)+(Def_Ende-Default1)+8
                           ;wieviel Speicher mehr reserviert werden muß

Sinus_tab:
     dc.b 0,3,6,9,12,15,18,21,24,27,30,33,36,39,42,45
     dc.b 48,51,54,57,59,62,65,67,70,73,75,78,80,82,85,87
     dc.b 89,91,94,96,98,100,102,103,105,107,108,110,112,113,114,116
     dc.b 117,118,119,120,121,122,123,123,124,125,125,126,126,126,126,126
     dc.b 127,126,126,126,126,126,125,125,124,123,123,122,121,120,119,118
     dc.b 117,116,114,113,112,110,108,107,105,103,102,100,98,96,94,91
     dc.b 89,87,85,82,80,78,75,73,70,67,65,62,59,57,54,51
     dc.b 48,45,42,39,36,33,30,27,24,21,18,15,12,9,6,3
     dc.b 0,-4,-7,-10,-13,-16,-19,-22,-25,-28,-31,-34,-37,-40,-43,-46
     dc.b -49,-52,-55,-58,-60,-63,-66,-68
     dc.b -71,-74,-76,-79,-81,-83,-86,-88
     dc.b -90,-92,-95,-97,-99,-101,-103,-104
     dc.b -106,-108,-109,-111,-113,-114,-115,-117
     dc.b -118,-119,-120,-121,-122,-123,-124,-124
     dc.b -125,-126,-126,-127,-127,-127,-127,-127
     dc.b -127,-127,-127,-128,-127,-127,-126,-126
     dc.b -125,-124,-124,-123,-122,-121,-120,-119
     dc.b -118,-117,-115,-114,-113,-111,-109,-108
     dc.b -106,-104,-103,-101,-99,-97,-95,-92
     dc.b -90,-88,-86,-83,-81,-79,-76,-74
     dc.b -71,-68,-66,-63,-60,-58,-55,-52
     dc.b -49,-46,-43,-40,-37,-34,-31,-28,-25,-22,-19,-16,-13,-10,-7,-4

   even
window_defs:
     dc.w     0         ;X-Position
     dc.w    11         ;Y-Position
     dc.w   640         ;Breite
     dc.w   245         ;Höhe
     dc.b     0         ;Schriftfarbe weiß
     dc.b     1         ;auf rotem Hintergrund
     dc.l $1170         ;IDCMP-Flags: GADGETUP & GADGETDOWN & REQCLEAR
     dc.l $1100         ;ACTIVATE & BACKDROP                  ^ & MENUPICK
     dc.l gadg1         ;FirstGadget: gadg1
     dc.l     0         ;CheckMark: Standard
     dc.l     0         ;Zeiger auf Fenster-Titel
screenhd: dc.l  0       ;Screen-Handle
     dc.l     0         ;keine eigene Bitmap
     dc.w   640         ;Mindestbreite
     dc.w   245         ;Mindesthöhe
     dc.w   640         ;maximale Breite
     dc.w   245         ;maximale Höhe
     dc.w    15         ;Screen-Typ: WB-Screen

