"""本地截图接收器：游戏页面把 canvas 以 dataURL POST 过来，这里保存成 PNG。

仅用于开发期留档，不参与游戏运行。
用法：python3 tools/save-shot.py [port] [outDir]
"""
import base64
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8099
OUT = sys.argv[2] if len(sys.argv) > 2 else "docs/screenshots"


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        name = self.path.strip("/").split("?")[0] or "shot"
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8", "replace")
        if "," in body and body.startswith("data:"):
            body = body.split(",", 1)[1]
        os.makedirs(OUT, exist_ok=True)
        path = os.path.join(OUT, f"{name}.png")
        with open(path, "wb") as f:
            f.write(base64.b64decode(body))
        self.send_response(200)
        self._cors()
        self.end_headers()
        self.wfile.write(b"ok")
        print("saved", path, os.path.getsize(path) // 1024, "KB", flush=True)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print(f"shot server on http://127.0.0.1:{PORT} -> {OUT}", flush=True)
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
