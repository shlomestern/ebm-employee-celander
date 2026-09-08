from playwright.sync_api import sync_playwright
CHROME="/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
OUT="/home/user/ebm-employee-Celander-/icons/"
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
    for name,size in (("ebm-512-v2.png",512),("ebm-192-v2.png",192),("ebm-apple-v2.png",180)):
        pg=b.new_context(viewport={"width":size,"height":size}, device_scale_factor=1).new_page()
        pg.goto("file:///tmp/claude-0/-home-user-ebm-employee-Celander-/c7581457-89fb-5deb-9106-5acf240e9f2e/scratchpad/logo.html")
        pg.wait_for_timeout(250)
        pg.screenshot(path=OUT+name, omit_background=False)
        print("wrote", name, size)
        pg.context.close()
    b.close()
