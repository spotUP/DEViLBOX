// build_juce_core.cpp — Custom unity build for juce_core module (WASM)
// Based on juce_core.cpp but with WASM patches for missing platform cases.

#include "JuceWasmConfig.h"

#define JUCE_CORE_INCLUDE_OBJC_HELPERS 1
#define JUCE_CORE_INCLUDE_COM_SMART_PTR 1
#define JUCE_CORE_INCLUDE_NATIVE_HEADERS 1
#define JUCE_CORE_INCLUDE_JNI_HELPERS 1

#include <juce_core/juce_core.h>

#include <cctype>
#include <cstdarg>
#include <locale>
#include <iterator>

// WASM system headers (matches juce_core.cpp's #if JUCE_WASM block)
#if JUCE_WASM
  #include <stdio.h>
  #include <sys/types.h>
  #include <sys/socket.h>
  #include <errno.h>
  #include <unistd.h>
  #include <netinet/in.h>
  #include <sys/stat.h>
#endif

#include <pwd.h>
#include <fcntl.h>
#include <netdb.h>
#include <arpa/inet.h>
#include <netinet/tcp.h>
#include <sys/time.h>
#include <net/if.h>
#include <sys/ioctl.h>

#undef check

//==============================================================================
// Core portable sources (identical to juce_core.cpp)
#include <juce_core/containers/juce_AbstractFifo.cpp>
#include <juce_core/containers/juce_ArrayBase.cpp>
#include <juce_core/containers/juce_NamedValueSet.cpp>
#include <juce_core/containers/juce_OwnedArray.cpp>
#include <juce_core/containers/juce_PropertySet.cpp>
#include <juce_core/containers/juce_ReferenceCountedArray.cpp>
#include <juce_core/containers/juce_SparseSet.cpp>
#include <juce_core/files/juce_DirectoryIterator.cpp>
#include <juce_core/files/juce_RangedDirectoryIterator.cpp>
#include <juce_core/files/juce_File.cpp>
#include <juce_core/files/juce_FileInputStream.cpp>
#include <juce_core/files/juce_FileOutputStream.cpp>
#include <juce_core/files/juce_FileSearchPath.cpp>
#include <juce_core/files/juce_TemporaryFile.cpp>
#include <juce_core/logging/juce_FileLogger.cpp>
#include <juce_core/logging/juce_Logger.cpp>
#include <juce_core/maths/juce_BigInteger.cpp>
#include <juce_core/maths/juce_Expression.cpp>
#include <juce_core/maths/juce_Random.cpp>
#include <juce_core/memory/juce_MemoryBlock.cpp>
#include <juce_core/memory/juce_AllocationHooks.cpp>
#include <juce_core/misc/juce_RuntimePermissions.cpp>
#include <juce_core/misc/juce_Result.cpp>
#include <juce_core/misc/juce_Uuid.cpp>
#include <juce_core/misc/juce_ConsoleApplication.cpp>
#include <juce_core/misc/juce_ScopeGuard.cpp>
#include <juce_core/network/juce_MACAddress.cpp>

#if ! JUCE_WINDOWS
 #include <juce_core/native/juce_SharedCode_posix.h>
 #include <juce_core/native/juce_NamedPipe_posix.cpp>
#endif

#include <juce_core/zip/juce_zlib.h>
#include <juce_core/network/juce_NamedPipe.cpp>
#include <juce_core/network/juce_Socket.cpp>
#include <juce_core/network/juce_IPAddress.cpp>
#include <juce_core/streams/juce_BufferedInputStream.cpp>
#include <juce_core/streams/juce_FileInputSource.cpp>
#include <juce_core/streams/juce_InputStream.cpp>
#include <juce_core/streams/juce_MemoryInputStream.cpp>
#include <juce_core/streams/juce_MemoryOutputStream.cpp>
#include <juce_core/streams/juce_SubregionStream.cpp>
#include <juce_core/system/juce_SystemStats.cpp>
#include <juce_core/text/juce_CharacterFunctions.cpp>
#include <juce_core/text/juce_Identifier.cpp>
#include <juce_core/text/juce_LocalisedStrings.cpp>
#include <juce_core/text/juce_String.cpp>
#include <juce_core/streams/juce_OutputStream.cpp>
#include <juce_core/text/juce_StringArray.cpp>
#include <juce_core/text/juce_StringPairArray.cpp>
#include <juce_core/text/juce_StringPool.cpp>
#include <juce_core/text/juce_TextDiff.cpp>
#include <juce_core/text/juce_Base64.cpp>
#include <juce_core/threads/juce_ReadWriteLock.cpp>
#include <juce_core/threads/juce_Thread.cpp>
#include <juce_core/threads/juce_ThreadPool.cpp>
#include <juce_core/threads/juce_TimeSliceThread.cpp>
#include <juce_core/time/juce_PerformanceCounter.cpp>
#include <juce_core/time/juce_RelativeTime.cpp>
#include <juce_core/time/juce_Time.cpp>
#include <juce_core/unit_tests/juce_UnitTest.cpp>
#include <juce_core/containers/juce_Variant.cpp>
#include <juce_core/json/juce_JSON.cpp>
#include <juce_core/json/juce_JSONUtils.cpp>
#include <juce_core/containers/juce_DynamicObject.cpp>
#include <juce_core/xml/juce_XmlDocument.cpp>
#include <juce_core/xml/juce_XmlElement.cpp>
#include <juce_core/zip/juce_GZIPDecompressorInputStream.cpp>
#include <juce_core/zip/juce_GZIPCompressorOutputStream.cpp>
#include <juce_core/zip/juce_ZipFile.cpp>
#include <juce_core/files/juce_FileFilter.cpp>
#include <juce_core/files/juce_WildcardFileFilter.cpp>

// PATCH: ThreadPriorities has no WASM case — provide one inline
namespace juce
{
struct ThreadPriorities
{
    struct Entry
    {
        Thread::Priority priority;
        int native;
    };

    // WASM: all zero priorities (threading is no-op in single-threaded WASM)
    static inline constexpr Entry table[]
    {
        { Thread::Priority::highest,    0 },
        { Thread::Priority::high,       0 },
        { Thread::Priority::normal,     0 },
        { Thread::Priority::low,        0 },
        { Thread::Priority::background, 0 },
    };

    static_assert (std::size (table) == 5);

    static Thread::Priority getJucePriority (const int value)
    {
        const auto iter = std::min_element (std::begin (table), std::end (table),
            [value] (const auto& a, const auto& b) {
                return std::abs (a.native - value) < std::abs (b.native - value);
            });
        return iter != std::end (table) ? iter->priority : Thread::Priority{};
    }

    static int getNativePriority (const Thread::Priority value)
    {
        const auto iter = std::find_if (std::begin (table), std::end (table),
            [value] (const auto& entry) { return entry.priority == value; });
        return iter != std::end (table) ? iter->native : 0;
    }
};
} // namespace juce

#include <juce_core/native/juce_PlatformTimerListener.h>

// WASM IP address (posix-compatible)
#if ! JUCE_WINDOWS
 #include <juce_core/native/juce_IPAddress_posix.h>
#endif

// WASM native files
#if JUCE_WASM
 #include <juce_core/native/juce_SystemStats_wasm.cpp>
 #include <juce_core/native/juce_PlatformTimer_generic.cpp>
 // Stub filesystem functions that require platform-specific APIs
 namespace juce {
   File File::getSpecialLocation (const SpecialLocationType type) {
       switch (type) {
           case tempDirectory:              return File ("/tmp");
           case userHomeDirectory:          return File ("/home");
           case userDocumentsDirectory:     return File ("/home/documents");
           case userDesktopDirectory:       return File ("/home/desktop");
           case userMusicDirectory:         return File ("/home/music");
           case userMoviesDirectory:        return File ("/home/movies");
           case userPicturesDirectory:      return File ("/home/pictures");
           case userApplicationDataDirectory: return File ("/home/.config");
           case commonApplicationDataDirectory: return File ("/etc");
           case commonDocumentsDirectory:   return File ("/home/documents");
           case globalApplicationsDirectory: return File ("/usr/share");
           case invokedExecutableFile:
           case currentExecutableFile:
           case currentApplicationFile:
           case hostApplicationPath:        return File ("/app");
           default:                         return File ("/tmp");
       }
   }
   bool File::isOnCDRomDrive() const   { return false; }
   bool File::isOnHardDisk() const     { return true; }
   bool File::isOnRemovableDrive() const { return false; }
   bool File::isSymbolicLink() const   { return false; }
   bool File::copyInternal (const File&) const { return false; }
   String File::getVolumeLabel() const { return {}; }
   int File::getVolumeSerialNumber() const { return 0; }
   bool File::moveToTrash() const      { return deleteFile(); }
   int64 File::getBytesFreeOnVolume() const { return 1024 * 1024 * 100; }
   int64 File::getVolumeTotalSize() const   { return 1024 * 1024 * 1024; }
   class DirectoryIterator::NativeIterator::Pimpl { public: String path; };
   DirectoryIterator::NativeIterator::NativeIterator (const File& dir, const String& wildcard) : pimpl (new Pimpl()) { pimpl->path = dir.getFullPathName(); }
   DirectoryIterator::NativeIterator::~NativeIterator() {}
   bool DirectoryIterator::NativeIterator::next (String&, bool*, bool*, int64*, Time*, Time*, bool*) { return false; }
   void SystemStats::setApplicationCrashHandler (void (*)(void*)) {}
   void Thread::killThread() {}
   bool Thread::createNativeThread (Priority) { return false; }
 } // namespace juce
#endif

#include <juce_core/files/juce_common_MimeTypes.h>
#include <juce_core/files/juce_common_MimeTypes.cpp>
#include <juce_core/threads/juce_HighResolutionTimer.cpp>
#include <juce_core/threads/juce_WaitableEvent.cpp>
#include <juce_core/network/juce_URL.cpp>

// WASM linker verification
namespace juce
{
this_will_fail_to_link_if_some_of_your_compile_units_are_built_in_release_mode
    ::this_will_fail_to_link_if_some_of_your_compile_units_are_built_in_release_mode() noexcept {}
}
