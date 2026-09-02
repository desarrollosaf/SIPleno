export interface SeatGroupDefinition {
  id: string;
  label: string;
  rows: number;
  columns: number;
  start: number;
  x: number;
  y: number;
}

export interface SeatLayoutDefinition {
  id: string;
  name: string;
  description: string;
  width: number;
  height: number;
  seatSize: number;
  gap: number;
  background: {
    asset: string;
    alt: string;
    x: number;
    y: number;
    width: number;
    height: number;
  };
  groups: SeatGroupDefinition[];
}

const plenoBackground = (x: number, y: number, width: number, height: number) => ({
  asset: 'assets/pleno.png',
  alt: 'Plano original del recinto',
  x,
  y,
  width,
  height,
});

const RAW_LAYOUT_DEFINITIONS: SeatLayoutDefinition[] = [
  {
    id: 'pleno-original',
    name: 'Pleno · configuración original',
    description: 'Distribución original de 129 lugares, con bloques laterales y filas superior e inferior.',
    width: 1320,
    height: 920,
    seatSize: 34,
    gap: 7,
    background: plenoBackground(490, 175, 700, 685),
    groups: [
      { id: 'A', label: 'A', rows: 8, columns: 4, start: 1, x: 40, y: 150 },
      { id: 'B', label: 'B', rows: 8, columns: 4, start: 33, x: 40, y: 535 },
      { id: 'C', label: 'C', rows: 7, columns: 1, start: 65, x: 245, y: 245 },
      { id: 'D', label: 'D', rows: 2, columns: 1, start: 72, x: 330, y: 155 },
      { id: 'E', label: 'E', rows: 2, columns: 1, start: 74, x: 330, y: 260 },
      { id: 'F', label: 'F', rows: 10, columns: 1, start: 76, x: 330, y: 365 },
      { id: 'G', label: 'G', rows: 2, columns: 1, start: 86, x: 410, y: 680 },
      { id: 'H', label: 'H', rows: 2, columns: 1, start: 88, x: 410, y: 785 },
      { id: 'I', label: 'I', rows: 1, columns: 20, start: 90, x: 485, y: 60 },
      { id: 'J', label: 'J', rows: 1, columns: 20, start: 110, x: 485, y: 872 },
    ],
  },
  {
    id: 'pleno-100',
    name: 'Pleno · configuración 100',
    description: 'Distribución original de 100 lugares.',
    width: 1320,
    height: 920,
    seatSize: 34,
    gap: 7,
    background: plenoBackground(500, 120, 710, 695),
    groups: [
      { id: 'A', label: 'A', rows: 8, columns: 3, start: 1, x: 30, y: 120 },
      { id: 'B', label: 'B', rows: 8, columns: 3, start: 25, x: 30, y: 515 },
      { id: 'C', label: 'C', rows: 27, columns: 1, start: 49, x: 205, y: 20 },
      { id: 'D', label: 'D', rows: 7, columns: 1, start: 76, x: 285, y: 105 },
      { id: 'E', label: 'E', rows: 2, columns: 1, start: 83, x: 365, y: 120 },
      { id: 'F', label: 'F', rows: 2, columns: 1, start: 85, x: 365, y: 245 },
      { id: 'G', label: 'G', rows: 10, columns: 1, start: 87, x: 365, y: 350 },
      { id: 'H', label: 'H', rows: 2, columns: 1, start: 97, x: 365, y: 765 },
      { id: 'I', label: 'I', rows: 2, columns: 1, start: 99, x: 445, y: 765 },
    ],
  },
  {
    id: 'pleno-90',
    name: 'Pleno · configuración 90',
    description: 'Distribución denominada “90” en el proyecto original; conserva sus 130 posiciones.',
    width: 1320,
    height: 920,
    seatSize: 34,
    gap: 7,
    background: plenoBackground(490, 175, 700, 685),
    groups: [
      { id: 'A', label: 'A', rows: 9, columns: 4, start: 1, x: 30, y: 105 },
      { id: 'B', label: 'B', rows: 9, columns: 4, start: 37, x: 30, y: 525 },
      { id: 'C', label: 'C', rows: 5, columns: 1, start: 73, x: 245, y: 185 },
      { id: 'D', label: 'D', rows: 4, columns: 1, start: 78, x: 245, y: 450 },
      { id: 'F', label: 'F', rows: 9, columns: 1, start: 82, x: 335, y: 285 },
      { id: 'I', label: 'I', rows: 1, columns: 20, start: 90, x: 485, y: 60 },
      { id: 'J', label: 'J', rows: 1, columns: 20, start: 110, x: 485, y: 872 },
    ],
  },
  {
    id: 'pleno-91',
    name: 'Pleno · configuración 91',
    description: 'Distribución denominada “91” en el proyecto original; conserva sus 131 posiciones.',
    width: 1320,
    height: 920,
    seatSize: 34,
    gap: 7,
    background: plenoBackground(490, 175, 700, 685),
    groups: [
      { id: 'A', label: 'A', rows: 9, columns: 4, start: 1, x: 30, y: 105 },
      { id: 'B', label: 'B', rows: 9, columns: 4, start: 37, x: 30, y: 525 },
      { id: 'C', label: 'C', rows: 2, columns: 1, start: 73, x: 245, y: 135 },
      { id: 'D', label: 'D', rows: 3, columns: 1, start: 75, x: 245, y: 285 },
      { id: 'E', label: 'E', rows: 3, columns: 1, start: 78, x: 245, y: 500 },
      { id: 'F', label: 'F', rows: 2, columns: 1, start: 81, x: 245, y: 715 },
      { id: 'G', label: 'G', rows: 9, columns: 1, start: 83, x: 335, y: 285 },
      { id: 'I', label: 'I', rows: 1, columns: 20, start: 92, x: 485, y: 60 },
      { id: 'J', label: 'J', rows: 1, columns: 20, start: 112, x: 485, y: 872 },
    ],
  },
  {
    id: 'gradas-40',
    name: 'Gradas · configuración 40',
    description: 'Mapa de gradas conservado del proyecto original, con ocho bloques de ocho lugares.',
    width: 1320,
    height: 920,
    seatSize: 34,
    gap: 7,
    background: plenoBackground(500, 120, 710, 695),
    groups: [
      { id: 'A', label: 'A', rows: 8, columns: 1, start: 1, x: 35, y: 90 },
      { id: 'B', label: 'B', rows: 8, columns: 1, start: 1, x: 125, y: 90 },
      { id: 'C', label: 'C', rows: 8, columns: 1, start: 1, x: 215, y: 90 },
      { id: 'D', label: 'D', rows: 8, columns: 1, start: 1, x: 305, y: 90 },
      { id: 'AA', label: 'AA', rows: 8, columns: 1, start: 9, x: 35, y: 505 },
      { id: 'BB', label: 'BB', rows: 8, columns: 1, start: 9, x: 125, y: 505 },
      { id: 'CC', label: 'CC', rows: 8, columns: 1, start: 9, x: 215, y: 505 },
      { id: 'DD', label: 'DD', rows: 8, columns: 1, start: 9, x: 305, y: 505 },
    ],
  },
  {
    id: 'salon-benito-juarez',
    name: 'Salón Benito Juárez',
    description: 'Plano y distribución del Salón Benito Juárez incluidos en el proyecto original.',
    width: 1320,
    height: 920,
    seatSize: 31,
    gap: 7,
    background: {
      asset: 'assets/salon-benito-juarez.png',
      alt: 'Plano original del Salón Benito Juárez',
      x: 0,
      y: 0,
      width: 1320,
      height: 920,
    },
    groups: [
      { id: 'A', label: 'A', rows: 6, columns: 1, start: 1, x: 175, y: 235 },
      { id: 'B', label: 'B', rows: 6, columns: 1, start: 1, x: 275, y: 235 },
      { id: 'C', label: 'C', rows: 6, columns: 1, start: 1, x: 375, y: 235 },
      { id: 'D', label: 'D', rows: 6, columns: 1, start: 1, x: 475, y: 235 },
      { id: 'E', label: 'E', rows: 6, columns: 1, start: 1, x: 575, y: 235 },
      { id: 'F', label: 'F', rows: 6, columns: 1, start: 1, x: 675, y: 235 },
      { id: 'G', label: 'G', rows: 6, columns: 1, start: 1, x: 775, y: 235 },
      { id: 'H', label: 'H', rows: 6, columns: 1, start: 1, x: 875, y: 235 },
      { id: 'I', label: 'I', rows: 5, columns: 1, start: 1, x: 975, y: 235 },
      { id: 'BB', label: 'BB', rows: 7, columns: 1, start: 7, x: 275, y: 580 },
      { id: 'CC', label: 'CC', rows: 7, columns: 1, start: 7, x: 375, y: 580 },
      { id: 'DD', label: 'DD', rows: 8, columns: 1, start: 7, x: 475, y: 540 },
      { id: 'EE', label: 'EE', rows: 3, columns: 1, start: 7, x: 575, y: 690 },
      { id: 'FF', label: 'FF', rows: 7, columns: 1, start: 7, x: 675, y: 580 },
      { id: 'HH', label: 'HH', rows: 5, columns: 1, start: 7, x: 875, y: 620 },
    ],
  },
];

export function layoutSeatIds(definition: SeatLayoutDefinition): string[] {
  return definition.groups.flatMap((group) =>
    Array.from(
      { length: group.rows * group.columns },
      (_, index) => `${group.label}${group.start + index}`,
    ),
  );
}

/**
 * Invierte las letras de los grupos de asientos dentro de cada nivel
 * (sencillas entre sí y dobles entre sí). Así, la que era la última letra pasa
 * a ser A: por ejemplo, en un escenario con A, B, C, D queda D→A, C→B, B→C, A→D.
 * Se conserva la geometría y la numeración de cada bloque.
 */
function reverseGroupLabels(layout: SeatLayoutDefinition): SeatLayoutDefinition {
  const tiers = new Map<number, Set<string>>();
  for (const group of layout.groups) {
    const length = group.label.length;
    if (!tiers.has(length)) tiers.set(length, new Set());
    tiers.get(length)!.add(group.label);
  }

  const mapping = new Map<string, string>();
  for (const labels of tiers.values()) {
    const ordered = [...labels].sort((a, b) => a.localeCompare(b, 'es'));
    const reversed = [...ordered].reverse();
    ordered.forEach((label, index) => mapping.set(label, reversed[index]));
  }

  return {
    ...layout,
    groups: layout.groups.map((group) => {
      const newLabel = mapping.get(group.label) ?? group.label;
      return { ...group, id: newLabel, label: newLabel };
    }),
  };
}

export const LAYOUT_DEFINITIONS: SeatLayoutDefinition[] =
  RAW_LAYOUT_DEFINITIONS.map(reverseGroupLabels);
