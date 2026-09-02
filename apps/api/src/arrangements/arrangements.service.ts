import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service.js';
import {
  layoutSeatIds,
  type SeatLayoutDefinition,
} from '../layouts/layout-definitions.js';
import type { PersonRow } from '../people/people.service.js';
import {
  AssignPersonDto,
  CreateArrangementDto,
  DuplicateArrangementDto,
  UpdateArrangementDto,
} from './arrangements.dto.js';

interface ArrangementRow {
  id: string;
  name: string;
  description: string;
  layout_id: string;
  source_arrangement_id: string | null;
  created_at: string;
  updated_at: string;
  layout_name?: string;
  seat_count?: number;
  definition_json?: string;
  assignment_count?: number;
}

interface AssignmentRow {
  id: string;
  seat_id: string;
  person_id: string;
  full_name: string;
  position: string;
  organization: string;
  email: string;
  notes: string;
  photo_filename: string;
  active: number;
  created_at: string;
  updated_at: string;
  person_updated_at: string;
}

@Injectable()
export class ArrangementsService {
  constructor(private readonly database: DatabaseService) {}

  findAll() {
    const rows = this.database
      .prepare(`
        SELECT
          a.*,
          l.name AS layout_name,
          l.seat_count,
          COUNT(s.id) AS assignment_count
        FROM arrangements a
        JOIN layouts l ON l.id = a.layout_id
        LEFT JOIN assignments s ON s.arrangement_id = a.id
        GROUP BY a.id
        ORDER BY a.updated_at DESC
      `)
      .all() as unknown as ArrangementRow[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      layoutId: row.layout_id,
      layoutName: row.layout_name,
      seatCount: row.seat_count,
      assignmentCount: Number(row.assignment_count || 0),
      sourceArrangementId: row.source_arrangement_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  findOne(id: string) {
    const row = this.findArrangementRow(id);
    if (!row) throw new NotFoundException('La versión del acomodo no existe.');

    const assignments = this.database
      .prepare(`
        SELECT
          s.id,
          s.seat_id,
          s.person_id,
          s.created_at,
          s.updated_at,
          p.full_name,
          p.position,
          p.organization,
          p.email,
          p.notes,
          p.photo_filename,
          p.updated_at AS person_updated_at,
          p.active
        FROM assignments s
        JOIN people p ON p.id = s.person_id
        WHERE s.arrangement_id = ?
        ORDER BY s.seat_id COLLATE NOCASE ASC
      `)
      .all(id) as unknown as AssignmentRow[];

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      layoutId: row.layout_id,
      layoutName: row.layout_name,
      sourceArrangementId: row.source_arrangement_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      definition: JSON.parse(row.definition_json || '{}') as SeatLayoutDefinition,
      assignments: assignments.map((assignment) => ({
        id: assignment.id,
        seatId: assignment.seat_id,
        personId: assignment.person_id,
        createdAt: assignment.created_at,
        updatedAt: assignment.updated_at,
        person: {
          id: assignment.person_id,
          fullName: assignment.full_name,
          position: assignment.position,
          organization: assignment.organization,
          email: assignment.email,
          notes: assignment.notes,
          photoUrl: assignment.photo_filename
            ? `/api/people/${assignment.person_id}/photo?v=${encodeURIComponent(assignment.person_updated_at)}`
            : null,
          active: Boolean(assignment.active),
        },
      })),
    };
  }

  create(dto: CreateArrangementDto) {
    this.assertLayoutExists(dto.layoutId);
    const id = randomUUID();
    const now = new Date().toISOString();
    this.database
      .prepare(`
        INSERT INTO arrangements
          (id, name, description, layout_id, source_arrangement_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, NULL, ?, ?)
      `)
      .run(
        id,
        dto.name.trim(),
        dto.description?.trim() || '',
        dto.layoutId,
        now,
        now,
      );
    return this.findOne(id);
  }

  update(id: string, dto: UpdateArrangementDto) {
    const current = this.findArrangementRow(id);
    if (!current) throw new NotFoundException('La versión del acomodo no existe.');

    this.database
      .prepare(`
        UPDATE arrangements
        SET name = ?, description = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(
        dto.name?.trim() ?? current.name,
        dto.description?.trim() ?? current.description,
        new Date().toISOString(),
        id,
      );
    return this.findOne(id);
  }

  duplicate(id: string, dto: DuplicateArrangementDto) {
    const source = this.findArrangementRow(id);
    if (!source) throw new NotFoundException('La versión de origen no existe.');
    const newId = randomUUID();
    const now = new Date().toISOString();

    this.database.transaction(() => {
      this.database
        .prepare(`
          INSERT INTO arrangements
            (id, name, description, layout_id, source_arrangement_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          newId,
          dto.name.trim(),
          dto.description?.trim() || source.description,
          source.layout_id,
          source.id,
          now,
          now,
        );

      const sourceAssignments = this.database
        .prepare('SELECT seat_id, person_id FROM assignments WHERE arrangement_id = ?')
        .all(id) as unknown as Array<{ seat_id: string; person_id: string }>;
      const insert = this.database.prepare(`
        INSERT INTO assignments
          (id, arrangement_id, seat_id, person_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const assignment of sourceAssignments) {
        insert.run(
          randomUUID(),
          newId,
          assignment.seat_id,
          assignment.person_id,
          now,
          now,
        );
      }
    });

    return this.findOne(newId);
  }

  assign(id: string, seatId: string, dto: AssignPersonDto) {
    const arrangement = this.findArrangementRow(id);
    if (!arrangement) throw new NotFoundException('La versión del acomodo no existe.');
    const definition = JSON.parse(arrangement.definition_json || '{}') as SeatLayoutDefinition;
    if (!layoutSeatIds(definition).includes(seatId)) {
      throw new BadRequestException('El asiento no pertenece a este mapa.');
    }

    const person = this.database.prepare('SELECT * FROM people WHERE id = ?').get(dto.personId) as
      | PersonRow
      | undefined;
    if (!person || !person.active) {
      throw new NotFoundException('La persona no existe o está archivada.');
    }

    const occupied = this.database
      .prepare('SELECT person_id FROM assignments WHERE arrangement_id = ? AND seat_id = ?')
      .get(id, seatId) as { person_id: string } | undefined;
    if (occupied && occupied.person_id !== dto.personId) {
      throw new ConflictException('El asiento ya está asignado a otra persona.');
    }
    if (occupied?.person_id === dto.personId) return this.findOne(id);

    const now = new Date().toISOString();
    this.database.transaction(() => {
      this.database
        .prepare('DELETE FROM assignments WHERE arrangement_id = ? AND person_id = ?')
        .run(id, dto.personId);
      this.database
        .prepare(`
          INSERT INTO assignments
            (id, arrangement_id, seat_id, person_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        .run(randomUUID(), id, seatId, dto.personId, now, now);
      this.touch(id, now);
    });

    return this.findOne(id);
  }

  unassign(id: string, seatId: string) {
    this.assertArrangementExists(id);
    this.database.transaction(() => {
      this.database
        .prepare('DELETE FROM assignments WHERE arrangement_id = ? AND seat_id = ?')
        .run(id, seatId);
      this.touch(id);
    });
    return this.findOne(id);
  }

  clear(id: string) {
    this.assertArrangementExists(id);
    this.database.transaction(() => {
      this.database.prepare('DELETE FROM assignments WHERE arrangement_id = ?').run(id);
      this.touch(id);
    });
    return this.findOne(id);
  }

  remove(id: string) {
    const arrangement = this.findArrangementRow(id);
    if (!arrangement) throw new NotFoundException('La versión del acomodo no existe.');
    const count = this.database
      .prepare('SELECT COUNT(*) AS total FROM arrangements WHERE layout_id = ?')
      .get(arrangement.layout_id) as { total: number };
    if (count.total <= 1) {
      throw new BadRequestException('Debe conservar al menos una versión de este escenario.');
    }
    this.database.prepare('DELETE FROM arrangements WHERE id = ?').run(id);
    return { deleted: true };
  }

  private findArrangementRow(id: string): ArrangementRow | undefined {
    return this.database
      .prepare(`
        SELECT a.*, l.name AS layout_name, l.seat_count, l.definition_json
        FROM arrangements a
        JOIN layouts l ON l.id = a.layout_id
        WHERE a.id = ?
      `)
      .get(id) as ArrangementRow | undefined;
  }

  private assertArrangementExists(id: string): void {
    if (!this.findArrangementRow(id)) {
      throw new NotFoundException('La versión del acomodo no existe.');
    }
  }

  private assertLayoutExists(id: string): void {
    const layout = this.database.prepare('SELECT id FROM layouts WHERE id = ?').get(id);
    if (!layout) throw new NotFoundException('La plantilla seleccionada no existe.');
  }

  private touch(id: string, at = new Date().toISOString()): void {
    this.database
      .prepare('UPDATE arrangements SET updated_at = ? WHERE id = ?')
      .run(at, id);
  }
}
