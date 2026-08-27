import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { VacanciesService } from '../../services/vacancies.service';
import { VacancyActionsService } from '../../services/vacancy-actions.service';
import { PersonaId } from '../../models/persona.model';
import { Vacancy } from '../../models/vacancy.model';
import { jobDetailUrl } from '../../consts/routes.consts';
import { TOP_MATCH_THRESHOLD } from '../dashboard/dashboard.component';

type TaggedVacancy = Vacancy & { persona: PersonaId };

export type OtherMatchesTab = 'other' | 'archived';
export type PersonaFilter = 'both' | 'philip' | 'chiara';
export type SortKey = 'postedAt' | 'deadline' | 'salary' | 'shortage';
export type DateWindow = 'any' | '7' | '30';

const PAGE_SIZE = 15;
const DAY_MS = 86400000;

@Component({
  selector: 'app-other-matches',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './other-matches.component.html',
})
export class OtherMatchesComponent {
  private vacanciesService = inject(VacanciesService);
  private vacancyActions = inject(VacancyActionsService);

  jobDetailUrl = jobDetailUrl;

  personaLabel(persona: PersonaId): string {
    return persona === 'philip' ? 'Philip' : 'Chiara';
  }

  private philipMatched = toSignal(this.vacanciesService.getMatchedVacancies('philip'), {
    initialValue: [] as Vacancy[],
  });
  private chiaraMatched = toSignal(this.vacanciesService.getMatchedVacancies('chiara'), {
    initialValue: [] as Vacancy[],
  });
  private philipArchived = toSignal(this.vacanciesService.getArchivedVacancies('philip'), {
    initialValue: [] as Vacancy[],
  });
  private chiaraArchived = toSignal(this.vacanciesService.getArchivedVacancies('chiara'), {
    initialValue: [] as Vacancy[],
  });

  tab = signal<OtherMatchesTab>('other');
  personaFilter = signal<PersonaFilter>('both');
  sortKey = signal<SortKey>('postedAt');
  postedWithin = signal<DateWindow>('any');
  deadlineWithin = signal<DateWindow>('any');
  searchQuery = signal('');
  page = signal(1);
  pendingDelete = signal<ReadonlySet<string>>(new Set());

  private tag(vacancies: Vacancy[], persona: PersonaId): TaggedVacancy[] {
    return vacancies.map((v) => ({ ...v, persona }));
  }

  // 'other' = matched/applied jobs below the dashboard's top-match threshold;
  // 'archived' = manually hidden jobs, kept here so they can be restored.
  private baseList = computed<TaggedVacancy[]>(() => {
    const onArchivedTab = this.tab() === 'archived';
    const philipSource = onArchivedTab ? this.philipArchived() : this.philipMatched();
    const chiaraSource = onArchivedTab ? this.chiaraArchived() : this.chiaraMatched();
    let combined = [...this.tag(philipSource, 'philip'), ...this.tag(chiaraSource, 'chiara')];
    if (!onArchivedTab) {
      combined = combined.filter((v) => (v.matchScore ?? 0) * 100 < TOP_MATCH_THRESHOLD);
    }
    const filter = this.personaFilter();
    if (filter !== 'both') {
      combined = combined.filter((v) => v.persona === filter);
    }
    const query = this.searchQuery().trim().toLowerCase();
    if (query) {
      combined = combined.filter((v) =>
        `${v.title} ${v.employer} ${v.extractedSkillLabels.join(' ')}`.toLowerCase().includes(query)
      );
    }
    return combined;
  });

  private filtered = computed(() => {
    let list = this.baseList();
    const postedWindow = this.postedWithin();
    if (postedWindow !== 'any') {
      const cutoff = Date.now() - Number(postedWindow) * DAY_MS;
      list = list.filter((v) => v.postedAt && v.postedAt.toMillis() >= cutoff);
    }
    const deadlineWindow = this.deadlineWithin();
    if (deadlineWindow !== 'any') {
      const now = Date.now();
      const cutoff = now + Number(deadlineWindow) * DAY_MS;
      list = list.filter(
        (v) => v.applicationDeadline && v.applicationDeadline.toMillis() >= now && v.applicationDeadline.toMillis() <= cutoff
      );
    }
    return list;
  });

  private sorted = computed(() => {
    const list = [...this.filtered()];
    switch (this.sortKey()) {
      case 'salary':
        return list.sort((a, b) => (b.estimatedSalary ?? -Infinity) - (a.estimatedSalary ?? -Infinity));
      case 'shortage':
        return list.sort(
          (a, b) => Number(Boolean(b.shortageOccupationMatch)) - Number(Boolean(a.shortageOccupationMatch))
        );
      case 'deadline':
        return list.sort(
          (a, b) => (a.applicationDeadline?.toMillis() ?? Infinity) - (b.applicationDeadline?.toMillis() ?? Infinity)
        );
      case 'postedAt':
      default:
        return list.sort((a, b) => (b.postedAt?.toMillis() ?? 0) - (a.postedAt?.toMillis() ?? 0));
    }
  });

  totalPages = computed(() => Math.max(1, Math.ceil(this.sorted().length / PAGE_SIZE)));
  pageItems = computed(() => {
    const page = Math.min(this.page(), this.totalPages());
    return this.sorted().slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  });

  setTab(tab: OtherMatchesTab) {
    this.tab.set(tab);
    this.page.set(1);
  }

  setPersonaFilter(filter: PersonaFilter) {
    this.personaFilter.set(filter);
    this.page.set(1);
  }

  setSortKey(key: string) {
    this.sortKey.set(key as SortKey);
    this.page.set(1);
  }

  setPostedWithin(value: string) {
    this.postedWithin.set(value as DateWindow);
    this.page.set(1);
  }

  setDeadlineWithin(value: string) {
    this.deadlineWithin.set(value as DateWindow);
    this.page.set(1);
  }

  setSearchQuery(value: string) {
    this.searchQuery.set(value);
    this.page.set(1);
  }

  setPage(page: number) {
    this.page.set(Math.min(Math.max(1, page), this.totalPages()));
  }

  archiveJob(jobId: string, event: Event) {
    event.stopPropagation();
    event.preventDefault();
    this.vacancyActions.archive(jobId);
  }

  restoreJob(jobId: string, event: Event) {
    event.stopPropagation();
    event.preventDefault();
    this.vacancyActions.restore(jobId);
  }

  isPendingDelete(jobId: string): boolean {
    return this.pendingDelete().has(jobId);
  }

  deleteJob(jobId: string, event: Event) {
    event.stopPropagation();
    event.preventDefault();
    if (this.pendingDelete().has(jobId)) {
      this.vacancyActions.delete(jobId);
      const next = new Set(this.pendingDelete());
      next.delete(jobId);
      this.pendingDelete.set(next);
    } else {
      this.pendingDelete.set(new Set(this.pendingDelete()).add(jobId));
    }
  }
}
