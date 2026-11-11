-- Results of AI readings of uploaded PDFs/photos, keyed by the file's SHA-256.
-- Only the extracted technical data (boat particulars, polars, entry list of
-- boats) is kept; never the file itself and never who uploaded it.
CREATE TABLE IF NOT EXISTS pdf_cache (
  kind TEXT NOT NULL,
  hash TEXT NOT NULL,
  result TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, hash)
);
