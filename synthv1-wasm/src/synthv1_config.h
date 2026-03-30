// synthv1_config.h — WASM stub (no Qt/QSettings)
#ifndef __synthv1_config_h
#define __synthv1_config_h

#include "config.h"

class synthv1_programs;
class synthv1_controls;

class synthv1_config
{
public:
	synthv1_config() {}
	~synthv1_config() {}

	void loadControls(synthv1_controls *) {}
	void loadPrograms(synthv1_programs *) {}
	void saveControls(synthv1_controls *) {}
	void savePrograms(synthv1_programs *) {}
};

#endif // __synthv1_config_h
