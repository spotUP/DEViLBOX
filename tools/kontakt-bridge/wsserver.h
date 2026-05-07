#pragma once

#include <atomic>
#include <cstdint>
#include <functional>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#ifdef _WIN32
#include <winsock2.h>
using SocketHandle = SOCKET;
#else
using SocketHandle = int;
#endif

class WebSocketServer {
public:
    using MessageHandler = std::function<void(const std::string&)>;
    using EventHandler = std::function<void()>;

    explicit WebSocketServer(int port);
    ~WebSocketServer();

    bool start();
    void stop();

    void setMessageHandler(MessageHandler handler);
    void setConnectHandler(EventHandler handler);
    void setDisconnectHandler(EventHandler handler);

    bool hasClient() const;
    bool sendText(const std::string& text);
    bool sendBinary(const std::vector<std::uint8_t>& data);

private:
    bool initializeSockets();
    void shutdownSockets();
    void acceptLoop();
    void clientLoop();
    bool performHandshake(SocketHandle socket);
    bool readFrame(SocketHandle socket, std::uint8_t& opcode, std::vector<std::uint8_t>& payload);
    bool sendFrame(std::uint8_t opcode, const void* data, std::size_t size);
    void closeServerSocket();
    void closeClientSocket();
    void replaceClient(SocketHandle socket);

    int port_;
    std::atomic<bool> running_{false};
    std::atomic<bool> clientConnected_{false};
    SocketHandle serverSocket_{};
    SocketHandle clientSocket_{};
    std::thread acceptThread_;
    std::thread clientThread_;
    std::mutex clientMutex_;
    std::mutex sendMutex_;
    MessageHandler messageHandler_;
    EventHandler connectHandler_;
    EventHandler disconnectHandler_;
    bool socketsInitialized_{false};
};
