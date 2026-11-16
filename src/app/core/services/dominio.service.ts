import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import type { ActualizarDominioRequest, CrearDominioRequest, Dominio } from '../../api/user';
import { ConfigSmtpService } from '../../api/user/services/config-smtp.service';
import { DominiosService } from '../../api/user/services/dominios.service';

const data = <T>(r: { data: T }) => r.data;

/** Grupo de la tabla de dominio con la configuracion del correo saliente (SMTP). */
export const GRUPO_SMTP = 'SMTP_GROUP';

/**
 * Fachada sobre el cliente generado de los parametros del sistema (tabla de dominio, user-service).
 * Solo ADMIN. Los parametros secretos (`secreto = true`, p. ej. la contrasena SMTP) nunca
 * devuelven su valor: `domainValue` llega vacio y `configurado` dice si tiene uno guardado; en el
 * PUT `domainValue` es el valor NUEVO: omitido o null conserva el actual y '' lo borra. Los
 * servicios leen estos valores con cache, pero toda escritura la invalida: el cambio se aplica en todo el sistema al instante.
 */
@Injectable({ providedIn: 'root' })
export class DominioService {
  private readonly api = inject(DominiosService);
  private readonly smtpApi = inject(ConfigSmtpService);

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

  /**
   * Envia un correo de prueba con la configuracion GUARDADA de `SMTP_GROUP` (aunque ACTIVO sea
   * false). 400 si falta HOST, PUERTO o CORREO; 502 si el servidor de correo fallo (motivo en
   * `detail`). Puede tardar hasta 15 segundos.
   */
  probarSmtp(destinatario: string): Observable<void> {
    return this.smtpApi.probarSmtp({ body: { destinatario } }).pipe(map(() => undefined));
  }
}
