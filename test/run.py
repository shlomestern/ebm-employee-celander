# -*- coding: utf-8 -*-
"""Build the test copy, serve it, run every suite, and say what failed."""
import os, subprocess, sys, time, http.server, socketserver, threading, functools

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(HERE, "site")
PORT = 8981

def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=SITE)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd

def main(only=None):
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
    httpd.shutdown()
    for n, out, err in bad:
        print("\n===== %s =====" % n)
        print("\n".join(l for l in out.splitlines() if "FAIL" in l or "got " in l))
        if err.strip(): print(err.strip()[-600:])
    print("\n%d of %d suites passed" % (len(names) - len(bad), len(names)))
    return 1 if bad else 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:] or None))
