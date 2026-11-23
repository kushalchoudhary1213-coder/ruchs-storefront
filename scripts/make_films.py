"""Make a short product film for each piece from its own catalog photography.

Each film moves slowly across up to four of the product's photos (gentle push-in
or drift on each) with dissolves between them, encoded as a silent, looping
H.264 MP4 (720x960, 3:4) plus a WebM for browsers that prefer it. Output goes to
assets/films/<handle>.mp4 and is copied into the site by the build.

Run: python scripts/make_films.py [handle ...]   (needs ffmpeg on PATH)
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "dist" / "static" / "catalog"
OUT = ROOT / "assets" / "films"
W, H, FPS = 720, 960, 25
SEGMENT, FADE = 3.2, 0.7
MOVES = [  # (zoom expression, x expression, y expression) per shot, cycled
    ("min(zoom+0.0009,1.12)", "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"),          # push in, centred
    ("1.10", "(iw-iw/zoom)*(on/{n})", "ih/2-(ih/zoom/2)"),                       # drift right
    ("max(1.12-0.0009*on,1.0)", "iw/2-(iw/zoom/2)", "(ih-ih/zoom)*0.35"),        # pull out, upper
    ("1.10", "(iw-iw/zoom)*(1-on/{n})", "(ih-ih/zoom)*0.45"),                    # drift left
]


def catalog_image(src: str) -> Path:
    return CATALOG / (src.split("?")[0].rsplit("/", 1)[-1] + ".webp")


def make_film(product: dict) -> Path | None:
    shots = [catalog_image(image["src"]) for image in product["images"]]
    shots = [shot for shot in shots if shot.exists()][:4]
    if len(shots) < 2:
        return None
    frames = int(SEGMENT * FPS)
    inputs, filters = [], []
    for i, shot in enumerate(shots):
        zoom, x, y = MOVES[i % len(MOVES)]
        inputs += ["-loop", "1", "-t", f"{SEGMENT}", "-i", str(shot)]
        filters.append(
            f"[{i}:v]scale={W * 2}:{H * 2}:force_original_aspect_ratio=increase,crop={W * 2}:{H * 2},setsar=1,"
            f"zoompan=z='{zoom}':x='{x.format(n=frames)}':y='{y.format(n=frames)}':d={frames}:s={W}x{H}:fps={FPS},"
            f"format=yuv420p,trim=duration={SEGMENT},setpts=PTS-STARTPTS[s{i}]"
        )
    chain, offset = "[s0]", SEGMENT - FADE
    for i in range(1, len(shots)):
        label = f"[x{i}]"
        filters.append(f"{chain}[s{i}]xfade=transition=fade:duration={FADE}:offset={offset:.2f}{label}")
        chain, offset = label, offset + SEGMENT - FADE
    OUT.mkdir(parents=True, exist_ok=True)
    mp4 = OUT / f"{product['handle']}.mp4"
    graph = ";".join(filters)
    subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", graph, "-map", chain,
                    "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-profile:v", "high",
                    "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(mp4)], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(mp4), "-an", "-c:v", "libvpx-vp9", "-b:v", "0",
                    "-crf", "38", "-row-mt", "1", "-deadline", "good", str(mp4.with_suffix(".webm"))], check=True)
    return mp4


def main() -> None:
    products = json.loads((ROOT / "dist" / "products.json").read_text(encoding="utf-8"))["products"]
    wanted = set(sys.argv[1:])
    for product in products:
        if wanted and product["handle"] not in wanted:
            continue
        film = make_film(product)
        if film:
            print(f"{product['handle']}: {film.stat().st_size // 1024} KB mp4, {film.with_suffix('.webm').stat().st_size // 1024} KB webm")
        else:
            print(f"{product['handle']}: skipped (fewer than two photos)")


if __name__ == "__main__":
    main()
