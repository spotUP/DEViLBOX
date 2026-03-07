VBCC ?= /opt/amiga
VASM ?= $(VBCC)/bin/vasmm68k_mot

mline: Mline116.asm
	$(VASM) -m68000 -align -I. -Iinclude -Iraw -kick1hunks -Fhunkexe -o $@ $<
