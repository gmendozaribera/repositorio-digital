import { Component, computed, input, output } from '@angular/core';

/** Tamaños de pagina ofrecidos (el backend acepta 1..100). */
export const TAMANOS_PAGINA = [10, 20, 50, 100];

/**
 * Controles de paginacion para los listados de user-service (`pagina` empieza en 0).
 * Solo emite eventos: la pantalla decide como recargar.
 */
@Component({
  selector: 'app-paginador',
  template: `
    <nav class="paginador" aria-label="Paginación">
      <span class="muted" aria-live="polite">{{ resumen() }}</span>
      <div class="paginador-controles">
        <label class="paginador-tamano">
          <span>Por página</span>
          <select [value]="tamano()" (change)="tamanoCambiado($any($event.target).value)">
            @for (t of tamanos; track t) {
              <option [value]="t" [selected]="t === tamano()">{{ t }}</option>
            }
          </select>
        </label>
        <button
          class="btn btn-outline btn-sm"
          type="button"
          [disabled]="pagina() === 0"
          (click)="cambiarPagina.emit(pagina() - 1)"
        >
          Anterior
        </button>
        <span>Página {{ pagina() + 1 }} de {{ totalPaginas() || 1 }}</span>
        <button
          class="btn btn-outline btn-sm"
          type="button"
          [disabled]="pagina() + 1 >= totalPaginas()"
          (click)="cambiarPagina.emit(pagina() + 1)"
        >
          Siguiente
        </button>
      </div>
    </nav>
  `,
})
export class PaginadorComponent {
  readonly pagina = input.required<number>();
  readonly tamano = input.required<number>();
  readonly totalElementos = input.required<number>();
  readonly totalPaginas = input.required<number>();

  readonly cambiarPagina = output<number>();
  readonly cambiarTamano = output<number>();

  protected readonly tamanos = TAMANOS_PAGINA;

  protected readonly resumen = computed(() => {
    const total = this.totalElementos();
    if (total === 0) {
      return 'Sin resultados';
    }
    const desde = this.pagina() * this.tamano() + 1;
    const hasta = Math.min(desde + this.tamano() - 1, total);
    return `${desde}–${hasta} de ${total}`;
  });

  protected tamanoCambiado(valor: string): void {
    this.cambiarTamano.emit(Number(valor));
  }
}
