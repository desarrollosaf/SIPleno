import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import PDFDocument from 'pdfkit';
import { ArrangementsService } from '../arrangements/arrangements.service.js';
import { PeopleService } from '../people/people.service.js';
import { normalizePhotoForPdf } from './image-normalize.js';
import type {
  SeatGroupDefinition,
  SeatLayoutDefinition,
} from '../layouts/layout-definitions.js';

interface ExportAssignment {
  seatId: string;
  personId: string;
  person: {
    fullName: string;
    position: string;
    organization: string;
  };
}

interface ExportArrangement {
  id: string;
  name: string;
  description: string;
  layoutName: string;
  definition: SeatLayoutDefinition;
  assignments: ExportAssignment[];
}

interface SeatRow {
  seatId: string;
  occupant: ExportAssignment | null;
}

/** Imagen ya abierta por pdfkit (openImage no está tipado en @types/pdfkit). */
interface PdfImage {
  width: number;
  height: number;
}

const WINE = '#8F1647';
const WINE_DARK = '#681034';
const INK = '#25262A';
const MUTED = '#6B6D75';
const LINE = '#D8D9DE';
const SEAT_FREE = '#ECECEF';
const SEAT_FREE_LINE = '#C9CAD1';
const AVATAR_BG = '#EFE2E9';
const WHITE = '#FFFFFF';

@Injectable()
export class PdfExportService {
  constructor(
    private readonly arrangements: ArrangementsService,
    private readonly people: PeopleService,
  ) {}

  async createMapAndList(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const arrangement = this.arrangements.findOne(id) as unknown as ExportArrangement;
    const assignments = sortBySeat(arrangement.assignments);
    const bySeat = new Map(assignments.map((item) => [item.seatId, item]));
    const photos = this.loadPhotos(assignments);
    const definition = arrangement.definition;
    const totalSeats = definition.groups.reduce(
      (sum, group) => sum + group.rows * group.columns,
      0,
    );

    const doc = new PDFDocument({
      size: 'LETTER',
      layout: 'landscape',
      margins: { top: 28, bottom: 30, left: 28, right: 28 },
      info: {
        Title: `Mapa y listado · ${arrangement.name}`,
        Author: 'Sistema local de asignación de asientos',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolveDone) => {
      doc.on('end', () => resolveDone(Buffer.concat(chunks)));
    });

    // Cada fotografía se normaliza (JPEG tal cual; PNG aplanado sin alfa) y se
    // incrusta UNA sola vez, reutilizándose en el mapa y en la tabla. Aplanar el
    // canal alfa evita la ruta asíncrona de pdfkit que puede bloquear la
    // exportación en servidores con poca CPU.
    const opener = doc as unknown as { openImage(source: Buffer): PdfImage };
    const images = new Map<string, PdfImage>();
    for (const [personId, data] of photos) {
      const normalized = normalizePhotoForPdf(data);
      if (!normalized) continue;
      try {
        images.set(personId, opener.openImage(normalized));
      } catch {
        // Si una imagen no puede abrirse, simplemente no se dibuja.
      }
    }

    const pageLeft = doc.page.margins.left;
    const pageRight = doc.page.width - doc.page.margins.right;
    const contentWidth = pageRight - pageLeft;

    // --- Encabezado compacto ---
    let cursorY = doc.page.margins.top;
    doc
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .fillColor(WINE)
      .text('ASIGNACIÓN DE ASIENTOS', pageLeft, cursorY, { characterSpacing: 1.4 });
    cursorY += 12;
    doc.font('Helvetica-Bold').fontSize(16).fillColor(INK).text(arrangement.name, pageLeft, cursorY);
    cursorY = doc.y + 1;
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(MUTED)
      .text(
        `Escenario: ${arrangement.layoutName}    ·    Generado: ${formatDate(new Date())}    ·    ` +
          `${assignments.length} asignados · ${totalSeats - assignments.length} disponibles`,
        pageLeft,
        cursorY,
      );
    cursorY = doc.y + 6;

    // --- Mapa (redistribuido para aprovechar toda la hoja) ---
    const legendHeight = 16;
    const mapAreaTop = cursorY;
    const mapAreaBottom = doc.page.height - doc.page.margins.bottom - legendHeight - 4;
    const mapAreaHeight = mapAreaBottom - mapAreaTop;
    const scale = Math.min(contentWidth / definition.width, mapAreaHeight / definition.height);
    const mapWidth = definition.width * scale;
    const mapHeight = definition.height * scale;
    const mapX = pageLeft + (contentWidth - mapWidth) / 2;
    const mapY = mapAreaTop;

    // Marco del mapa
    doc
      .save()
      .roundedRect(mapX - 4, mapY - 4, mapWidth + 8, mapHeight + 8, 6)
      .fillAndStroke('#FBFBFC', LINE)
      .restore();

    // Fondo (plano del recinto)
    const backgroundBuffer = this.readAsset(definition.background.asset);
    if (backgroundBuffer) {
      try {
        doc.image(
          backgroundBuffer,
          mapX + definition.background.x * scale,
          mapY + definition.background.y * scale,
          {
            width: definition.background.width * scale,
            height: definition.background.height * scale,
          },
        );
      } catch {
        // Si la imagen no puede incrustarse, se continúa sin el plano de fondo.
      }
    }

    // Posiciones de todos los asientos
    const seatSize = definition.seatSize * scale;
    interface SeatBox { x: number; y: number; seatId: string; occupant: ExportAssignment | undefined }
    const boxes: SeatBox[] = [];
    for (const group of definition.groups) {
      seatsForGroup(group).forEach((seatId, index) => {
        const column = index % group.columns;
        const row = Math.floor(index / group.columns);
        const x = mapX + (group.x + column * (definition.seatSize + definition.gap)) * scale;
        const y = mapY + (group.y + row * (definition.seatSize + definition.gap)) * scale;
        boxes.push({ x, y, seatId, occupant: bySeat.get(seatId) });
      });
    }

    const radius = Math.min(4, seatSize * 0.26);

    // Paso 1: asientos disponibles (al fondo). Fuente reducida y ajustada al
    // ancho del asiento para que etiquetas largas (p. ej. CC16, I100) no se corten.
    for (const box of boxes) {
      if (box.occupant) continue;
      doc.save().roundedRect(box.x, box.y, seatSize, seatSize, radius).fillAndStroke(SEAT_FREE, SEAT_FREE_LINE).restore();
      const fontSize = fitFontSize(
        doc,
        box.seatId,
        seatSize - 2.5,
        Math.min(seatSize * 0.3, 6),
        3.4,
      );
      doc
        .font('Helvetica-Bold')
        .fontSize(fontSize)
        .fillColor('#6A6C75')
        .text(box.seatId, box.x, box.y + (seatSize - fontSize) / 2 - 0.5, {
          width: seatSize,
          align: 'center',
          lineBreak: false,
        });
    }

    // Paso 2: asientos ocupados (encima). El curul se pinta en guinda con su
    // número (indicativo) y la fotografía, más pequeña, se coloca a la derecha
    // del asiento para que no se encimen entre sí.
    const photoSize = seatSize * 1.12;
    const photoRadius = Math.min(4.5, photoSize * 0.24);
    const photoGap = Math.max(1.6, seatSize * 0.14);
    const mapRight = mapX + mapWidth;
    for (const box of boxes) {
      const occupant = box.occupant;
      if (!occupant) continue;

      // Curul ocupado con su número
      doc.save().roundedRect(box.x, box.y, seatSize, seatSize, radius).fillAndStroke(WINE, WINE_DARK).restore();
      const numberFont = fitFontSize(doc, box.seatId, seatSize - 2.5, Math.min(seatSize * 0.3, 6), 3.4);
      doc
        .font('Helvetica-Bold')
        .fontSize(numberFont)
        .fillColor(WHITE)
        .text(box.seatId, box.x, box.y + (seatSize - numberFont) / 2 - 0.5, {
          width: seatSize,
          align: 'center',
          lineBreak: false,
        });

      // Fotografía a la derecha (o a la izquierda si no cabe por el borde)
      const photo = images.get(occupant.personId);
      if (photo) {
        let px = box.x + seatSize + photoGap;
        if (px + photoSize > mapRight + 4) {
          px = box.x - photoGap - photoSize; // se voltea al lado izquierdo
        }
        const py = box.y + (seatSize - photoSize) / 2;
        doc.save().roundedRect(px - 0.7, py - 0.7, photoSize + 1.4, photoSize + 1.4, photoRadius + 1).fill(WHITE).restore();
        drawImageCover(doc, photo, px, py, photoSize, photoSize, photoRadius);
        doc.save().roundedRect(px, py, photoSize, photoSize, photoRadius).lineWidth(1).stroke(WINE).restore();
      }
    }

    // Leyenda
    const legendY = mapY + mapHeight + 8;
    let legendX = pageLeft;
    const legendItems: Array<{ color: string; border: string; text: string }> = [
      { color: SEAT_FREE, border: SEAT_FREE_LINE, text: 'Disponible' },
      { color: WINE, border: WINE_DARK, text: 'Asignado' },
    ];
    for (const item of legendItems) {
      doc.save().roundedRect(legendX, legendY, 11, 11, 2).fillAndStroke(item.color, item.border).restore();
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(item.text, legendX + 16, legendY + 1.5);
      legendX += 22 + doc.widthOfString(item.text) + 22;
    }
    doc
      .font('Helvetica-Oblique')
      .fontSize(8.5)
      .fillColor(MUTED)
      .text('La fotografía se muestra a la derecha del curul cuando la persona tiene una registrada.', legendX, legendY + 1.5);

    // --- Listado (página nueva): TODOS los asientos, en el orden A, AA, B, BB… ---
    doc.addPage();
    const seatRows = orderedSeats(definition, bySeat);
    this.drawList(doc, arrangement, seatRows, assignments.length, totalSeats, images);

    doc.end();
    const buffer = await done;
    return {
      buffer,
      filename: `mapa-listado-${slug(arrangement.layoutName)}-${slug(arrangement.name)}.pdf`,
    };
  }

  private drawList(
    doc: PDFKit.PDFDocument,
    arrangement: ExportArrangement,
    seatRows: SeatRow[],
    assignedCount: number,
    totalSeats: number,
    images: Map<string, PdfImage>,
  ): void {
    const pageLeft = doc.page.margins.left;
    const pageRight = doc.page.width - doc.page.margins.right;
    const contentWidth = pageRight - pageLeft;

    doc
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .fillColor(WINE)
      .text('LISTADO DE ASIENTOS', pageLeft, doc.page.margins.top, { characterSpacing: 1.4 });
    doc.font('Helvetica-Bold').fontSize(15).fillColor(INK).text(arrangement.name, pageLeft, doc.y + 2);
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor(MUTED)
      .text(
        `${arrangement.layoutName}    ·    ${assignedCount} asignados · ${totalSeats - assignedCount} disponibles · ${totalSeats} lugares en total`,
        pageLeft,
        doc.y + 1,
      );

    const columns = [
      { key: 'photo', label: 'Foto', width: 0.065, align: 'center' as const },
      { key: 'num', label: 'Núm.', width: 0.05, align: 'center' as const },
      { key: 'seat', label: 'Asiento', width: 0.095, align: 'center' as const },
      { key: 'name', label: 'Persona', width: 0.31, align: 'left' as const },
      { key: 'position', label: 'Cargo o función', width: 0.24, align: 'left' as const },
      { key: 'organization', label: 'Institución', width: 0.24, align: 'left' as const },
    ];
    const colX: number[] = [];
    let acc = pageLeft;
    for (const column of columns) {
      colX.push(acc);
      acc += column.width * contentWidth;
    }
    const rowPadding = 6;
    const avatar = 24;

    let y = doc.y + 12;
    const drawHeader = (): void => {
      doc.save().rect(pageLeft, y, contentWidth, 20).fill(WINE).restore();
      columns.forEach((column, index) => {
        doc
          .font('Helvetica-Bold')
          .fontSize(9)
          .fillColor(WHITE)
          .text(column.label, colX[index] + 5, y + 6, {
            width: column.width * contentWidth - 10,
            align: column.key === 'photo' || column.key === 'num' || column.key === 'seat' ? 'center' : 'left',
            lineBreak: false,
          });
      });
      y += 20;
    };
    drawHeader();

    const bottomLimit = doc.page.height - doc.page.margins.bottom;
    seatRows.forEach((row, index) => {
      const occupant = row.occupant;
      const textCells: Record<string, string> = {
        num: String(index + 1),
        seat: row.seatId,
        name: occupant ? occupant.person.fullName : 'Disponible',
        position: occupant ? occupant.person.position || '—' : '',
        organization: occupant ? occupant.person.organization || '—' : '',
      };
      const textHeights = columns
        .filter((column) => column.key !== 'photo')
        .map((column) =>
          doc
            .font('Helvetica')
            .fontSize(9)
            .heightOfString(textCells[column.key] || ' ', { width: column.width * contentWidth - 10 }),
        );
      // Las filas ocupadas reservan espacio para la fotografía; las libres son
      // más compactas para no alargar el documento innecesariamente.
      const minHeight = occupant ? avatar + rowPadding * 2 : 17;
      const rowHeight = Math.max(minHeight, Math.max(...textHeights) + rowPadding * 2);

      if (y + rowHeight > bottomLimit) {
        doc.addPage();
        y = doc.page.margins.top;
        drawHeader();
      }

      if (index % 2 === 1) {
        doc.save().rect(pageLeft, y, contentWidth, rowHeight).fill('#F6F5F7').restore();
      }

      // Columna de foto: fotografía o avatar con iniciales (sólo si hay persona).
      if (occupant) {
        const photoColWidth = columns[0].width * contentWidth;
        const ax = colX[0] + (photoColWidth - avatar) / 2;
        const ay = y + (rowHeight - avatar) / 2;
        const photo = images.get(occupant.personId);
        if (photo) {
          doc.save().roundedRect(ax - 0.6, ay - 0.6, avatar + 1.2, avatar + 1.2, 5).fill(WHITE).restore();
          drawImageCover(doc, photo, ax, ay, avatar, avatar, 4.5);
          doc.save().roundedRect(ax, ay, avatar, avatar, 4.5).lineWidth(0.8).stroke('#D9C4CE').restore();
        } else {
          doc.save().roundedRect(ax, ay, avatar, avatar, 4.5).fill(AVATAR_BG).restore();
          doc
            .font('Helvetica-Bold')
            .fontSize(9)
            .fillColor(WINE)
            .text(initials(occupant.person.fullName), ax, ay + (avatar - 9) / 2 - 0.5, {
              width: avatar,
              align: 'center',
              lineBreak: false,
            });
        }
      }

      // Columnas de texto
      columns.forEach((column, columnIndex) => {
        if (column.key === 'photo') return;
        if (!textCells[column.key]) return;
        const isEmphasis = column.key === 'seat' || column.key === 'num';
        const isAvailableName = !occupant && column.key === 'name';
        doc
          .font(isAvailableName ? 'Helvetica-Oblique' : isEmphasis ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(9)
          .fillColor(isAvailableName ? MUTED : occupant ? INK : MUTED)
          .text(textCells[column.key], colX[columnIndex] + 5, y + rowPadding, {
            width: column.width * contentWidth - 10,
            align: column.align,
          });
      });

      doc.save().moveTo(pageLeft, y + rowHeight).lineTo(pageRight, y + rowHeight).strokeColor(LINE).lineWidth(0.5).stroke().restore();
      y += rowHeight;
    });
  }

  private loadPhotos(assignments: ExportAssignment[]): Map<string, Buffer> {
    const map = new Map<string, Buffer>();
    for (const assignment of assignments) {
      if (map.has(assignment.personId)) continue;
      try {
        const photo = this.people.getPhoto(assignment.personId);
        map.set(assignment.personId, photo.data);
      } catch {
        // La persona no tiene fotografía; se usarán las iniciales.
      }
    }
    return map;
  }

  private readAsset(assetPath: string): Buffer | null {
    const filename = basename(assetPath);
    const candidates = [
      resolve(process.cwd(), '../web/public/assets', filename),
      resolve(process.cwd(), '../web/dist/web/browser/assets', filename),
      resolve(process.cwd(), 'apps/web/public/assets', filename),
      resolve(process.cwd(), 'apps/web/dist/web/browser/assets', filename),
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        try {
          return readFileSync(candidate);
        } catch {
          return null;
        }
      }
    }
    return null;
  }
}

function drawImageCover(
  doc: PDFKit.PDFDocument,
  image: PdfImage | Buffer,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  doc.save();
  if (radius > 0) {
    doc.roundedRect(x, y, width, height, radius).clip();
  } else {
    doc.rect(x, y, width, height).clip();
  }
  try {
    doc.image(image as unknown as Buffer, x, y, {
      cover: [width, height],
      align: 'center',
      valign: 'center',
    });
  } catch {
    // Si la imagen no puede incrustarse, se omite sin interrumpir el documento.
  }
  doc.restore();
}

/** Reduce el tamaño de fuente (Helvetica-Bold) hasta que el texto quepa en maxWidth. */
function fitFontSize(
  doc: PDFKit.PDFDocument,
  text: string,
  maxWidth: number,
  startSize: number,
  minSize: number,
): number {
  doc.font('Helvetica-Bold');
  let size = startSize;
  while (size > minSize) {
    doc.fontSize(size);
    if (doc.widthOfString(text) <= maxWidth) break;
    size -= 0.25;
  }
  return Math.max(size, minSize);
}

/**
 * Devuelve todos los asientos del escenario (ocupados y libres) ordenados por
 * grupo en la secuencia A, AA, B, BB, C, CC… y, dentro de cada grupo, por número.
 */
function orderedSeats(
  definition: SeatLayoutDefinition,
  bySeat: Map<string, ExportAssignment>,
): SeatRow[] {
  interface Item {
    base: string;
    labelLength: number;
    num: number;
    seatId: string;
    occupant: ExportAssignment | null;
  }
  const items: Item[] = [];
  for (const group of definition.groups) {
    const base = (group.label[0] || '').toLocaleUpperCase('es');
    seatsForGroup(group).forEach((seatId, index) => {
      items.push({
        base,
        labelLength: group.label.length,
        num: group.start + index,
        seatId,
        occupant: bySeat.get(seatId) ?? null,
      });
    });
  }
  items.sort(
    (a, b) =>
      a.base.localeCompare(b.base, 'es') ||
      a.labelLength - b.labelLength ||
      a.num - b.num ||
      a.seatId.localeCompare(b.seatId, 'es', { numeric: true, sensitivity: 'base' }),
  );
  return items.map((item) => ({ seatId: item.seatId, occupant: item.occupant }));
}

function seatsForGroup(group: SeatGroupDefinition): string[] {  return Array.from(
    { length: group.rows * group.columns },
    (_, index) => `${group.label}${group.start + index}`,
  );
}

function sortBySeat(assignments: ExportAssignment[]): ExportAssignment[] {
  return [...assignments].sort((a, b) =>
    a.seatId.localeCompare(b.seatId, 'es', { numeric: true, sensitivity: 'base' }),
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toLocaleUpperCase('es');
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Mexico_City',
  }).format(value);
}

function slug(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 55) || 'version'
  );
}
