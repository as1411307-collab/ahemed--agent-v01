---
name: openverse-sounds
description: Find and download free, openly licensed sound effects and ambience (engine hum, UI clicks, wind, chimes) from Openverse for the agent interface, with the licence and credit recorded. Use when a scene, button, transition or the voice mode needs a sound, when Ahmed says "صوت", "أصوات", "مؤثر صوتي", "sound effect", "ambience", or before adding any audio file to the project.
---

# Openverse sounds

Openverse (openverse.org) indexes millions of CC0 / CC-BY audio files from Freesound, Jamendo, Wikimedia and others. One API, no key needed for light use.

## Rules for this project

- Prefer `cc0` and `pdm` (public domain). `by` is fine when the credit is written down. Never use `by-nc` / `by-nd` for anything that may ship.
- No copyrighted music. Ambience, engine hum, clicks, chimes, wind, rain only.
- Every file that enters the repo gets a line in `assets/sfx/CREDITS.md` (title, creator, licence, source URL). The world's settings panel links to that file.
- Keep files short (loops under 30 s, UI sounds under 2 s), convert to `.ogg` or `.mp3` with ffmpeg, and keep each under ~500 KB. Normalise loudness to about -16 LUFS for ambience and -12 LUFS for UI.
- The "reduce motion" setting also mutes non-essential ambience; UI feedback sounds stay but shorter.

## Search

```
GET https://api.openverse.org/v1/audio/?q=<terms>&license=cc0,pdm&category=sound_effect&duration=shortest&page_size=20
```

Useful parameters: `q` (terms), `license` (`cc0,pdm,by`), `license_type` (`commercial,modification`), `category` (`sound_effect`, `music`), `duration` (`shortest` < 30 s, `short` < 2 min), `source` (e.g. `freesound`), `page`, `page_size`.

Each result has: `title`, `creator`, `license`, `license_version`, `url` (direct audio), `foreign_landing_url` (source page), `attribution` (ready-made credit line), `duration` (ms), `filetype`.

PowerShell example (Windows):

```powershell
$r = Invoke-RestMethod "https://api.openverse.org/v1/audio/?q=spaceship%20engine%20hum%20loop&license=cc0,pdm&category=sound_effect&duration=shortest&page_size=10"
$r.results | Select-Object title, creator, license, duration, url | Format-Table
```

Download the chosen `url`, convert, then append the `attribution` line to `assets/sfx/CREDITS.md`.

## Sound palette for the agent interface (first screen)

| Where | What to search | Notes |
|---|---|---|
| Background ambience | `soft electronic hum loop`, `wind high altitude loop`, `night ambience loop` | one soft loop, -16 LUFS, fades in over 2 s |
| Console / UI | `soft ui click`, `glass tap`, `subtle chime` | 3 variants, randomised pitch ±3% |
| Agent / tool linked (new node appears) | `soft whoosh`, `crystal chime` | one-shot, plays with the node fade-in |
| Pulse travels on a link | `data blip`, `soft ping` | very quiet, only when the window is focused |
| Approval request | `gentle alert two tone` | distinct from everything else, never harsh |
| Error / failure | `low thud muffled` | short, no alarm sirens |
| Day / night change | none | the light does the work |

Search terms can be adapted; the table is the brief, not a fixed list.

## When something is missing

If Openverse has nothing usable, say so and offer: (1) a generated sound (e.g. a synthesised hum from a short script), or (2) ask Ahmed for a file. Do not pull from YouTube, games or film libraries.
