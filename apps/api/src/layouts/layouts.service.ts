import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { SeatLayoutDefinition } from './layout-definitions.js';

interface LayoutRow {
  id: string;
  name: string;
  description: string;
  seat_count: number;
  definition_json: string;
}

@Injectable()
export class LayoutsService {
  constructor(private readonly database: DatabaseService) {}

  findAll() {
    const rows = this.database
      .prepare(`
        SELECT id, name, description, seat_count, definition_json
        FROM layouts
        ORDER BY created_at ASC
      `)
      .all() as unknown as LayoutRow[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      seatCount: row.seat_count,
      definition: JSON.parse(row.definition_json) as SeatLayoutDefinition,
    }));
  }
}
