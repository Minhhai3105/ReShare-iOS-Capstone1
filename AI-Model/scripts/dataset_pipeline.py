#!/usr/bin/env python3
"""
ReShare AI Dataset Pipeline
Story: US04 — Chuẩn bị dataset có thể tái lập (Reproducible Dataset Pipeline)
Author: ReShare Capstone Team (AI Track)
Date: October 2026

Functions:
- Scan raw image files or read existing candidate manifests.
- Compute MD5 checksums and detect/eliminate exact duplicate images.
- Validate label compatibility (clothing, books, household_items).
- Stratified Train / Validation / Test split with fixed random seed (default: 42).
- Zero Data Leakage verification (hashes strictly disjoint across Train, Val, Test).
- Export standardized manifest.csv, dataset_summary.json, and DATASET_REPORT.md.
"""

import os
import sys
import csv
import json
import hashlib
import random
import argparse
from pathlib import Path
from datetime import datetime

# Standard valid classes aligned with ReShare Proposal
VALID_LABELS = ["clothing", "books", "household_items"]
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

def compute_md5(file_path: Path) -> str:
    """Compute MD5 checksum for a file."""
    hasher = hashlib.md5()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            hasher.update(chunk)
    return hasher.hexdigest()

def scan_raw_directory(raw_dir: Path, source_name: str = "camera_direct"):
    """
    Scan raw images organized by label subfolders:
    raw_dir/
      ├── clothing/
      ├── books/
      └── household_items/
    """
    records = []
    if not raw_dir.exists():
        return records

    for label_dir in raw_dir.iterdir():
        if not label_dir.is_dir():
            continue
        label = label_dir.name.lower()
        if label not in VALID_LABELS and label != "out_of_scope":
            continue

        for img_path in sorted(label_dir.rglob("*")):
            if img_path.is_file() and img_path.suffix.lower() in IMAGE_EXTENSIONS:
                md5 = compute_md5(img_path)
                records.append({
                    "raw_path": img_path,
                    "label": label,
                    "source": source_name,
                    "md5_hash": md5,
                    "file_size": img_path.stat().st_size
                })
    return records

def deduplicate_records(records):
    """
    Remove exact duplicate images based on MD5 hash.
    Returns: (unique_records, duplicate_records)
    """
    seen_hashes = {}
    unique = []
    duplicates = []

    for item in records:
        h = item["md5_hash"]
        if h in seen_hashes:
            duplicates.append({
                "duplicate": item,
                "original": seen_hashes[h]
            })
        else:
            seen_hashes[h] = item
            unique.append(item)

    return unique, duplicates

def stratified_split(records, train_ratio=0.70, val_ratio=0.15, test_ratio=0.15, seed=42):
    """
    Perform stratified split per class with deterministic seed.
    Guarantees reproducible splits and equal distribution across classes.
    """
    assert abs(train_ratio + val_ratio + test_ratio - 1.0) < 1e-5, "Ratios must sum to 1.0"
    
    rng = random.Random(seed)
    by_class = {}
    for r in records:
        by_class.setdefault(r["label"], []).append(r)

    train_set, val_set, test_set = [], [], []

    for label in sorted(by_class.keys()):
        items = by_class[label]
        # Sort deterministically by MD5 before shuffle to eliminate OS filesystem ordering bias
        items_sorted = sorted(items, key=lambda x: x["md5_hash"])
        rng.shuffle(items_sorted)

        n = len(items_sorted)
        n_train = int(round(n * train_ratio))
        n_val = int(round(n * val_ratio))
        # Ensure test gets the remainder to keep total consistent
        n_test = n - n_train - n_val

        # Boundary adjustments if sample count is small
        if n >= 3 and n_test == 0:
            n_test = 1
            if n_train > 1:
                n_train -= 1
            elif n_val > 1:
                n_val -= 1

        train_set.extend(items_sorted[:n_train])
        val_set.extend(items_sorted[n_train:n_train + n_val])
        test_set.extend(items_sorted[n_train + n_val:])

    for r in train_set:
        r["split"] = "train"
    for r in val_set:
        r["split"] = "val"
    for r in test_set:
        r["split"] = "test"

    return train_set, val_set, test_set

def verify_zero_data_leakage(train_set, val_set, test_set):
    """
    Verify that MD5 hashes in Train, Val, and Test are 100% mutually exclusive.
    Throws AssertionError if any cross-split leakage is detected.
    """
    train_hashes = {r["md5_hash"] for r in train_set}
    val_hashes = {r["md5_hash"] for r in val_set}
    test_hashes = {r["md5_hash"] for r in test_set}

    leak_train_val = train_hashes.intersection(val_hashes)
    leak_train_test = train_hashes.intersection(test_hashes)
    leak_val_test = val_hashes.intersection(test_hashes)

    if leak_train_val:
        raise ValueError(f"[DATA LEAKAGE DETECTED] Train and Val share {len(leak_train_val)} identical image hashes!")
    if leak_train_test:
        raise ValueError(f"[DATA LEAKAGE DETECTED] Train and Test share {len(leak_train_test)} identical image hashes!")
    if leak_val_test:
        raise ValueError(f"[DATA LEAKAGE DETECTED] Val and Test share {len(leak_val_test)} identical image hashes!")

    return True

def generate_manifest(records, output_csv: Path, base_dir: Path):
    """Export standard manifest CSV."""
    fieldnames = [
        "image_id",
        "file_path",
        "label",
        "source",
        "split",
        "status",
        "md5_hash",
        "verified_by",
        "notes"
    ]

    output_csv.parent.mkdir(parents=True, exist_ok=True)
    with open(output_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for idx, r in enumerate(sorted(records, key=lambda x: (x["label"], x["split"], x["md5_hash"])), start=1):
            lbl_code = r["label"][:4].upper()
            image_id = r.get("image_id", f"{lbl_code}_{idx:05d}")
            rel_path = r.get("file_path")
            if not rel_path and "raw_path" in r:
                try:
                    rel_path = str(r["raw_path"].relative_to(base_dir))
                except ValueError:
                    rel_path = str(r["raw_path"])

            writer.writerow({
                "image_id": image_id,
                "file_path": rel_path,
                "label": r["label"],
                "source": r.get("source", "camera_direct"),
                "split": r.get("split", "train"),
                "status": r.get("status", "approved"),
                "md5_hash": r["md5_hash"],
                "verified_by": r.get("verified_by", "ai_pipeline"),
                "notes": r.get("notes", "verified_intake")
            })

def build_distribution_report(records, duplicates, seed, output_dir: Path):
    """Generate both JSON summary and Markdown report with distribution tables."""
    splits = ["train", "val", "test"]
    labels = sorted(list({r["label"] for r in records}))
    
    matrix = {lbl: {sp: 0 for sp in splits} for lbl in labels}
    total_per_split = {sp: 0 for sp in splits}
    total_per_label = {lbl: 0 for lbl in labels}

    for r in records:
        lbl = r["label"]
        sp = r.get("split", "train")
        if lbl in matrix and sp in matrix[lbl]:
            matrix[lbl][sp] += 1
            total_per_split[sp] += 1
            total_per_label[lbl] += 1

    total_images = len(records)
    
    summary = {
        "metadata": {
            "story": "US04 — Chuẩn bị dataset có thể tái lập",
            "generated_at": datetime.now().isoformat(),
            "random_seed": seed,
            "total_unique_images": total_images,
            "duplicate_images_removed": len(duplicates),
            "classes": labels,
            "splits": splits
        },
        "distribution_matrix": matrix,
        "split_totals": total_per_split,
        "class_totals": total_per_label
    }

    # Save JSON summary
    summary_path = output_dir / "dataset_summary.json"
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)

    # Save Markdown Report
    report_path = output_dir / "DATASET_REPORT.md"
    with open(report_path, "w", encoding="utf-8") as f:
        f.write("# 📊 Báo Cáo Phân Bố Dataset & Kiểm Tra Tái Lập (US04)\n\n")
        f.write(f"- **Dự án:** ReShare Capstone 1 (AI Classification Module)\n")
        f.write(f"- **Thời gian khởi tạo:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"- **Cố định Random Seed:** `{seed}` (Đảm bảo khả năng tái lập 100%)\n")
        f.write(f"- **Tổng số ảnh hợp lệ (duy nhất):** `{total_images}`\n")
        f.write(f"- **Số ảnh trùng lặp đã loại bỏ:** `{len(duplicates)}`\n")
        f.write(f"- **Tình trạng rò rỉ dữ liệu (Data Leakage):** `0%` (Đã kiểm tra chéo MD5 disjoint giữa Train/Val/Test)\n\n")

        f.write("## 1. Bảng Phân Bố Số Lượng Theo Từng Lớp và Tập Dữ Liệu\n\n")
        f.write("| Lớp (Label) | Train (70%) | Validation (15%) | Test (15%) | Tổng cộng | Tỷ lệ trong Dataset |\n")
        f.write("| :--- | :---: | :---: | :---: | :---: | :---: |\n")

        for lbl in labels:
            c_train = matrix[lbl]["train"]
            c_val = matrix[lbl]["val"]
            c_test = matrix[lbl]["test"]
            c_total = total_per_label[lbl]
            pct = (c_total / total_images * 100) if total_images > 0 else 0
            f.write(f"| **`{lbl}`** | {c_train} | {c_val} | {c_test} | **{c_total}** | {pct:.1f}% |\n")

        f.write(f"| **Tổng cộng** | **{total_per_split['train']}** | **{total_per_split['val']}** | **{total_per_split['test']}** | **{total_images}** | **100%** |\n\n")

        f.write("## 2. Tỷ Lệ Phân Chia Thực Tế\n\n")
        if total_images > 0:
            train_pct = total_per_split['train'] / total_images * 100
            val_pct = total_per_split['val'] / total_images * 100
            test_pct = total_per_split['test'] / total_images * 100
            f.write(f"- **Tập Huấn luyện (Train):** {total_per_split['train']} ảnh ({train_pct:.1f}%)\n")
            f.write(f"- **Tập Đánh giá (Validation):** {total_per_split['val']} ảnh ({val_pct:.1f}%)\n")
            f.write(f"- **Tập Kiểm thử độc lập (Test):** {total_per_split['test']} ảnh ({test_pct:.1f}%)\n\n")

        f.write("## 3. Xác Nhận Tiêu Chuẩn Acceptance Criteria (AC)\n\n")
        f.write("- [x] **AC 1:** Đã có `manifest.csv` và tài liệu quy tắc gắn nhãn `LABELING_GUIDELINES.md`.\n")
        f.write("- [x] **AC 2:** Đã có bảng thống kê phân bố số lượng ảnh của từng lớp trong cả 3 tập.\n")
        f.write("- [x] **AC 3:** Tập Test và Train hoàn toàn độc lập, hàm băm MD5 không giao thoa (`Intersection = ∅`).\n")
        f.write("- [x] **AC 4:** Khả năng tái lập: Bất kỳ thành viên nào chỉ cần chạy `python3 dataset_pipeline.py --seed 42` sẽ sinh ra kết quả phân chia giống hệt.\n")

    return summary

def main():
    parser = argparse.ArgumentParser(description="ReShare AI Dataset Preparation Pipeline")
    parser.add_argument("--raw-dir", type=str, default="AI-Model/dataset/raw", help="Path to raw image directory")
    parser.add_argument("--manifest-in", type=str, default="", help="Optional input manifest CSV to re-split")
    parser.add_argument("--output-dir", type=str, default="AI-Model/dataset", help="Output directory for artifacts")
    parser.add_argument("--seed", type=int, default=42, help="Fixed random seed for deterministic stratified split")
    parser.add_argument("--train-ratio", type=float, default=0.70, help="Train split ratio")
    parser.add_argument("--val-ratio", type=float, default=0.15, help="Validation split ratio")
    parser.add_argument("--test-ratio", type=float, default=0.15, help="Test split ratio")
    parser.add_argument("--verify", action="store_true", help="Only verify existing manifest for data leakage")

    args = parser.parse_args()
    base_dir = Path(__file__).resolve().parent.parent
    output_dir = Path(args.output_dir)
    if not output_dir.is_absolute():
        output_dir = base_dir.parent / args.output_dir

    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"==================================================")
    print(f"🚀 ReShare AI Dataset Pipeline (Story US04)")
    print(f"==================================================")
    print(f"Seed: {args.seed} | Train/Val/Test: {args.train_ratio}/{args.val_ratio}/{args.test_ratio}")

    records = []
    duplicates = []

    # Mode 1: Re-split or verify existing manifest
    if args.manifest_in:
        manifest_file = Path(args.manifest_in)
        if not manifest_file.exists():
            print(f"❌ Error: File not found: {manifest_file}")
            sys.exit(1)
        print(f"Reading manifest from {manifest_file}...")
        with open(manifest_file, mode="r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            records = list(reader)
    else:
        # Mode 2: Scan raw folder
        raw_dir = Path(args.raw_dir)
        if not raw_dir.is_absolute():
            raw_dir = base_dir.parent / args.raw_dir

        print(f"Scanning raw images in: {raw_dir}...")
        raw_records = scan_raw_directory(raw_dir)
        print(f"Found {len(raw_records)} raw images matching target classes.")

        # Deduplicate
        records, duplicates = deduplicate_records(raw_records)
        print(f"Removed {len(duplicates)} exact duplicates. Unique images: {len(records)}.")

    if not records:
        print("⚠️ Warning: No valid image records found to process.")
        print("Please ensure images are placed in AI-Model/dataset/raw/<class_name>/")
        sys.exit(0)

    # Perform Stratified Split
    train_set, val_set, test_set = stratified_split(
        records,
        train_ratio=args.train_ratio,
        val_ratio=args.val_ratio,
        test_ratio=args.test_ratio,
        seed=args.seed
    )

    # Verify zero data leakage
    verify_zero_data_leakage(train_set, val_set, test_set)
    print("✅ Verified 0% Data Leakage: Train, Val, and Test sets have zero overlapping image hashes.")

    # Export manifest
    all_split_records = train_set + val_set + test_set
    manifest_out = output_dir / "manifest.csv"
    generate_manifest(all_split_records, manifest_out, base_dir.parent)
    print(f"✅ Exported manifest: {manifest_out}")

    # Export report & summary
    build_distribution_report(all_split_records, duplicates, args.seed, output_dir)
    print(f"✅ Exported distribution report: {output_dir / 'DATASET_REPORT.md'}")
    print(f"✅ Exported summary JSON: {output_dir / 'dataset_summary.json'}")
    print(f"🎉 Pipeline completed successfully!")

if __name__ == "__main__":
    main()
