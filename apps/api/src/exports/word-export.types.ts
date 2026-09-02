export interface ExportPerson {
  id: string;
  fullName: string;
  position: string;
  organization: string;
  email: string;
  notes: string;
  active: boolean;
  photoUrl: string | null;
}

export interface Assignment {
  id: string;
  seatId: string;
  personId: string;
  createdAt: string;
  updatedAt: string;
  person: ExportPerson;
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
  definition: {
    groups: Array<{ rows: number; columns: number }>;
  };
  assignments: Assignment[];
}
