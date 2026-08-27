import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { PersonasService } from '../../services/personas.service';
import { PersonaId } from '../../models/persona.model';

interface IngestionResult {
  runId: string;
  status: string;
  jobsFetched: number;
  jobsNew: number;
  jobsRetried: number;
  jobsMatched: number;
  sourcesSkipped: { source: string; reason: string }[];
  errors: { source: string; message: string }[];
}

interface SeedResult {
  personaCount: number;
  shortageOccupationCount: number;
  embeddingsWritten: boolean;
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin.component.html',
})
export class AdminComponent {
  private functions = inject(Functions);
  private personasService = inject(PersonasService);

  personas$ = this.personasService.getPersonas();
  domainsDraft: Record<PersonaId, string> = { philip: '', chiara: '' };
  draftInitialized: Record<PersonaId, boolean> = { philip: false, chiara: false };

  ingestionLoading = false;
  ingestionResult: IngestionResult | null = null;
  ingestionError: string | null = null;

  seedLoading = false;
  seedResult: SeedResult | null = null;
  seedError: string | null = null;

  savingPersona: PersonaId | null = null;
  personaSaveError: Record<string, string | null> = {};

  initDraft(personaId: PersonaId, domains: string[]) {
    if (!this.draftInitialized[personaId]) {
      this.domainsDraft[personaId] = domains.join(', ');
      this.draftInitialized[personaId] = true;
    }
  }

  async runIngestion() {
    this.ingestionLoading = true;
    this.ingestionError = null;
    this.ingestionResult = null;
    try {
      // Matches adminRunIngestion's backend timeoutSeconds (540s) — the SDK's
      // default 70s client deadline was firing before the pipeline finished.
      const callable = httpsCallable<unknown, IngestionResult>(this.functions, 'adminRunIngestion', {
        timeout: 540000,
      });
      const response = await callable();
      this.ingestionResult = response.data;
    } catch (error) {
      this.ingestionError = error instanceof Error ? error.message : String(error);
    } finally {
      this.ingestionLoading = false;
    }
  }

  async reseedReferenceData() {
    this.seedLoading = true;
    this.seedError = null;
    this.seedResult = null;
    try {
      const callable = httpsCallable<unknown, SeedResult>(this.functions, 'adminSeedReferenceData');
      const response = await callable();
      this.seedResult = response.data;
    } catch (error) {
      this.seedError = error instanceof Error ? error.message : String(error);
    } finally {
      this.seedLoading = false;
    }
  }

  async savePersonaDomains(personaId: PersonaId) {
    this.savingPersona = personaId;
    this.personaSaveError[personaId] = null;
    try {
      const domains = this.domainsDraft[personaId]
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean);
      const callable = httpsCallable(this.functions, 'adminUpdatePersonaDomains');
      await callable({ personaId, domains });
    } catch (error) {
      this.personaSaveError[personaId] = error instanceof Error ? error.message : String(error);
    } finally {
      this.savingPersona = null;
    }
  }
}
