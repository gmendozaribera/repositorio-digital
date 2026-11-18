import { inject, Injectable, signal } from '@angular/core';
import { map, Observable, tap } from 'rxjs';
import type { EstadoAccesoPublico, PaginaRepositorio, TrabajoPublico } from '../../api/work';
import { PublicoService } from '../../api/work/services/publico.service';
import { data, FiltroRepositorio, filtroRepositorioParaApi } from './trabajo.service';

/**
 * Fachada de los endpoints anonimos de work-service (`/api/v1/publico/**`): el repositorio que se
 * puede consultar SIN iniciar sesion, solo con los trabajos de las facultades que habilitaron el
 * acceso externo.
 *
 * Seguridad: estas peticiones salen sin token (el jwtInterceptor no agrega el Bearer a
 * `/publico/**`). Asi un visitante y un usuario con sesion ven exactamente lo mismo aqui, y el
 * token nunca viaja a un endpoint que no lo necesita. Descargar archivos sigue exigiendo sesion.
 *
 * Limite: el backend responde 429 con `Retry-After` si un visitante hace demasiadas consultas por
 * minuto (work-api 1.3.0). El buscador lo muestra con cuenta regresiva (`TEXTOS_CONSULTAS`).
 */
@Injectable({ providedIn: 'root' })
export class RepositorioPublicoService {
  private readonly api = inject(PublicoService);
  private readonly habilitadas = signal<readonly number[] | null>(null);

  /**
   * Ids de las facultades con acceso externo segun la ultima consulta de `estado()` (null si aun
   * no se consulto). El buscador publico solo ofrece estas facultades en su filtro.
   */
  readonly facultadesHabilitadas = this.habilitadas.asReadonly();

  /** `habilitado = true` si al menos una facultad permite el acceso anonimo. */
  estado(): Observable<EstadoAccesoPublico> {
    return this.api.obtenerEstadoAccesoPublico().pipe(
      map(data),
      tap((e) => this.habilitadas.set(e.facultades)),
    );
  }

  buscar(filtro?: FiltroRepositorio): Observable<PaginaRepositorio> {
    return this.api.buscarRepositorioPublico(filtroRepositorioParaApi(filtro)).pipe(map(data));
  }

  /** 404 si no existe, no esta EVALUADO o su facultad no tiene acceso externo. */
  obtener(id: number): Observable<TrabajoPublico> {
    return this.api.obtenerTrabajoPublicoAnonimo({ id }).pipe(map(data));
  }
}
