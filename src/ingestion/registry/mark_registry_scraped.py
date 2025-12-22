import os
import psycopg2

PARSED_DIR = "/var/www/legal-engine/lex_data/laws_parsed"

conn = psycopg2.connect(
    host="192.168.1.60",
    port=5433,
    dbname="bg_legal",
    user="postgres",
    password="aztewe",
)
cur = conn.cursor()

count = 0

for fname in os.listdir(PARSED_DIR):
    if not fname.endswith(".json"):
        continue

    ldoc_id = fname.replace(".json", "")
    cur.execute(
        """
        UPDATE law_registry
        SET scraped = true,
            updated_at = now()
        WHERE ldoc_id = %s;
        """,
        (ldoc_id,),
    )
    count += cur.rowcount

conn.commit()
cur.close()
conn.close()

print(f"Marked {count} registry rows as scraped")