import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { VacanciesService } from '../../services/vacancies.service';
import { ApplicationsService } from '../../services/applications.service';
import { AuthenticationService } from '../../services/authentication.service';
import { PersonasService } from '../../services/personas.service';
import { Vacancy } from '../../models/vacancy.model';
import { JobApplication, ApplicationStatus } from '../../models/application.model';
import { PersonaId } from '../../models/persona.model';
import { jobDetailUrl } from '../../consts/routes.consts';
import { TOP_MATCH_THRESHOLD } from '../dashboard/dashboard.component';

export type CompanySortKey = 'vacancies' | 'score' | 'applications' | 'salary' | 'name';
export type CompanyPersonaFilter = 'all' | 'philip' | 'chiara';
export type CompanyDetailTab = 'vacancies' | 'applications' | 'intel';

export interface CompanyOverview {
  name: string;
  isTargetInstitution: boolean;
  targetPersonas: PersonaId[];
  vacancies: Vacancy[];
  applications: (JobApplication & { vacancyTitle?: string })[];
  totalVacanciesCount: number;
  activeMatchesCount: number;
  topTierCount: number;
  archivedCount: number;
  applicationsCount: number;
  activeApplicationsCount: number;
  topMatchScore: number;
  avgMatchScore: number;
  salaryMin: number | null;
  salaryMax: number | null;
  avgSalary: number | null;
  salaryCount: number;
  hasTelework: boolean;
  teleworkCount: number;
  shortageCount: number;
  locations: string[];
  sources: string[];
  topSkills: { skill: string; count: number }[];
}

@Component({
  selector: 'app-companies',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './companies.component.html',
})
export class CompaniesComponent implements OnInit {
  authenticationService = inject(AuthenticationService);
  private vacanciesService = inject(VacanciesService);
  private applicationsService = inject(ApplicationsService);
  private personasService = inject(PersonasService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  jobDetailUrl = jobDetailUrl;
  topMatchThreshold = TOP_MATCH_THRESHOLD;

  private allVacancies = toSignal(this.vacanciesService.getAllVacancies(), {
    initialValue: [] as Vacancy[],
  });
  private allApplications = toSignal(this.applicationsService.getAllApplications(), {
    initialValue: [] as JobApplication[],
  });
  private personas = toSignal(this.personasService.getPersonas(), {
    initialValue: [],
  });

  searchQuery = signal('');
  personaFilter = signal<CompanyPersonaFilter>('all');
  sortKey = signal<CompanySortKey>('vacancies');
  selectedCompanyName = signal<string | null>(null);
  detailTab = signal<CompanyDetailTab>('vacancies');

  ngOnInit() {
    this.route.queryParams.subscribe((params) => {
      const companyParam = params['company'];
      if (companyParam) {
        this.selectedCompanyName.set(companyParam);
      }
    });
  }

  personaLabel(persona: PersonaId | null | undefined): string {
    if (!persona) return 'General';
    return persona === 'philip' ? 'Philip' : 'Chiara';
  }

  statusLabel(status: ApplicationStatus): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  // All companies aggregated
  allCompanies = computed<CompanyOverview[]>(() => {
    const vacancies = this.allVacancies();
    const apps = this.allApplications();
    const personasList = this.personas();

    // Collect target institutions from all personas
    const targetInstitutions = new Set<string>();
    for (const p of personasList) {
      for (const inst of p.targetInstitutions || []) {
        targetInstitutions.add(inst.toLowerCase().trim());
      }
    }

    const companyMap = new Map<string, { vacancies: Vacancy[]; apps: JobApplication[] }>();
    const vacById = new Map<string, Vacancy>();

    for (const v of vacancies) {
      vacById.set(v.jobId, v);
      const name = (v.employer && v.employer.trim()) ? v.employer.trim() : 'Not disclosed';
      if (!companyMap.has(name)) {
        companyMap.set(name, { vacancies: [], apps: [] });
      }
      companyMap.get(name)!.vacancies.push(v);
    }

    for (const app of apps) {
      const v = vacById.get(app.jobId);
      const name = (v?.employer && v.employer.trim()) ? v.employer.trim() : 'Not disclosed';
      if (!companyMap.has(name)) {
        companyMap.set(name, { vacancies: [], apps: [] });
      }
      companyMap.get(name)!.apps.push(app);
    }

    const result: CompanyOverview[] = [];

    for (const [name, data] of companyMap.entries()) {
      const isTarget = Array.from(targetInstitutions).some((t) =>
        name.toLowerCase().includes(t) || t.includes(name.toLowerCase())
      );

      const personasSet = new Set<PersonaId>();
      let topScore = 0;
      let scoreSum = 0;
      let scoreCount = 0;
      let topTierCount = 0;
      let activeCount = 0;
      let archivedCount = 0;
      let shortageCount = 0;
      let teleworkCount = 0;
      let salarySum = 0;
      let salaryCount = 0;
      let salaryMin: number | null = null;
      let salaryMax: number | null = null;

      const locationsSet = new Set<string>();
      const sourcesSet = new Set<string>();
      const skillMap = new Map<string, number>();

      for (const v of data.vacancies) {
        if (v.matchedPersona) {
          personasSet.add(v.matchedPersona);
        }

        if (v.status === 'archived') {
          archivedCount++;
        } else if (v.status === 'matched' || v.status === 'applied') {
          activeCount++;
        }

        const score = (v.matchScore ?? 0) * 100;
        if (v.matchScore != null) {
          scoreSum += score;
          scoreCount++;
          if (score > topScore) topScore = score;
        }

        if (score >= TOP_MATCH_THRESHOLD) {
          topTierCount++;
        }

        if (v.shortageOccupationMatch) {
          shortageCount++;
        }

        if (v.location?.allowsTelework || (v.location?.teleworkPercentageMax ?? 0) > 0) {
          teleworkCount++;
        }

        if (v.estimatedSalary && v.estimatedSalary > 0) {
          const sal = v.estimatedSalary;
          salarySum += sal;
          salaryCount++;
          if (salaryMin === null || sal < salaryMin) salaryMin = sal;
          if (salaryMax === null || sal > salaryMax) salaryMax = sal;
        }

        if (v.location?.city) {
          locationsSet.add(v.location.city);
        }
        if (v.source) {
          sourcesSet.add(v.source);
        }

        const skills = v.extractedSkillLabels?.length ? v.extractedSkillLabels : v.extractedSkills || [];
        for (const s of skills) {
          if (s && s.trim()) {
            const clean = s.trim();
            skillMap.set(clean, (skillMap.get(clean) ?? 0) + 1);
          }
        }
      }

      for (const app of data.apps) {
        if (app.persona) {
          personasSet.add(app.persona);
        }
      }

      let activeApplicationsCount = 0;
      const enrichedApps = data.apps.map((app) => {
        if (['submitted', 'interviewing', 'offer'].includes(app.status)) {
          activeApplicationsCount++;
        }
        const v = vacById.get(app.jobId);
        return {
          ...app,
          vacancyTitle: v?.title ?? app.jobId,
        };
      });

      const topSkills = Array.from(skillMap.entries())
        .map(([skill, count]) => ({ skill, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

      result.push({
        name,
        isTargetInstitution: isTarget,
        targetPersonas: Array.from(personasSet),
        vacancies: [...data.vacancies].sort(
          (a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0)
        ),
        applications: enrichedApps,
        totalVacanciesCount: data.vacancies.length,
        activeMatchesCount: activeCount,
        topTierCount,
        archivedCount,
        applicationsCount: data.apps.length,
        activeApplicationsCount,
        topMatchScore: Math.round(topScore),
        avgMatchScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : 0,
        salaryMin,
        salaryMax,
        avgSalary: salaryCount > 0 ? Math.round(salarySum / salaryCount) : null,
        salaryCount,
        hasTelework: teleworkCount > 0,
        teleworkCount,
        shortageCount,
        locations: Array.from(locationsSet),
        sources: Array.from(sourcesSet),
        topSkills,
      });
    }

    return result;
  });

  // Filtered & sorted companies
  filteredCompanies = computed<CompanyOverview[]>(() => {
    let list = this.allCompanies();
    const query = this.searchQuery().toLowerCase().trim();
    const pFilter = this.personaFilter();

    if (pFilter !== 'all') {
      list = list.filter((c) => c.targetPersonas.includes(pFilter));
    }

    if (query) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          c.locations.some((l) => l.toLowerCase().includes(query)) ||
          c.topSkills.some((s) => s.skill.toLowerCase().includes(query)) ||
          c.vacancies.some((v) => v.title.toLowerCase().includes(query))
      );
    }

    const sort = this.sortKey();
    return [...list].sort((a, b) => {
      switch (sort) {
        case 'score':
          return b.topMatchScore - a.topMatchScore;
        case 'applications':
          return b.applicationsCount - a.applicationsCount || b.totalVacanciesCount - a.totalVacanciesCount;
        case 'salary':
          return (b.avgSalary ?? 0) - (a.avgSalary ?? 0);
        case 'name':
          return a.name.localeCompare(b.name);
        case 'vacancies':
        default:
          return b.totalVacanciesCount - a.totalVacanciesCount || b.topMatchScore - a.topMatchScore;
      }
    });
  });

  // Selected company object
  selectedCompany = computed<CompanyOverview | null>(() => {
    const list = this.filteredCompanies();
    if (list.length === 0) return null;

    const selectedName = this.selectedCompanyName();
    if (selectedName) {
      const found = list.find((c) => c.name.toLowerCase() === selectedName.toLowerCase());
      if (found) return found;
    }
    return list[0];
  });

  // Overall Company KPI stats
  totalCompaniesCount = computed(() => this.allCompanies().length);
  totalActiveHiringCount = computed(
    () => this.allCompanies().filter((c) => c.totalVacanciesCount > 0).length
  );
  totalWithApplicationsCount = computed(
    () => this.allCompanies().filter((c) => c.applicationsCount > 0).length
  );

  selectCompany(company: CompanyOverview) {
    this.selectedCompanyName.set(company.name);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { company: company.name },
      queryParamsHandling: 'merge',
    });
  }

  setSearchQuery(q: string) {
    this.searchQuery.set(q);
  }

  setPersonaFilter(f: CompanyPersonaFilter) {
    this.personaFilter.set(f);
  }

  setSortKey(k: string) {
    this.sortKey.set(k as CompanySortKey);
  }

  setDetailTab(t: CompanyDetailTab) {
    this.detailTab.set(t);
  }
}
