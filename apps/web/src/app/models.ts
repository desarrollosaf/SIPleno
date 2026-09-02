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

export interface LayoutSummary {
  id: string;
  name: string;
  description: string;
  seatCount: number;
  definition: SeatLayoutDefinition;
}

export interface Person {
  id: string;
  fullName: string;
  position: string;
  organization: string;
  email: string;
  notes: string;
  photoUrl: string | null;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Assignment {
  id: string;
  seatId: string;
  personId: string;
  person: Person;
  createdAt: string;
  updatedAt: string;
}

export interface ArrangementSummary {
  id: string;
  name: string;
  description: string;
  layoutId: string;
  layoutName: string;
  seatCount: number;
  assignmentCount: number;
  sourceArrangementId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ArrangementDetail {
  id: string;
  name: string;
  description: string;
  layoutId: string;
  layoutName: string;
  sourceArrangementId: string | null;
  createdAt: string;
  updatedAt: string;
  definition: SeatLayoutDefinition;
  assignments: Assignment[];
}

export interface PersonPayload {
  fullName: string;
  position: string;
  organization: string;
  email: string;
  notes: string;
}

export interface ImportPeopleResult {
  created: number;
  skipped: number;
  total: number;
  errors: string[];
}
