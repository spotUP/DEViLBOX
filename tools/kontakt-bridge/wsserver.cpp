#include "wsserver.h"

#include <algorithm>
#include <array>
#include <cctype>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#ifdef _WIN32
#include <ws2tcpip.h>
#pragma comment(lib, "ws2_32.lib")
#else
#include <arpa/inet.h>
#include <csignal>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>
#endif

namespace {
constexpr char kGuid[] = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

#ifdef _WIN32
constexpr SocketHandle kInvalidSocket = INVALID_SOCKET;
#else
constexpr SocketHandle kInvalidSocket = -1;
#endif

void closeSocket(SocketHandle socket) {
#ifdef _WIN32
    closesocket(socket);
#else
    close(socket);
#endif
}

bool recvAll(SocketHandle socket, void* buffer, std::size_t size) {
    auto* bytes = static_cast<std::uint8_t*>(buffer);
    std::size_t received = 0;
    while (received < size) {
        const int chunk = recv(socket, reinterpret_cast<char*>(bytes + received), static_cast<int>(size - received), 0);
        if (chunk <= 0) {
            return false;
        }
        received += static_cast<std::size_t>(chunk);
    }
    return true;
}

bool sendAll(SocketHandle socket, const void* buffer, std::size_t size) {
    const auto* bytes = static_cast<const std::uint8_t*>(buffer);
    std::size_t sent = 0;
    while (sent < size) {
        const int chunk = send(socket, reinterpret_cast<const char*>(bytes + sent), static_cast<int>(size - sent), 0);
        if (chunk <= 0) {
            return false;
        }
        sent += static_cast<std::size_t>(chunk);
    }
    return true;
}

std::string trim(std::string value) {
    while (!value.empty() && std::isspace(static_cast<unsigned char>(value.front()))) {
        value.erase(value.begin());
    }
    while (!value.empty() && std::isspace(static_cast<unsigned char>(value.back()))) {
        value.pop_back();
    }
    return value;
}

std::string lowercase(std::string value) {
    std::transform(value.begin(), value.end(), value.begin(), [](unsigned char c) {
        return static_cast<char>(std::tolower(c));
    });
    return value;
}

struct Sha1State {
    std::uint32_t h0 = 0x67452301u;
    std::uint32_t h1 = 0xEFCDAB89u;
    std::uint32_t h2 = 0x98BADCFEu;
    std::uint32_t h3 = 0x10325476u;
    std::uint32_t h4 = 0xC3D2E1F0u;
    std::uint64_t lengthBits = 0;
    std::array<std::uint8_t, 64> buffer{};
    std::size_t bufferSize = 0;
};

std::uint32_t rotateLeft(std::uint32_t value, int bits) {
    return (value << bits) | (value >> (32 - bits));
}

void sha1Transform(Sha1State& state, const std::uint8_t* block) {
    std::uint32_t w[80]{};
    for (int i = 0; i < 16; ++i) {
        w[i] = (static_cast<std::uint32_t>(block[i * 4]) << 24)
             | (static_cast<std::uint32_t>(block[i * 4 + 1]) << 16)
             | (static_cast<std::uint32_t>(block[i * 4 + 2]) << 8)
             | (static_cast<std::uint32_t>(block[i * 4 + 3]));
    }
    for (int i = 16; i < 80; ++i) {
        w[i] = rotateLeft(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    }

    std::uint32_t a = state.h0;
    std::uint32_t b = state.h1;
    std::uint32_t c = state.h2;
    std::uint32_t d = state.h3;
    std::uint32_t e = state.h4;

    for (int i = 0; i < 80; ++i) {
        std::uint32_t f = 0;
        std::uint32_t k = 0;
        if (i < 20) {
            f = (b & c) | ((~b) & d);
            k = 0x5A827999u;
        } else if (i < 40) {
            f = b ^ c ^ d;
            k = 0x6ED9EBA1u;
        } else if (i < 60) {
            f = (b & c) | (b & d) | (c & d);
            k = 0x8F1BBCDCu;
        } else {
            f = b ^ c ^ d;
            k = 0xCA62C1D6u;
        }

        const std::uint32_t temp = rotateLeft(a, 5) + f + e + k + w[i];
        e = d;
        d = c;
        c = rotateLeft(b, 30);
        b = a;
        a = temp;
    }

    state.h0 += a;
    state.h1 += b;
    state.h2 += c;
    state.h3 += d;
    state.h4 += e;
}

void sha1Update(Sha1State& state, const std::string& input) {
    for (unsigned char byte : input) {
        state.buffer[state.bufferSize++] = byte;
        state.lengthBits += 8;
        if (state.bufferSize == state.buffer.size()) {
            sha1Transform(state, state.buffer.data());
            state.bufferSize = 0;
        }
    }
}

std::array<std::uint8_t, 20> sha1Final(Sha1State& state) {
    state.buffer[state.bufferSize++] = 0x80;
    if (state.bufferSize > 56) {
        while (state.bufferSize < 64) {
            state.buffer[state.bufferSize++] = 0;
        }
        sha1Transform(state, state.buffer.data());
        state.bufferSize = 0;
    }

    while (state.bufferSize < 56) {
        state.buffer[state.bufferSize++] = 0;
    }

    for (int i = 7; i >= 0; --i) {
        state.buffer[state.bufferSize++] = static_cast<std::uint8_t>((state.lengthBits >> (i * 8)) & 0xffu);
    }
    sha1Transform(state, state.buffer.data());

    std::array<std::uint8_t, 20> digest{};
    const std::uint32_t words[5] = { state.h0, state.h1, state.h2, state.h3, state.h4 };
    for (int i = 0; i < 5; ++i) {
        digest[i * 4] = static_cast<std::uint8_t>((words[i] >> 24) & 0xffu);
        digest[i * 4 + 1] = static_cast<std::uint8_t>((words[i] >> 16) & 0xffu);
        digest[i * 4 + 2] = static_cast<std::uint8_t>((words[i] >> 8) & 0xffu);
        digest[i * 4 + 3] = static_cast<std::uint8_t>(words[i] & 0xffu);
    }
    return digest;
}

std::string base64Encode(const std::uint8_t* data, std::size_t size) {
    static constexpr char kTable[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string output;
    output.reserve(((size + 2) / 3) * 4);

    for (std::size_t i = 0; i < size; i += 3) {
        const std::uint32_t chunk = (static_cast<std::uint32_t>(data[i]) << 16)
            | (static_cast<std::uint32_t>(i + 1 < size ? data[i + 1] : 0) << 8)
            | static_cast<std::uint32_t>(i + 2 < size ? data[i + 2] : 0);

        output.push_back(kTable[(chunk >> 18) & 0x3f]);
        output.push_back(kTable[(chunk >> 12) & 0x3f]);
        output.push_back(i + 1 < size ? kTable[(chunk >> 6) & 0x3f] : '=');
        output.push_back(i + 2 < size ? kTable[chunk & 0x3f] : '=');
    }

    return output;
}

std::string makeWebSocketAccept(const std::string& key) {
    Sha1State sha1;
    sha1Update(sha1, key + kGuid);
    const auto digest = sha1Final(sha1);
    return base64Encode(digest.data(), digest.size());
}
} // namespace

WebSocketServer::WebSocketServer(int port)
    : port_(port), serverSocket_(kInvalidSocket), clientSocket_(kInvalidSocket) {}

WebSocketServer::~WebSocketServer() {
    stop();
}

bool WebSocketServer::start() {
    if (running_) {
        return true;
    }

    if (!initializeSockets()) {
        return false;
    }

    serverSocket_ = socket(AF_INET, SOCK_STREAM, 0);
    if (serverSocket_ == kInvalidSocket) {
        shutdownSockets();
        return false;
    }

    int reuse = 1;
#ifdef _WIN32
    setsockopt(serverSocket_, SOL_SOCKET, SO_REUSEADDR, reinterpret_cast<const char*>(&reuse), sizeof(reuse));
#else
    setsockopt(serverSocket_, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof(reuse));
#ifdef SO_NOSIGPIPE
    int nosigpipe = 1;
    setsockopt(serverSocket_, SOL_SOCKET, SO_NOSIGPIPE, &nosigpipe, sizeof(nosigpipe));
#endif
#endif

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_ANY);
    addr.sin_port = htons(static_cast<std::uint16_t>(port_));

    if (bind(serverSocket_, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) != 0) {
        std::cerr << "[kontakt-bridge] failed to bind port " << port_ << std::endl;
        closeServerSocket();
        shutdownSockets();
        return false;
    }

    if (listen(serverSocket_, 1) != 0) {
        std::cerr << "[kontakt-bridge] failed to listen on port " << port_ << std::endl;
        closeServerSocket();
        shutdownSockets();
        return false;
    }

    running_ = true;
    acceptThread_ = std::thread(&WebSocketServer::acceptLoop, this);
    std::cout << "[kontakt-bridge] websocket listening on ws://localhost:" << port_ << std::endl;
    return true;
}

void WebSocketServer::stop() {
    if (!running_) {
        return;
    }

    running_ = false;
    closeServerSocket();
    closeClientSocket();

    if (acceptThread_.joinable()) {
        acceptThread_.join();
    }
    if (clientThread_.joinable()) {
        clientThread_.join();
    }

    shutdownSockets();
}

void WebSocketServer::setMessageHandler(MessageHandler handler) {
    messageHandler_ = std::move(handler);
}

void WebSocketServer::setConnectHandler(EventHandler handler) {
    connectHandler_ = std::move(handler);
}

void WebSocketServer::setDisconnectHandler(EventHandler handler) {
    disconnectHandler_ = std::move(handler);
}

bool WebSocketServer::hasClient() const {
    return clientConnected_;
}

bool WebSocketServer::sendText(const std::string& text) {
    return sendFrame(0x1u, text.data(), text.size());
}

bool WebSocketServer::sendBinary(const std::vector<std::uint8_t>& data) {
    return sendFrame(0x2u, data.data(), data.size());
}

bool WebSocketServer::initializeSockets() {
#ifdef _WIN32
    if (!socketsInitialized_) {
        WSADATA wsaData{};
        if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0) {
            return false;
        }
        socketsInitialized_ = true;
    }
#endif
    return true;
}

void WebSocketServer::shutdownSockets() {
#ifdef _WIN32
    if (socketsInitialized_) {
        WSACleanup();
        socketsInitialized_ = false;
    }
#endif
}

void WebSocketServer::acceptLoop() {
    // Block SIGPIPE on this thread
    sigset_t sigpipeMask;
    sigemptyset(&sigpipeMask);
    sigaddset(&sigpipeMask, SIGPIPE);
    pthread_sigmask(SIG_BLOCK, &sigpipeMask, nullptr);
    
    while (running_) {
        sockaddr_in clientAddr{};
#ifdef _WIN32
        int clientLen = sizeof(clientAddr);
#else
        socklen_t clientLen = sizeof(clientAddr);
#endif
        write(STDERR_FILENO, "[ws] accept waiting\n", 20);
        const SocketHandle socket = accept(serverSocket_, reinterpret_cast<sockaddr*>(&clientAddr), &clientLen);
        if (socket == kInvalidSocket) {
            continue;
        }

        write(STDERR_FILENO, "[ws] client accepted\n", 21);

        if (!performHandshake(socket)) {
            write(STDERR_FILENO, "[ws] handshake failed\n", 22);
            closeSocket(socket);
            continue;
        }

        write(STDERR_FILENO, "[ws] handshake ok\n", 18);
        replaceClient(socket);
        write(STDERR_FILENO, "[ws] replaceClient done\n", 24);
    }
}

void WebSocketServer::replaceClient(SocketHandle socket) {
    // Signal old client thread to stop, then close its socket
    closeClientSocket();
    if (clientThread_.joinable()) {
        // Give the old thread a short time to finish, then force-detach
        // to avoid blocking the accept loop when messageHandler_ is slow
        auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(2);
        bool joined = false;
        while (std::chrono::steady_clock::now() < deadline) {
            // Check if thread finished by attempting a timed join (via polling)
            if (!clientThread_.joinable()) { joined = true; break; }
            // Small sleep to allow thread to exit
            std::this_thread::sleep_for(std::chrono::milliseconds(50));
            // Try joining non-blocking by checking if the socket closed caused exit
            // clientThread_ will break out of clientLoop when recv fails
            // Just keep waiting until deadline
        }
        if (!joined && clientThread_.joinable()) {
            // Thread still stuck in messageHandler_ — detach it
            // (the old socket is closed so it will exit eventually)
            write(STDERR_FILENO, "[ws] old client thread slow, detaching\n", 39);
            clientThread_.detach();
        } else {
            clientThread_.join();
        }
    }

#if !defined(_WIN32) && defined(SO_NOSIGPIPE)
    int nosigpipe = 1;
    setsockopt(socket, SOL_SOCKET, SO_NOSIGPIPE, &nosigpipe, sizeof(nosigpipe));
#endif

    {
        std::lock_guard<std::mutex> lock(clientMutex_);
        clientSocket_ = socket;
        clientConnected_ = true;
    }

    if (connectHandler_) {
        connectHandler_();
    }

    clientThread_ = std::thread(&WebSocketServer::clientLoop, this);
}

void WebSocketServer::clientLoop() {
    write(STDERR_FILENO, "[ws] clientLoop started\n", 23);
    while (running_) {
        SocketHandle socket = kInvalidSocket;
        {
            std::lock_guard<std::mutex> lock(clientMutex_);
            socket = clientSocket_;
        }
        if (socket == kInvalidSocket) {
            write(STDERR_FILENO, "[ws] clientLoop: socket invalid, exiting\n", 41);
            break;
        }

        std::uint8_t opcode = 0;
        std::vector<std::uint8_t> payload;
        if (!readFrame(socket, opcode, payload)) {
            write(STDERR_FILENO, "[ws] clientLoop: readFrame failed, exiting\n", 43);
            break;
        }

        if (opcode == 0x1u) {
            // Log first 80 chars of text messages
            std::string msg(payload.begin(), payload.end());
            std::string logLine = "[ws] recv text: " + msg.substr(0, 80) + "\n";
            write(STDERR_FILENO, logLine.c_str(), logLine.size());
        } else if (opcode == 0x2u) {
            // binary — don't log (audio frames)
        } else {
            char buf[64];
            int len = snprintf(buf, sizeof(buf), "[ws] recv opcode=0x%02x len=%zu\n", opcode, payload.size());
            write(STDERR_FILENO, buf, len);
        }

        if (opcode == 0x1u && messageHandler_) {
            messageHandler_(std::string(payload.begin(), payload.end()));
        }
    }

    closeClientSocket();
}

bool WebSocketServer::performHandshake(SocketHandle socket) {
    std::string request;
    std::array<char, 1024> buffer{};

    while (request.find("\r\n\r\n") == std::string::npos) {
        const int received = recv(socket, buffer.data(), static_cast<int>(buffer.size()), 0);
        if (received <= 0) {
            return false;
        }
        request.append(buffer.data(), static_cast<std::size_t>(received));
        if (request.size() > 8192) {
            return false;
        }
    }

    std::istringstream stream(request);
    std::string line;
    std::string key;
    while (std::getline(stream, line)) {
        if (!line.empty() && line.back() == '\r') {
            line.pop_back();
        }
        const auto colon = line.find(':');
        if (colon == std::string::npos) {
            continue;
        }
        const auto headerName = lowercase(trim(line.substr(0, colon)));
        if (headerName == "sec-websocket-key") {
            key = trim(line.substr(colon + 1));
            break;
        }
    }

    if (key.empty()) {
        return false;
    }

    const std::string accept = makeWebSocketAccept(key);
    const std::string response =
        "HTTP/1.1 101 Switching Protocols\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        "Sec-WebSocket-Accept: " + accept + "\r\n\r\n";

    return sendAll(socket, response.data(), response.size());
}

bool WebSocketServer::readFrame(SocketHandle socket, std::uint8_t& opcode, std::vector<std::uint8_t>& payload) {
    std::uint8_t header[2]{};
    if (!recvAll(socket, header, sizeof(header))) {
        return false;
    }

    opcode = static_cast<std::uint8_t>(header[0] & 0x0fu);
    const bool masked = (header[1] & 0x80u) != 0;
    std::uint64_t payloadLength = header[1] & 0x7fu;

    if (payloadLength == 126) {
        std::uint8_t extended[2]{};
        if (!recvAll(socket, extended, sizeof(extended))) {
            return false;
        }
        payloadLength = (static_cast<std::uint64_t>(extended[0]) << 8) | static_cast<std::uint64_t>(extended[1]);
    } else if (payloadLength == 127) {
        std::uint8_t extended[8]{};
        if (!recvAll(socket, extended, sizeof(extended))) {
            return false;
        }
        payloadLength = 0;
        for (std::uint8_t byte : extended) {
            payloadLength = (payloadLength << 8) | static_cast<std::uint64_t>(byte);
        }
    }

    std::uint8_t mask[4]{};
    if (masked && !recvAll(socket, mask, sizeof(mask))) {
        return false;
    }

    payload.resize(static_cast<std::size_t>(payloadLength));
    if (payloadLength > 0 && !recvAll(socket, payload.data(), payload.size())) {
        return false;
    }

    if (masked) {
        for (std::size_t i = 0; i < payload.size(); ++i) {
            payload[i] ^= mask[i % 4];
        }
    }

    if (opcode == 0x8u) {
        return false;
    }

    if (opcode == 0x9u) {
        sendFrame(0xAu, payload.data(), payload.size());
        return true;
    }

    return true;
}

bool WebSocketServer::sendFrame(std::uint8_t opcode, const void* data, std::size_t size) {
    std::lock_guard<std::mutex> sendLock(sendMutex_);
    SocketHandle socket = kInvalidSocket;
    {
        std::lock_guard<std::mutex> lock(clientMutex_);
        socket = clientSocket_;
    }

    if (socket == kInvalidSocket) {
        return false;
    }

    std::vector<std::uint8_t> header;
    header.push_back(static_cast<std::uint8_t>(0x80u | (opcode & 0x0fu)));

    if (size < 126) {
        header.push_back(static_cast<std::uint8_t>(size));
    } else if (size <= 0xffffu) {
        header.push_back(126);
        header.push_back(static_cast<std::uint8_t>((size >> 8) & 0xffu));
        header.push_back(static_cast<std::uint8_t>(size & 0xffu));
    } else {
        header.push_back(127);
        for (int shift = 56; shift >= 0; shift -= 8) {
            header.push_back(static_cast<std::uint8_t>((static_cast<std::uint64_t>(size) >> shift) & 0xffu));
        }
    }

    if (!sendAll(socket, header.data(), header.size())) {
        // Send failed — close the dead client
        closeClientSocket();
        return false;
    }
    if (size == 0) {
        return true;
    }
    if (!sendAll(socket, data, size)) {
        closeClientSocket();
        return false;
    }
    return true;
}

void WebSocketServer::closeServerSocket() {
    if (serverSocket_ != kInvalidSocket) {
        closeSocket(serverSocket_);
        serverSocket_ = kInvalidSocket;
    }
}

void WebSocketServer::closeClientSocket() {
    bool wasConnected = false;
    {
        std::lock_guard<std::mutex> lock(clientMutex_);
        if (clientSocket_ != kInvalidSocket) {
            closeSocket(clientSocket_);
            clientSocket_ = kInvalidSocket;
            wasConnected = clientConnected_.exchange(false);
        }
    }

    if (wasConnected && disconnectHandler_) {
        disconnectHandler_();
    }
}
