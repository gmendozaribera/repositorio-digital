import { Component, computed, input } from '@angular/core';
import type { EstadoTrabajo } from '../api/work';

/**
 * Estados del trabajo (work-api.yaml) con su texto y su clase de color. La paleta es la del
 * modelo (constante STATES): PENDIENTE ambar, EN_REVISION azul, APROBADO verde,
 * CON_OBSERVACIONES verde azulado, RECHAZADO rojo, EVALUADO violeta y BORRADOR gris.
 */
export const ESTADOS_TRABAJO: { valor: EstadoTrabajo; texto: string; descripcion: string }[] = [
  { valor: 'BORRADOR', texto: 'Borrador', descripcion: 'Aún no fue enviado a revisión.' },
  {
    valor: 'PENDIENTE',
    texto: 'Pendiente',
    descripcion: 'Enviado; espera que un docente del grupo lo revise.',
  },
  { valor: 'EN_REVISION', texto: 'En revisión', descripcion: 'Un docente lo está revisando.' },
  { valor: 'APROBADO', texto: 'Aprobado', descripcion: 'Aprobado sin observaciones.' },
  {
    valor: 'APROBADO_CON_OBSERVACIONES',
    texto: 'Aprobado con observaciones',
    descripcion: 'Aprobado, pero se debe subir una versión corregida y reenviarlo.',
  },
  {
    valor: 'RECHAZADO',
    texto: 'Rechazado',
    descripcion: 'Rechazado; se puede corregir y volver a enviar.',
  },
  { valor: 'EVALUADO', texto: 'Evaluado', descripcion: 'Calificado y publicado.' },
];

export function textoEstado(estado: EstadoTrabajo | string | null | undefined): string {
  return ESTADOS_TRABAJO.find((e) => e.valor === estado)?.texto ?? estado ?? '';
}

/** Clase CSS del badge: `estado-trabajo estado-en-revision`, etc. */
export function claseEstado(estado: EstadoTrabajo | string | null | undefined): string {
  return `badge estado-trabajo estado-${String(estado ?? '')
    .toLowerCase()
    .replaceAll('_', '-')}`;
}

/** Badge de color del estado de un trabajo. */
@Component({
  selector: 'app-estado-trabajo',
  template: `<span [class]="clase()" [title]="descripcion()">{{ texto() }}</span>`,
})
export class EstadoTrabajoComponent {
  readonly estado = input.required<EstadoTrabajo | string>();
  protected readonly texto = computed(() => textoEstado(this.estado()));
  protected readonly clase = computed(() => claseEstado(this.estado()));
  protected readonly descripcion = computed(
    () => ESTADOS_TRABAJO.find((e) => e.valor === this.estado())?.descripcion ?? '',
  );
}
