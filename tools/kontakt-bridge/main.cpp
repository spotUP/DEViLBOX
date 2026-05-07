#include "vst3host.h"
#include "wsserver.h"

#include <atomic>
#include <csignal>
#include <cstdint>
#include <cstring>
#include <filesystem>
#include <iostream>
#include <optional>
#include <regex>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

namespace {
constexpr std::uint32_t kBridgeMagic = 0x4B425247u;
std::atomic<bool> gRunning{true};

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

int main() {
    std::signal(SIGINT, handleSignal);
    std::signal(SIGTERM, handleSignal);

    KontaktHost host;
    WebSocketServer server(4009);

    host.setAudioCallback([&server](const float* left, const float* right, std::uint32_t sampleCount) {
        if (!server.hasClient()) {
            return;
        }
        server.sendBinary(encodeAudioFrame(left, right, sampleCount));
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

    if (!host.initialize()) {
        std::cerr << "[kontakt-bridge] host initialization warning: " << host.getStatus().lastError << std::endl;
    }

    std::cout << "[kontakt-bridge] press Ctrl+C to stop" << std::endl;
    while (gRunning) {
        std::this_thread::sleep_for(std::chrono::milliseconds(200));
    }

    host.shutdown();
    server.stop();
    return 0;
}
