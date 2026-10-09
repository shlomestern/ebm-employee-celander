Suites go here. Each one is a standalone script:

    python3 test/suites/<name>.py

It boots the app on the stand-in database with a fixture roster and a set of
jobs, drives it, and prints PASS or FAIL per check, then a count. The codes in
fixtures are made up; the crew's real codes are never in this repository.
