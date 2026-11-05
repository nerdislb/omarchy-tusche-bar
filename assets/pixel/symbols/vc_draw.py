#!/usr/bin/env python3
"""Draw the Tusche pixel symbols in VectorCraft (headless) from the 7x7 spec.

Usage: python3 -I vc_draw.py SPEC.json OUTDIR

Writes OUTDIR/tusche-pixel-symbols.vectorcraft (the editable master: one named
path per symbol, "U+F009A md-bell", built from whole grid cells), plus the
VectorCraft exports tusche-pixel-symbols.svg (source for the font) and
tusche-pixel-symbols.png (contact sheet). Receipts go to OUTDIR/vc-receipts.jsonl.
"""
import json
import os
import subprocess
import sys

CELL = 8          # px per icon pixel in the master
GRID = 7          # icon is 7x7 cells
PITCH = GRID + 3  # cells between icon origins (3 cells gap)
COLS = 16
INK = "#1d1d1d"

spec_path, outdir = sys.argv[1], os.path.abspath(sys.argv[2])
os.makedirs(outdir, exist_ok=True)
spec = json.load(open(spec_path))
cps = sorted(spec, key=lambda k: int(k, 16))
rows_n = (len(cps) + COLS - 1) // COLS
width = (COLS * PITCH + 1) * CELL
height = (rows_n * PITCH + 1) * CELL

receipts = open(os.path.join(outdir, "vc-receipts.jsonl"), "w")
proc = subprocess.Popen(
    ["vectorcraft-cli", "mcp", "--headless",
     "--automation-read-root", outdir, "--automation-write-root", outdir],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE,
    stderr=open(os.path.join(outdir, "vc.stderr"), "w"), text=True)
seq = 0


def rpc(method, params):
    global seq
    seq += 1
    proc.stdin.write(json.dumps({"jsonrpc": "2.0", "id": seq, "method": method, "params": params}) + "\n")
    proc.stdin.flush()
    while True:
        line = proc.stdout.readline()
        if not line:
            raise SystemExit("vectorcraft-cli closed the pipe")
        msg = json.loads(line)
        if msg.get("id") == seq:
            return msg


def tool(name, args):
    msg = rpc("tools/call", {"name": name, "arguments": args})
    if "error" in msg or msg["result"].get("isError"):
        raise SystemExit(f"{name} failed: {json.dumps(msg)[:800]}")
    text = msg["result"]["content"][0]["text"]
    try:
        out = json.loads(text)
    except ValueError:
        out = text
    receipts.write(json.dumps({"tool": name, "result": out if name != "draw_path" else {"id": out.get("id"), "name": out.get("name")}})[:2000] + "\n")
    return out


def runs(rows):
    """Horizontal runs of on-cells: (x, y, length) in cell units."""
    for y, row in enumerate(rows):
        x = 0
        while x < len(row):
            if row[x] == "#":
                start = x
                while x < len(row) and row[x] == "#":
                    x += 1
                yield start, y, x - start
            else:
                x += 1


rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {},
                   "clientInfo": {"name": "tusche-pixel-symbols", "version": "1"}})
proc.stdin.write(json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}) + "\n")
proc.stdin.flush()

tool("run_command", {"command": "file.new", "params": {
    "name": "Tusche Pixel Symbols", "width": width, "height": height, "units": "Pixels",
    "colorMode": "rgb", "backgroundContents": "white"}})

for i, cp in enumerate(cps):
    entry = spec[cp]
    rows = entry["rows"]
    assert len(rows) == GRID and all(len(r) == GRID for r in rows), cp
    ox = (1 + (i % COLS) * PITCH) * CELL
    oy = (1 + (i // COLS) * PITCH) * CELL
    d = " ".join(f"M{ox + x * CELL} {oy + y * CELL}h{n * CELL}v{CELL}h{-n * CELL}z"
                 for x, y, n in runs(rows))
    if not d:
        continue
    tool("draw_path", {"name": f"U+{cp.upper()} {entry['name']}", "d": d, "fill": INK,
                       "stroke": "none", "strokeWidth": 0})

saved = tool("save_file", {"path": os.path.join(outdir, "tusche-pixel-symbols.vectorcraft")})
svg = tool("export", {"path": os.path.join(outdir, "tusche-pixel-symbols.svg"), "format": "svg",
                      "scale": 1, "outlineText": True, "options": {}})
png = tool("export", {"path": os.path.join(outdir, "tusche-pixel-symbols.png"), "format": "png",
                      "scale": 1, "outlineText": True, "options": {}})
proc.stdin.close()
proc.wait()
receipts.close()
meta = {"cell": CELL, "grid": GRID, "pitch": PITCH, "cols": COLS, "count": len(cps),
        "width": width, "height": height}
json.dump(meta, open(os.path.join(outdir, "layout.json"), "w"), indent=1)
print(json.dumps({"saved": saved.get("path"), "warnings": saved.get("warnings"),
                  "svg_warnings": svg.get("warnings"), "png_warnings": png.get("warnings"), **meta}))
