import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

# DESNZ publishes each year's release as a new page on this collection (newest first), rather
# than updating the previous year's page in place — so finding "the latest data" means finding
# the newest release page, not polling a fixed URL.
COLLECTION_URL = "https://www.gov.uk/government/collections/uk-local-authority-and-regional-greenhouse-gas-emissions-statistics"
USER_AGENT = "mid-hampshire-emissions-fetch/1.0 (+https://github.com/garethj/mid-hampshire-emissions)"
DEST = Path(__file__).resolve().parent / "emissions_source.csv"

# Matches every past release page linked from the collection, across the naming conventions
# DESNZ has used over the years (e.g. "...-statistics-2005-to-2024", "...-national-statistics-
# 2005-to-2021", "...-carbon-dioxide-emissions-national-statistics-2005-2016").
RELEASE_HREF_RE = re.compile(
    r'href="(/government/statistics/uk-local-authority-and-regional-'
    r'(?:greenhouse-gas|carbon-dioxide)-emissions-(?:national-)?statistics-2005-(?:to-)?(\d{4}))"'
)
CSV_HREF_RE = re.compile(r'href="(https://assets\.publishing\.service\.gov\.uk/media/[^"]+\.csv)"')


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def head_content_length(url):
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        length = resp.headers.get("Content-Length")
        return int(length) if length else None


def latest_release_page():
    html = fetch(COLLECTION_URL)
    matches = RELEASE_HREF_RE.findall(html)
    if not matches:
        sys.exit("Could not find any release pages on the DESNZ collection page — has gov.uk changed its page structure?")
    href, _year = max(matches, key=lambda m: int(m[1]))
    return "https://www.gov.uk" + href


def csv_download_url(release_page_url):
    html = fetch(release_page_url)
    matches = CSV_HREF_RE.findall(html)
    # The page usually lists the same link twice (label + button) and may also link an unrelated
    # dataset (e.g. protected landscapes); prefer ones that look like the local authority dataset.
    preferred = [m for m in matches if "local-authority" in m.lower()]
    candidates = preferred or matches
    if not candidates:
        sys.exit(f"Could not find a CSV download link on {release_page_url} — has gov.uk changed its page structure?")
    seen = []
    for m in candidates:
        if m not in seen:
            seen.append(m)
    if len(seen) > 1:
        print(f"Warning: multiple candidate CSV links found, using the first: {seen}", file=sys.stderr)
    return seen[0]


def download(url, dest):
    tmp = dest.with_suffix(dest.suffix + ".tmp")
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    downloaded = 0
    with urllib.request.urlopen(req, timeout=120) as resp, open(tmp, "wb") as out:
        chunk = resp.read(1024 * 1024)
        while chunk:
            out.write(chunk)
            downloaded += len(chunk)
            chunk = resp.read(1024 * 1024)
    tmp.replace(dest)  # atomic swap so an interrupted download never clobbers a good local copy
    return downloaded


def main():
    force = "--force" in sys.argv

    try:
        release_page = latest_release_page()
        print(f"Latest release page: {release_page}")
        csv_url = csv_download_url(release_page)
        print(f"Source CSV: {csv_url}")
        remote_size = head_content_length(csv_url)
    except (urllib.error.URLError, urllib.error.HTTPError) as e:
        sys.exit(f"Could not reach gov.uk to check for updates: {e}")

    local_size = DEST.stat().st_size if DEST.exists() else None

    if not force and local_size is not None and remote_size is not None and local_size == remote_size:
        print(f"Already up to date ({DEST.name}, {local_size:,} bytes) — nothing to do.")
        return

    if local_size is None:
        print("No local copy found — downloading...")
    elif force:
        print("--force given — re-downloading...")
    else:
        print(f"Local copy ({local_size:,} bytes) differs from remote ({remote_size or 'unknown'} bytes) — updating...")

    try:
        downloaded = download(csv_url, DEST)
    except (urllib.error.URLError, urllib.error.HTTPError) as e:
        sys.exit(f"Download failed: {e}")

    print(f"Downloaded {downloaded:,} bytes to {DEST}")
    print("Run `python3 process.py` next to regenerate the app's data files.")


if __name__ == "__main__":
    main()
