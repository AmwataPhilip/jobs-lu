import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApplicationsService } from '../../services/applications.service';
import { VacanciesService } from '../../services/vacancies.service';
import { ApplicationStatus, JobApplication } from '../../models/application.model';
import { Vacancy } from '../../models/vacancy.model';
import { PersonaId } from '../../models/persona.model';
import { jobDetailUrl } from '../../consts/routes.consts';

type StatusFilter = ApplicationStatus | 'all';
type PersonaFilter = 'both' | PersonaId;

interface ApplicationRow {
  application: JobApplication;
  vacancyTitle: string;
  vacancyEmployer: string;
  lastUpdatedMillis: number;
}

const PAGE_SIZE = 15;

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  'draft',
  'reviewed',
  'submitted',
  'interviewing',
  'offer',
  'rejected',
  'withdrawn',
];

@Component({
  selector: 'app-applications',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './applications.component.html',
})
export class ApplicationsComponent {
  private applicationsService = inject(ApplicationsService);
  private vacanciesService = inject(VacanciesService);

  jobDetailUrl = jobDetailUrl;
  statuses = APPLICATION_STATUSES;

  private applications = toSignal(this.applicationsService.getAllApplications(), {
    initialValue: [] as JobApplication[],
  });
  private vacancies = toSignal(this.vacanciesService.getAllVacancies(), {
    initialValue: [] as Vacancy[],
  });

  statusFilter = signal<StatusFilter>('all');
  personaFilter = signal<PersonaFilter>('both');
  page = signal(1);

  personaLabel(persona: PersonaId): string {
    return persona === 'philip' ? 'Philip' : 'Chiara';
  }

  statusLabel(status: ApplicationStatus): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  private rows = computed<ApplicationRow[]>(() => {
    const vacById = new Map(this.vacancies().map((v) => [v.jobId, v]));
    return this.applications().map((application) => {
      const vacancy = vacById.get(application.jobId);
      const lastEvent = application.statusHistory?.[application.statusHistory.length - 1];
      return {
        application,
        vacancyTitle: vacancy?.title ?? application.jobId,
        vacancyEmployer: vacancy?.employer ?? '—',
        lastUpdatedMillis: lastEvent ? lastEvent.changedAt.toMillis() : 0,
      };
    });
  });

  private filtered = computed(() => {
    let rows = this.rows();
    const status = this.statusFilter();
    if (status !== 'all') {
      rows = rows.filter((r) => r.application.status === status);
    }
    const persona = this.personaFilter();
    if (persona !== 'both') {
      rows = rows.filter((r) => r.application.persona === persona);
    }
    return [...rows].sort((a, b) => b.lastUpdatedMillis - a.lastUpdatedMillis);
  });

  totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / PAGE_SIZE)));
  pageItems = computed(() => {
    const page = Math.min(this.page(), this.totalPages());
    return this.filtered().slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  });

  setStatusFilter(value: string) {
    this.statusFilter.set(value as StatusFilter);
    this.page.set(1);
  }

  setPersonaFilter(value: PersonaFilter) {
    this.personaFilter.set(value);
    this.page.set(1);
  }

  setPage(page: number) {
    this.page.set(Math.min(Math.max(1, page), this.totalPages()));
  }
}
