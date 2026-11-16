import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  FormControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { forkJoin, startWith } from 'rxjs';
import type { Grupo, GrupoRequest, Materia, Semestre } from '../../../api/catalog';
import { mensajeDeError } from '../../../core/http/error-message';
import { FiltroGrupos } from '../../../core/services/catalogo.service';
import { DocentesGrupoComponent } from './docentes-grupo.component';
import { ACTIVO, PaginaCatalogo } from './pagina-catalogo';
import { etiquetaSemestre } from './semestres.component';

/**
 * Grupos de una materia en un semestre, con la asignacion de docentes.
 *
 * Materias y semestres se cargan una vez (catalogos chicos, sin paginar) y se filtran por facultad
 * en el navegador: asi los selects dependientes (facultad -> materia / semestre) responden al
 * instante y las tablas pueden mostrar siglas en vez de ids.
 */
@Component({
  selector: 'app-grupos',
  imports: [ReactiveFormsModule, DocentesGrupoComponent],
  template: `
    <header class="page-header">
      <h1>Grupos</h1>
      <button class="btn btn-primary" type="button" (click)="nuevo()">Nuevo grupo</button>
    </header>

    <div class="filters" [formGroup]="filtros">
      <label class="field">
        <span>Facultad</span>
        <select formControlName="idFacultad">
          <option [ngValue]="null">Todas</option>
          @for (f of facultades(); track f.idFacultad) {
            <option [ngValue]="f.idFacultad">{{ f.sigla }} — {{ f.nombre }}</option>
          }
        </select>
      </label>
      <label class="field">
        <span>Materia</span>
        <select formControlName="idMateria">
          <option [ngValue]="null">Todas</option>
          @for (m of materiasDelFiltro(); track m.idMateria) {
            <option [ngValue]="m.idMateria">{{ m.sigla }} — {{ m.nombre }}</option>
          }
        </select>
      </label>
      <label class="field">
        <span>Semestre</span>
        <select formControlName="idSemestre">
          <option [ngValue]="null">Todos</option>
          @for (s of semestresDelFiltro(); track s.idSemestre) {
            <option [ngValue]="s.idSemestre">{{ etiquetaSemestre(s) }}</option>
          }
        </select>
      </label>
    </div>
    <label class="check">
      <input
        type="checkbox"
        [checked]="mostrarInactivos()"
        (change)="cambiarInactivos($any($event.target).checked)"
      />
      Mostrar desactivados
    </label>

    @if (mensaje()) {
      <p class="alert alert-success" role="status">{{ mensaje() }}</p>
    }
    @if (errorListado()) {
      <p class="alert alert-danger" role="alert">{{ errorListado() }}</p>
    }

    @if (formularioAbierto()) {
      <section class="panel" aria-labelledby="titulo-form-grupo">
        <h2 id="titulo-form-grupo">{{ tituloFormulario() }}</h2>
        @if (errorFormulario()) {
          <p class="alert alert-danger" role="alert">{{ errorFormulario() }}</p>
        }
        <form [formGroup]="form" (ngSubmit)="guardar()" novalidate>
          <div class="form-grid">
            <label class="field">
              <span>Facultad</span>
              <select #primerCampo formControlName="idFacultad">
                <option [ngValue]="null" disabled>Seleccione…</option>
                @for (f of facultadesActivas(); track f.idFacultad) {
                  <option [ngValue]="f.idFacultad">{{ f.sigla }} — {{ f.nombre }}</option>
                }
              </select>
              @if (form.controls.idFacultad.touched && form.controls.idFacultad.invalid) {
                <small class="field-error">Seleccione la facultad.</small>
              }
            </label>
            <label class="field">
              <span>Materia</span>
              <select formControlName="idMateria">
                <option [ngValue]="null" disabled>
                  {{ facultadDelFormulario() ? 'Seleccione…' : 'Elija primero la facultad' }}
                </option>
                @for (m of materiasDelFormulario(); track m.idMateria) {
                  <option [ngValue]="m.idMateria">{{ m.sigla }} — {{ m.nombre }}</option>
                }
              </select>
              @if (form.controls.idMateria.touched && form.controls.idMateria.invalid) {
                <small class="field-error">
                  {{ errorDelServidor(form.controls.idMateria) ?? 'Seleccione la materia.' }}
                </small>
              }
            </label>
            <label class="field">
              <span>Semestre</span>
              <select formControlName="idSemestre">
                <option [ngValue]="null" disabled>
                  {{ facultadDelFormulario() ? 'Seleccione…' : 'Elija primero la facultad' }}
                </option>
                @for (s of semestresDelFormulario(); track s.idSemestre) {
                  <option [ngValue]="s.idSemestre">{{ etiquetaSemestre(s) }}</option>
                }
              </select>
              @if (form.controls.idSemestre.touched && form.controls.idSemestre.invalid) {
                <small class="field-error">
                  {{ errorDelServidor(form.controls.idSemestre) ?? 'Seleccione el semestre.' }}
                </small>
              }
            </label>
            <label class="field">
              <span>Nombre del grupo</span>
              <input formControlName="nombre" maxlength="20" autocomplete="off" placeholder="SA" />
              @if (form.controls.nombre.touched && form.controls.nombre.invalid) {
                <small class="field-error">
                  {{ errorDelServidor(form.controls.nombre) ?? 'Ingrese el nombre (máx. 20).' }}
                </small>
              }
            </label>
          </div>
          <div class="form-actions">
            <button class="btn btn-primary" type="submit" [disabled]="guardando()">
              {{ guardando() ? 'Guardando…' : 'Guardar' }}
            </button>
            <button class="btn btn-link" type="button" (click)="cerrarFormulario()">
              Cancelar
            </button>
          </div>
        </form>
      </section>
    }

    @if (grupoConDocentes(); as g) {
      <app-docentes-grupo
        [idGrupo]="g.idGrupo"
        [titulo]="etiquetaCompleta(g)"
        (cerrar)="grupoConDocentes.set(null)"
      />
    }

    @if (cargando()) {
      <p class="cargando" role="status">Cargando grupos…</p>
    } @else if (items().length === 0) {
      <p class="estado-vacio">No hay grupos para el filtro elegido.</p>
    } @else {
      <table class="table">
        <caption class="sr-only">
          Grupos
        </caption>
        <thead>
          <tr>
            <th scope="col">Grupo</th>
            <th scope="col">Materia</th>
            <th scope="col">Semestre</th>
            <th scope="col">Estado</th>
            <th scope="col"><span class="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          @for (g of items(); track g.idGrupo) {
            <tr [class.inactivo]="g.estado !== ACTIVO">
              <td data-label="Grupo">{{ g.nombre }}</td>
              <td data-label="Materia">{{ siglaMateria(g.idMateria) }}</td>
              <td data-label="Semestre">{{ semestreDe(g.idSemestre) }}</td>
              <td data-label="Estado">
                @if (g.estado === ACTIVO) {
                  <span class="badge badge-success">Activo</span>
                } @else {
                  <span class="badge badge-muted">Desactivado</span>
                }
              </td>
              <td class="acciones">
                <button class="btn btn-outline btn-sm" type="button" (click)="verDocentes(g)">
                  Docentes <span class="sr-only">{{ etiquetaCompleta(g) }}</span>
                </button>
                <button class="btn btn-outline btn-sm" type="button" (click)="editar(g)">
                  Editar <span class="sr-only">{{ etiquetaCompleta(g) }}</span>
                </button>
                @if (g.estado === ACTIVO) {
                  <button class="btn btn-link btn-sm" type="button" (click)="desactivar(g)">
                    Desactivar <span class="sr-only">{{ etiquetaCompleta(g) }}</span>
                  </button>
                } @else {
                  <button class="btn btn-link btn-sm" type="button" (click)="reactivar(g)">
                    Reactivar <span class="sr-only">{{ etiquetaCompleta(g) }}</span>
                  </button>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    }
  `,
})
export class GruposComponent
  extends PaginaCatalogo<Grupo, GrupoRequest, FiltroGrupos>
  implements OnInit
{
  protected readonly recurso = this.catalogo.grupos;
  protected readonly entidad = 'Grupo';
  protected readonly femenino = false;
  protected readonly etiquetaSemestre = etiquetaSemestre;

  private readonly fb = inject(NonNullableFormBuilder);

  /** Todas las materias y semestres (incluidos los inactivos, para mostrar nombres). */
  protected readonly materias = signal<Materia[]>([]);
  protected readonly semestres = signal<Semestre[]>([]);
  protected readonly grupoConDocentes = signal<Grupo | null>(null);

  protected readonly filtros = this.fb.group({
    idFacultad: new FormControl<number | null>(null),
    idMateria: new FormControl<number | null>(null),
    idSemestre: new FormControl<number | null>(null),
  });

  protected readonly form = this.fb.group({
    /** Solo para elegir materia y semestre de la misma facultad; no se envia. */
    idFacultad: new FormControl<number | null>(null, Validators.required),
    idMateria: new FormControl<number | null>(null, Validators.required),
    idSemestre: new FormControl<number | null>(null, Validators.required),
    nombre: ['', [Validators.required, Validators.maxLength(20)]],
  });

  private readonly facultadDelFiltro = toSignal(
    this.filtros.controls.idFacultad.valueChanges.pipe(startWith(null)),
    { initialValue: null },
  );
  protected readonly facultadDelFormulario = toSignal(
    this.form.controls.idFacultad.valueChanges.pipe(startWith(null)),
    { initialValue: null },
  );

  protected readonly materiasDelFiltro = computed(() =>
    delaFacultad(this.materias(), this.facultadDelFiltro()),
  );
  protected readonly semestresDelFiltro = computed(() =>
    delaFacultad(this.semestres(), this.facultadDelFiltro()),
  );
  protected readonly materiasDelFormulario = computed(() => {
    const id = this.facultadDelFormulario();
    return id ? delaFacultad(this.materias(), id).filter((m) => m.estado === ACTIVO) : [];
  });
  protected readonly semestresDelFormulario = computed(() => {
    const id = this.facultadDelFormulario();
    return id ? delaFacultad(this.semestres(), id).filter((s) => s.estado === ACTIVO) : [];
  });

  constructor() {
    super();
    const { idFacultad, idMateria, idSemestre } = this.filtros.controls;
    // Al cambiar la facultad, materia y semestre del filtro dejan de tener sentido.
    idFacultad.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.filtros.patchValue({ idMateria: null, idSemestre: null }, { emitEvent: false });
      this.cargar();
    });
    idMateria.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.cargar());
    idSemestre.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.cargar());
    // Select dependiente del formulario: otra facultad invalida materia y semestre elegidos.
    this.form.controls.idFacultad.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      const { idMateria: m, idSemestre: s } = this.form.getRawValue();
      if (m && this.materias().find((x) => x.idMateria === m)?.idFacultad !== id) {
        this.form.controls.idMateria.setValue(null);
      }
      if (s && this.semestres().find((x) => x.idSemestre === s)?.idFacultad !== id) {
        this.form.controls.idSemestre.setValue(null);
      }
    });
  }

  ngOnInit(): void {
    this.cargarFacultades();
    this.cargarMateriasYSemestres();
    this.cargar();
  }

  protected verDocentes(g: Grupo): void {
    this.cerrarFormulario();
    this.grupoConDocentes.set(g);
  }

  protected siglaMateria(idMateria: number): string {
    return this.materias().find((m) => m.idMateria === idMateria)?.sigla ?? `#${idMateria}`;
  }

  protected semestreDe(idSemestre: number): string {
    const s = this.semestres().find((x) => x.idSemestre === idSemestre);
    return s ? etiquetaSemestre(s) : `#${idSemestre}`;
  }

  protected etiquetaCompleta(g: Grupo): string {
    return `${this.siglaMateria(g.idMateria)}-${g.nombre} (${this.semestreDe(g.idSemestre)})`;
  }

  protected idDe(g: Grupo): number {
    return g.idGrupo;
  }

  protected etiquetaDe(g: Grupo): string {
    return this.etiquetaCompleta(g);
  }

  protected filtro(): FiltroGrupos {
    const { idFacultad, idMateria, idSemestre } = this.filtros.getRawValue();
    return {
      idFacultad: idFacultad ?? undefined,
      idMateria: idMateria ?? undefined,
      idSemestre: idSemestre ?? undefined,
      incluirInactivos: this.mostrarInactivos(),
    };
  }

  protected requestDelFormulario(): GrupoRequest {
    const { idMateria, idSemestre, nombre } = this.form.getRawValue();
    return {
      idMateria: idMateria as number,
      idSemestre: idSemestre as number,
      nombre: nombre.trim(),
    };
  }

  protected requestDe(g: Grupo): GrupoRequest {
    return { idMateria: g.idMateria, idSemestre: g.idSemestre, nombre: g.nombre };
  }

  protected editarEnFormulario(g: Grupo): void {
    this.grupoConDocentes.set(null);
    const idFacultad = this.materias().find((m) => m.idMateria === g.idMateria)?.idFacultad ?? null;
    this.form.setValue({
      idFacultad,
      idMateria: g.idMateria,
      idSemestre: g.idSemestre,
      nombre: g.nombre,
    });
  }

  protected limpiarFormulario(): void {
    this.grupoConDocentes.set(null);
    const { idFacultad, idMateria, idSemestre } = this.filtros.getRawValue();
    this.form.patchValue({ idFacultad, idMateria, idSemestre });
  }

  private cargarMateriasYSemestres(): void {
    forkJoin({
      materias: this.catalogo.materias.listar({ incluirInactivos: true }),
      semestres: this.catalogo.semestres.listar({ incluirInactivos: true }),
    }).subscribe({
      next: ({ materias, semestres }) => {
        this.materias.set(materias);
        this.semestres.set(semestres);
      },
      error: (err: unknown) =>
        this.errorListado.set(mensajeDeError(err, 'No se pudieron cargar materias y semestres.')),
    });
  }
}

function delaFacultad<T extends { idFacultad: number }>(
  lista: T[],
  idFacultad: number | null,
): T[] {
  return idFacultad ? lista.filter((x) => x.idFacultad === idFacultad) : lista;
}
