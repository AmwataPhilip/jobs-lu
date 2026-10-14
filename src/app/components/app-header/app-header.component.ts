import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthenticationService } from '../../services/authentication.service';
import { NotificationsService } from '../../services/notifications.service';
import { DigestNotification } from '../../models/notification.model';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './app-header.component.html',
})
export class AppHeaderComponent {
  authenticationService = inject(AuthenticationService);
  private notificationsService = inject(NotificationsService);

  menuOpen = signal(false);
  notificationsOpen = signal(false);

  notifications = toSignal(this.notificationsService.getRecent(), {
    initialValue: [] as DigestNotification[],
  });
  unreadCount = computed(() => this.notifications().filter((n) => !n.readAt).length);

  personaLabel(persona: string): string {
    return persona === 'philip' ? 'Philip' : persona === 'chiara' ? 'Chiara' : persona;
  }

  toggleMenu() {
    this.menuOpen.update((open) => !open);
  }

  closeMenu() {
    this.menuOpen.set(false);
  }

  toggleNotifications() {
    const willOpen = !this.notificationsOpen();
    this.notificationsOpen.set(willOpen);
    if (willOpen) {
      // Opening the panel marks everything currently unread as read.
      for (const n of this.notifications()) {
        if (!n.readAt) {
          this.notificationsService.markRead(n.id).catch(() => undefined);
        }
      }
    }
  }

  closeNotifications() {
    this.notificationsOpen.set(false);
  }
}
