import { AfterViewInit, Component, ElementRef, inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import gsap from 'gsap';
import { AuthenticationService } from '../../services/authentication.service';
import { VacanciesService } from '../../services/vacancies.service';
import { PersonasService } from '../../services/personas.service';
import { assessCompliance } from '../../services/compliance.service';
import { jobDetailUrl } from '../../consts/routes.consts';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements AfterViewInit {
  @ViewChild('board') board!: ElementRef<HTMLElement>;

  authenticationService = inject(AuthenticationService);
  private vacanciesService = inject(VacanciesService);
  private personasService = inject(PersonasService);

  jobDetailUrl = jobDetailUrl;
  assessCompliance = assessCompliance;

  philip$ = this.personasService.getPersona('philip');
  chiara$ = this.personasService.getPersona('chiara');
  philipVacancies$ = this.vacanciesService.getMatchedVacancies('philip');
  chiaraVacancies$ = this.vacanciesService.getMatchedVacancies('chiara');

  ngAfterViewInit() {
    gsap.from(this.board.nativeElement.children, {
      opacity: 0,
      y: 12,
      duration: 0.4,
      stagger: 0.08,
      ease: 'power2.out',
    });
  }
}
