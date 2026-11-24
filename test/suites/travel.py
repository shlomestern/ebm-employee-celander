# -*- coding: utf-8 -*-
"""Time kept free to get from one address to the next.

Two jobs at different addresses cannot touch: 8-10 then 10-12 across town is
being in two places at once. Two buildings on the same property are a walk
across a car park and need nothing. This pins the number, which was quietly
two hours for a while and took half an afternoon out of the hour list."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from playwright.sync_api import sync_playwright
from common import CHROME, ARGS, boot, job, d, OFFICE, Check, openDay

check = Check()

# Ten to two at 5790 Chambly, project 36, out in Longueuil.
MORNING = job("t1", d(3), "zion", 10, 14, "36", "Les Jardins Chambly Inc.",
              "36-5790-chambly", "5790 Chambly", "116", "Drain",
              by="Office", byid="office")

def hours(pg):
    """What the From box offers, and what it says about each hour."""
    return pg.evaluate("""() => [...document.getElementById('fFrom').options]
        .map(o => [o.value, o.textContent.trim(), o.disabled])""")

def openForm(pg, proj, bld):
    pg.eval_on_selector("#addJobBtn", "e=>e.click()")
    pg.wait_for_timeout(400)
    pg.select_option("#fProject", proj)
    pg.wait_for_timeout(300)
    if bld:
        pg.select_option("#fBuilding", bld)
        pg.wait_for_timeout(400)

with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME, args=ARGS)
    ctx = b.new_context(viewport={"width": 440, "height": 950},
                        timezone_id="America/Toronto")
    pg = ctx.new_page()
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:200]))

    boot(pg, OFFICE, [MORNING])
    pg.evaluate("() => { window.__state.who = 'zion'; }")

    print("\n--- another project, across town ---")
    openDay(pg, d(3))
    openForm(pg, "12", "12-2350-mariette")
    got = {h: (txt, dis) for h, txt, dis in hours(pg)}
    check("the hours he is there are taken",
          [got[str(h)][1] for h in (10, 11, 12, 13)], [True, True, True, True])
    check("one hour after he finishes is travel, and only one",
          ["travelling" in got["14"][0], "travelling" in got["15"][0]],
          [True, False])
    check("and that hour cannot be picked", got["14"][1], True)
    check("three o'clock is his again", [got["15"][0], got["15"][1]],
          ["3:00 PM", False])

    print("\n--- another building on the same property ---")
    pg.eval_on_selector("#formBack", "e=>e.click()")
    pg.wait_for_timeout(300)
    openForm(pg, "36", "36-5770-chambly")
    got2 = {h: (txt, dis) for h, txt, dis in hours(pg)}
    check("he can start the hour he finishes",
          ["travelling" in got2["14"][0], got2["14"][1]], [False, False])

    check("no page errors", errs, [])
    ctx.close(); b.close()
sys.exit(check.done())
