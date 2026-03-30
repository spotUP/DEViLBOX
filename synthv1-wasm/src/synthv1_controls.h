// synthv1_controls.h — WASM stub (no Qt/QMap)
#ifndef __synthv1_controls_h
#define __synthv1_controls_h

#include "synthv1_sched.h"

class synthv1_controls
{
public:
	synthv1_controls(synthv1 *) {}
	~synthv1_controls() {}

	void process_enqueue(int, int, int) {}
	void process_dequeue() {}
	void process(uint32_t) {}
	void reset() {}
};

#endif // __synthv1_controls_h
