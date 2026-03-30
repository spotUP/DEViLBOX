// synthv1_sched.h — WASM stub (synchronous, no Qt threads)
#ifndef __synthv1_sched_h
#define __synthv1_sched_h

#include <cstdint>

class synthv1;

class synthv1_sched
{
public:
	enum Type { Wave, Programs, Controls, Controller, MidiIn };

	synthv1_sched(synthv1 *pSynth, Type stype, uint32_t nsize = 8)
		: m_pSynth(pSynth), m_stype(stype), m_pending(false) {}
	virtual ~synthv1_sched() {}

	synthv1 *instance() const { return m_pSynth; }

	void schedule(int sid = 0) { m_sid = sid; m_pending = true; sync_process(); }

	bool sync_wait() { return false; }

	void sync_process() {
		if (m_pending) { process(m_sid); m_pending = false; }
	}

	virtual void process(int sid) = 0;

	static void sync_notify(synthv1 *, Type, int) {}
	static void sync_pending() {}
	static void sync_reset() {}

	class Notifier {
	public:
		Notifier(synthv1 *) {}
		virtual ~Notifier() {}
		virtual void notify(synthv1_sched::Type, int) const = 0;
	};

private:
	synthv1 *m_pSynth;
	Type m_stype;
	int m_sid = 0;
	bool m_pending = false;
};

#endif // __synthv1_sched_h
