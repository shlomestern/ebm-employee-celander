# -*- coding: utf-8 -*-
"""Build the test copy, serve it, run every suite, and say what failed."""
import os, re, io, subprocess, sys, time, http.server, socketserver, threading, functools

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(HERE, "site")
PORT = 8981

class Quiet(http.server.SimpleHTTPRequestHandler):
    """The server's own chatter buries the one line that matters."""
    def log_message(self, *a): pass

def serve():
    """Serve the test copy, or use whatever is already serving it.

    A suite run by hand leaves a server behind, and the next run of everything
    then died on the port rather than using it."""
    handler = functools.partial(Quiet, directory=SITE)
    socketserver.TCPServer.allow_reuse_address = True
    try:
        httpd = socketserver.TCPServer(("127.0.0.1", PORT), handler)
    except OSError:
        print("(a server is already on %d; using it)" % PORT)
        return None
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd

def versions():
    """index.html, sw.js and version.txt must all say the same version.

    They are three files and a release has to touch all three. Miss
    version.txt and the running app compares itself to an older number,
    puts up A newer version is ready, reloads, comes back the same, and
    says it again — a bar nobody can get rid of. Miss sw.js and phones go
    on serving the old shell out of the old cache. Cheaper to fail here."""
    root = os.path.dirname(HERE)
    def find(name, pat):
        txt = io.open(os.path.join(root, name), encoding="utf-8").read()
        m = re.search(pat, txt)
        return m.group(1) if m else None
    app = find("index.html", r'var APP_VERSION = "(v\d+)"')
    sw  = find("sw.js",      r'var CACHE = "ebm-crew-(v\d+)"')
    txt = io.open(os.path.join(root, "version.txt"), encoding="utf-8").read().strip()
    if app == sw == txt:
        print("version %s (index, sw, version.txt agree)" % app)
        return True
    print("VERSIONS DISAGREE: index.html %s, sw.js %s, version.txt %s" % (app, sw, txt))
    return False

def main(only=None):
    ok = versions()
    subprocess.run([sys.executable, os.path.join(HERE, "mksite.py")], check=True)
    httpd = serve(); time.sleep(0.6)
    names = sorted(f[:-3] for f in os.listdir(os.path.join(HERE, "suites"))
                   if f.endswith(".py"))
    if only: names = [n for n in names if n in only]
    bad = []
    for n in names:
        p = subprocess.run([sys.executable, os.path.join(HERE, "suites", n + ".py")],
                           capture_output=True, text=True,
                           env=dict(os.environ, PLAYWRIGHT_BROWSERS_PATH="/opt/pw-browsers"))
        tail = [l for l in p.stdout.splitlines() if l.startswith("FAILURES")]
        print("%-12s %s" % (n + ":", tail[-1] if tail else "DID NOT FINISH"))
        if p.returncode: bad.append((n, p.stdout, p.stderr))
    if httpd: httpd.shutdown()
    for n, out, err in bad:
        print("\n===== %s =====" % n)
        print("\n".join(l for l in out.splitlines() if "FAIL" in l or "got " in l))
        if err.strip(): print(err.strip()[-600:])
    print("\n%d of %d suites passed" % (len(names) - len(bad), len(names)))
    if not ok: print("and the three version numbers do not agree")
    return 1 if (bad or not ok) else 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:] or None))
