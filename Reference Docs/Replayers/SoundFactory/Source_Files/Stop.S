; Zum Anhalten eines Musikstückes vom CLI aus (Profiteam)
; © 1989 Profiteam   06.07.1989

run:
   move.l $6c,a0
   cmp.w #$4e71,(a0)
   bne.s nixaus
   move.b #10,d0
   jsr 374(a0)      ;374 =12+Folge1-IRQ (im Linker) =362+12
nixaus:
   clr.l d0
   rts
