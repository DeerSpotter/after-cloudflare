#!/usr/bin/env python3
"""Launch the Flareless local demo server and Tkinter client together."""

from __future__ import annotations

import argparse
import threading
import time

from client import ApiClient, FlarelessConsole
from server import DEFAULT_HOST, DEFAULT_PORT, run_server


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Flareless local demo console.")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = parser.parse_args()

    server = run_server(args.host, args.port)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    time.sleep(0.25)

    try:
        app = FlarelessConsole(ApiClient(f"http://{args.host}:{args.port}"))
        app.mainloop()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
