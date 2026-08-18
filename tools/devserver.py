#!/usr/bin/env python3
"""Serve the sim on its own port.

Its own port, deliberately: sharing a port with another project's preview
server serves stale modules from a warm cache and you debug a file you are
not editing (PLAYBOOK section 7).
"""
import http.server, socketserver, os
PORT = 8411
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
print(f'eram-sim on http://localhost:{PORT}')
socketserver.TCPServer.allow_reuse_address = True
socketserver.TCPServer(('', PORT), H).serve_forever()
