#include "vst3host.h"
#include "wsserver.h"
#include "augui.h"

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

#include <sqlite3.h>

#ifdef __APPLE__
#include <CoreFoundation/CoreFoundation.h>
#import <Cocoa/Cocoa.h>
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

double extractDouble(const std::string& json, const std::string& key, double fallback) {
    const std::regex pattern("\"" + key + "\"\\s*:\\s*(-?[0-9]+\\.?[0-9]*)");
    std::smatch match;
    if (std::regex_search(json, match, pattern) && match.size() > 1) {
        return std::stod(match[1].str());
    }
    return fallback;
}

bool extractBool(const std::string& json, const std::string& key, bool fallback) {
    const std::regex pattern("\"" + key + "\"\\s*:\\s*(true|false)");
    std::smatch match;
    if (std::regex_search(json, match, pattern) && match.size() > 1) {
        return match[1].str() == "true";
    }
    return fallback;
}

std::string makeSlotsJson(const KontaktHost& host) {
    const auto slotIds = host.getSlotIds();
    std::ostringstream out;
    out << '[';
    for (size_t i = 0; i < slotIds.size(); ++i) {
        if (i > 0) out << ',';
        const int slotId = slotIds[i];
        const auto slotStatus = host.getStatus(slotId);
        out << "{\"slot\":" << slotId
            << ",\"pluginName\":";
        if (slotStatus.pluginName.empty()) {
            out << "null";
        } else {
            out << '"' << jsonEscape(slotStatus.pluginName) << '"';
        }
        out << ",\"presetName\":";
        if (slotStatus.presetName.empty()) {
            out << "null";
        } else {
            out << '"' << jsonEscape(slotStatus.presetName) << '"';
        }
        out << ",\"connected\":" << (slotStatus.pluginLoaded ? "true" : "false") << '}';
    }
    out << ']';
    return out.str();
}

std::string makeStatusJson(const KontaktHost& host) {
    const auto slotIds = host.getSlotIds();
    KontaktHost::Status status = host.getStatus(0);
    if (!status.pluginLoaded && !slotIds.empty()) {
        status = host.getStatus(slotIds.front());
    }

    std::ostringstream out;
    out << '{'
        << "\"type\":\"status\","
        << "\"connected\":" << (!slotIds.empty() ? "true" : "false") << ','
        << "\"pluginName\":";

    if (status.pluginName.empty()) {
        out << "null";
    } else {
        out << '"' << jsonEscape(status.pluginName) << '"';
    }

    out << ",\"presetName\":";

    if (status.presetName.empty()) {
        out << "null";
    } else {
        out << '"' << jsonEscape(status.presetName) << '"';
    }

    out << ','
        << "\"sampleRate\":" << static_cast<int>(status.sampleRate) << ','
        << "\"blockSize\":" << status.blockSize << ','
        << "\"backend\":\"" << jsonEscape(status.backend) << "\""
        << ",\"slots\":" << makeSlotsJson(host);

    if (!status.lastError.empty()) {
        out << ",\"lastError\":\"" << jsonEscape(status.lastError) << "\"";
    }

    out << '}';
    return out.str();
}

std::string makeSlotListJson(const KontaktHost& host) {
    return std::string("{\"type\":\"slot_list\",\"slots\":") + makeSlotsJson(host) + "}";
}

std::string makePluginListJson(const std::vector<PluginInfo>& plugins) {
    std::ostringstream out;
    out << "{\"type\":\"plugin_list\",\"plugins\":[";
    for (size_t i = 0; i < plugins.size(); ++i) {
        if (i > 0) out << ',';
        out << "{\"name\":\"" << jsonEscape(plugins[i].name) << "\""
            << ",\"manufacturer\":\"" << jsonEscape(plugins[i].manufacturer) << "\""
            << ",\"type\":" << plugins[i].type
            << ",\"subType\":" << plugins[i].subType
            << "}";
    }
    out << "]}";
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

std::string getCacheDir() {
    const char* home = getenv("HOME");
    std::string base = home ? std::string(home) : std::filesystem::current_path().string();
    std::string dir = base + "/.devilbox/kontakt-cache";
    std::filesystem::create_directories(dir);
    return dir;
}

std::string sanitizeFilename(const std::string& name) {
    std::string out;
    for (char ch : name) {
        if (std::isalnum(ch) || ch == '-' || ch == '_' || ch == ' ') {
            out += ch;
        }
    }
    // Trim trailing spaces
    while (!out.empty() && out.back() == ' ') out.pop_back();
    return out;
}

std::string getCachePath(const std::string& instrumentName) {
    return getCacheDir() + "/" + sanitizeFilename(instrumentName) + ".bin";
}

bool hasCachedState(const std::string& instrumentName) {
    return std::filesystem::exists(getCachePath(instrumentName));
}

std::string listKontaktInstruments() {
    // Find komplete.db3
    const char* home = getenv("HOME");
    if (!home) return makeErrorJson("HOME not set");

    std::string dbPath = std::string(home) + "/Library/Application Support/Native Instruments/Kontakt 8/komplete.db3";
    if (!std::filesystem::exists(dbPath)) {
        // Try Kontakt 7
        dbPath = std::string(home) + "/Library/Application Support/Native Instruments/Kontakt 7/komplete.db3";
    }
    if (!std::filesystem::exists(dbPath)) {
        return makeErrorJson("komplete.db3 not found");
    }

    sqlite3* db = nullptr;
    int rc = sqlite3_open_v2(dbPath.c_str(), &db, SQLITE_OPEN_READONLY, nullptr);
    if (rc != SQLITE_OK) {
        return makeErrorJson("Cannot open komplete.db3: " + std::string(sqlite3_errmsg(db)));
    }

    // Query instruments (.nki files)
    const char* sql =
        "SELECT DISTINCT s.name, s.vendor, s.file_name, s.file_ext "
        "FROM k_sound_info s "
        "WHERE s.file_ext IN ('nki', 'nksn', 'nkt', 'nkm') "
        "ORDER BY s.vendor, s.name";

    sqlite3_stmt* stmt = nullptr;
    rc = sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr);
    if (rc != SQLITE_OK) {
        std::string err = sqlite3_errmsg(db);
        sqlite3_close(db);
        return makeErrorJson("SQL error: " + err);
    }

    std::ostringstream out;
    out << "{\"type\":\"instrument_list\",\"instruments\":[";
    bool first = true;
    while (sqlite3_step(stmt) == SQLITE_ROW) {
        const char* name = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0));
        const char* vendor = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1));
        const char* filePath = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 2));

        if (!name) continue;
        if (!first) out << ',';
        first = false;

        std::string nameStr = name ? name : "";
        std::string vendorStr = vendor ? vendor : "";
        std::string fileStr = filePath ? filePath : "";
        bool cached = hasCachedState(nameStr);

        out << "{\"name\":\"" << jsonEscape(nameStr) << "\""
            << ",\"vendor\":\"" << jsonEscape(vendorStr) << "\""
            << ",\"path\":\"" << jsonEscape(fileStr) << "\""
            << ",\"cached\":" << (cached ? "true" : "false")
            << "}";
    }
    out << "]}";

    sqlite3_finalize(stmt);
    sqlite3_close(db);
    return out.str();
}

} // namespace

int main(int argc, char* argv[]) {
    // Block ALL signals first, then selectively unblock the ones we handle.
    // This prevents ANY unhandled signal from killing the process — AU plugins
    // and socket operations can generate unexpected signals.
    sigset_t allSignals;
    sigfillset(&allSignals);
    // Keep SIGINT/SIGTERM unblocked for graceful shutdown
    sigdelset(&allSignals, SIGINT);
    sigdelset(&allSignals, SIGTERM);
    // Keep crash signals unblocked so our handlers fire
    sigdelset(&allSignals, SIGSEGV);
    sigdelset(&allSignals, SIGABRT);
    sigdelset(&allSignals, SIGBUS);
    sigdelset(&allSignals, SIGILL);
    sigdelset(&allSignals, SIGFPE);
    sigdelset(&allSignals, SIGTRAP);
    pthread_sigmask(SIG_BLOCK, &allSignals, nullptr);

    std::signal(SIGINT, handleSignal);
    std::signal(SIGTERM, handleSignal);
    std::signal(SIGSEGV, crashHandler);
    std::signal(SIGABRT, crashHandler);
    std::signal(SIGBUS, crashHandler);
    std::signal(SIGILL, crashHandler);
    std::signal(SIGFPE, crashHandler);
    std::signal(SIGTRAP, crashHandler);
    std::signal(SIGPIPE, SIG_IGN);
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
        server.sendText(makeStatusJson(host));
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

        if (*type == "list_slots") {
            server.sendText(makeSlotListJson(host));
            return;
        }

        if (*type == "note_on") {
            int n = extractInt(json, "note", 60);
            int v = extractInt(json, "velocity", 100);
            int ch = extractInt(json, "channel", 0);
            int slot = extractInt(json, "slot", 0);
            if (!host.noteOn(n, v, ch, slot)) {
                server.sendText(makeErrorJson("note_on failed"));
                return;
            }
            return;
        }

        if (*type == "note_off") {
            int slot = extractInt(json, "slot", 0);
            if (!host.noteOff(extractInt(json, "note", 60), extractInt(json, "channel", 0), slot)) {
                server.sendText(makeErrorJson("note_off failed"));
                return;
            }
            return;
        }

        if (*type == "cc") {
            int slot = extractInt(json, "slot", 0);
            if (!host.controlChange(extractInt(json, "cc", 7), extractInt(json, "value", 0), extractInt(json, "channel", 0), slot)) {
                server.sendText(makeErrorJson("cc failed"));
                return;
            }
            return;
        }

        if (*type == "program_change") {
            int program = extractInt(json, "program", 0);
            int ch = extractInt(json, "channel", 0);
            int slot = extractInt(json, "slot", 0);
            fprintf(stderr, "[Bridge] program_change program=%d ch=%d slot=%d\n", program, ch, slot);
            if (!host.programChange(program, ch, slot)) {
                server.sendText(makeErrorJson("program_change failed"));
                return;
            }
            return;
        }

        if (*type == "load_preset") {
            const auto presetPath = extractString(json, "path");
            const int slot = extractInt(json, "slot", 0);
            if (!presetPath) {
                server.sendText(makeErrorJson("load_preset requires a path"));
                return;
            }
            if (!host.loadPreset(*presetPath, slot)) {
                server.sendText(makeErrorJson(host.getStatus(slot).lastError));
                return;
            }
            sendStatus();
            return;
        }

        if (*type == "list_plugins") {
            server.sendText(makePluginListJson(host.listPlugins()));
            return;
        }

        if (*type == "load_plugin") {
            const auto pluginName = extractString(json, "name");
            if (!pluginName) {
                server.sendText(makeErrorJson("load_plugin requires a name"));
                return;
            }
            fprintf(stderr, "[Bridge] loading plugin: %s\n", pluginName->c_str());
            const int slot = host.loadPlugin(*pluginName);
            if (slot < 0) {
                fprintf(stderr, "[Bridge] load_plugin FAILED: %s\n", host.getStatus().lastError.c_str());
                server.sendText(makeErrorJson(host.getStatus().lastError));
                return;
            }
            const auto slotStatus = host.getStatus(slot);
            fprintf(stderr, "[Bridge] load_plugin OK: slot=%d %s\n", slot, slotStatus.pluginName.c_str());
            std::signal(SIGSEGV, crashHandler);
            std::signal(SIGABRT, crashHandler);
            std::signal(SIGBUS, crashHandler);
            std::signal(SIGILL, crashHandler);
            std::signal(SIGFPE, crashHandler);
            std::signal(SIGTRAP, crashHandler);
            std::signal(SIGPIPE, SIG_IGN);
            server.sendText("{\"type\":\"plugin_loaded\",\"slot\":" + std::to_string(slot) + ",\"pluginName\":\"" + jsonEscape(slotStatus.pluginName) + "\"}");
            sendStatus();
            return;
        }

        if (*type == "unload_plugin") {
            const int slot = extractInt(json, "slot", 0);
            host.closeGUI(slot);
            host.unloadPlugin(slot);
            sendStatus();
            return;
        }

        if (*type == "show_gui") {
            host.showGUI(extractInt(json, "slot", 0));
            return;
        }

        if (*type == "close_gui") {
            host.closeGUI(extractInt(json, "slot", 0));
            return;
        }

        if (*type == "save_state") {
            const int slot = extractInt(json, "slot", 0);
            auto pathOpt = extractString(json, "path");
            std::string outPath = pathOpt ? *pathOpt : (getCacheDir() + "/kontakt-state-slot-" + std::to_string(slot) + ".bin");
            bool ok = host.saveState(outPath, slot);
            if (ok) {
                server.sendText("{\"type\":\"state_saved\",\"slot\":" + std::to_string(slot) + ",\"path\":\"" + jsonEscape(outPath) + "\"}");
            } else {
                server.sendText(makeErrorJson(host.getStatus(slot).lastError));
            }
            return;
        }

        if (*type == "set_state") {
            const int slot = extractInt(json, "slot", 0);
            auto pathOpt = extractString(json, "path");
            if (pathOpt) {
                bool ok = host.restoreState(*pathOpt, slot);
                if (ok) {
                    server.sendText("{\"type\":\"state_restored\",\"slot\":" + std::to_string(slot) + "}");
                    sendStatus();
                } else {
                    server.sendText(makeErrorJson(host.getStatus(slot).lastError));
                }
            } else {
                server.sendText(makeErrorJson("set_state requires 'path' (file path to vstdata blob)"));
            }
            return;
        }

        if (*type == "transport") {
            bool playing = extractBool(json, "playing", false);
            double bpm = extractDouble(json, "bpm", 120.0);
            double beat = extractDouble(json, "beat", -1.0);
            host.setTransport(playing, bpm, beat);
            return;
        }

        if (*type == "direct_audio") {
            bool enable = extractBool(json, "enable", true);
            host.setDirectAudio(enable);
            return;
        }

        if (*type == "list_instruments") {
            server.sendText(listKontaktInstruments());
            return;
        }

        if (*type == "load_instrument") {
            auto nameOpt = extractString(json, "name");
            int slot = extractInt(json, "slot", 0);
            if (!nameOpt) {
                server.sendText(makeErrorJson("load_instrument requires 'name'"));
                return;
            }
            std::string cachePath = getCachePath(*nameOpt);
            if (!std::filesystem::exists(cachePath)) {
                server.sendText(makeErrorJson("No cached state for '" + *nameOpt + "'. Load it via Kontakt GUI first, then save_state."));
                return;
            }

            if (!host.getStatus(slot).pluginLoaded) {
                fprintf(stderr, "[Bridge] load_instrument: auto-loading Kontakt 8...\n");
                slot = host.loadPlugin("Native Instruments: Kontakt 8");
                if (slot < 0) {
                    server.sendText(makeErrorJson("Failed to load Kontakt: " + host.getStatus().lastError));
                    return;
                }
            }

            fprintf(stderr, "[Bridge] load_instrument: restoring state into slot %d from %s\n", slot, cachePath.c_str());
            if (!host.restoreState(cachePath, slot)) {
                server.sendText(makeErrorJson("Failed to restore state: " + host.getStatus(slot).lastError));
                return;
            }

            host.showGUI(slot);

            server.sendText("{\"type\":\"instrument_loaded\",\"slot\":" + std::to_string(slot) + ",\"name\":\"" + jsonEscape(*nameOpt) + "\"}");
            sendStatus();
            return;
        }

        if (*type == "cache_state") {
            auto nameOpt = extractString(json, "name");
            int slot = extractInt(json, "slot", 0);
            if (!nameOpt) {
                server.sendText(makeErrorJson("cache_state requires 'name'"));
                return;
            }
            std::string cachePath = getCachePath(*nameOpt);
            if (host.saveState(cachePath, slot)) {
                server.sendText("{\"type\":\"state_cached\",\"slot\":" + std::to_string(slot) + ",\"name\":\"" + jsonEscape(*nameOpt) + "\",\"path\":\"" + jsonEscape(cachePath) + "\"}");
            } else {
                server.sendText(makeErrorJson(host.getStatus(slot).lastError));
            }
            return;
        }

        server.sendText(makeErrorJson("Unknown message type: " + *type));
    });

    if (!server.start()) {
        std::cerr << "[kontakt-bridge] failed to start websocket server" << std::endl;
        return 1;
    }

    // Check for --plugin flag to auto-load a specific plugin on startup
    std::string autoLoadPlugin;
    bool skipAU = false;
    for (int i = 1; i < argc; ++i) {
        if (std::string(argv[i]) == "--no-au") {
            skipAU = true;
        } else if (std::string(argv[i]) == "--plugin" && i + 1 < argc) {
            autoLoadPlugin = argv[++i];
        }
    }

    if (!skipAU && !autoLoadPlugin.empty()) {
        if (host.loadPlugin(autoLoadPlugin) < 0) {
            std::cerr << "[au-bridge] auto-load warning: " << host.getStatus().lastError << std::endl;
        }
        std::signal(SIGSEGV, crashHandler);
        std::signal(SIGABRT, crashHandler);
        std::signal(SIGBUS, crashHandler);
        std::signal(SIGILL, crashHandler);
        std::signal(SIGFPE, crashHandler);
        std::signal(SIGTRAP, crashHandler);
        std::signal(SIGPIPE, SIG_IGN);
    } else if (skipAU) {
        std::cout << "[au-bridge] skipping AU load (--no-au)" << std::endl;
    } else {
        std::cout << "[au-bridge] ready — send {\"type\":\"list_plugins\"} to see available plugins" << std::endl;
    }

    std::cout << "[kontakt-bridge] press Ctrl+C to stop" << std::endl;

#ifdef __APPLE__
    // Use full NSApp run loop for proper AppKit event delivery (mouse, keyboard, tracking).
    // Manual runMode: only processes one event and misses NSEventTrackingRunLoopMode,
    // making plugin GUIs unresponsive to clicks/drags.
    [NSApplication sharedApplication];
    [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
    [NSApp finishLaunching];

    // Repeating timer on the main run loop: polls for GUI requests + checks shutdown flag.
    // Runs in NSDefaultRunLoopMode AND NSEventTrackingRunLoopMode so it fires even during
    // mouse drags inside the plugin GUI.
    NSTimer* pollTimer = [NSTimer timerWithTimeInterval:0.05
                                               repeats:YES
                                                 block:^(NSTimer* timer) {
        pollGUI();
        if (!gRunning) {
            [timer invalidate];
            [NSApp stop:nil];
            // Post a dummy event to unblock [NSApp run]
            NSEvent* dummy = [NSEvent otherEventWithType:NSEventTypeApplicationDefined
                                                location:NSZeroPoint
                                           modifierFlags:0
                                               timestamp:0
                                            windowNumber:0
                                                 context:nil
                                                 subtype:0
                                                   data1:0
                                                   data2:0];
            [NSApp postEvent:dummy atStart:YES];
        }
    }];
    [[NSRunLoop currentRunLoop] addTimer:pollTimer forMode:NSDefaultRunLoopMode];
    [[NSRunLoop currentRunLoop] addTimer:pollTimer forMode:NSEventTrackingRunLoopMode];

    [NSApp run];  // Full event loop — handles all UI events properly
#else
    while (gRunning) {
        std::this_thread::sleep_for(std::chrono::milliseconds(200));
    }
#endif

    host.shutdown();
    server.stop();
    return 0;
}
