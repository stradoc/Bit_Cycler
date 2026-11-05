# Serves Bit Cycler's game folder on this computer and opens it in the
# default browser: the Mac's twin of serve-windows.ps1, with Python's own
# web server. "Play Bit Cycler.command" starts it. The game is plain files,
# but browsers only run its modules from a web address, not by opening
# index.html directly. Close the window to stop.

import functools
import http.server
import os
import sys
import webbrowser

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'game')


class Handler(http.server.SimpleHTTPRequestHandler):
    # A module must be served as JavaScript, or the browser refuses it.
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript', '.map': 'application/json', '.woff2': 'font/woff2',
    }

    def end_headers(self):
        # Always the latest files, after an update.
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, format, *args):
        pass


# The first free port from 8000 (only this computer can reach it: localhost).
server = None
for port in range(8000, 8021):
    try:
        server = http.server.ThreadingHTTPServer(('localhost', port), functools.partial(Handler, directory=root))
        break
    except OSError:
        pass
if server is None:
    print('No free port between 8000 and 8020: close other servers and try again.')
    sys.exit(1)

address = f'http://localhost:{port}/'
print()
print('  BIT CYCLER')
print(f'  Playing at {address}')
print('  Close this window to stop the game.')
print()
webbrowser.open(address)

try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
