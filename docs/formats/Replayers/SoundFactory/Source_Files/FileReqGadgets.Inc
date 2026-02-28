   even
gadget1:                   ;String-Gadget (Path)
     dc.l     gadget2      ;kein weiteres Gadget
     dc.w     50,15        ;Position
     dc.w     280,10       ;Breite/Höhe des Containers
     dc.w     0            ;Flags: normal
     dc.w     3            ;Activation  (RELVERIFY & GADGIMMEDIATE)
     dc.w     4            ;Typ: String-Gadget
     dc.l     border1      ;Zeiger auf Umrahmung
     dc.l     0            ;keine Select-Zeichnung
     dc.l     ggtext1      ;kein Text
     dc.l     0            ;kein Exclude
     dc.l     strinfo1     ;Zeiger auf StringInfo-Struktur
     dc.w     1            ;Gadget-ID
     dc.l     0            ;keine User-Daten
border1:
     dc.w     0,0          ;kein Offset
     dc.b     3,3          ;Farbe: rot
     dc.b     0            ;Modus: JAM1
     dc.b     5            ;5 XY-Paare
     dc.l     koord1       ;Zeiger auf Koordinaten-Tabelle
     dc.l     0            ;keine Fortsetzung
koord1:
     dc.w     -42,-2       ;Anfang links oben
     dc.w     280,-2       ;rechts oben
     dc.w     280,9        ;rechts unten
     dc.w     -42,9        ;links unten
     dc.w     -42,-2       ;zum Anfang
strinfo1:
     dc.l     strpuffer1   ;Zeiger auf Textpuffer
     dc.l     undo1        ;Zeiger auf Undo-Puffer
     dc.w     0            ;Cursor-Position
     dc.w     40           ;max. Char
     dc.w     0            ;Text ab diesem Zeichen ausgeben
     dc.w     0            ;Zeichenposition im Undo-Puffer
     dc.w     0            ;Anzahl der Zeichen im Textpuffer
     dc.w     0            ;Anzahl der im Container sichtb. Zeichen
     dc.w     0            ;horizontaler Container-Offset
     dc.w     0            ;vertikaler Container-Offset
     dc.l     0            ;Zeiger auf aktuellen RastPort
     dc.l     0            ;Langwort für Integer-Eingabe
     dc.l     0            ;Standard-Tastaturbelegung
strpuffer1:
     dc.b     "Instruments:",0
     ds.b    27
undo1:
     ds.b    40
ggtext1:
     dc.b     2,1          ;Farben
     dc.b     1            ;Modus
   even
     dc.w     -40,0        ;X/Y-Position
     dc.l     0            ;Standard-Font
     dc.l     strtext1     ;Zeiger auf Text
     dc.l     0            ;kein weiterer Text
strtext1:
     dc.b "Path:",0

gadget2:
     dc.l  gadget3         ;kein weiteres Gadget
     dc.w    310,30        ;Position
     dc.w    16,14         ;Breite/Höhe der Hit-Box
     dc.w     4            ;Flags: Gadget invertieren
     dc.w     3            ;Activation-Flags
     dc.w     1            ;Typ: Boolean-Gadget
     dc.l     image1       ;Zeiger auf Gadget-Image
     dc.l     0            ;kein Select-Gadget
     dc.l     0            ;kein Text
     dc.l     0            ;kein Exclude
     dc.l     0            ;kein SpecialInfo
     dc.w     2            ;Gadget-ID
     dc.l     0            ;keiner User-Daten
image1:
     dc.w   0,0            ;X/Y-Abstand
     dc.w   16,14          ;Breite und Höhe des Images
     dc.w   1              ;eine Bitplane
img1:
     dc.l   imgdata1       ;Zeiger auf Image-Daten
     dc.b   1,1            ;Farben
     dc.l   0              ;kein weiteres Image

gadget3:
     dc.l  gadget4         ;kein weiteres Gadget
     dc.w  310,82          ;Position
     dc.w    16,14         ;Breite/Höhe der Hit-Box
     dc.w     4            ;Flags: Gadget invertieren
     dc.w     3            ;Activation-Flags
     dc.w     1            ;Typ: Boolean-Gadget
     dc.l     image2       ;Zeiger auf Gadget-Image
     dc.l     0            ;kein Select-Gadget
     dc.l     0            ;kein Text
     dc.l     0            ;kein Exclude
     dc.l     0            ;kein SpecialInfo
     dc.w     3            ;Gadget-ID
     dc.l     0            ;keiner User-Daten
image2:
     dc.w   0,0            ;X/Y-Abstand
     dc.w   16,14          ;Breite und Höhe des Images
     dc.w   1              ;eine Bitplane
img2:
     dc.l   imgdata2       ;Zeiger auf Image-Daten
     dc.b   1,1            ;Farben
     dc.l   0              ;kein weiteres Image

gadget4:                   ;String-Gadget (Name)
     dc.l     gadget5      ;kein weiteres Gadget
     dc.w     50,103       ;Position
     dc.w     280,10       ;Breite/Höhe des Containers
     dc.w     0            ;Flags: normal
     dc.w     3            ;Activation
     dc.w     4            ;Typ: String-Gadget
     dc.l     border1      ;Zeiger auf Umrahmung
     dc.l     0            ;keine Select-Zeichnung
     dc.l     ggtext2      ;Text
     dc.l     0            ;kein Exclude
     dc.l     strinfo2     ;Zeiger auf StringInfo-Struktur
     dc.w     4            ;Gadget-ID
     dc.l     0            ;keine User-Daten
strinfo2:
     dc.l     strpuffer2   ;Zeiger auf Textpuffer
     dc.l     undo2        ;Zeiger auf Undo-Puffer
     dc.w     0            ;Cursor-Position
     dc.w     35           ;max. Char
     dc.w     0            ;Text ab diesem Zeichen ausgeben
     dc.w     0            ;Zeichenposition im Undo-Puffer
     dc.w     0            ;Anzahl der Zeichen im Textpuffer
     dc.w     0            ;Anzahl der im Container sichtb. Zeichen
     dc.w     0            ;horizontaler Container-Offset
     dc.w     0            ;vertikaler Container-Offset
     dc.l     0            ;Zeiger auf aktuellen RastPort
     dc.l     0            ;Langwort für Integer-Eingabe
     dc.l     0            ;Standard-Tastaturbelegung
strpuffer2:
     ds.b    35
undo2:
     ds.b    35
ggtext2:
     dc.b     2,1          ;Farben
     dc.b     1            ;Modus
   even
     dc.w     -40,0        ;X/Y-Position
     dc.l     0            ;Standard-Font
     dc.l     strtext2     ;Zeiger auf Text
     dc.l     0            ;kein weiterer Text
strtext2:
     dc.b "Name:",0

gadget5:                   ;Boolean-Gadget (df0:)
     dc.l     gadget6      ;kein weiteres Gadget
     dc.w     9,118        ;Position
     dc.w     35,10        ;Breite/Höhe der Hit-Box
     dc.w     0            ;Flags: normal
     dc.w     3            ;Activation
     dc.w     1            ;Typ: Boolean-Gadget
     dc.l     border2      ;Zeiger auf Umrahmung
     dc.l     0            ;keine Select-Zeichnung
     dc.l     ggtext3      ;Text
     dc.l     0            ;kein Exclude
     dc.l     0            ;Zeiger auf StringInfo-Struktur
     dc.w     5            ;Gadget-ID
     dc.l     0            ;keine User-Daten
border2:
     dc.w     1,1          ;kein Offset
     dc.b     3,3          ;Farbe: rot
     dc.b     0            ;Modus: JAM1
     dc.b     5            ;5 XY-Paare
     dc.l     koord2       ;Zeiger auf Koordinaten-Tabelle
     dc.l     0            ;keine Fortsetzung
koord2:
     dc.w     -2,-2        ;Anfang links oben
     dc.w     34,-2        ;rechts oben
     dc.w     34,9         ;rechts unten
     dc.w     -2,9         ;links unten
     dc.w     -2,-2        ;zum Anfang
ggtext3:
     dc.b     1,0          ;Farben
     dc.b     1            ;Modus
   even
     dc.w     2,1          ;X/Y-Position
     dc.l     0            ;Standard-Font
     dc.l     strtext3     ;Zeiger auf Text
     dc.l     0            ;kein weiterer Text
strtext3:
     dc.b "df0:",0

   even
gadget6:                   ;Boolean-Gadget (df1:)
     dc.l     gadget7      ;kein weiteres Gadget
     dc.w     104,118      ;Position
     dc.w     35,10        ;Breite/Höhe der Hit-Box
     dc.w     0            ;Flags: normal
     dc.w     3            ;Activation
     dc.w     1            ;Typ: Boolean-Gadget
     dc.l     border2      ;Zeiger auf Umrahmung
     dc.l     0            ;keine Select-Zeichnung
     dc.l     ggtext4      ;Text
     dc.l     0            ;kein Exclude
     dc.l     0            ;Zeiger auf StringInfo-Struktur
     dc.w     6            ;Gadget-ID
     dc.l     0            ;keine User-Daten
ggtext4:
     dc.b     1,0          ;Farben
     dc.b     1            ;Modus
   even
     dc.w     2,1          ;X/Y-Position
     dc.l     0            ;Standard-Font
     dc.l     strtext4     ;Zeiger auf Text
     dc.l     0            ;kein weiterer Text
strtext4:
     dc.b "df1:",0

   even
gadget7:                   ;Boolean-Gadget (vd0:)
     dc.l     gadget8      ;kein weiteres Gadget
     dc.w     197,118      ;Position
     dc.w     35,10        ;Breite/Höhe der Hit-Box
     dc.w     0            ;Flags: normal
     dc.w     3            ;Activation
     dc.w     1            ;Typ: Boolean-Gadget
     dc.l     border2      ;Zeiger auf Umrahmung
     dc.l     0            ;keine Select-Zeichnung
     dc.l     ggtext5      ;Text
     dc.l     0            ;kein Exclude
     dc.l     0            ;Zeiger auf StringInfo-Struktur
     dc.w     7            ;Gadget-ID
     dc.l     0            ;keine User-Daten
ggtext5:
     dc.b     1,0          ;Farben
     dc.b     1            ;Modus
   even
     dc.w     2,1          ;X/Y-Position
     dc.l     0            ;Standard-Font
     dc.l     strtext5     ;Zeiger auf Text
     dc.l     0            ;kein weiterer Text
strtext5:
     dc.b "Ins:",0

   even
gadget8:                   ;Boolean-Gadget (ram:)
     dc.l     gadget9      ;Zeiger auf weiteres Gadget
     dc.w     294,118      ;Position
     dc.w     35,10        ;Breite/Höhe der Hit-Box
     dc.w     0            ;Flags: normal
     dc.w     3            ;Activation
     dc.w     1            ;Typ: Boolean-Gadget
     dc.l     border2      ;Zeiger auf Umrahmung
     dc.l     0            ;keine Select-Zeichnung
     dc.l     ggtext6      ;Text
     dc.l     0            ;kein Exclude
     dc.l     0            ;Zeiger auf StringInfo-Struktur
     dc.w     8            ;Gadget-ID
     dc.l     0            ;keine User-Daten
ggtext6:
     dc.b     1,0          ;Farben
     dc.b     1            ;Modus
   even
     dc.w     2,1          ;X/Y-Position
     dc.l     0            ;Standard-Font
     dc.l     strtext6     ;Zeiger auf Text
     dc.l     0            ;kein weiterer Text
strtext6:
     dc.b "ram:",0

   even
gadget9:                   ;Boolean-Gadget (LOAD)
     dc.l     gadget10     ;Zeiger auf weiteres Gadget
     dc.w     10,140       ;Position
     dc.w     67,14        ;Breite/Höhe der Hit-Box
     dc.w     0            ;Flags: normal
     dc.w     3            ;Activation
     dc.w     1            ;Typ: Boolean-Gadget
     dc.l     border3      ;Zeiger auf Umrahmung
     dc.l     0            ;keine Select-Zeichnung
     dc.l     ggtext7      ;Text
     dc.l     0            ;kein Exclude
     dc.l     0            ;Zeiger auf StringInfo-Struktur
     dc.w     9            ;Gadget-ID
     dc.l     0            ;keine User-Daten
border3:
     dc.w     1,3          ;kein Offset
     dc.b     3,3          ;Farbe: rot
     dc.b     0            ;Modus: JAM1
     dc.b     5            ;5 XY-Paare
     dc.l     koord3       ;Zeiger auf Koordinaten-Tabelle
     dc.l     0            ;keine Fortsetzung
koord3:
     dc.w     -2,-4        ;Anfang links oben
     dc.w     66,-4        ;rechts oben
     dc.w     66,11         ;rechts unten
     dc.w     -2,11         ;links unten
     dc.w     -2,-4        ;zum Anfang
ggtext7:
     dc.b     1,0          ;Farben
     dc.b     1            ;Modus
   even
     dc.w     2,3          ;X/Y-Position
     dc.l     0            ;Standard-Font
text7pointer:
     dc.l     strtext7     ;Zeiger auf Text
     dc.l     0            ;kein weiterer Text
strtext7:
     dc.b "  LOAD  ",0
   even
strtext7a:
     dc.b "  SAVE  ",0

   even
gadget10:                  ;Boolean-Gadget (CANCEL)
     dc.l     gadget11     ;Zeiger auf weiteres Gadget
     dc.w     262,140      ;Position
     dc.w     67,14        ;Breite/Höhe der Hit-Box
     dc.w     0            ;Flags: normal
     dc.w     3            ;Activation
     dc.w     1            ;Typ: Boolean-Gadget
     dc.l     border3      ;Zeiger auf Umrahmung
     dc.l     0            ;keine Select-Zeichnung
     dc.l     ggtext8      ;Text
     dc.l     0            ;kein Exclude
     dc.l     0            ;Zeiger auf StringInfo-Struktur
     dc.w     10           ;Gadget-ID
     dc.l     0            ;keine User-Daten
ggtext8:
     dc.b     1,0          ;Farben
     dc.b     1            ;Modus
   even
     dc.w     2,3          ;X/Y-Position
     dc.l     0            ;Standard-Font
     dc.l     strtext8     ;Zeiger auf Text
     dc.l     0            ;kein weiterer Text
strtext8:
     dc.b " CANCEL ",0

   even
border4:
     dc.w     0,0          ;kein Offset
     dc.b     3,3          ;Farbe: rot
     dc.b     0            ;Modus: JAM1
     dc.b     5            ;5 XY-Paare
     dc.l     koord4       ;Zeiger auf Koordinaten-Tabelle
     dc.l     0            ;keine Fortsetzung
koord4:
     dc.w     -2,-2        ;Anfang links oben
     dc.w     290,-2       ;rechts oben
     dc.w     290,66       ;rechts unten
     dc.w     -2,66        ;links unten
     dc.w     -2,-2        ;zum Anfang

   even
gadget11:                  ;Boolean-Gadget (Name1)
     dc.l     gadget12     ;Zeiger auf weiteres Gadget
     dc.w     10,31        ;Position
     dc.w     289,9        ;Breite/Höhe der Hit-Box
     dc.w     0            ;Flags: normal
     dc.w     3            ;Activation
     dc.w     1            ;Typ: Boolean-Gadget
     dc.l     0            ;keine Umrahmung
     dc.l     0            ;keine Select-Zeichnung
     dc.l     ggtext9      ;Text
     dc.l     0            ;kein Exclude
     dc.l     0            ;Zeiger auf StringInfo-Struktur
     dc.w     11           ;Gadget-ID
     dc.l     0            ;keine User-Daten
ggtext9:
     dc.b     1,0          ;Farben
     dc.b     1            ;Modus
   even
     dc.w     1,1          ;X/Y-Position
     dc.l     0            ;Standard-Font
     dc.l     strtext9     ;Zeiger auf Text
     dc.l     0            ;kein weiterer Text

   even
gadget12:                  ;Boolean-Gadget (Name1)
     dc.l     gadget13     ;Zeiger auf weiteres Gadget
     dc.w     10,39        ;Position
     dc.w     289,9        ;Breite/Höhe der Hit-Box
     dc.w     0            ;Flags: normal
     dc.w     3            ;Activation
     dc.w     1            ;Typ: Boolean-Gadget
     dc.l     0            ;keine Umrahmung
     dc.l     0            ;keine Select-Zeichnung
     dc.l     ggtext10     ;Text
     dc.l     0            ;kein Exclude
     dc.l     0            ;Zeiger auf StringInfo-Struktur
     dc.w     12           ;Gadget-ID
     dc.l     0            ;keine User-Daten
ggtext10:
     dc.b     1,0          ;Farben
     dc.b     1            ;Modus
   even
     dc.w     1,1          ;X/Y-Position
     dc.l     0            ;Standard-Font
     dc.l     strtext10    ;Zeiger auf Text
     dc.l     0            ;kein weiterer Text

   even
gadget13:                  ;Boolean-Gadget (Name1)
     dc.l     gadget14     ;Zeiger auf weiteres Gadget
     dc.w     10,47        ;Position
     dc.w     289,9        ;Breite/Höhe der Hit-Box
     dc.w     0            ;Flags: normal
     dc.w     3            ;Activation
     dc.w     1            ;Typ: Boolean-Gadget
     dc.l     0            ;keine Umrahmung
     dc.l     0            ;keine Select-Zeichnung
     dc.l     ggtext11     ;Text
     dc.l     0            ;kein Exclude
     dc.l     0            ;Zeiger auf StringInfo-Struktur
     dc.w     13           ;Gadget-ID
     dc.l     0            ;keine User-Daten
ggtext11:
     dc.b     1,0          ;Farben
     dc.b     1            ;Modus
   even
     dc.w     1,1          ;X/Y-Position
     dc.l     0            ;Standard-Font
     dc.l     strtext11    ;Zeiger auf Text
     dc.l     0            ;kein weiterer Text

   even
gadget14:                  ;Boolean-Gadget (Name1)
     dc.l     gadget15     ;Zeiger auf weiteres Gadget
     dc.w     10,55        ;Position
     dc.w     289,9        ;Breite/Höhe der Hit-Box
     dc.w     0            ;Flags: normal
     dc.w     3            ;Activation
     dc.w     1            ;Typ: Boolean-Gadget
     dc.l     0            ;keine Umrahmung
     dc.l     0            ;keine Select-Zeichnung
     dc.l     ggtext12     ;Text
     dc.l     0            ;kein Exclude
     dc.l     0            ;Zeiger auf StringInfo-Struktur
     dc.w     14           ;Gadget-ID
     dc.l     0            ;keine User-Daten
ggtext12:
     dc.b     1,0          ;Farben
     dc.b     1            ;Modus
   even
     dc.w     1,1          ;X/Y-Position
     dc.l     0            ;Standard-Font
     dc.l     strtext12    ;Zeiger auf Text
     dc.l     0            ;kein weiterer Text

   even
gadget15:                  ;Boolean-Gadget (Name1)
     dc.l     gadget16     ;Zeiger auf weiteres Gadget
     dc.w     10,63        ;Position
     dc.w     289,9        ;Breite/Höhe der Hit-Box
     dc.w     0            ;Flags: normal
     dc.w     3            ;Activation
     dc.w     1            ;Typ: Boolean-Gadget
     dc.l     0            ;keine Umrahmung
     dc.l     0            ;keine Select-Zeichnung
     dc.l     ggtext13     ;Text
     dc.l     0            ;kein Exclude
     dc.l     0            ;Zeiger auf StringInfo-Struktur
     dc.w     15           ;Gadget-ID
     dc.l     0            ;keine User-Daten
ggtext13:
     dc.b     1,0          ;Farben
     dc.b     1            ;Modus
   even
     dc.w     1,1          ;X/Y-Position
     dc.l     0            ;Standard-Font
     dc.l     strtext13    ;Zeiger auf Text
     dc.l     0            ;kein weiterer Text

   even
gadget16:                  ;Boolean-Gadget (Name1)
     dc.l     gadget17     ;Zeiger auf weiteres Gadget
     dc.w     10,71        ;Position
     dc.w     289,9        ;Breite/Höhe der Hit-Box
     dc.w     0            ;Flags: normal
     dc.w     3            ;Activation
     dc.w     1            ;Typ: Boolean-Gadget
     dc.l     0            ;keine Umrahmung
     dc.l     0            ;keine Select-Zeichnung
     dc.l     ggtext14     ;Text
     dc.l     0            ;kein Exclude
     dc.l     0            ;Zeiger auf StringInfo-Struktur
     dc.w     16           ;Gadget-ID
     dc.l     0            ;keine User-Daten
ggtext14:
     dc.b     1,0          ;Farben
     dc.b     1            ;Modus
   even
     dc.w     1,1          ;X/Y-Position
     dc.l     0            ;Standard-Font
     dc.l     strtext14    ;Zeiger auf Text
     dc.l     0            ;kein weiterer Text

   even
gadget17:                  ;Boolean-Gadget (Name1)
     dc.l     gadget18     ;Zeiger auf weiteres Gadget
     dc.w     10,79        ;Position
     dc.w     289,9        ;Breite/Höhe der Hit-Box
     dc.w     0            ;Flags: normal
     dc.w     3            ;Activation
     dc.w     1            ;Typ: Boolean-Gadget
     dc.l     0            ;keine Umrahmung
     dc.l     0            ;keine Select-Zeichnung
     dc.l     ggtext15     ;Text
     dc.l     0            ;kein Exclude
     dc.l     0            ;Zeiger auf StringInfo-Struktur
     dc.w     17           ;Gadget-ID
     dc.l     0            ;keine User-Daten
ggtext15:
     dc.b     1,0          ;Farben
     dc.b     1            ;Modus
   even
     dc.w     1,1          ;X/Y-Position
     dc.l     0            ;Standard-Font
     dc.l     strtext15    ;Zeiger auf Text
     dc.l     0            ;kein weiterer Text

   even
gadget18:                  ;Boolean-Gadget (Name1)
     dc.l     0            ;Zeiger auf weiteres Gadget
     dc.w     10,87        ;Position
     dc.w     289,9        ;Breite/Höhe der Hit-Box
     dc.w     0            ;Flags: normal
     dc.w     3            ;Activation
     dc.w     1            ;Typ: Boolean-Gadget
     dc.l     0            ;keine Umrahmung
     dc.l     0            ;keine Select-Zeichnung
     dc.l     ggtext16     ;Text
     dc.l     0            ;kein Exclude
     dc.l     0            ;Zeiger auf StringInfo-Struktur
     dc.w     18           ;Gadget-ID
     dc.l     0            ;keine User-Daten
ggtext16:
     dc.b     1,0          ;Farben
     dc.b     1            ;Modus
   even
     dc.w     1,1          ;X/Y-Position
     dc.l     0            ;Standard-Font
     dc.l     strtext16    ;Zeiger auf Text
     dc.l     0            ;kein weiterer Text

   even
strtext9:     ds.b 38   ;1. Name
strtext10:    ds.b 38   ;2. Name
strtext11:    ds.b 38   ;3. Name
strtext12:    ds.b 38   ;4. Name
strtext13:    ds.b 38   ;5. Name
strtext14:    ds.b 38   ;6. Name
strtext15:    ds.b 38   ;7. Name
strtext16:    ds.b 38   ;8. Name
