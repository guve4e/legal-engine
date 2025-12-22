# Legal Engine – Ingestion Pipeline (Canonical README)

This document explains **exactly how the legal ingestion system works**, end‑to‑end. It is written so you can:

- regain context after days/weeks
- debug confidently
- explain the system to another engineer
- reason about what *should* happen vs what *did* happen

---

## 1. High‑Level Goal

Build a **canonical, queryable legal corpus** from lex.bg that:

- tracks *what laws exist*
- tracks *what has been scraped*
- tracks *what has been embedded*
- allows **incremental ingestion** (small batches)
- is safe to run via **cron**

The system is **state‑driven**, not file‑driven.

---

## 2. Core Database Tables

### 2.1 `law_registry` (SOURCE OF TRUTH)

This table answers the question:

> *What documents exist, and what is their ingestion state?*

One row per document on lex.bg.

Key columns:

- `ldoc_id` – Lex.bg document ID (primary key)
- `title` – human‑readable title
- `doc_type` – LAW / KODEKS / NAREDBA / PRAVILNIK
- `source_url` – lex.bg URL

State flags:

- `expected` – still exists on lex.bg
- `scraped` – parsed JSON exists on disk
- `ingested` – successfully processed by ingestion
- `embedded` – vectors exist in `law_chunks`

Tracking:

- `last_seen_at`
- `last_ingested_at`
- `last_content_hash`
- `last_error`

This table **drives everything**.

---

### 2.2 `laws` (CANONICAL LAW TEXT)

One row per law. Stores the **latest cleaned version** of the text.

Columns:

- `ldoc_id`
- `law_title`
- `list_title`
- `source_url`
- `content_hash`
- `scraped_at`
- `chunked_at`
- `embedded_at`

This table answers:

> *What is the current version of this law?*

---

### 2.3 `law_chunks` (VECTOR TABLE)

This is what the **UI and search use**.

Columns:

- `law_id` (FK → laws.id)
- `chunk_index`
- `chunk_text`
- `embedding` (pgvector)

If a law has **zero rows here**, it is **not searchable**.

---

## 3. Stage 1 – Registry Sync (Python)

### File

```
src/ingestion/registry/lex_registry_sync.py
```

### What it does

- Crawls lex.bg *tree pages*:

    - `/laws`
    - `/codes`
    - `/ordinances`
    - `/regs`

- Extracts:

    - `ldoc_id`
    - `title`
    - `doc_type`
    - `source_url`

- Upserts rows into `law_registry`

- Marks missing docs as `expected = false`

### What it **does NOT do**

- ❌ does NOT download law text
- ❌ does NOT create embeddings
- ❌ does NOT touch `laws` or `law_chunks`

### Run manually

```
/usr/bin/python3 src/ingestion/registry/lex_registry_sync.py
```

### Cron

```
10 0 * * * /var/www/legal-engine/run_registry_sync.sh
```

---

## 4. Stage 2 – Scraping (Python, separate step)

### Responsibility

For **each registry row**, download the full law text and write:

```
lex_data/laws_parsed/<ldoc_id>.json
```

Once successful, update:

```
law_registry.scraped = true
```

### Important

> If `scraped = false`, ingestion will **never pick up this law**.

---

## 5. Stage 3 – Ingestion & Embedding (TypeScript / NestJS)

### Entry Point (CLI)

```
src/ingestion/ingest.cli.ts
```

Run manually:

```
MAX_LAWS_PER_RUN=3 \
/usr/bin/npx ts-node -r tsconfig-paths/register \
  src/ingestion/ingest.cli.ts
```

### What the CLI does

1. Boots NestJS **without HTTP**
2. Resolves `IngestionService`
3. Calls:

```
ingestion.ingestFromRegistry()
```

---

## 6. Registry‑Driven Ingestion Logic (CRITICAL)

The ingestion **does NOT scan directories** anymore.

It runs **only on registry state**.

### Selection query (conceptual)

```
WHERE expected = true
  AND scraped = true
  AND embedded = false
```

Meaning:

> “Give me laws that exist, are scraped, but not embedded yet.”

This is why:

- numbers don’t jump immediately
- UI can show many laws but few embedded

This is **by design**.

---

## 7. Per‑Law Ingestion Algorithm

For each selected registry row:

1. Load `<ldoc_id>.json`
2. Validate text exists
3. Clean text (CleaningModule)
4. Compute `content_hash`
5. Skip if unchanged & already embedded
6. Upsert into `laws`
7. Chunk text (paragraph‑based)
8. Embed each chunk (OpenAI)
9. Replace rows in `law_chunks`
10. Mark registry row:

```
ingested = true
embedded = true
last_ingested_at = now()
last_content_hash = <hash>
```

---

## 8. Cron Jobs (FINAL SETUP)

### Registry sync (daily)

```
10 0 * * * /var/www/legal-engine/run_registry_sync.sh
```

### Ingestion (every 15 minutes)

```
*/15 * * * * /var/www/legal-engine/run_ingest.sh
```

Each ingestion run processes **only a small batch**. This prevents:

- API rate limit issues
- CPU spikes
- broken partial ingests

---

## 9. Why Numbers Look “Wrong” in UI (Important)

If you see:

- many laws in UI
- few with chunks

It means:

- registry is populated ✅
- scraping mostly done ✅
- ingestion is **still catching up** ⏳

Check progress with:

```
SELECT count(*)
FROM law_registry
WHERE expected = true
  AND scraped = true
  AND embedded = false;
```

That number **must go to zero over time**.

---

## 10. Mental Model (Keep This)

- **Registry = truth**
- **Files = cache**
- **Ingestion = state machine**
- **Vectors = last step only**

If something is missing from search:

1. Check `law_registry`
2. Check `scraped`
3. Check `embedded`
4. Check `law_chunks`

---

## 11. Status: CURRENTLY CORRECT

Your current setup:

- Registry sync ✅
- Scraped marking ✅
- Registry‑driven ingestion ✅
- Cron wiring ✅

The system is **working as designed**. It just needs **time** to finish embedding everything.

---

**This README is canonical.** If behavior deviates from this document → there is a bug.

