# -*- coding: utf-8 -*-
"""Moving a job onto a day the office already gave away.

Booking onto an approved day off has always stopped once and asked for a
tick. Moving onto one never looked at all, which is how two jobs landed on a
man who had the day off: they were not booked onto that day, they were
moved onto it from the Saturday."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from playwright.sync_api import sync_playwright
from common import CHROME, ARGS, boot, job, d, OFFICE, Check, openDay

check = Check()

# Booked for the day after tomorrow; Zion has the day after that off.
MOVING = job("o1", d(2), "zion", 8, 12, "30", "Chateau St Bruno Inc.",
             "30-1669-310", "1669-310", "Atelier", "Clapet antiretour",
             by="Andre Bilodeau", byid="andre")
OFFS = {"list": [{"id": "off1", "byId": "zion", "by": "Zion",
                  "from": d(3), "to": d(3), "allDay": True, "why": "Doctor",
                  "state": "approved", "decidedBy": "Shlome Stern",
                  "decidedById": "office", "at": d(0) + "T12:00:00.000Z",
                  "decidedAt": d(0) + "T13:00:00.000Z", "seen": True}]}

def press(pg, unit, label):
    pg.evaluate("""a => {
      const card = [...document.querySelectorAll('#dayJobs .job')]
        .find(c => c.innerText.includes('Unit ' + a[0]));
      [...card.querySelectorAll('.job-actions button')]
        .find(b => b.textContent.trim() === a[1]).click();
    }""", [unit, label])
    pg.wait_for_timeout(400)

with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME, args=ARGS)
    ctx = b.new_context(viewport={"width": 440, "height": 950},
                        timezone_id="America/Toronto")
    pg = ctx.new_page()
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:200]))

    boot(pg, OFFICE, [MOVING], extra={"config/dayoff": OFFS})
    pg.evaluate("() => { window.__state.who = 'zion'; }")
    openDay(pg, d(2))

    print("\n--- a day he has off ---")
    press(pg, "Atelier", "Reschedule")
    pg.fill("#mvDate", d(3))
    pg.eval_on_selector("#mvDate", "e=>e.dispatchEvent(new Event('change'))")
    pg.wait_for_timeout(500)
    check("the box says so while the day is being picked",
          pg.evaluate("() => !document.getElementById('mvOffRow').hidden"), True)
    check("and says who gave it and why",
          [w in pg.text_content("#mvOffNote") for w in ("Shlome Stern", "Doctor")],
          [True, True])
    pg.eval_on_selector("#mvSave", "e=>e.click()")
    pg.wait_for_timeout(700)
    check("saving without the tick is stopped",
          "Tick the box" in pg.text_content("#mvErr"), True)
    check("and the job has not moved",
          pg.evaluate("() => window.__state.jobs.o1.date"), d(2))

    print("\n--- ticked, because plans change ---")
    pg.eval_on_selector("#mvOffAnyway", "e=>e.click()")
    pg.eval_on_selector("#mvSave", "e=>e.click()")
    pg.wait_for_timeout(1200)
    check("it moves", pg.evaluate("() => window.__state.jobs.o1.date"), d(3))

    print("\n--- a day he does not have off ---")
    openDay(pg, d(3))
    press(pg, "Atelier", "Reschedule")
    pg.fill("#mvDate", d(4))
    pg.eval_on_selector("#mvDate", "e=>e.dispatchEvent(new Event('change'))")
    pg.wait_for_timeout(500)
    check("nothing is in the way",
          pg.evaluate("() => document.getElementById('mvOffRow').hidden"), True)
    pg.eval_on_selector("#mvSave", "e=>e.click()")
    pg.wait_for_timeout(1200)
    check("and it moves with one tap",
          pg.evaluate("() => window.__state.jobs.o1.date"), d(4))

    print("\n--- an admin who did not give the day ---")
    # Galit can book, and the day off was the office's answer, not hers.
    # Her own booking, so the card offers her Reschedule in the first place.
    MOVING2 = job("o4", d(2), "zion", 8, 12, "30", "Chateau St Bruno Inc.",
                  "30-1669-310", "1669-310", "Atelier", "Clapet antiretour",
                  by="Galit Knafou", byid="galit")
    boot(pg, "gl0005", [MOVING2], extra={"config/dayoff": OFFS})
    pg.evaluate("() => { window.__state.who = 'zion'; }")
    openDay(pg, d(3))
    check("the day sheet says whose answer it is",
          "Only Shlome Stern" in pg.text_content("#daySub"), True)
    openDay(pg, d(2))
    press(pg, "Atelier", "Reschedule")
    pg.fill("#mvDate", d(3))
    pg.eval_on_selector("#mvDate", "e=>e.dispatchEvent(new Event('change'))")
    pg.wait_for_timeout(500)
    check("she is told, and offered no tick",
          [pg.evaluate("() => !document.getElementById('mvOffNote').hidden"),
           pg.evaluate("() => document.getElementById('mvOffRow').hidden")],
          [True, True])
    pg.eval_on_selector("#mvSave", "e=>e.click()")
    pg.wait_for_timeout(900)
    check("and it is a flat no",
          "Only Shlome Stern" in pg.text_content("#mvErr"), True)
    check("the job stays where it was",
          pg.evaluate("() => window.__state.jobs.o4.date"), d(2))

    print("\n--- on top of a job he already has ---")
    # The whole day, booked by the same person who is doing the moving: the
    # hour list calls those hours "your own booking" and leaves them pickable.
    ALLDAY = job("o2", d(5), "zion", 8, 17, "26", "Les Jardins Chambly Inc.",
                 "26-5790-chambly", "5790 Chambly", "116", "Drain 4 pouce",
                 by="Office", byid="office")
    ALLDAY["allDay"] = True
    SHORT = job("o3", d(6), "zion", 9, 11, "12", "B & R Investments Inc.",
                "12-2350-mariette", "2350 Mariette", "1", "Evier bouche",
                by="Office", byid="office")
    boot(pg, OFFICE, [ALLDAY, SHORT])
    pg.evaluate("() => { window.__state.who = 'zion'; }")
    openDay(pg, d(6))
    press(pg, "1", "Reschedule")
    pg.fill("#mvDate", d(5))
    pg.eval_on_selector("#mvDate", "e=>e.dispatchEvent(new Event('change'))")
    pg.wait_for_timeout(500)
    check("the orange line is still there",
          "two jobs at once" in pg.text_content("#mvWarn"), True)
    check("and now it costs a tick",
          pg.evaluate("() => !document.getElementById('mvClashRow').hidden"), True)
    pg.eval_on_selector("#mvSave", "e=>e.click()")
    pg.wait_for_timeout(700)
    check("one tap no longer does it",
          pg.evaluate("() => window.__state.jobs.o3.date"), d(6))
    pg.eval_on_selector("#mvClashAnyway", "e=>e.click()")
    pg.eval_on_selector("#mvSave", "e=>e.click()")
    pg.wait_for_timeout(1200)
    check("ticked, it goes \u2014 the office does sometimes mean it",
          pg.evaluate("() => window.__state.jobs.o3.date"), d(5))

    check("no page errors", errs, [])
    ctx.close(); b.close()
sys.exit(check.done())
