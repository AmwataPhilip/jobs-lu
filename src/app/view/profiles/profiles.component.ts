import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { PersonasService } from '../../services/personas.service';
import { VacanciesService } from '../../services/vacancies.service';
import { ApplicationsService } from '../../services/applications.service';
import { AuthenticationService } from '../../services/authentication.service';
import { PersonaId, Persona, CvBullet } from '../../models/persona.model';
import { Vacancy } from '../../models/vacancy.model';
import { JobApplication, ApplicationStatus } from '../../models/application.model';
import { jobDetailUrl } from '../../consts/routes.consts';
import { TOP_MATCH_THRESHOLD } from '../dashboard/dashboard.component';
import { annualizeSalary, formatAnnualSalary } from '../../utils/salary.util';

export type ProfileSectionTab = 'overview' | 'bullets' | 'matches' | 'applications';

@Component({
  selector: 'app-profiles',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './profiles.component.html',
})
export class ProfilesComponent implements OnInit {
  authenticationService = inject(AuthenticationService);
  private personasService = inject(PersonasService);
  private vacanciesService = inject(VacanciesService);
  private applicationsService = inject(ApplicationsService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  jobDetailUrl = jobDetailUrl;
  formatAnnualSalary = formatAnnualSalary;
  topMatchThreshold = TOP_MATCH_THRESHOLD;

  private philipPersona$ = this.personasService.getPersona('philip');
  private chiaraPersona$ = this.personasService.getPersona('chiara');

  philipPersona = toSignal(this.philipPersona$, { initialValue: undefined as Persona | undefined });
  chiaraPersona = toSignal(this.chiaraPersona$, { initialValue: undefined as Persona | undefined });

  private philipVacancies = toSignal(this.vacanciesService.getMatchedVacancies('philip'), {
    initialValue: [] as Vacancy[],
  });
  private chiaraVacancies = toSignal(this.vacanciesService.getMatchedVacancies('chiara'), {
    initialValue: [] as Vacancy[],
  });
  private allApplications = toSignal(this.applicationsService.getAllApplications(), {
    initialValue: [] as JobApplication[],
  });

  activePersonaId = signal<PersonaId>('philip');
  activeTab = signal<ProfileSectionTab>('overview');
  copiedBulletId = signal<string | null>(null);

  ngOnInit() {
    // Detect user email to auto-select persona
    const userEmail = this.authenticationService.user?.email?.toLowerCase();
    if (userEmail && userEmail.includes('chiara')) {
      this.activePersonaId.set('chiara');
    }

    // Query parameter override: ?persona=philip or ?persona=chiara
    this.route.queryParams.subscribe((params) => {
      const p = params['persona'];
      if (p === 'philip' || p === 'chiara') {
        this.activePersonaId.set(p);
      }
      const tab = params['tab'];
      if (tab && ['overview', 'bullets', 'matches', 'applications'].includes(tab)) {
        this.activeTab.set(tab as ProfileSectionTab);
      }
    });
  }

  setPersona(id: PersonaId) {
    this.activePersonaId.set(id);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { persona: id },
      queryParamsHandling: 'merge',
    });
  }

  setTab(tab: ProfileSectionTab) {
    this.activeTab.set(tab);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      queryParamsHandling: 'merge',
    });
  }

  statusLabel(status: ApplicationStatus): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  activePersona = computed<Persona | undefined>(() => {
    return this.activePersonaId() === 'philip' ? this.philipPersona() : this.chiaraPersona();
  });

  activeVacancies = computed<Vacancy[]>(() => {
    const list = this.activePersonaId() === 'philip' ? this.philipVacancies() : this.chiaraVacancies();
    return [...list].sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
  });

  topMatches = computed<Vacancy[]>(() => {
    return this.activeVacancies().filter(
      (v) => (v.matchScore ?? 0) * 100 >= this.topMatchThreshold
    );
  });

  activeApplications = computed<JobApplication[]>(() => {
    const persona = this.activePersonaId();
    return this.allApplications().filter((a) => a.persona === persona);
  });

  activeStats = computed(() => {
    const vacancies = this.activeVacancies();
    const apps = this.activeApplications();
    const bullets = this.activePersona()?.cvBullets || [];

    let scoreSum = 0;
    let scoreCount = 0;
    let topTierCount = 0;
    let shortageCount = 0;
    let teleworkCount = 0;

    for (const v of vacancies) {
      const score = (v.matchScore ?? 0) * 100;
      if (v.matchScore != null) {
        scoreSum += score;
        scoreCount++;
      }
      if (score >= this.topMatchThreshold) {
        topTierCount++;
      }
      if (v.shortageOccupationMatch) {
        shortageCount++;
      }
      if (v.location?.allowsTelework || (v.location?.teleworkPercentageMax ?? 0) > 0) {
        teleworkCount++;
      }
    }

    return {
      totalVacancies: vacancies.length,
      topTierCount,
      avgScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : 0,
      shortageCount,
      teleworkCount,
      applicationsCount: apps.length,
      submittedAppsCount: apps.filter((a) => ['submitted', 'interviewing', 'offer'].includes(a.status)).length,
      bulletsCount: bullets.length,
    };
  });

  copyBulletText(bullet: CvBullet) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(bullet.text).then(() => {
        this.copiedBulletId.set(bullet.id);
        setTimeout(() => {
          if (this.copiedBulletId() === bullet.id) {
            this.copiedBulletId.set(null);
          }
        }, 2000);
      });
    }
  }
}
