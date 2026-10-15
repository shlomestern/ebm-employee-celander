# -*- coding: utf-8 -*-
"""Typing in the hours a man worked.

The clock is a button on a phone and phones get forgotten: he walks off at
four and the card still says ON SITE the next morning, which is wrong in Hours
worked and worth nothing to the chargeback. The office can now type both times
in — on a job he clocked into and on a booking nobody ever clocked into."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from playwright.sync_api import sync_playwright
from common import CHROME, ARGS, boot, job, d, OFFICE, Check, openDay

check = Check()

# Tuesday: in at ten to nine, and never out.
OPEN = job("h1", d(-2), "zion", 8, 17, "30", "Chateau St Bruno Inc.",
           "30-1669-310", "1669-310", "400-210", "Drain in the lockers",
           by="Shlome Stern", byid="office",
           cin=d(-2) + "T12:43:00.000Z")
# Same day, never clocked into at all.
NEVER = job("h2", d(-2), "rodrigo", 9, 12, "26", "Les Jardins Chambly Inc.",
            "26-5790-chambly", "5790 Chambly", "bureau", "Tap",
            by="Shlome Stern", byid="office")
# Tomorrow. Nothing to put hours on.
SOON = job("h3", d(2), "zion", 8, 10, "30", "Chateau St Bruno Inc.",
           "30-1669-310", "1669-310", "7", "Panel",
           by="Shlome Stern", byid="office")

def buttons(pg, unit):
    return pg.evaluate("""u => {
      const card = [...document.querySelectorAll('#dayJobs .job')]
        .find(c => c.innerText.includes('Unit ' + u));
      return card ? [...card.querySelectorAll('.job-actions button')]
        .map(b => b.textContent.trim()) : null;
    }""", unit)

def press(pg, unit, label):
    pg.evaluate("""a => {
      const card = [...document.querySelectorAll('#dayJobs .job')]
        .find(c => c.innerText.includes('Unit ' + a[0]));
      [...card.querySelectorAll('.job-actions button')]
        .find(b => b.textContent.trim() === a[1]).click();
    }""", [unit, label])
    pg.wait_for_timeout(400)

def hhmm(pg, jid, which):
    return pg.evaluate("""a => {
      const x = window.__state.jobs[a[0]][a[1]];
      if (!x) return null;
      const t = new Date(x), p = n => (n < 10 ? '0' : '') + n;
      return [t.getFullYear(), p(t.getMonth()+1), p(t.getDate())].join('-')
             + ' ' + p(t.getHours()) + ':' + p(t.getMinutes());
    }""", [jid, which])

with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME, args=ARGS)
    ctx = b.new_context(viewport={"width": 440, "height": 950},
                        timezone_id="America/Toronto")
    pg = ctx.new_page()
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:200]))

    print("\n--- he forgot to clock out ---")
    boot(pg, OFFICE, [OPEN, NEVER, SOON])
    pg.evaluate("() => { window.__state.who = 'zion'; }")
    openDay(pg, d(-2))
    check("the office is offered the hours", "Fix the hours" in (buttons(pg, "400-210") or []), True)
    press(pg, "400-210", "Fix the hours")
    check("the box opens on the clock-in it has", pg.input_value("#hrsIn"), "08:43")
    check("with no finish time", pg.input_value("#hrsOut"), "")
    pg.fill("#hrsOut", "16:15")
    pg.wait_for_timeout(200)
    check("and says what it is worth before saving",
          "7.53 h" in pg.text_content("#hrsSum"), True)
    pg.eval_on_selector("#hrsSave", "e=>e.click()")
    pg.wait_for_timeout(900)
    check("the hours land on the day he worked", hhmm(pg, "h1", "clockOut"), d(-2) + " 16:15")
    check("his own start time is left alone", hhmm(pg, "h1", "clockIn"), d(-2) + " 08:43")
    check("and the office's name is on the end he moved",
          pg.evaluate("() => [window.__state.jobs.h1.outBy, window.__state.jobs.h1.inBy || null]"),
          ["Office", None])
    check("it can be undone", pg.evaluate(
        "() => (window.__state.undos||[]).some(e => e.what === 'hours')"), True)

    print("\n--- a day worked without the app ---")
    openDay(pg, d(-2))
    pg.evaluate("() => { window.__state.who = 'rodrigo'; }")
    openDay(pg, d(-2))
    check("nothing clocked: the hours are put in, not fixed",
          "Put in the hours" in (buttons(pg, "bureau") or []), True)
    press(pg, "bureau", "Put in the hours")
    check("both boxes empty", [pg.input_value("#hrsIn"), pg.input_value("#hrsOut")], ["", ""])
    pg.fill("#hrsOut", "12:00")
    pg.eval_on_selector("#hrsSave", "e=>e.click()")
    pg.wait_for_timeout(500)
    check("a finish with no start is refused",
          pg.text_content("#hrsErr"), "Fill in what time he started.")
    pg.fill("#hrsIn", "13:00")
    pg.eval_on_selector("#hrsSave", "e=>e.click()")
    pg.wait_for_timeout(500)
    check("and so is finishing before starting",
          pg.text_content("#hrsErr"), "He cannot finish before he started.")
    check("nothing was written while it was wrong",
          pg.evaluate("() => window.__state.jobs.h2.clockIn"), None)
    pg.fill("#hrsIn", "09:05")
    pg.eval_on_selector("#hrsSave", "e=>e.click()")
    pg.wait_for_timeout(900)
    check("both times land", [hhmm(pg, "h2", "clockIn"), hhmm(pg, "h2", "clockOut")],
          [d(-2) + " 09:05", d(-2) + " 12:00"])
    check("stamped by whoever typed them",
          pg.evaluate("() => [window.__state.jobs.h2.inBy, window.__state.jobs.h2.outBy]"),
          ["Office", "Office"])

    print("\n--- where it is not offered ---")
    pg.evaluate("() => { window.__state.who = 'zion'; }")
    openDay(pg, d(2))
    check("a booking still to come", [x for x in (buttons(pg, "7") or [])
          if x.endswith("the hours")], [])
    boot(pg, "zn0001", [OPEN, NEVER, SOON])
    openDay(pg, d(-2))
    check("and not to the man himself", [x for x in (buttons(pg, "400-210") or [])
          if x.endswith("the hours")], [])

    check("no page errors", errs, [])
    ctx.close(); b.close()
sys.exit(check.done())
