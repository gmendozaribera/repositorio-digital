import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import type { Rol } from '../api/auth';
import { AuthService } from '../core/auth/auth.service';

interface EnlaceMenu {
  ruta: string;
  texto: string;
}

/** Modulos de cada rol en la barra superior (ademas de Inicio y Seguridad). */
const MENU_POR_ROL: Record<Rol, EnlaceMenu[]> = {
  ADMIN: [
    { ruta: '/admin/catalogos', texto: 'Catálogos' },
    { ruta: '/admin/usuarios', texto: 'Usuarios' },
    { ruta: '/admin/padron', texto: 'Padrón' },
  ],
  DOCENTE: [],
  ESTUDIANTE: [],
};

/** Marco de las paginas autenticadas: barra superior + contenido. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="topbar">
      <a class="brand" [routerLink]="auth.rutaInicio()">Repositorio Digital</a>
      <nav class="topbar-nav" aria-label="Principal">
        <a
          [routerLink]="auth.rutaInicio()"
          routerLinkActive="active"
          [routerLinkActiveOptions]="{ exact: true }"
          >Inicio</a
        >
        @for (enlace of menu(); track enlace.ruta) {
          <a [routerLink]="enlace.ruta" routerLinkActive="active">{{ enlace.texto }}</a>
        }
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
  protected readonly menu = computed(() => {
    const rol = this.auth.usuario()?.rol;
    return rol ? MENU_POR_ROL[rol] : [];
  });
}
