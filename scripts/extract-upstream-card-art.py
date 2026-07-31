#!/usr/bin/env python3
"""Extract upstream print-and-play opportunity card art as WebP assets."""

from __future__ import annotations

import argparse
import csv
import math
import shutil
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PDF = ROOT.parent / "mofa-dengxiantai" / "output" / "pdf" / "末法登仙台_打印即玩套件_v0.1.pdf"
DEFAULT_CARDS_DIR = ROOT.parent / "mofa-dengxiantai" / "cards"
DEFAULT_OUT = ROOT / "public" / "assets" / "upstream" / "cards"

MM = 72 / 25.4
PAGE_W = 595.276
PAGE_H = 841.89
CARD_W = 63 * MM
CARD_H = 88 * MM
CARD_MARGIN_X = (PAGE_W - 3 * CARD_W) / 2
CARD_MARGIN_Y = (PAGE_H - 3 * CARD_H) / 2
DECKS = [
    ("opportunity-cards.csv", 23, [f"C{i:02d}" for i in range(1, 33)] + [f"E{i:02d}" for i in range(1, 17)]),
    ("calamity-cards.csv", 29, [f"T{i:02d}" for i in range(1, 19)]),
    ("fate-cards.csv", 31, [f"F{i:02d}" for i in range(1, 13)]),
]


def card_rect(slot: int) -> tuple[float, float, float, float]:
    row, col = divmod(slot, 3)
    x = CARD_MARGIN_X + col * CARD_W
    y = PAGE_H - CARD_MARGIN_Y - (row + 1) * CARD_H
    return x, y, CARD_W, CARD_H


def px(value: float, dpi: int, method=round) -> int:
    return int(method(value * dpi / 72))


def read_deck(csv_path: Path, expected: list[str]) -> list[dict[str, str]]:
    with csv_path.open(newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle))
    expected_set = set(expected)
    cards = [row for row in rows if row["id"] in expected_set]
    actual = sorted(row["id"] for row in cards)
    if actual != sorted(expected):
        missing = sorted(set(expected) - set(actual))
        extra = sorted(set(actual) - set(expected))
        raise SystemExit(f"unexpected card ids in {csv_path.name}; missing={missing} extra={extra}")
    return cards


def run(command: list[str]) -> None:
    subprocess.run(command, check=True)


def extract_card(
    pdf_path: Path,
    out_dir: Path,
    row: dict[str, str],
    deck_index: int,
    first_page: int,
    dpi: int,
    quality: int,
    tmp_dir: Path,
) -> str:
    page = first_page + deck_index // 9
    slot = deck_index % 9
    x, y, width, height = card_rect(slot)
    ppm_x = px(x, dpi, math.floor)
    ppm_y = px(PAGE_H - y - height, dpi, math.floor)
    ppm_w = px(width, dpi, math.ceil)
    ppm_h = px(height, dpi, math.ceil)

    png_base = tmp_dir / row["id"]
    png_path = png_base.with_suffix(".png")
    webp_path = out_dir / f"{row['id']}.webp"
    run(
        [
            "pdftoppm",
            "-png",
            "-r",
            str(dpi),
            "-f",
            str(page),
            "-l",
            str(page),
            "-singlefile",
            "-x",
            str(ppm_x),
            "-y",
            str(ppm_y),
            "-W",
            str(ppm_w),
            "-H",
            str(ppm_h),
            str(pdf_path),
            str(png_base),
        ]
    )
    run(["cwebp", "-quiet", "-q", str(quality), str(png_path), "-o", str(webp_path)])
    return (
        f"{row['id']}: page={page} slot={slot + 1} "
        f"crop_pt=({x:.3f},{y:.3f},{width:.3f},{height:.3f}) "
        f"crop_px=({ppm_x},{ppm_y},{ppm_w},{ppm_h}) path={webp_path.relative_to(ROOT)}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF)
    parser.add_argument("--cards-dir", type=Path, default=DEFAULT_CARDS_DIR)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--dpi", type=int, default=300)
    parser.add_argument("--quality", type=int, default=88)
    args = parser.parse_args()

    for executable in ["pdftoppm", "cwebp"]:
        if shutil.which(executable) is None:
            raise SystemExit(f"missing required executable: {executable}")
    if not args.pdf.exists():
        raise SystemExit(f"missing PDF: {args.pdf}")
    for csv_name, _, _ in DECKS:
        csv_path = args.cards_dir / csv_name
        if not csv_path.exists():
            raise SystemExit(f"missing CSV: {csv_path}")

    args.out_dir.mkdir(parents=True, exist_ok=True)
    for stale in args.out_dir.glob("*.webp"):
        stale.unlink()

    decks = [
        (csv_name, first_page, read_deck(args.cards_dir / csv_name, expected))
        for csv_name, first_page, expected in DECKS
    ]
    with tempfile.TemporaryDirectory(prefix="dengxian-cards-") as tmp:
        tmp_dir = Path(tmp)
        lines = []
        for csv_name, first_page, cards in decks:
            lines.append(f"# {csv_name}")
            lines.extend(
                extract_card(args.pdf, args.out_dir, row, index, first_page, args.dpi, args.quality, tmp_dir)
                for index, row in enumerate(cards)
            )

    card_count = sum(len(cards) for _, _, cards in decks)
    print(f"Extracted {card_count} cards to {args.out_dir.relative_to(ROOT)}")
    print("PDF crop boxes are in points from the lower-left page origin.")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
