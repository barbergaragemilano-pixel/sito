CREATE TABLE IF NOT EXISTS documents (
  name TEXT PRIMARY KEY CHECK(name IN ('catalog', 'hours')),
  body TEXT NOT NULL CHECK(json_valid(body)),
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS document_history (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  revision INTEGER NOT NULL,
  archived_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TRIGGER IF NOT EXISTS backup_document BEFORE UPDATE ON documents BEGIN
  INSERT INTO document_history(name, body, revision) VALUES(OLD.name, OLD.body, OLD.revision);
END;
