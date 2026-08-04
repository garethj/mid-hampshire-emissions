import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

USER_AGENT = "mid-hampshire-emissions-fetch/1.0 (+https://github.com/garethj/mid-hampshire-emissions)"
DATA_DIR = Path(__file__).resolve().parent

# Unlike the emissions collection, this page is updated in place each year rather than getting a
# new dated URL per release, so there's no "find the latest release page" step — just re-fetch it.
RENEWABLE_PAGE_URL = "https://www.gov.uk/government/statistics/regional-renewable-statistics"
RENEWABLE_XLSX_RE = re.compile(
    r'href="(https://assets\.publishing\.service\.gov\.uk/media/[^"]+/Renewable_electricity_by_local_authority[^"]*\.xlsx)"'
)
RENEWABLE_DEST = DATA_DIR / "renewable_electricity_source.xlsx"

# DESNZ publishes each year's TFEC release as a new page, same pattern as the emissions collection.
TFEC_COLLECTION_URL = "https://www.gov.uk/government/collections/total-final-energy-consumption-at-sub-national-level"
TFEC_RELEASE_HREF_RE = re.compile(
    r'href="(/government/statistics/total-final-energy-consumption-at-regional-and-local-authority-level-2005-(?:to-)?(\d{4}))"'
)
TFEC_XLSX_RE = re.compile(r'href="(https://assets\.publishing\.service\.gov\.uk/media/[^"]+\.xlsx)"')
TFEC_DEST = DATA_DIR / "energy_consumption_source.xlsx"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def head_content_length(url):
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        length = resp.headers.get("Content-Length")
        return int(length) if length else None


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


def update_if_changed(label, url, dest, force):
    remote_size = head_content_length(url)
    local_size = dest.stat().st_size if dest.exists() else None

    if not force and local_size is not None and remote_size is not None and local_size == remote_size:
        print(f"{label}: already up to date ({dest.name}, {local_size:,} bytes) — nothing to do.")
        return

    if local_size is None:
        print(f"{label}: no local copy found — downloading...")
    elif force:
        print(f"{label}: --force given — re-downloading...")
    else:
        print(f"{label}: local copy ({local_size:,} bytes) differs from remote ({remote_size or 'unknown'} bytes) — updating...")

    downloaded = download(url, dest)
    print(f"{label}: downloaded {downloaded:,} bytes to {dest}")


def renewable_xlsx_url():
    html = fetch(RENEWABLE_PAGE_URL)
    matches = RENEWABLE_XLSX_RE.findall(html)
    if not matches:
        sys.exit(f"Could not find the renewable electricity by LA spreadsheet on {RENEWABLE_PAGE_URL} — has gov.uk changed its page structure?")
    seen = []
    for m in matches:
        if m not in seen:
            seen.append(m)
    if len(seen) > 1:
        print(f"Warning: multiple candidate renewable spreadsheet links found, using the first: {seen}", file=sys.stderr)
    return seen[0]


def tfec_xlsx_url():
    html = fetch(TFEC_COLLECTION_URL)
    matches = TFEC_RELEASE_HREF_RE.findall(html)
    if not matches:
        sys.exit(f"Could not find any release pages on {TFEC_COLLECTION_URL} — has gov.uk changed its page structure?")
    href, _year = max(matches, key=lambda m: int(m[1]))
    release_page = "https://www.gov.uk" + href
    print(f"Latest TFEC release page: {release_page}")

    html = fetch(release_page)
    candidates = TFEC_XLSX_RE.findall(html)
    if not candidates:
        sys.exit(f"Could not find a spreadsheet download link on {release_page} — has gov.uk changed its page structure?")
    seen = []
    for m in candidates:
        if m not in seen:
            seen.append(m)
    if len(seen) > 1:
        print(f"Warning: multiple candidate TFEC spreadsheet links found, using the first: {seen}", file=sys.stderr)
    return seen[0]


def main():
    force = "--force" in sys.argv

    try:
        url = renewable_xlsx_url()
        print(f"Renewable electricity source: {url}")
    except (urllib.error.URLError, urllib.error.HTTPError) as e:
        sys.exit(f"Could not reach gov.uk to check for renewable electricity updates: {e}")
    update_if_changed("Renewable electricity", url, RENEWABLE_DEST, force)

    try:
        url = tfec_xlsx_url()
    except (urllib.error.URLError, urllib.error.HTTPError) as e:
        sys.exit(f"Could not reach gov.uk to check for TFEC updates: {e}")
    update_if_changed("Energy consumption (TFEC)", url, TFEC_DEST, force)

    print("Run `python3 process_energy.py` next to regenerate the app's energy data files.")


if __name__ == "__main__":
    main()
