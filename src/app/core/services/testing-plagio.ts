import type { Analisis, EstadoAnalisisResumen } from '../../api/plagio';

/** Datos de prueba de plagiarism-service (solo para los .spec.ts). */

export function analisisDePrueba(cambios: Partial<Analisis> = {}): Analisis {
  return {
    idAnalisis: 3,
    idTrabajo: 7,
    estado: 'COMPLETADO',
    motor: 'COPYLEAKS',
    porcentajeSimilitud: 34.25,
    nivel: 'MEDIO',
    umbralMedio: 30,
    umbralAlto: 50,
    comparacionInternet: true,
    fuentes: [
      {
        tipo: 'INTERNA',
        titulo: 'Sistema de inventarios para PYMES',
        url: null,
        idTrabajo: 12,
        porcentaje: 21.5,
      },
      {
        tipo: 'INTERNET',
        titulo: 'Gestión de inventarios — Wikipedia',
        url: 'https://es.wikipedia.org/wiki/Inventario',
        idTrabajo: null,
        porcentaje: 8,
      },
      {
        tipo: 'INTERNET',
        titulo: 'Sitio sin https',
        url: 'javascript:alert(1)',
        idTrabajo: null,
        porcentaje: 4.75,
      },
    ],
    documentosAnalizados: 2,
    mensajeError: null,
    iniciadoPor: 'María López',
    fechaInicio: '2026-11-17T14:00:00Z',
    fechaFin: '2026-11-17T14:03:00Z',
    ...cambios,
  };
}

/** Analisis recien iniciado (202 del POST o ultimo analisis en curso). */
export function analisisEnProceso(cambios: Partial<Analisis> = {}): Analisis {
  return analisisDePrueba({
    idAnalisis: 4,
    estado: 'EN_PROCESO',
    porcentajeSimilitud: null,
    nivel: null,
    fuentes: [],
    documentosAnalizados: 0,
    fechaFin: null,
    ...cambios,
  });
}

export function estadoDePrueba(
  estado: EstadoAnalisisResumen['estado'],
  cambios: Partial<EstadoAnalisisResumen> = {},
): EstadoAnalisisResumen {
  return { idAnalisis: 4, estado, porcentajeSimilitud: null, nivel: null, ...cambios };
}

/** ProblemDetail (RFC 7807) como lo devuelve el backend. */
export function problema(status: number, detail: string, title = 'Error') {
  return { status, title, detail, timestamp: '2026-11-17T14:00:00Z' };
}
