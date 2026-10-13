# -*- coding: utf-8 -*-
"""Picking up a job he stopped for the day.

Stopping for the day leaves a job clocked out and marked not finished, and the
man who stopped it is exactly the man who comes back to it. Until now his card
had nothing on it but Note or photo: reopening belonged to whoever booked it."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from playwright.sync_api import sync_playwright
from common import CHROME, ARGS, boot, job, d, OFFICE, Check, openDay

check = Check()

# Friday: he started at ten to nine, stopped at three, did not finish.
STOPPED = job("s1", d(-3), "rodrigo", 9, 15, "36", "Les Jardins Chambly Inc.",
              "36-5790-chambly", "5790 Chambly", "bureau", "Drains",
              by="Galit Knafou", byid="galit",
              cin=d(-3) + "T12:51:00.000Z", cout=d(-3) + "T19:00:00.000Z")
STOPPED["parked"] = True
STOPPED["left"] = "Going home"
# Somebody else's, same state, to be sure it is his own he can pick up.
THEIRS = job("s2", d(-3), "zion", 9, 15, "36", "Les Jardins Chambly Inc.",
             "36-5790-chambly", "5790 Chambly", "4", "Panel",
             by="Galit Knafou", byid="galit",
             cin=d(-3) + "T12:00:00.000Z", cout=d(-3) + "T17:00:00.000Z")
THEIRS["parked"] = True

def buttons(pg, unit):
    return pg.evaluate("""u => {
      const card = [...document.querySelectorAll('#dayJobs .job')]
        .find(c => c.innerText.includes('Unit ' + u) || c.innerText.includes('\\u00b7 ' + u));
      return card ? [...card.querySelectorAll('.job-actions button')]
        .map(b => b.textContent.trim()) : null;
    }""", unit)

with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME, args=ARGS)
    ctx = b.new_context(viewport={"width": 440, "height": 950},
                        timezone_id="America/Toronto")
    pg = ctx.new_page()
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:200]))

    print("\n--- the man who stopped it ---")
    boot(pg, "rd0002", [STOPPED, THEIRS])
    openDay(pg, d(-3))
    check("is offered his way back onto it",
          "Back on this job" in (buttons(pg, "bureau") or []), True)
    pg.evaluate("""() => {
      const card = [...document.querySelectorAll('#dayJobs .job')]
        .find(c => c.innerText.includes('bureau'));
      [...card.querySelectorAll('.job-actions button')]
        .find(b => b.textContent.trim() === 'Back on this job').click();
    }""")
    pg.wait_for_timeout(2000)
    made = pg.evaluate("""() => Object.values(window.__state.jobs)
        .filter(j => j.carriedFrom === 's1')
        .map(j => ({date: j.date, where: j.buildingName, unit: j.unit,
                    inOn: !!j.clockIn, out: j.clockOut, by: j.createdBy}))""")
    check("one job, on today", [m["date"] for m in made], [pg.evaluate("() => window.__todayIso")])
    check("at the same address and unit",
          [made[0]["where"], made[0]["unit"]] if made else None,
          ["5790 Chambly", "bureau"])
    check("he is on the clock from the moment he pressed",
          made[0]["inOn"] if made else None, True)
    check("and not clocked out again", made[0]["out"] if made else "x", None)
    check("it is still Galit's booking", made[0]["by"] if made else None, "Galit Knafou")
    old = pg.evaluate("() => window.__state.jobs['s1']")
    check("Friday keeps the hours he worked", [old["clockIn"] is not None, old["clockOut"] is not None],
          [True, True])
    check("and says where the rest of it went",
          old["backOn"], pg.evaluate("() => window.__todayIso"))

    print("\n--- somebody else's job ---")
    openDay(pg, d(-3))
    check("is not his to pick up",
          "Back on this job" in (buttons(pg, "4") or []), False)

    print("\n--- what the move button says depends on the state ---")
    ON = job("s3", d(0), "rodrigo", 8, 17, "30", "Chateau St Bruno Inc.",
             "30-1669-310", "1669-310", "400-210", "Drain in the lockers",
             by="Andre Bilodeau", byid="andre",
             cin=pg.evaluate("() => new Date().toISOString()"))
    SOON = job("s4", d(1), "rodrigo", 8, 10, "30", "Chateau St Bruno Inc.",
               "30-1669-310", "1669-310", "7", "Tap",
               by="Andre Bilodeau", byid="andre")
    boot(pg, OFFICE, [STOPPED, ON, SOON])
    # The office looks at one man's calendar at a time; these are Rodrigo's.
    pg.evaluate("() => { window.__state.who = 'rodrigo'; }")
    openDay(pg, d(0))
    check("on site right now: finish it another day",
          "Finish another day" in (buttons(pg, "400-210") or []), True)
    check("and not go back to it, which he never left",
          "Go back to it" in (buttons(pg, "400-210") or []), False)
    openDay(pg, d(1))
    check("not started yet: reschedule",
          "Reschedule" in (buttons(pg, "7") or []), True)
    openDay(pg, d(-3))
    check("stopped for the day: go back to it",
          "Go back to it" in (buttons(pg, "bureau") or []), True)

    print("\n--- and the office still has its own way ---")
    boot(pg, OFFICE, [THEIRS])
    openDay(pg, d(-3))
    check("Go back to it, which asks which day",
          "Go back to it" in (buttons(pg, "4") or []), True)
    check("but not the one-tap return, which is the man's",
          "Back on this job" in (buttons(pg, "4") or []), False)

    check("no page errors", errs, [])
    ctx.close(); b.close()
sys.exit(check.done())
