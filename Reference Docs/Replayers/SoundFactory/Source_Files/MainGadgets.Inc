   even
gadg1:                  ;Name
     dc.l gadg2
     dc.w 49,5,240,10,0,2,4
     dc.l bord1,0,tex1,0,sinfo1
     dc.w 1
     dc.l 0
bord1:
     dc.w 0,0
     dc.b 3,3,0,5
     dc.l kor1,0
kor1:
     dc.w -43,-2,278,-2,278,9,-43,9,-43,-2
sinfo1:
     dc.l strpuff1,un1
     dc.w 0,30,0,0,0,0,0,0
     dc.l 0,0,0
strpuff1:
     ds.b 30
un1:
     ds.b 30
tex1:
     dc.b 2,1,1,0
     dc.w -40,0
     dc.l 0,stex1,0
stex1:
     dc.b "Name:",0

gadg2:                  ;Length
     dc.l gadg3
     dc.w 270,19,56,10,0,$803,4
     dc.l bord2,0,tex2,0,sinfo2
     dc.w 2
     dc.l 0
bord2:
     dc.w 0,0
     dc.b 3,3,0,5
     dc.l kor2,0
kor2:
     dc.w -59,-2,57,-2,57,9,-59,9,-59,-2
sinfo2:
     dc.l strpuff2,un2
     dc.w 0,7,0,0,0,0,0,0
     dc.l 0,256,0
strpuff2:
     dc.b "256",0
     dc.l 0,0,0
un2:
     dc.l 0,0,0,0
tex2:
     dc.b 2,1,1,0
     dc.w -56,0
     dc.l 0,stex2,0
stex2:
     dc.b "Length:",0

gadg3:                  ;Period for C#3 (is 345)
     dc.l gadg4
     dc.w 8*12+9,19,24,10,0,$803,4
     dc.l bord3,0,tex3,0,sinfo3
     dc.w 3
     dc.l 0
bord3:
     dc.w 0,0
     dc.b 3,3,0,5
     dc.l kor3,0
kor3:
     dc.w -8*12-3,-2,12*8+1,-2,12*8+1,9,-8*12-3,9,-8*12-3,-2
sinfo3:
     dc.l strpuff3,un3
     dc.w 0,2,0,0,0,0,0,0
     dc.l 0,3,0
strpuff3:
     dc.b "3",0,0,0
un3:
     dc.b 0,0,0,0
tex3:
     dc.b 2,1,1,0
     dc.w -12*8,0
     dc.l 0,stex3,0
stex3:
     dc.b "Period for c",0

   even
gadg4:                  ;(Period for C#3 )is 345
     dc.l gadg5
     dc.w 8*18+9,19,48,10,0,$803,4
     dc.l 0,0,tex4,0,sinfo4
     dc.w 4
     dc.l 0
sinfo4:
     dc.l strpuff4,un4
     dc.w 0,6,0,0,0,0,0,0
     dc.l 0,0,0
strpuff4:
     dc.b "0",0,0,0
     dc.l 0,0,0
un4:
     dc.l 0,0,0,0
tex4:
     dc.b 2,1,1,0
     dc.w -3*8,0
     dc.l 0,stex4,0
stex4:
     dc.b "is ",0

gadg5:                  ;Attack-Time (Prop-Gadget)
     dc.l gadg6
     dc.w 15,38,16,66,0,3,3
     dc.l propbuff5,0,tex5,0,propinf5
     dc.w 5
     dc.l 0
propinf5:
     dc.w 5,0,$ffff,0,$ffff/64,0,0,0,0,0,0
propbuff5:
     dc.w 0,0,0,0
tex5:
     dc.b 1,0,1,0
     dc.w 4,68
     dc.l 0,stex5,0
stex5:
     dc.b "A",0

gadg6:                  ;Sustain-Time (Prop-Gadget)
     dc.l gadg7
     dc.w 45,38,16,66,0,3,3
     dc.l propbuff6,0,tex6,0,propinf6
     dc.w 6
     dc.l 0
propinf6:
     dc.w 5,0,$ffff,0,$ffff/64,0,0,0,0,0,0
propbuff6:
     dc.w 0,0,0,0
tex6:
     dc.b 1,0,1,0
     dc.w 4,68
     dc.l 0,stex6,0
stex6:
     dc.b "D",0

   even
gadg7:                  ;Sustain-Level (Prop-Gadget)
     dc.l gadg8
     dc.w 75,38,16,66,0,3,3
     dc.l propbuff7,0,tex7,0,propinf7
     dc.w 7
     dc.l 0
propinf7:
     dc.w 5,0,$ffff,0,$ffff/64,0,0,0,0,0,0
propbuff7:
     dc.w 0,0,0,0
tex7:
     dc.b 1,0,1,0
     dc.w 4,68
     dc.l 0,stex7,0
stex7:
     dc.b "S",0

   even
gadg8:                  ;Release-Time (Prop-Gadget)
     dc.l gadg9
     dc.w 105,38,16,66,0,3,3
     dc.l propbuff8,0,tex8,0,propinf8
     dc.w 8
     dc.l 0
propinf8:
     dc.w 5,0,$ffff,0,$ffff/64,0,0,0,0,0,0
propbuff8:
     dc.w 0,0,0,0
tex8:
     dc.b 1,0,1,0
     dc.w 4,68
     dc.l 0,stex8,0
stex8:
     dc.b "R",0

gadg9:                  ;Arpeggio-Speed (Prop-Gadget)
     dc.l gadg10
     dc.w 155,38,16,66,0,3,3
     dc.l propbuff9,0,tex9,0,propinf9
     dc.w 9
     dc.l 0
propinf9:
     dc.w 5,0,$ffff,0,$ffff/64,0,0,0,0,0,0
propbuff9:
     dc.w 0,0,0,0
tex9:
     dc.b 1,0,1,0
     dc.w 0,68
     dc.l 0,stex9,tex9_1
stex9:
     dc.b "Sp",0
   even
tex9_1:
     dc.b 1,0,1,0
     dc.w 23,1
     dc.l 0,stex9_1,tex9_2
stex9_1:
     dc.b "A",0
   even
tex9_2:
     dc.b 1,0,1,0
     dc.w 23,9
     dc.l 0,stex9_2,tex9_3
stex9_2:
     dc.b "r",0
   even
tex9_3:
     dc.b 1,0,1,0
     dc.w 23,17
     dc.l 0,stex9_3,tex9_4
stex9_3:
     dc.b "p",0
   even
tex9_4:
     dc.b 1,0,1,0
     dc.w 23,25
     dc.l 0,stex9_4,tex9_5
stex9_4:
     dc.b "e",0
   even
tex9_5:
     dc.b 1,0,1,0
     dc.w 23,33
     dc.l 0,stex9_5,tex9_6
stex9_5:
     dc.b "g",0
   even
tex9_6:
     dc.b 1,0,1,0
     dc.w 23,41
     dc.l 0,stex9_5,tex9_7
   even
tex9_7:
     dc.b 1,0,1,0
     dc.w 23,50
     dc.l 0,stex9_7,tex9_8
stex9_7:
     dc.b "i",0
   even
tex9_8:
     dc.b 1,0,1,0
     dc.w 23,57
     dc.l 0,stex9_8,0
stex9_8:
     dc.b "o",0

   even
gadg10:                 ;Vibrato-Delay (Prop-Gadget)
     dc.l gadg11
     dc.w 219,38,16,66,0,3,3
     dc.l propbuff10,0,tex10,0,propinf10
     dc.w 10
     dc.l 0
propinf10:
     dc.w 5,0,$ffff,0,$ffff/64,0,0,0,0,0,0
propbuff10:
     dc.w 0,0,0,0
tex10:
     dc.b 1,0,1,0
     dc.w 0,68
     dc.l 0,stex10,0
stex10:
     dc.b "Dl",0

   even
gadg11:                 ;Vibrato-Speed (Prop-Gadget)
     dc.l gadg12
     dc.w 249,38,16,66,0,3,3
     dc.l propbuff11,0,tex11,0,propinf11
     dc.w 11
     dc.l 0
propinf11:
     dc.w 5,0,$ffff,0,$ffff/16,0,0,0,0,0,0
propbuff11:
     dc.w 0,0,0,0
tex11:
     dc.b 1,0,1,0
     dc.w 0,68
     dc.l 0,stex11,0
stex11:
     dc.b "Sp",0

   even
gadg12:                 ;Vibrato-Step (Prop-Gadget)
     dc.l gadg13
     dc.w 279,38,16,66,0,3,3
     dc.l propbuff12,0,tex12,0,propinf12
     dc.w 12
     dc.l 0
propinf12:
     dc.w 5,0,$ffff,0,$ffff/16,0,0,0,0,0,0
propbuff12:
     dc.w 0,0,0,0
tex12:
     dc.b 1,0,1,0
     dc.w 0,68
     dc.l 0,stex12,0
stex12:
     dc.b "St",0

   even
gadg13:                 ;Vibrato-Range (Prop-Gadget)
     dc.l gadg14
     dc.w 309,38,16,66,0,3,3
     dc.l propbuff13,0,tex13,0,propinf13
     dc.w 13
     dc.l 0
propinf13:
     dc.w 5,0,$ffff,0,$ffff/16,0,0,0,0,0,0
propbuff13:
     dc.w 0,0,0,0
tex13:
     dc.b 1,0,1,0
     dc.w 0,68
     dc.l 0,stex13,0
stex13:
     dc.b "Ra",0

   even
gadg14:                 ;Tremolo-Speed (Prop-Gadget)
     dc.l gadg15
     dc.w 359,38,16,66,0,3,3
     dc.l propbuff14,0,tex14,0,propinf14
     dc.w 14
     dc.l 0
propinf14:
     dc.w 5,0,$ffff,0,$ffff/16,0,0,0,0,0,0
propbuff14:
     dc.w 0,0,0,0
tex14:
     dc.b 1,0,1,0
     dc.w 0,68
     dc.l 0,stex14,0
stex14:
     dc.b "Sp",0

   even
gadg15:                 ;Tremolo-Step (Prop-Gadget)
     dc.l gadg16
     dc.w 389,38,16,66,0,3,3
     dc.l propbuff15,0,tex15,0,propinf15
     dc.w 15
     dc.l 0
propinf15:
     dc.w 5,0,$ffff,0,$ffff/64,0,0,0,0,0,0
propbuff15:
     dc.w 0,0,0,0
tex15:
     dc.b 1,0,1,0
     dc.w 0,68
     dc.l 0,stex15,0
stex15:
     dc.b "St",0

   even
gadg16:                 ;Tremolo-% (Prop-Gadget)
     dc.l gadg17
     dc.w 419,38,16,66,0,3,3
     dc.l propbuff16,0,tex16,0,propinf16
     dc.w 16
     dc.l 0
propinf16:
     dc.w 5,0,$ffff,0,$ffff/64,0,0,0,0,0,0
propbuff16:
     dc.w 0,0,0,0
tex16:
     dc.b 1,0,1,0
     dc.w 4,68
     dc.l 0,stex16,0
stex16:
     dc.b "%",0

   even
gadg17:                 ;Portamento-Speed (Prop-Gadget)
     dc.l gadg18
     dc.w 469,38,16,66,0,3,3
     dc.l propbuff17,0,tex17,0,propinf17
     dc.w 17
     dc.l 0
propinf17:
     dc.w 5,0,$ffff,0,$ffff/64,0,0,0,0,0,0
propbuff17:
     dc.w 0,0,0,0
tex17:
     dc.b 1,0,1,0
     dc.w 0,68
     dc.l 0,stex17,0
stex17:
     dc.b "Sp",0

   even
gadg18:                 ;Portamento-Step (Prop-Gadget)
     dc.l gadg19
     dc.w 499,38,16,66,0,3,3
     dc.l propbuff18,0,tex18,0,propinf18
     dc.w 18
     dc.l 0
propinf18:
     dc.w 5,0,$ffff,0,$ffff/64,0,0,0,0,0,0
propbuff18:
     dc.w 0,0,0,0
tex18:
     dc.b 1,0,1,0
     dc.w 0,68
     dc.l 0,stex18,0
stex18:
     dc.b "St",0

   even
gadg19:                 ;Filter-Speed (Prop-Gadget)
     dc.l gadg20
     dc.w 549,38,16,66,0,3,3
     dc.l propbuff19,0,tex19,0,propinf19
     dc.w 19
     dc.l 0
propinf19:
     dc.w 5,0,$ffff,0,$ffff/64,0,0,0,0,0,0
propbuff19:
     dc.w 0,0,0,0
tex19:
     dc.b 1,0,1,0
     dc.w 0,68
     dc.l 0,stex19,0
stex19:
     dc.b "Sp",0

   even
gadg20:                 ;Filter-Frequency (Prop-Gadget)
     dc.l gadg21
     dc.w 579,38,16,66,0,3,3
     dc.l propbuff20,0,tex20,0,propinf20
     dc.w 20
     dc.l 0
propinf20:
     dc.w 5,0,$ffff,0,$ffff/64,0,0,0,0,0,0
propbuff20:
     dc.w 0,0,0,0
tex20:
     dc.b 1,0,1,0
     dc.w 4,68
     dc.l 0,stex20,0
stex20:
     dc.b "F",0

   even
gadg21:                 ;Filter-Step (Prop-Gadget)
     dc.l gadg22
     dc.w 609,38,16,66,0,3,3
     dc.l propbuff21,0,tex21,0,propinf21
     dc.w 21
     dc.l 0
propinf21:
     dc.w 5,0,$ffff,0,$ffff/64,0,0,0,0,0,0
propbuff21:
     dc.w 0,0,0,0
tex21:
     dc.b 1,0,1,0
     dc.w 0,68
     dc.l 0,stex21,0
stex21:
     dc.b "SF",0

   even
gadg22:                 ;Auto-Release On/Off (Boolean-Gadget)
     dc.l gadg23        ;der Zeiger tex22 muﬂ bei jedem Anklicken zwischen
     dc.w 7,122,122,14,0,3,1   ;tex22 und tex22_1 gewechselt werden,
     dc.l bord22,0,tex22_1,0,0        ;anschl. muﬂ RefreshGadgets aufgerufen
     dc.w 22            ;werden!!!
     dc.l 0
bord22:
     dc.w 0,0
     dc.b 3,3,0,5
     dc.l kor22,bord22_1
kor22:
     dc.w -1,-1,122,-1,122,14,-1,14,-1,-1
tex22:
     dc.b 1,0,1,0
     dc.w 6,3
     dc.l 0,stex22,0
stex22:
     dc.b "  Release On ",0
   even
tex22_1:
     dc.b 1,0,1,0
     dc.w 10,3
     dc.l 0,stex22_1,0
stex22_1:
     dc.b " Release Off ",0
   even
bord22_1:
     dc.w 0,-87
     dc.b 3,3,0,5
     dc.l kor22_1,0
kor22_1:
     dc.w -1,-1,122,-1,122,81,-1,81,-1,-1

   even
gadg23:                 ;Arpeggio On/Off (Boolean-Gadget)
     dc.l gadg24        ;der Zeiger tex23 muﬂ bei jedem Anklicken zwischen
     dc.w 147,122,47,14,0,3,1   ;tex23 und tex23_1 gewechselt werden,
     dc.l bord23,0,tex23_1,0,0        ;anschl. muﬂ RefreshGadgets aufgerufen
     dc.w 23            ;werden!!!
     dc.l 0
bord23:
     dc.w 0,0
     dc.b 3,3,0,5
     dc.l kor23,bord23_1
kor23:
     dc.w -1,-1,47,-1,47,14,-1,14,-1,-1
tex23:
     dc.b 1,0,1,0
     dc.w 8,3
     dc.l 0,stex23,0
stex23:
     dc.b " On ",0
   even
tex23_1:
     dc.b 1,0,1,0
     dc.w 4,3
     dc.l 0,stex23_1,0
stex23_1:
     dc.b " Off ",0
   even
bord23_1:
     dc.w 0,-87
     dc.b 3,3,0,5
     dc.l kor23_1,0
kor23_1:
     dc.w -1,-1,47,-1,47,81,-1,81,-1,-1

   even
gadg24:                 ;Vibrato On/Off (Boolean-Gadget)
     dc.l gadg25        ;der Zeiger tex24 muﬂ bei jedem Anklicken zwischen
     dc.w 211,122,122,14,0,3,1     ;tex24 und tex24_1 gewechselt werden,
     dc.l bord22,0,tex24_1,0,0        ;anschl. muﬂ RefreshGadgets aufgerufen
     dc.w 24            ;werden!!!
     dc.l 0
tex24:
     dc.b 1,0,1,0
     dc.w 6,3
     dc.l 0,stex24,0
stex24:
     dc.b "  Vibrato On ",0
   even
tex24_1:
     dc.b 1,0,1,0
     dc.w 10,3
     dc.l 0,stex24_1,0
stex24_1:
     dc.b " Vibrato Off",0

   even
gadg25:                 ;Tremolo On/Off (Boolean-Gadget)
     dc.l gadg26        ;der Zeiger tex25 muﬂ bei jedem Anklicken zwischen
     dc.w 351,122,92,14,0,3,1      ;tex25 und tex25_1 gewechselt werden,
     dc.l bord25,0,tex25_1,0,0        ;anschl. muﬂ RefreshGadgets aufgerufen
     dc.w 25            ;werden!!!
     dc.l 0
bord25:
     dc.w 0,0
     dc.b 3,3,0,5
     dc.l kor25,bord25_1
kor25:
     dc.w -1,-1,92,-1,92,14,-1,14,-1,-1
tex25:
     dc.b 1,0,1,0
     dc.w 1,3
     dc.l 0,stex25,0
stex25:
     dc.b " Tremolo On",0
   even
tex25_1:
     dc.b 1,0,1,0
     dc.w 2,3
     dc.l 0,stex25_1,0
stex25_1:
     dc.b "Tremolo Off",0
   even
bord25_1:
     dc.w 0,-87
     dc.b 3,3,0,5
     dc.l kor25_1,0
kor25_1:
     dc.w -1,-1,92,-1,92,81,-1,81,-1,-1

   even
gadg26:                 ;Portamento On/Off (Boolean-Gadget)
     dc.l gadg27        ;der Zeiger tex26 muﬂ bei jedem Anklicken zwischen
     dc.w 461,122,62,14,0,3,1      ;tex26 und tex26_1 gewechselt werden,
     dc.l bord26,0,tex26_1,0,0        ;anschl. muﬂ RefreshGadgets aufgerufen
     dc.w 26            ;werden!!!
     dc.l 0
bord26:
     dc.w 0,0
     dc.b 3,3,0,5
     dc.l kor26,bord26_1
kor26:
     dc.w -1,-1,62,-1,62,14,-1,14,-1,-1
tex26:
     dc.b 1,0,1,0
     dc.w 1,3
     dc.l 0,stex26,0
stex26:
     dc.b " Por On",0
   even
tex26_1:
     dc.b 1,0,1,0
     dc.w 2,3
     dc.l 0,stex26_1,0
stex26_1:
     dc.b "Por Off",0
   even
bord26_1:
     dc.w 0,-87
     dc.b 3,3,0,5
     dc.l kor26_1,bord26_2
kor26_1:
     dc.w -1,-1,62,-1,62,81,-1,81,-1,-1
bord26_2:               ;zeichnet den Rahmen f¸r Schwingung
     dc.w -454,21
     dc.b 3,3,0,5
     dc.l kor26_2,0
kor26_2:
     dc.w -1,-1,256,-1,256,64,-1,64,-1,-1

   even
gadg27:                 ;Filter On/Off (Boolean-Gadget)
     dc.l gadg28        ;der Zeiger tex27 muﬂ bei jedem Anklicken zwischen
     dc.w 541,122,92,14,0,3,1      ;tex27 und tex27_1 gewechselt werden,
     dc.l bord25,0,tex27_1,0,0        ;anschl. muﬂ RefreshGadgets aufgerufen
     dc.w 27            ;werden!!!
     dc.l 0
tex27:
     dc.b 1,0,1,0
     dc.w 2,3
     dc.l 0,stex27,0
stex27:
     dc.b " Filter On ",0
   even
tex27_1:
     dc.b 1,0,1,0
     dc.w 6,3
     dc.l 0,stex27_1,0
stex27_1:
     dc.b "Filter Off",0

   even
gadg28:                 ;Number of sampled Periods
     dc.l gadg29
     dc.w 26*8+9,215,40,10,0,$803,4
     dc.l bord28,0,tex28,0,sinfo28
     dc.w 28
     dc.l 0
bord28:
     dc.w 0,0
     dc.b 3,3,0,5
     dc.l kor28,0
kor28:
     dc.w -26*8-3,-2,46,-2,46,9,-26*8-3,9,-26*8-3,-2
sinfo28:
     dc.l strpuff28,un28
     dc.w 0,3,0,0,0,0,0,0
     dc.l 0,1,0
strpuff28:
     dc.b "1",0,0,0
     dc.l 0,0,0
un28:
     dc.l 0,0,0,0
tex28:
     dc.b 2,1,1,0
     dc.w -26*8,0
     dc.l 0,stex28,0
stex28:
     dc.b "Number of sampled periods:",0

   even
gadg29:                 ;Phasing-Speed (Prop-Gadget)
     dc.l gadg30
     dc.w 288,146,16,66,0,3,3
     dc.l propbuff29,0,tex29,0,propinf29
     dc.w 29
     dc.l 0
propinf29:
     dc.w 5,0,$ffff,0,$ffff/64,0,0,0,0,0,0
propbuff29:
     dc.w 0,0,0,0
tex29:
     dc.b 1,0,1,0
     dc.w 0,68
     dc.l 0,stex29,0
stex29:
     dc.b "Sp",0

   even
gadg30:                 ;Phasing-Step (Prop-Gadget)
     dc.l gadg31
     dc.w 318,146,16,66,0,3,3
     dc.l propbuff30,0,tex30,0,propinf30
     dc.w 30
     dc.l 0
propinf30:
     dc.w 5,0,$ffff,0,$ffff/64,0,0,0,0,0,0
propbuff30:
     dc.w 0,0,0,0
tex30:
     dc.b 1,0,1,0
     dc.w 0,68
     dc.l 0,stex30,0
stex30:
     dc.b "St",0

   even
gadg31:                 ;Mark Phasing Start (Boolean-Gadget)
     dc.l gadg32
     dc.w 349,147,138,14,0,$103,1
     dc.l bord31,0,tex31,0,0
     dc.w 31
     dc.l 0
bord31:
     dc.w 0,0
     dc.b 3,3,0,5
     dc.l kor31,bord31_1
kor31:
     dc.w -1,-1,138,-1,138,14,-1,14,-1,-1
tex31:
     dc.b 1,0,1,0
     dc.w 1,3
     dc.l 0,stex31,0
stex31:
     dc.b "Set Phasing Start",0
   even
bord31_1:
     dc.w 0,2
     dc.b 3,3,0,5
     dc.l kor31_1,0
kor31_1:
     dc.w -69,-7,146,-7,146,75,-69,75,-69,-7

   even
gadg32:                 ;Mark Phasing End (Boolean-Gadget)
     dc.l gadg33
     dc.w 349,176,138,14,0,$103,1
     dc.l bord32,0,tex32,0,0
     dc.w 32
     dc.l 0
bord32:
     dc.w 0,0
     dc.b 3,3,0,5
     dc.l kor32,0
kor32:
     dc.w -1,-1,138,-1,138,14,-1,14,-1,-1
tex32:
     dc.b 1,0,1,0
     dc.w 5,3
     dc.l 0,stex32,0
stex32:
     dc.b "Set Phasing End",0

   even
gadg33:                 ;Phasing On/Off (Boolean-Gadget)
     dc.l gadg34        ;tex33 muﬂ wieder umgeschaltet werden!!!
     dc.w 349,206,138,14,0,3,1
     dc.l bord33,0,tex33_1,0,0
     dc.w 33
     dc.l 0
bord33:
     dc.w 0,0
     dc.b 3,3,0,5
     dc.l kor33,0
kor33:
     dc.w -1,-1,138,-1,138,14,-1,14,-1,-1
tex33:
     dc.b 1,0,1,0
     dc.w 5,3
     dc.l 0,stex33,0
stex33:
     dc.b "   Phasing On ",0
   even
tex33_1:
     dc.b 1,0,1,0
     dc.w 1,3
     dc.l 0,stex33_1,0
stex33_1:
     dc.b "   Phasing Off",0

   even
gadg34:                  ;1. zu spielender Ton
     dc.l gadg35
     dc.w 540,148,32,10,0,3,4
     dc.l bord34,0,tex34,0,sinfo34
     dc.w 34
     dc.l 0
bord34:
     dc.w 0,0
     dc.b 3,3,0,5
     dc.l kor34,0
kor34:
     dc.w -2*8-3,-2,4*8+1,-2,4*8+1,9,-2*8-3,9,-2*8-3,-2
sinfo34:
     dc.l strpuff34,un34
     dc.w 0,4,0,0,0,0,0,0
     dc.l 0,0,0
strpuff34:
     dc.b "c2",0,0
un34:
     dc.b 0,0,0,0
tex34:
     dc.b 2,1,1,0
     dc.w -2*8,0
     dc.l 0,stex34,0
stex34:
     dc.b "1.",0

   even
gadg35:                  ;2. zu spielender Ton
     dc.l gadg36
     dc.w 540,165,32,10,0,3,4
     dc.l bord34,0,tex35,0,sinfo35
     dc.w 35
     dc.l 0
sinfo35:
     dc.l strpuff35,un35
     dc.w 0,4,0,0,0,0,0,0
     dc.l 0,0,0
strpuff35:
     dc.b "c3",0,0
un35:
     dc.b 0,0,0,0
tex35:
     dc.b 2,1,1,0
     dc.w -2*8,0
     dc.l 0,stex35,0
stex35:
     dc.b "2.",0

   even
gadg36:                 ;L‰nge der 1. Note
     dc.l gadg37
     dc.w 588,148,32,10,0,$803,4
     dc.l bord36,0,0,0,sinfo36
     dc.w 36
     dc.l 0
sinfo36:
     dc.l strpuff36,un36
     dc.w 0,4,0,0,0,0,0,0
     dc.l 0,50,0
strpuff36:
     dc.b "50",0,0
     dc.l 0,0,0
un36:
     dc.l 0,0,0,0
bord36:
     dc.w 0,0
     dc.b 3,3,0,5
     dc.l kor36,0
kor36:
     dc.w -3,-2,4*8+1,-2,4*8+1,9,-3,9,-3,-2

   even
gadg37:                 ;L‰nge der 2. Note
     dc.l gadg38
     dc.w 588,165,32,10,0,$803,4
     dc.l bord36,0,0,0,sinfo37
     dc.w 37
     dc.l 0
sinfo37:
     dc.l strpuff37,un37
     dc.w 0,4,0,0,0,0,0,0
     dc.l 0,50,0
strpuff37:
     dc.b "50",0,0
     dc.l 0,0,0
un37:
     dc.l 0,0,0,0

   even
gadg38:                 ;Start (Boolean-Gadget)
     dc.l gadg39
     dc.w 522,183,59,14,0,3,1
     dc.l bord38,0,tex38,0,0
     dc.w 38
     dc.l 0
bord38:
     dc.w 0,0
     dc.b 3,3,0,5
     dc.l kor38,bord38_1
kor38:
     dc.w -1,-1,59,-1,59,14,-1,14,-1,-1
tex38:
     dc.b 1,0,1,0
     dc.w 9,3
     dc.l 0,stex38,0
stex38:
     dc.b "Start",0
   even
bord38_1:
     dc.w 0,0
     dc.b 3,3,0,5
     dc.l kor38_1,0
kor38_1:
     dc.w -10,-41,111,-41,111,41,-10,41,-10,-41

   even
gadg39:                 ;Stop (Boolean-Gadget)
     dc.l gadg40
     dc.w 522,206,59,14,0,3,1
     dc.l bord39,0,tex39,0,0
     dc.w 39
     dc.l 0
tex39:
     dc.b 1,0,1,0
     dc.w 5,3
     dc.l 0,stex39,0
stex39:
     dc.b " Stop",0
   even
bord39:
     dc.w 0,0
     dc.b 3,3,0,5
     dc.l kor39,0
kor39:
     dc.w -1,-1,59,-1,59,14,-1,14,-1,-1

   even
gadg40:                 ;Loop On/Off (Boolean-Gadget)
     dc.l gadg41        ;tex40 muﬂ wieder umgeschaltet werden!!!
     dc.w 338,4,48,24,0,3,1
     dc.l bord40,0,tex40_1,0,0
     dc.w 40
     dc.l 0
bord40:
     dc.w 0,0
     dc.b 3,3,0,5
     dc.l kor40,0
kor40:
     dc.w -1,-1,48,-1,48,24,-1,24,-1,-1
tex40_a:
     dc.b 1,0,1,0
     dc.w 1,3
     dc.l 0,stex40_a,0
stex40_a:
     dc.b " Loop",0
   even
tex40:
     dc.b 1,0,1,0
     dc.w 1,14
     dc.l 0,stex40,tex40_a
stex40:
     dc.b "  On ",0
   even
tex40_1:
     dc.b 1,0,1,0
     dc.w 5,14
     dc.l 0,stex40_1,tex40_a
stex40_1:
     dc.b " Off",0

   even
gadg41:                 ;Load Instr. (Boolean-Gadget)
     dc.l gadg42
     dc.w 7,229,96,12,0,3,1
     dc.l bord41,0,tex41,0,0
     dc.w 41
     dc.l 0
tex41:
     dc.b 1,0,1,0
     dc.w 5,3
     dc.l 0,stex41,0
stex41:
     dc.b "LOAD Instr.",0
   even
bord41:
     dc.w 0,0
     dc.b 3,3,0,5
     dc.l kor41,bord41_1
kor41:
     dc.w -1,-1,96,-1,96,12,-1,12,-1,-1
bord41_1:
     dc.w 0,0
     dc.b 3,3,0,5
     dc.l kor41_1,0
kor41_1:
     dc.w 0,0,95,0,95,11,0,11,0,0

   even
gadg42:                 ;Load Sample (Boolean-Gadget)
     dc.l gadg43
     dc.w 120,229,96,12,0,3,1
     dc.l bord41,0,tex42,0,0
     dc.w 42
     dc.l 0
tex42:
     dc.b 1,0,1,0
     dc.w 5,3
     dc.l 0,stex42,0
stex42:
     dc.b "LOAD Sample",0

   even
gadg43:                 ;Load IFF (Boolean-Gadget)
     dc.l gadg44
     dc.w 233,229,96,12,0,3,1
     dc.l bord41,0,tex43,0,0
     dc.w 43
     dc.l 0
tex43:
     dc.b 1,0,1,0
     dc.w 1,3
     dc.l 0,stex43,0
stex43:
     dc.b "  LOAD IFF",0

   even
gadg44:                 ;SAVE Instr. (Boolean-Gadget)
     dc.l gadg45
     dc.w 346,229,96,12,0,3,1
     dc.l bord41,0,tex44,0,0
     dc.w 44
     dc.l 0
tex44:
     dc.b 1,0,1,0
     dc.w 5,3
     dc.l 0,stex44,0
stex44:
     dc.b "SAVE Instr.",0

   even
gadg45:                 ;Quit (Boolean-Gadget)
     dc.l gadg46
     dc.w 537,229,96,12,0,3,1
     dc.l bord41,0,tex45,0,0
     dc.w 45
     dc.l 0
tex45:
     dc.b 1,0,1,0
     dc.w 7,3
     dc.l 0,stex45,0
stex45:
     dc.b "   QUIT",0

   even
gadg46:                 ;Loop-point start
     dc.l gadg47
     dc.w 422,5,48,10,0,$803,4
     dc.l bord46,0,tex46,0,sinfo46
     dc.w 46
     dc.l 0
sinfo46:
     dc.l strpuff46,un46
     dc.w 0,6,0,0,0,0,0,0
     dc.l 0,0,0
strpuff46:
     dc.b "0",0,0,0
     dc.l 0,0,0
un46:
     dc.l 0,0,0,0
bord46:
     dc.w 0,0
     dc.b 3,3,0,5
     dc.l kor46,0
kor46:
     dc.w -3*8-3,-2,6*8+1,-2,6*8+1,9,-3*8-3,9,-3*8-3,-2
tex46:
     dc.b 2,1,1,0
     dc.w -3*8,0
     dc.l 0,stex46,0
stex46:
     dc.b "LS:",0

   even
gadg47:                 ;Loop-point end
     dc.l gadg48
     dc.w 422,19,48,10,0,$803,4
     dc.l bord47,0,tex47,0,sinfo47
     dc.w 47
     dc.l 0
bord47:
     dc.w 0,0
     dc.b 3,3,0,5
     dc.l kor46,bord48
sinfo47:
     dc.l strpuff47,un47
     dc.w 0,6,0,0,0,0,0,0
     dc.l 0,0,0
strpuff47:
     dc.b "0",0,0,0
     dc.l 0,0,0
un47:
     dc.l 0,0,0,0
tex47:
     dc.b 2,1,1,0
     dc.w -3*8,0
     dc.l 0,stex47,0
stex47:
     dc.b "LE:",0

   even
gadg48:                 ;Sinusschwingung erzeugen
     dc.l gadg49
     dc.w 521,4,28,10,4,3,1
     dc.l image3,0,0,0,0
     dc.w 48
     dc.l 0
bord48:
     dc.w 101,-14
     dc.b 3,3,0,5
     dc.l kor48,bord49
kor48:
     dc.w -3,-2,3*8+2,-2,3*8+2,9,-3,9,-3,-2
bord49:
     dc.w 101,0
     dc.b 3,3,0,5
     dc.l kor48,bord50
bord50:
     dc.w 143,-14
     dc.b 3,3,0,5
     dc.l kor48,bord51
bord51:
     dc.w 143,0
     dc.b 3,3,0,5
     dc.l kor48,bord52
bord52:
     dc.w 185,-14
     dc.b 3,3,0,5
     dc.l kor48,bord53
bord53:
     dc.w 185,0
     dc.b 3,3,0,5
     dc.l kor48,0
image3:
     dc.w 2,1
     dc.w 24,8
     dc.w 1
img3:
     dc.l imgdata3
     dc.b 1,1
     dc.l 0

   even
gadg49:                 ;Dreieckschwingung erzeugen
     dc.l gadg50
     dc.w 521,18,28,10,4,3,1
     dc.l image4,0,0,0,0
     dc.w 49
     dc.l 0
image4:
     dc.w 2,1
     dc.w 24,8
     dc.w 1
img4:
     dc.l imgdata4
     dc.b 1,1
     dc.l 0

   even
gadg50:                 ;Rechteckschwingung erzeugen
     dc.l gadg51
     dc.w 563,4,28,10,4,3,1
     dc.l image5,0,0,0,0
     dc.w 50
     dc.l 0
image5:
     dc.w 2,1
     dc.w 24,8
     dc.w 1
img5:
     dc.l imgdata5
     dc.b 1,1
     dc.l 0

   even
gadg51:                 ;S‰gezahnschwingung erzeugen
     dc.l gadg52
     dc.w 563,18,28,10,4,3,1
     dc.l image6,0,0,0,0
     dc.w 51
     dc.l 0
image6:
     dc.w 2,1
     dc.w 24,8
     dc.w 1
img6:
     dc.l imgdata6
     dc.b 1,1
     dc.l 0

   even
gadg52:                 ;Freihandschwingung erzeugen
     dc.l gadg53
     dc.w 605,4,28,10,4,$103,1
     dc.l image7,0,0,0,0
     dc.w 52
     dc.l 0
image7:
     dc.w 2,1
     dc.w 24,8
     dc.w 1
img7:
     dc.l imgdata7
     dc.b 1,1
     dc.l 0

   even
gadg53:                 ;Schwingung komprimieren
     dc.l gadg54
     dc.w 605,18,28,10,4,3,1
     dc.l image8,0,0,0,0
     dc.w 53
     dc.l 0
image8:
     dc.w 2,1
     dc.w 24,8
     dc.w 1
img8:
     dc.l imgdata8
     dc.b 1,1
     dc.l 0

   even
gadg54:                 ;Play (Boolean-Gadget)
     dc.l gadg55
     dc.w 590,183,31,37,0,3,1
     dc.l bord54,0,tex54,0,0
     dc.w 54
     dc.l 0
bord54:
     dc.w 0,0
     dc.b 3,3,0,5
     dc.l kor54,0
kor54:
     dc.w -1,-1,31,-1,31,37,-1,37,-1,-1
tex54:
     dc.b 1,0,1,0
     dc.w 12,2
     dc.l 0,stex54,tex54_1
stex54:
     dc.b "P",0
tex54_1:
     dc.b 1,0,1,0
     dc.w 11,11
     dc.l 0,stex54_1,tex54_2
stex54_1:
     dc.b "l",0
tex54_2:
     dc.b 1,0,1,0
     dc.w 11,19
     dc.l 0,stex54_2,tex54_3
stex54_2:
     dc.b "a",0
tex54_3:
     dc.b 1,0,1,0
     dc.w 12,27
     dc.l 0,stex54_3,0
stex54_3:
     dc.b "y",0

   even
gadg55:                 ;LED On/Off (Boolean-Gadget)
     dc.l 0 ;gadg56     ;tex40 muﬂ wieder umgeschaltet werden!!!
     dc.w 480,4,32,24,0,3,1
     dc.l bord55,0,tex55_1,0,0
     dc.w 55
     dc.l 0
bord55:
     dc.w 0,0
     dc.b 3,3,0,5
     dc.l kor55,0
kor55:
     dc.w -1,-1,32,-1,32,24,-1,24,-1,-1
tex55_a:
     dc.b 1,0,1,0
     dc.w 5,3
     dc.l 0,stex55_a,0
stex55_a:
     dc.b "LED",0
   even
tex55:
     dc.b 1,0,1,0
     dc.w 0,14
     dc.l 0,stex55,tex55_a
stex55:
     dc.b " On ",0
   even
tex55_1:
     dc.b 1,0,1,0
     dc.w 5,14
     dc.l 0,stex55_1,tex55_a
stex55_1:
     dc.b "Off",0
   even
