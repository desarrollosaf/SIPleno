import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import type {
  ArrangementDetail,
  ArrangementSummary,
  Assignment,
  ImportPeopleResult,
  LayoutSummary,
  Person,
  PersonPayload,
  SeatGroupDefinition,
} from './models';

type PersonDialogMode = 'create' | 'edit';
type VersionDialogMode = 'duplicate' | 'new' | 'edit';
type ToastKind = 'success' | 'error' | 'info';

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly api = inject(ApiService);

  readonly layouts = signal<LayoutSummary[]>([]);
  readonly people = signal<Person[]>([]);
  readonly arrangements = signal<ArrangementSummary[]>([]);
  readonly arrangement = signal<ArrangementDetail | null>(null);
  readonly selectedLayoutId = signal('');
  readonly selectedPersonId = signal<string | null>(null);
  readonly selectedSeatId = signal<string | null>(null);
  readonly searchTerm = signal('');
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly zoom = signal(0.72);
  readonly toast = signal<{ message: string; kind: ToastKind } | null>(null);
  readonly personDialog = signal<PersonDialogMode | null>(null);
  readonly versionDialog = signal<VersionDialogMode | null>(null);
  readonly historyOpen = signal(false);
  readonly importOpen = signal(false);
  readonly importResult = signal<ImportPeopleResult | null>(null);
  readonly photoDragging = signal(false);

  personForm: PersonPayload = this.emptyPersonForm();
  versionForm = { name: '', description: '', layoutId: '' };
  personPhotoFile: File | null = null;
  personPhotoPreview: string | null = null;
  importContent = '';
  importFileName: string | null = null;
  private editingPersonId: string | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  readonly assignmentBySeat = computed(() => {
    const index = new Map<string, Assignment>();
    for (const assignment of this.arrangement()?.assignments || []) {
      index.set(assignment.seatId, assignment);
    }
    return index;
  });

  readonly versionsForScenario = computed(() =>
    this.arrangements().filter(
      (version) => version.layoutId === this.selectedLayoutId(),
    ),
  );

  readonly assignedPersonIds = computed(() => {
    const ids = new Set<string>();
    for (const assignment of this.arrangement()?.assignments || []) {
      ids.add(assignment.personId);
    }
    return ids;
  });

  readonly filteredPeople = computed(() => {
    // Las personas ya asignadas en la versión actual se ocultan del directorio
    // y vuelven a aparecer al desasignarlas.
    const assigned = this.assignedPersonIds();
    const available = this.people().filter((person) => !assigned.has(person.id));
    const term = this.searchTerm().trim().toLocaleLowerCase('es');
    if (!term) return available;
    return available.filter((person) =>
      [person.fullName, person.position, person.organization]
        .join(' ')
        .toLocaleLowerCase('es')
        .includes(term),
    );
  });

  readonly selectedPerson = computed(
    () => this.people().find((person) => person.id === this.selectedPersonId()) || null,
  );

  readonly selectedSeatAssignment = computed(() => {
    const seatId = this.selectedSeatId();
    return seatId ? this.assignmentBySeat().get(seatId) || null : null;
  });

  readonly totalSeats = computed(() => {
    const definition = this.arrangement()?.definition;
    return (
      definition?.groups.reduce(
        (total, group) => total + group.rows * group.columns,
        0,
      ) || 0
    );
  });

  readonly availableSeats = computed(
    () => this.totalSeats() - (this.arrangement()?.assignments.length || 0),
  );

  async ngOnInit(): Promise<void> {
    await this.loadInitialData();
  }

  async loadInitialData(): Promise<void> {
    this.loading.set(true);
    try {
      const [layouts, people, arrangements] = await Promise.all([
        firstValueFrom(this.api.getLayouts()),
        firstValueFrom(this.api.getPeople()),
        firstValueFrom(this.api.getArrangements()),
      ]);
      this.layouts.set(layouts);
      this.people.set(people);
      this.arrangements.set(arrangements);
      const first = arrangements[0];
      this.selectedLayoutId.set(first?.layoutId || layouts[0]?.id || '');
      if (first) await this.loadArrangement(first.id);
    } catch (error) {
      this.showError(error, 'No fue posible conectar con la base de datos local.');
    } finally {
      this.loading.set(false);
    }
  }

  async loadArrangement(id: string): Promise<void> {
    this.busy.set(true);
    try {
      const arrangement = await firstValueFrom(this.api.getArrangement(id));
      this.arrangement.set(arrangement);
      this.selectedLayoutId.set(arrangement.layoutId);
      this.selectedPersonId.set(null);
      this.selectedSeatId.set(null);
    } catch (error) {
      this.showError(error, 'No fue posible abrir esta versión.');
    } finally {
      this.busy.set(false);
    }
  }

  async onArrangementChange(event: Event): Promise<void> {
    const id = (event.target as HTMLSelectElement).value;
    if (id) await this.loadArrangement(id);
  }

  async onScenarioChange(event: Event): Promise<void> {
    const layoutId = (event.target as HTMLSelectElement).value;
    this.selectedLayoutId.set(layoutId);
    const latest = this.versionsForScenario()[0];
    if (latest) await this.loadArrangement(latest.id);
  }

  selectPerson(person: Person): void {
    this.selectedPersonId.set(
      this.selectedPersonId() === person.id ? null : person.id,
    );
    this.selectedSeatId.set(null);
  }

  async handleSeat(seatId: string): Promise<void> {
    this.selectedSeatId.set(seatId);
    const occupied = this.assignmentBySeat().get(seatId);
    if (occupied) return;

    const personId = this.selectedPersonId();
    const arrangementId = this.arrangement()?.id;
    if (!personId) {
      this.notify('Seleccione una persona y después el asiento.', 'info');
      return;
    }
    if (!arrangementId || this.busy()) return;

    this.busy.set(true);
    try {
      const updated = await firstValueFrom(
        this.api.assignPerson(arrangementId, seatId, personId),
      );
      this.arrangement.set(updated);
      // La lista de versiones (fechas y conteos) se refresca en segundo plano
      // para no bloquear la asignación con una segunda petición.
      void this.refreshArrangementList();
      this.notify(`Asignación guardada en ${seatId}.`, 'success');
      this.selectedPersonId.set(null);
    } catch (error) {
      this.showError(error, 'No fue posible asignar el asiento.');
    } finally {
      this.busy.set(false);
    }
  }

  async unassignSelectedSeat(): Promise<void> {
    const arrangementId = this.arrangement()?.id;
    const seatId = this.selectedSeatId();
    if (!arrangementId || !seatId || !this.selectedSeatAssignment() || this.busy()) return;

    this.busy.set(true);
    try {
      const updated = await firstValueFrom(
        this.api.unassignSeat(arrangementId, seatId),
      );
      this.arrangement.set(updated);
      this.selectedSeatId.set(null);
      void this.refreshArrangementList();
      this.notify(`El asiento ${seatId} quedó disponible.`, 'success');
    } catch (error) {
      this.showError(error, 'No fue posible desasignar el asiento.');
    } finally {
      this.busy.set(false);
    }
  }

  openCreatePerson(): void {
    this.editingPersonId = null;
    this.personForm = this.emptyPersonForm();
    this.resetPersonPhoto();
    this.personDialog.set('create');
  }

  openEditPerson(person: Person): void {
    this.editingPersonId = person.id;
    this.selectedPersonId.set(person.id);
    this.personForm = {
      fullName: person.fullName,
      position: person.position,
      organization: person.organization,
      email: person.email,
      notes: person.notes,
    };
    this.resetPersonPhoto();
    this.personPhotoPreview = this.photoUrl(person);
    this.personDialog.set('edit');
  }

  async savePerson(): Promise<void> {
    if (this.personForm.fullName.trim().length < 2 || this.busy()) return;
    this.busy.set(true);
    try {
      let person = this.editingPersonId
        ? await firstValueFrom(
            this.api.updatePerson(this.editingPersonId, this.personForm),
          )
        : await firstValueFrom(this.api.createPerson(this.personForm));
      if (this.personPhotoFile) {
        person = await firstValueFrom(
          this.api.uploadPersonPhoto(person.id, this.personPhotoFile),
        );
      }
      await this.refreshPeople();
      const currentId = this.arrangement()?.id;
      if (currentId) {
        this.arrangement.set(await firstValueFrom(this.api.getArrangement(currentId)));
      }
      this.selectedPersonId.set(person.id);
      this.personDialog.set(null);
      this.resetPersonPhoto();
      this.notify(
        this.editingPersonId ? 'Persona actualizada.' : 'Persona agregada.',
        'success',
      );
    } catch (error) {
      this.showError(error, 'No fue posible guardar la persona.');
    } finally {
      this.busy.set(false);
    }
  }

  async archivePerson(person: Person): Promise<void> {
    if (
      this.busy() ||
      !window.confirm(`¿Archivar a ${person.fullName}? Sus versiones guardadas conservarán el registro.`)
    ) {
      return;
    }
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.archivePerson(person.id));
      await this.refreshPeople();
      if (this.selectedPersonId() === person.id) this.selectedPersonId.set(null);
      this.personDialog.set(null);
      this.notify('Persona archivada.', 'success');
    } catch (error) {
      this.showError(error, 'No fue posible archivar la persona.');
    } finally {
      this.busy.set(false);
    }
  }

  openImportDialog(): void {
    this.importContent = '';
    this.importFileName = null;
    this.importResult.set(null);
    this.importOpen.set(true);
  }

  async onImportFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] || null;
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      input.value = '';
      this.notify('El archivo CSV no puede superar 5 MB.', 'error');
      return;
    }
    try {
      this.importContent = await file.text();
      this.importFileName = file.name;
      this.importResult.set(null);
    } catch {
      this.notify('No fue posible leer el archivo.', 'error');
    }
  }

  async submitImport(): Promise<void> {
    const content = this.importContent.trim();
    if (!content || this.busy()) {
      if (!content) this.notify('Pegue o seleccione un CSV con al menos una persona.', 'info');
      return;
    }
    this.busy.set(true);
    try {
      const result = await firstValueFrom(this.api.importPeople(content));
      this.importResult.set(result);
      await this.refreshPeople();
      if (result.created > 0) {
        this.notify(
          `Se agregaron ${result.created} persona${result.created === 1 ? '' : 's'}.`,
          'success',
        );
      } else {
        this.notify('No se agregó ninguna persona. Revise el formato del CSV.', 'info');
      }
    } catch (error) {
      this.showError(error, 'No fue posible importar el archivo CSV.');
    } finally {
      this.busy.set(false);
    }
  }

  async deleteAllPeople(): Promise<void> {
    if (this.busy()) return;
    const total = this.people().length;
    if (total === 0) {
      this.notify('El directorio ya está vacío.', 'info');
      return;
    }
    if (
      !window.confirm(
        `¿Borrar las ${total} personas del directorio? También se eliminarán sus asignaciones en todas las versiones y sus fotografías. Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }
    this.busy.set(true);
    try {
      const { deleted } = await firstValueFrom(this.api.deleteAllPeople());
      await this.refreshPeople();
      this.selectedPersonId.set(null);
      this.selectedSeatId.set(null);
      const current = this.arrangement()?.id;
      if (current) {
        this.arrangement.set(await firstValueFrom(this.api.getArrangement(current)));
      }
      await this.refreshArrangementList();
      this.notify(`Se borraron ${deleted} persona${deleted === 1 ? '' : 's'}.`, 'success');
    } catch (error) {
      this.showError(error, 'No fue posible borrar el directorio.');
    } finally {
      this.busy.set(false);
    }
  }

  exportPeopleCsv(): void {
    const people = this.people();
    if (people.length === 0) {
      this.notify('No hay personas que exportar.', 'info');
      return;
    }
    const header = ['Nombre completo', 'Cargo', 'Institución', 'Correo', 'Notas'];
    const lines = [
      header.map(csvField).join(','),
      ...people.map((person) =>
        [person.fullName, person.position, person.organization, person.email, person.notes]
          .map(csvField)
          .join(','),
      ),
    ];
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `directorio-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.notify('Directorio exportado a CSV.', 'success');
  }

  openVersionDialog(mode: VersionDialogMode): void {
    const current = this.arrangement();
    const stamp = new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date());
    this.versionForm = {
      name:
        mode === 'duplicate'
          ? `${current?.name || 'Acomodo'} · ${stamp}`
          : mode === 'edit'
            ? current?.name || ''
            : `Nuevo acomodo · ${stamp}`,
      description: mode === 'edit' ? current?.description || '' : '',
      layoutId: current?.layoutId || this.selectedLayoutId() || this.layouts()[0]?.id || '',
    };
    this.versionDialog.set(mode);
  }

  async saveVersion(): Promise<void> {
    const mode = this.versionDialog();
    const current = this.arrangement();
    if (!mode || !this.versionForm.name.trim() || this.busy()) return;
    this.busy.set(true);
    try {
      let saved: ArrangementDetail;
      if (mode === 'duplicate' && current) {
        saved = await firstValueFrom(
          this.api.duplicateArrangement(current.id, {
            name: this.versionForm.name,
            description: this.versionForm.description,
          }),
        );
      } else if (mode === 'edit' && current) {
        saved = await firstValueFrom(
          this.api.updateArrangement(current.id, {
            name: this.versionForm.name,
            description: this.versionForm.description,
          }),
        );
      } else {
        saved = await firstValueFrom(
          this.api.createArrangement({
            name: this.versionForm.name,
            description: this.versionForm.description,
            layoutId: this.versionForm.layoutId,
          }),
        );
      }
      this.arrangement.set(saved);
      this.selectedLayoutId.set(saved.layoutId);
      await this.refreshArrangementList();
      this.versionDialog.set(null);
      this.selectedPersonId.set(null);
      this.selectedSeatId.set(null);
      this.notify(
        mode === 'edit' ? 'Versión actualizada.' : 'Nueva versión guardada.',
        'success',
      );
    } catch (error) {
      this.showError(error, 'No fue posible guardar la versión.');
    } finally {
      this.busy.set(false);
    }
  }

  async clearCurrentVersion(): Promise<void> {
    const current = this.arrangement();
    if (
      !current ||
      this.busy() ||
      !window.confirm(`¿Dejar vacía la versión “${current.name}”? Esta acción no afecta otras versiones.`)
    ) {
      return;
    }
    this.busy.set(true);
    try {
      const updated = await firstValueFrom(this.api.clearArrangement(current.id));
      this.arrangement.set(updated);
      this.selectedSeatId.set(null);
      await this.refreshArrangementList();
      this.notify('La versión quedó vacía.', 'success');
    } catch (error) {
      this.showError(error, 'No fue posible vaciar esta versión.');
    } finally {
      this.busy.set(false);
    }
  }

  async deleteCurrentVersion(): Promise<void> {
    const current = this.arrangement();
    if (
      !current ||
      this.busy() ||
      !window.confirm(`¿Eliminar la versión “${current.name}”?`)
    ) {
      return;
    }
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.deleteArrangement(current.id));
      const arrangements = await firstValueFrom(this.api.getArrangements());
      this.arrangements.set(arrangements);
      const next = arrangements.find(
        (version) => version.layoutId === current.layoutId,
      );
      if (next) await this.loadArrangement(next.id);
      this.notify('Versión eliminada.', 'success');
    } catch (error) {
      this.showError(error, 'No fue posible eliminar la versión.');
    } finally {
      this.busy.set(false);
    }
  }

  seatsForGroup(group: SeatGroupDefinition): string[] {
    return Array.from(
      { length: group.rows * group.columns },
      (_, index) => `${group.label}${group.start + index}`,
    );
  }

  initials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toLocaleUpperCase('es');
  }

  photoUrl(person: Person): string | null {
    return this.api.resolveAssetUrl(person.photoUrl);
  }

  onPersonPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] || null;
    if (!file) return;
    if (!this.applyPhotoFile(file)) input.value = '';
  }

  onPhotoDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    this.photoDragging.set(true);
  }

  onPhotoDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.photoDragging.set(false);
  }

  onPhotoDrop(event: DragEvent): void {
    event.preventDefault();
    this.photoDragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.applyPhotoFile(file);
  }

  /** Valida y adopta el archivo de foto. Devuelve true si fue aceptado. */
  private applyPhotoFile(file: File): boolean {
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      this.notify('Use una fotografía JPG o PNG de hasta 5 MB.', 'error');
      return false;
    }
    this.resetPersonPhoto();
    this.personPhotoFile = file;
    this.personPhotoPreview = URL.createObjectURL(file);
    return true;
  }

  async downloadExport(kind: 'word' | 'labels' | 'pdf'): Promise<void> {
    const current = this.arrangement();
    if (!current || this.busy()) return;
    this.busy.set(true);
    try {
      const blob = await firstValueFrom(this.api.downloadExport(current.id, kind));
      const extension = kind === 'pdf' ? 'pdf' : 'docx';
      const prefix =
        kind === 'labels' ? 'etiquetas' : kind === 'pdf' ? 'mapa-listado' : 'asientos';
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${prefix}-${this.fileSlug(current.name)}.${extension}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      const messages: Record<typeof kind, string> = {
        word: 'Listado Word generado.',
        labels: 'Etiquetas Word generadas.',
        pdf: 'PDF del mapa y listado generado.',
      };
      this.notify(messages[kind], 'success');
    } catch (error) {
      this.showError(error, 'No fue posible generar el documento.');
    } finally {
      this.busy.set(false);
    }
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  sourceVersionName(sourceId: string | null): string {
    if (!sourceId) return 'Versión inicial';
    return this.arrangements().find((version) => version.id === sourceId)?.name || 'Versión anterior';
  }

  zoomIn(): void {
    this.zoom.update((value) => Math.min(1.15, Number((value + 0.1).toFixed(2))));
  }

  zoomOut(): void {
    this.zoom.update((value) => Math.max(0.45, Number((value - 0.1).toFixed(2))));
  }

  closeDialogs(): void {
    this.personDialog.set(null);
    this.versionDialog.set(null);
    this.historyOpen.set(false);
    this.importOpen.set(false);
    this.importResult.set(null);
    this.importContent = '';
    this.importFileName = null;
    this.photoDragging.set(false);
    this.resetPersonPhoto();
  }

  private async refreshPeople(): Promise<void> {
    this.people.set(await firstValueFrom(this.api.getPeople()));
  }

  private async refreshArrangementList(): Promise<void> {
    this.arrangements.set(await firstValueFrom(this.api.getArrangements()));
  }

  private emptyPersonForm(): PersonPayload {
    return { fullName: '', position: '', organization: '', email: '', notes: '' };
  }

  private resetPersonPhoto(): void {
    if (this.personPhotoFile && this.personPhotoPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(this.personPhotoPreview);
    }
    this.personPhotoFile = null;
    this.personPhotoPreview = null;
  }

  private fileSlug(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'version';
  }

  private notify(message: string, kind: ToastKind): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast.set({ message, kind });
    this.toastTimer = setTimeout(() => this.toast.set(null), 3200);
  }

  private showError(error: unknown, fallback: string): void {
    let message = fallback;
    if (error instanceof HttpErrorResponse) {
      const apiMessage = error.error?.message as string | string[] | undefined;
      if (Array.isArray(apiMessage)) message = apiMessage.join(' ');
      else if (apiMessage) message = apiMessage;
    }
    this.notify(message, 'error');
  }
}

function csvField(value: string): string {
  const text = value ?? '';
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
