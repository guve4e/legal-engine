#!/usr/bin/python3
# src/ingestion/registry/lex_registry_sync.py

from __future__ import annotations

from typing import List, Dict, Optional, Tuple, Set
import re
import time
import os

import requests
import psycopg2
from psycopg2.extras import execute_batch
from bs4 import BeautifulSoup
from urllib.parse import urljoin


# -------------------------
# CONFIG
# -------------------------

LEX_BASE = "https://lex.bg"

# Tree indexes (source-of-truth catalog pages)
# IMPORTANT: doc_type MUST match your Postgres CHECK constraint values.
# Your DB constraint allows: LAW, CODE, PRAVILNIK
INDEX_PAGES: List[Tuple[str, str]] = [
    ("https://lex.bg/laws/tree/laws", "LAW"),
    ("https://lex.bg/laws/tree/codes", "CODE"),
    ("https://lex.bg/laws/tree/regs", "PRAVILNIK"),
    # NOTE: ordinances is NOT supported by your DB constraint right now.
    # If you want ordinances, either:
    #   - expand DB constraint to include "NAREDBA", or
    #   - map ordinances to LAW (but then you're lying about types).
    # For now we exclude it so the pipeline doesn't break.
    # ("https://lex.bg/laws/tree/ordinances", "NAREDBA"),
]

PG_CONFIG = dict(
    host=os.getenv("PG_HOST", "192.168.1.60"),
    port=int(os.getenv("PG_PORT", "5433")),
    dbname=os.getenv("PG_DB", "bg_legal"),
    user=os.getenv("PG_USER", "postgres"),
    password=os.getenv("PG_PASS", "aztewe"),
)

HEADERS = {
    "User-Agent": os.getenv("LEX_REGISTRY_UA", "AIAdvocate-RegistrySync/1.0")
}

SLEEP_SECONDS = float(os.getenv("LEX_REGISTRY_SLEEP", "0.8"))
MAX_PAGES_PER_INDEX = int(os.getenv("LEX_REGISTRY_MAX_PAGES", "800"))
MISSING_AFTER_DAYS = int(os.getenv("LEX_REGISTRY_MISSING_DAYS", "7"))

# Keep this synced with your DB CHECK constraint.
ALLOWED_DOC_TYPES: Set[str] = {"LAW", "CODE", "PRAVILNIK"}
DOC_TYPE_FALLBACK = "LAW"

RegistryEntry = Dict[str, Optional[str]]


# -------------------------
# HTTP
# -------------------------

def fetch_html(session: requests.Session, url: str) -> str:
    print(f"[GET] {url}")
    resp = session.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    resp.encoding = resp.apparent_encoding  # Cyrillic stability
    return resp.text


def build_paged_url(base_url: str, page: int) -> str:
    """
    Lex.bg tree pagination is PATH-based:
      /tree/x           (page 0)
      /tree/x/1
      /tree/x/2
    """
    if page == 0:
        return base_url
    return f"{base_url}/{page}"


# -------------------------
# PARSE
# -------------------------

# Matches both /ldoc/<id> and /laws/ldoc/<id>
LDOC_RE = re.compile(r"/ldoc/(-?\d+)")


def normalize_doc_type(raw: Optional[str]) -> str:
    """
    Force lex doc types into the DB enum: LAW | CODE | PRAVILNIK

    This must NEVER return anything else, otherwise your registry sync crashes
    due to the Postgres CHECK constraint.
    """
    if not raw:
        return DOC_TYPE_FALLBACK

    s = str(raw).strip().upper()

    # already valid
    if s in ALLOWED_DOC_TYPES:
        return s

    # common variants from lex or other sources
    if s in ("KODEKS", "КОДЕКС", "KODEX"):
        return "CODE"

    # ordinances / naradba not supported by DB -> fallback
    if s in ("NAREDBA", "НАРЕДБА", "ORDINANCE", "ORDINANCES"):
        return DOC_TYPE_FALLBACK

    # constitution isn't a code - keep it LAW
    if "КОНСТИТУЦ" in s or "CONSTITUT" in s:
        return "LAW"

    return DOC_TYPE_FALLBACK


def parse_index(html: str, doc_type: str) -> List[RegistryEntry]:
    soup = BeautifulSoup(html, "html.parser")
    entries: List[RegistryEntry] = []

    final_doc_type = normalize_doc_type(doc_type)

    # Broad but safe: only anchors containing 'ldoc' and matching digits
    for a in soup.select("a[href*='ldoc']"):
        href = (a.get("href") or "").strip()
        title = a.get_text(strip=True)

        if not href or not title or len(title) < 3:
            continue

        m = LDOC_RE.search(href)
        if not m:
            continue

        ldoc_id = m.group(1)
        source_url = urljoin(LEX_BASE, href)

        entries.append({
            "ldoc_id": ldoc_id,
            "title": title,
            "doc_type": final_doc_type,
            "parent_ldoc_id": None,
            "source_url": source_url,
        })

    return entries


# -------------------------
# DB
# -------------------------

UPSERT_SQL = """
INSERT INTO law_registry (
    ldoc_id,
    title,
    doc_type,
    parent_ldoc_id,
    source_url,
    expected,
    last_seen_at,
    created_at,
    updated_at
)
VALUES (
    %(ldoc_id)s,
    %(title)s,
    %(doc_type)s,
    %(parent_ldoc_id)s,
    %(source_url)s,
    true,
    now(),
    now(),
    now()
)
ON CONFLICT (ldoc_id)
DO UPDATE SET
    title = EXCLUDED.title,
    doc_type = EXCLUDED.doc_type,
    parent_ldoc_id = EXCLUDED.parent_ldoc_id,
    source_url = EXCLUDED.source_url,
    expected = true,
    last_seen_at = now(),
    updated_at = now();
"""


def upsert_registry(entries: List[RegistryEntry]) -> None:
    if not entries:
        print("No entries to upsert.")
        return

    good: List[RegistryEntry] = []
    skipped = 0

    for e in entries:
        # enforce again defensively
        dt = normalize_doc_type(e.get("doc_type"))
        e["doc_type"] = dt

        if dt not in ALLOWED_DOC_TYPES:
            skipped += 1
            continue

        # basic sanity
        if not (e.get("ldoc_id") or "").strip():
            skipped += 1
            continue

        good.append(e)

    if skipped:
        print(f"  !! skipped {skipped} entries due to invalid data/doc_type")

    conn = psycopg2.connect(**PG_CONFIG)
    cur = conn.cursor()
    try:
        execute_batch(cur, UPSERT_SQL, good, page_size=500)
        conn.commit()
    finally:
        cur.close()
        conn.close()

    print(f"✅ Upserted {len(good)} registry entries")


def mark_missing() -> None:
    conn = psycopg2.connect(**PG_CONFIG)
    cur = conn.cursor()
    try:
        cur.execute(
            f"""
            UPDATE law_registry
            SET expected = false,
                updated_at = now()
            WHERE last_seen_at < now() - interval '{MISSING_AFTER_DAYS} days';
            """
        )
        affected = cur.rowcount
        conn.commit()
    finally:
        cur.close()
        conn.close()

    print(f"✅ Marked {affected} registry entries as not expected (> {MISSING_AFTER_DAYS} days)")


# -------------------------
# REGISTRY SYNC
# -------------------------

def fetch_all_entries_for_index(
        session: requests.Session,
        base_url: str,
        doc_type: str,
) -> List[RegistryEntry]:
    """
    Stop rules:
      1) parsed == 0 => stop
      2) added  == 0 => stop (Lex sometimes repeats the same last item forever)
    """
    all_entries: List[RegistryEntry] = []
    seen: Set[str] = set()

    for page in range(0, MAX_PAGES_PER_INDEX):
        url = build_paged_url(base_url, page)

        try:
            html = fetch_html(session, url)
        except Exception as e:
            print(f"  !! fetch failed {doc_type} page={page}: {e}")
            break

        parsed = parse_index(html, doc_type)

        if not parsed:
            print(f"  -> {doc_type}: page={page} parsed=0, stopping.")
            break

        added = 0
        for e in parsed:
            ldoc_id = (e.get("ldoc_id") or "").strip()
            if not ldoc_id or ldoc_id in seen:
                continue
            seen.add(ldoc_id)
            all_entries.append(e)
            added += 1

        print(f"  -> {doc_type}: page={page} parsed={len(parsed)} added={added} total={len(all_entries)}")

        if added == 0:
            print(f"  -> {doc_type}: page={page} added=0, stopping (no new ids).")
            break

        time.sleep(SLEEP_SECONDS)

    return all_entries


# -------------------------
# MAIN
# -------------------------

def main():
    session = requests.Session()
    all_entries: List[RegistryEntry] = []

    for url, doc_type in INDEX_PAGES:
        print(f"\n=== Sync index: {doc_type} | {url} ===")
        entries = fetch_all_entries_for_index(session, url, doc_type)
        print(f"✅ {doc_type}: total = {len(entries)}")
        all_entries.extend(entries)

    upsert_registry(all_entries)
    mark_missing()


if __name__ == "__main__":
    main()