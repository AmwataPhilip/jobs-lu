import { AfterViewInit, Component, ElementRef, computed, effect, inject, signal, ViewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import gsap from 'gsap';
import { AuthenticationService } from '../../services/authentication.service';
import { VacanciesService } from '../../services/vacancies.service';
import { PersonasService } from '../../services/personas.service';
import { VacancyActionsService } from '../../services/vacancy-actions.service';
import { assessCompliance } from '../../services/compliance.service';
import { ComplianceAssessment } from '../../models/compliance.model';
import { jobDetailUrl } from '../../consts/routes.consts';
import { Vacancy, personaScore } from '../../models/vacancy.model';
import { PersonaId } from '../../models/persona.model';
import { AppHeaderComponent } from '../../components/app-header/app-header.component';

export type DashboardViewMode = 'both' | 'philip' | 'chiara';

const PAGE_SIZE = 10;
// How long an armed "Delete" stays armed before auto-disarming, so a job
// armed and then forgotten can't be deleted by a later stray click.
const DELETE_CONFIRM_WINDOW_MS = 4000;
// Jobs below this are moved to the "Other matches" page instead of the main
// ledger — they're still worth surfacing (salary/shortage/etc. can outweigh
// a middling embedding similarity score), just not mixed into the primary,
// match-score-ranked list. See other-matches.component.ts.
export type DashboardSortKey =
  | 'matchScoreDesc'
  | 'matchScoreAsc'
  | 'matchedAtDesc'
  | 'postedAtDesc'
  | 'salaryDesc'
  | 'complianceAsc';

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
  topMatchThreshold = TOP_MATCH_THRESHOLD;

  philip$ = this.personasService.getPersona('philip');
  chiara$ = this.personasService.getPersona('chiara');
  philipVacancies$ = this.vacanciesService.getMatchedVacancies('philip');
  chiaraVacancies$ = this.vacanciesService.getMatchedVacancies('chiara');

  private philipVacancies = toSignal(this.philipVacancies$, { initialValue: [] as Vacancy[] });
  private chiaraVacancies = toSignal(this.chiaraVacancies$, { initialValue: [] as Vacancy[] });

  // A role can fit both people, so each person's query only returns the jobs
  // where they're the *primary* match. Pooling both queries (deduped) lets a
  // job where the other persona is primary still surface in this persona's
  // list when their own per-persona score clears the bar — see personaScore().
  private pool = computed<Vacancy[]>(() => {
    const byId = new Map<string, Vacancy>();
    for (const v of [...this.philipVacancies(), ...this.chiaraVacancies()]) {
      byId.set(v.jobId, v);
    }
    return Array.from(byId.values());
  });

  viewMode = signal<DashboardViewMode>('both');
  // Whole percentage points, floor-bounded to TOP_MATCH_THRESHOLD — narrows
  // further within the top-tier list already shown here (e.g. "≥90 only").
  // Sub-threshold jobs never reach this list to begin with.
  minMatchScore = signal(TOP_MATCH_THRESHOLD);
  sortBy = signal<DashboardSortKey>('matchScoreDesc');
  searchQuery = signal('');
  hideCcssRisk = signal(false);
  philipPage = signal(1);
  chiaraPage = signal(1);
  pendingDelete = signal<ReadonlySet<string>>(new Set());
  private deleteTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // assessCompliance is pure; cache by (rounded) telework percentage so the
  // template can call it per card without recomputing the same value.
  private complianceCache = new Map<number, ComplianceAssessment>();
  complianceFor(teleworkPercentageMax: number): ComplianceAssessment {
    const key = Math.round(teleworkPercentageMax ?? 0);
    let cached = this.complianceCache.get(key);
    if (!cached) {
      cached = assessCompliance(key);
      this.complianceCache.set(key, cached);
    }
    return cached;
  }

  scoreFor(job: Vacancy, persona: PersonaId): number {
    return personaScore(job, persona) ?? 0;
  }

  private matchesSearch(v: Vacancy, query: string): boolean {
    if (!query) {
      return true;
    }
    const haystack = `${v.title} ${v.employer} ${v.extractedSkillLabels.join(' ')}`.toLowerCase();
    return haystack.includes(query);
  }

  private sortVacancies(list: Vacancy[], sort: DashboardSortKey, persona: PersonaId): Vacancy[] {
    return [...list].sort((a, b) => {
      switch (sort) {
        case 'matchScoreAsc':
          return this.scoreFor(a, persona) - this.scoreFor(b, persona);
        case 'matchedAtDesc': {
          const timeA = a.matchedAt ? a.matchedAt.toMillis() : 0;
          const timeB = b.matchedAt ? b.matchedAt.toMillis() : 0;
          return timeB - timeA;
        }
        case 'postedAtDesc': {
          const timeA = a.postedAt ? a.postedAt.toMillis() : 0;
          const timeB = b.postedAt ? b.postedAt.toMillis() : 0;
          return timeB - timeA;
        }
        case 'salaryDesc':
          return (b.estimatedSalary ?? 0) - (a.estimatedSalary ?? 0);
        case 'complianceAsc':
          // Lowest cross-border remote-day exposure first (safest).
          return (
            this.complianceFor(a.location.teleworkPercentageMax).estimatedAnnualRemoteDays -
            this.complianceFor(b.location.teleworkPercentageMax).estimatedAnnualRemoteDays
          );
        case 'matchScoreDesc':
        default:
          return this.scoreFor(b, persona) - this.scoreFor(a, persona);
      }
    });
  }

  private filterFor(persona: PersonaId): Vacancy[] {
    const query = this.searchQuery().trim().toLowerCase();
    const hideRisk = this.hideCcssRisk();
    const filtered = this.pool().filter((v) => {
      const score = this.scoreFor(v, persona) * 100;
      if (score < TOP_MATCH_THRESHOLD || score < this.minMatchScore()) {
        return false;
      }
      if (!this.matchesSearch(v, query)) {
        return false;
      }
      if (hideRisk && this.complianceFor(v.location.teleworkPercentageMax).ccssRisk === 'high') {
        return false;
      }
      return true;
    });
    return this.sortVacancies(filtered, this.sortBy(), persona);
  }

  private philipFiltered = computed(() => this.filterFor('philip'));
  private chiaraFiltered = computed(() => this.filterFor('chiara'));

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

  private rowsAnimated = false;

  constructor() {
    // Animate the job rows in once, when the first results actually arrive —
    // the async lists start empty, so animating at view-init would stagger
    // placeholder nodes rather than real cards.
    effect(() => {
      const hasRows = this.philipPageItems().length > 0 || this.chiaraPageItems().length > 0;
      if (hasRows && !this.rowsAnimated && this.board) {
        this.rowsAnimated = true;
        requestAnimationFrame(() => {
          const rows = this.board.nativeElement.querySelectorAll('a[data-job-row]');
          if (rows.length > 0) {
            gsap.from(rows, { opacity: 0, y: 8, duration: 0.3, stagger: 0.04, ease: 'power2.out' });
          }
        });
      }
    });
  }

  setViewMode(mode: DashboardViewMode) {
    this.viewMode.set(mode);
  }

  setMinMatchScore(value: string | number) {
    this.minMatchScore.set(Number(value));
    this.resetPages();
  }

  setSortBy(sort: string) {
    this.sortBy.set(sort as DashboardSortKey);
    this.resetPages();
  }

  setSearchQuery(value: string) {
    this.searchQuery.set(value);
    this.resetPages();
  }

  setHideCcssRisk(value: boolean) {
    this.hideCcssRisk.set(value);
    this.resetPages();
  }

  private resetPages() {
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
  // there's no native dialog in this UI and the action is irreversible. An
  // armed job auto-disarms after a few seconds so it can't be deleted later
  // by accident.
  isPendingDelete(jobId: string): boolean {
    return this.pendingDelete().has(jobId);
  }

  private disarmDelete(jobId: string) {
    const timer = this.deleteTimers.get(jobId);
    if (timer) {
      clearTimeout(timer);
      this.deleteTimers.delete(jobId);
    }
    if (this.pendingDelete().has(jobId)) {
      const next = new Set(this.pendingDelete());
      next.delete(jobId);
      this.pendingDelete.set(next);
    }
  }

  deleteJob(jobId: string, event: Event) {
    event.stopPropagation();
    event.preventDefault();
    if (this.pendingDelete().has(jobId)) {
      this.disarmDelete(jobId);
      this.vacancyActions.delete(jobId);
    } else {
      this.pendingDelete.set(new Set(this.pendingDelete()).add(jobId));
      this.deleteTimers.set(
        jobId,
        setTimeout(() => this.disarmDelete(jobId), DELETE_CONFIRM_WINDOW_MS)
      );
    }
  }

  ngAfterViewInit() {
    // Panels slide in immediately; rows animate separately once data lands
    // (see the effect in the constructor).
    gsap.from(this.board.nativeElement.children, {
      opacity: 0,
      y: 12,
      duration: 0.4,
      stagger: 0.08,
      ease: 'power2.out',
    });
  }
}
