#import "augui.h"

#ifdef __APPLE__
#import <Cocoa/Cocoa.h>
#import <AudioUnit/AUCocoaUIView.h>
#import <CoreAudioKit/CoreAudioKit.h>
#include <atomic>
#include <map>
#include <mutex>
#include <string>

static std::map<int, NSWindow*> gPluginWindows;
static std::atomic<AudioUnit> gPendingGUIUnit{nullptr};
static std::atomic<int> gPendingGUISlot{-1};
static std::atomic<int> gPendingCloseSlot{-1};
static std::mutex gPendingGUIMutex;
static std::string gPendingPluginName;

static NSView* getCocoaViewForAU(AudioUnit unit) {
    UInt32 dataSize = 0;
    Boolean writable = false;
    OSStatus err = AudioUnitGetPropertyInfo(unit,
        kAudioUnitProperty_CocoaUI,
        kAudioUnitScope_Global, 0,
        &dataSize, &writable);

    if (err != noErr || dataSize == 0) return nil;

    AudioUnitCocoaViewInfo* viewInfo = (AudioUnitCocoaViewInfo*)malloc(dataSize);
    err = AudioUnitGetProperty(unit,
        kAudioUnitProperty_CocoaUI,
        kAudioUnitScope_Global, 0,
        viewInfo, &dataSize);

    if (err != noErr) { free(viewInfo); return nil; }

    NSURL* bundleURL = (NSURL*)viewInfo->mCocoaAUViewBundleLocation;
    NSString* className = (NSString*)viewInfo->mCocoaAUViewClass[0];
    free(viewInfo);

    if (!bundleURL || !className) return nil;

    NSBundle* bundle = [NSBundle bundleWithURL:bundleURL];
    if (!bundle) {
        fprintf(stderr, "[augui] Failed to load bundle: %s\n", [[bundleURL path] UTF8String]);
        return nil;
    }

    Class factoryClass = [bundle classNamed:className];
    if (!factoryClass) {
        [bundle load];
        factoryClass = [bundle classNamed:className];
    }
    if (!factoryClass) {
        fprintf(stderr, "[augui] Factory class not found: %s\n", [className UTF8String]);
        return nil;
    }

    id<AUCocoaUIBase> factory = [[factoryClass alloc] init];
    if (!factory) {
        fprintf(stderr, "[augui] Failed to create factory\n");
        return nil;
    }

    return [factory uiViewForAudioUnit:unit withSize:NSMakeSize(800, 600)];
}

static NSView* getGenericViewForAU(AudioUnit unit) {
    AUGenericView* genericView = [[AUGenericView alloc] initWithAudioUnit:unit];
    if (genericView) [genericView setShowsExpertParameters:YES];
    return genericView;
}

bool showAUPluginGUI(AudioUnit unit, const char* pluginName, int slot) {
    if (!unit || slot < 0) return false;
    {
        std::lock_guard<std::mutex> lock(gPendingGUIMutex);
        gPendingPluginName = pluginName ? pluginName : "Audio Unit";
    }
    gPendingGUISlot.store(slot);
    gPendingGUIUnit.store(unit);
    fprintf(stderr, "[augui] GUI open request queued for slot %d\n", slot);
    return true;
}

void closeAUPluginGUI(int slot) {
    if (slot < 0) return;
    gPendingCloseSlot.store(slot);
}

void pollGUI() {
    const int slotToOpen = gPendingGUISlot.exchange(-1);
    AudioUnit unit = (slotToOpen >= 0) ? gPendingGUIUnit.exchange(nullptr) : nullptr;
    std::string pluginName;
    if (slotToOpen >= 0) {
        std::lock_guard<std::mutex> lock(gPendingGUIMutex);
        pluginName = gPendingPluginName;
    }
    if (slotToOpen >= 0 && unit) {
        @autoreleasepool {
            auto existingIt = gPluginWindows.find(slotToOpen);
            if (existingIt != gPluginWindows.end() && existingIt->second) {
                [existingIt->second close];
                gPluginWindows.erase(existingIt);
            }

            NSView* pluginView = getCocoaViewForAU(unit);
            NSString* viewType = @"Cocoa";
            if (!pluginView) {
                pluginView = getGenericViewForAU(unit);
                viewType = @"Generic";
            }
            if (!pluginView) {
                fprintf(stderr, "[augui] No UI available for plugin in slot %d\n", slotToOpen);
                return;
            }

            NSSize viewSize = [pluginView fittingSize];
            if (viewSize.width < 100) viewSize.width = [pluginView frame].size.width;
            if (viewSize.height < 100) viewSize.height = [pluginView frame].size.height;
            if (viewSize.width < 200) viewSize.width = 800;
            if (viewSize.height < 200) viewSize.height = 600;

            NSRect frame = NSMakeRect(100 + (slotToOpen * 24), 100 + (slotToOpen * 24), viewSize.width, viewSize.height);
            NSUInteger style = NSWindowStyleMaskTitled | NSWindowStyleMaskClosable |
                               NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable;

            NSWindow* window = [[NSWindow alloc] initWithContentRect:frame
                                                           styleMask:style
                                                             backing:NSBackingStoreBuffered
                                                               defer:NO];

            NSString* title = [NSString stringWithFormat:@"Slot %d — %s", slotToOpen, pluginName.c_str()];
            [window setTitle:title];
            [window setContentView:pluginView];
            [window setReleasedWhenClosed:NO];
            [window setLevel:NSNormalWindowLevel];
            [window setAcceptsMouseMovedEvents:YES];
            [window makeKeyAndOrderFront:nil];
            [NSApp activateIgnoringOtherApps:YES];

            gPluginWindows[slotToOpen] = window;
            fprintf(stderr, "[augui] Opened %s UI for slot %d: %s (%.0fx%.0f)\n",
                    [viewType UTF8String], slotToOpen, pluginName.c_str(), viewSize.width, viewSize.height);
        }
    }

    const int slotToClose = gPendingCloseSlot.exchange(-1);
    if (slotToClose >= 0) {
        auto it = gPluginWindows.find(slotToClose);
        if (it != gPluginWindows.end() && it->second) {
            [it->second close];
            gPluginWindows.erase(it);
            fprintf(stderr, "[augui] Closed plugin UI for slot %d\n", slotToClose);
        }
    }
}

#endif
