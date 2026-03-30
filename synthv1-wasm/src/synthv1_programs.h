// synthv1_programs.h — WASM stub (no Qt/QMap)
#ifndef __synthv1_programs_h
#define __synthv1_programs_h

#include "synthv1_sched.h"

class synthv1_programs
{
public:
	synthv1_programs(synthv1 *) {}
	~synthv1_programs() {}

	void prog_change(int) {}
	void bank_select_msb(int) {}
	void bank_select_lsb(int) {}
};

#endif // __synthv1_programs_h
