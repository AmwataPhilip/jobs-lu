import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, doc, docData } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { COLLECTIONS } from '../consts/collections.consts';
import { Persona, PersonaId } from '../models/persona.model';

@Injectable({
  providedIn: 'root',
})
export class PersonasService {
  private firestore = inject(Firestore);

  getPersonas(): Observable<Persona[]> {
    return collectionData(
      collection(this.firestore, COLLECTIONS.Personas)
    ) as Observable<Persona[]>;
  }

  getPersona(personaId: PersonaId): Observable<Persona | undefined> {
    return docData(
      doc(this.firestore, COLLECTIONS.Personas, personaId)
    ) as Observable<Persona | undefined>;
  }
}
