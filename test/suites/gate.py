# -*- coding: utf-8 -*-
"""Who gets in, and what they see when they do.

The office code opens everything, an admin books but is not the office, and a
man on the tools sees his own work and nothing else. The office code itself is
not written down anywhere a browser can read: config.js carries a fingerprint
of it and the app makes the same fingerprint out of what was typed."""
import sys, io, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from playwright.sync_api import sync_playwright
from common import CHROME, ARGS, boot, job, d, OFFICE, ROSTER, Check

check = Check()
JOBS = [
  job("g1", d(1), "zion", 8, 11, "13", "Riverside Investments Inc.",
      "13-9379-lasalle", "9379 Lasalle", "4", "Stack"),
  job("g2", d(1), "rodrigo", 8, 11, "12", "B & R Investments Inc.",
      "12-2350-mariette", "2350 Mariette", "1", "Drain"),
]

def visible(pg, sel):
    return pg.eval_on_selector(sel, "e=>!e.hidden")

with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME, args=ARGS)
    ctx = b.new_context(viewport={"width": 440, "height": 950},
                        timezone_id="America/Toronto")
    pg = ctx.new_page()
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:200]))

    print("\n--- the office code ---")
    boot(pg, OFFICE, JOBS)
    check("opens the calendar", pg.evaluate("() => window.__state.me"), "office")
    check("with everybody's work on it",
          pg.evaluate("() => Object.keys(window.__state.jobs).sort()"), ["g1", "g2"])
    pg.click("#meBtn"); pg.wait_for_selector("#meDlg[open]"); pg.wait_for_timeout(300)
    check("and the hours report", visible(pg, "#meRepBtn"), True)
    check("and the crew list", visible(pg, "#meCrewBtn"), True)
    check("and the log", visible(pg, "#meLogBtn"), True)

    print("\n--- an admin ---")
    boot(pg, "gb0004", JOBS)
    check("is let in as himself", pg.evaluate("() => window.__state.me"), "gabi")
    pg.click("#meBtn"); pg.wait_for_selector("#meDlg[open]"); pg.wait_for_timeout(300)
    check("but the hours report is not his", visible(pg, "#meRepBtn"), False)
    check("nor the crew list", visible(pg, "#meCrewBtn"), False)
    check("nor the log", visible(pg, "#meLogBtn"), False)

    print("\n--- a man on the tools ---")
    boot(pg, "zn0001", JOBS)
    check("is let in as himself", pg.evaluate("() => window.__state.me"), "zion")
    check("and the calendar he is shown is his own",
          pg.evaluate("() => window.__viewCrew ? window.__viewCrew() : window.__state.me"), "zion")
    pg.click("#meBtn"); pg.wait_for_selector("#meDlg[open]"); pg.wait_for_timeout(300)
    check("with none of the office's screens",
          [visible(pg, "#meRepBtn"), visible(pg, "#meCrewBtn"), visible(pg, "#meLogBtn")],
          [False, False, False])

    print("\n--- a code that is nobody's ---")
    boot(pg, None, JOBS)
    pg.fill("#gateInput", "nope99"); pg.click("#gateForm button[type=submit]")
    pg.wait_for_timeout(1200)
    check("does not open it", pg.eval_on_selector("#app", "e=>e.hidden"), True)
    check("and says so", pg.text_content("#gateErr"),
          "That code does not match. Check with the office.")

    print("\n--- and the office code is not in the file ---")
    cfg = io.open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                               "..", "config.js"), encoding="utf-8").read()
    check("config.js carries a fingerprint, not the code", "officeHash" in cfg, True)
    check("and not the code itself", OFFICE in cfg, False)

    check("no page errors", errs, [])
    ctx.close(); b.close()
sys.exit(check.done())
