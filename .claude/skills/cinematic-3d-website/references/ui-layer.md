# UI layer: typography, loader, accessibility

The HTML overlay is what makes the 3D world a *website*. It carries the brand
(typography), the content (real text), and the credibility details (loader,
scrollbar, toggles). It must feel like part of the world — same easing family,
animations synced to the same scroll.

## 1. Structure & stacking

```
z-index 0   canvas (fixed, pointer-events: none)
z-index 10  scroll content (sections with real text; mostly transparent)
z-index 80  fixed chrome: logo, sound toggle, section indicator, scrollbar
z-index 100 loader (covers everything until ready)
```

- Real headlines/copy live in the scroll sections — crawlable, selectable,
  screen-reader-visible. Never draw body text in WebGL.
- Interactive chrome gets `pointer-events: auto`; everything else `none` so
  the page underneath still scrolls naturally.
- Use `rem` with a fluid root (`html { font-size: clamp(...) }`) or the
  common agency pattern (root font-size as a vw percentage) so the overlay
  scales with the 3D composition.

## 2. Typography animation: char-split reveals

The signature text move: headlines split into chars/lines, revealed with a
stagger, masked by `overflow: hidden` parents.

```js
// split (GSAP SplitText, or DIY):
function split(el) {
  const chars = [...el.textContent];
  el.innerHTML = chars.map(c =>
    `<span class="mask"><span class="char">${c === ' ' ? '&nbsp;' : c}</span></span>`).join('');
  return el.querySelectorAll('.char');
}
// css: .mask{display:inline-block;overflow:hidden} .char{display:inline-block;transform:translateY(110%)}

function reveal(el) {
  gsap.to(split(el), {
    y: 0, duration: 1.1, stagger: 0.02,
    ease: 'expo.out',          // or a signature cubic-bezier — pick ONE family
  });
}
```

Rules:
- Pick **one easing family** for the whole site — e.g. a long-decelerating
  curve like `cubic-bezier(.14,1,.34,1)` for entrances and a sharp
  in-out like `cubic-bezier(.9,0,.1,1)` for masked slides — and use them
  everywhere: text, logo, toggle, loader. A consistent easing signature is
  half of what reads as "designed".
- Durations 0.8–1.4s for hero text, staggers 15–30ms per char. Reverse
  (hide) at half duration.
- Trigger from the same section boundaries as the 3D (ScrollTrigger), so text
  and world move as one.
- Accents: number counters for stats (tween a value, render fixed-width so
  nothing jitters), a per-char hover scramble on nav links, huge outlined
  display numerals (`-webkit-text-stroke`) for section indices.

## 3. The loader / intro sequence

The loader buys asset time and sets the tone. Sequence:

1. Instant: near-black screen, small logo mark, progress readout (a %, a thin
   bar, or a filling word). Progress = real `LoadingManager` progress —
   fake-but-smooth is fine (lerp display toward real value; never move
   backward).
2. At 100%: optionally an ENTER button (gives the audio gesture — see
   sound-design.md), or auto-continue with sound left off.
3. Exit: loader elements mask out (same easing family), canvas fades from
   black while the Theatre intro sequence *plays* (this one is time-based
   `sequence.play()`, not scroll-scrubbed — scroll takes over when it ends,
   or blends via `max(introProgress, scrollPosition)`).
4. Chrome (logo, toggle, scrollbar) staggers in last.

Lock scrolling (`lenis.stop()`) until the intro completes; `lenis.start()`
after. Keep total loader+intro under ~4s on good connections.

## 4. Custom scrollbar / progress indicator

Native scrollbars break the illusion. Hide them (`scrollbar-width: none;
::-webkit-scrollbar{display:none}`) and render your own thin track: a 2px line
with a thumb whose position = smoothed scroll progress, plus optional section
tick marks that are clickable (`lenis.scrollTo(sectionEl)`). Fade it out when
idle (1.5s), back in on scroll. Also show a "section 02/04" indicator — users
need orientation in an abstract world.

## 5. Accessibility & fallbacks (non-optional)

- **`prefers-reduced-motion: reduce`:** stop camera drift, particle
  turbulence, velocity FX, char-staggers (fade instead), and Lenis smoothing.
  The world becomes a slow-fading backdrop; content remains fully readable.
- **Keyboard:** all chrome reachable/tabbable; visible focus style consistent
  with the brand; skip-link to main content.
- **Screen readers:** canvas `aria-hidden="true"`; headings in real
  `<h1>`–`<h3>` order; the sound toggle is a `<button aria-pressed>`.
- **WebGL/WebGPU unavailable:** detect at boot; keep the DOM experience with
  a static gradient/poster background. The site must still communicate.
- **Mobile:** touch scroll through Lenis (`syncTouch` or native + rAF read),
  low quality tier, pointer-interaction features off, and test that iOS
  Safari's collapsing URL bar doesn't cause resize thrash (debounce + ignore
  height-only changes < 120px).

## 6. Details that read as "expensive"

- Custom cursor only if it adds meaning (magnetic pull toward CTAs); otherwise
  keep the native cursor. Half-broken custom cursors are worse than none.
- Hover states everywhere chrome exists — with the matching UI tick sound.
- `::selection` styled to the accent color.
- Favicon pair for light/dark (`prefers-color-scheme` in the manifest/link
  tags).
- OG/social image rendered from the hero at its best beat (screenshot the
  canvas at `?p=0.15`, composite the logotype, ship as `/images/social.jpg`).
- A styled 404 that stays inside the world (same palette/typography, tiny
  ambient scene or static poster).
