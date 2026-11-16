import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import type {
  ActualizarUsuarioRequest,
  CrearUsuarioRequest,
  EstudianteHabilitado,
  PaginaPadron,
  PaginaUsuarios,
  ResultadoImportacion,
  Rol,
  TipoUsuario,
  Usuario,
} from '../../api/user';
import { PadronService } from '../../api/user/services/padron.service';
import { TiposUsuarioService } from '../../api/user/services/tipos-usuario.service';
import { UsuariosService } from '../../api/user/services/usuarios.service';

/** Paginacion de user-service: `pagina` empieza en 0, `tamano` entre 1 y 100. */
export interface Paginacion {
  pagina?: number;
  tamano?: number;
}

export interface FiltroUsuarios extends Paginacion {
  q?: string;
  rol?: Rol;
  idCarrera?: number;
  incluirInactivos?: boolean;
}

export interface FiltroPadron extends Paginacion {
  q?: string;
  idCarrera?: number;
  registrado?: boolean;
  habilitado?: boolean;
}

/** Quita los filtros vacios (y los textos en blanco) para no mandar `?q=` al backend. */
function sinVacios<F extends object>(filtro: F | undefined): F {
  return Object.fromEntries(
    Object.entries(filtro ?? {})
      .map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])
      .filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ) as F;
}

const data = <T>(r: { data: T }) => r.data;

/**
 * Fachada sobre el cliente generado de user-service (src/app/api/user): desenvuelve
 * `{ data, message, status, timestamp }`. Todos estos endpoints son solo ADMIN.
 */
@Injectable({ providedIn: 'root' })
export class UsuarioService {
  private readonly usuariosApi = inject(UsuariosService);
  private readonly tiposApi = inject(TiposUsuarioService);
  private readonly padronApi = inject(PadronService);

  // ------------------------------------------------------------------ Usuarios

  listar(filtro?: FiltroUsuarios): Observable<PaginaUsuarios> {
    return this.usuariosApi.listarUsuarios(sinVacios(filtro)).pipe(map(data));
  }

  /** Busca docentes activos por texto (para asignarlos a un grupo). */
  buscarDocentes(q: string, tamano = 10): Observable<Usuario[]> {
    return this.listar({ q, rol: 'DOCENTE', tamano }).pipe(map((p) => p.contenido));
  }

  crear(body: CrearUsuarioRequest): Observable<Usuario> {
    return this.usuariosApi.crearUsuario({ body }).pipe(map(data));
  }

  /** El login (`usuario`) no se modifica. Para reactivar se envia `estado: 1`. */
  actualizar(id: number, body: ActualizarUsuarioRequest): Observable<Usuario> {
    return this.usuariosApi.actualizarUsuario({ id, body }).pipe(map(data));
  }

  /** Borrado logico: estado = 0 y cierre de todas sus sesiones. */
  desactivar(id: number): Observable<Usuario> {
    return this.usuariosApi.desactivarUsuario({ id }).pipe(map(data));
  }

  /** Asigna una contraseña temporal, obliga a cambiarla y cierra todas las sesiones del usuario. */
  restablecerPassword(id: number, passwordNueva: string): Observable<void> {
    return this.usuariosApi
      .restablecerPassword({ id, body: { passwordNueva } })
      .pipe(map(() => undefined));
  }

  tiposUsuario(): Observable<TipoUsuario[]> {
    return this.tiposApi.listarTiposUsuario().pipe(map(data));
  }

  // ------------------------------------------------------------------ Padron

  listarPadron(filtro?: FiltroPadron): Observable<PaginaPadron> {
    return this.padronApi.listarPadron(sinVacios(filtro)).pipe(map(data));
  }

  /** Sube el archivo (multipart, campo `archivo`). Las filas con error vienen en el resultado. */
  importarPadron(archivo: File): Observable<ResultadoImportacion> {
    return this.padronApi.importarPadron({ body: { archivo } }).pipe(map(data));
  }

  cambiarHabilitado(id: number, habilitado: boolean): Observable<EstudianteHabilitado> {
    return this.padronApi.actualizarHabilitadoPadron({ id, body: { habilitado } }).pipe(map(data));
  }
}
