#!/usr/bin/env python3
"""Run local demo console checks."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def run(command: list[str]) -> int:
    print("$ " + " ".join(command))
    return subprocess.call(command, cwd=ROOT)


def main() -> int:
    checks = [
        [sys.executable, "-m", "compileall", "."],
        [sys.executable, "check_fixtures.py"],
        [sys.executable, "-m", "unittest", "discover", "-s", "tests", "-v"],
    ]
    for command in checks:
        code = run(command)
        if code != 0:
            return code
    return 0


if __name__ == "__main__":
    sys.exit(main())
