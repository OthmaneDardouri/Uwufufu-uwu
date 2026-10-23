#!/usr/bin/env python3
"""Build data/pokemon.json from the PokeAPI CSV dumps.

The game never calls PokeAPI at runtime: this script turns the public CSV
tables into one small JSON file (id, name, generation, types, tags) that the
frontend filters locally. Re-run it when a new generation comes out.

Usage:
    python3 scripts/build_pokemon.py                # downloads the CSVs
    python3 scripts/build_pokemon.py --csv-dir DIR  # uses local copies

Output schema (one entry per playable Pokémon or alternate form):
    {"id": 6, "n": "Charizard", "g": 1, "t": ["fire", "flying"], "f": ["starter3"]}
`id` is the PokeAPI *pokemon* id, which is also the artwork file name.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

CSV_BASE = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv"
TABLES = ["pokemon_species", "pokemon", "pokemon_types", "types",
          "pokemon_species_names", "pokemon_forms", "pokemon_form_names"]
ENGLISH = 9

# Hand-curated groups that PokeAPI does not flag. Species ids.
STARTERS = [1, 4, 7, 152, 155, 158, 252, 255, 258, 387, 390, 393, 495, 498, 501,
            650, 653, 656, 722, 725, 728, 810, 813, 816, 906, 909, 912]
PSEUDO_LEGENDARY = [149, 248, 373, 376, 445, 635, 706, 784, 887, 998]
ULTRA_BEASTS = [793, 794, 795, 796, 797, 798, 799, 803, 804, 805, 806]
PARADOX = list(range(984, 996)) + [1005, 1006, 1009, 1010, 1020, 1021, 1022, 1023]
EEVEELUTIONS = [133, 134, 135, 136, 196, 197, 470, 471, 700]
FOSSILS = [138, 139, 140, 141, 142, 345, 346, 347, 348, 408, 409, 410, 411,
           564, 565, 566, 567, 696, 697, 698, 699, 880, 881, 882, 883]
REGIONAL_SUFFIXES = ("-alola", "-galar", "-hisui", "-paldea")


def load_tables(csv_dir: Path | None) -> dict[str, list[dict]]:
    tables = {}
    for name in TABLES:
        if csv_dir:
            text = (csv_dir / f"{name}.csv").read_text(encoding="utf-8")
        else:
            with urllib.request.urlopen(f"{CSV_BASE}/{name}.csv", timeout=60) as resp:
                text = resp.read().decode("utf-8")
        tables[name] = list(csv.DictReader(io.StringIO(text)))
    return tables


def build(t: dict[str, list[dict]]) -> list[dict]:
    species = {int(r["id"]): r for r in t["pokemon_species"]}
    type_name = {r["id"]: r["identifier"] for r in t["types"]}
    types_of = defaultdict(list)
    for r in sorted(t["pokemon_types"], key=lambda r: int(r["slot"])):
        types_of[int(r["pokemon_id"])].append(type_name[r["type_id"]])
    species_name = {int(r["pokemon_species_id"]): r["name"]
                    for r in t["pokemon_species_names"] if int(r["local_language_id"]) == ENGLISH}
    forms = {int(r["id"]): r for r in t["pokemon_forms"]}
    form_name = {int(r["pokemon_form_id"]): r["pokemon_name"]
                 for r in t["pokemon_form_names"]
                 if int(r["local_language_id"]) == ENGLISH and r["pokemon_name"]}
    # default form of each pokemon -> its English display name ("Mega Charizard X")
    pokemon_display = {}
    for fid, f in forms.items():
        if f["is_default"] == "1" and fid in form_name:
            pokemon_display[int(f["pokemon_id"])] = form_name[fid]
    mega_ids = {int(f["pokemon_id"]) for f in forms.values() if f["is_mega"] == "1"}

    # starter evolution stages, derived from evolves_from
    stage = {sid: 1 for sid in STARTERS}
    for _ in range(2):
        for sid, s in species.items():
            parent = s["evolves_from_species_id"]
            if parent and int(parent) in stage and sid not in stage:
                stage[sid] = stage[int(parent)] + 1

    entries = []
    for p in t["pokemon"]:
        pid, sid = int(p["id"]), int(p["species_id"])
        s = species[sid]
        ident = p["identifier"]
        tags = []
        if p["is_default"] == "1":
            name = species_name[sid]
            if s["is_legendary"] == "1": tags.append("legendary")
            if s["is_mythical"] == "1": tags.append("mythical")
            if s["is_baby"] == "1": tags.append("baby")
            if sid in stage: tags.append(f"starter{stage[sid]}")
            if sid in PSEUDO_LEGENDARY: tags.append("pseudo")
            if sid in ULTRA_BEASTS: tags.append("ultrabeast")
            if sid in PARADOX: tags.append("paradox")
            if sid in EEVEELUTIONS: tags.append("eeveelution")
            if sid in FOSSILS: tags.append("fossil")
            if not any(int(x["evolves_from_species_id"] or 0) == sid for x in species.values()):
                tags.append("final")
        else:
            # alternate forms are only playable through categories that ask for them
            if pid in mega_ids:
                tags = ["form", "mega"]
            elif ident.endswith("-gmax"):
                tags = ["form", "gmax"]
            elif any(suf in ident for suf in REGIONAL_SUFFIXES) and not re.search(r"totem|cap", ident):
                tags = ["form", "regional"]
            else:
                continue  # cosmetic/battle-only forms: skip
            name = pokemon_display.get(pid) or ident.replace("-", " ").title()
        entries.append({"id": pid, "n": name, "g": int(s["generation_id"]),
                        "t": types_of[pid], "f": tags})
    return entries


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--csv-dir", type=Path)
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parent.parent / "data" / "pokemon.json")
    args = ap.parse_args()
    entries = build(load_tables(args.csv_dir))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(entries, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"wrote {len(entries)} entries to {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
