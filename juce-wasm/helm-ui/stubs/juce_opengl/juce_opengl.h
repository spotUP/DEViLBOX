/*
 * Stub juce_opengl module for Helm WASM UI build.
 * Helm's FullInterface implements OpenGLRenderer and uses OpenGLContext.
 * Since libjuce-wasm.a doesn't include juce_opengl, we stub the entire module.
 * The OpenGL visualizers (oscilloscope, envelope, peak meter, etc.) will
 * simply not render — all normal JUCE paint() drawing still works.
 */
#pragma once

#include <juce_gui_basics/juce_gui_basics.h>

// JUCE_MEDIUMP: precision qualifier for GLSL (used in Helm's shaders.cpp)
#ifndef JUCE_MEDIUMP
#define JUCE_MEDIUMP "mediump"
#endif

// GL type stubs needed by Helm's OpenGL component headers
typedef unsigned int GLuint;
typedef int GLint;
typedef float GLfloat;
typedef unsigned int GLenum;
typedef unsigned char GLboolean;
typedef int GLsizei;
typedef void GLvoid;
typedef ptrdiff_t GLsizeiptr;
typedef ptrdiff_t GLintptr;

// GL constants used by Helm OpenGL components
#define GL_ARRAY_BUFFER           0x8892
#define GL_ELEMENT_ARRAY_BUFFER   0x8893
#define GL_STATIC_DRAW            0x88E4
#define GL_BLEND                  0x0BE2
#define GL_ONE                    1
#define GL_ONE_MINUS_SRC_ALPHA    0x0303
#define GL_SRC_ALPHA              0x0302
#define GL_TRIANGLES              0x0004
#define GL_TRIANGLE_STRIP         0x0005
#define GL_LINES                  0x0001
#define GL_LINE_STRIP             0x0003
#define GL_UNSIGNED_INT           0x1405
#define GL_FLOAT                  0x1406
#define GL_FALSE                  0
#define GL_TRUE                   1
#define GL_TEXTURE_2D             0x0DE1
#define GL_TEXTURE0               0x84C0
#define GL_TEXTURE_WRAP_S         0x2802
#define GL_TEXTURE_WRAP_T         0x2803
#define GL_CLAMP_TO_EDGE          0x812F
#define GL_TEXTURE_MIN_FILTER     0x2801
#define GL_TEXTURE_MAG_FILTER     0x2800
#define GL_LINEAR                 0x2601
#define GL_NEAREST                0x2600
#define GL_LINE_SMOOTH            0x0B20
#define GL_LINE_SMOOTH_HINT       0x0C52
#define GL_NICEST                 0x1102
#define GL_COLOR_BUFFER_BIT       0x4000
#define GL_DEPTH_BUFFER_BIT       0x0100

// GL function stubs
inline void glEnable(GLenum) {}
inline void glDisable(GLenum) {}
inline void glBlendFunc(GLenum, GLenum) {}
inline void glDrawElements(GLenum, GLsizei, GLenum, const void*) {}
inline void glDrawArrays(GLenum, GLint, GLsizei) {}
inline void glGenBuffers(GLsizei, GLuint*) {}
inline void glDeleteBuffers(GLsizei, const GLuint*) {}
inline void glBindBuffer(GLenum, GLuint) {}
inline void glBufferData(GLenum, GLsizeiptr, const void*, GLenum) {}
inline void glBufferSubData(GLenum, GLintptr, GLsizeiptr, const void*) {}
inline void glVertexAttribPointer(GLuint, GLint, GLenum, GLboolean, GLsizei, const void*) {}
inline void glEnableVertexAttribArray(GLuint) {}
inline void glDisableVertexAttribArray(GLuint) {}
inline void glActiveTexture(GLenum) {}
inline void glViewport(GLint, GLint, GLsizei, GLsizei) {}
inline void glLineWidth(GLfloat) {}
inline void glHint(GLenum, GLenum) {}
inline void glTexParameteri(GLenum, GLenum, GLint) {}
inline void glClear(GLuint) {}
inline void glClearColor(GLfloat, GLfloat, GLfloat, GLfloat) {}
inline void glBindTexture(GLenum, GLuint) {}
inline void glGenTextures(GLsizei, GLuint*) {}
inline void glDeleteTextures(GLsizei, const GLuint*) {}

namespace juce
{

// Forward stub for OpenGLContext
class OpenGLContext
{
public:
    enum OpenGLVersion { defaultGLVersion = 0, openGL3_2 = 1 };

    OpenGLContext() = default;
    ~OpenGLContext() = default;

    void setRenderer(void*) {}
    void setComponentPaintingEnabled(bool) {}
    void setContinuousRepainting(bool) {}
    void setOpenGLVersionRequired(OpenGLVersion) {}
    void attachTo(Component&) {}
    void detach() {}
    void triggerRepaint() {}
    bool isActive() const { return false; }
    bool isAttached() const { return false; }
    double getRenderingScale() const { return 1.0; }

    struct Extensions
    {
        bool isExtensionAvailable(const char*) const { return false; }
        void glGenBuffers(GLsizei, GLuint*) {}
        void glDeleteBuffers(GLsizei, const GLuint*) {}
        void glBindBuffer(GLenum, GLuint) {}
        void glBufferData(GLenum, GLsizeiptr, const void*, GLenum) {}
        void glBufferSubData(GLenum, GLintptr, GLsizeiptr, const void*) {}
        void glVertexAttribPointer(GLuint, GLint, GLenum, GLboolean, GLsizei, const void*) {}
        void glEnableVertexAttribArray(GLuint) {}
        void glDisableVertexAttribArray(GLuint) {}
        void glActiveTexture(GLenum) {}
    };
    Extensions extensions;
};

// Stub OpenGLRenderer interface
class OpenGLRenderer
{
public:
    virtual ~OpenGLRenderer() = default;
    virtual void newOpenGLContextCreated() {}
    virtual void renderOpenGL() {}
    virtual void openGLContextClosing() {}
};

// Stub OpenGLHelpers
struct OpenGLHelpers
{
    static void clear(Colour) {}
    static bool isContextActive() { return false; }
    static juce::String translateVertexShaderToV3(const juce::String& s) { return s; }
    static juce::String translateFragmentShaderToV3(const juce::String& s) { return s; }
};

// Stub OpenGLShaderProgram
class OpenGLShaderProgram
{
public:
    OpenGLShaderProgram(const OpenGLContext&) {}
    ~OpenGLShaderProgram() = default;

    bool addVertexShader(const String&) { return true; }
    bool addFragmentShader(const String&) { return true; }
    bool link() { return true; }
    void use() {}
    void release() {}
    const String& getLastError() const { static String e; return e; }

    struct Uniform
    {
        Uniform(const OpenGLShaderProgram&, const char*) {}
        void set(float) {}
        void set(float, float) {}
        void set(float, float, float) {}
        void set(float, float, float, float) {}
        int uniformID = -1;
    };

    struct Attribute
    {
        Attribute(const OpenGLShaderProgram&, const char*) {}
        int attributeID = -1;
    };
};

// Stub OpenGLTexture
class OpenGLTexture
{
public:
    OpenGLTexture() = default;
    ~OpenGLTexture() = default;
    void loadImage(const Image&) {}
    void loadARGB(const PixelARGB*, int, int) {}
    void loadAlpha(const uint8*, int, int) {}
    void bind() {}
    void unbind() {}
    void release() {}
    int getWidth() const { return 0; }
    int getHeight() const { return 0; }
    unsigned int getTextureID() const { return 0; }
};

} // namespace juce
