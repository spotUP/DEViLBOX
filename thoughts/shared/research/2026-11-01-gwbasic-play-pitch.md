# GW-BASIC PLAY pitch (primary: https://github.com/microsoft/GW-BASIC , GWSTS.ASM)
Table NOTTAB (GWSTS.ASM ~L620): "THESE ARE THE FREQUENCIES IN HERTZ OF THE TOP OCTAVE (6) DIVIDED DOWN BY POWERS OF TWO": C=4186 C#=4435 D=4699 D#=4978 E=5274 F=5588 F#=5920 G=6272 G#=6645 A=7040 A#=7459 B=7902.
Code: "MOV CL,6 / SUB CL,DH / SHR BX,CL ;DIVIDE BY 2^(6-OCTAVE) / ADC BX,0 ;ROUND UP". Octaves 0..6 ("ALLOW ONLY OCTAVES 0..6").
=> A440 = O2 A (7040/16). C: O0 65.4, O1 130.8, O2 261.6, O3 523.3, O4 1046.5 (integer 1047), O5 2093, O6 4186. SAME as CTerm.
N: "ALLOW ONLY 0..84"; N0 = pause; N n -> (n-1) div 12 = octave, rem = note (N1 = C O0, N84 = B O6).
Meta: MSCALE L=1 (full), S=2 (3/4: "Stecatto (3/4)"), N=3 (7/8); duration*3 or *7 >>CL, remainder as pause.
Dots: PLYDOT loop, each '.' does "Duration = Duration * 1.5" and iterates => cumulative.
L 1..64, T 32..255, P 1..64.
