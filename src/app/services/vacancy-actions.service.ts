import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';

// Wraps the archive/restore/delete callables (functions/src/vacancies/manageVacancyCallable.ts)
// for reuse across the dashboard, job-detail, and other-matches views.
@Injectable({ providedIn: 'root' })
export class VacancyActionsService {
  private functions = inject(Functions);

  archive(jobId: string) {
    return httpsCallable(this.functions, 'archiveVacancy')({ jobId });
  }

  restore(jobId: string) {
    return httpsCallable(this.functions, 'restoreVacancy')({ jobId });
  }

  delete(jobId: string) {
    return httpsCallable(this.functions, 'deleteVacancy')({ jobId });
  }
}
