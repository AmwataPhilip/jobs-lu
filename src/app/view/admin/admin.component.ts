import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Storage, ref, uploadBytes } from '@angular/fire/storage';
import { PersonasService } from '../../services/personas.service';
import { VacanciesService } from '../../services/vacancies.service';
import { ApplicationsService } from '../../services/applications.service';
import { CvBullet, PersonaId } from '../../models/persona.model';
import { Vacancy } from '../../models/vacancy.model';
import { JobApplication } from '../../models/application.model';
import { TOP_MATCH_THRESHOLD } from '../dashboard/dashboard.component';

export type StatsTab = 'platform' | 'philip' | 'chiara' | 'comparison';

export interface ScoreDistribution {
  bracket90Plus: number;
  bracket80to89: number;
  bracket70to79: number;
  bracketUnder70: number;
}

export interface ItemCount {
  name: string;
  count: number;
  percentage: number;
}

export interface PersonaStats {
  personaId: PersonaId;
  displayName: string;
  totalMatched: number;
  activeCount: number;
  topTierCount: number;
  otherCount: number;
  archivedCount: number;
  appliedCount: number;
  avgScore: number;
  maxScore: number;
  shortageCount: number;
  shortageRate: number;
  salaryCount: number;
  avgSalary: number;
  teleworkCount: number;
  teleworkRate: number;
  scoreDistribution: ScoreDistribution;
  sources: ItemCount[];
  topEmployers: { name: string; count: number }[];
  topSkills: { skill: string; count: number }[];
  applications: {
    draft: number;
    reviewed: number;
    submitted: number;
    total: number;
  };
}

export interface PlatformStats {
  totalVacancies: number;
  totalMatched: number;
  totalUnmatched: number;
  totalTopTier: number;
  totalOtherMatches: number;
  totalArchived: number;
  totalApplied: number;
  totalShortage: number;
  shortageRate: number;
  avgMarketSalary: number;
  salaryReportingCount: number;
  salaryReportingRate: number;
  teleworkCount: number;
  teleworkRate: number;
  philipCount: number;
  philipRate: number;
  chiaraCount: number;
  chiaraRate: number;
  unmatchedRate: number;
  sources: ItemCount[];
  statusBreakdown: {
    matched: number;
    applied: number;
    archived: number;
    newOrUnmatched: number;
    rejected: number;
    expired: number;
  };
  topEmployers: { name: string; count: number }[];
  topSkills: { skill: string; count: number }[];
  totalApplications: number;
  applicationStatuses: {
    draft: number;
    reviewed: number;
    submitted: number;
  };
}

interface IngestionResult {
  runId: string;
  status: string;
  jobsFetched: number;
  jobsNew: number;
  jobsRetried: number;
  jobsMatched: number;
  sourcesSkipped: { source: string; reason: string }[];
  errors: { source: string; message: string }[];
}

interface SeedResult {
  personaCount: number;
  shortageOccupationCount: number;
  embeddingsWritten: boolean;
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin.component.html',
})
export class AdminComponent {
  private functions = inject(Functions);
  private storage = inject(Storage);
  private personasService = inject(PersonasService);
  private vacanciesService = inject(VacanciesService);
  private applicationsService = inject(ApplicationsService);

  topMatchThreshold = TOP_MATCH_THRESHOLD;
  activeStatsTab = signal<StatsTab>('platform');

  personas$ = this.personasService.getPersonas();
  domainsDraft: Record<PersonaId, string> = { philip: '', chiara: '' };
  draftInitialized: Record<PersonaId, boolean> = { philip: false, chiara: false };

  // Real-time data streams
  private allVacancies = toSignal(this.vacanciesService.getAllVacancies(), {
    initialValue: [] as Vacancy[],
  });
  private allApplications = toSignal(this.applicationsService.getAllApplications(), {
    initialValue: [] as JobApplication[],
  });

  // Aggregated platform stats
  platformStats = computed<PlatformStats>(() => {
    const vacancies = this.allVacancies();
    const apps = this.allApplications();
    const total = vacancies.length;

    if (total === 0) {
      return {
        totalVacancies: 0,
        totalMatched: 0,
        totalUnmatched: 0,
        totalTopTier: 0,
        totalOtherMatches: 0,
        totalArchived: 0,
        totalApplied: 0,
        totalShortage: 0,
        shortageRate: 0,
        avgMarketSalary: 0,
        salaryReportingCount: 0,
        salaryReportingRate: 0,
        teleworkCount: 0,
        teleworkRate: 0,
        philipCount: 0,
        philipRate: 0,
        chiaraCount: 0,
        chiaraRate: 0,
        unmatchedRate: 0,
        sources: [],
        statusBreakdown: { matched: 0, applied: 0, archived: 0, newOrUnmatched: 0, rejected: 0, expired: 0 },
        topEmployers: [],
        topSkills: [],
        totalApplications: 0,
        applicationStatuses: { draft: 0, reviewed: 0, submitted: 0 },
      };
    }

    let matchedCount = 0;
    let philipCount = 0;
    let chiaraCount = 0;
    let topTierCount = 0;
    let otherCount = 0;
    let archivedCount = 0;
    let appliedCount = 0;
    let shortageCount = 0;
    let teleworkCount = 0;
    let salarySum = 0;
    let salaryCount = 0;

    const statusCounts = {
      matched: 0,
      applied: 0,
      archived: 0,
      newOrUnmatched: 0,
      rejected: 0,
      expired: 0,
    };

    const sourceMap = new Map<string, number>();
    const employerMap = new Map<string, number>();
    const skillMap = new Map<string, number>();

    for (const v of vacancies) {
      // Status
      if (v.status === 'matched') statusCounts.matched++;
      else if (v.status === 'applied') statusCounts.applied++;
      else if (v.status === 'archived') statusCounts.archived++;
      else if (v.status === 'rejected') statusCounts.rejected++;
      else if (v.status === 'expired') statusCounts.expired++;
      else statusCounts.newOrUnmatched++;

      if (v.matchedPersona) {
        matchedCount++;
        if (v.matchedPersona === 'philip') philipCount++;
        if (v.matchedPersona === 'chiara') chiaraCount++;

        const scorePercent = (v.matchScore ?? 0) * 100;
        if (scorePercent >= TOP_MATCH_THRESHOLD) {
          topTierCount++;
        } else {
          otherCount++;
        }
      }

      if (v.status === 'archived') archivedCount++;
      if (v.status === 'applied') appliedCount++;
      if (v.shortageOccupationMatch) shortageCount++;
      if (v.location?.allowsTelework || (v.location?.teleworkPercentageMax ?? 0) > 0) teleworkCount++;

      if (v.estimatedSalary && v.estimatedSalary > 0) {
        salarySum += v.estimatedSalary;
        salaryCount++;
      }

      // Sources
      const src = v.source || 'Unknown';
      sourceMap.set(src, (sourceMap.get(src) ?? 0) + 1);

      // Employers
      if (v.employer && v.employer.trim()) {
        const emp = v.employer.trim();
        employerMap.set(emp, (employerMap.get(emp) ?? 0) + 1);
      }

      // Skills
      const skills = v.extractedSkillLabels?.length ? v.extractedSkillLabels : v.extractedSkills || [];
      for (const s of skills) {
        if (s && s.trim()) {
          const clean = s.trim();
          skillMap.set(clean, (skillMap.get(clean) ?? 0) + 1);
        }
      }
    }

    const sources: ItemCount[] = Array.from(sourceMap.entries())
      .map(([name, count]) => ({
        name,
        count,
        percentage: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count);

    const topEmployers = Array.from(employerMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const topSkills = Array.from(skillMap.entries())
      .map(([skill, count]) => ({ skill, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const appStatuses = { draft: 0, reviewed: 0, submitted: 0 };
    for (const a of apps) {
      if (a.status === 'draft') appStatuses.draft++;
      else if (a.status === 'reviewed') appStatuses.reviewed++;
      else if (a.status === 'submitted') appStatuses.submitted++;
    }

    return {
      totalVacancies: total,
      totalMatched: matchedCount,
      totalUnmatched: total - matchedCount,
      totalTopTier: topTierCount,
      totalOtherMatches: otherCount,
      totalArchived: archivedCount,
      totalApplied: appliedCount,
      totalShortage: shortageCount,
      shortageRate: Math.round((shortageCount / total) * 100),
      avgMarketSalary: salaryCount > 0 ? Math.round(salarySum / salaryCount) : 0,
      salaryReportingCount: salaryCount,
      salaryReportingRate: Math.round((salaryCount / total) * 100),
      teleworkCount,
      teleworkRate: Math.round((teleworkCount / total) * 100),
      philipCount,
      philipRate: Math.round((philipCount / total) * 100),
      chiaraCount,
      chiaraRate: Math.round((chiaraCount / total) * 100),
      unmatchedRate: Math.round(((total - matchedCount) / total) * 100),
      sources,
      statusBreakdown: statusCounts,
      topEmployers,
      topSkills,
      totalApplications: apps.length,
      applicationStatuses: appStatuses,
    };
  });

  // Persona stats generator
  private computePersonaStats(personaId: PersonaId, displayName: string): PersonaStats {
    const all = this.allVacancies();
    const apps = this.allApplications();
    const personaVacancies = all.filter((v) => v.matchedPersona === personaId);
    const personaApps = apps.filter((a) => a.persona === personaId);
    const total = personaVacancies.length;

    if (total === 0) {
      return {
        personaId,
        displayName,
        totalMatched: 0,
        activeCount: 0,
        topTierCount: 0,
        otherCount: 0,
        archivedCount: 0,
        appliedCount: 0,
        avgScore: 0,
        maxScore: 0,
        shortageCount: 0,
        shortageRate: 0,
        salaryCount: 0,
        avgSalary: 0,
        teleworkCount: 0,
        teleworkRate: 0,
        scoreDistribution: { bracket90Plus: 0, bracket80to89: 0, bracket70to79: 0, bracketUnder70: 0 },
        sources: [],
        topEmployers: [],
        topSkills: [],
        applications: { draft: 0, reviewed: 0, submitted: 0, total: 0 },
      };
    }

    let topTierCount = 0;
    let otherCount = 0;
    let archivedCount = 0;
    let appliedCount = 0;
    let activeCount = 0;
    let shortageCount = 0;
    let teleworkCount = 0;
    let salarySum = 0;
    let salaryCount = 0;
    let scoreSum = 0;
    let scoreCount = 0;
    let maxScore = 0;

    const scoreDist: ScoreDistribution = {
      bracket90Plus: 0,
      bracket80to89: 0,
      bracket70to79: 0,
      bracketUnder70: 0,
    };

    const sourceMap = new Map<string, number>();
    const employerMap = new Map<string, number>();
    const skillMap = new Map<string, number>();

    for (const v of personaVacancies) {
      if (v.status === 'archived') archivedCount++;
      else if (v.status === 'applied') {
        appliedCount++;
        activeCount++;
      } else if (v.status === 'matched') {
        activeCount++;
      }

      const score = (v.matchScore ?? 0) * 100;
      if (v.matchScore != null) {
        scoreSum += score;
        scoreCount++;
        if (score > maxScore) maxScore = score;

        if (score >= 90) scoreDist.bracket90Plus++;
        else if (score >= 80) scoreDist.bracket80to89++;
        else if (score >= 70) scoreDist.bracket70to79++;
        else scoreDist.bracketUnder70++;
      }

      if (score >= TOP_MATCH_THRESHOLD) {
        topTierCount++;
      } else {
        otherCount++;
      }

      if (v.shortageOccupationMatch) shortageCount++;
      if (v.location?.allowsTelework || (v.location?.teleworkPercentageMax ?? 0) > 0) teleworkCount++;

      if (v.estimatedSalary && v.estimatedSalary > 0) {
        salarySum += v.estimatedSalary;
        salaryCount++;
      }

      const src = v.source || 'Unknown';
      sourceMap.set(src, (sourceMap.get(src) ?? 0) + 1);

      if (v.employer && v.employer.trim()) {
        const emp = v.employer.trim();
        employerMap.set(emp, (employerMap.get(emp) ?? 0) + 1);
      }

      const skills = v.extractedSkillLabels?.length ? v.extractedSkillLabels : v.extractedSkills || [];
      for (const s of skills) {
        if (s && s.trim()) {
          const clean = s.trim();
          skillMap.set(clean, (skillMap.get(clean) ?? 0) + 1);
        }
      }
    }

    const sources: ItemCount[] = Array.from(sourceMap.entries())
      .map(([name, count]) => ({
        name,
        count,
        percentage: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count);

    const topEmployers = Array.from(employerMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const topSkills = Array.from(skillMap.entries())
      .map(([skill, count]) => ({ skill, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const appStatuses = { draft: 0, reviewed: 0, submitted: 0, total: personaApps.length };
    for (const a of personaApps) {
      if (a.status === 'draft') appStatuses.draft++;
      else if (a.status === 'reviewed') appStatuses.reviewed++;
      else if (a.status === 'submitted') appStatuses.submitted++;
    }

    return {
      personaId,
      displayName,
      totalMatched: total,
      activeCount,
      topTierCount,
      otherCount,
      archivedCount,
      appliedCount,
      avgScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : 0,
      maxScore: Math.round(maxScore),
      shortageCount,
      shortageRate: Math.round((shortageCount / total) * 100),
      salaryCount,
      avgSalary: salaryCount > 0 ? Math.round(salarySum / salaryCount) : 0,
      teleworkCount,
      teleworkRate: Math.round((teleworkCount / total) * 100),
      scoreDistribution: scoreDist,
      sources,
      topEmployers,
      topSkills,
      applications: appStatuses,
    };
  }

  philipStats = computed<PersonaStats>(() => this.computePersonaStats('philip', 'Philip Amwata'));
  chiaraStats = computed<PersonaStats>(() => this.computePersonaStats('chiara', 'Chiara Witry'));

  setStatsTab(tab: StatsTab) {
    this.activeStatsTab.set(tab);
  }

  ingestionLoading = false;
  ingestionResult: IngestionResult | null = null;
  ingestionError: string | null = null;

  seedLoading = false;
  seedResult: SeedResult | null = null;
  seedError: string | null = null;

  savingPersona: PersonaId | null = null;
  personaSaveError: Record<string, string | null> = {};

  // CV bullets editor — see docs/status/A.md. Replaces the hardcoded
  // cvBullets array in functions/src/config/personas.ts with a Firestore-
  // backed admin UI; documents/generateApplication.ts already reads from
  // Firestore, so this needs no other pipeline changes.
  cvBulletsDraft: Record<PersonaId, CvBullet[]> = { philip: [], chiara: [] };
  cvDraftInitialized: Record<PersonaId, boolean> = { philip: false, chiara: false };
  savingCvBullets: PersonaId | null = null;
  cvSaveError: Record<string, string | null> = {};

  // PDF CV upload → Gemini parse — see docs/status pattern from Task A.
  // Populates cvBulletsDraft only; nothing is saved to Firestore until the
  // human reviews the parsed result and clicks "Save CV content" below.
  uploadingCv: Record<PersonaId, boolean> = { philip: false, chiara: false };
  cvUploadError: Record<string, string | null> = {};

  initDraft(personaId: PersonaId, domains: string[]) {
    if (!this.draftInitialized[personaId]) {
      this.domainsDraft[personaId] = domains.join(', ');
      this.draftInitialized[personaId] = true;
    }
  }

  initCvDraft(personaId: PersonaId, cvBullets: CvBullet[]) {
    if (!this.cvDraftInitialized[personaId]) {
      // Deep-copy so in-progress edits don't mutate the live Firestore-synced
      // persona object the template also reads from.
      this.cvBulletsDraft[personaId] = cvBullets.map((b) => ({ ...b, tags: [...b.tags] }));
      this.cvDraftInitialized[personaId] = true;
    }
  }

  cvBulletTagsText(bullet: CvBullet): string {
    return bullet.tags.join(', ');
  }

  setCvBulletText(personaId: PersonaId, index: number, text: string) {
    this.cvBulletsDraft[personaId][index].text = text;
  }

  setCvBulletTags(personaId: PersonaId, index: number, tagsText: string) {
    this.cvBulletsDraft[personaId][index].tags = tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }

  setCvBulletEmployer(personaId: PersonaId, index: number, employer: string) {
    this.cvBulletsDraft[personaId][index].employer = employer.trim() || null;
  }

  setCvBulletPeriod(personaId: PersonaId, index: number, period: string) {
    this.cvBulletsDraft[personaId][index].period = period.trim() || null;
  }

  addCvBullet(personaId: PersonaId) {
    this.cvBulletsDraft[personaId].push({
      id: `${personaId}-custom-${Date.now()}`,
      text: '',
      tags: [],
      employer: null,
      period: null,
    });
  }

  removeCvBullet(personaId: PersonaId, index: number) {
    this.cvBulletsDraft[personaId].splice(index, 1);
  }

  moveCvBullet(personaId: PersonaId, index: number, direction: -1 | 1) {
    const draft = this.cvBulletsDraft[personaId];
    const target = index + direction;
    if (target < 0 || target >= draft.length) {
      return;
    }
    [draft[index], draft[target]] = [draft[target], draft[index]];
  }

  async saveCvBullets(personaId: PersonaId) {
    this.savingCvBullets = personaId;
    this.cvSaveError[personaId] = null;
    try {
      const cvBullets = this.cvBulletsDraft[personaId].filter((b) => b.text.trim().length > 0);
      const callable = httpsCallable(this.functions, 'adminUpdatePersonaCvBullets');
      await callable({ personaId, cvBullets });
      this.cvBulletsDraft[personaId] = cvBullets;
    } catch (error) {
      this.cvSaveError[personaId] = error instanceof Error ? error.message : String(error);
    } finally {
      this.savingCvBullets = null;
    }
  }

  async uploadAndParseCv(personaId: PersonaId, input: EventTarget | null) {
    const file = (input as HTMLInputElement | null)?.files?.[0];
    if (!file) {
      return;
    }
    if (file.type !== 'application/pdf') {
      this.cvUploadError[personaId] = 'Please choose a PDF file.';
      return;
    }

    this.uploadingCv[personaId] = true;
    this.cvUploadError[personaId] = null;
    try {
      const storagePath = `jobslu/cv-uploads/${personaId}/${Date.now()}-${file.name}`;
      await uploadBytes(ref(this.storage, storagePath), file, { contentType: 'application/pdf' });

      const callable = httpsCallable<
        { personaId: PersonaId; storagePath: string },
        { personaId: PersonaId; bullets: { text: string; tags: string[]; employer: string | null; period: string | null }[] }
      >(this.functions, 'adminParseCvPdf', { timeout: 120000 });
      const response = await callable({ personaId, storagePath });

      // Replaces the current draft outright — nothing in Firestore changes
      // until "Save CV content" is clicked, so this is safe to try and
      // discard (reload the page) if the parse looks off.
      this.cvBulletsDraft[personaId] = response.data.bullets.map((b, i) => ({
        id: `${personaId}-parsed-${Date.now()}-${i}`,
        text: b.text,
        tags: b.tags,
        employer: b.employer,
        period: b.period,
      }));
      this.cvDraftInitialized[personaId] = true;
    } catch (error) {
      this.cvUploadError[personaId] = error instanceof Error ? error.message : String(error);
    } finally {
      this.uploadingCv[personaId] = false;
      if (input) {
        (input as HTMLInputElement).value = '';
      }
    }
  }

  async runIngestion() {
    this.ingestionLoading = true;
    this.ingestionError = null;
    this.ingestionResult = null;
    try {
      // Matches adminRunIngestion's backend timeoutSeconds (540s) — the SDK's
      // default 70s client deadline was firing before the pipeline finished.
      const callable = httpsCallable<unknown, IngestionResult>(this.functions, 'adminRunIngestion', {
        timeout: 540000,
      });
      const response = await callable();
      this.ingestionResult = response.data;
    } catch (error) {
      this.ingestionError = error instanceof Error ? error.message : String(error);
    } finally {
      this.ingestionLoading = false;
    }
  }

  async reseedReferenceData() {
    this.seedLoading = true;
    this.seedError = null;
    this.seedResult = null;
    try {
      const callable = httpsCallable<unknown, SeedResult>(this.functions, 'adminSeedReferenceData');
      const response = await callable();
      this.seedResult = response.data;
    } catch (error) {
      this.seedError = error instanceof Error ? error.message : String(error);
    } finally {
      this.seedLoading = false;
    }
  }

  async savePersonaDomains(personaId: PersonaId) {
    this.savingPersona = personaId;
    this.personaSaveError[personaId] = null;
    try {
      const domains = this.domainsDraft[personaId]
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean);
      const callable = httpsCallable(this.functions, 'adminUpdatePersonaDomains');
      await callable({ personaId, domains });
    } catch (error) {
      this.personaSaveError[personaId] = error instanceof Error ? error.message : String(error);
    } finally {
      this.savingPersona = null;
    }
  }
}
