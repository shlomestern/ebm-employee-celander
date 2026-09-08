# Brand

`logo.html` is the EBM badge — the symbol from the company logo, a rounded
rectangle enclosing EBM, in gold on brown. The letterforms are drawn as
geometry so it depends on no font.

It was rebuilt from a low-resolution copy of the real logo, so the badge's
proportions and corner radius are approximate. Given the original artwork
(SVG, PDF or a large PNG) the shape can be matched exactly. `render-icons.py` screenshots it at 512, 192 and 180
into `../icons/`.

Regenerate after editing the logo:

    python3 brand/render-icons.py

Two things that bite when editing it:

- The gold gradient uses `gradientUnits="userSpaceOnUse"`. A perfectly straight
  stroke has a zero-area bounding box, and the SVG spec says an element with a
  bounding-box gradient and no area renders nothing — so the E and the bars of
  the B silently vanish if you switch it back.
- The letters are clipped to the cap line, because the mitred joins on the M
  overshoot it otherwise.

The word under the monogram is set in Liberation Sans Bold — the only part that
uses a typeface, and only because eight letterforms are not worth hand-drawing.
Swap it for CREW, JOBS, DISPATCH or CALENDAR by editing the one `<text>` element.

Colours: brown `#3C2612` (also the app's theme and splash colour), gold running
`#F5DE9E` to `#9C6B18`.
