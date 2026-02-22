# hwui-common is a static library — not compiled independently.
# Include hwui_common.c in each module's SOURCES list and
# add hwui-common/src to target_include_directories.
#
# Example in a consumer CMakeLists.txt:
#   set(SOURCES src/my_module.c ../hwui-common/src/hwui_common.c)
#   target_include_directories(MyModule PRIVATE src ../hwui-common/src)
