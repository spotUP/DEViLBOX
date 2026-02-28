REM  This small program demonstrates
REM  how to use "medplayer.library"
REM  with Basic.

REM  First copy "medplayer.bmap" from
REM  MEDPlayerLibrary-drawer to LIBS:


LIBRARY "medplayer.library"

DECLARE FUNCTION GetPlayer& LIBRARY
DECLARE FUNCTION LoadModule&() LIBRARY
DECLARE FUNCTION GetCurrentModule&() LIBRARY

DEFLNG md,sa

PRINT "medplayer.library demonstration"
INPUT "Enter module name";x$
x& = GetPlayer&(1)
IF x& = 0 THEN PRINT "Player allocated." ELSE PRINT "Failed."
a$ = x$+CHR$(0)
sa = SADD(a$)
md = LoadModule&(sa)
PRINT "module loaded, address = ";md
CALL PlayModule(md)
PRINT "Now playing, press any key to quit."
WHILE INKEY$="":WEND
CALL FreePlayer
CALL UnLoadModule(md)
PRINT "Bye!!"
END

