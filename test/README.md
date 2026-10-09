# The test harness

Playwright drives a copy of the real app against a stand-in for Firestore, so
a change can be tried against a calendar full of work without touching the
live one.

    python3 test/mksite.py          # build test/site from the app
    cd test/site && python3 -m http.server 8981 &
    python3 test/suites/<name>.py   # run one
    python3 test/run.py             # run them all

The codes in here are fixtures. The crew's real codes are not in this
repository and must never be put in it.

The first version of this harness lived in a container's temp directory and
went when the container was reclaimed, taking thirty-seven suites with it.
That is why it is committed now.
