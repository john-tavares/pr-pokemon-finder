# Third-party notices

## Runtime Pokémon sprites

Source: [PokeAPI/sprites](https://github.com/PokeAPI/sprites), FireRed/LeafGreen PNGs
under `sprites/pokemon/versions/generation-iii/firered-leafgreen/<id>.png` and
`firered-leafgreen/back/1.png` (decorative Bulbasaur companion), loaded from
`raw.githubusercontent.com` only when a capture/preview is presented and remote
artwork is enabled. Successful responses are cached in memory for the extension-host
session. No sprite image files are included in this repository or the VSIX.

The [upstream notice](https://github.com/PokeAPI/sprites/blob/master/LICENCE.txt)
attributes image copyright to The Pokémon Company and describes the repository
under CC0. That repository statement is not represented here as a grant of the
character owners' copyrights or trademarks. The project's MIT license applies
to its original code, not Pokémon imagery or brands. This independent fan project
has no affiliation or endorsement. Maintainers must resolve rights/distribution
requirements before any Marketplace release or redistribution of third-party art.

Runtime loading is not a claim that permission has been obtained from the rights
holders. Disable `prPokemonFinder.presentation.remoteArtwork` to prevent these
requests and use the clearly marked text/silhouette fallback instead. The image
request contains only a species number; it never includes PR metadata, repository
names, account identifiers, or GitHub credentials. The remote host sees normal
network metadata such as the client's IP address.

Reference: [PokéAPI sprite documentation](https://pokeapi.co/docs/v2#pokemon).

## Local species names and original presentation

The catalog contains the display names for National Pokédex numbers 1–151.
Pokémon names and characters remain the property of their respective owners.
The scene layout, CSS landscape, geometric capture ball, JavaScript animations,
and screenshot of the sprite-free result screen are original project code/UI.
No ROM, game screen, music, audio, or extracted game UI is bundled. The GBA-style
layout is implemented in HTML/CSS, not an extracted background or game screenshot.

## VT323 pixel font

The unmodified `media/VT323-Regular.ttf` is from
[Google Fonts / VT323](https://github.com/google/fonts/tree/main/ofl/vt323).
It is Copyright 2011 The VT323 Project Authors and licensed under the SIL Open
Font License 1.1, reproduced in `media/OFL-VT323.txt` and included in the VSIX.
The font is not the original FireRed font and is not licensed under this project's MIT license.
SHA-256: `cf4de751ada78ceac033dbe16a687742939995b77bc2a052ae17a4957958594d`.
