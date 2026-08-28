import { AfterViewInit, Component, ElementRef, computed, inject, signal, ViewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import gsap from 'gsap';
import { AuthenticationService } from '../../services/authentication.service';
import { VacanciesService } from '../../services/vacancies.service';
import { PersonasService } from '../../services/personas.service';
import { VacancyActionsService } from '../../services/vacancy-actions.service';
import { assessCompliance } from '../../services/compliance.service';
import { jobDetailUrl } from '../../consts/routes.consts';
import { Vacancy } from '../../models/vacancy.model';
import { AppHeaderComponent } from '../../components/app-header/app-header.component';

export type DashboardViewMode = 'both' | 'philip' | 'chiara';

const PAGE_SIZE = 10;
// Jobs below this are moved to the "Other matches" page instead of the main
// ledger — they're still worth surfacing (salary/shortage/etc. can outweigh
// a middling embedding similarity score), just not mixed into the primary,
// match-score-ranked list. See other-matches.component.ts.
export type DashboardSortKey = 'matchScoreDesc' | 'matchScoreAsc' | 'postedAtDesc' | 'salaryDesc';

export const TOP_MATCH_THRESHOLD = 70;

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, AppHeaderComponent],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements AfterViewInit {
  @ViewChild('board') board!: ElementRef<HTMLElement>;

  authenticationService = inject(AuthenticationService);
  private vacanciesService = inject(VacanciesService);
  private personasService = inject(PersonasService);
  private vacancyActions = inject(VacancyActionsService);

  jobDetailUrl = jobDetailUrl;
  assessCompliance = assessCompliance;

  philip$ = this.personasService.getPersona('philip');
  chiara$ = this.personasService.getPersona('chiara');
  philipVacancies$ = this.vacanciesService.getMatchedVacancies('philip');
  chiaraVacancies$ = this.vacanciesService.getMatchedVacancies('chiara');

  private philipVacancies = toSignal(this.philipVacancies$, { initialValue: [] as Vacancy[] });
  private chiaraVacancies = toSignal(this.chiaraVacancies$, { initialValue: [] as Vacancy[] });

  viewMode = signal<DashboardViewMode>('both');
  // Whole percentage points, floor-bounded to TOP_MATCH_THRESHOLD — narrows
  // further within the top-tier list already shown here (e.g. "≥90 only").
  // Sub-threshold jobs never reach this list to begin with.
  minMatchScore = signal(TOP_MATCH_THRESHOLD);
  sortBy = signal<DashboardSortKey>('matchScoreDesc');
  searchQuery = signal('');
  philipPage = signal(1);
  chiaraPage = signal(1);
  pendingDelete = signal<ReadonlySet<string>>(new Set());

  private matchesSearch(v: Vacancy, query: string): boolean {
    if (!query) {
      return true;
    }
    const haystack = `${v.title} ${v.employer} ${v.extractedSkillLabels.join(' ')}`.toLowerCase();
    return haystack.includes(query);
  }

  private sortVacancies(list: Vacancy[], sort: DashboardSortKey): Vacancy[] {
    return [...list].sort((a, b) => {
      switch (sort) {
        case 'matchScoreAsc':
          return (a.matchScore ?? 0) - (b.matchScore ?? 0);
        case 'postedAtDesc': {
          const timeA = a.postedAt ? a.postedAt.toMillis() : 0;
          const timeB = b.postedAt ? b.postedAt.toMillis() : 0;
          return timeB - timeA;
        }
        case 'salaryDesc':
          return (b.estimatedSalary ?? 0) - (a.estimatedSalary ?? 0);
        case 'matchScoreDesc':
        default:
          return (b.matchScore ?? 0) - (a.matchScore ?? 0);
      }
    });
  }

  private philipFiltered = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const filtered = this.philipVacancies().filter(
      (v) =>
        (v.matchScore ?? 0) * 100 >= TOP_MATCH_THRESHOLD &&
        (v.matchScore ?? 0) * 100 >= this.minMatchScore() &&
        this.matchesSearch(v, query)
    );
    return this.sortVacancies(filtered, this.sortBy());
  });
  private chiaraFiltered = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const filtered = this.chiaraVacancies().filter(
      (v) =>
        (v.matchScore ?? 0) * 100 >= TOP_MATCH_THRESHOLD &&
        (v.matchScore ?? 0) * 100 >= this.minMatchScore() &&
        this.matchesSearch(v, query)
    );
    return this.sortVacancies(filtered, this.sortBy());
  });

  philipTotalPages = computed(() => Math.max(1, Math.ceil(this.philipFiltered().length / PAGE_SIZE)));
  chiaraTotalPages = computed(() => Math.max(1, Math.ceil(this.chiaraFiltered().length / PAGE_SIZE)));

  philipPageItems = computed(() => {
    const page = Math.min(this.philipPage(), this.philipTotalPages());
    return this.philipFiltered().slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  });
  chiaraPageItems = computed(() => {
    const page = Math.min(this.chiaraPage(), this.chiaraTotalPages());
    return this.chiaraFiltered().slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  });

  setViewMode(mode: DashboardViewMode) {
    this.viewMode.set(mode);
  }

  setMinMatchScore(value: string | number) {
    this.minMatchScore.set(Number(value));
    this.philipPage.set(1);
    this.chiaraPage.set(1);
  }

  setSortBy(sort: string) {
    this.sortBy.set(sort as DashboardSortKey);
    this.philipPage.set(1);
    this.chiaraPage.set(1);
  }

  setSearchQuery(value: string) {
    this.searchQuery.set(value);
    this.philipPage.set(1);
    this.chiaraPage.set(1);
  }

  setPhilipPage(page: number) {
    this.philipPage.set(Math.min(Math.max(1, page), this.philipTotalPages()));
  }

  setChiaraPage(page: number) {
    this.chiaraPage.set(Math.min(Math.max(1, page), this.chiaraTotalPages()));
  }

  archiveJob(jobId: string, event: Event) {
    event.stopPropagation();
    event.preventDefault();
    this.vacancyActions.archive(jobId);
  }

  // Delete needs two clicks to fire — one to arm, one to confirm — since
  // there's no native dialog in this UI and the action is irreversible.
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

  ngAfterViewInit() {
    gsap.from(this.board.nativeElement.children, {
      opacity: 0,
      y: 12,
      duration: 0.4,
      stagger: 0.08,
      ease: 'power2.out',
    });
  }
}
