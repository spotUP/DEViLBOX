// Stub for Monique WASM build — AmpPainter visualization not needed
#pragma once
class Monique_Ui_AmpPainter {
public:
    Monique_Ui_AmpPainter() {}
    ~Monique_Ui_AmpPainter() {}
    // Methods called from DSP code (all null-checked in source)
    void push(float, float) {}
    void set_refresh_rate(float) {}
    bool should_paint() const { return false; }
    void add_filter_env(int, const float*, int) {}
    void add_filter(int, const float*, const float*, int) {}
    void add_eq(const float*, int) {}
    void add_out(const float*, const float*, int) {}
    void add_out_env(const float*, int) {}
    void calc_new_cycle() {}
    void add_master_osc(const float*, const float*, int) {}
    void add_osc(int, const float*, int) {}
};
