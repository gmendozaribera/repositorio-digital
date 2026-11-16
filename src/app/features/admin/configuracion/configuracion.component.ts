import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/** Marco de Configuracion: pestañas Facultad / Correo (SMTP) + la pantalla elegida. */
@Component({
  selector: 'app-configuracion',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <nav class="subnav" aria-label="Configuración">
      @for (p of pestanas; track p.ruta) {
        <a [routerLink]="p.ruta" routerLinkActive="active" ariaCurrentWhenActive="page">{{
          p.texto
        }}</a>
      }
    </nav>
    <section class="card">
      <router-outlet />
    </section>
  `,
})
export class ConfiguracionComponent {
  protected readonly pestanas = [
    { ruta: 'facultad', texto: 'Facultad' },
    { ruta: 'correo', texto: 'Correo (SMTP)' },
  ];
}
