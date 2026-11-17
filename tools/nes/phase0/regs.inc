; w addr,val : one logged register write.
.macro w addr, val
  lda #val
  sta addr
.endmacro

; The known per-chip write sequence (also mirrored in expected-a.txt).
.macro chip_sequence
  ; 2A03
  w $4015,$0F
  w $4000,$BF
  w $4002,$A9
  w $4003,$F8
  w $4010,$4F
  w $4011,$20
  ; VRC6
  w $9000,$8F
  w $9001,$40
  w $9002,$80
  w $9003,$00
  w $A000,$8F
  w $A001,$40
  w $A002,$80
  w $B000,$2F
  w $B001,$40
  w $B002,$80
  ; VRC7 (address port $9010, data port $9030)
  w $9010,$01
  w $9030,$F0
  w $9010,$30
  w $9030,$55
  ; N163 (address port $F800, data port $4800)
  w $F800,$80
  w $4800,$11
  w $4800,$22
  ; FDS
  w $4023,$83
  w $4040,$3F
  w $4080,$80
  w $4082,$20
  w $4083,$00
  w $4089,$80
  w $408A,$20
  ; MMC5
  w $5000,$BF
  w $5002,$A9
  w $5003,$F8
  w $5010,$01
  w $5011,$40
  w $5015,$03
  ; Sunsoft 5B (command $C000, data $E000)
  w $C000,$07
  w $E000,$38
  w $C000,$08
  w $E000,$0F
  w $C000,$00
  w $E000,$A9
.endmacro
