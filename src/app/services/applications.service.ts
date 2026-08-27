import { Injectable, inject } from '@angular/core';
import { Firestore, doc, docData } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { COLLECTIONS } from '../consts/collections.consts';
import { JobApplication } from '../models/application.model';

@Injectable({
  providedIn: 'root',
})
export class ApplicationsService {
  private firestore = inject(Firestore);

  // Application doc ID is the jobId (1:1 relationship).
  getApplicationForJob(jobId: string): Observable<JobApplication | undefined> {
    return docData(
      doc(this.firestore, COLLECTIONS.Applications, jobId)
    ) as Observable<JobApplication | undefined>;
  }
}
