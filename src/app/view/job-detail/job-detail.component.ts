import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map, of, switchMap } from 'rxjs';
import { VacanciesService } from '../../services/vacancies.service';
import { ApplicationsService } from '../../services/applications.service';
import { PersonasService } from '../../services/personas.service';
import { ComplianceService } from '../../services/compliance.service';
import { VacancyActionsService } from '../../services/vacancy-actions.service';
import { ROUTES } from '../../consts/routes.consts';
import { ApplicationStatus } from '../../models/application.model';
import { APPLICATION_STATUSES } from '../applications/applications.component';

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
  imports: [CommonModule, RouterLink],
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

  dashboardUrl = `/${ROUTES.dashboard}`;
  pendingDelete = signal(false);
  applicationStatuses = APPLICATION_STATUSES;
  statusNote = signal('');

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
}
