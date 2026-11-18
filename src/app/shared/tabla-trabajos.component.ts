import { Component, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { TrabajoResumen } from '../api/work';
import { EstadoTrabajoComponent } from './estado-trabajo';
import { fechaAbsoluta, fechaRelativa } from './fecha-relativa';

/**
 * Tabla de trabajos (Mis trabajos y Bandeja de revision). Toda la fila lleva al detalle
 * `/trabajos/:id`; el titulo es ademas un enlace real para teclado y lectores de pantalla.
 */
@Component({
  selector: 'app-tabla-trabajos',
  imports: [RouterLink, EstadoTrabajoComponent],
  template: `
    <table class="table tabla-trabajos" [attr.aria-busy]="ocupada()">
      <caption class="sr-only">
        {{
          titulo()
        }}
      </caption>
      <thead>
        <tr>
          <th scope="col">Título</th>
          @if (mostrarAutores()) {
            <th scope="col">Autores</th>
          }
          <th scope="col">Materia y grupo</th>
          <th scope="col">Estado</th>
          <th scope="col">{{ mostrarAutores() ? 'Enviado' : 'Actualizado' }}</th>
        </tr>
      </thead>
      <tbody>
        @for (t of trabajos(); track t.idTrabajo) {
          <tr class="fila-clicable" (click)="abrir(t)">
            <td data-label="Título">
              <a [routerLink]="['/trabajos', t.idTrabajo]" (click)="$event.stopPropagation()">{{
                t.titulo
              }}</a>
              <div class="muted texto-chico">{{ t.tipoTrabajo }}</div>
            </td>
            @if (mostrarAutores()) {
              <td data-label="Autores">{{ t.autores.join(', ') }}</td>
            }
            <td data-label="Materia y grupo">
              {{ t.siglaMateria }} — {{ t.nombreMateria }}
              <div class="muted texto-chico">Grupo {{ t.grupo }} · {{ t.periodo }}</div>
            </td>
            <td data-label="Estado"><app-estado-trabajo [estado]="t.estado" /></td>
            <td [attr.data-label]="mostrarAutores() ? 'Enviado' : 'Actualizado'">
              @if (fechaDe(t); as fecha) {
                <time [attr.datetime]="fecha" [title]="absoluta(fecha)">{{ relativa(fecha) }}</time>
              } @else {
                —
              }
            </td>
          </tr>
        }
      </tbody>
    </table>
  `,
})
export class TablaTrabajosComponent {
  private readonly router = inject(Router);

  readonly trabajos = input.required<TrabajoResumen[]>();
  readonly titulo = input('Trabajos');
  /** Bandeja: muestra autores y la fecha de envio en lugar de la de actualizacion. */
  readonly mostrarAutores = input(false);
  readonly ocupada = input(false);

  protected readonly relativa = (iso: string) => fechaRelativa(iso);
  protected readonly absoluta = (iso: string) => fechaAbsoluta(iso);

  protected fechaDe(t: TrabajoResumen): string | null {
    return this.mostrarAutores() ? (t.fechaEnvio ?? t.fechaActualizacion) : t.fechaActualizacion;
  }

  protected abrir(t: TrabajoResumen): void {
    void this.router.navigate(['/trabajos', t.idTrabajo]);
  }
}
