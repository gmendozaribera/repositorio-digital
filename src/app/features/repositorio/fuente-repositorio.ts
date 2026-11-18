import { inject, InjectionToken } from '@angular/core';
import type { Observable } from 'rxjs';
import type { PaginaRepositorio, TrabajoPublico } from '../../api/work';
import { RepositorioPublicoService } from '../../core/services/repositorio-publico.service';
import { FiltroRepositorio, TrabajoService } from '../../core/services/trabajo.service';

/**
 * De donde sacan los datos el buscador y la ficha del repositorio. Los mismos componentes sirven
 * a dos modos:
 * - autenticado (`/repositorio`, por defecto): endpoints con token, filtros de catalogo y descarga.
 * - publico (`/explorar`, sin login): endpoints anonimos `/publico/**`; los catalogos (facultad,
 *   materia...) exigen sesion, asi que solo hay busqueda por texto y hashtag, y para descargar
 *   se pide iniciar sesion.
 */
export interface FuenteRepositorio {
  readonly publico: boolean;
  /** Ruta base del buscador; la ficha es `${base}/:id`. */
  readonly base: string;
  buscar(filtro: FiltroRepositorio): Observable<PaginaRepositorio>;
  obtener(id: number): Observable<TrabajoPublico>;
}

export const FUENTE_REPOSITORIO = new InjectionToken<FuenteRepositorio>('FUENTE_REPOSITORIO', {
  providedIn: 'root',
  factory: () => {
    const trabajos = inject(TrabajoService);
    return {
      publico: false,
      base: '/repositorio',
      buscar: (f) => trabajos.buscarEnRepositorio(f),
      obtener: (id) => trabajos.obtenerPublico(id),
    };
  },
});

/** Para los `providers` de la ruta `/explorar`. */
export function fuentePublica(): FuenteRepositorio {
  const publico = inject(RepositorioPublicoService);
  return {
    publico: true,
    base: '/explorar',
    buscar: (f) => publico.buscar(f),
    obtener: (id) => publico.obtener(id),
  };
}
