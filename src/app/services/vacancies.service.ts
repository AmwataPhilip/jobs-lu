import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  limit,
  orderBy,
  query,
  where,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { COLLECTIONS } from '../consts/collections.consts';
import { PersonaId } from '../models/persona.model';
import { Vacancy } from '../models/vacancy.model';

@Injectable({
  providedIn: 'root',
})
export class VacanciesService {
  private firestore = inject(Firestore);

  // Dashboard pagination is client-side over this result set (see
  // dashboard.component.ts) — a plain 2-user tool doesn't need cursor-based
  // Firestore pagination, but a hard cap keeps a single read bounded now that
  // ingestion's EURES backfill sweep (fetchEuresJobs.ts) can surface far more
  // matches over time than the old ~170-job ceiling.
  private static readonly MAX_RESULTS = 300;

  getMatchedVacancies(persona: PersonaId): Observable<Vacancy[]> {
    const vacanciesRef = collection(this.firestore, COLLECTIONS.Vacancies);
    // 'applied' jobs (auto-application already generated) still belong on
    // the dashboard — only 'new' (not yet matched), 'rejected', and
    // 'expired' are excluded.
    const matchedQuery = query(
      vacanciesRef,
      where('matchedPersona', '==', persona),
      where('status', 'in', ['matched', 'applied']),
      orderBy('matchScore', 'desc'),
      limit(VacanciesService.MAX_RESULTS)
    );
    return collectionData(matchedQuery) as Observable<Vacancy[]>;
  }

  // Archived jobs are excluded from getMatchedVacancies (status filter above)
  // — this is the only way to see them again, for the "Archived" tab on the
  // other-matches page.
  getArchivedVacancies(persona: PersonaId): Observable<Vacancy[]> {
    const vacanciesRef = collection(this.firestore, COLLECTIONS.Vacancies);
    const archivedQuery = query(
      vacanciesRef,
      where('matchedPersona', '==', persona),
      where('status', '==', 'archived'),
      limit(VacanciesService.MAX_RESULTS)
    );
    return collectionData(archivedQuery) as Observable<Vacancy[]>;
  }

  getVacancy(jobId: string): Observable<Vacancy | undefined> {
    const vacancyRef = doc(this.firestore, COLLECTIONS.Vacancies, jobId);
    return docData(vacancyRef) as Observable<Vacancy | undefined>;
  }

  getAllVacancies(): Observable<Vacancy[]> {
    const vacanciesRef = collection(this.firestore, COLLECTIONS.Vacancies);
    return collectionData(vacanciesRef) as Observable<Vacancy[]>;
  }
}
