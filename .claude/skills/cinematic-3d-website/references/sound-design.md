# Sound design: the invisible 40% of the experience

Sites in this genre are *scored*, not silent. The audio architecture is a
small mixing desk: one ambient bed always under, one section loop crossfaded
by scroll position, and dry UI ticks on top. All behind an explicit SOUND
ON/OFF toggle.

Audio must live on the **main thread** (Web Audio + DOM gesture requirements),
even when rendering runs in a worker — drive it from scroll/section events.

## 1. The sound palette (what to source or generate)

| Layer | Count | Character |
|---|---|---|
| Ambient bed | 1 | 20–30s seamless loop; the metaphor's room tone (underwater rumble, wind, hum). Mostly < 400 Hz. |
| Section loops | 1 per section | 15–30s loops that add a mood on top of the bed: a pad for the hero, sparse pluck for portfolio, warmer tone for team/footer. |
| Event one-shots | 4–8 | Whooshes/impacts for big choreography beats (figure condenses, rocks open), a few pitch variants each so repeats don't grate. |
| UI ticks | 2–3 | hover (< 60ms, quiet), click (short, slightly lower), toggle sweep. |
| Intro sting | 1 | 2–4s riser that plays once when the loader finishes. |

Sourcing: license from a library, commission, or generate — never lift from a
reference site. Keep everything in one key/tempo family so layers stack
harmonically.

## 2. Sound manager (Howler)

Central registry + manager; nothing else in the app touches Howler directly.

```js
import { Howl, Howler } from 'howler';

const base = (n) => [`/sounds/webm/${n}.webm`, `/sounds/mp3/${n}.mp3`];
const SOUNDS = {
  ambient:   { src: base('ambient_loop'),  volume: 0.5, loop: true },
  heroLoop:  { src: base('hero_loop'),     volume: 0.8, loop: true },
  aboutLoop: { src: base('about_loop'),    volume: 0.8, loop: true },
  click:     { src: base('ui_click'),      volume: 0.8 },
  hover:     { src: base('ui_hover'),      volume: 0.6 },
  intro:     { src: base('intro_sting'),   volume: 0.8 },
};

class AudioManager {
  sounds = {}; enabled = false; currentLoop = null;

  load() {                       // call on first user gesture (see §4)
    for (const [id, cfg] of Object.entries(SOUNDS))
      this.sounds[id] = new Howl({ src: cfg.src, volume: 0, loop: !!cfg.loop });
  }
  play(id) {
    if (!this.enabled) return;
    const s = this.sounds[id];
    s.volume(SOUNDS[id].volume); s.play();
  }
  enterSection(key) {            // crossfade section loops; ambient never stops
    const next = this.sounds[`${key}Loop`];
    if (this.currentLoop === next) return;
    this.currentLoop?.fade(this.currentLoop.volume(), 0, 800);
    if (next && this.enabled) {
      if (!next.playing()) next.play();
      next.fade(next.volume(), SOUNDS[`${key}Loop`].volume, 800);
    }
    this.currentLoop = next ?? null;
  }
  setEnabled(on) {               // soft master fade, not a hard mute
    this.enabled = on;
    const from = Howler.volume(), t0 = performance.now();
    const step = () => {
      const k = Math.min((performance.now() - t0) / 400, 1);
      Howler.volume(from + (Number(on) - from) * k);
      if (k < 1) requestAnimationFrame(step);
    };
    step();
    localStorage.setItem('sound', on ? '1' : '0');
  }
}
```

## 3. Wiring into the experience

- `ScrollTrigger`/SceneManager section boundaries call
  `audio.enterSection(key)` — sound and visuals change *together*.
- Choreography beats fire one-shots: when the particle morph keyframe crosses
  its midpoint, `audio.play('whoosh2')`. Pick the variant randomly.
- UI: `pointerenter` on links/buttons → `hover`; `click` → `click`. Throttle
  hover to ≥ 80ms apart or fast mouse movement becomes a zipper.
- Scroll velocity can modulate the ambient: map |velocity| → a lowpass filter
  frequency or a small volume boost on the bed (for filters, insert a
  `BiquadFilterNode` via `Howler.ctx`). Subtle. Optional.
- `visibilitychange` → fade master to 0 / restore (0.3s). A site that keeps
  droning in a background tab gets muted forever by the user.

## 4. Autoplay policy (do this exactly)

Browsers block audio before a user gesture, and an audible ambush is hostile
anyway:

1. Page loads with sound OFF and a visible toggle: "SOUND OFF/ON".
2. First user gesture (click on toggle, or the loader's "ENTER" button —
   a classic pattern precisely because it's a gesture): `audio.load()`, then
   `Howler.ctx.resume()`, then if the user opted in, `setEnabled(true)` and
   start ambient + intro sting.
3. Respect `localStorage.sound` on return visits — but still require the
   gesture before actually starting playback.

Never start audible playback from a scroll event alone; some browsers count
it as a gesture, many don't, and users hate it regardless.

## 5. The toggle UI

Fixed corner element, always visible, state obvious (label + tiny animated
waveform bars that freeze when off). Toggling fades the master over ~0.4s.
This is also your credibility signal — sites that hide the mute get closed.

## 6. Mix targets

- Ambient bed: -18 LUFS-ish; it should disappear after 30 seconds of listening.
- Section loops sit ~3dB above the bed. UI ticks peak well below the loops.
- Everything low-passed relative to "raw" — a slightly dark mix reads as
  expensive; harsh highs read as a slot machine.
- Test the full scroll journey with eyes closed: it should tell the same story.
