>extern 'df0:sidtune',Musa

Musa=$40000

Start:
move.l	#Fun,$80.w
trap	#0
clr.l	d0
rts

Fun:
jsr	Musa

play:
cmp.b	#$ff,$dff006
bne	play
jsr	Musa+$13e
btst	#6,$bfe001
bne	play
move.w	#$f,$dff096
move	#$2000,sr
rte
