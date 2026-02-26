/* Stub fftw3.h — insEdit doesn't use FFT */
#pragma once
#include <cstdlib>
#include <cstddef>
typedef double fftw_complex[2];
typedef void* fftw_plan;
#define FFTW_ESTIMATE 0
static inline fftw_plan fftw_plan_dft_r2c_1d(int n, double *in, fftw_complex *out, unsigned flags) {
  (void)n; (void)in; (void)out; (void)flags; return nullptr;
}
static inline void fftw_execute(fftw_plan p) { (void)p; }
static inline void fftw_destroy_plan(fftw_plan p) { (void)p; }
static inline void* fftw_malloc(size_t n) { return malloc(n); }
static inline void fftw_free(void* p) { free(p); }
