#ifndef HEADLESS_OSD_H
#define HEADLESS_OSD_H

#include "osdepend.h"
#include "modules/osdcommon.h"

namespace DEViLBOX {

class HeadlessOSD : public osd_common_t {
public:
    HeadlessOSD(osd_options& options);
    virtual ~HeadlessOSD();

    // osd_common_t overrides
    virtual void init(running_machine& machine) override;
    virtual void update(bool skip_redraw) override;

    // Subsystem access
    void set_sample_rate(uint32_t rate);
    void render_audio(float* left, float* right, uint32_t samples);
    void push_midi(const uint8_t* data, uint32_t length);

protected:
    virtual void init_subsystems() override;

private:
    uint32_t m_sample_rate;
    // Circular buffers or similar would go here
};

} // namespace DEViLBOX

#endif
