const FORMATO = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
const FORMATO_ABSOLUTO = new Intl.DateTimeFormat('es-BO', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** [unidad, segundos que dura]: de la mas grande a la mas chica. */
const UNIDADES: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** "hace un momento", "hace 5 minutos", "ayer", "hace 3 semanas"... */
export function fechaRelativa(iso: string, ahora: number = Date.now()): string {
  const fecha = Date.parse(iso);
  if (Number.isNaN(fecha)) {
    return '';
  }
  const segundos = Math.round((fecha - ahora) / 1000);
  for (const [unidad, duracion] of UNIDADES) {
    if (Math.abs(segundos) >= duracion) {
      return FORMATO.format(Math.round(segundos / duracion), unidad);
    }
  }
  return 'hace un momento';
}

/** Fecha y hora completas (para el atributo title). */
export function fechaAbsoluta(iso: string): string {
  const fecha = Date.parse(iso);
  return Number.isNaN(fecha) ? '' : FORMATO_ABSOLUTO.format(fecha);
}
