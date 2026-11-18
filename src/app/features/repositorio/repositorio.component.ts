import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { debounceTime, merge, Observable, Subscription } from 'rxjs';
import type { Carrera, Facultad, Materia, Semestre, TipoTrabajo } from '../../api/catalog';
import type { PaginaTrabajos } from '../../api/work';
import { mensajeDeError } from '../../core/http/error-message';
import { CatalogoService } from '../../core/services/catalogo.service';
import { TrabajoService } from '../../core/services/trabajo.service';
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

/** Espera tras la ultima tecla antes de buscar (no se consulta en cada tecla). */
export const DEBOUNCE_BUSQUEDA_MS = 400;

const DEPENDIENTES = ['idCarrera', 'idMateria', 'idSemestre', 'idTipoTrabajo'] as const;

/**
 * Repositorio de trabajos evaluados (CU11 basico): cualquier rol autenticado busca y filtra los
 * trabajos publicados (estado EVALUADO). La busqueda vive en los query params de la URL: se puede
 * compartir el enlace y atras/adelante del navegador restauran filtros y pagina.
 *
 * Los filtros de carrera, materia, semestre y tipo dependen de la facultad elegida. Se listan
 * tambien los registros desactivados del catalogo: un trabajo de un semestre ya cerrado (o de una
 * materia que dejo de dictarse) sigue publicado y debe poder encontrarse.
 */
@Component({
  selector: 'app-repositorio',
  imports: [ReactiveFormsModule, RouterLink, PaginadorComponent],
  template: `
    <section class="card">
      <header class="page-header">
        <h1>Repositorio de trabajos</h1>
      </header>
      <p class="muted">
        Trabajos académicos evaluados de la facultad. Busca por título, resumen o hashtag y filtra
        por facultad, carrera, materia, semestre o tipo de trabajo.
      </p>

      <form class="buscador" [formGroup]="filtros" (ngSubmit)="buscarAhora()" role="search">
        <label class="field buscador-texto">
          <span>Buscar</span>
          <input
            type="search"
            formControlName="q"
            [attr.maxlength]="maxQ"
            placeholder="Título, resumen o hashtag"
            autocomplete="off"
          />
        </label>
        <div class="filters">
          <label class="field">
            <span>Facultad</span>
            <select formControlName="idFacultad">
              <option [ngValue]="null">Todas las facultades</option>
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
        }
      </form>

      @if (conFiltros()) {
        <div class="filtros-activos">
          @if (actual().hashtag; as h) {
            <span class="chip">
              #{{ h }}
              <button
                class="chip-quitar"
                type="button"
                [attr.aria-label]="'Quitar el filtro #' + h"
                (click)="quitarHashtag()"
              >
                ×
              </button>
            </span>
          }
          <button class="btn btn-link btn-sm" type="button" (click)="limpiar()">
            Limpiar filtros
          </button>
        </div>
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
          <ul class="tarjetas-trabajos" aria-label="Resultados" [attr.aria-busy]="cargando()">
            @for (t of p.contenido; track t.idTrabajo) {
              <li class="tarjeta-trabajo">
                <h2 class="tarjeta-titulo">
                  <a [routerLink]="['/repositorio', t.idTrabajo]">{{ t.titulo }}</a>
                </h2>
                <p class="tarjeta-autores">{{ t.autores.join(', ') }}</p>
                <p class="muted texto-chico">
                  {{ t.siglaMateria }} — {{ t.nombreMateria }} · {{ t.periodo }}
                </p>
                <span class="badge badge-muted">{{ t.tipoTrabajo }}</span>
              </li>
            }
          </ul>
        }
        <app-paginador
          [pagina]="p.pagina"
          [tamano]="p.tamano"
          [totalElementos]="p.totalElementos"
          [totalPaginas]="p.totalPaginas"
          (cambiarPagina)="irAPagina($event)"
          (cambiarTamano)="cambiarTamano($event)"
        />
      }
    </section>
  `,
})
export class RepositorioComponent {
  private readonly trabajos = inject(TrabajoService);
  private readonly catalogo = inject(CatalogoService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ultimaBusqueda = inject(UltimaBusquedaRepositorio);
  private busqueda?: Subscription;
  private dependientes?: Subscription;
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
    idTipoTrabajo: new FormControl<number | null>(null),
  });

  protected readonly facultades = signal<Facultad[]>([]);
  protected readonly carreras = signal<Carrera[]>([]);
  protected readonly materias = signal<Materia[]>([]);
  protected readonly semestres = signal<Semestre[]>([]);
  protected readonly tipos = signal<TipoTrabajo[]>([]);

  /** Filtros de la URL actual (lo que se esta mostrando). */
  protected readonly actual = signal<FiltrosRepositorio>(
    filtrosDeUrl(this.route.snapshot.queryParamMap),
  );
  protected readonly conFiltros = computed(() => tieneFiltros(this.actual()));
  protected readonly pagina = signal<PaginaTrabajos | null>(null);
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly errorCatalogos = signal<string | null>(null);

  constructor() {
    this.catalogo.facultades
      .listar()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (f) => this.facultades.set(f),
        error: () => this.avisarCatalogos(),
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
    merge(...DEPENDIENTES.map((k) => c[k].valueChanges))
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.navegar(0));
  }

  protected textoTodas(texto: string): string {
    return this.actual().idFacultad !== null ? texto : 'Elige una facultad';
  }

  /** Enter en el buscador: busca sin esperar el debounce. */
  protected buscarAhora(): void {
    this.navegar(0);
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

  protected limpiar(): void {
    this.filtros.reset(
      {
        q: '',
        hashtag: '',
        idFacultad: null,
        idCarrera: null,
        idMateria: null,
        idSemestre: null,
        idTipoTrabajo: null,
      },
      { emitEvent: false },
    );
    this.navegar(0);
  }

  /** Lleva el estado del formulario a la URL; la busqueda la dispara el cambio de URL. */
  private navegar(pagina: number, tamano = this.actual().tamano): void {
    const v = this.filtros.getRawValue();
    const nuevo: FiltrosRepositorio = {
      ...v,
      q: v.q.trim().slice(0, MAX_Q),
      hashtag: normalizarHashtag(v.hashtag),
      pagina,
      tamano,
    };
    if (mismaBusqueda(nuevo, this.actual())) {
      return;
    }
    void this.router.navigate([], { relativeTo: this.route, queryParams: urlDeFiltros(nuevo) });
  }

  private aplicarUrl(f: FiltrosRepositorio): void {
    this.actual.set(f);
    this.ultimaBusqueda.params.set(urlDeFiltros(f));
    this.sincronizarFormulario(f);
    this.cargarDependientes(f.idFacultad);
    this.buscar(f);
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
    this.cargando.set(true);
    this.error.set(null);
    this.busqueda = this.trabajos
      .buscarEnRepositorio(aFiltroApi(f))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => {
          this.cargando.set(false);
          this.pagina.set(p);
        },
        error: (err: unknown) => {
          this.cargando.set(false);
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

  private avisarCatalogos(): void {
    this.errorCatalogos.set(
      'No se pudieron cargar algunas opciones de filtro. La búsqueda por texto sigue disponible.',
    );
  }
}
