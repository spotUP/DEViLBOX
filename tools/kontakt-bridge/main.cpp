#include "vst3host.h"
#include "wsserver.h"

#include <atomic>
#include <csignal>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <execinfo.h>
#include <filesystem>
#include <iostream>
#include <optional>
#include <regex>
#include <sstream>
#include <string>
#include <thread>
#include <unistd.h>
#include <vector>

#ifdef __APPLE__
#include <CoreFoundation/CoreFoundation.h>
#endif

namespace {
constexpr std::uint32_t kBridgeMagic = 0x4B425247u;
std::atomic<bool> gRunning{true};

void crashHandler(int sig) {
    const char* name = (sig == SIGSEGV) ? "SIGSEGV" : (sig == SIGABRT) ? "SIGABRT" : (sig == SIGBUS) ? "SIGBUS" : (sig == SIGILL) ? "SIGILL" : (sig == SIGFPE) ? "SIGFPE" : (sig == SIGTRAP) ? "SIGTRAP" : "UNKNOWN";
    write(STDERR_FILENO, "\n[kontakt-bridge] CRASH: ", 25);
    write(STDERR_FILENO, name, strlen(name));
    write(STDERR_FILENO, "\nBacktrace:\n", 12);
    void* frames[64];
    int count = backtrace(frames, 64);
    backtrace_symbols_fd(frames, count, STDERR_FILENO);
    _exit(128 + sig);
}

void atexitHandler() {
    fprintf(stderr, "[kontakt-bridge] atexit called — process exiting normally\n");
    void* frames[64];
    int count = backtrace(frames, 64);
    backtrace_symbols_fd(frames, count, STDERR_FILENO);
}

void handleSignal(int) {
    gRunning = false;
}

std::string jsonEscape(const std::string& value) {
    std::ostringstream out;
    for (char ch : value) {
        switch (ch) {
            case '\\': out << "\\\\"; break;
            case '"': out << "\\\""; break;
            case '\n': out << "\\n"; break;
            case '\r': out << "\\r"; break;
            case '\t': out << "\\t"; break;
            default: out << ch; break;
        }
    }
    return out.str();
}

std::optional<std::string> extractString(const std::string& json, const std::string& key) {
    const std::regex pattern("\"" + key + "\"\\s*:\\s*\"([^\"]*)\"");
    std::smatch match;
    if (std::regex_search(json, match, pattern) && match.size() > 1) {
        return match[1].str();
    }
    return std::nullopt;
}

int extractInt(const std::string& json, const std::string& key, int fallback) {
    const std::regex pattern("\"" + key + "\"\\s*:\\s*(-?[0-9]+)");
    std::smatch match;
    if (std::regex_search(json, match, pattern) && match.size() > 1) {
        return std::stoi(match[1].str());
    }
    return fallback;
}

std::string makeStatusJson(const KontaktHost::Status& status) {
    std::ostringstream out;
    out << '{'
        << "\"type\":\"status\","
        << "\"connected\":" << (status.pluginLoaded ? "true" : "false") << ','
        << "\"presetName\":";

    if (status.presetName.empty()) {
        out << "null";
    } else {
        out << '"' << jsonEscape(status.presetName) << '"';
    }

    out << ','
        << "\"sampleRate\":" << static_cast<int>(status.sampleRate) << ','
        << "\"blockSize\":" << status.blockSize << ','
        << "\"backend\":\"" << jsonEscape(status.backend) << "\"";

    if (!status.lastError.empty()) {
        out << ",\"lastError\":\"" << jsonEscape(status.lastError) << "\"";
    }

    out << '}';
    return out.str();
}

std::string makeErrorJson(const std::string& message) {
    return std::string("{\"type\":\"error\",\"message\":\"") + jsonEscape(message) + "\"}";
}

std::vector<std::uint8_t> encodeAudioFrame(const float* left, const float* right, std::uint32_t sampleCount) {
    std::vector<std::uint8_t> payload(8 + static_cast<std::size_t>(sampleCount) * sizeof(float) * 2);
    std::memcpy(payload.data(), &kBridgeMagic, sizeof(kBridgeMagic));
    std::memcpy(payload.data() + 4, &sampleCount, sizeof(sampleCount));
    std::memcpy(payload.data() + 8, left, static_cast<std::size_t>(sampleCount) * sizeof(float));
    std::memcpy(payload.data() + 8 + static_cast<std::size_t>(sampleCount) * sizeof(float), right, static_cast<std::size_t>(sampleCount) * sizeof(float));
    return payload;
}
} // namespace

int main(int argc, char* argv[]) {
    std::signal(SIGINT, handleSignal);
    std::signal(SIGTERM, handleSignal);
    std::signal(SIGSEGV, crashHandler);
    std::signal(SIGABRT, crashHandler);
    std::signal(SIGBUS, crashHandler);
    std::signal(SIGILL, crashHandler);
    std::signal(SIGFPE, crashHandler);
    std::signal(SIGTRAP, crashHandler);
    std::signal(SIGPIPE, SIG_IGN);  // Ignore SIGPIPE — handle send() errors via return value
    std::atexit(atexitHandler);

    KontaktHost host;
    WebSocketServer server(4009);

    host.setAudioCallback([&server](const float* left, const float* right, std::uint32_t sampleCount) {
        if (!server.hasClient()) {
            return;
        }
        auto frame = encodeAudioFrame(left, right, sampleCount);
        if (!server.sendBinary(frame)) {
            write(STDERR_FILENO, "[audio] sendBinary failed\n", 26);
        }
    });

    auto sendStatus = [&]() {
        server.sendText(makeStatusJson(host.getStatus()));
    };

    server.setConnectHandler([&]() {
        sendStatus();
    });

    server.setMessageHandler([&](const std::string& json) {
        const auto type = extractString(json, "type");
        if (!type) {
            server.sendText(makeErrorJson("Missing message type"));
            return;
        }

        if (*type == "get_status") {
            sendStatus();
            return;
        }

        if (*type == "note_on") {
            if (!host.noteOn(extractInt(json, "note", 60), extractInt(json, "velocity", 100), extractInt(json, "channel", 0))) {
                server.sendText(makeErrorJson("note_on failed"));
                return;
            }
            return;
        }

        if (*type == "note_off") {
            if (!host.noteOff(extractInt(json, "note", 60), extractInt(json, "channel", 0))) {
                server.sendText(makeErrorJson("note_off failed"));
                return;
            }
            return;
        }

        if (*type == "cc") {
            if (!host.controlChange(extractInt(json, "cc", 7), extractInt(json, "value", 0), extractInt(json, "channel", 0))) {
                server.sendText(makeErrorJson("cc failed"));
                return;
            }
            return;
        }

        if (*type == "load_preset") {
            const auto presetPath = extractString(json, "path");
            if (!presetPath) {
                server.sendText(makeErrorJson("load_preset requires a path"));
                return;
            }
            if (!host.loadPreset(*presetPath)) {
                server.sendText(makeErrorJson(host.getStatus().lastError));
                return;
            }
            sendStatus();
            return;
        }

        server.sendText(makeErrorJson("Unknown message type: " + *type));
    });

    if (!server.start()) {
        std::cerr << "[kontakt-bridge] failed to start websocket server" << std::endl;
        return 1;
    }

    // Check for --no-au flag for debugging
    bool skipAU = false;
    for (int i = 1; i < argc; ++i) {
        if (std::string(argv[i]) == "--no-au") skipAU = true;
    }

    if (!skipAU) {
        if (!host.initialize()) {
            std::cerr << "[kontakt-bridge] host initialization warning: " << host.getStatus().lastError << std::endl;
        }
        // Kontakt AU may override our signal handlers during init.
        // Reinstall them after AU is loaded.
        std::signal(SIGSEGV, crashHandler);
        std::signal(SIGABRT, crashHandler);
        std::signal(SIGBUS, crashHandler);
        std::signal(SIGILL, crashHandler);
        std::signal(SIGFPE, crashHandler);
        std::signal(SIGTRAP, crashHandler);
        std::signal(SIGPIPE, SIG_IGN);
    } else {
        std::cout << "[kontakt-bridge] skipping AU load (--no-au)" << std::endl;
    }

    std::cout << "[kontakt-bridge] press Ctrl+C to stop" << std::endl;

#ifdef __APPLE__
    // Many AU plugins (including Kontakt) dispatch work to the main thread's
    // CFRunLoop. Without pumping it, those blocks never execute and the plugin
    // may time out and call _exit(). Replace sleep loop with CFRunLoop.
    // The SIGINT/SIGTERM handlers set gRunning=false; we install a repeating
    // timer that checks gRunning and stops the run loop when it's time to exit.
    CFRunLoopTimerContext timerCtx{};
    timerCtx.info = nullptr;
    CFRunLoopTimerRef timer = CFRunLoopTimerCreateWithHandler(
        kCFAllocatorDefault,
        CFAbsoluteTimeGetCurrent(),
        0.2, // 200ms interval
        0, 0,
        ^(CFRunLoopTimerRef) {
            if (!gRunning) {
                CFRunLoopStop(CFRunLoopGetMain());
            }
        });
    CFRunLoopAddTimer(CFRunLoopGetMain(), timer, kCFRunLoopCommonModes);
    CFRunLoopRun();
    CFRelease(timer);
#else
    while (gRunning) {
        std::this_thread::sleep_for(std::chrono::milliseconds(200));
    }
#endif

    host.shutdown();
    server.stop();
    return 0;
}
