import { HttpClient, HttpEventType, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { filter, map, Observable } from 'rxjs';
import type {
  CategoriaDocumento,
  Documento,
  EnlaceRequest,
  EstadoTrabajo,
  PaginaRepositorio,
  PaginaTrabajos,
  ReglasDocumentos,
  RespuestaDocumento,
  Trabajo,
  TrabajoPublico,
  TrabajoRequest,
} from '../../api/work';
import { ApiConfiguration } from '../../api/work/api-configuration';
import { subirDocumento } from '../../api/work/fn/documentos/subir-documento';
import { RequestBuilder } from '../../api/work/request-builder';
import { DocumentosService } from '../../api/work/services/documentos.service';
import { RepositorioService } from '../../api/work/services/repositorio.service';
import { RevisionService } from '../../api/work/services/revision.service';
import { TrabajosService } from '../../api/work/services/trabajos.service';
import { nombreDeContentDisposition } from '../../shared/archivos';

/** Paginacion de work-service: `pagina` empieza en 0, `tamano` entre 1 y 100. */
export interface FiltroTrabajos {
  estado?: EstadoTrabajo;
  pagina?: number;
  tamano?: number;
}

export interface FiltroRevision extends FiltroTrabajos {
  idGrupo?: number;
}

/**
 * Busqueda en el repositorio (solo trabajos EVALUADO). Todos los filtros se combinan (Y).
 * `q` es full-text sobre titulo, resumen y hashtags (frases entre comillas, `-palabra` excluye;
 * con `q` el orden es por relevancia); `hashtag` es exacto y sin '#'.
 */
export interface FiltroRepositorio {
  q?: string;
  hashtag?: string;
  idGrupo?: number;
  idFacultad?: number;
  idCarrera?: number;
  idMateria?: number;
  idSemestre?: number;
  idTipoTrabajo?: number;
  pagina?: number;
  tamano?: number;
}

export interface SubidaDocumento {
  archivo: File;
  titulo: string;
  descripcion?: string;
  categoria: CategoriaDocumento;
  idFase: number;
}

/** Eventos de una subida: progreso (0..100) y, al final, el documento creado. */
export type EventoSubida =
  { tipo: 'progreso'; porcentaje: number } | { tipo: 'completo'; documento: Documento };

export interface ArchivoDescargado {
  blob: Blob;
  nombre: string;
}

function sinVacios<F extends object>(filtro: F | undefined): F {
  return Object.fromEntries(
    Object.entries(filtro ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ) as F;
}

export const data = <T>(r: { data: T }) => r.data;

/**
 * Filtros del repositorio listos para el backend: sin vacios (`?q=` filtraria por "nada"), texto
 * recortado y hashtag sin '#'. Lo comparten el repositorio autenticado y el publico.
 */
export function filtroRepositorioParaApi(filtro?: FiltroRepositorio): FiltroRepositorio {
  const f = sinVacios(filtro);
  if (typeof f.q === 'string') {
    f.q = f.q.trim() || undefined;
  }
  if (typeof f.hashtag === 'string') {
    f.hashtag = f.hashtag.trim().replace(/^#+/, '') || undefined;
  }
  return sinVacios(f);
}

/**
 * Fachada sobre el cliente generado de work-service (src/app/api/work): desenvuelve
 * `{ data, message, status, timestamp }`.
 *
 * Los permisos los decide el backend: el detalle trae `acciones` con lo que el usuario puede
 * hacer ahora y la pantalla solo muestra esos botones (el servidor lo vuelve a validar).
 */
@Injectable({ providedIn: 'root' })
export class TrabajoService {
  private readonly trabajosApi = inject(TrabajosService);
  private readonly revisionApi = inject(RevisionService);
  private readonly documentosApi = inject(DocumentosService);
  private readonly repositorioApi = inject(RepositorioService);
  private readonly config = inject(ApiConfiguration);
  private readonly http = inject(HttpClient);

  // ------------------------------------------------------------------ Trabajos

  /** Trabajos del estudiante autenticado (autor o coautor), del mas reciente al mas antiguo. */
  misTrabajos(filtro?: FiltroTrabajos): Observable<PaginaTrabajos> {
    return this.trabajosApi.listarMisTrabajos(sinVacios(filtro)).pipe(map(data));
  }

  /**
   * Bandeja del docente (ADMIN ve todos). Sin `estado` el backend devuelve PENDIENTE y
   * EN_REVISION, los mas antiguos primero.
   */
  bandeja(filtro?: FiltroRevision): Observable<PaginaTrabajos> {
    return this.revisionApi.listarTrabajosRevision(sinVacios(filtro)).pipe(map(data));
  }

  obtener(id: number): Observable<Trabajo> {
    return this.trabajosApi.obtenerTrabajo({ id }).pipe(map(data));
  }

  crear(body: TrabajoRequest): Observable<Trabajo> {
    return this.trabajosApi.crearTrabajo({ body }).pipe(map(data));
  }

  actualizar(id: number, body: TrabajoRequest): Observable<Trabajo> {
    return this.trabajosApi.actualizarTrabajo({ id, body }).pipe(map(data));
  }

  /** Solo en BORRADOR (409 en otro estado). Borra tambien sus archivos. */
  eliminar(id: number): Observable<void> {
    return this.trabajosApi.eliminarTrabajo({ id }).pipe(map(() => undefined));
  }

  /** A PENDIENTE. 400 si no tiene al menos un documento PDF. */
  enviar(id: number): Observable<Trabajo> {
    return this.trabajosApi.enviarTrabajo({ id }).pipe(map(data));
  }

  // ------------------------------------------------------------------ Revision

  tomarRevision(id: number): Observable<Trabajo> {
    return this.revisionApi.tomarRevision({ id }).pipe(map(data));
  }

  /** Sin observaciones (o en blanco) -> APROBADO; con texto -> APROBADO_CON_OBSERVACIONES. */
  aprobar(id: number, observaciones: string | null): Observable<Trabajo> {
    const texto = observaciones?.trim() || null;
    return this.revisionApi.aprobarTrabajo({ id, body: { observaciones: texto } }).pipe(map(data));
  }

  rechazar(id: number, motivo: string): Observable<Trabajo> {
    return this.revisionApi
      .rechazarTrabajo({ id, body: { motivo: motivo.trim() } })
      .pipe(map(data));
  }

  /**
   * Califica y publica (Administrador de Curso del grupo; solo desde APROBADO). El trabajo pasa a
   * EVALUADO y queda visible en el repositorio. 400 si la nota esta fuera de 0..escalaCalifMax.
   */
  calificar(id: number, calificacion: number): Observable<Trabajo> {
    return this.revisionApi.calificarTrabajo({ id, body: { calificacion } }).pipe(map(data));
  }

  // ------------------------------------------------------------------ Repositorio (CU11)

  /**
   * Trabajos evaluados (publicados). Con `q`, por relevancia; sin `q`, mas recientes primero.
   * Cualquier rol autenticado. No manda filtros vacios.
   */
  buscarEnRepositorio(filtro?: FiltroRepositorio): Observable<PaginaRepositorio> {
    return this.repositorioApi.buscarRepositorio(filtroRepositorioParaApi(filtro)).pipe(map(data));
  }

  /** Ficha publica: sin calificacion, observaciones ni historial. 404 si no esta EVALUADO. */
  obtenerPublico(id: number): Observable<TrabajoPublico> {
    return this.repositorioApi.obtenerTrabajoRepositorio({ id }).pipe(map(data));
  }

  // ------------------------------------------------------------------ Documentos

  /** Formatos, tamanos maximos y hosts de enlaces permitidos en la facultad. */
  reglas(idFacultad: number): Observable<ReglasDocumentos> {
    return this.documentosApi.obtenerReglasDocumentos({ idFacultad }).pipe(map(data));
  }

  /**
   * Sube un archivo informando el progreso. Usa el mismo RequestBuilder y la misma ruta que el
   * cliente generado (`subirDocumento`), pero pide los eventos de progreso, que la funcion
   * generada descarta. Un 429 (limite de subidas por minuto) llega como error con `Retry-After`.
   */
  subir(idTrabajo: number, subida: SubidaDocumento): Observable<EventoSubida> {
    const rb = new RequestBuilder(this.config.rootUrl, subirDocumento.PATH, 'post');
    rb.path('id', idTrabajo, {});
    rb.body(
      {
        archivo: subida.archivo,
        titulo: subida.titulo.trim(),
        descripcion: subida.descripcion?.trim() || undefined,
        categoria: subida.categoria,
        idFase: subida.idFase,
      },
      'multipart/form-data',
    );
    const req = rb.build<RespuestaDocumento>({
      responseType: 'json',
      accept: 'application/json',
      reportProgress: true,
    });
    return this.http.request<RespuestaDocumento>(req).pipe(
      filter(
        (e) =>
          e.type === HttpEventType.UploadProgress ||
          (e.type === HttpEventType.Response && e instanceof HttpResponse),
      ),
      map((e): EventoSubida => {
        if (e.type === HttpEventType.UploadProgress) {
          const total = e.total ?? subida.archivo.size;
          const porcentaje = total ? Math.min(100, Math.round((e.loaded / total) * 100)) : 0;
          return { tipo: 'progreso', porcentaje };
        }
        const respuesta = e as HttpResponse<RespuestaDocumento>;
        return { tipo: 'completo', documento: respuesta.body!.data };
      }),
    );
  }

  agregarEnlace(idTrabajo: number, body: EnlaceRequest): Observable<Documento> {
    return this.documentosApi.agregarEnlace({ id: idTrabajo, body }).pipe(map(data));
  }

  eliminarDocumento(idDocumento: number): Observable<void> {
    return this.documentosApi.eliminarDocumento({ id: idDocumento }).pipe(map(() => undefined));
  }

  /**
   * Descarga un archivo con el token (HttpClient + blob) y toma el nombre de
   * `Content-Disposition`. Nunca se abre la URL directa: el navegador no enviaria el Bearer.
   */
  descargar(
    documento: Pick<Documento, 'idDocumento' | 'nombreArchivo'>,
  ): Observable<ArchivoDescargado> {
    const porDefecto = documento.nombreArchivo || `documento-${documento.idDocumento}`;
    return this.documentosApi.descargarDocumento$Response({ id: documento.idDocumento }).pipe(
      map((r) => ({
        blob: r.body,
        nombre: nombreDeContentDisposition(r.headers.get('Content-Disposition'), porDefecto),
      })),
    );
  }
}
