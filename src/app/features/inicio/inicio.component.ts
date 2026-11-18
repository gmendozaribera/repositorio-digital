import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import type { Rol } from '../../api/auth';

const DESCRIPCION_POR_ROL: Record<Rol, string> = {
  ADMIN: 'Gestión de usuarios, padrón estudiantil, catálogos y configuración de la facultad.',
  DOCENTE: 'Bandeja de revisión, detección de plagio y evaluación de trabajos.',
  ESTUDIANTE: 'Registro de tus trabajos y carga de documentos por fase.',
};

/** Dashboard inicial de cada rol. Los modulos de cada rol llegan en los sprints 2 a 4. */
@Component({
  selector: 'app-inicio',
  imports: [RouterLink],
  template: `
    @if (auth.usuario(); as usuario) {
      <section class="card">
        <h1>Bienvenido, {{ usuario.nombre }}</h1>
        <p class="muted">{{ descripcion() }}</p>
        @if (usuario.rol === 'ADMIN') {
          <p><a class="btn btn-primary" routerLink="/admin/catalogos">Gestionar catálogos</a></p>
          <p class="muted">Usuarios, padrón y configuración se habilitarán próximamente.</p>
        } @else if (usuario.rol === 'DOCENTE') {
          <p>
            <a class="btn btn-primary" routerLink="/docente/revision"
              >Ir a la bandeja de revisión</a
            >
          </p>
        } @else {
          <p><a class="btn btn-primary" routerLink="/estudiante/trabajos">Ir a mis trabajos</a></p>
        }
        <p>
          <a class="btn btn-outline" routerLink="/repositorio">Explorar el repositorio</a>
          <span class="muted texto-chico"> Trabajos evaluados de la facultad.</span>
        </p>
        @if (!usuario.twoFactorEnabled) {
          <p class="alert alert-info">
            Protege tu cuenta activando la
            <a routerLink="/perfil/seguridad">verificación en dos pasos</a>.
          </p>
        }
      </section>
    }
  `,
})
export class InicioComponent {
  protected readonly auth = inject(AuthService);
  protected readonly descripcion = computed(() => {
    const rol = this.auth.usuario()?.rol;
    return rol ? DESCRIPCION_POR_ROL[rol] : '';
  });
}
