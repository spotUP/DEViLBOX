
#
#  To compile enter 'lmk repexe' on command line
#

#
#  oma is the assembler of the OMA assembler package. Replace it with
#  another metacomco compatible assembler, if you don't own oma-ass.
#
repobj.o : repobj.asm
   oma -o repobj.o repobj.asm

repexe : repobj.o
   lc -L repexe.c

