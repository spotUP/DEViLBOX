# DX7 patch library: attribution

Every bank in `dx7/` is listed below with its author or compiler, source URL and licence. The same fields are in `dx7/manifest.json` for every bank. Retrieved 2026-10-15.

Policy: free community-made sets are bundled even where no licence is stated. Sold or purchase-only packs, manufacturer factory sets and sets whose terms forbid redistribution are left out. To withdraw a bank, delete its file and its manifest entry.

Import repair: some originals held out-of-range parameter bytes (for example a fine frequency of 127 where the DX7 maximum is 99) or non-printable name bytes. Shipped files are the originals re-packed after clamping those bytes, with a recomputed checksum; `repairedBytes` in the manifest counts them per bank.

## Dexed bundled cartridges

- Source: https://github.com/asb2m10/dexed (`assets/builtin_pgm.zip`)
- Licence text: Dexed's `LICENSE` is "GNU GENERAL PUBLIC LICENSE, Version 3, 29 June 2007"; the cartridge files carry no separate licence, so the repository licence is relied on.
- Credit: the Dexed README lists "DX7 program compilation : Jean-Marc Desprez (author of SynprezFM)" (http://www.synprez.com/SynprezFM). Individual voice authors are not recorded.

| File | Bank | Voices | Bytes clamped |
|------|------|--------|---------------|
| dexed-dexed-01.syx | Dexed Dexed 01 | 32 | 2 |
| dexed-synprezfm-01.syx | Dexed SynprezFM 01 | 32 | 0 |
| dexed-synprezfm-02.syx | Dexed SynprezFM 02 | 32 | 0 |
| dexed-synprezfm-03.syx | Dexed SynprezFM 03 | 32 | 0 |
| dexed-synprezfm-04.syx | Dexed SynprezFM 04 | 32 | 0 |
| dexed-synprezfm-05.syx | Dexed SynprezFM 05 | 32 | 0 |
| dexed-synprezfm-06.syx | Dexed SynprezFM 06 | 32 | 0 |
| dexed-synprezfm-07.syx | Dexed SynprezFM 07 | 32 | 0 |
| dexed-synprezfm-08.syx | Dexed SynprezFM 08 | 32 | 0 |
| dexed-synprezfm-09.syx | Dexed SynprezFM 09 | 32 | 0 |
| dexed-synprezfm-10.syx | Dexed SynprezFM 10 | 32 | 1 |
| dexed-synprezfm-11.syx | Dexed SynprezFM 11 | 32 | 0 |
| dexed-synprezfm-12.syx | Dexed SynprezFM 12 | 32 | 0 |
| dexed-synprezfm-13.syx | Dexed SynprezFM 13 | 32 | 0 |
| dexed-synprezfm-14.syx | Dexed SynprezFM 14 | 32 | 1 |
| dexed-synprezfm-15.syx | Dexed SynprezFM 15 | 32 | 0 |
| dexed-synprezfm-16.syx | Dexed SynprezFM 16 | 32 | 0 |
| dexed-synprezfm-17.syx | Dexed SynprezFM 17 | 32 | 1 |
| dexed-synprezfm-18.syx | Dexed SynprezFM 18 | 32 | 0 |
| dexed-synprezfm-19.syx | Dexed SynprezFM 19 | 32 | 0 |
| dexed-synprezfm-20.syx | Dexed SynprezFM 20 | 32 | 0 |
| dexed-synprezfm-21.syx | Dexed SynprezFM 21 | 32 | 0 |
| dexed-synprezfm-22.syx | Dexed SynprezFM 22 | 32 | 0 |
| dexed-synprezfm-23.syx | Dexed SynprezFM 23 | 32 | 1 |
| dexed-synprezfm-24.syx | Dexed SynprezFM 24 | 32 | 0 |
| dexed-synprezfm-25.syx | Dexed SynprezFM 25 | 32 | 0 |
| dexed-synprezfm-26.syx | Dexed SynprezFM 26 | 32 | 0 |
| dexed-synprezfm-27.syx | Dexed SynprezFM 27 | 32 | 0 |
| dexed-synprezfm-28.syx | Dexed SynprezFM 28 | 32 | 0 |
| dexed-synprezfm-29.syx | Dexed SynprezFM 29 | 32 | 0 |
| dexed-synprezfm-30.syx | Dexed SynprezFM 30 | 32 | 0 |
| dexed-synprezfm-31.syx | Dexed SynprezFM 31 | 32 | 1 |
| dexed-synprezfm-32.syx | Dexed SynprezFM 32 | 32 | 0 |

## Dave Benson's DX7 patch archive

- Source page: https://web.archive.org/web/20170201225341/http://homepages.abdn.ac.uk/mth192/pages/html/dx7.html (original: homepages.abdn.ac.uk/mth192/pages/html/dx7.html, no longer online); file: `dx7/syx/sysex.tar` on that page.
- Licence text: none stated by the patch authors. The host page says "Here is a collection of public domain patches for the DX7 in several formats".
- Provenance: the files came from ftp.ucsd.edu/midi/patches/DX7 (compiled by Glenn Scott, per https://github.com/itsjoesullivan/dx7-patches). Individual voice authors are not recorded.

| File | Bank | Voices | Bytes clamped |
|------|------|--------|---------------|
| benson-analog1.syx | Benson analog1 | 32 | 1 |
| benson-analog3.syx | Benson analog3 | 32 | 0 |
| benson-analog4.syx | Benson analog4 | 32 | 13 |
| benson-angelo.syx | Benson angelo | 32 | 7 |
| benson-atsu-4.syx | Benson atsu_4 | 32 | 5 |
| benson-atsu-5.syx | Benson atsu_5 | 32 | 0 |
| benson-b1.syx | Benson b1 | 32 | 1 |
| benson-b2.syx | Benson b2 | 32 | 9 |
| benson-b3.syx | Benson b3 | 32 | 7 |
| benson-b4.syx | Benson b4 | 32 | 16 |
| benson-bank0000.syx | Benson bank0000 | 32 | 1 |
| benson-bank0006.syx | Benson bank0006 | 32 | 4 |
| benson-bank0008.syx | Benson bank0008 | 32 | 0 |
| benson-bank0009.syx | Benson bank0009 | 32 | 61 |
| benson-bank0023.syx | Benson bank0023 | 32 | 4 |
| benson-bank0024.syx | Benson bank0024 | 32 | 0 |
| benson-bank0042.syx | Benson bank0042 | 32 | 1 |
| benson-bank0054.syx | Benson bank0054 | 32 | 130 |
| benson-bank0056.syx | Benson bank0056 | 32 | 1 |
| benson-bank01.syx | Benson bank01 | 32 | 0 |
| benson-bank05.syx | Benson bank05 | 32 | 0 |
| benson-bank08.syx | Benson bank08 | 32 | 2 |
| benson-bank11.syx | Benson bank11 | 32 | 0 |
| benson-bank14.syx | Benson bank14 | 32 | 0 |
| benson-bank18.syx | Benson bank18 | 32 | 0 |
| benson-bassea.syx | Benson bassea | 32 | 0 |
| benson-bassics.syx | Benson bassics | 32 | 0 |
| benson-bbank1.syx | Benson bbank1 | 32 | 10 |
| benson-bbank2.syx | Benson bbank2 | 32 | 2 |
| benson-bells.syx | Benson bells | 32 | 1 |
| benson-belltel.syx | Benson belltel | 32 | 8 |
| benson-brass.syx | Benson brass | 32 | 0 |
| benson-brass2.syx | Benson brass2 | 32 | 15 |
| benson-brass3.syx | Benson brass3 | 32 | 32 |
| benson-church.syx | Benson church | 32 | 8 |
| benson-clang1.syx | Benson clang1 | 32 | 3 |
| benson-claude.syx | Benson claude | 32 | 9 |
| benson-clav1.syx | Benson clav1 | 32 | 1 |
| benson-clavs.syx | Benson clavs | 32 | 1 |
| benson-combo.syx | Benson combo | 32 | 6 |
| benson-contemp.syx | Benson contemp | 32 | 8 |
| benson-country.syx | Benson country | 32 | 9 |
| benson-dave1.syx | Benson dave1 | 32 | 0 |
| benson-dg1.syx | Benson dg1 | 32 | 2 |
| benson-dg2.syx | Benson dg2 | 32 | 2 |
| benson-djw001.syx | Benson djw001 | 32 | 0 |
| benson-dx5a1.syx | Benson dx5a1 | 32 | 0 |
| benson-dx5a2.syx | Benson dx5a2 | 32 | 0 |
| benson-dx5b1.syx | Benson dx5b1 | 32 | 0 |
| benson-dx5b2.syx | Benson dx5b2 | 32 | 0 |
| benson-dx7-0628.syx | Benson dx7_0628 | 32 | 3 |
| benson-dxdxmi.syx | Benson dxdxmi | 32 | 3 |
| benson-dxmik2.syx | Benson dxmik2 | 32 | 4 |
| benson-dxoc01.syx | Benson dxoc01 | 32 | 4 |
| benson-dxoc02.syx | Benson dxoc02 | 32 | 1 |
| benson-dxoc03.syx | Benson dxoc03 | 32 | 2 |
| benson-dxoc04.syx | Benson dxoc04 | 32 | 1 |
| benson-dxoc05.syx | Benson dxoc05 | 32 | 1 |
| benson-dxoc06.syx | Benson dxoc06 | 32 | 1 |
| benson-dxoc07.syx | Benson dxoc07 | 32 | 11 |
| benson-dxoc08.syx | Benson dxoc08 | 32 | 3 |
| benson-dxoc09.syx | Benson dxoc09 | 32 | 0 |
| benson-dxoc10.syx | Benson dxoc10 | 32 | 2 |
| benson-dxoc11.syx | Benson dxoc11 | 32 | 0 |
| benson-dxoc12.syx | Benson dxoc12 | 32 | 0 |
| benson-dxoc13.syx | Benson dxoc13 | 32 | 5 |
| benson-dxoc14.syx | Benson dxoc14 | 32 | 6 |
| benson-dxoc15.syx | Benson dxoc15 | 32 | 3 |
| benson-dxoc16.syx | Benson dxoc16 | 32 | 3 |
| benson-dxoc17.syx | Benson dxoc17 | 32 | 6 |
| benson-dxoc18.syx | Benson dxoc18 | 32 | 1 |
| benson-dxoc19.syx | Benson dxoc19 | 32 | 1 |
| benson-dxoc20.syx | Benson dxoc20 | 32 | 15 |
| benson-dxoc21.syx | Benson dxoc21 | 32 | 5 |
| benson-dxoc22.syx | Benson dxoc22 | 32 | 1 |
| benson-dxoc23.syx | Benson dxoc23 | 32 | 7 |
| benson-dxoc24.syx | Benson dxoc24 | 32 | 1 |
| benson-dxoc25.syx | Benson dxoc25 | 32 | 1 |
| benson-dxoc26.syx | Benson dxoc26 | 32 | 1 |
| benson-dxoc27.syx | Benson dxoc27 | 32 | 2 |
| benson-dxoc28.syx | Benson dxoc28 | 32 | 0 |
| benson-dxoc29.syx | Benson dxoc29 | 32 | 1 |
| benson-dxoc30.syx | Benson dxoc30 | 32 | 1 |
| benson-effects1.syx | Benson effects1 | 32 | 1 |
| benson-efx.syx | Benson efx | 32 | 7 |
| benson-ethnic.syx | Benson ethnic | 32 | 14 |
| benson-forrick.syx | Benson forrick | 32 | 8 |
| benson-frank1.syx | Benson frank1 | 32 | 0 |
| benson-grak.syx | Benson grak | 32 | 0 |
| benson-guitar1.syx | Benson guitar1 | 32 | 0 |
| benson-guitar2.syx | Benson guitar2 | 32 | 12 |
| benson-guitars.syx | Benson guitars | 32 | 2 |
| benson-int.syx | Benson int | 32 | 12 |
| benson-italian2.syx | Benson italian2 | 32 | 6 |
| benson-italian3.syx | Benson italian3 | 32 | 0 |
| benson-jb001.syx | Benson jb001 | 32 | 3 |
| benson-jb002.syx | Benson jb002 | 32 | 4 |
| benson-jfd001.syx | Benson jfd001 | 32 | 0 |
| benson-keyboard.syx | Benson keyboard | 32 | 0 |
| benson-keys.syx | Benson keys | 32 | 5 |
| benson-koto.syx | Benson koto | 32 | 6 |
| benson-kq-sampl.syx | Benson kq_sampl | 32 | 5 |
| benson-latin.syx | Benson latin | 32 | 2 |
| benson-lonnie2.syx | Benson lonnie2 | 32 | 2 |
| benson-magazine.syx | Benson magazine | 32 | 1 |
| benson-mallets1.syx | Benson mallets1 | 32 | 4 |
| benson-mallets2.syx | Benson mallets2 | 32 | 83 |
| benson-mark.syx | Benson mark | 32 | 53 |
| benson-marty1.syx | Benson marty1 | 32 | 5 |
| benson-marty2.syx | Benson marty2 | 32 | 2 |
| benson-massey.syx | Benson massey | 32 | 0 |
| benson-mike1.syx | Benson mike1 | 32 | 26 |
| benson-mike2.syx | Benson mike2 | 32 | 0 |
| benson-more-key.syx | Benson more_key | 32 | 1 |
| benson-newseri.syx | Benson newseri | 32 | 16 |
| benson-newsnd.syx | Benson newsnd | 32 | 3 |
| benson-orchestr.syx | Benson orchestr | 32 | 4 |
| benson-org-clav.syx | Benson org_clav | 32 | 1 |
| benson-organ1.syx | Benson organ1 | 32 | 2 |
| benson-organ2.syx | Benson organ2 | 32 | 5 |
| benson-organ3.syx | Benson organ3 | 32 | 160 |
| benson-organs.syx | Benson organs | 32 | 2 |
| benson-ortega1.syx | Benson ortega1 | 32 | 11 |
| benson-ortega10.syx | Benson ortega10 | 32 | 6 |
| benson-ortega11.syx | Benson ortega11 | 32 | 16 |
| benson-ortega12.syx | Benson ortega12 | 32 | 11 |
| benson-ortega13.syx | Benson ortega13 | 32 | 6 |
| benson-ortega14.syx | Benson ortega14 | 32 | 18 |
| benson-ortega15.syx | Benson ortega15 | 32 | 11 |
| benson-ortega16.syx | Benson ortega16 | 32 | 3 |
| benson-ortega17.syx | Benson ortega17 | 32 | 15 |
| benson-ortega18.syx | Benson ortega18 | 32 | 9 |
| benson-ortega19.syx | Benson ortega19 | 32 | 11 |
| benson-ortega2.syx | Benson ortega2 | 32 | 7 |
| benson-ortega20.syx | Benson ortega20 | 32 | 8 |
| benson-ortega3.syx | Benson ortega3 | 32 | 12 |
| benson-ortega4.syx | Benson ortega4 | 32 | 12 |
| benson-ortega5.syx | Benson ortega5 | 32 | 16 |
| benson-ortega6.syx | Benson ortega6 | 32 | 8 |
| benson-ortega7.syx | Benson ortega7 | 32 | 184 |
| benson-ortega8.syx | Benson ortega8 | 32 | 19 |
| benson-ortega9.syx | Benson ortega9 | 32 | 12 |
| benson-partial.syx | Benson partial | 32 | 201 |
| benson-perc1.syx | Benson perc1 | 32 | 9 |
| benson-perc2.syx | Benson perc2 | 32 | 4 |
| benson-perc-a.syx | Benson perc_a | 32 | 0 |
| benson-perc-b.syx | Benson perc_b | 32 | 0 |
| benson-percuss.syx | Benson percuss | 32 | 3 |
| benson-percussi.syx | Benson percussi | 32 | 7 |
| benson-piano32.syx | Benson piano32 | 32 | 0 |
| benson-pianodx7.syx | Benson pianodx7 | 32 | 2 |
| benson-plucked.syx | Benson plucked | 32 | 4 |
| benson-pr01.syx | Benson pr01 | 32 | 1 |
| benson-pr02.syx | Benson pr02 | 32 | 0 |
| benson-pr03.syx | Benson pr03 | 32 | 2 |
| benson-rhodes1.syx | Benson rhodes1 | 32 | 7 |
| benson-rhodes2.syx | Benson rhodes2 | 32 | 102 |
| benson-rm0001.syx | Benson rm0001 | 32 | 5 |
| benson-road1.syx | Benson road1 | 32 | 2 |
| benson-road2.syx | Benson road2 | 32 | 2 |
| benson-sjsu-e.syx | Benson sjsu-e | 32 | 2 |
| benson-sjsu-f.syx | Benson sjsu-f | 32 | 18 |
| benson-sjsu-g.syx | Benson sjsu-g | 32 | 5 |
| benson-solange2.syx | Benson solange2 | 32 | 2 |
| benson-solange3.syx | Benson solange3 | 32 | 3 |
| benson-solange4.syx | Benson solange4 | 32 | 5 |
| benson-solange5.syx | Benson solange5 | 32 | 9 |
| benson-solange6.syx | Benson solange6 | 32 | 4 |
| benson-solange7.syx | Benson solange7 | 32 | 6 |
| benson-solange8.syx | Benson solange8 | 32 | 116 |
| benson-sonus1.syx | Benson sonus1 | 32 | 2 |
| benson-splits.syx | Benson splits | 32 | 2 |
| benson-splitsbn.syx | Benson splitsbn | 32 | 2 |
| benson-starma.syx | Benson starma | 32 | 1 |
| benson-steinber.syx | Benson steinber | 32 | 0 |
| benson-steph1.syx | Benson steph1 | 32 | 5 |
| benson-steph2.syx | Benson steph2 | 32 | 201 |
| benson-steph3.syx | Benson steph3 | 32 | 0 |
| benson-steph4.syx | Benson steph4 | 32 | 4 |
| benson-steve1.syx | Benson steve1 | 32 | 0 |
| benson-string1.syx | Benson string1 | 32 | 5 |
| benson-string2.syx | Benson string2 | 32 | 3 |
| benson-stringb.syx | Benson stringb | 32 | 0 |
| benson-strings.syx | Benson strings | 32 | 2 |
| benson-superdx.syx | Benson superdx | 32 | 0 |
| benson-syn-plus.syx | Benson syn_plus | 32 | 28 |
| benson-synplus.syx | Benson synplus | 32 | 2 |
| benson-synths32.syx | Benson synths32 | 32 | 2 |
| benson-synthsbn.syx | Benson synthsbn | 32 | 0 |
| benson-tfi1.syx | Benson tfi1 | 32 | 0 |
| benson-tfi2.syx | Benson tfi2 | 32 | 0 |
| benson-tfi3.syx | Benson tfi3 | 32 | 0 |
| benson-tfi4.syx | Benson tfi4 | 32 | 0 |
| benson-tfi5.syx | Benson tfi5 | 32 | 0 |
| benson-tfi6.syx | Benson tfi6 | 32 | 0 |
| benson-tfi7.syx | Benson tfi7 | 32 | 0 |
| benson-tfi8.syx | Benson tfi8 | 32 | 0 |
| benson-tfrack01.syx | Benson tfrack01 | 32 | 1 |
| benson-tfrack02.syx | Benson tfrack02 | 32 | 0 |
| benson-theatre.syx | Benson theatre | 32 | 0 |
| benson-tx7a.syx | Benson tx7a | 32 | 2 |
| benson-weird1.syx | Benson weird1 | 32 | 4 |
| benson-weird2.syx | Benson weird2 | 32 | 3 |
| benson-weird3.syx | Benson weird3 | 32 | 3 |
| benson-woodwind.syx | Benson woodwind | 32 | 4 |
| benson-wwind1.syx | Benson wwind1 | 32 | 6 |
| benson-wwind2.syx | Benson wwind2 | 32 | 2 |
| benson-wwind3.syx | Benson wwind3 | 32 | 2 |
| benson-wwind4.syx | Benson wwind4 | 32 | 1 |
| benson-wyatt.syx | Benson wyatt | 32 | 0 |
| benson-xylos.syx | Benson xylos | 32 | 0 |
| benson-yam-26.syx | Benson yam-26 | 32 | 0 |
| benson-yamaha.syx | Benson yamaha | 32 | 230 |

## Left out of the bundle

- benson-bank0043: manufacturer factory (31/32 voices are Yamaha ROM1-4 voices)
- benson-blanks: empty init voices
- benson-bstx: manufacturer factory (17/32 voices are Yamaha ROM1-4 voices)
- benson-dxpluk: byte-identical to benson-bassea.syx
- benson-frankie: byte-identical to benson-bank0042.syx
- benson-rom1a: manufacturer factory (32/32 voices are Yamaha ROM1-4 voices)
- benson-rom1b: manufacturer factory (32/32 voices are Yamaha ROM1-4 voices)
- benson-rom2a: manufacturer factory (32/32 voices are Yamaha ROM1-4 voices)
- benson-rom2b: manufacturer factory (32/32 voices are Yamaha ROM1-4 voices)
- benson-rom3a: manufacturer factory (32/32 voices are Yamaha ROM1-4 voices)
- benson-rom3b: manufacturer factory (32/32 voices are Yamaha ROM1-4 voices)
- benson-rom4a: manufacturer factory (32/32 voices are Yamaha ROM1-4 voices)
- benson-rom4b: manufacturer factory (32/32 voices are Yamaha ROM1-4 voices)
- benson-things: byte-identical to benson-bank0056.syx
- benson-zone3: manufacturer factory (20/32 voices are Yamaha ROM1-4 voices)
- itsjoesullivan/dx7-patches: JSON re-encoding of the same Benson collection (ISC licence on the conversion); not used, the original .syx files are shipped instead.
- sysexdb.com: user uploads with no terms and almost no direct downloads; nothing taken.
