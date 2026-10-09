"""Renders every icon the app ships from brand/logo.html and brand/badge.html.

    python3 brand/render-icons.py

Chromium is used rather than an SVG library so the gradients, the embedded
symbol and the text come out exactly as a browser draws them.
"""
from playwright.sync_api import sync_playwright

CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
BRAND = "file:///home/user/ebm-employee-Celander-/brand/"
OUT = "/home/user/ebm-employee-Celander-/icons/"

# page, query, output, size, transparent background
JOBS = [
    ("logo.html",  "",         "icon-512.png",        512, False),
    ("logo.html",  "",         "icon-192.png",        192, False),
    ("logo.html",  "",         "apple-touch-icon.png", 180, False),
    ("logo.html",  "?plain=1", "maskable-512.png",    512, False),
    # Android keeps only the alpha of the status-bar badge, so it is rendered
    # on nothing: an opaque square would come out as a solid white block.
    ("badge.html", "",         "badge-96.png",         96, True),
]

with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
    for page, query, name, size, clear in JOBS:
        pg = b.new_context(viewport={"width": size, "height": size},
                           device_scale_factor=1).new_page()
        pg.goto(BRAND + page + query)
        pg.wait_for_timeout(400)
        pg.screenshot(path=OUT + name, omit_background=clear)
        print("wrote", name, size)
        pg.context.close()
    b.close()
