#!/usr/bin/env python3
"""Run a local server for Obby Game (no npm required)."""
import http.server
import socketserver
import webbrowser
from pathlib import Path

PORT = 5173
ROOT = Path(__file__).resolve().parent


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)


if __name__ == "__main__":
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        url = f"http://localhost:{PORT}"
        print(f"Obby Game running at {url}")
        print("Press Ctrl+C to stop.")
        webbrowser.open(url)
        httpd.serve_forever()
