import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  ArrangementDetail,
  ArrangementSummary,
  ImportPeopleResult,
  LayoutSummary,
  Person,
  PersonPayload,
} from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl =
    window.location.port === '4200'
      ? `${window.location.protocol}//${window.location.hostname}:3000/api`
      : new URL('api', document.baseURI).toString();

  getLayouts() {
    return this.http.get<LayoutSummary[]>(`${this.baseUrl}/layouts`);
  }

  getPeople(search = '') {
    const params = search ? new HttpParams().set('search', search) : undefined;
    return this.http.get<Person[]>(`${this.baseUrl}/people`, { params });
  }

  createPerson(payload: PersonPayload) {
    return this.http.post<Person>(`${this.baseUrl}/people`, payload);
  }

  updatePerson(id: string, payload: Partial<PersonPayload>) {
    return this.http.patch<Person>(`${this.baseUrl}/people/${id}`, payload);
  }

  archivePerson(id: string) {
    return this.http.delete<Person>(`${this.baseUrl}/people/${id}`);
  }

  importPeople(content: string) {
    return this.http.post<ImportPeopleResult>(`${this.baseUrl}/people/import`, {
      content,
    });
  }

  deleteAllPeople() {
    return this.http.delete<{ deleted: number }>(`${this.baseUrl}/people`);
  }

  uploadPersonPhoto(id: string, photo: File) {
    const form = new FormData();
    form.append('photo', photo);
    return this.http.post<Person>(`${this.baseUrl}/people/${id}/photo`, form);
  }

  resolveAssetUrl(path: string | null): string | null {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    return new URL(path, `${this.baseUrl}/`).toString();
  }

  getArrangements() {
    return this.http.get<ArrangementSummary[]>(`${this.baseUrl}/arrangements`);
  }

  getArrangement(id: string) {
    return this.http.get<ArrangementDetail>(`${this.baseUrl}/arrangements/${id}`);
  }

  createArrangement(payload: { name: string; description: string; layoutId: string }) {
    return this.http.post<ArrangementDetail>(`${this.baseUrl}/arrangements`, payload);
  }

  duplicateArrangement(id: string, payload: { name: string; description?: string }) {
    return this.http.post<ArrangementDetail>(
      `${this.baseUrl}/arrangements/${id}/duplicate`,
      payload,
    );
  }

  updateArrangement(id: string, payload: { name?: string; description?: string }) {
    return this.http.patch<ArrangementDetail>(`${this.baseUrl}/arrangements/${id}`, payload);
  }

  deleteArrangement(id: string) {
    return this.http.delete<{ deleted: boolean }>(`${this.baseUrl}/arrangements/${id}`);
  }

  assignPerson(arrangementId: string, seatId: string, personId: string) {
    return this.http.put<ArrangementDetail>(
      `${this.baseUrl}/arrangements/${arrangementId}/assignments/${seatId}`,
      { personId },
    );
  }

  unassignSeat(arrangementId: string, seatId: string) {
    return this.http.delete<ArrangementDetail>(
      `${this.baseUrl}/arrangements/${arrangementId}/assignments/${seatId}`,
    );
  }

  clearArrangement(arrangementId: string) {
    return this.http.delete<ArrangementDetail>(
      `${this.baseUrl}/arrangements/${arrangementId}/assignments`,
    );
  }

  downloadExport(arrangementId: string, kind: 'word' | 'labels' | 'pdf') {
    return this.http.get(
      `${this.baseUrl}/arrangements/${arrangementId}/exports/${kind}`,
      { responseType: 'blob' },
    );
  }
}
