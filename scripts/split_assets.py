"""Temporary utility for sending the large static snapshot in small Git pushes."""

import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PENDING = ROOT.parent / "ruchs-pending-assets"
MANIFEST = PENDING / "groups.json"

if sys.argv[1] == "prepare":
    assert ROOT.resolve() == Path(r"C:\Users\kushal\Documents\ChatGPT\ruchs").resolve()
    assert PENDING.resolve() == Path(r"C:\Users\kushal\Documents\ChatGPT\ruchs-pending-assets").resolve()
    PENDING.mkdir(exist_ok=True)
    files = sorted(
        (p for p in (ROOT / "dist" / "cdn").rglob("*") if p.is_file() and p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".mp4", ".avif"}),
        key=lambda p: p.stat().st_size,
        reverse=True,
    )
    groups: list[list[str]] = []
    sizes: list[int] = []
    for file in files:
        index = next((i for i, size in enumerate(sizes) if size + file.stat().st_size < 30_000_000), None)
        if index is None:
            index = len(groups)
            groups.append([])
            sizes.append(0)
        relative = str(file.relative_to(ROOT))
        groups[index].append(relative)
        sizes[index] += file.stat().st_size
        target = PENDING / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(file, target)
    MANIFEST.write_text(json.dumps(groups, indent=2))
    print("groups", len(groups), "sizes MB", [round(s / 1e6, 1) for s in sizes])
elif sys.argv[1] == "restore":
    group = int(sys.argv[2])
    groups = json.loads(MANIFEST.read_text())
    for relative in groups[group]:
        source = PENDING / relative
        target = ROOT / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(source, target)
    print("restored group", group, "files", len(groups[group]))
