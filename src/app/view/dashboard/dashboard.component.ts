import { AfterViewInit, Component, ElementRef, computed, inject, signal, ViewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import gsap from 'gsap';
import { AuthenticationService } from '../../services/authentication.service';
import { VacanciesService } from '../../services/vacancies.service';
import { PersonasService } from '../../services/personas.service';
import { assessCompliance } from '../../services/compliance.service';
import { jobDetailUrl } from '../../consts/routes.consts';
import { Vacancy } from '../../models/vacancy.model';

export type DashboardViewMode = 'both' | 'philip' | 'chiara';

const PAGE_SIZE = 10;

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements AfterViewInit {
  @ViewChild('board') board!: ElementRef<HTMLElement>;

  authenticationService = inject(AuthenticationService);
  private vacanciesService = inject(VacanciesService);
  private personasService = inject(PersonasService);

  jobDetailUrl = jobDetailUrl;
  assessCompliance = assessCompliance;

  philip$ = this.personasService.getPersona('philip');
  chiara$ = this.personasService.getPersona('chiara');
  philipVacancies$ = this.vacanciesService.getMatchedVacancies('philip');
  chiaraVacancies$ = this.vacanciesService.getMatchedVacancies('chiara');

  private philipVacancies = toSignal(this.philipVacancies$, { initialValue: [] as Vacancy[] });
  private chiaraVacancies = toSignal(this.chiaraVacancies$, { initialValue: [] as Vacancy[] });

  viewMode = signal<DashboardViewMode>('both');
  // Whole percentage points (0-100) — jobs below this match score are
  // filtered out entirely, ahead of pagination.
  minMatchScore = signal(0);
  philipPage = signal(1);
  chiaraPage = signal(1);

  private philipFiltered = computed(() =>
    this.philipVacancies().filter((v) => (v.matchScore ?? 0) * 100 >= this.minMatchScore())
  );
  private chiaraFiltered = computed(() =>
    this.chiaraVacancies().filter((v) => (v.matchScore ?? 0) * 100 >= this.minMatchScore())
  );

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

  setPhilipPage(page: number) {
    this.philipPage.set(Math.min(Math.max(1, page), this.philipTotalPages()));
  }

  setChiaraPage(page: number) {
    this.chiaraPage.set(Math.min(Math.max(1, page), this.chiaraTotalPages()));
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
