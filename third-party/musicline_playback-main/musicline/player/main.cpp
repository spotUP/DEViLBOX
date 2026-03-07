#include "audio_output.h"
#include "mline_backend.h"
#ifdef HAVE_UADE
#include "uade_backend.h"
#endif
#include "wav_writer.h"

#include "../module.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <signal.h>
#include <string>
#include <vector>

#ifdef _WIN32
#define NOMINMAX
#include <conio.h>
#include <windows.h>
#else
#include <termios.h>
#include <unistd.h>
#endif

#ifdef HAVE_UADE
// UADE per-channel capture API (C linkage)
extern "C" {
void ml_perchan_init(int max_samples);
void ml_perchan_free(void);
int ml_perchan_get_count(void);
int16_t* ml_perchan_get_channel(int ch);
}
#endif

static volatile bool g_running = true;

static void signal_handler(int /*sig*/) {
    g_running = false;
}

#ifdef _WIN32

static int kbhit_char() {
    if (_kbhit()) {
        return _getch();
    }
    return 0;
}

struct TerminalMode {
    void set_raw() {}
    void restore() {}
};

static void sleep_ms(int ms) {
    Sleep(ms);
}

#else

struct TerminalMode {
    struct termios old_tio;
    bool restored = true;

    void set_raw() {
        struct termios new_tio;
        tcgetattr(STDIN_FILENO, &old_tio);
        new_tio = old_tio;
        new_tio.c_lflag &= ~(ICANON | ECHO);
        new_tio.c_cc[VMIN] = 0;
        new_tio.c_cc[VTIME] = 0;
        tcsetattr(STDIN_FILENO, TCSANOW, &new_tio);
        restored = false;
    }

    void restore() {
        if (!restored) {
            tcsetattr(STDIN_FILENO, TCSANOW, &old_tio);
            restored = true;
        }
    }

    ~TerminalMode() {
        restore();
    }
};

static int kbhit_char() {
    char ch;
    int nread = read(STDIN_FILENO, &ch, 1);
    if (nread == 1) {
        return ch;
    }
    return 0;
}

static void sleep_ms(int ms) {
    usleep(ms * 1000);
}

#endif

static void print_usage(const char* program) {
    printf("Musicline Player\n\n");
    printf("Usage: %s <file.ml> [options]\n\n", program);
    printf("Backends:\n");
#ifdef HAVE_UADE
    printf("  -u, --uade              Use UADE backend\n");
#endif
    printf("  -m, --mline             Use MLINE backend (default)\n");
    printf("  -s, --subsong <n>       Subsong number (default: 0)\n");
#ifdef HAVE_UADE
    printf("  --uade-data <path>      UADE data directory\n\n");
#endif
    printf("Audio:\n");
    printf("  --rate <hz>             Sample rate (default: 28150)\n");
    printf("  --stereo-sep <0-1>      Stereo separation (default: 1.0)\n");
    printf("  --audio-out             Real-time audio playback\n\n");
    printf("WAV output:\n");
    printf("  -w, --wav <prefix>      Write WAV file(s) and exit\n");
    printf("  --per-channel           Also write per-channel mono WAVs\n");
    printf("  --duration <sec>        Duration (default: 30 for WAV)\n\n");
    printf("Keyboard controls (--audio-out):\n");
#ifdef HAVE_UADE
    printf("  1 = UADE, 2 = MLINE, c = cycle channels, a = all channels, q = quit\n");
#else
    printf("  c = cycle channels, a = all channels, q = quit\n");
#endif
}

static void print_song_info(MlineBackend& mline) {
    printf("Song info:\n");
    if (mline.get_info_title()[0])
        printf("  Title:  %s\n", mline.get_info_title());
    if (mline.get_info_author()[0])
        printf("  Author: %s\n", mline.get_info_author());
    if (mline.get_info_date()[0])
        printf("  Date:   %s\n", mline.get_info_date());
    printf("  Channels: %d\n", mline.get_channel_count());
    printf("  Subsongs: %d\n", mline.get_subsong_count());
    for (int i = 0; i < mline.get_subsong_count(); i++) {
        const char* name = mline.get_subsong_name(i);
        if (name[0])
            printf("    [%d] %s\n", i, name);
    }
}

// Render backend to stereo S16 samples
static void render_to_s16(MlineBackend& mline, std::vector<int16_t>& out, int total_frames) {
    const int chunk = 1024;
    std::vector<float> fbuf(chunk * 2);
    out.reserve(total_frames * 2);

    int rendered = 0;
    while (rendered < total_frames) {
        int n = std::min(chunk, total_frames - rendered);
        int ret = mline.render(fbuf.data(), n);
        if (ret <= 0)
            break;
        for (int i = 0; i < ret * 2; i++) {
            float v = fbuf[i] * 32767.0f;
            v = std::max(-32768.0f, std::min(32767.0f, v));
            out.push_back(static_cast<int16_t>(v));
        }
        rendered += ret;
    }
}

#ifdef HAVE_UADE
static void render_uade_to_s16(UadeBackend& uade, std::vector<int16_t>& out, int total_frames) {
    const int chunk = 1024;
    std::vector<float> fbuf(chunk * 2);
    out.reserve(total_frames * 2);

    int rendered = 0;
    while (rendered < total_frames) {
        int n = std::min(chunk, total_frames - rendered);
        int ret = uade.render(fbuf.data(), n);
        if (ret <= 0)
            break;
        for (int i = 0; i < ret * 2; i++) {
            float v = fbuf[i] * 32767.0f;
            v = std::max(-32768.0f, std::min(32767.0f, v));
            out.push_back(static_cast<int16_t>(v));
        }
        rendered += ret;
    }
}
#endif

int main(int argc, char** argv) {
    if (argc < 2) {
        print_usage(argv[0]);
        return 1;
    }

    // Parse arguments
    const char* filepath = nullptr;
    bool use_uade = false;
    bool use_mline = true;
    int subsong = 0;
    std::string uade_data_path;
    int output_rate = 0; // 0 = default (28150)
    float stereo_sep = 1.0f;
    bool audio_out = false;
    std::string wav_prefix;
    bool per_channel = false;
    int duration_seconds = 30;

    for (int i = 1; i < argc; i++) {
        std::string arg = argv[i];
        if (arg == "-h" || arg == "--help") {
            print_usage(argv[0]);
            return 0;
        } else if (arg == "-u" || arg == "--uade") {
            use_uade = true;
            use_mline = false;
        } else if (arg == "-m" || arg == "--mline") {
            use_mline = true;
            use_uade = false;
        } else if (arg == "-s" || arg == "--subsong") {
            if (i + 1 < argc)
                subsong = atoi(argv[++i]);
        } else if (arg == "--uade-data") {
            if (i + 1 < argc)
                uade_data_path = argv[++i];
        } else if (arg == "--rate") {
            if (i + 1 < argc)
                output_rate = atoi(argv[++i]);
        } else if (arg == "--stereo-sep") {
            if (i + 1 < argc)
                stereo_sep = atof(argv[++i]);
        } else if (arg == "--audio-out") {
            audio_out = true;
        } else if (arg == "-w" || arg == "--wav") {
            if (i + 1 < argc)
                wav_prefix = argv[++i];
        } else if (arg == "--per-channel") {
            per_channel = true;
        } else if (arg == "--duration") {
            if (i + 1 < argc)
                duration_seconds = atoi(argv[++i]);
        } else if (arg[0] != '-') {
            filepath = argv[i];
        } else {
            fprintf(stderr, "Unknown option: %s\n", arg.c_str());
            return 1;
        }
    }

    if (!filepath) {
        fprintf(stderr, "Error: no input file specified\n");
        return 1;
    }

#ifndef HAVE_UADE
    if (use_uade) {
        fprintf(stderr, "Error: UADE backend not available in this build\n");
        return 1;
    }
#endif

    // Default UADE data path
    if (uade_data_path.empty()) {
        uade_data_path = "/home/emoon/code/projects/musicline_playback/musicline/uade/uade";
    }

    signal(SIGINT, signal_handler);

    // For audio-out mode, load both backends so the user can switch live
    bool load_uade = use_uade || audio_out;
    bool load_mline = use_mline || audio_out;

    // Initialize backends
#ifdef HAVE_UADE
    UadeBackend uade;
#endif
    MlineBackend mline;
    bool uade_loaded = false;
    bool mline_loaded = false;

#ifdef HAVE_UADE
    if (load_uade) {
        if (output_rate > 0)
            uade.set_sample_rate(output_rate);
        if (!uade.init(uade_data_path.c_str())) {
            fprintf(stderr, "Failed to initialize UADE\n");
            if (!audio_out)
                return 1;
        } else if (uade.load(filepath)) {
            uade_loaded = true;
            printf("UADE: Loaded %s\n", filepath);
            printf("  Format: %s\n", uade.get_format_name());
            if (subsong != 0)
                uade.set_subsong(subsong);
        } else {
            fprintf(stderr, "UADE: Failed to load %s\n", filepath);
        }
    }
#else
    (void)load_uade;
#endif

    if (load_mline) {
        if (mline.load(filepath)) {
            mline_loaded = true;
            printf("MLINE: Loaded %s\n", filepath);
            if (subsong != 0)
                mline.set_subsong(subsong);
            print_song_info(mline);
        } else {
            fprintf(stderr, "MLINE: Failed to load %s\n", filepath);
        }
    }

    if (!uade_loaded && !mline_loaded) {
        fprintf(stderr, "No backend loaded successfully\n");
        return 1;
    }

    // Apply output rate and stereo separation for MLINE
    const int rate = (output_rate > 0) ? output_rate : 28150;
    if (mline_loaded && mline.get_module()) {
        if (output_rate > 0) {
            mline.get_module()->SetOutputRate(output_rate);
            printf("MLINE: Output rate set to %d Hz\n", output_rate);
        }
        if (stereo_sep < 1.0f) {
            mline.get_module()->SetStereoSeparation(stereo_sep);
            printf("MLINE: Stereo separation set to %.2f\n", stereo_sep);
        }
    }

    // WAV output mode
    if (!wav_prefix.empty()) {
        printf("\nRendering %d seconds to WAV...\n", duration_seconds);

#ifdef HAVE_UADE
        if (uade_loaded) {
            const int uade_rate = 28150;
            const int total_frames = uade_rate * duration_seconds;
            std::vector<int16_t> samples;
            render_uade_to_s16(uade, samples, total_frames);

            std::string fname = wav_prefix + "_uade.wav";
            write_wav(fname.c_str(), samples, uade_rate);

            // Per-channel UADE WAVs
            if (per_channel) {
                ml_perchan_init(total_frames);
                // Re-render to capture per-channel data
                uade.stop();
                uade.load(filepath);
                if (subsong != 0)
                    uade.set_subsong(subsong);

                std::vector<int16_t> discard;
                render_uade_to_s16(uade, discard, total_frames);

                int count = ml_perchan_get_count();
                for (int ch = 0; ch < 4; ch++) {
                    int16_t* buf = ml_perchan_get_channel(ch);
                    if (buf && count > 0) {
                        char chname[256];
                        snprintf(chname, sizeof(chname), "%s_uade_ch%d.wav", wav_prefix.c_str(), ch);
                        write_wav_mono(chname, buf, count, uade_rate);
                    }
                }
                ml_perchan_free();
            }
        }
#endif

        if (mline_loaded) {
            const int mline_rate = (output_rate > 0) ? output_rate : 28150;
            const int total_frames = mline_rate * duration_seconds;

            // Stereo mix
            std::vector<int16_t> samples;
            render_to_s16(mline, samples, total_frames);

            std::string fname = wav_prefix + "_mline.wav";
            write_wav(fname.c_str(), samples, mline_rate);

            // Per-channel MLINE WAVs (multi-pass: reload and solo each channel)
            if (per_channel) {
                int nch = mline.get_channel_count();
                // Need to reload for per-channel since we already rendered the stereo mix
                for (int ch = 0; ch < nch; ch++) {
                    // Reload the module fresh for each channel
                    MlineBackend ch_mline;
                    if (!ch_mline.load(filepath))
                        continue;
                    if (subsong != 0)
                        ch_mline.set_subsong(subsong);
                    if (output_rate > 0 && ch_mline.get_module())
                        ch_mline.get_module()->SetOutputRate(output_rate);

                    ch_mline.set_single_channel(ch);

                    std::vector<int16_t> ch_samples;
                    render_to_s16(ch_mline, ch_samples, total_frames);

                    // Extract mono from stereo (left channel for Amiga left channels, right for right)
                    // Simpler: just take left channel as mono since single-channel isolates to one side
                    std::vector<int16_t> mono(ch_samples.size() / 2);
                    for (size_t i = 0; i < mono.size(); i++) {
                        // Mix L+R to mono for the single-channel output
                        int mix = ch_samples[i * 2] + ch_samples[i * 2 + 1];
                        mono[i] = static_cast<int16_t>(std::max(-32768, std::min(32767, mix)));
                    }

                    char chname[256];
                    snprintf(chname, sizeof(chname), "%s_mline_ch%d.wav", wav_prefix.c_str(), ch);
                    write_wav_mono(chname, mono.data(), static_cast<int>(mono.size()), mline_rate);
                }
            }
        }

        printf("Done.\n");
#ifdef HAVE_UADE
        uade.shutdown();
#endif
        return 0;
    }

    // Real-time audio playback mode
    if (audio_out) {
        if (!uade_loaded && !mline_loaded) {
            fprintf(stderr, "No backend loaded for audio playback\n");
            return 1;
        }

        AudioOutput audio;
        if (!audio.init(rate)) {
            fprintf(stderr, "Failed to initialize audio output\n");
            return 1;
        }

#ifdef HAVE_UADE
        audio.set_backends(uade_loaded ? &uade : nullptr, mline_loaded ? &mline : nullptr);
#else
        audio.set_backends(mline_loaded ? &mline : nullptr);
#endif

        // Start with the backend the user requested, falling back to whichever loaded
        AudioOutput::Source initial_source;
#ifdef HAVE_UADE
        if (use_uade && uade_loaded)
            initial_source = AudioOutput::Source::UADE;
        else
#endif
        if (mline_loaded)
            initial_source = AudioOutput::Source::MLINE;
        else
            initial_source = AudioOutput::Source::UADE;
        audio.set_source(initial_source);
        audio.start();

        TerminalMode term;
        term.set_raw();

        int current_channel = -1; // -1 = all

        printf("\nPlaying [%s]", initial_source == AudioOutput::Source::UADE ? "UADE" : "MLINE");
        printf("  (q=quit");
#ifdef HAVE_UADE
        if (uade_loaded)
            printf(", 1=UADE");
#endif
        if (mline_loaded)
            printf(", 2=MLINE, c=cycle ch, a=all ch");
        printf(")\n");

        while (g_running) {
            int key = kbhit_char();
            if (key == 'q' || key == 'Q') {
                break;
#ifdef HAVE_UADE
            } else if (key == '1' && uade_loaded) {
                audio.set_source(AudioOutput::Source::UADE);
                printf("\r  Source: UADE                    \n");
#endif
            } else if (key == '2' && mline_loaded) {
                audio.set_source(AudioOutput::Source::MLINE);
                printf("\r  Source: MLINE                   \n");
            } else if (key == 'c' || key == 'C') {
                if (mline_loaded && audio.get_source() == AudioOutput::Source::MLINE) {
                    int nch = mline.get_channel_count();
                    current_channel++;
                    if (current_channel >= nch)
                        current_channel = 0;
                    mline.set_single_channel(current_channel);
                    printf("\r  Channel: %d / %d              \n", current_channel + 1, nch);
                }
            } else if (key == 'a' || key == 'A') {
                if (mline_loaded && audio.get_source() == AudioOutput::Source::MLINE) {
                    current_channel = -1;
                    mline.set_single_channel(-1);
                    printf("\r  Channel: ALL                    \n");
                }
            }

            // Display time
            printf("\r  %.1f sec", audio.get_time());
            fflush(stdout);

            sleep_ms(50);
        }

        printf("\n");
        term.restore();
        audio.shutdown();
#ifdef HAVE_UADE
        uade.shutdown();
#endif
        return 0;
    }

    // No output mode specified
    fprintf(stderr, "No output mode specified. Use --audio-out or -w <prefix>\n");
#ifdef HAVE_UADE
    uade.shutdown();
#endif
    return 1;
}
