"""Check DESNZ for new emissions/energy data and regenerate the committed data files if so.

Runs data/fetch_source.py and data/fetch_energy_source.py to check for new DESNZ releases, then
only runs data/process.py / data/process_energy.py — which overwrite the four data/mid_hampshire_*
files committed to git — for whichever dataset actually changed. If nothing new was published,
this script exits having touched nothing: process.py/process_energy.py stamp a fresh "generated"
date into their output every time they run, so running them unconditionally would dirty the
committed files on every check even with no new data. Safe to run any time (e.g. from cron).

    python3 refresh_data.py            # check both datasets, regenerate what's changed
    python3 refresh_data.py --force    # re-download both unconditionally, then regenerate both
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"


def mtime(path):
    return path.stat().st_mtime if path.exists() else None


def run(args, cwd):
    print(f"$ {' '.join(str(a) for a in args)}")
    result = subprocess.run(args, cwd=cwd)
    if result.returncode != 0:
        sys.exit(f"\n{args[1]} failed (exit {result.returncode}) — stopping.")


def fetch_and_check(fetch_script, dest_paths, force):
    before = {p: mtime(p) for p in dest_paths}
    args = [sys.executable, fetch_script]
    if force:
        args.append("--force")
    run(args, cwd=DATA)
    after = {p: mtime(p) for p in dest_paths}
    return any(before[p] != after[p] for p in dest_paths)


def main():
    force = "--force" in sys.argv[1:]
    regenerated = []

    print("== Checking emissions data ==")
    emissions_changed = fetch_and_check(
        "fetch_source.py", [DATA / "emissions_source.csv"], force
    )
    if emissions_changed:
        print("\n== New emissions data — regenerating mid_hampshire_emissions.json/.js ==")
        run([sys.executable, "process.py"], cwd=DATA)
        regenerated += ["data/mid_hampshire_emissions.json", "data/mid_hampshire_emissions.js"]
    else:
        print("No new emissions data — mid_hampshire_emissions.json/.js left untouched.")

    print("\n== Checking energy data ==")
    energy_changed = fetch_and_check(
        "fetch_energy_source.py",
        [DATA / "renewable_electricity_source.xlsx", DATA / "energy_consumption_source.xlsx", DATA / "dukes_source.xlsx"],
        force,
    )
    if energy_changed:
        print("\n== New energy data — regenerating mid_hampshire_energy.json/.js ==")
        run([sys.executable, "process_energy.py"], cwd=DATA)
        regenerated += ["data/mid_hampshire_energy.json", "data/mid_hampshire_energy.js"]
    else:
        print("No new energy data — mid_hampshire_energy.json/.js left untouched.")

    print()
    if regenerated:
        print("Regenerated:")
        for f in regenerated:
            print(f"  {f}")
        print("Review with `git diff` and commit when you're happy with it.")
    else:
        print("Already up to date — nothing regenerated, nothing changed in git.")


if __name__ == "__main__":
    main()
