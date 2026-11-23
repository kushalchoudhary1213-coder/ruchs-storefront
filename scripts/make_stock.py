"""Prepare licensed stock media for the site.

Sources (downloaded once, kept outside the repo, passed in as a folder):
  textures/  Poly Haven diffuse maps (CC0): crepe_satin, crepe_georgette, rough_linen,
             faux_fur_geometric
  videos/    Mixkit Stock Video Free License clips: 40233 (pink fabric in the wind:
             behind page and collection titles), 40213 (red wavy fabric texture, 1080p:
             the red edit's satin window)

Textures become neutral, tileable weave maps (the CSS tints them with blend
modes). Videos are colour-graded toward the Ruchs palette and made into
seamless forward-and-back loops, as mp4 and webm, without audio.

Usage: python scripts/make_stock.py <download folder>
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_TEX = ROOT / "assets" / "showcase" / "textures"
OUT_VID = ROOT / "assets" / "showcase" / "stock"

# source: (output name, contrast) - flat weaves get more contrast so the thread shows.
TEXTURES = {
    "crepe_satin": ("satin", 2.6),
    "crepe_georgette": ("georgette", 2.6),
    "rough_linen": ("linen", 1.8),
    "faux_fur_geometric": ("geometric-weave", 1.15),
}

# name: (source id, start second, seconds, crop/scale, colour grade, loop)
# The fabric clips loop forward and back.
VIDEOS = {
    "blush-fabric": ("40233", 2.0, 7.0, "scale=720:-2", "hue=h=-12:s=0.75,eq=brightness=0.06:contrast=0.95", True),
    # The satin is soft and sits behind text: 1280 wide is enough, with a gentler crf,
    # since smooth gradients band easily.
    "red-satin": ("40213", 3.0, 8.0, "scale=1280:-2", "hue=h=-8:s=0.92,eq=contrast=1.08:brightness=-0.04:gamma=0.96", True, (24, 33)),
}


def run(*args: str) -> None:
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def main() -> None:
    source = Path(sys.argv[1])
    OUT_TEX.mkdir(parents=True, exist_ok=True)
    OUT_VID.mkdir(parents=True, exist_ok=True)
    for name, (out, contrast) in TEXTURES.items():
        # Grey weave map: neutral colour, normalised contrast. The CSS tiles these at
        # 300 to 420px under a blend mode, so a 640px tile stays sharp on 2x screens.
        run("-i", str(source / "textures" / f"{name}.jpg"),
            "-vf", f"format=gray,normalize=smoothing=0,scale=640:640,eq=contrast={contrast}",
            "-c:v", "libwebp", "-quality", "62", str(OUT_TEX / f"{out}.webp"))
    only = set(sys.argv[2:])  # optional: names to (re)make, e.g. red-satin
    for out, (clip, start, seconds, scale, grade, loop, *quality) in VIDEOS.items():
        if only and out not in only:
            continue
        crf_mp4, crf_webm = quality[0] if quality else (27, 38)
        # Loops play forward then reversed, so there is no visible seam.
        base = f"[0:v]trim=start={start}:duration={seconds},setpts=PTS-STARTPTS,{scale},{grade},fps=25"
        graph = base + (",split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1:a=0[v]" if loop else "[v]")
        src = str(source / "videos" / f"{clip}.mp4")
        run("-i", src, "-filter_complex", graph, "-map", "[v]", "-an", "-c:v", "libx264", "-crf", str(crf_mp4), "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(OUT_VID / f"{out}.mp4"))
        run("-i", src, "-filter_complex", graph, "-map", "[v]", "-an", "-c:v", "libvpx-vp9", "-crf", str(crf_webm), "-b:v", "0", "-row-mt", "1", str(OUT_VID / f"{out}.webm"))
        run("-i", str(OUT_VID / f"{out}.mp4"), "-frames:v", "1", "-c:v", "libwebp", "-quality", "70", str(OUT_VID / f"{out}.webp"))
    for path in sorted([*OUT_TEX.iterdir(), *OUT_VID.iterdir()]):
        print(f"{path.relative_to(ROOT)}: {path.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
