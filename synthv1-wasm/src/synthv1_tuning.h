// synthv1_tuning.h — WASM stub (no Qt, 12-TET only)
#ifndef __synthv1_tuning_h
#define __synthv1_tuning_h

#include <cmath>
#include <cstring>

class synthv1_tuning
{
public:
	synthv1_tuning(float refPitch = 440.0f, int refNote = 69)
		: m_refPitch(refPitch), m_refNote(refNote) {}

	void reset(float refPitch, int refNote)
		{ m_refPitch = refPitch; m_refNote = refNote; }

	float refPitch() const { return m_refPitch; }
	int   refNote()  const { return m_refNote; }

	bool loadKeyMapFile(const char *) { return false; }
	bool loadScaleFile(const char *)  { return false; }

	const char *keyMapFile() const { return ""; }
	const char *scaleFile() const  { return ""; }

	float noteToPitch(int note) const {
		return m_refPitch * ::powf(2.0f, float(note - m_refNote) / 12.0f);
	}

private:
	float m_refPitch;
	int   m_refNote;
};

#endif // __synthv1_tuning_h
