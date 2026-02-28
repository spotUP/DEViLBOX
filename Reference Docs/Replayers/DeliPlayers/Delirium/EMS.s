
	incdir	"Includes:"
	include	"misc/DeliPlayer.i"

;
;
	SECTION Player,Code
;
;

	PLAYERHEADER PlayerTagArray

	dc.b '$VER: Editeur Musical Séquentiel 1.22 player module V1.0 (10 Aug 92)',0
	even

PlayerTagArray
	dc.l	DTP_PlayerVersion,1
	dc.l	DTP_PlayerName,PName
	dc.l	DTP_Creator,CName
	dc.l	DTP_Check2,Chk
	dc.l	DTP_Interrupt,ems_music
	dc.l	DTP_InitPlayer,InitPlay
	dc.l	DTP_EndPlayer,EndPlay
	dc.l	DTP_InitSound,InitSnd
	dc.l	DTP_EndSound,EndSnd
	dc.l	TAG_DONE

*-----------------------------------------------------------------------*
;
; Player/Creatorname und lokale Daten

PName		dc.b 'EMS',0
CName		dc.b 'by Thomas Pimmel ©Ringard'' Production,',10
		dc.b 'adapted by Delirium',0
	even

*-----------------------------------------------------------------------*
;
; Testet auf EMS-Modul

Chk
	move.l	dtg_ChkData(a5),a0

	move.w	4(a0),d2			; #pattern
	beq.s	ChkFail
	mulu	#1024,d2
	addi.l	#$538,d2

	lea	134(a0),a0
	moveq	#14,d0
ChkLoop
	moveq	#0,d1
	move.w	len(a0),d1
	add.l	d1,d1
	add.l	d1,d2
	lea	12(a0),a0
	dbra	d0,ChkLoop

	sub.l	dtg_ChkSize(a5),d2		; test size of module
	cmpi.l	#-64,d2				; - 64 Bytes
	blt.s	ChkFail				; too small
	cmpi.l	#+64,d2				; + 64 Bytes
	bgt.s	ChkFail				; too big

	moveq	#0,d0				; Modul erkannt
	bra.s	ChkEnd
ChkFail
	moveq	#-1,d0				; Modul nicht erkannt
ChkEnd
	rts

*-----------------------------------------------------------------------*
;
; Init Player

InitPlay
	moveq	#0,d0
	move.l	dtg_GetListData(a5),a0		; Function
	jsr	(a0)
	move.l	a0,ems_raw

	move.l	dtg_AudioAlloc(a5),a0		; Function
	jsr	(a0)				; returncode is already set !
	rts

*-----------------------------------------------------------------------*
;
; End Player

EndPlay
	move.l	dtg_AudioFree(a5),a0		; Function
	jsr	(a0)
	rts

*-----------------------------------------------------------------------*
;
; Init Module

InitSnd
	bsr	ems_init
	rts

*-----------------------------------------------------------------------*
;
; Clean up Module

EndSnd
	moveq	#0,d0
	lea	$dff000,a0
	move.w	d0,$a8(a0)
	move.w	d0,$b8(a0)
	move.w	d0,$c8(a0)
	move.w	d0,$d8(a0)
	move.w	#$f,$96(a0)
	rts

*-----------------------------------------------------------------------*
;
; Editeur Musical Séquentiel V1.22 - Replay

;--------EMS Fast replay V1.22
;--------Thomas Pimmel 11/02/91
;--------©Ringard' Production 1991
;--------Pour devpac 2, facile à adapter à un autre asm. (sauf seka)

;Routine destinée à prendre place dans votre source...
;Voilà une version optimisée de la routine de EMSPlayer.asm
;D'après mes calculs elle est plus rapide que les versions
;équivalentes sur SoundTracker
;car : 1 pas de recherche de la plus grd partition (c'est dans le format)
;et surtout : 2 l'initialisation du DMA ce fait
;étalé dans le temps, sur 2/50 de secondes
;premier temps, on recherche les voies DMA à couper, c'est
;indispensable de le faire le plus rapidement possible.
;Ensuite on documente les variables EMS_SON0/1/2/3
;on y sauve le repeat, len, replen, addrs, vol.
;On passe ensuite aux commandes (très rapide)
;Enfin on initialise les canaux dma
;on attend le balayage suivant pour mettre en place la répétition
;d'un son -> vitesse limitée à 1. Ce n'est pas vraiement une
;contrainte.
;Attention, cette routine a été optimisée au niveau de la structure
;et de son organisation dans le temps.
;Elle peut l'être encore, au niveau des instructions.
;Mais n'oubliez pas : cette routine doit tourner sur toutes
;les machines (pas de temporisations par boucle (beurk))
;J'ai préféré ne pas trop la rendre illisible par
;un max de lea	-$145(a0,d0.w),-(a7)+ (?(c'est la pré-post-incrédémentation))
;Si dans un jeu, une démo... vous voulez disposer d'une voie pour
;les effets spéciaux il suffit de remplacer les moveq	#3,dn
;par moveq	#2,dn.
;Une dernière chose, la longueur en temps prise par une routine
;de musique EST LE TEMPS MAXIMUM PRIS PAR ELLE AU LONG
;de votre jeu, démo etc... Ainsi il est quasi inutile
;de l'optimiser, par exemple en dressant un pointeur sur la
;musique au lieu du fastidieux calcul de l'offset de la séquence
;car de toute façon lors d'un appel suivant il faudra le faire
;et le temps qu'il restera à votre prog. principal diminuera.
;Je ne sais pas si j'étais clair (il se fait tard).
;Les noms de labels commencent tous par EMS_
;c'est une reprise des sources soundtrackers, car c'est
;très pratique.
;L'adresse de la musique est contenue dans une variable
;(ems_raw) car c'est plus pratique dans le cas ou vous maniez
;plusieurs musiques.
;******
;La seule optimisation réelle que je voudrais faire
;est celle qui consisterait à appeler les différentes
;routines par interruptions du copper. Ouaih, mais
;ça ne donnerait pas une routine simple à interfacer
;avec votre prog.
;Vraiement je suis bavard, mais un dernier conseil important
;ou plutôt deux : si vous faites un effet de fade-in ou out
;(je ne sais si ça ce dit pour le son), c'est à dire que
;vous faites diminuer progressivement le son de toute la
;musique, pensez à règler le volume AVANT de lancer le son
;suivant, sinon vous aurez un claquement dans vos bafffles.
;Je viens d'écouter la Coma demo des Rebels (géniale par ailleurs)
;qui souffre justement de ce problème.
;C'est d'ailleurs pour cette raison que les commandes sont
;executées entre la coupure des canaux DMA et leur lancement.
;Deux sous-prog (voir EMSPlayer.asm)
;EMS_INIT à appeler en 1er
;Tous les 1/50èmes de seconde EMS_MUSIC
;------------------------Good luck, comme disent nos frères anglophiles
;-----------------------------------------------Tom von Ringard'
;--offset dma
c_per = 6
c_len = 4
c_vol = 8
;--offset ems
per = 12
len = 4
rep = 6
replen = 8
vol = 10
	;--init morceau
ems_init
	move.w	#$f,$dff096		;couper son
	move.w	#6,ems_reset
	clr.w	ems_ligne		;ligne 0
	clr.w	ems_posi		;position 0
	move.w	ems_reset,ems_count	;init compteur
	move.l	ems_raw,a0
	move.w	2(a0),ems_length
	;+ grande partition
	moveq	#0,d1
	move.w	4(a0),d1
	;--trouver les sons
	move.l	a0,d0			;début musique
	add.l	#$538,d0		;début partitions
	lsl.l	#5,d1
	lsl.l	#5,d1
	add.l	d1,d0			;début sons
	moveq	#14,d3			;15 sons
	lea	134(a0),a0
.loop	;mettre adresse des sons dans table
	moveq	#0,d1
	move.w	len(a0),d1
	tst.w	d1
	beq.s	.jmp			;pas de son
	move.l	d0,a1
	clr.w	(a1)			;pour repeat
	move.l	d0,(a0)
	lsl.l	#1,d1
	add.l	d1,d0
.jmp
	lea	12(a0),a0		;son suivant
	dbf	d3,.loop
	;--val première partition
	move.l	ems_raw,a0
	moveq	#0,d0
	move.b	6(a0),d0
	move.w	d0,ems_part
	;--tout est bien
	rts
	;-------------interruption
ems_music
	movem.l	d0-7/a0-6,-(a7)
	bsr.s	ems_play
	movem.l	(a7)+,d0-7/a0-6
	rts
ems_play
	move.w	ems_count,d0
	tst.w	d0
	beq.s	ems_playseq
	cmp.w	ems_reset,d0
	beq	ems_repeat	;faire répétition des sons
ems_retrepeat			;addrs de retour
	subq.w	#1,ems_count
	bra	ems_makvib	;commande au 1/50ème et rts
ems_playseq
	;--effacer le signal
	lea	ems_vibrato,a0
	clr.w	(a0)
	clr.w	4(a0)
	clr.w	8(a0)
	clr.w	12(a0)
	;---jouer sequence
	move.l	ems_raw,a5		;partition
	lea	$13A(a5),a5
	moveq	#0,d0
	move.w	ems_part,d0
	lsl.l	#5,d0
	lsl.l	#5,d0
	move.w	ems_ligne,d1
	lsl.w	#4,d1
	add.l	d0,a5
	add.w	d1,a5			;ligne à jouer en a0
	;---tester les voies à couper
	clr.w	ems_dmacon		;init dmacon
	;-en a0 ligne à jouer
	lea	ems_table,a1
	moveq	#3,d3			;nb canaux
	moveq	#0,d0			;offset
	moveq	#1,d2			;dmacon
	;--chercher canaux à éteindre
ems_close
	move.b	2(a5,d0.w),d1		;num du son
	lsr.b	#4,d1			;correction
	move.b	d1,(a1)+		;valeur son en table
	tst.b	d1			;nul ?
	beq.s	ems_sndchg		;change pas de son
	or.w	d2,ems_dmacon		;changer dmacon
ems_sndchg
	lsl.w	#1,d2			;canal dmacon suivant
	addq.w	#4,d0			;offset suivant
	dbf	d3,ems_close
	move.w	ems_dmacon,$dff096	;couper
	or.w	#$8000,ems_dmacon
	;----attendre
;	bsr	ems_initsuite
	;---période, tt_son et volume + commandes
	lea	$dff0a0,a0		;canal dma son
	lea	ems_table,a1		;num sons
	lea	ems_son0,a2		;table des sons
	lea	ems_exe,a4		;commandes
	moveq	#3,d3	;*4
	moveq	#0,d0
	;période
ems_loop
	tst.w	(a5)			;tst période
	beq.s	ems_pnul
	move.w	(a5),c_per(a0)		;changer période
	move.w	(a5),per(a2)		;mémoriser
ems_pnul
	tst.w	(a5)+
	;addrs à zéro
	clr.l	(a2)
	;numéro son
	moveq	#0,d0
	move.b	(a1)+,d0
	tst.b	d0
	beq.s	ems_nosample		;pas de son
	;les sons
	move.l	ems_raw,a3		;la table des sons
	lea	134(a3),a3
	subq.w	#1,d0			;base 0
	mulu	#12,d0			;offset
	add.l	d0,a3			;en a3 le son
	move.l	(a3),(a2)		;addrs
	move.l	len(a3),len(a2)		;longueur + repeat
	move.l	replen(a3),replen(a2)	;relen + vol
	move.w	vol(a3),c_vol(a0)	;volume dma
ems_nosample
	add.w	#$10,a0			;dma suivant
	add.w	#14,a2			;mémorise son suivant 
	move.w	(a5)+,(a4)+		;jmp commandes&mémorise
	dbra	d3,ems_loop
	;commandes
	bsr	ems_com
	;--mettre en place les sons
	moveq	#3,d3
	lea	$dff0a0,a0
	lea	ems_son0,a1
ems_sloop
	move.l	(a1),d0
	tst.l	d0
	beq.s	ems_nosnd
	move.l	d0,(a0)
	move.w	len(a1),c_len(a0)
ems_nosnd
	add.w	#$10,a0
	add.w	#14,a1
	dbf	d3,ems_sloop
	bsr	ems_waitsuite		;attendre canal ok
	move.w	ems_dmacon,$dff096	;run
	tst.w	ems_break
	bne.s	.jmp2
	;--incrementer
	move.w	ems_ligne,d0
	addq.w	#1,d0
	cmp.w	#63,d0		;overflow?
	bls.s	.jmp
	;--changer de partition
	bsr.s	ems_changepart
.jmp
	move.w	d0,ems_ligne
.jmp2
	clr.w	ems_break
	move.w	ems_reset,ems_count
	rts
;effectuer les répétitions des sons
ems_repeat
	moveq	#3,d3
	lea	$dff0a0,a0
	lea	ems_son0,a1
ems_sloop2
	move.l	(a1),d0
	tst.l	d0
	beq.s	ems_nosnd2
	moveq	#0,d1
	move.w	rep(a1),d1
	lsl.l	#1,d1
	add.l	d1,d0
	move.l	d0,(a0)
	move.w	replen(a1),c_len(a0)
ems_nosnd2
	add.w	#$10,a0
	add.w	#14,a1
	dbf	d3,ems_sloop2
	bra	ems_retrepeat
;---changer de partition
ems_changepart
	moveq	#0,d1
	move.w	ems_posi,d1
	addq.w	#1,d1
	move.w	ems_length,d2
	cmp.w	d1,d2
	bhi.s	ems_continu
	moveq	#0,d1		;position 0
ems_continu
	moveq	#0,d0		;ligne 0
	move.w	d1,ems_posi
	move.l	ems_raw,a0
	addq.l	#6,a0
	moveq	#0,d2
	move.b	(a0,d1.w),d2
	move.w	d2,ems_part
	rts
;---executes les commandes
ems_com
	lea	$dff0a0,a1
	lea	ems_son0,a2
	lea	ems_vibrato,a3
	lea	ems_exe,a4
	moveq	#3,d7
ems_comloop
	move.b	(a4),d0
	and.b	#$f,d0		;isole commande
	tst.b	d0
	beq.s	ems_no
	moveq	#0,d1
	move.b	1(a4),d1
	cmp.b	#7,d0
	beq.s	ems_vibra
	cmp.b	#8,d0
	beq.s	ems_cbreak
	cmp.b	#9,d0
	beq.s	ems_cspeed
	cmp.b	#$a,d0
	beq.s	ems_cled
	cmp.b	#$b,d0
	beq.s	ems_vibra
	cmp.b	#$c,d0
	beq.s	ems_vibra
	cmp.b	#$d,d0
	beq.s	ems_vibra
	cmp.b	#$e,d0
	beq.s	ems_cvol
	cmp.b	#$f,d0
	beq.s	ems_crep
ems_no
	addq.w	#2,a4
	add.w	#$10,a1
	add.w	#14,a2
	addq.w	#4,a3
	dbf	d7,ems_comloop
	rts
;--commandes
ems_cbreak	;break partition
	move.w	d1,ems_ligne
	bsr	ems_changepart
	move.w	#1,ems_break
	bra.s	ems_no
ems_cspeed
	move.w	d1,ems_reset
	bra.s	ems_no
ems_cvol
	move.w	d1,c_vol(a1)
	move.w	d1,vol(a2)
	bra.s	ems_no
ems_vibra
	move.w	d0,(a3)		;commande
	move.w	d1,2(a3)
	bra.s	ems_no
ems_cled
	tst.b	d1
	bne.s	ems_ledon
	bclr	#1,$bfe001
	bra.s	ems_no
ems_ledon
	bset	#1,$bfe001
	bra.s	ems_no
ems_crep	;faire une répétition
	move.w	len(a2),replen(a2)
	bra.s	ems_no
;----------gestion vibrato
ems_makvib
	lea	$dff0a0,a0
	lea	ems_vibrato,a1
	lea	ems_son0,a2
	moveq	#3,d0
.loop
	tst.w	(a1)
	beq.s	.suite
	;--prep com
	move.w	2(a1),d1	;args
	move.w	per(a2),d3
	;--what com
	move.w	(a1),d2		;com
	cmp.b	#7,d2
	beq.s	.voldown
	cmp.b	#$c,d2		;vibrato
	beq.s	.up
	cmp.b	#$b,d2		;up
	beq.s	.down
	*****vibrato**********
.vib
	move.w	ems_count,d2
	btst	#0,d2
	bne.s	.vm
	add.w	d1,d3
	bra.s	.jmp
.vm
	sub.w	d1,d3
	bra.s	.jmp
	*****up&down**********
.down
	sub.w	d1,d3
	bra.s	.jmpdown
.up
	add.w	d1,d3
.jmpdown
	*****control**********
	cmp.w	#$6b0,d3
	bhi.s	.suite
	cmp.w	#$70,d3
	bls.s	.suite
	move.w	d3,per(a2)
	*****partie commune***
.jmp
	move.w	d3,c_per(a0)
.suite
	add.w	#$10,a0
	add.w	#14,a2
	tst.l	(a1)+
	dbf	d0,.loop
	rts
	;volume down
.voldown
	move.w	vol(a2),d3
	sub.w	d1,d3
	bgt.s	.ok
	moveq	#0,d3
.ok
	move.w	d3,vol(a2)
	move.w	d3,c_vol(a0)
	bra.s	.suite
;--gèrer temporisation
ems_initsuite	;valeur ligne en mem
;	move.b	$dff006,d6
;	addq.b	#4,d6		;règlez cette valeur en fonction
;	;de votre musique. Cette routine gère l'attente du DMA
;	;c'est à dire le temps entre le lancement d'une commande
;	;et la prise en compte de celle-ci par le dma.
;	;attention, NE LANCEZ cette routine que lorsque le raster
;	;est haut (rast<200), sinon boom!
;	move.w	d6,ems_oldligne
;	rts
ems_waitsuite
;	move.w	ems_oldligne,d6
;b_cmp
;	move.b	$dff006,d5
;	cmp.b	d6,d5
;	bls.s	b_cmp
;	rts

	moveq	#4,d6
b_get
	move.b	$dff006,d5
b_cmp
	cmp.b	$dff006,d5
	beq.s	b_cmp
	dbf	d6,b_get
	rts

	section	var,data

ems_vibsignal	dc.w	0
ems_vibrato	dc.l	0,0,0,0
ems_break	dc.w	0
ems_count	dc.w	0
ems_ligne	dc.w	0	;ligne jouée
ems_part	dc.w	0	;partition jouée
ems_posi	dc.w	0	;position sequence
ems_length	dc.w	0	;longueur musique
ems_reset	dc.w	0
ems_table	dc.l	0	;valeur des sons
ems_sample	dc.l	0	;*sample
ems_dmacon	dc.w	0
ems_son0	dc.l	0	;addrs son canal 0
		dc.w	0	;longueur
		dc.w	0	;repeat
		dc.w	0	;replen
		dc.w	0	;volume
		dc.w	0	;periode
ems_son1	dcb.w	7	;idem canal1
ems_son2	dcb.w	7	;canal 2
ems_son3	dcb.w	7	;canal 3
ems_exe		dc.l	0,0,0,0
ems_oldligne	dc.l	0
ems_raw		dc.l	0	;adddrs du format musique&son brut

