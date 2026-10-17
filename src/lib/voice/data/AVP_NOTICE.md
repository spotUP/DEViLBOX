# Amateur Vocal Percussion Dataset: attribution

`avpPrior.json` holds 180 feature vectors (60 kick, 60 snare, 60 hat) derived
from the Amateur Vocal Percussion (AVP) Dataset. The drum classifier uses them
as its fallback for any class the user has not trained with their own voice.

- Dataset: Amateur Vocal Percussion Dataset
- Author: Alejandro Delgado (ROLI Ltd. / Queen Mary University of London)
- Source: https://zenodo.org/records/3250230
- DOI: 10.5281/zenodo.3250230
- License: Creative Commons Attribution 4.0 International (CC BY 4.0),
  https://creativecommons.org/licenses/by/4.0/

Changes made: no audio is redistributed. Each Kick, Snare, HHclosed and
HHopened recording (Fixed and Personal sessions) was resampled to 22050 Hz and
run through DEViLBOX's own onset detector and hit-feature extractor
(`src/lib/voice/drumHits.ts`). Only detected onsets within 50 ms of an
annotated onset were kept; closed and open hats were merged into one hat
class; 60 hits per class were picked round-robin across the 28 performers.
Values are rounded to 5 significant digits. Regenerate with
`tools/voice/build-avp-prior.ts`.
