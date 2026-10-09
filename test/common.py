# -*- coding: utf-8 -*-
"""Shared ground for the suites: the browser, a fixture crew, and a job maker.

The codes in here are invented. The crew's real codes are not in this
repository and must never be put in it.
"""
import datetime, os

CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
ARGS = ["--no-sandbox", "--force-device-scale-factor=1", "--hide-scrollbars"]
HERE = os.path.dirname(os.path.abspath(__file__))
URL  = "http://127.0.0.1:8981/"

# The browser runs in America/Toronto; the container runs in UTC. Between eight
# at night and midnight in Montreal those are different dates, and every
# date-relative check quietly goes a day out. Take the date the browser sees.
try:
    from zoneinfo import ZoneInfo
    TODAY = datetime.datetime.now(ZoneInfo("America/Toronto")).date()
except Exception:
    TODAY = datetime.date.today()

def d(n):
    return (TODAY + datetime.timedelta(days=n)).isoformat()

OFFICE = "test65"
PEOPLE = [
  {"id": "zion",    "name": "Zion",    "trade": "plumbing",   "code": "zn0001"},
  {"id": "rodrigo", "name": "Rodrigo", "trade": "plumbing",   "code": "rd0002"},
  {"id": "aymen",   "name": "Aymen",   "trade": "electrical", "code": "el0003"},
  {"id": "gabi",    "name": "Gabi Sebat", "trade": "admin",   "code": "gb0004",
   "can": {"book": True, "manage": False}},
  {"id": "galit",   "name": "Galit Knafou", "trade": "admin", "code": "gl0005",
   "can": {"book": True, "manage": True}},
]
ROSTER = {"people": PEOPLE, "officeCode": OFFICE, "officeName": "Office"}

def job(i, day, crew, frm, to, proj, pname, bid, bname, unit, what,
        by="Gabi Sebat", byid="gabi", cin=None, cout=None, breaks=None):
    return {"v": 2, "id": i, "date": day, "crewId": crew, "from": frm, "to": to,
            "allDay": False, "projectId": proj, "projectName": pname,
            "buildingId": bid, "buildingName": bname, "unit": unit, "job": what,
            "manager": "", "managerPhone": "",
            "createdAt": day + "T07:00:00.000Z", "createdBy": by, "createdById": byid,
            "clockIn": cin, "clockOut": cout, "breaks": breaks or [],
            "notes": [], "photos": [], "used": []}

def boot(pg, code, jobs, roster=None, lang=None, url=URL, extra=None):
    """Start the app on the stand-in database with these people and these jobs."""
    if "fake=1" not in url:
        url = url + ("&" if "?" in url else "?") + "fake=1"
    pg.goto(url); pg.wait_for_timeout(400)
    seed = {"config/crew": roster or ROSTER}
    for x in jobs:
        seed["bookings/" + x["id"]] = x
    if extra:
        seed.update(extra)
    pg.evaluate("s=>localStorage.setItem('fakefb:store',JSON.stringify(s))", seed)
    pg.evaluate("r=>localStorage.setItem('ebm-crew:roster:v1',JSON.stringify(r))",
                roster or ROSTER)
    pg.evaluate("j=>localStorage.setItem('ebm-crew:jobs:v2',JSON.stringify(j))",
                {x["id"]: x for x in jobs})
    for k in ("ebm-crew:pass:v2", "ebm-crew:chatseen:v1", "ebm-crew:undo:v1",
              "ebm-crew:bill:v1", "ebm-crew:reqs:v1"):
        pg.evaluate("k=>localStorage.removeItem(k)", k)
    if lang:
        pg.evaluate("l=>localStorage.setItem('ebm-crew:lang:v1', l)", lang)
    pg.reload(); pg.wait_for_timeout(700)
    pg.wait_for_function("!document.querySelector('#gateSubmit').disabled", timeout=30000)
    if code:
        pg.fill("#gateInput", code)
        pg.click("#gateForm button[type=submit]")
        pg.wait_for_selector("#app:not([hidden])", timeout=25000)
        pg.wait_for_timeout(800)

def showDay(pg, ds):
    """Bring the month holding this day onto the screen.

    A day a few forward is often in the month after the one on show, and a cell
    that is not drawn cannot be clicked. Days from the next month do appear in
    the grid, greyed, but carry no data-d. Walk forward, then back: a suite
    that has already turned the month forward and then asks for a day near
    today is looking at a month it has walked past."""
    def there():
        return pg.evaluate("s=>!!document.querySelector(`.cell[data-d=\"${s}\"]`)", ds)
    def turn(which):
        # A DOM click, not a pointer one: an open dialog swallows real taps on
        # the page behind it, and suites call this with a day sheet up.
        pg.eval_on_selector("#" + which, "e=>e.click()")
        pg.wait_for_timeout(700)
    for _ in range(4):
        if there(): return True
        turn("nextMonth")
    for _ in range(8):
        turn("prevMonth")
        if there(): return True
    return False

def openDay(pg, ds):
    showDay(pg, ds)
    pg.evaluate("s=>[...document.querySelectorAll('.cell')].find(x=>x.dataset.d===s).click()", ds)
    pg.wait_for_selector("#dayDlg[open]"); pg.wait_for_timeout(500)

class Check(object):
    """PASS/FAIL lines and a count, the way every suite reports."""
    def __init__(self): self.fails = []
    def __call__(self, name, got, want):
        ok = got == want
        print(("  PASS  " if ok else "  FAIL  ") + name)
        if not ok:
            print("        got %r want %r" % (got, want))
            self.fails.append(name)
    def done(self):
        print("\nFAILURES: %d" % len(self.fails))
        return 1 if self.fails else 0
