import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeightRule,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import type { ArrangementDetail, Assignment } from './word-export.types.js';
import { ArrangementsService } from '../arrangements/arrangements.service.js';
import { PeopleService } from '../people/people.service.js';

const WINE = '8F1647';
const INK = '25262A';
const MUTED = '676A73';
const WHITE = 'FFFFFF';
const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: WHITE },
  bottom: { style: BorderStyle.NONE, size: 0, color: WHITE },
  left: { style: BorderStyle.NONE, size: 0, color: WHITE },
  right: { style: BorderStyle.NONE, size: 0, color: WHITE },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: WHITE },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: WHITE },
};

@Injectable()
export class WordExportService {
  constructor(
    private readonly arrangements: ArrangementsService,
    private readonly people: PeopleService,
  ) {}

  async createSeatList(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const arrangement = this.arrangements.findOne(id) as ArrangementDetail;
    const assignments = sortedAssignments(arrangement.assignments);
    const generatedAt = formatDate(new Date().toISOString());
    const rows = [
      new TableRow({
        tableHeader: true,
        children: [
          headerCell('Núm.', 650),
          headerCell('Asiento', 1000),
          headerCell('Persona', 2850),
          headerCell('Cargo o función', 2350),
          headerCell('Institución', 2510),
        ],
      }),
      ...assignments.map(
        (assignment, index) =>
          new TableRow({
            cantSplit: true,
            children: [
              bodyCell(String(index + 1), 650, AlignmentType.CENTER),
              bodyCell(assignment.seatId, 1000, AlignmentType.CENTER, true),
              bodyCell(assignment.person.fullName, 2850),
              bodyCell(assignment.person.position || '—', 2350),
              bodyCell(assignment.person.organization || '—', 2510),
            ],
          }),
      ),
    ];

    if (assignments.length === 0) {
      rows.push(
        new TableRow({
          children: [
            new TableCell({
              columnSpan: 5,
              width: { size: 9360, type: WidthType.DXA },
              margins: { top: 240, bottom: 240, left: 160, right: 160 },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: 'Esta versión todavía no tiene personas asignadas.',
                      color: MUTED,
                      italics: true,
                      size: 19,
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      );
    }

    const document = new Document({
      creator: 'Sistema local de asignación de asientos',
      title: `Listado de asientos · ${arrangement.name}`,
      description: `Listado exportado del escenario ${arrangement.layoutName}`,
      styles: {
        default: {
          document: { run: { font: 'Aptos', size: 20, color: INK } },
        },
      },
      sections: [
        {
          properties: {
            page: {
              size: { width: 12240, height: 15840 },
              margin: { top: 720, right: 720, bottom: 720, left: 720 },
            },
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new TextRun({ text: 'Página ', color: MUTED, size: 16 }),
                    new TextRun({ children: [PageNumber.CURRENT], color: MUTED, size: 16 }),
                  ],
                }),
              ],
            }),
          },
          children: [
            new Paragraph({
              spacing: { after: 60 },
              children: [
                new TextRun({
                  text: 'ASIGNACIÓN DE ASIENTOS',
                  bold: true,
                  color: WINE,
                  size: 18,
                  characterSpacing: 80,
                }),
              ],
            }),
            new Paragraph({
              spacing: { after: 100 },
              children: [
                new TextRun({ text: arrangement.name, bold: true, color: INK, size: 34 }),
              ],
            }),
            new Paragraph({
              spacing: { after: 50 },
              children: [
                new TextRun({ text: 'Escenario: ', bold: true, color: MUTED, size: 19 }),
                new TextRun({ text: arrangement.layoutName, color: INK, size: 19 }),
                new TextRun({ text: '    Generado: ', bold: true, color: MUTED, size: 19 }),
                new TextRun({ text: generatedAt, color: INK, size: 19 }),
              ],
            }),
            new Paragraph({
              spacing: { after: 210 },
              children: [
                new TextRun({
                  text: `${assignments.length} asignados · ${arrangement.definition.groups.reduce((sum, group) => sum + group.rows * group.columns, 0) - assignments.length} disponibles`,
                  bold: true,
                  color: WINE,
                  size: 20,
                }),
                ...(arrangement.description
                  ? [new TextRun({ text: `    ${arrangement.description}`, color: MUTED, size: 18 })]
                  : []),
              ],
            }),
            new Table({
              width: { size: 9360, type: WidthType.DXA },
              columnWidths: [650, 1000, 2850, 2350, 2510],
              layout: TableLayoutType.FIXED,
              rows,
            }),
          ],
        },
      ],
    });

    return {
      buffer: await Packer.toBuffer(document),
      filename: `asientos-${slug(arrangement.layoutName)}-${slug(arrangement.name)}.docx`,
    };
  }

  async createLabels(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const arrangement = this.arrangements.findOne(id) as ArrangementDetail;
    const assignments = sortedAssignments(arrangement.assignments);
    if (assignments.length === 0) {
      throw new BadRequestException('Asigne al menos una persona antes de exportar etiquetas.');
    }

    const padded: Array<Assignment | null> = [...assignments];
    while (padded.length % 10 !== 0) padded.push(null);
    const rows: TableRow[] = [];
    for (let index = 0; index < padded.length; index += 2) {
      rows.push(
        new TableRow({
          height: { value: 2880, rule: HeightRule.EXACT },
          cantSplit: true,
          children: [
            await this.labelCell(padded[index], arrangement, 5760),
            new TableCell({
              width: { size: 270, type: WidthType.DXA },
              borders: NO_BORDERS,
              children: [new Paragraph('')],
            }),
            await this.labelCell(padded[index + 1], arrangement, 5760),
          ],
        }),
      );
    }

    const document = new Document({
      creator: 'Sistema local de asignación de asientos',
      title: `Etiquetas · ${arrangement.name}`,
      description: 'Etiquetas compatibles con la plantilla S-14075BLU (4 × 2 pulgadas)',
      styles: {
        default: {
          document: { run: { font: 'Aptos', size: 18, color: INK } },
        },
      },
      sections: [
        {
          properties: {
            page: {
              size: { width: 12240, height: 15840 },
              margin: { top: 720, right: 225, bottom: 0, left: 225 },
            },
          },
          children: [
            new Table({
              width: { size: 11790, type: WidthType.DXA },
              columnWidths: [5760, 270, 5760],
              layout: TableLayoutType.FIXED,
              borders: NO_BORDERS,
              rows,
            }),
          ],
        },
      ],
    });

    return {
      buffer: await Packer.toBuffer(document),
      filename: `etiquetas-${slug(arrangement.layoutName)}-${slug(arrangement.name)}.docx`,
    };
  }

  private async labelCell(
    assignment: Assignment | null,
    arrangement: ArrangementDetail,
    width: number,
  ): Promise<TableCell> {
    if (!assignment) {
      return new TableCell({
        width: { size: width, type: WidthType.DXA },
        borders: NO_BORDERS,
        children: [new Paragraph('')],
      });
    }

    // Datos de la persona (sin el encabezado «IDENTIFICACIÓN · ASIENTO»).
    const details: Paragraph[] = [
      new Paragraph({
        spacing: { after: 35 },
        children: [
          new TextRun({
            text: assignment.person.fullName,
            bold: true,
            color: INK,
            size: 25,
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 25 },
        children: [
          new TextRun({
            text: assignment.person.position || 'Invitado(a)',
            color: MUTED,
            size: 17,
          }),
        ],
      }),
      ...(assignment.person.organization
        ? [
            new Paragraph({
              spacing: { after: 55 },
              children: [
                new TextRun({
                  text: assignment.person.organization,
                  color: MUTED,
                  size: 16,
                }),
              ],
            }),
          ]
        : []),
      new Paragraph({
        children: [
          new TextRun({
            text: `ASIENTO ${assignment.seatId}`,
            bold: true,
            color: WHITE,
            size: 20,
            shading: { fill: WINE, type: ShadingType.CLEAR },
          }),
          new TextRun({
            text: `   ${arrangement.layoutName} · ${arrangement.name}`,
            color: MUTED,
            size: 13,
          }),
        ],
      }),
    ];

    // Sólo se incluye la fotografía cuando la persona tiene una. Se eliminó el
    // recuadro con iniciales que se mostraba cuando no había foto.
    const photo = this.tryLoadPhoto(assignment);

    const labelTable = photo
      ? new Table({
          width: { size: 5400, type: WidthType.DXA },
          columnWidths: [1320, 4080],
          layout: TableLayoutType.FIXED,
          borders: NO_BORDERS,
          rows: [
            new TableRow({
              cantSplit: true,
              children: [
                new TableCell({
                  width: { size: 1320, type: WidthType.DXA },
                  verticalAlign: VerticalAlign.CENTER,
                  borders: NO_BORDERS,
                  margins: { top: 80, bottom: 80, left: 60, right: 60 },
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [
                        new ImageRun({
                          data: photo.data,
                          type: photo.mime === 'image/png' ? 'png' : 'jpg',
                          transformation: { width: 78, height: 94 },
                        }),
                      ],
                    }),
                  ],
                }),
                new TableCell({
                  width: { size: 4080, type: WidthType.DXA },
                  verticalAlign: VerticalAlign.CENTER,
                  borders: NO_BORDERS,
                  margins: { top: 40, bottom: 40, left: 170, right: 40 },
                  children: details,
                }),
              ],
            }),
          ],
        })
      : new Table({
          width: { size: 5400, type: WidthType.DXA },
          columnWidths: [5400],
          layout: TableLayoutType.FIXED,
          borders: NO_BORDERS,
          rows: [
            new TableRow({
              cantSplit: true,
              children: [
                new TableCell({
                  width: { size: 5400, type: WidthType.DXA },
                  verticalAlign: VerticalAlign.CENTER,
                  borders: NO_BORDERS,
                  margins: { top: 40, bottom: 40, left: 120, right: 60 },
                  children: details,
                }),
              ],
            }),
          ],
        });

    return new TableCell({
      width: { size: width, type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      borders: NO_BORDERS,
      margins: { top: 100, bottom: 100, left: 100, right: 100 },
      children: [labelTable],
    });
  }

  private tryLoadPhoto(
    assignment: Assignment,
  ): { data: Buffer; mime: string } | null {
    if (!assignment.person.photoUrl) return null;
    try {
      const photo = this.people.getPhoto(assignment.personId);
      return { data: photo.data, mime: photo.mime };
    } catch {
      return null;
    }
  }
}

function headerCell(text: string, width: number): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { fill: WINE, type: ShadingType.CLEAR },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 100, bottom: 100, left: 90, right: 90 },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text, bold: true, color: WHITE, size: 17 })],
      }),
    ],
  });
}

function bodyCell(
  text: string,
  width: number,
  alignment: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT,
  bold = false,
): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 90, bottom: 90, left: 90, right: 90 },
    children: [
      new Paragraph({
        alignment,
        children: [new TextRun({ text, bold, color: INK, size: 17 })],
      }),
    ],
  });
}

function sortedAssignments(assignments: Assignment[]): Assignment[] {
  return [...assignments].sort((a, b) =>
    a.seatId.localeCompare(b.seatId, 'es', { numeric: true, sensitivity: 'base' }),
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Mexico_City',
  }).format(new Date(value));
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
