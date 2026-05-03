// services/database.ts
// Local SQLite database — entries and settings storage

import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Entry {
  id: number;
  title: string;
  body: string;
  recorded_at: string;   // ISO 8601
  duration_sec: number;
  audio_path: string | null;
  provider: string;
  model: string;
  created_at: string;    // ISO 8601
}

// ─── Open database (Lazy Initialization) ──────────────────────────────────────

let _db: SQLite.SQLiteDatabase | null = null;
let _initialized = false;

function getDb(): SQLite.SQLiteDatabase {
  if (!_db) {
    console.log('[DB] Attempting to open voicediary.db...');
    try {
      _db = SQLite.openDatabaseSync('voicediary.db');
      console.log('[DB] Database opened.');
    } catch (e) {
      console.error('[DB] Open database failed:', e);
      throw e;
    }
  }
  return _db;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initDatabase(): void {
  if (_initialized) {
    console.log('[DB] initDatabase: already initialized, skipping.');
    return;
  }
  console.log('[DB] initDatabase: running migrations');
  const db = getDb();
  
  try {
    // Execute each table creation separately for reliability
    db.execSync(`
      CREATE TABLE IF NOT EXISTS entries (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        title        TEXT    NOT NULL,
        body         TEXT    NOT NULL,
        recorded_at  TEXT    NOT NULL,
        duration_sec INTEGER NOT NULL DEFAULT 0,
        audio_path   TEXT,
        provider     TEXT    NOT NULL DEFAULT '',
        model        TEXT    NOT NULL DEFAULT '',
        created_at   TEXT    NOT NULL
      );
    `);
    console.log('[DB] Table "entries" ready.');

    db.execSync(`
      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    console.log('[DB] Table "settings" ready.');
    
    initSettings();
    _initialized = true;
    console.log('[DB] initDatabase: finished');
  } catch (err) {
    console.error('[DB] initDatabase CRITICAL ERROR:', err);
    throw err;
  }
}

function initSettings(): void {
  console.log('[DB] initSettings: started');
  const db = getDb();
  const defaults = [
    ['provider', 'groq'],
    ['language', 'auto'],
    ['theme', 'system'],
    ['date_format', 'DD.MM.YYYY'],
    ['delete_audio', 'false'],
  ];

  for (const [key, val] of defaults) {
    db.runSync(
      `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`,
      [key, val]
    );
  }
  console.log('[DB] initSettings: finished');
}

// ─── Entries ──────────────────────────────────────────────────────────────────

export function saveEntry(params: {
  title: string;
  body: string;
  recorded_at: string;
  duration_sec: number;
  audio_path?: string | null;
  provider: string;
  model: string;
}): number {
  const db = getDb();
  const now = new Date().toISOString();
  const result = db.runSync(
    `INSERT INTO entries (title, body, recorded_at, duration_sec, audio_path, provider, model, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.title,
      params.body,
      params.recorded_at,
      params.duration_sec,
      params.audio_path ?? null,
      params.provider,
      params.model,
      now,
    ]
  );
  return result.lastInsertRowId;
}

export function getAllEntries(): Entry[] {
  return getDb().getAllSync<Entry>(
    `SELECT * FROM entries ORDER BY recorded_at DESC`
  );
}

export function getEntryById(id: number): Entry | null {
  return getDb().getFirstSync<Entry>(
    `SELECT * FROM entries WHERE id = ?`,
    [id]
  ) ?? null;
}

export function searchEntries(params: {
  query?: string;
}): Entry[] {
  const all = getAllEntries();
  const q = params.query?.trim().toLowerCase();
  
  if (!q) return all;

  return all.filter(entry => 
    entry.title.toLowerCase().includes(q) || 
    entry.body.toLowerCase().includes(q)
  );
}

export function updateEntryTitle(id: number, title: string): void {
  getDb().runSync(
    `UPDATE entries SET title = ? WHERE id = ?`,
    [title, id]
  );
}

export function updateEntryBody(id: number, body: string): void {
  getDb().runSync(
    `UPDATE entries SET body = ? WHERE id = ?`,
    [body, id]
  );
}

/**
 * Get all entries for backup (including all fields)
 */
export function getAllEntriesForBackup(): Entry[] {
  return getDb().getAllSync<Entry>(`SELECT * FROM entries`);
}

/**
 * Import entries from backup
 */
export function importEntries(entries: any[]): number {
  const db = getDb();
  let count = 0;
  
  db.withTransactionSync(() => {
    for (const item of entries) {
      // Check for required fields
      if (!item.title || !item.recorded_at) continue;

      db.runSync(
        `INSERT OR IGNORE INTO entries (title, body, recorded_at, duration_sec, audio_path, provider, model, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.title,
          item.body || '',
          item.recorded_at,
          item.duration_sec || 0,
          null, // Audio files are not transferred in text backup
          item.provider || 'backup',
          item.model || '-',
          item.created_at || new Date().toISOString()
        ]
      );
      count++;
    }
  });
  
  return count;
}

export async function deleteEntry(id: number): Promise<void> {
  const entry = getEntryById(id);
  if (entry && entry.audio_path) {
    try {
      await FileSystem.deleteAsync(entry.audio_path, { idempotent: true });
      console.log(`[DB] Deleted audio file: ${entry.audio_path}`);
    } catch (err) {
      console.warn(`[DB] Failed to delete audio file: ${entry.audio_path}`, err);
    }
  }
  getDb().runSync(`DELETE FROM entries WHERE id = ?`, [id]);
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export function getSetting(key: string): string | null {
  const row = getDb().getFirstSync<{ value: string }>(
    `SELECT value FROM settings WHERE key = ?`,
    [key]
  );
  return row?.value ?? null;
}

export function saveSetting(key: string, value: string): void {
  getDb().runSync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

export function getAllSettings(): Record<string, string> {
  const rows = getDb().getAllSync<{ key: string; value: string }>(
    `SELECT key, value FROM settings`
  );
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

/**
 * Cleanup all saved audio files (note text will remain)
 */
export async function deleteAllAudioFiles(): Promise<number> {
  const entries = getAllEntries();
  let count = 0;
  for (const entry of entries) {
    if (entry.audio_path) {
      try {
        await FileSystem.deleteAsync(entry.audio_path, { idempotent: true });
        getDb().runSync(`UPDATE entries SET audio_path = NULL WHERE id = ?`, [entry.id]);
        count++;
      } catch (e) {
        console.warn(`[DB] Cleanup failed for ${entry.id}`, e);
      }
    }
  }
  return count;
}
