import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map, of, switchMap } from 'rxjs';
import { VacanciesService } from '../../services/vacancies.service';
import { ApplicationsService } from '../../services/applications.service';
import { PersonasService } from '../../services/personas.service';
import { ComplianceService } from '../../services/compliance.service';
import { ROUTES } from '../../consts/routes.consts';

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
  private vacanciesService = inject(VacanciesService);
  private applicationsService = inject(ApplicationsService);
  private personasService = inject(PersonasService);
  private complianceService = inject(ComplianceService);

  dashboardUrl = `/${ROUTES.dashboard}`;

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
}
