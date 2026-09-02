import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync, StatementSync } from 'node:sqlite';
import { parseCsv } from '../common/csv.js';
import {
  LAYOUT_DEFINITIONS,
  layoutSeatIds,
} from '../layouts/layout-definitions.js';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly database: DatabaseSync;

  constructor() {
    const configuredPath = process.env.DB_PATH?.trim();
    const databasePath =
      configuredPath === ':memory:'
        ? configuredPath
        : resolve(configuredPath || resolve(process.cwd(), 'data', 'seating.sqlite'));

    if (databasePath !== ':memory:') {
      mkdirSync(dirname(databasePath), { recursive: true });
    }

    this.database = new DatabaseSync(databasePath);
    this.database.exec('PRAGMA foreign_keys = ON;');
    this.database.exec('PRAGMA journal_mode = WAL;');
    this.migrate();
    this.seed();
    this.database.exec('PRAGMA optimize;');
  }

  prepare(sql: string): StatementSync {
    return this.database.prepare(sql);
  }

  exec(sql: string): void {
    this.database.exec(sql);
  }

  transaction<T>(operation: () => T): T {
    this.database.exec('BEGIN IMMEDIATE;');
    try {
      const result = operation();
      this.database.exec('COMMIT;');
      return result;
    } catch (error) {
      this.database.exec('ROLLBACK;');
      throw error;
    }
  }

  onModuleDestroy(): void {
    this.database.close();
  }

  private migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS layouts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        seat_count INTEGER NOT NULL,
        definition_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS people (
        id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        position TEXT NOT NULL DEFAULT '',
        organization TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_people_name ON people(full_name);

      CREATE TABLE IF NOT EXISTS arrangements (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        layout_id TEXT NOT NULL,
        source_arrangement_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(layout_id) REFERENCES layouts(id),
        FOREIGN KEY(source_arrangement_id) REFERENCES arrangements(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS assignments (
        id TEXT PRIMARY KEY,
        arrangement_id TEXT NOT NULL,
        seat_id TEXT NOT NULL,
        person_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(arrangement_id) REFERENCES arrangements(id) ON DELETE CASCADE,
        FOREIGN KEY(person_id) REFERENCES people(id),
        UNIQUE(arrangement_id, seat_id),
        UNIQUE(arrangement_id, person_id)
      );

      CREATE INDEX IF NOT EXISTS idx_assignments_arrangement ON assignments(arrangement_id);
      CREATE INDEX IF NOT EXISTS idx_arrangements_layout_updated
      ON arrangements(layout_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    this.ensureColumn('people', 'photo_filename', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('people', 'photo_original_name', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('people', 'photo_mime', "TEXT NOT NULL DEFAULT ''");
  }

  private seed(): void {
    const now = new Date().toISOString();
    const upsertLayout = this.database.prepare(`
      INSERT INTO layouts (id, name, description, seat_count, definition_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        seat_count = excluded.seat_count,
        definition_json = excluded.definition_json,
        updated_at = excluded.updated_at
    `);

    for (const definition of LAYOUT_DEFINITIONS) {
      upsertLayout.run(
        definition.id,
        definition.name,
        definition.description,
        layoutSeatIds(definition).length,
        JSON.stringify(definition),
        now,
        now,
      );
    }

    // El catálogo inicial se importa una sola vez. Así, si el usuario borra
    // todo el directorio, el listado no vuelve a aparecer al reiniciar.
    const alreadySeeded = this.database
      .prepare("SELECT value FROM app_meta WHERE key = 'people_seeded'")
      .get() as { value: string } | undefined;

    if (!alreadySeeded) {
      const peopleCount = this.database
        .prepare('SELECT COUNT(*) AS total FROM people')
        .get() as { total: number };

      if (peopleCount.total === 0) {
        const seedPath = resolve(process.cwd(), 'data', 'people.seed.csv');
        const rows = parseCsv(readFileSync(seedPath, 'utf8'));
        const insertPerson = this.database.prepare(`
          INSERT INTO people
            (id, full_name, position, organization, email, notes, active, created_at, updated_at)
          VALUES (?, ?, ?, '', '', '', 1, ?, ?)
        `);

        this.transaction(() => {
          for (const [fullName, position = ''] of rows) {
            if (!fullName?.trim()) continue;
            insertPerson.run(randomUUID(), fullName.trim(), position.trim(), now, now);
          }
        });
      }

      this.database
        .prepare("INSERT INTO app_meta (key, value) VALUES ('people_seeded', 'true')")
        .run();
    }

    const hasArrangement = this.database.prepare(
      'SELECT 1 AS found FROM arrangements WHERE layout_id = ? LIMIT 1',
    );
    const insertArrangement = this.database.prepare(`
      INSERT INTO arrangements
        (id, name, description, layout_id, source_arrangement_id, created_at, updated_at)
      VALUES (?, 'Versión inicial', 'Acomodo de trabajo', ?, NULL, ?, ?)
    `);

    for (const definition of LAYOUT_DEFINITIONS) {
      if (!hasArrangement.get(definition.id)) {
        insertArrangement.run(randomUUID(), definition.id, now, now);
      }
    }
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    const columns = this.database.prepare(`PRAGMA table_info(${table})`).all() as unknown as Array<{
      name: string;
    }>;
    if (!columns.some((candidate) => candidate.name === column)) {
      this.database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
    }
  }
}
