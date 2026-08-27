import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
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

  getMatchedVacancies(persona: PersonaId): Observable<Vacancy[]> {
    const vacanciesRef = collection(this.firestore, COLLECTIONS.Vacancies);
    // 'applied' jobs (auto-application already generated) still belong on
    // the dashboard — only 'new' (not yet matched), 'rejected', and
    // 'expired' are excluded.
    const matchedQuery = query(
      vacanciesRef,
      where('matchedPersona', '==', persona),
      where('status', 'in', ['matched', 'applied']),
      orderBy('matchScore', 'desc')
    );
    return collectionData(matchedQuery) as Observable<Vacancy[]>;
  }

  getVacancy(jobId: string): Observable<Vacancy | undefined> {
    const vacancyRef = doc(this.firestore, COLLECTIONS.Vacancies, jobId);
    return docData(vacancyRef) as Observable<Vacancy | undefined>;
  }
}
