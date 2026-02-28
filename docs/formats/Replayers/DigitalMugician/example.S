
* EXAMPLE SOURCE FOR MUGICIAN PLAYROUTINE

* RI MUGIPLAYER on $30000

* RI MUSICFILE on $30000+5878


main:


	move.l #$4e714e71,player+776	;these lines make sure
	move.l #$4e714e71,player+780	;that the playroutine
	move.l #$4e714e71,player+784	;doesn't use the
	move.w #$4e71,player+788	;vertical blank 
	move.l #$4e714e71,player+840	;interrupt anymore
	move.l #$4e714e71,player+844	;but can be controlled
	move.w	#$4e75,player+1172	;manually.


	moveq	#0,d0
	jsr	player+504		;initialize music #0


loop:
	cmp.b	#$ff,$dff006		;wait for raster $ff
	bne	loop

	jsr	player+862		;play 1 note

	btst	#6,$bfe001		;mouse button??
	bne	loop

	jsr	player+816		;music off
	rts

org	$30000
player:
