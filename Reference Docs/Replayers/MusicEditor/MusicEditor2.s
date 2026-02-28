jsr str
;			PLAYER


;	 ce prog ne joue que des musiques PACKEES !!

;	 faire auparavant:
;	 ri  'nom de la musique PACKEE' en $3f8d4
********************************************
;	 la musique est relogeable : tu peux donc 
;	 faire un ri en $5f8d4 de la musik
;	 et ensuite modifier les 2 JSR ci-dessous
;	 qui deviendront: JSR $60000
;	 et JSR $60190

org $30000
load $30000
str:
        movem.l d0-d7/a0-a6,-(a7)

start1:	moveq #$00,d0			;no de la musique (0-6)
        jsr $40000			;initialise la musique
	movem.l (a7)+,d0-d7/a0-a6
        bsr wa

start2:
        moveq #$01,d0
        jsr $40000
        movem.l (a7)+,d0-d7/a0-a6
        bsr wa


wa:
	cmpi.b #$fe,$dff006
	bne wa
	jsr $40190			;joue 1 note de la musik
	btst #6,$bfe001
	bne start1
	btst #6,$bfd000
        bne start2
        move.w #$000f,$dff096
	
