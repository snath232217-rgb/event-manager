#!/usr/bin/env python3
"""
EventPulse - Offline-First Event Operations Server
Standard library Python HTTP server (zero external dependencies).
Serves the tactical operations web app and provides simulation endpoints.
"""

import http.server
import socketserver
import os
import sys
import json
import webbrowser

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class EventOpsHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        if self.path == '/api/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            response = {
                "status": "operational",
                "service": "EventPulse Master Sync Hub",
                "version": "1.0.0",
                "connectivity": "active"
            }
            self.wfile.write(json.dumps(response).encode('utf-8'))
            return
        
        # Default file serving
        return super().do_GET()

    def do_POST(self):
        if self.path == '/api/ai-advisor':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                payload = json.loads(post_data.decode('utf-8'))
            except Exception:
                payload = {}

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()

            # OpsAI response
            result = {
                "status": "success",
                "engine": "OpsAI-Heuristic-V1",
                "recommendation": "Safely reallocate room and substitute compatible inventory.",
                "received_context": payload
            }
            self.wfile.write(json.dumps(result).encode('utf-8'))
            return

        self.send_response(404)
        self.end_headers()

    def log_message(self, format, *args):
        # Clean tactical logger
        sys.stderr.write(f"[EventPulse Server] {self.address_string()} - {format % args}\n")

def run():
    # Allow port reuse
    socketserver.TCPServer.allow_reuse_address = True
    # Configure utf-8 output if possible, or use ascii
    if hasattr(sys.stdout, 'reconfigure'):
        try:
            sys.stdout.reconfigure(encoding='utf-8', errors='replace')
            sys.stderr.reconfigure(encoding='utf-8', errors='replace')
        except Exception:
            pass

    try:
        with socketserver.TCPServer(("", PORT), EventOpsHandler) as httpd:
            print("=" * 65)
            print("  [ONLINE] EVENTPULSE // OFFLINE-FIRST EVENT COORDINATION SYSTEM")
            print("=" * 65)
            print(f"  > Server running at: http://localhost:{PORT}")
            print(f"  > Serving files from: {DIRECTORY}")
            print("  > Zero external dependencies required (Pure Python standard library)")
            print("  > Press Ctrl+C in terminal to stop.")
            print("=" * 65)
            httpd.serve_forever()
    except OSError as e:
        if e.errno == 98 or e.errno == 10048:
            alt_port = PORT + 1
            print(f"Port {PORT} in use, trying {alt_port}...")
            with socketserver.TCPServer(("", alt_port), EventOpsHandler) as httpd:
                print(f"  > Server running at: http://localhost:{alt_port}")
                httpd.serve_forever()
        else:
            raise

if __name__ == '__main__':
    run()
