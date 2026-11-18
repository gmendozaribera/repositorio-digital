import { Injectable, signal } from '@angular/core';
import type { ParamMap, Params } from '@angular/router';
import type { FiltroRepositorio } from '../../core/services/trabajo.service';

/** Tamano de pagina por defecto del buscador (el paginador ofrece 10, 20, 50 y 100). */
export const TAMANO_REPOSITORIO = 10;
export const MAX_Q = 100;
export const MAX_HASHTAG = 50;

/**
 * Estado del buscador tal como vive en la URL (`/repositorio?q=...&idFacultad=1&pagina=2`).
 * La URL es la fuente de verdad: asi la busqueda se puede compartir y atras/adelante funciona.
 * `pagina` aqui empieza en 0 (como el backend); en la URL se muestra desde 1.
 */
export interface FiltrosRepositorio {
  q: string;
  hashtag: string;
  idFacultad: number | null;
  idCarrera: number | null;
  idMateria: number | null;
  idSemestre: number | null;
  idTipoTrabajo: number | null;
  /** Depende de materia + semestre: sin ambos se descarta. */
  idGrupo: number | null;
  pagina: number;
  tamano: number;
}

const IDS = [
  'idFacultad',
  'idCarrera',
  'idMateria',
  'idSemestre',
  'idGrupo',
  'idTipoTrabajo',
] as const;

/** Entero positivo o null (cualquier otra cosa en la URL se ignora). */
function entero(valor: string | null): number | null {
  if (!valor || !/^\d{1,9}$/.test(valor)) {
    return null;
  }
  const n = Number(valor);
  return n >= 1 ? n : null;
}

export function normalizarHashtag(valor: string | null | undefined): string {
  return (valor ?? '').trim().replace(/^#+/, '').trim().slice(0, MAX_HASHTAG);
}

export function filtrosDeUrl(p: ParamMap): FiltrosRepositorio {
  const tamano = entero(p.get('tamano'));
  const pagina = entero(p.get('pagina'));
  const idMateria = entero(p.get('idMateria'));
  const idSemestre = entero(p.get('idSemestre'));
  return {
    q: (p.get('q') ?? '').trim().slice(0, MAX_Q),
    hashtag: normalizarHashtag(p.get('hashtag')),
    idFacultad: entero(p.get('idFacultad')),
    idCarrera: entero(p.get('idCarrera')),
    idMateria,
    idSemestre,
    idTipoTrabajo: entero(p.get('idTipoTrabajo')),
    idGrupo: idMateria !== null && idSemestre !== null ? entero(p.get('idGrupo')) : null,
    pagina: pagina ? pagina - 1 : 0,
    tamano: tamano && tamano <= 100 ? tamano : TAMANO_REPOSITORIO,
  };
}

/** Query params sin vacios ni valores por defecto (URL corta y estable). */
export function urlDeFiltros(f: FiltrosRepositorio): Params {
  const params: Params = {};
  if (f.q) params['q'] = f.q;
  if (f.hashtag) params['hashtag'] = f.hashtag;
  for (const k of IDS) {
    if (f[k] !== null) params[k] = String(f[k]);
  }
  if (f.pagina > 0) params['pagina'] = String(f.pagina + 1);
  if (f.tamano !== TAMANO_REPOSITORIO) params['tamano'] = String(f.tamano);
  return params;
}

export function mismaBusqueda(a: FiltrosRepositorio, b: FiltrosRepositorio): boolean {
  return JSON.stringify(urlDeFiltros(a)) === JSON.stringify(urlDeFiltros(b));
}

/** Hay algun filtro de busqueda (la pagina y el tamano no cuentan). */
export function tieneFiltros(f: FiltrosRepositorio): boolean {
  return !!f.q || !!f.hashtag || IDS.some((k) => f[k] !== null);
}

export function aFiltroApi(f: FiltrosRepositorio): FiltroRepositorio {
  return {
    q: f.q,
    hashtag: f.hashtag,
    idFacultad: f.idFacultad ?? undefined,
    idCarrera: f.idCarrera ?? undefined,
    idMateria: f.idMateria ?? undefined,
    idSemestre: f.idSemestre ?? undefined,
    idTipoTrabajo: f.idTipoTrabajo ?? undefined,
    idGrupo: f.idGrupo ?? undefined,
    pagina: f.pagina,
    tamano: f.tamano,
  };
}

/**
 * Ultima busqueda hecha en el repositorio, para que "Volver a los resultados" de la ficha regrese
 * a la misma busqueda y pagina (aunque se haya entrado a la ficha desde otro enlace).
 */
@Injectable({ providedIn: 'root' })
export class UltimaBusquedaRepositorio {
  readonly params = signal<Params>({});
}
