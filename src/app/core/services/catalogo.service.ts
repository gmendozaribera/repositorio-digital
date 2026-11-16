import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import type {
  ActualizarDocenteGrupoRequest,
  AsignarDocenteRequest,
  Carrera,
  CarreraRequest,
  ConfigFacultad,
  ConfigFacultadRequest,
  DocenteGrupo,
  Facultad,
  FacultadRequest,
  Fase,
  FaseRequest,
  Grupo,
  GrupoRequest,
  Materia,
  MateriaRequest,
  Semestre,
  SemestreRequest,
  TipoTrabajo,
  TipoTrabajoRequest,
} from '../../api/catalog';
import { CarrerasService } from '../../api/catalog/services/carreras.service';
import { ConfigFacultadService } from '../../api/catalog/services/config-facultad.service';
import { FacultadesService } from '../../api/catalog/services/facultades.service';
import { FasesService } from '../../api/catalog/services/fases.service';
import { GruposService } from '../../api/catalog/services/grupos.service';
import { MateriasService } from '../../api/catalog/services/materias.service';
import { SemestresService } from '../../api/catalog/services/semestres.service';
import { TiposTrabajoService } from '../../api/catalog/services/tipos-trabajo.service';

/** Filtros comunes de los listados de catalogos (ver catalog-api.yaml). */
export interface FiltroCatalogo {
  idFacultad?: number;
  /** Las pantallas de administracion piden tambien los desactivados para poder reactivarlos. */
  incluirInactivos?: boolean;
}

export interface FiltroGrupos {
  idFacultad?: number;
  idMateria?: number;
  idSemestre?: number;
  incluirInactivos?: boolean;
}

/**
 * Operaciones de un catalogo. No hay borrado fisico: `desactivar` deja estado = 0 y para
 * reactivar se hace `actualizar` con estado = 1.
 */
export interface RecursoCatalogo<T, R, F = FiltroCatalogo> {
  listar(filtro?: F): Observable<T[]>;
  crear(body: R): Observable<T>;
  actualizar(id: number, body: R): Observable<T>;
  desactivar(id: number): Observable<T>;
}

/** Quita los filtros vacios para no mandar `?idFacultad=` al backend. */
function sinVacios<F extends object>(filtro: F | undefined): F {
  return Object.fromEntries(
    Object.entries(filtro ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ) as F;
}

const data = <T>(r: { data: T }) => r.data;

/**
 * Fachada sobre el cliente generado de catalog-service (src/app/api/catalog): desenvuelve
 * `{ data, message, status, timestamp }` y ofrece la misma forma para todos los catalogos.
 * Las lecturas sirven a cualquier rol autenticado; las escrituras el backend solo las acepta de ADMIN.
 */
@Injectable({ providedIn: 'root' })
export class CatalogoService {
  private readonly facultadesApi = inject(FacultadesService);
  private readonly carrerasApi = inject(CarrerasService);
  private readonly materiasApi = inject(MateriasService);
  private readonly semestresApi = inject(SemestresService);
  private readonly gruposApi = inject(GruposService);
  private readonly fasesApi = inject(FasesService);
  private readonly tiposApi = inject(TiposTrabajoService);
  private readonly configApi = inject(ConfigFacultadService);

  readonly facultades: RecursoCatalogo<
    Facultad,
    FacultadRequest,
    Omit<FiltroCatalogo, 'idFacultad'>
  > = {
    listar: (f) => this.facultadesApi.listarFacultades(sinVacios(f)).pipe(map(data)),
    crear: (body) => this.facultadesApi.crearFacultad({ body }).pipe(map(data)),
    actualizar: (id, body) => this.facultadesApi.actualizarFacultad({ id, body }).pipe(map(data)),
    desactivar: (id) => this.facultadesApi.desactivarFacultad({ id }).pipe(map(data)),
  };

  readonly carreras: RecursoCatalogo<Carrera, CarreraRequest> = {
    listar: (f) => this.carrerasApi.listarCarreras(sinVacios(f)).pipe(map(data)),
    crear: (body) => this.carrerasApi.crearCarrera({ body }).pipe(map(data)),
    actualizar: (id, body) => this.carrerasApi.actualizarCarrera({ id, body }).pipe(map(data)),
    desactivar: (id) => this.carrerasApi.desactivarCarrera({ id }).pipe(map(data)),
  };

  readonly materias: RecursoCatalogo<Materia, MateriaRequest> = {
    listar: (f) => this.materiasApi.listarMaterias(sinVacios(f)).pipe(map(data)),
    crear: (body) => this.materiasApi.crearMateria({ body }).pipe(map(data)),
    actualizar: (id, body) => this.materiasApi.actualizarMateria({ id, body }).pipe(map(data)),
    desactivar: (id) => this.materiasApi.desactivarMateria({ id }).pipe(map(data)),
  };

  readonly semestres: RecursoCatalogo<Semestre, SemestreRequest> = {
    listar: (f) => this.semestresApi.listarSemestres(sinVacios(f)).pipe(map(data)),
    crear: (body) => this.semestresApi.crearSemestre({ body }).pipe(map(data)),
    actualizar: (id, body) => this.semestresApi.actualizarSemestre({ id, body }).pipe(map(data)),
    desactivar: (id) => this.semestresApi.desactivarSemestre({ id }).pipe(map(data)),
  };

  readonly grupos: RecursoCatalogo<Grupo, GrupoRequest, FiltroGrupos> = {
    listar: (f) => this.gruposApi.listarGrupos(sinVacios(f)).pipe(map(data)),
    crear: (body) => this.gruposApi.crearGrupo({ body }).pipe(map(data)),
    actualizar: (id, body) => this.gruposApi.actualizarGrupo({ id, body }).pipe(map(data)),
    desactivar: (id) => this.gruposApi.desactivarGrupo({ id }).pipe(map(data)),
  };

  readonly fases: RecursoCatalogo<Fase, FaseRequest> = {
    listar: (f) => this.fasesApi.listarFases(sinVacios(f)).pipe(map(data)),
    crear: (body) => this.fasesApi.crearFase({ body }).pipe(map(data)),
    actualizar: (id, body) => this.fasesApi.actualizarFase({ id, body }).pipe(map(data)),
    desactivar: (id) => this.fasesApi.desactivarFase({ id }).pipe(map(data)),
  };

  readonly tiposTrabajo: RecursoCatalogo<TipoTrabajo, TipoTrabajoRequest> = {
    listar: (f) => this.tiposApi.listarTiposTrabajo(sinVacios(f)).pipe(map(data)),
    crear: (body) => this.tiposApi.crearTipoTrabajo({ body }).pipe(map(data)),
    actualizar: (id, body) => this.tiposApi.actualizarTipoTrabajo({ id, body }).pipe(map(data)),
    desactivar: (id) => this.tiposApi.desactivarTipoTrabajo({ id }).pipe(map(data)),
  };

  /** Docentes asignados a un grupo (GrupoDocente). */
  docentesDeGrupo(idGrupo: number): Observable<DocenteGrupo[]> {
    return this.gruposApi.listarDocentesGrupo({ id: idGrupo }).pipe(map(data));
  }

  /** Asignar un docente ya asignado responde 409; para cambiar esAdminCurso usar actualizarDocente. */
  asignarDocente(idGrupo: number, body: AsignarDocenteRequest): Observable<DocenteGrupo> {
    return this.gruposApi.asignarDocenteGrupo({ id: idGrupo, body }).pipe(map(data));
  }

  /** Cambia solo esAdminCurso de una asignacion existente (404 si no esta asignado). */
  actualizarDocente(
    idGrupo: number,
    idUsuario: number,
    body: ActualizarDocenteGrupoRequest,
  ): Observable<DocenteGrupo> {
    return this.gruposApi.actualizarDocenteGrupo({ id: idGrupo, idUsuario, body }).pipe(map(data));
  }

  quitarDocente(idGrupo: number, idUsuario: number): Observable<void> {
    return this.gruposApi.quitarDocenteGrupo({ id: idGrupo, idUsuario }).pipe(map(() => undefined));
  }

  /**
   * Configuracion vigente de la facultad (cualquier rol autenticado). Si la facultad aun no tiene
   * una propia llegan los valores por defecto del sistema con `personalizada = false`.
   * Sprint 3 la usara, p. ej., para validar el tamano maximo de archivo antes de subirlo.
   */
  obtenerConfigFacultad(idFacultad: number): Observable<ConfigFacultad> {
    return this.configApi.obtenerConfigFacultad({ id: idFacultad }).pipe(map(data));
  }

  /**
   * Crea o reemplaza la configuracion propia de la facultad (solo ADMIN; `personalizada` pasa a
   * true). Rige al instante; `jwtExpiracionHoras` afecta a los inicios de sesion posteriores.
   * 400 si `umbralPlagioMedio >= umbralPlagioAlto` o algun valor esta fuera de rango.
   */
  guardarConfigFacultad(
    idFacultad: number,
    body: ConfigFacultadRequest,
  ): Observable<ConfigFacultad> {
    return this.configApi.actualizarConfigFacultad({ id: idFacultad, body }).pipe(map(data));
  }
}
