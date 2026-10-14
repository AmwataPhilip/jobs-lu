import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { COLLECTIONS } from '../consts/collections.consts';
import { DigestNotification } from '../models/notification.model';

@Injectable({
  providedIn: 'root',
})
export class NotificationsService {
  private firestore = inject(Firestore);

  // Both people share the dashboard, so the feed shows every persona's
  // notifications (each is labelled); recent ones only, newest first.
  getRecent(): Observable<DigestNotification[]> {
    const ref = collection(this.firestore, COLLECTIONS.Notifications);
    const recentQuery = query(ref, orderBy('createdAt', 'desc'), limit(30));
    return collectionData(recentQuery, { idField: 'id' }) as Observable<DigestNotification[]>;
  }

  // Rules only permit updating the `readAt` field on these docs.
  markRead(id: string): Promise<void> {
    const ref = doc(this.firestore, COLLECTIONS.Notifications, id);
    return updateDoc(ref, { readAt: serverTimestamp() });
  }
}
