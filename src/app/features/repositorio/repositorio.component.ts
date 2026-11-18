import { Component, computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import { debounceTime, merge, Observable, Subscription } from 'rxjs';
import type { Carrera, Facultad, Grupo, Materia, Semestre, TipoTrabajo } from '../../api/catalog';
import type { PaginaRepositorio } from '../../api/work';
import { mensajeDeError } from '../../core/http/error-message';
import { crearEsperaPorIntentos, TEXTOS_CONSULTAS } from '../../core/http/limite-intentos';
import { CatalogoService } from '../../core/services/catalogo.service';
import { PaginadorComponent } from '../../shared/paginador.component';
import {
  aFiltroApi,
  filtrosDeUrl,
  FiltrosRepositorio,
  MAX_HASHTAG,
  MAX_Q,
  mismaBusqueda,
  normalizarHashtag,
  tieneFiltros,
  UltimaBusquedaRepositorio,
  urlDeFiltros,
} from './filtros-repositorio';
import { FUENTE_REPOSITORIO } from './fuente-repositorio';

/** Espera tras la ultima tecla antes de buscar (no se consulta en cada tecla). */
export const DEBOUNCE_BUSQUEDA_MS = 400;

const DEPENDIENTES = ['idCarrera', 'idMateria', 'idSemestre', 'idGrupo', 'idTipoTrabajo'] as const;

/**
 * Repositorio de trabajos evaluados (CU11): busca y filtra los trabajos publicados (estado
 * EVALUADO). La busqueda vive en los query params de la URL: se puede compartir el enlace y
 * atras/adelante del navegador restauran filtros y pagina.
 *
 * La busqueda por texto es full-text (frases entre comillas, `-palabra` excluye) y, con texto,
 * los resultados vienen ordenados por relevancia.
 *
 * Los filtros de carrera, materia, semestre y tipo dependen de la facultad elegida, y el de grupo
 * de materia + semestre. Se listan tambien los registros desactivados del catalogo: un trabajo de
 * un semestre ya cerrado (o de una materia que dejo de dictarse) sigue publicado.
 *
 * Modo publico (`/explorar`, sin sesion; ver FuenteRepositorio): los mismos filtros, con los
 * catalogos leidos sin token, pero la facultad se limita a las que habilitaron el acceso externo.
 * Si solo hay una, queda preseleccionada (sin ensuciar la URL: no se escribe `idFacultad`).
 * Si el backend responde 429 (demasiadas consultas por minuto) el buscador se deshabilita con una
 * cuenta regresiva y, al terminar, se repite la busqueda pendiente.
 *
 * Una busqueda por cambio real: una URL que, normalizada, no cambia los filtros (p. ej. un idGrupo
 * sin materia) no vuelve a consultar; varios cambios en el mismo instante terminan en una sola
 * navegacion (el router descarta las anteriores) y por lo tanto en una sola consulta.
 */
@Component({
  selector: 'app-repositorio',
  imports: [ReactiveFormsModule, RouterLink, PaginadorComponent],
  template: `
    <section class="card">
      <header class="page-header">
        <h1>{{ publico ? 'Explorar el repositorio' : 'Repositorio de trabajos' }}</h1>
      </header>
      <p class="muted">
        @if (publico) {
          Trabajos académicos evaluados y publicados. Busca por título, resumen o hashtag y filtra
          por facultad, carrera, materia, semestre, grupo o tipo de trabajo. Para descargar los
          documentos, <a routerLink="/login">inicia sesión</a>.
        } @else {
          Trabajos académicos evaluados de la facultad. Busca por título, resumen o hashtag y filtra
          por facultad, carrera, materia, semestre, grupo o tipo de trabajo.
        }
      </p>

      <form class="buscador" [formGroup]="filtros" (ngSubmit)="buscarAhora()" role="search">
        <!-- Durante la espera por 429 se deshabilita todo el buscador (fieldset nativo). -->
        <fieldset class="sin-marco" [disabled]="espera.bloqueado()">
          <label class="field buscador-texto">
            <span>Buscar</span>
            <input
              type="search"
              formControlName="q"
              [attr.maxlength]="maxQ"
              placeholder="Título, resumen o hashtag"
              autocomplete="off"
              aria-describedby="ayuda-sintaxis"
            />
            <small id="ayuda-sintaxis" class="muted">
              Usa comillas para una frase exacta ("sistema de inventarios") y un guion para excluir
              una palabra (-web). No distingue mayúsculas ni tildes.
            </small>
          </label>
          <div class="filters">
            <label class="field">
              <span>Facultad</span>
              <select formControlName="idFacultad">
                @if (facultadFija === null) {
                  <option [ngValue]="null">Todas las facultades</option>
                }
                @for (f of facultades(); track f.idFacultad) {
                  <option [ngValue]="f.idFacultad">{{ f.sigla }} — {{ f.nombre }}</option>
                }
              </select>
            </label>
            <label class="field">
              <span>Carrera del autor</span>
              <select formControlName="idCarrera" aria-describedby="ayuda-facultad">
                <option [ngValue]="null">{{ textoTodas('Todas las carreras') }}</option>
                @for (c of carreras(); track c.idCarrera) {
                  <option [ngValue]="c.idCarrera">{{ c.sigla }} — {{ c.nombre }}</option>
                }
              </select>
            </label>
            <label class="field">
              <span>Materia</span>
              <select formControlName="idMateria" aria-describedby="ayuda-facultad">
                <option [ngValue]="null">{{ textoTodas('Todas las materias') }}</option>
                @for (m of materias(); track m.idMateria) {
                  <option [ngValue]="m.idMateria">{{ m.sigla }} — {{ m.nombre }}</option>
                }
              </select>
            </label>
            <label class="field">
              <span>Semestre</span>
              <select formControlName="idSemestre" aria-describedby="ayuda-facultad">
                <option [ngValue]="null">{{ textoTodas('Todos los semestres') }}</option>
                @for (s of semestres(); track s.idSemestre) {
                  <option [ngValue]="s.idSemestre">{{ s.semestre }}-{{ s.anio }}</option>
                }
              </select>
            </label>
            <label class="field">
              <span>Grupo</span>
              <select formControlName="idGrupo" aria-describedby="ayuda-grupo">
                <option [ngValue]="null">{{ textoGrupos() }}</option>
                @for (g of grupos(); track g.idGrupo) {
                  <option [ngValue]="g.idGrupo">Grupo {{ g.nombre }}</option>
                }
              </select>
            </label>
            <label class="field">
              <span>Tipo de trabajo</span>
              <select formControlName="idTipoTrabajo">
                <option [ngValue]="null">Todos los tipos</option>
                @for (t of tipos(); track t.idTipoTrabajo) {
                  <option [ngValue]="t.idTipoTrabajo">{{ t.nombre }}</option>
                }
              </select>
            </label>
            <label class="field">
              <span>Hashtag</span>
              <input
                type="text"
                formControlName="hashtag"
                [attr.maxlength]="maxHashtag"
                placeholder="#springboot"
                autocomplete="off"
              />
            </label>
          </div>
          @if (actual().idFacultad === null) {
            <p id="ayuda-facultad" class="muted texto-chico">
              Elige una facultad para filtrar por carrera, materia o semestre.
            </p>
          } @else if (actual().idMateria === null || actual().idSemestre === null) {
            <p id="ayuda-grupo" class="muted texto-chico">
              Elige materia y semestre para filtrar por grupo.
            </p>
          }
        </fieldset>
      </form>

      @if (conFiltros()) {
        <div class="filtros-activos">
          @if (actual().hashtag; as h) {
            <span class="chip">
              #{{ h }}
              <button
                class="chip-quitar"
                type="button"
                [disabled]="espera.bloqueado()"
                [attr.aria-label]="'Quitar el filtro #' + h"
                (click)="quitarHashtag()"
              >
                ×
              </button>
            </span>
          }
          <button
            class="btn btn-link btn-sm"
            type="button"
            [disabled]="espera.bloqueado()"
            (click)="limpiar()"
          >
            Limpiar filtros
          </button>
        </div>
      }

      @if (espera.mensaje(); as aviso) {
        <p class="alert alert-warn aviso-espera" role="status">{{ aviso }}</p>
      }
      @if (errorCatalogos()) {
        <p class="alert alert-info" role="status">{{ errorCatalogos() }}</p>
      }
      @if (error()) {
        <p class="alert alert-danger" role="alert">{{ error() }}</p>
      }

      @if (cargando() && !pagina()) {
        <p class="cargando" role="status">Buscando trabajos…</p>
      } @else if (pagina(); as p) {
        @if (p.contenido.length === 0) {
          <div class="estado-vacio">
            @if (conFiltros()) {
              <p>Sin resultados para la búsqueda.</p>
              <p class="texto-chico">Prueba con otras palabras o quita algún filtro.</p>
            } @else {
              <p>Todavía no hay trabajos publicados.</p>
              <p class="texto-chico">Los trabajos aparecen aquí cuando su evaluación termina.</p>
            }
          </div>
        } @else {
          <p class="muted texto-chico orden-resultados">
            {{ actual().q ? 'Ordenado por relevancia' : 'Más recientes primero' }}
          </p>
          <ul class="tarjetas-trabajos" aria-label="Resultados" [attr.aria-busy]="cargando()">
            @for (t of p.contenido; track t.idTrabajo) {
              <li class="tarjeta-trabajo">
                <h2 class="tarjeta-titulo">
                  <a [routerLink]="[fuente.base, t.idTrabajo]">{{ t.titulo }}</a>
                </h2>
                <p class="tarjeta-autores">{{ t.autores.join(', ') }}</p>
                <p class="muted texto-chico">
                  {{ t.siglaMateria }} — {{ t.nombreMateria }} · {{ t.periodo }}
                </p>
                <span class="badge badge-muted">{{ t.tipoTrabajo }}</span>
                @if (t.extracto) {
                  <p class="tarjeta-extracto">{{ t.extracto }}</p>
                }
                @if (t.hashtags.length) {
                  <ul class="chips" aria-label="Hashtags">
                    @for (h of t.hashtags; track h) {
                      <li>
                        <button
                          class="chip chip-enlace"
                          type="button"
                          [attr.aria-pressed]="actual().hashtag === h"
                          [disabled]="espera.bloqueado()"
                          [attr.aria-label]="'Filtrar por el hashtag ' + h"
                          (click)="aplicarHashtag(h)"
                        >
                          #{{ h }}
                        </button>
                      </li>
                    }
                  </ul>
                }
              </li>
            }
          </ul>
        }
        <fieldset class="sin-marco" [disabled]="espera.bloqueado()">
          <app-paginador
            [pagina]="p.pagina"
            [tamano]="p.tamano"
            [totalElementos]="p.totalElementos"
            [totalPaginas]="p.totalPaginas"
            (cambiarPagina)="irAPagina($event)"
            (cambiarTamano)="cambiarTamano($event)"
          />
        </fieldset>
      }
    </section>
  `,
})
export class RepositorioComponent {
  protected readonly fuente = inject(FUENTE_REPOSITORIO);
  protected readonly publico = this.fuente.publico;
  private readonly catalogo = inject(CatalogoService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ultimaBusqueda = inject(UltimaBusquedaRepositorio);
  /** Facultades que se pueden elegir (null = todas); en modo publico, las de acceso externo. */
  private readonly permitidas = this.fuente.facultadesPermitidas();
  /** Unica facultad permitida: queda preseleccionada y no se ofrece "Todas las facultades". */
  protected readonly facultadFija = this.permitidas?.length === 1 ? this.permitidas[0] : null;
  /** 429 del repositorio publico: deshabilita el buscador con cuenta regresiva. */
  protected readonly espera = crearEsperaPorIntentos(TEXTOS_CONSULTAS);
  /** Hay una busqueda que se hara al terminar la espera por 429. */
  private readonly pendiente = signal(false);
  /** Filtros de la busqueda en curso o ya respondida (null si la ultima fallo). */
  private buscada: FiltrosRepositorio | null = null;
  private busqueda?: Subscription;
  private dependientes?: Subscription;
  private cargaGrupos?: Subscription;
  /** Facultad/materia/semestre cuyos grupos ya se cargaron ('' = ninguno). */
  private gruposCargados = '';
  /** Facultad cuyos catalogos dependientes ya se cargaron (undefined = ninguna todavia). */
  private facultadCargada: number | null | undefined = undefined;

  protected readonly maxQ = MAX_Q;
  protected readonly maxHashtag = MAX_HASHTAG;

  protected readonly filtros = inject(NonNullableFormBuilder).group({
    q: [''],
    hashtag: [''],
    idFacultad: new FormControl<number | null>(null),
    idCarrera: new FormControl<number | null>(null),
    idMateria: new FormControl<number | null>(null),
    idSemestre: new FormControl<number | null>(null),
    idGrupo: new FormControl<number | null>(null),
    idTipoTrabajo: new FormControl<number | null>(null),
  });

  protected readonly facultades = signal<Facultad[]>([]);
  protected readonly carreras = signal<Carrera[]>([]);
  protected readonly materias = signal<Materia[]>([]);
  protected readonly semestres = signal<Semestre[]>([]);
  protected readonly grupos = signal<Grupo[]>([]);
  protected readonly tipos = signal<TipoTrabajo[]>([]);

  /** Filtros de la URL actual (lo que se esta mostrando). */
  protected readonly actual = signal<FiltrosRepositorio>(
    this.normalizar(filtrosDeUrl(this.route.snapshot.queryParamMap)),
  );
  /** La facultad preseleccionada (unica permitida) no cuenta como filtro elegido. */
  protected readonly conFiltros = computed(() => tieneFiltros(this.sinFija(this.actual())));
  protected readonly pagina = signal<PaginaRepositorio | null>(null);
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly errorCatalogos = signal<string | null>(null);

  constructor() {
    // En modo publico los catalogos se leen sin token (catalog-api 1.3.0).
    this.catalogo.facultades
      .listar()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (f) => {
          const permitidas = this.permitidas;
          this.facultades.set(permitidas ? f.filter((x) => permitidas.includes(x.idFacultad)) : f);
        },
        error: () => this.avisarCatalogos(),
      });

    // Al terminar la espera por 429 se repite la busqueda que quedo pendiente.
    effect(() => {
      if (!this.espera.bloqueado() && this.pendiente()) {
        untracked(() => this.buscar(this.actual()));
      }
    });

    // URL -> formulario + busqueda (carga inicial, enlaces compartidos, atras/adelante).
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((p) => this.aplicarUrl(filtrosDeUrl(p)));

    // Formulario -> URL. El texto espera a que se deje de escribir; los selects, al instante.
    const c = this.filtros.controls;
    merge(c.q.valueChanges, c.hashtag.valueChanges)
      .pipe(debounceTime(DEBOUNCE_BUSQUEDA_MS), takeUntilDestroyed())
      .subscribe(() => this.navegar(0));
    c.idFacultad.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      // Carrera, materia, semestre y tipo son de la facultad anterior: se limpian.
      for (const k of DEPENDIENTES) {
        c[k].setValue(null, { emitEvent: false });
      }
      this.navegar(0);
    });
    // El grupo es de la materia y el semestre anteriores: se limpia.
    merge(c.idMateria.valueChanges, c.idSemestre.valueChanges)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        c.idGrupo.setValue(null, { emitEvent: false });
        this.navegar(0);
      });
    merge(c.idCarrera.valueChanges, c.idGrupo.valueChanges, c.idTipoTrabajo.valueChanges)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.navegar(0));
  }

  protected textoGrupos(): string {
    const f = this.actual();
    return f.idMateria !== null && f.idSemestre !== null
      ? 'Todos los grupos'
      : 'Elige materia y semestre';
  }

  protected textoTodas(texto: string): string {
    return this.actual().idFacultad !== null ? texto : 'Elige una facultad';
  }

  /**
   * Enter en el buscador: busca sin esperar el debounce. Si la busqueda no cambio pero la ultima
   * fallo (error o 429 sin Retry-After), la reintenta.
   */
  protected buscarAhora(): void {
    if (!this.navegar(0) && this.buscada === null && !this.espera.bloqueado()) {
      this.buscar(this.actual());
    }
  }

  protected irAPagina(pagina: number): void {
    this.navegar(pagina);
  }

  protected cambiarTamano(tamano: number): void {
    this.navegar(0, tamano);
  }

  protected quitarHashtag(): void {
    this.filtros.controls.hashtag.setValue('', { emitEvent: false });
    this.navegar(0);
  }

  /** Clic en un hashtag de un resultado: lo aplica como filtro (pagina 1). */
  protected aplicarHashtag(hashtag: string): void {
    this.filtros.controls.hashtag.setValue(normalizarHashtag(hashtag), { emitEvent: false });
    this.navegar(0);
  }

  protected limpiar(): void {
    this.filtros.reset(
      {
        q: '',
        hashtag: '',
        idFacultad: this.facultadFija,
        idCarrera: null,
        idMateria: null,
        idSemestre: null,
        idGrupo: null,
        idTipoTrabajo: null,
      },
      { emitEvent: false },
    );
    this.navegar(0);
  }

  /**
   * Lleva el estado del formulario a la URL; la busqueda la dispara el cambio de URL. Devuelve
   * false si no navego (busqueda igual a la actual o buscador en espera por 429).
   */
  private navegar(pagina: number, tamano = this.actual().tamano): boolean {
    if (this.espera.bloqueado()) {
      return false;
    }
    const v = this.filtros.getRawValue();
    const nuevo: FiltrosRepositorio = {
      ...v,
      q: v.q.trim().slice(0, MAX_Q),
      hashtag: normalizarHashtag(v.hashtag),
      pagina,
      tamano,
    };
    if (mismaBusqueda(nuevo, this.actual())) {
      return false;
    }
    void this.router.navigate([], { relativeTo: this.route, queryParams: this.paramsUrl(nuevo) });
    return true;
  }

  private aplicarUrl(desdeUrl: FiltrosRepositorio): void {
    const f = this.normalizar(desdeUrl);
    this.actual.set(f);
    this.ultimaBusqueda.params.set(this.paramsUrl(f));
    this.sincronizarFormulario(f);
    this.cargarDependientes(f.idFacultad);
    this.cargarGrupos(f);
    // Misma busqueda que la que ya esta en curso o respondida: no se repite.
    if (this.buscada !== null && mismaBusqueda(f, this.buscada)) {
      return;
    }
    this.buscar(f);
  }

  /**
   * Limita la facultad a las permitidas (un enlace con otra facultad se ignora junto con sus
   * filtros dependientes) y, si hay una sola, la preselecciona.
   */
  private normalizar(f: FiltrosRepositorio): FiltrosRepositorio {
    const permitidas = this.permitidas;
    if (permitidas === null) {
      return f;
    }
    if (f.idFacultad !== null && !permitidas.includes(f.idFacultad)) {
      f = { ...f, idFacultad: null };
      for (const k of DEPENDIENTES) {
        f[k] = null;
      }
    }
    return f.idFacultad === null && this.facultadFija !== null
      ? { ...f, idFacultad: this.facultadFija }
      : f;
  }

  /** La facultad preseleccionada no se escribe en la URL (enlaces cortos y estables). */
  private sinFija(f: FiltrosRepositorio): FiltrosRepositorio {
    return this.facultadFija !== null && f.idFacultad === this.facultadFija
      ? { ...f, idFacultad: null }
      : f;
  }

  private paramsUrl(f: FiltrosRepositorio): Params {
    return urlDeFiltros(this.sinFija(f));
  }

  /** Solo toca los campos que difieren (no pisa lo que se esta escribiendo, p. ej. un espacio final). */
  private sincronizarFormulario(f: FiltrosRepositorio): void {
    const c = this.filtros.controls;
    if (c.q.value.trim() !== f.q) {
      c.q.setValue(f.q, { emitEvent: false });
    }
    if (normalizarHashtag(c.hashtag.value) !== f.hashtag) {
      c.hashtag.setValue(f.hashtag, { emitEvent: false });
    }
    for (const k of ['idFacultad', ...DEPENDIENTES] as const) {
      if (c[k].value !== f[k]) {
        c[k].setValue(f[k], { emitEvent: false });
      }
    }
    this.habilitarDependientes(f.idFacultad !== null);
    if (f.idMateria !== null && f.idSemestre !== null) {
      c.idGrupo.enable({ emitEvent: false });
    } else {
      c.idGrupo.disable({ emitEvent: false });
    }
  }

  private habilitarDependientes(habilitar: boolean): void {
    for (const k of ['idCarrera', 'idMateria', 'idSemestre'] as const) {
      const control = this.filtros.controls[k];
      if (habilitar) {
        control.enable({ emitEvent: false });
      } else {
        control.disable({ emitEvent: false });
      }
    }
  }

  private buscar(f: FiltrosRepositorio): void {
    this.busqueda?.unsubscribe();
    this.buscada = null;
    if (this.espera.bloqueado()) {
      // Atras/adelante durante la espera: se buscara al terminar.
      this.cargando.set(false);
      this.pendiente.set(true);
      return;
    }
    this.pendiente.set(false);
    this.buscada = f;
    this.cargando.set(true);
    this.error.set(null);
    this.espera.limpiarAviso();
    this.busqueda = this.fuente
      .buscar(aFiltroApi(f))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => {
          this.cargando.set(false);
          this.pagina.set(p);
        },
        error: (err: unknown) => {
          this.cargando.set(false);
          this.buscada = null;
          if (this.espera.manejar(err)) {
            // 429: se conservan los resultados anteriores; con Retry-After se reintenta solo.
            this.pendiente.set(this.espera.bloqueado());
            return;
          }
          this.pagina.set(null);
          this.error.set(mensajeDeError(err, 'No se pudo buscar en el repositorio.'));
        },
      });
  }

  /** Carreras, materias, semestres y tipos de la facultad (sin facultad: tipos de todas). */
  private cargarDependientes(idFacultad: number | null): void {
    if (this.facultadCargada === idFacultad) {
      return;
    }
    this.facultadCargada = idFacultad;
    this.dependientes?.unsubscribe();
    this.dependientes = new Subscription();
    this.carreras.set([]);
    this.materias.set([]);
    this.semestres.set([]);
    this.tipos.set([]);
    this.errorCatalogos.set(null);

    const filtro = { idFacultad: idFacultad ?? undefined, incluirInactivos: true };
    const cargar = <T>(fuente: Observable<T[]>, destino: (v: T[]) => void) =>
      this.dependientes!.add(
        fuente.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: destino,
          error: () => this.avisarCatalogos(),
        }),
      );

    cargar(this.catalogo.tiposTrabajo.listar(filtro), (t) => this.tipos.set(t));
    if (idFacultad === null) {
      return;
    }
    cargar(this.catalogo.carreras.listar(filtro), (c) => this.carreras.set(c));
    cargar(this.catalogo.materias.listar(filtro), (m) =>
      this.materias.set([...m].sort((a, b) => a.sigla.localeCompare(b.sigla, 'es'))),
    );
    // Semestres mas recientes primero.
    cargar(this.catalogo.semestres.listar(filtro), (s) =>
      this.semestres.set([...s].sort((a, b) => b.anio - a.anio || b.semestre - a.semestre)),
    );
  }

  /** Grupos de la materia y el semestre elegidos (incluidos los desactivados). */
  private cargarGrupos(f: FiltrosRepositorio): void {
    const clave =
      f.idFacultad !== null && f.idMateria !== null && f.idSemestre !== null
        ? `${f.idFacultad}/${f.idMateria}/${f.idSemestre}`
        : '';
    if (this.gruposCargados === clave) {
      return;
    }
    this.gruposCargados = clave;
    this.cargaGrupos?.unsubscribe();
    this.grupos.set([]);
    if (!clave) {
      return;
    }
    this.cargaGrupos = this.catalogo.grupos
      .listar({
        idFacultad: f.idFacultad!,
        idMateria: f.idMateria!,
        idSemestre: f.idSemestre!,
        incluirInactivos: true,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (g) => this.grupos.set([...g].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))),
        error: () => this.avisarCatalogos(),
      });
  }

  private avisarCatalogos(): void {
    this.errorCatalogos.set(
      'No se pudieron cargar algunas opciones de filtro. La búsqueda por texto sigue disponible.',
    );
  }
}
