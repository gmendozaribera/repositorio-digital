import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Rol } from '../../core/models/auth.models';

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
        <p class="muted">Los módulos de tu rol se habilitarán en los próximos sprints.</p>
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
