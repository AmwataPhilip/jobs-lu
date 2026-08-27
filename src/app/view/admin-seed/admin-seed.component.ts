import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Functions, httpsCallable } from '@angular/fire/functions';

// TEMPORARY — one-time production seed button (see
// functions/src/admin/seedCallable.ts for why). Remove this component and
// its route in app.routes.ts once seeding is confirmed done.
@Component({
  selector: 'app-admin-seed',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex flex-col items-center justify-center w-full h-screen gap-4">
      <button
        class="px-4 py-2 text-sm rounded bg-stone-200 hover:bg-slate-200 disabled:opacity-50"
        [disabled]="loading"
        (click)="seed()"
      >
        {{ loading ? 'Seeding…' : 'Seed reference data' }}
      </button>
      <pre *ngIf="result" class="text-xs text-neutral-600 max-w-md whitespace-pre-wrap">{{ result }}</pre>
      <p *ngIf="error" class="text-sm text-red-700">{{ error }}</p>
    </div>
  `,
})
export class AdminSeedComponent {
  private functions = inject(Functions);
  loading = false;
  result: string | null = null;
  error: string | null = null;

  async seed() {
    this.loading = true;
    this.error = null;
    this.result = null;
    try {
      const callable = httpsCallable(this.functions, 'adminSeedReferenceData');
      const response = await callable();
      this.result = JSON.stringify(response.data, null, 2);
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.loading = false;
    }
  }
}
