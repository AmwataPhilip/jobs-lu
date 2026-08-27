import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { map, of, switchMap } from 'rxjs';
import { VacanciesService } from '../../services/vacancies.service';
import { ApplicationsService } from '../../services/applications.service';
import { PersonasService } from '../../services/personas.service';
import { ComplianceService } from '../../services/compliance.service';
import { VacancyActionsService } from '../../services/vacancy-actions.service';
import { ROUTES } from '../../consts/routes.consts';
import { ApplicationStatus } from '../../models/application.model';
import { PersonaId } from '../../models/persona.model';
import { APPLICATION_STATUSES } from '../applications/applications.component';

export const CV_LANGUAGES = ['English', 'French', 'German'];

// EURES descriptions are HTML (e.g. "<br><br>", "&amp;"). We never render
// them as HTML (no innerHTML — XSS risk), just want readable plain text.
// <textarea>.innerHTML is RCDATA, not parsed/executed as markup, so this
// decodes entities safely; tags are stripped separately by regex.
function stripDescriptionHtml(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '');
  const textarea = document.createElement('textarea');
  textarea.innerHTML = withBreaks;
  return textarea.value.replace(/\n{3,}/g, '\n\n').trim();
}

@Component({
  selector: 'app-job-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './job-detail.component.html',
})
export class JobDetailComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private vacanciesService = inject(VacanciesService);
  private applicationsService = inject(ApplicationsService);
  private personasService = inject(PersonasService);
  private complianceService = inject(ComplianceService);
  private vacancyActions = inject(VacancyActionsService);
  private functions = inject(Functions);

  dashboardUrl = `/${ROUTES.dashboard}`;
  pendingDelete = signal(false);
  applicationStatuses = APPLICATION_STATUSES;
  statusNote = signal('');

  rematching = signal(false);
  rematchError = signal<string | null>(null);

  cvLanguages = CV_LANGUAGES;
  selectedCvLanguage = signal(CV_LANGUAGES[0]);
  generatingCv = signal(false);
  cvGenerationError = signal<string | null>(null);

  vacancy$ = this.route.paramMap.pipe(
    map((params) => params.get('jobId')!),
    switchMap((jobId) => this.vacanciesService.getVacancy(jobId)),
    map((vacancy) =>
      vacancy
        ? {
            ...vacancy,
            rawDescription: stripDescriptionHtml(vacancy.rawDescription),
            compliance: this.complianceService.assess(
              vacancy.location.teleworkPercentageMax
            ),
          }
        : vacancy
    )
  );

  application$ = this.vacancy$.pipe(
    switchMap((vacancy) =>
      vacancy ? this.applicationsService.getApplicationForJob(vacancy.jobId) : of(undefined)
    )
  );

  matchedPersona$ = this.vacancy$.pipe(
    switchMap((vacancy) =>
      vacancy?.matchedPersona
        ? this.personasService.getPersona(vacancy.matchedPersona)
        : of(undefined)
    )
  );

  resolveBulletText(persona: { cvBullets: { id: string; text: string }[] } | undefined, bulletId: string): string {
    return persona?.cvBullets.find((b) => b.id === bulletId)?.text ?? bulletId;
  }

  statusLabel(status: ApplicationStatus): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  async setApplicationStatus(jobId: string, status: string) {
    const note = this.statusNote().trim();
    await this.applicationsService.updateStatus(jobId, status as ApplicationStatus, note || undefined);
    this.statusNote.set('');
  }

  async archive(jobId: string) {
    await this.vacancyActions.archive(jobId);
    this.router.navigateByUrl(this.dashboardUrl);
  }

  async restore(jobId: string) {
    await this.vacancyActions.restore(jobId);
  }

  async deleteVacancy(jobId: string) {
    if (this.pendingDelete()) {
      await this.vacancyActions.delete(jobId);
      this.router.navigateByUrl(this.dashboardUrl);
    } else {
      this.pendingDelete.set(true);
    }
  }

  async rematchJob(jobId: string) {
    this.rematching.set(true);
    this.rematchError.set(null);
    try {
      const callable = httpsCallable<{ jobId: string }, { rematched: boolean }>(
        this.functions,
        'adminRematchJob',
        { timeout: 60000 }
      );
      await callable({ jobId });
    } catch (error) {
      this.rematchError.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.rematching.set(false);
    }
  }

  async generateTailoredCv(jobId: string, personaId: PersonaId) {
    this.generatingCv.set(true);
    this.cvGenerationError.set(null);
    try {
      const callable = httpsCallable<
        { jobId: string; personaId: PersonaId; language: string },
        { fileName: string; pdfBase64: string }
      >(this.functions, 'generateTailoredCv', { timeout: 90000 });
      const response = await callable({ jobId, personaId, language: this.selectedCvLanguage() });

      const byteChars = atob(response.data.pdfBase64);
      const bytes = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        bytes[i] = byteChars.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = response.data.fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      this.cvGenerationError.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.generatingCv.set(false);
    }
  }
}
