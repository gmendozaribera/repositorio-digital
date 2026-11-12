import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';

/** Marco de las paginas autenticadas: barra superior + contenido. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="topbar">
      <a class="brand" [routerLink]="auth.rutaInicio()">Repositorio Digital</a>
      <nav class="topbar-nav">
        <a [routerLink]="auth.rutaInicio()" routerLinkActive="active">Inicio</a>
        <a routerLink="/perfil/seguridad" routerLinkActive="active">Seguridad</a>
      </nav>
      @if (auth.usuario(); as usuario) {
        <div class="topbar-user">
          <span>{{ usuario.nombre }} {{ usuario.apellidos }}</span>
          <span class="badge">{{ usuario.rol }}</span>
          <button class="btn btn-outline btn-sm" type="button" (click)="auth.logout()">
            Salir
          </button>
        </div>
      }
    </header>
    <main class="content">
      <router-outlet />
    </main>
  `,
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);
}
