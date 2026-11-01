# Voice asset credits

Japanese synthetic female voice: Kokoro `jf_alpha`.
Generated for DOUBLE BOARD PLO5 with [hexgrad/Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M), revision `f3ff3571791e39611d31c381e3a41a3af07b4987`, Kokoro 0.9.4 / Misaki 0.9.4.
The model and voice weights are published under Apache License 2.0 by hexgrad and contributors. A copy of that license is included here. Model weights are not bundled with the game.

The clips announce board A/B and the nine high-hand categories (18 clips), plus call, raise and bet (3 clips), in Japanese. They are pre-generated assets: playback sends no text or personal data to a speech service. This is a synthetic voice, not a recording or imitation of a named person.

`scripts/generate_voice.py` records the generation procedure. `manifest.json` contains the spoken text and duration for each asset. SE is generated locally with Web Audio; no external sound samples are used.
