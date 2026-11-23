; DEViLBOX native player screen (matches thoughts/shared/design/player-ui/player-screens.html, pce entry)
; 32x28 cells: logo/title rows 1-3, six VU bars rows 5-22, labels 23, time+song 24, scroll 26.
	.macro stxt
	  ldx	#\1
	  lda	#\2
	  jsr	s_at
	  lda	#\3
	  stw	#\4,<_si
	  jsr	s_puts
	.endm

	.proc s_screen
	  lda	s_mode
	  bne	.f
	  jmp	s_init
.f:	  jmp	s_frame

s_at:
	  stx	s_c
	  sta	s_t
	  lsr	A
	  lsr	A
	  lsr	A
	  sta	s_h
	  lda	s_t
	  and	#7
	  asl	A
	  asl	A
	  asl	A
	  asl	A
	  asl	A
	  ora	s_c
	  tax
	  lda	s_h
	  jmp	_put.vram

s_chr:
	  sec
	  sbc	#32
	  add	s_fb
	  sta	video_data_l
	  cla
	  adc	s_fbh
	  ora	s_pal
	  sta	video_data_h
	  rts

s_puts:
	  asl	A
	  asl	A
	  asl	A
	  asl	A
	  sta	s_pal
	  cly
.l:	  lda	[_si],y
	  beq	.d
	  phy
	  jsr	s_chr
	  ply
	  iny
	  bra	.l
.d:	  rts

s_emit:
	  cmp	#$FF
	  beq	.sp
	  add	s_cb
	  sta	video_data_l
	  cla
	  adc	s_cbh
	  ora	#$20
	  sta	video_data_h
	  rts
.sp:	  lda	s_fb
	  sta	video_data_l
	  lda	s_fbh
	  ora	#$20
	  sta	video_data_h
	  rts

s_two:
	  ldx	#0
.l:	  cmp	#10
	  bcc	.d
	  sbc	#10
	  inx
	  bra	.l
.d:	  pha
	  txa
	  add	#48
	  jsr	s_chr
	  pla
	  add	#48
	  jmp	s_chr

s_app:
	  cly
.l:	  lda	[_si],y
	  beq	.d
	  ldx	s_len
	  sta	s_msg,x
	  inc	s_len
	  iny
	  bra	.l
.d:	  rts

s_init:
	  lda	_font_base
	  sta	s_fb
	  lda	_font_base+1
	  and	#$0F
	  sta	s_fbh
	  lda	s_fb
	  add	#96
	  sta	s_cb
	  cla
	  adc	s_fbh
	  sta	s_cbh
	  ; palettes
	  cly
	  ldx	#0
.pl:	  tya
	  asl	A
	  asl	A
	  asl	A
	  asl	A
	  sta	color_reg
	  stz	color_reg+1
	  lda	#4
	  sta	s_c
.il:	  lda	s_paltab,x
	  sta	color_data_l
	  inx
	  lda	s_paltab,x
	  sta	color_data_h
	  inx
	  dec	s_c
	  bne	.il
	  iny
	  cpy	#6
	  bne	.pl
	  ; custom tiles
	  lda	s_cb
	  lsr	A
	  lsr	A
	  lsr	A
	  lsr	A
	  sta	s_t
	  lda	s_cbh
	  asl	A
	  asl	A
	  asl	A
	  asl	A
	  ora	s_t
	  sta	s_h
	  lda	s_cb
	  asl	A
	  asl	A
	  asl	A
	  asl	A
	  tax
	  lda	s_h
	  jsr	_put.vram
	  stw	#s_tiles,<_si
	  ldx	#2
.pg:	  cly
.tl:	  lda	[_si],y
	  sta	video_data_l
	  iny
	  lda	[_si],y
	  sta	video_data_h
	  iny
	  bne	.tl
	  inc	<_si+1
	  dex
	  bne	.pg
.t2:	  lda	[_si],y
	  sta	video_data_l
	  iny
	  lda	[_si],y
	  sta	video_data_h
	  iny
	  cpy	#64
	  bne	.t2
	  ; copy title and author out of the song bank
	  cly
.ct:	  lda	LL0,y
	  sta	s_title,y
	  beq	.cd
	  iny
	  cpy	#12
	  bne	.ct
	  cla
	  sta	s_title,y
.cd:	  cly
.ca:	  lda	LL0+13,y
	  sta	s_author,y
	  beq	.ad
	  iny
	  cpy	#11
	  bne	.ca
	  cla
	  sta	s_author,y
.ad:	  stz	s_len
	  stw	#s_title,<_si
	  jsr	s_app
	  stw	#s_by,<_si
	  jsr	s_app
	  stw	#s_author,<_si
	  jsr	s_app
	  stw	#s_sep,<_si
	  jsr	s_app
	  stz	s_sp
	  stz	s_sd
	  stz	s_f
	  stz	s_sec
	  stz	s_min
	  ldx	#5
.z:	  stz	s_lvl,x
	  stz	s_cap,x
	  stz	s_hold,x
	  dex
	  bpl	.z
	  ; static text
	  stxt	1,1,3,s_logo
	  stxt	10,1,0,s_title
	  stxt	10,2,1,s_by2
	  stxt	13,2,1,s_author
	  stxt	1,3,2,s_chip
	  stxt	22,3,1,s_plat
	  stxt	23,24,0,s_song
	  stz	s_i
.lb:	  lda	s_i
	  asl	A
	  asl	A
	  add	#5
	  tax
	  lda	#23
	  jsr	s_at
	  lda	#$10
	  sta	s_pal
	  lda	s_i
	  add	#49
	  jsr	s_chr
	  inc	s_i
	  lda	s_i
	  cmp	#6
	  bcc	.lb
	  rts

s_frame:
	  inc	s_f
	  lda	s_f
	  cmp	#60
	  bcc	.t1
	  stz	s_f
	  inc	s_sec
	  lda	s_sec
	  cmp	#60
	  bcc	.t1
	  stz	s_sec
	  inc	s_min
.t1:	  ldx	#5
.u:	  lda	_ch_lastvol,x
	  and	#31
	  sta	s_t
	  asl	A
	  asl	A
	  sta	s_t2
	  lda	s_t
	  lsr	A
	  add	s_t2
	  sta	s_tg
	  cmp	s_lvl,x
	  bcc	.fall
	  sta	s_lvl,x
	  bra	.cap
.fall:	  lda	s_lvl,x
	  sec
	  sbc	#4
	  bcs	.a
	  cla
.a:	  cmp	s_tg
	  bcs	.b
	  lda	s_tg
.b:	  sta	s_lvl,x
.cap:	  lda	s_lvl,x
	  cmp	s_cap,x
	  bcc	.nc
	  sta	s_cap,x
	  lda	#32
	  sta	s_hold,x
	  bra	.nx
.nc:	  lda	s_hold,x
	  beq	.fl
	  dec	s_hold,x
	  bra	.nx
.fl:	  lda	s_cap,x
	  beq	.nx
	  dec	s_cap,x
.nx:	  dex
	  bpl	.u
	  stz	s_i
.bar:	  lda	s_i
	  asl	A
	  asl	A
	  add	#4
	  sta	s_col
	  stz	s_r
.row:	  lda	#17
	  sec
	  sbc	s_r
	  sta	s_m
	  asl	A
	  asl	A
	  asl	A
	  sta	s_base
	  ldx	s_col
	  lda	s_r
	  add	#5
	  jsr	s_at
	  ldx	s_i
	  lda	s_lvl,x
	  sec
	  sbc	s_base
	  bcc	.em
	  beq	.em
	  cmp	#8
	  bcc	.pf
	  lda	#8
.pf:	  dec	A
	  sta	s_ka
	  add	#8
	  sta	s_kb
	  bra	.wr
.em:	  lda	s_cap,x
	  beq	.no
	  dec	A
	  lsr	A
	  lsr	A
	  lsr	A
	  cmp	s_m
	  bne	.no
	  lda	#16
	  sta	s_ka
	  lda	#17
	  sta	s_kb
	  bra	.wr
.no:	  lda	#$FF
	  sta	s_ka
	  sta	s_kb
.wr:	  lda	s_ka
	  jsr	s_emit
	  lda	s_ka
	  jsr	s_emit
	  lda	s_ka
	  jsr	s_emit
	  lda	s_kb
	  jsr	s_emit
	  inc	s_r
	  lda	s_r
	  cmp	#18
	  bcs	.rd
	  jmp	.row
.rd:	  inc	s_i
	  lda	s_i
	  cmp	#6
	  bcs	.bd
	  jmp	.bar
.bd:	  ldx	#1
	  lda	#24
	  jsr	s_at
	  lda	#$40
	  sta	s_pal
	  lda	#62
	  jsr	s_chr
	  lda	#32
	  jsr	s_chr
	  lda	s_min
	  jsr	s_two
	  lda	#58
	  jsr	s_chr
	  lda	s_sec
	  jsr	s_two
	  inc	s_sd
	  lda	s_sd
	  cmp	#6
	  bcc	.sk
	  stz	s_sd
	  inc	s_sp
	  lda	s_sp
	  cmp	s_len
	  bcc	.sk
	  stz	s_sp
.sk:	  ldx	#1
	  lda	#26
	  jsr	s_at
	  lda	#$10
	  sta	s_pal
	  ldy	s_sp
	  ldx	#30
.sc:	  lda	s_msg,y
	  jsr	s_chr
	  iny
	  cpy	s_len
	  bcc	.ok
	  cly
.ok:	  dex
	  bne	.sc
	  rts

s_logo:	.db "DEVILBOX",0
s_by:	.db " BY ",0
s_by2:	.db "BY",0
s_chip:	.db "HUC6280",0
s_plat:	.db "PC ENGINE",0
s_song:	.db "SONG 1/1",0
s_sep:	.db "   *** ",0
s_paltab:
	.dw $049,$1ff,$049,$049
	.dw $049,$124,$049,$049
	.dw $049,$138,$0a8,$18f
	.dw $049,$0ba,$049,$049
	.dw $049,$18f,$049,$049
	.dw $049,$049,$049,$049
s_tiles:
	.db 0,0,0,0,0,0,0,0,0,0,0,0,0,0,255,0
	.db 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
	.db 0,0,0,0,0,0,0,0,0,0,0,0,255,0,255,0
	.db 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
	.db 0,0,0,0,0,0,0,0,0,0,255,0,255,0,255,0
	.db 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
	.db 0,0,0,0,0,0,0,0,255,0,255,0,255,0,255,0
	.db 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
	.db 0,0,0,0,0,0,255,0,255,0,255,0,255,0,255,0
	.db 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
	.db 0,0,0,0,255,0,255,0,255,0,255,0,255,0,255,0
	.db 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
	.db 0,0,255,0,255,0,255,0,255,0,255,0,255,0,255,0
	.db 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
	.db 255,0,255,0,255,0,255,0,255,0,255,0,255,0,255,0
	.db 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
	.db 0,0,0,0,0,0,0,0,0,0,0,0,0,0,252,2
	.db 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
	.db 0,0,0,0,0,0,0,0,0,0,0,0,252,2,252,2
	.db 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
	.db 0,0,0,0,0,0,0,0,0,0,252,2,252,2,252,2
	.db 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
	.db 0,0,0,0,0,0,0,0,252,2,252,2,252,2,252,2
	.db 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
	.db 0,0,0,0,0,0,252,2,252,2,252,2,252,2,252,2
	.db 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
	.db 0,0,0,0,252,2,252,2,252,2,252,2,252,2,252,2
	.db 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
	.db 0,0,252,2,252,2,252,2,252,2,252,2,252,2,252,2
	.db 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
	.db 252,2,252,2,252,2,252,2,252,2,252,2,252,2,252,2
	.db 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
	.db 255,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0
	.db 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
	.db 254,254,254,254,0,0,0,0,0,0,0,0,0,0,0,0
	.db 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
	.endp
