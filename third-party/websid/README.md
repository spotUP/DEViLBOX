# WebSid (WebAudio version of Tiny'R'Sid)

This is a JavaScript/WebAudio based C64 emulator / music player. This plugin is designed to work with my
generic WebAudio ScriptProcessor music player (see separate project).

It allows to play .mus and RSID/PSID format *.sid music files. (Respective music files can be found here: http://www.hvsc.c64.org/)

There also is a WordPress plugin that allows to easily integrate the player: https://wordpress.org/plugins/tinyrsid-adapter/


This current version uses a cycle-by-cycle emulation approach (i.e. it has been substantially rewritten). As compared
to the previously used "predictive" approach it allows for a much simpler implementation and it simply avoids most of
the problems that had haunted the old implementation (e.g. correct timing of ADSR-delay bug, etc). Unfortunately the
new implementation is computationally much more expensive (50-100% more CPU).

The emulator logic is written in C/C++. This code is then cross-compiled into a JavaScript library suitable for the Web.

Known limitations: see src/KnownLimitations.txt for details


![alt text](https://github.com/wothke/websid/raw/master/tinyrsid.jpg "Tiny'R'Sid HVSC Explorer")

An online demo of the emulator can be found here: 
 
* http://www.wothke.ch/websid_stereo 
* http://www.wothke.ch/websid_filter 
* http://www.wothke.ch/websid

A special application for using the emulator with a real SID chip on a Raspberry PI 4 can be found in the "raspi" folder.


## Credits

* old/original TinySid PSID emulator code (there is not much left of it..) - Copyright (C) 1999-2012 T. Hinrichs, R. Sinsch
* "combined waveform" generation, "waveform anti-aliasing" and "filter" implementation by Hermit (see http://hermit.sidrip.com)
* based on various reverse engineering information by: Christian Bauer, Wolfgang Lorenz, resid team, etc
* playback of Compute! .mus files is based on "Enhanced Sidplayer" by Craig Chamberlain
* MD5 Message-Digest Algorithm, Copyright (C) 1990, RSA Data Security

## Howto build

You'll need Emscripten; see http://kripken.github.io/emscripten-site/docs/getting_started/downloads.html . In case you want to
compile to WebAssembly (see respective "WASM" switch in the make-scripts) then you'll need at least emscripten 1.37.29 (for
use of WASM you'll then also need a recent version of my respective "WebAudio ScriptProcessor music player").

The below instructions assume a command prompt has been opened within the "websid" folder, and that the Emscripten environment
vars have been set (run emsdk_env.bat).

Running the makeEmscripten.bat will generate a JavaScript 'Tiny'R'Sid' library (backend_tinyrsid.js - and a separate tinyrsid.wasm file
if you are compiling to WebAssembly) including necessary interface APIs. This output is directly written into the web-page example in
the "htdocs" sub-folder. (This generated lib is used from some manually written JavaScript/WebAudio code, see
htdocs/stdlib/scriptprocessor_player.min.js). Study the example in "htdocs" for how the player is used.

Running the makeEmscriptenTest.bat will generate test version which is directly written into the web-page example in
the "htdocs_test" sub-folder (the respective page then allows to run the various tests from Wolfgang Lorenz's "test-suite").

Disclaimer: the .sh version of the make-script has been contributed by somebody else and I am not maintaing it or verifying that it still works.

Note: Due to some bug in Apple's JavaScriptCore (as of iOS 11.4) the regularily built version will not work on iOS devices. As
a workaround you can compile using "-s SAFE_HEAP=1". This will make for slower code but it seems to be the only way around
the iCrap bug.


## Depencencies

The current version requires version >=1.3 of my https://bitbucket.org/wothke/webaudio-player/


## Usage

Have a look at the non-minified version of the above webaudio-player and/or the example in the htdocs folder.

Here a minimalistic example to get you started:

	<!DOCTYPE html>
	<html>
	<head>
		<title>webSID - minimal example for player usage</title>
		
		<meta charset="utf-8" />
		<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
		<meta http-equiv="X-UA-Compatible" content="chrome=1" />

		<script src="scriptprocessor_player.min.js"></script>
		<script src="backend_websid.js"></script>
		<script>
			let loadSong = function() {
				let onFail = function()						{ /* called if song loading fails */ };
				let onProgress = function(total, loaded)	{ /* called to update load progress - irrelevant in C64 scenario */ };
					
				let filename = "Trick_n_Treat.sid"
				
				let options= {};
				options.track = -1;			// use song's default track (select specific track if you want)
				options.timeout = -1;		// endless play (use specific song length in secs if you want)
				options.traceSID = false;	// disable scope data streams (enable if you want to visualize voice streams)
					
				ScriptNodePlayer.loadMusicFromURL(filename, options, onFail, onProgress).then((status) => {
					// do whatever you like once the song it playing
					let songInfo = ScriptNodePlayer.getInstance().getSongInfo();

					let span = document.getElementById("info");
					span.textContent = songInfo.songName + " (track: " + songInfo.actualSubsong+")";				
				});
			};
			
			let initPlayer = function() {
				// very few songs require the original ROM images - which you could add here if needed (base64 encoded)
				let BASIC_ROM, KERNAL_ROM, CHAR_ROM;
				window.backend = new SIDBackendAdapter(BASIC_ROM, CHAR_ROM, KERNAL_ROM);
				
				let onTrackEnd = function() { /* called when track ends.. you could load another song now - see loadSong */ };
				
				ScriptNodePlayer.initialize(window.backend, onTrackEnd)
				.then((msg) => {
					loadSong();
				});
			}
		
		
			window.play = function() {
				// trigger initialization of the player from a "user engagement" (i.e. a button click) 
				// (see respective dumbshit browser policy that the Chrome/FF morons added some years ago)
			
				let player = ScriptNodePlayer.getInstance();
				
				if (player) 
					player.resume();
				else
					initPlayer();
			};

			window.pause = function() {
				let player = ScriptNodePlayer.getInstance();
				if (player) 
					player.pause();
			};
		
		</script>
	</head>
	<body>
		<div>playing: <span id="info">-</span></div>
		<button type="button" onclick="window.play()">play</button>
		<button type="button" onclick="window.pause()">pause</button>
	</body>
	</html>
 

## License

Terms of Use: This software is licensed under a CC BY-NC-SA (http://creativecommons.org/licenses/by-nc-sa/4.0/)


## Sponsors

At certain points there are expenses associated with this hobby project and I am grateful whenever members of the
community step in to lend a helping hand (also see https://www.wothke.ch/websid/donate.html ). Many thanks go to the below
individuals that have kindly supported this project!

* Laszlo Vincenzo Vincze
* Chris Jackson
* Joel Knepper
* Jens-Christian Huus
* Jani Joeli
* Imre Olajos Jr
* Piero Iellamo
* AnDruid
