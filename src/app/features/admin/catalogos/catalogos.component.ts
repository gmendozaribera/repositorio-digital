import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/** Marco del modulo Catalogos: pestañas por catalogo + la pantalla elegida. */
@Component({
  selector: 'app-catalogos',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <nav class="subnav" aria-label="Catálogos">
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
export class CatalogosComponent {
  protected readonly pestanas = [
    { ruta: 'facultades', texto: 'Facultades' },
    { ruta: 'carreras', texto: 'Carreras' },
    { ruta: 'materias', texto: 'Materias' },
    { ruta: 'semestres', texto: 'Semestres' },
    { ruta: 'grupos', texto: 'Grupos' },
    { ruta: 'fases', texto: 'Fases' },
    { ruta: 'tipos-trabajo', texto: 'Tipos de trabajo' },
  ];
}
