import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import type * as NodeSqlite from 'node:sqlite';

// Keep the specifier opaque to the bundler: esbuild currently rewrites the
// Node 24-only `node:sqlite` ESM import to a non-existent `sqlite` package.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof NodeSqlite;
type DatabaseSyncInstance = NodeSqlite.DatabaseSync;

export interface StoredRoom {
  id: string;
  code: string;
  status: string;
  hostSeatId: string;
  payload: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface StoredSave {
  id: string;
  name: string;
  roomId: string | null;
  payload: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface StoredCommand {
  seatId: string;
  baseRevision: number;
  actionId: string;
  response: Record<string, unknown>;
}

interface RoomRow {
  id: string;
  code: string;
  status: string;
  host_seat_id: string;
  payload_json: string;
  created_at: string;
  updated_at: string;
}

interface SaveRow {
  id: string;
  name: string;
  room_id: string | null;
  payload_json: string;
  created_at: string;
  updated_at: string;
}

interface IdRow {
  id: string;
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString('base64url')}`;
}

export function newToken(): string {
  return randomBytes(24).toString('base64url');
}

function now(): string {
  return new Date().toISOString();
}

function encode(value: unknown): string {
  return JSON.stringify(value);
}

function decode<T>(value: string): T {
  return JSON.parse(value) as T;
}

export class ServerStorage {
  readonly db: DatabaseSyncInstance;

  constructor(filename = process.env.DATABASE_PATH ?? 'data/dengxiantai.sqlite') {
    if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA foreign_keys = ON');
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      INSERT OR IGNORE INTO migrations (id, applied_at) VALUES (1, datetime('now'));
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        host_seat_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS commands (
        room_id TEXT NOT NULL,
        command_id TEXT NOT NULL,
        seat_id TEXT NOT NULL,
        base_revision INTEGER NOT NULL,
        action_id TEXT NOT NULL,
        response_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (room_id, command_id),
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS events (
        room_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (room_id, sequence),
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS saves (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        room_id TEXT,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  upsertRoom(input: { id: string; code: string; status: string; hostSeatId: string; payload: unknown }): StoredRoom {
    const existing = this.getRoom(input.id);
    const createdAt = existing?.createdAt ?? now();
    const updatedAt = now();
    this.db.prepare(`
      INSERT INTO rooms (id, code, status, host_seat_id, payload_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        code=excluded.code,
        status=excluded.status,
        host_seat_id=excluded.host_seat_id,
        payload_json=excluded.payload_json,
        updated_at=excluded.updated_at
    `).run(input.id, input.code, input.status, input.hostSeatId, encode(input.payload), createdAt, updatedAt);
    return this.getRoom(input.id)!;
  }

  getRoom(id: string): StoredRoom | null {
    const row = this.db.prepare('SELECT * FROM rooms WHERE id = ?').get(id) as RoomRow | undefined;
    if (!row) return null;
    return {
      id: row.id,
      code: row.code,
      status: row.status,
      hostSeatId: row.host_seat_id,
      payload: decode(row.payload_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  getRoomByCode(code: string): StoredRoom | null {
    const row = this.db.prepare('SELECT id FROM rooms WHERE code = ?').get(code) as IdRow | undefined;
    return row ? this.getRoom(row.id) : null;
  }

  listRooms(): StoredRoom[] {
    return (this.db.prepare('SELECT id FROM rooms ORDER BY updated_at DESC').all() as unknown as IdRow[]).map((row) => this.getRoom(row.id)!);
  }

  getCommand(roomId: string, commandId: string): StoredCommand | null {
    const row = this.db.prepare(`
      SELECT seat_id, base_revision, action_id, response_json
      FROM commands
      WHERE room_id = ? AND command_id = ?
    `).get(roomId, commandId) as {
      seat_id: string;
      base_revision: number;
      action_id: string;
      response_json: string;
    } | undefined;
    return row ? {
      seatId: row.seat_id,
      baseRevision: row.base_revision,
      actionId: row.action_id,
      response: decode<Record<string, unknown>>(row.response_json),
    } : null;
  }

  putCommand(input: { roomId: string; commandId: string; seatId: string; baseRevision: number; actionId: string; response: unknown }): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO commands (room_id, command_id, seat_id, base_revision, action_id, response_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(input.roomId, input.commandId, input.seatId, input.baseRevision, input.actionId, encode(input.response), now());
  }

  appendEvent(roomId: string, type: string, payload: unknown): void {
    const row = this.db.prepare('SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM events WHERE room_id = ?').get(roomId) as { next: number };
    this.db.prepare('INSERT INTO events (room_id, sequence, type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(roomId, row.next, type, encode(payload), now());
  }

  listEvents(roomId: string): Array<{ sequence: number; type: string; payload: unknown; createdAt: string }> {
    return (this.db.prepare('SELECT * FROM events WHERE room_id = ? ORDER BY sequence ASC').all(roomId) as Array<{ sequence: number; type: string; payload_json: string; created_at: string }>).map((row) => ({
      sequence: row.sequence,
      type: row.type,
      payload: decode(row.payload_json),
      createdAt: row.created_at,
    }));
  }

  createSave(input: { id?: string; name: string; roomId?: string | null; payload: unknown }): StoredSave {
    const id = input.id ?? newId('save');
    const createdAt = now();
    this.db.prepare('INSERT INTO saves (id, name, room_id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, input.name, input.roomId ?? null, encode(input.payload), createdAt, createdAt);
    return this.getSave(id)!;
  }

  getSave(id: string): StoredSave | null {
    const row = this.db.prepare('SELECT * FROM saves WHERE id = ?').get(id) as SaveRow | undefined;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      roomId: row.room_id,
      payload: decode(row.payload_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  listSaves(roomId?: string): StoredSave[] {
    const rows = roomId
      ? this.db.prepare('SELECT id FROM saves WHERE room_id = ? ORDER BY updated_at DESC').all(roomId)
      : this.db.prepare('SELECT id FROM saves ORDER BY updated_at DESC').all();
    return (rows as unknown as IdRow[]).map((row) => this.getSave(row.id)!);
  }

  updateSave(id: string, input: { name: string; payload: unknown; roomId?: string | null }): StoredSave {
    const updatedAt = now();
    const result = this.db.prepare('UPDATE saves SET name = ?, room_id = ?, payload_json = ?, updated_at = ? WHERE id = ?')
      .run(input.name, input.roomId ?? null, encode(input.payload), updatedAt, id);
    if (result.changes === 0) throw new Error('Save not found');
    return this.getSave(id)!;
  }

  deleteSave(id: string): void {
    const result = this.db.prepare('DELETE FROM saves WHERE id = ?').run(id);
    if (result.changes === 0) throw new Error('Save not found');
  }
}
