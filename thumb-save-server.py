# 縮圖存檔小伺服器：接收瀏覽器 POST 的 webp bytes，存進 web-deploy/
# 用完即關（僅本機、僅白名單檔名）
import re, os
from http.server import BaseHTTPRequestHandler, HTTPServer

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web-deploy")
SAFE = re.compile(r"^thumb-[a-z0-9]+\.webp$")

class H(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def do_GET(self):
        self.send_response(200); self._cors(); self.end_headers()
        self.wfile.write(b"pong")

    def do_POST(self):
        name = self.path.split("/save/")[-1]
        if not SAFE.match(name):
            self.send_response(400); self._cors(); self.end_headers()
            self.wfile.write(b"bad name"); return
        n = int(self.headers.get("Content-Length", 0))
        data = self.rfile.read(n)
        with open(os.path.join(OUT, name), "wb") as f:
            f.write(data)
        self.send_response(200); self._cors(); self.end_headers()
        self.wfile.write(("ok %s %d" % (name, len(data))).encode())

    def log_message(self, *a):
        pass

HTTPServer(("127.0.0.1", 9123), H).serve_forever()
