import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, doc, docData } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Observable } from 'rxjs';
import { COLLECTIONS } from '../consts/collections.consts';
import { ApplicationStatus, JobApplication } from '../models/application.model';

@Injectable({
  providedIn: 'root',
})
export class ApplicationsService {
  private firestore = inject(Firestore);
  private functions = inject(Functions);

  // Application doc ID is the jobId (1:1 relationship).
  getApplicationForJob(jobId: string): Observable<JobApplication | undefined> {
    return docData(
      doc(this.firestore, COLLECTIONS.Applications, jobId)
    ) as Observable<JobApplication | undefined>;
  }

  getAllApplications(): Observable<JobApplication[]> {
    const appsRef = collection(this.firestore, COLLECTIONS.Applications);
    return collectionData(appsRef) as Observable<JobApplication[]>;
  }

  updateStatus(jobId: string, status: ApplicationStatus, note?: string) {
    return httpsCallable(this.functions, 'updateApplicationStatus')({ jobId, status, note });
  }
}
