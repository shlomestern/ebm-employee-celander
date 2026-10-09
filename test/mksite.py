# -*- coding: utf-8 -*-
"""Build the test copy of the app from the real one.

Four changes, all of them for testing only, and all in one place so they
cannot be lost the next time the app is copied over:

  * the service worker is not registered (it reloads the page mid-run)
  * with ?fake=1, Firebase is loaded from ./fakefb/ instead of gstatic
  * with ?who=X, the app's storage keys are prefixed, so two instances in one
    browser are two different people rather than one shared one
  * a few of the app's own functions are hung on the window, so a test can set
    up what only a real phone can hand it
"""
import io, os, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
SRC  = os.path.dirname(HERE)
SITE = os.path.join(HERE, "site")

COPY = ("index.html", "sw.js", "manifest.webmanifest", "config.js",
        "projects.js", "version.txt")

def build():
    os.makedirs(SITE, exist_ok=True)
    for f in COPY:
        shutil.copy(os.path.join(SRC, f), os.path.join(SITE, f))
    for d in ("icons", "brand"):
        if os.path.isdir(os.path.join(SRC, d)):
            shutil.rmtree(os.path.join(SITE, d), ignore_errors=True)
            shutil.copytree(os.path.join(SRC, d), os.path.join(SITE, d))

    p = os.path.join(SITE, "index.html")
    s = io.open(p, encoding="utf-8").read()

    def sub(old, new, why):
        if s.count(old) != 1:
            raise SystemExit("mksite: %s — found %d of %r" % (why, s.count(old), old[:60]))
        return s.replace(old, new)

    s = sub('      navigator.serviceWorker.register("sw.js").then(function(reg){',
            '      if (window.__noSW) return;   // test copy\n'
            '      navigator.serviceWorker.register("sw.js").then(function(reg){',
            "no service worker")
    s = s.replace("<script>", "<script>window.__noSW = true;</script>\n<script>", 1)

    s = sub('var base="https://www.gstatic.com/firebasejs/10.12.5/";',
            'var base=(location.search.indexOf("fake=1")>=0)'
            '?"./fakefb/":"https://www.gstatic.com/firebasejs/10.12.5/";',
            "the stand-in database")

    # Notifications fetch their own copy of Firebase from Google. Against the
    # stand-in that real script finds a firebase object it does not recognise
    # and throws, which showed up in every suite as a page error that had
    # nothing to do with the app.
    s = sub('    var base = "https://www.gstatic.com/firebasejs/10.12.5/";',
            '    var base = (location.search.indexOf("fake=1") >= 0)\n'
            '      ? "./fakefb/" : "https://www.gstatic.com/firebasejs/10.12.5/";',
            "no real messaging in the test copy")

    s = sub("""  function lsRead(k,f){ try{ var r=localStorage.getItem(k); return r?JSON.parse(r):f; }catch(e){ return f; } }
  function lsWrite(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); return true; }catch(e){ return false; } }""",
            """  var LS_TAG = (function(){
    var m = /[?&]who=([A-Za-z0-9]+)/.exec(location.search);
    return m ? m[1] + ":" : "";
  })();
  function lsRead(k,f){ try{ var r=localStorage.getItem(LS_TAG+k); return r?JSON.parse(r):f; }catch(e){ return f; } }
  function lsWrite(k,v){ try{ localStorage.setItem(LS_TAG+k,JSON.stringify(v)); return true; }catch(e){ return false; } }""",
            "storage per instance")

    # The saved code is written straight to localStorage rather than through
    # lsWrite, so it needs the same treatment or the second instance signs
    # itself in as the first.
    s = s.replace('try{ localStorage.setItem(LS_PASS, typed); }catch(e){}',
                  'try{ localStorage.setItem(LS_TAG+LS_PASS, typed); }catch(e){}')
    s = s.replace('try{ saved = localStorage.getItem(LS_PASS); }catch(e){}',
                  'try{ saved = localStorage.getItem(LS_TAG+LS_PASS); }catch(e){}')

    s = sub("  /* ---------- phone notifications ---------- */",
            "  window.__state = state;   // test copy\n"
            "  window.__patchJob = patchJob;\n"
            "  window.__saveRoster = saveRoster;\n"
            "  window.__errText = errText;\n"
            "  window.__todayIso = todayIso;\n"
            "  window.__repBill = function(){ return repBill; };\n"
            "  /* ---------- phone notifications ---------- */",
            "state reachable from a test")

    io.open(p, "w", encoding="utf-8").write(s)
    print("test copy built:", s.count("__noSW"), "noSW,",
          s.count("fakefb"), "fakefb,", s.count("LS_TAG"), "LS_TAG")

if __name__ == "__main__":
    build()
