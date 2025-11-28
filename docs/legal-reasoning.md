# AIAdvocate — Legal Reasoning Algorithm (v1.0)
Core architecture for accurate Bulgarian-law answers using LLMs + pgvector.

This document defines the algorithm that powers the legal reasoning system.  
Every new developer must understand this file before modifying backend logic.

---

## 1. Overview

When a user asks a question (e.g. “Какви права имам при проверка от КАТ?”), the system performs:

1. Question Analysis
2. Domain Classification
3. Law Candidate Selection
4. Vector Search within those laws
5. Reranking and Signal Boosting
6. Context Construction (citations, grouping)
7. LLM Reasoning (legally constrained)
8. Return answer + structured list of sources

This guarantees:
- Answers reference correct Bulgarian laws
- Irrelevant laws are filtered out
- LLM cannot hallucinate legal norms
- Users receive structured, human-readable explanations

---

## 2. Data Architecture

### Table: laws
- `id` — internal PK
- `ldoc_id` — external identifier from lex.bg
- `law_title` — official name of the law
- `list_title` — short title
- `source_url` — link to lex.bg
- `domain` — category (traffic, labor, tax, police)
- `priority` — importance weight (1 = most relevant)

### Table: law_chunks
- `id`
- `law_id` — FK to laws
- `chunk_index`
- `chunk_text`
- `article` — optional (e.g. “чл. 165”)
- `paragraph` — optional (e.g. “ал. 2”)
- `tags` — array of keywords
- `embedding` — pgvector(1536)

---

## 3. Pipeline in Detail

### Step 1 — Question Analysis
Normalize and extract features:
- `normalizedQuestion` — cleaned text
- `explicitMentions` — KAT, МВР, чл. X, глоби
- `detectedDomains` — assumed legal category
- `targetArticles` — if user mentions specific article/paragraph

Example domain dictionary:

- traffic: “кат”, “пътен”, “шофьор”, “книжка”, “фиш”
- police: “мвр”, “задържане”, “самоличност”
- labor: “трудов договор”, “осигуровки”
- tax: “нап”, “данък”, “ддс”

This step gives the initial direction for legal relevance.

---

### Step 2 — Domain → Law Selection

Based on the detected domain:
- traffic → Закон за движението по пътищата
- police → Закон за МВР
- labor → Кодекс на труда
- tax → ДОПК / ЗДДС

Additionally always include:
- Конституция
- АПК

This prevents the model from searching irrelevant laws.

---

### Step 3 — Vector Search (Per-Law)

1. Generate an embedding for the question.
2. For each selected law, perform:  
   `SELECT ... FROM law_chunks WHERE law_id = X ORDER BY embedding <=> $vec LIMIT N`
3. If fewer than 3 good matches are found → fallback to global search.

Search is domain-scoped first, global second.

---

### Step 4 — Deep Boosting Layer

For each chunk, compute a final score: