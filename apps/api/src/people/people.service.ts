import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { resolve, sep } from 'node:path';
import { parseCsv } from '../common/csv.js';
import { DatabaseService } from '../database/database.service.js';
import { CreatePersonDto, UpdatePersonDto } from './people.dto.js';

export interface ImportPeopleResult {
  created: number;
  skipped: number;
  total: number;
  errors: string[];
}

export interface PersonRow {
  id: string;
  full_name: string;
  position: string;
  organization: string;
  email: string;
  notes: string;
  photo_filename: string;
  photo_original_name: string;
  photo_mime: string;
  active: number;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class PeopleService {
  private readonly photoDirectory = resolve(
    process.env.PHOTO_DIR?.trim() || resolve(process.cwd(), 'data', 'uploads', 'people'),
  );

  constructor(private readonly database: DatabaseService) {
    mkdirSync(this.photoDirectory, { recursive: true });
  }

  findAll(search = '') {
    const normalizedSearch = `%${search.trim()}%`;
    const rows = this.database
      .prepare(`
        SELECT *
        FROM people
        WHERE active = 1
          AND (? = '%%' OR full_name LIKE ? OR position LIKE ? OR organization LIKE ?)
        ORDER BY full_name COLLATE NOCASE ASC
        LIMIT 1000
      `)
      .all(normalizedSearch, normalizedSearch, normalizedSearch, normalizedSearch) as unknown as PersonRow[];

    return rows.map(mapPerson);
  }

  findOne(id: string) {
    const person = this.findRow(id);
    if (!person) throw new NotFoundException('La persona no existe.');
    return mapPerson(person);
  }

  create(dto: CreatePersonDto) {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.database
      .prepare(`
        INSERT INTO people
          (id, full_name, position, organization, email, notes, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      `)
      .run(
        id,
        dto.fullName.trim(),
        dto.position?.trim() || '',
        dto.organization?.trim() || '',
        dto.email?.trim() || '',
        dto.notes?.trim() || '',
        now,
        now,
      );
    return this.findOne(id);
  }

  update(id: string, dto: UpdatePersonDto) {
    const current = this.findRow(id);
    if (!current) throw new NotFoundException('La persona no existe.');

    const updated = {
      fullName: dto.fullName?.trim() ?? current.full_name,
      position: dto.position?.trim() ?? current.position,
      organization: dto.organization?.trim() ?? current.organization,
      email: dto.email?.trim() ?? current.email,
      notes: dto.notes?.trim() ?? current.notes,
      active: dto.active === undefined ? current.active : dto.active ? 1 : 0,
    };

    this.database
      .prepare(`
        UPDATE people
        SET full_name = ?, position = ?, organization = ?, email = ?, notes = ?, active = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(
        updated.fullName,
        updated.position,
        updated.organization,
        updated.email,
        updated.notes,
        updated.active,
        new Date().toISOString(),
        id,
      );

    return this.findOne(id);
  }

  archive(id: string) {
    return this.update(id, { active: false });
  }

  /**
   * Borra por completo el directorio: elimina todas las asignaciones (en
   * cualquier versión), todas las personas y sus fotografías guardadas.
   */
  deleteAll(): { deleted: number } {
    const photos = this.database
      .prepare("SELECT photo_filename FROM people WHERE photo_filename <> ''")
      .all() as unknown as Array<{ photo_filename: string }>;

    const total = this.database
      .prepare('SELECT COUNT(*) AS total FROM people')
      .get() as { total: number };

    this.database.transaction(() => {
      this.database.prepare('DELETE FROM assignments').run();
      this.database.prepare('DELETE FROM people').run();
    });

    for (const { photo_filename } of photos) {
      try {
        this.removeStoredPhoto(photo_filename);
      } catch {
        // Si un archivo ya no existe, continuamos sin interrumpir el borrado.
      }
    }

    return { deleted: total.total };
  }

  /**
   * Importa varias personas desde el contenido de un archivo CSV.
   *
   * Columnas admitidas (por encabezado o por posición):
   *   Nombre completo, Cargo, Institución, Correo, Notas.
   * La primera fila puede ser un encabezado; se detecta automáticamente.
   * Sólo el nombre completo es obligatorio.
   */
  importCsv(content: string): ImportPeopleResult {
    const rows = parseCsv(content);
    const result: ImportPeopleResult = { created: 0, skipped: 0, total: 0, errors: [] };
    if (rows.length === 0) {
      throw new BadRequestException('El archivo CSV no contiene datos.');
    }

    const { columns, dataRows } = resolveColumns(rows);
    result.total = dataRows.length;

    const insertPerson = this.database.prepare(`
      INSERT INTO people
        (id, full_name, position, organization, email, notes, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);

    this.database.transaction(() => {
      dataRows.forEach((row, index) => {
        const value = (key: keyof typeof columns): string => {
          const columnIndex = columns[key];
          return columnIndex === -1 ? '' : (row[columnIndex] || '').trim();
        };

        const fullName = value('fullName');
        if (fullName.length < 2) {
          result.skipped += 1;
          if (result.errors.length < 20) {
            result.errors.push(
              `Fila ${index + 1}: el nombre está vacío o es demasiado corto.`,
            );
          }
          return;
        }

        const now = new Date().toISOString();
        insertPerson.run(
          randomUUID(),
          fullName.slice(0, 160),
          value('position').slice(0, 180),
          value('organization').slice(0, 180),
          normalizeEmail(value('email')).slice(0, 180),
          value('notes').slice(0, 600),
          now,
          now,
        );
        result.created += 1;
      });
    });

    return result;
  }

  savePhoto(id: string, file: Express.Multer.File) {
    const current = this.findRow(id);
    if (!current) throw new NotFoundException('La persona no existe.');
    if (!file?.buffer?.length) {
      throw new BadRequestException('Seleccione una fotografía.');
    }
    if (file.buffer.length > 5 * 1024 * 1024) {
      throw new BadRequestException('La fotografía no puede superar 5 MB.');
    }

    const format = detectImageFormat(file.buffer);
    if (!format) {
      throw new BadRequestException('La fotografía debe ser un archivo JPG o PNG válido.');
    }

    const filename = `${randomUUID()}.${format.extension}`;
    writeFileSync(resolve(this.photoDirectory, filename), file.buffer);
    const now = new Date().toISOString();
    this.database
      .prepare(`
        UPDATE people
        SET photo_filename = ?, photo_original_name = ?, photo_mime = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(filename, file.originalname || filename, format.mime, now, id);

    if (current.photo_filename) this.removeStoredPhoto(current.photo_filename);
    return this.findOne(id);
  }

  getPhoto(id: string): { data: Buffer; mime: string; filename: string } {
    const person = this.findRow(id);
    if (!person?.photo_filename) {
      throw new NotFoundException('La persona no tiene una fotografía guardada.');
    }
    const path = this.safePhotoPath(person.photo_filename);
    if (!existsSync(path)) {
      throw new NotFoundException('No se encontró la fotografía guardada.');
    }
    return {
      data: readFileSync(path),
      mime: person.photo_mime || 'application/octet-stream',
      filename: person.photo_original_name || person.photo_filename,
    };
  }

  private findRow(id: string): PersonRow | undefined {
    return this.database.prepare('SELECT * FROM people WHERE id = ?').get(id) as
      | PersonRow
      | undefined;
  }

  private safePhotoPath(filename: string): string {
    const path = resolve(this.photoDirectory, filename);
    if (!path.startsWith(`${this.photoDirectory}${sep}`)) {
      throw new BadRequestException('La ruta de la fotografía no es válida.');
    }
    return path;
  }

  private removeStoredPhoto(filename: string): void {
    const path = this.safePhotoPath(filename);
    if (existsSync(path)) unlinkSync(path);
  }
}

export function mapPerson(row: PersonRow) {
  return {
    id: row.id,
    fullName: row.full_name,
    position: row.position,
    organization: row.organization,
    email: row.email,
    notes: row.notes,
    photoUrl: row.photo_filename
      ? `people/${row.id}/photo?v=${encodeURIComponent(row.updated_at)}`
      : null,
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface ColumnMap {
  fullName: number;
  position: number;
  organization: number;
  email: number;
  notes: number;
}

const HEADER_ALIASES: Record<keyof ColumnMap, string[]> = {
  fullName: ['nombre', 'nombre completo', 'name', 'full name', 'fullname', 'persona', 'invitado', 'invitada'],
  position: ['cargo', 'puesto', 'función', 'funcion', 'position', 'title', 'rol'],
  organization: ['institución', 'institucion', 'organización', 'organizacion', 'organization', 'dependencia', 'empresa'],
  email: ['correo', 'correo electrónico', 'correo electronico', 'email', 'e-mail', 'mail'],
  notes: ['notas', 'nota', 'notes', 'observaciones', 'comentarios'],
};

/**
 * Decide si la primera fila es un encabezado y arma el mapa de columnas.
 * Si no hay encabezado reconocible, usa el orden posicional por omisión.
 */
function resolveColumns(rows: string[][]): { columns: ColumnMap; dataRows: string[][] } {
  const positional: ColumnMap = {
    fullName: 0,
    position: 1,
    organization: 2,
    email: 3,
    notes: 4,
  };

  const first = rows[0].map((cell) => cell.trim().toLocaleLowerCase('es'));
  const matched: Partial<ColumnMap> = {};
  let matches = 0;

  first.forEach((cell, index) => {
    for (const key of Object.keys(HEADER_ALIASES) as Array<keyof ColumnMap>) {
      if (matched[key] === undefined && HEADER_ALIASES[key].includes(cell)) {
        matched[key] = index;
        matches += 1;
        break;
      }
    }
  });

  // Consideramos que hay encabezado si al menos el nombre y otra columna coinciden.
  const hasHeader = matched.fullName !== undefined && matches >= 2;
  if (hasHeader) {
    return {
      columns: {
        fullName: matched.fullName ?? 0,
        position: matched.position ?? -1,
        organization: matched.organization ?? -1,
        email: matched.email ?? -1,
        notes: matched.notes ?? -1,
      },
      dataRows: rows.slice(1),
    };
  }

  return { columns: positional, dataRows: rows };
}

function normalizeEmail(value: string): string {
  const trimmed = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : '';
}

function detectImageFormat(buffer: Buffer): { extension: 'jpg' | 'png'; mime: string } | null {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { extension: 'png', mime: 'image/png' };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: 'jpg', mime: 'image/jpeg' };
  }
  return null;
}
