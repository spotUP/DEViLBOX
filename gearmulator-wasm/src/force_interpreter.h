// Force interpreter mode by undefining arch macros before dspconfig.h sees them
#undef HAVE_ARM64
#undef HAVE_X86_64
#undef __aarch64__
#undef __x86_64__
#undef _M_X64
#undef _M_ARM64
