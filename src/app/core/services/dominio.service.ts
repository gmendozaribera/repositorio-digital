import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import type { ActualizarDominioRequest, CrearDominioRequest, Dominio } from '../../api/user';
import { DominiosService } from '../../api/user/services/dominios.service';

const data = <T>(r: { data: T }) => r.data;

/**
 * Fachada sobre el cliente generado de los parametros del sistema (tabla de dominio, user-service).
 * Solo ADMIN. Los servicios leen estos valores con cache, pero toda escritura la invalida: el
 * cambio se aplica en todo el sistema al instante.
 */
@Injectable({ providedIn: 'root' })
export class DominioService {
  private readonly api = inject(DominiosService);

  /** Ordenados por grupo y nombre. Sin `grupo` devuelve todos (la tabla es chica, sin paginar). */
  listar(grupo?: string): Observable<Dominio[]> {
    const domainGroup = grupo?.trim();
    return this.api.listarDominios(domainGroup ? { domainGroup } : {}).pipe(map(data));
  }

  /** `domainGroup` + `domainName` es unico (409). El backend los guarda en MAYUSCULAS. */
  crear(body: CrearDominioRequest): Observable<Dominio> {
    return this.api.crearDominio({ body }).pipe(map(data));
  }

  /** Solo cambia el valor y la descripcion; grupo y nombre no se modifican. */
  actualizar(id: number, body: ActualizarDominioRequest): Observable<Dominio> {
    return this.api.actualizarDominio({ id, body }).pipe(map(data));
  }

  /** Borrado fisico. Los parametros con `sistema = true` responden 409. */
  eliminar(id: number): Observable<void> {
    return this.api.eliminarDominio({ id }).pipe(map(() => undefined));
  }
}
