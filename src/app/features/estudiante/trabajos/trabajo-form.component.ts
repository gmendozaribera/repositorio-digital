import { Component, computed, DestroyRef, inject, input, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  FormControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, Observable, of, Subscription } from 'rxjs';
import type { Facultad, Grupo, Materia, Semestre, TipoTrabajo } from '../../../api/catalog';
import type { Autor, Trabajo, TrabajoRequest } from '../../../api/work';
import { AuthService } from '../../../core/auth/auth.service';
import {
  aplicarErroresDelServidor,
  errorDelServidor,
  mensajeDeError,
} from '../../../core/http/error-message';
import { CatalogoService } from '../../../core/services/catalogo.service';
import { TrabajoService } from '../../../core/services/trabajo.service';
import { EstadoTrabajoComponent } from '../../../shared/estado-trabajo';

export const MAX_TITULO = 200;
export const MAX_RESUMEN = 3000;
export const MIN_RESUMEN = 20;
export const MAX_HASHTAGS = 10;
export const MAX_COAUTORES = 10;
const HASHTAG = /^[a-z0-9_-]{2,50}$/;
const REGISTRO = /^[1-9]\d{0,9}$/;
const MAX_INT32 = 2_147_483_647;

/** " #SpringBoot " -> "springboot": sin espacios en los bordes, sin '#' y en minusculas (asi se guarda). */
export function normalizarHashtag(texto: string): string {
  return texto.trim().replace(/^#+/, '').toLowerCase();
}

/**
 * Alta y edicion de un trabajo (ESTUDIANTE). El grupo se elige con selects dependientes:
 * facultad -> materia -> semestre -> grupo (catalog-service); el tipo de trabajo es el de la
 * facultad. Hashtags y coautores (por numero de registro) se cargan como chips.
 *
 * El grupo solo puede cambiarse en BORRADOR (en otro estado el backend responde 409).
 */
@Component({
  selector: 'app-trabajo-form',
  imports: [ReactiveFormsModule, RouterLink, EstadoTrabajoComponent],
  template: `
    <section class="card">
      <header class="page-header">
        <h1>{{ esEdicion() ? 'Editar trabajo' : 'Nuevo trabajo' }}</h1>
        @if (trabajo(); as t) {
          <app-estado-trabajo [estado]="t.estado" />
        }
      </header>
      @if (!esEdicion()) {
        <p class="muted">
          El trabajo se crea como <strong>borrador</strong>. Después podrás subir sus documentos por
          fase y enviarlo a revisión.
        </p>
      }

      @if (error()) {
        <p class="alert alert-danger" role="alert">{{ error() }}</p>
      }

      @if (cargando()) {
        <p class="cargando" role="status">Cargando…</p>
      } @else if (noEditable()) {
        <p class="alert alert-warn" role="alert">
          Este trabajo ya no se puede editar en su estado actual.
        </p>
        <a class="btn btn-outline" [routerLink]="['/trabajos', id()]">Volver al trabajo</a>
      } @else {
        <form [formGroup]="form" (ngSubmit)="guardar()" novalidate>
          <label class="field">
            <span>Título</span>
            <input
              formControlName="titulo"
              data-cy="trabajo-titulo"
              [attr.maxlength]="maxTitulo"
              autocomplete="off"
            />
            @if (form.controls.titulo.touched && form.controls.titulo.invalid) {
              <small class="field-error">
                {{ errorDelServidor(form.controls.titulo) ?? 'Entre 5 y 200 caracteres.' }}
              </small>
            }
          </label>

          <label class="field">
            <span>Resumen</span>
            <textarea
              formControlName="resumen"
              data-cy="trabajo-resumen"
              rows="6"
              [attr.maxlength]="maxResumen"
            ></textarea>
            <small
              class="contador"
              [class.field-error]="largoResumen() > maxResumen"
              aria-live="polite"
            >
              {{ largoResumen() }} / {{ maxResumen }} caracteres
              @if (largoResumen() < minResumen) {
                (mínimo {{ minResumen }})
              }
            </small>
            @if (form.controls.resumen.touched && form.controls.resumen.invalid) {
              <small class="field-error">
                {{
                  errorDelServidor(form.controls.resumen) ??
                    'Escribe un resumen de 20 a 3000 caracteres.'
                }}
              </small>
            }
          </label>

          <fieldset class="grupo-campos">
            <legend>Materia y grupo</legend>
            @if (!grupoEditable()) {
              <p class="muted texto-chico">
                El grupo solo puede cambiarse mientras el trabajo está en borrador.
              </p>
            }
            <div class="form-grid">
              <label class="field">
                <span>Facultad</span>
                <select formControlName="idFacultad" data-cy="trabajo-facultad">
                  <option [ngValue]="null" disabled>Seleccione…</option>
                  @for (f of facultades(); track f.idFacultad) {
                    <option [ngValue]="f.idFacultad">{{ f.sigla }} — {{ f.nombre }}</option>
                  }
                </select>
                @if (form.controls.idFacultad.touched && form.controls.idFacultad.invalid) {
                  <small class="field-error">Seleccione la facultad.</small>
                }
              </label>

              <label class="field">
                <span>Materia</span>
                <select formControlName="idMateria" data-cy="trabajo-materia">
                  <option [ngValue]="null" disabled>
                    {{
                      form.controls.idFacultad.value ? 'Seleccione…' : 'Primero elija la facultad'
                    }}
                  </option>
                  @for (m of materias(); track m.idMateria) {
                    <option [ngValue]="m.idMateria">{{ m.sigla }} — {{ m.nombre }}</option>
                  }
                </select>
                @if (form.controls.idMateria.touched && form.controls.idMateria.invalid) {
                  <small class="field-error">Seleccione la materia.</small>
                }
              </label>

              <label class="field">
                <span>Semestre</span>
                <select formControlName="idSemestre" data-cy="trabajo-semestre">
                  <option [ngValue]="null" disabled>
                    {{ form.controls.idMateria.value ? 'Seleccione…' : 'Primero elija la materia' }}
                  </option>
                  @for (s of semestres(); track s.idSemestre) {
                    <option [ngValue]="s.idSemestre">{{ s.semestre }}-{{ s.anio }}</option>
                  }
                </select>
                @if (form.controls.idSemestre.touched && form.controls.idSemestre.invalid) {
                  <small class="field-error">Seleccione el semestre.</small>
                }
              </label>

              <label class="field">
                <span>Grupo</span>
                <select formControlName="idGrupo" data-cy="trabajo-grupo">
                  <option [ngValue]="null" disabled>
                    {{
                      form.controls.idSemestre.value
                        ? grupos().length
                          ? 'Seleccione…'
                          : 'Sin grupos para esta materia y semestre'
                        : 'Primero elija el semestre'
                    }}
                  </option>
                  @for (g of grupos(); track g.idGrupo) {
                    <option [ngValue]="g.idGrupo">Grupo {{ g.nombre }}</option>
                  }
                </select>
                @if (form.controls.idGrupo.touched && form.controls.idGrupo.invalid) {
                  <small class="field-error">
                    {{ errorDelServidor(form.controls.idGrupo) ?? 'Seleccione el grupo.' }}
                  </small>
                }
              </label>
            </div>
          </fieldset>

          <label class="field">
            <span>Tipo de trabajo</span>
            <select formControlName="idTipoTrabajo" data-cy="trabajo-tipo">
              <option [ngValue]="null" disabled>
                {{ form.controls.idFacultad.value ? 'Seleccione…' : 'Primero elija la facultad' }}
              </option>
              @for (t of tipos(); track t.idTipoTrabajo) {
                <option [ngValue]="t.idTipoTrabajo">{{ t.nombre }}</option>
              }
            </select>
            @if (form.controls.idTipoTrabajo.touched && form.controls.idTipoTrabajo.invalid) {
              <small class="field-error">
                {{
                  errorDelServidor(form.controls.idTipoTrabajo) ?? 'Seleccione el tipo de trabajo.'
                }}
              </small>
            }
          </label>

          <div class="field">
            <label for="nuevo-hashtag">Hashtags (opcional, hasta {{ maxHashtags }})</label>
            <ul class="chips" aria-label="Hashtags agregados">
              @for (h of form.controls.hashtags.value; track h) {
                <li class="chip">
                  #{{ h }}
                  <button type="button" class="chip-quitar" (click)="quitarHashtag(h)">
                    <span aria-hidden="true">×</span><span class="sr-only">Quitar #{{ h }}</span>
                  </button>
                </li>
              }
            </ul>
            <span class="input-con-boton">
              <input
                id="nuevo-hashtag"
                [formControl]="nuevoHashtag"
                maxlength="51"
                autocomplete="off"
                placeholder="springboot"
                (keydown)="teclaHashtag($event)"
              />
              <button class="btn btn-outline btn-sm" type="button" (click)="agregarHashtag()">
                Agregar
              </button>
            </span>
            <small class="muted"
              >Letras, números, guion o guion bajo (2 a 50). Enter o coma para agregar.</small
            >
            @if (errorHashtag() ?? errorDelServidor(form.controls.hashtags); as e) {
              <small class="field-error">{{ e }}</small>
            }
          </div>

          <div class="field">
            <label for="nuevo-coautor">Coautores (opcional)</label>
            <ul class="chips" aria-label="Coautores agregados">
              @for (r of form.controls.registrosCoautores.value; track r) {
                <li class="chip">
                  {{ nombreCoautor(r) }}
                  <button type="button" class="chip-quitar" (click)="quitarCoautor(r)">
                    <span aria-hidden="true">×</span
                    ><span class="sr-only">Quitar coautor {{ r }}</span>
                  </button>
                </li>
              }
            </ul>
            <span class="input-con-boton">
              <input
                id="nuevo-coautor"
                [formControl]="nuevoCoautor"
                inputmode="numeric"
                maxlength="10"
                autocomplete="off"
                placeholder="Número de registro"
                (keydown)="teclaCoautor($event)"
              />
              <button class="btn btn-outline btn-sm" type="button" (click)="agregarCoautor()">
                Agregar
              </button>
            </span>
            <small class="muted">
              Número de registro de otros estudiantes. Tú ya figuras como autor.
              @if (maxAutores(); as max) {
                Máximo {{ max }} autores por trabajo contándote a ti (hasta {{ maxCoautores() }}
                {{ maxCoautores() === 1 ? 'coautor' : 'coautores' }}).
              }
            </small>
            @if (errorCoautor() ?? errorDelServidor(form.controls.registrosCoautores); as e) {
              <small class="field-error">{{ e }}</small>
            }
          </div>

          <div class="form-actions">
            <button
              class="btn btn-primary"
              type="submit"
              data-cy="trabajo-guardar"
              [disabled]="guardando()"
            >
              {{ guardando() ? 'Guardando…' : esEdicion() ? 'Guardar cambios' : 'Crear borrador' }}
            </button>
            <a
              class="btn btn-link"
              [routerLink]="esEdicion() ? ['/trabajos', id()] : ['/estudiante/trabajos']"
              >Cancelar</a
            >
          </div>
        </form>
      }
    </section>
  `,
})
export class TrabajoFormComponent implements OnInit {
  private readonly trabajos = inject(TrabajoService);
  private readonly catalogo = inject(CatalogoService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(NonNullableFormBuilder);
  private cargaGrupos?: Subscription;

  /** `:id` de la ruta de edicion (withComponentInputBinding). Sin id es un alta. */
  readonly id = input<string>();

  protected readonly maxTitulo = MAX_TITULO;
  protected readonly maxResumen = MAX_RESUMEN;
  protected readonly minResumen = MIN_RESUMEN;
  protected readonly maxHashtags = MAX_HASHTAGS;
  protected readonly errorDelServidor = errorDelServidor;

  protected readonly esEdicion = computed(() => !!this.id());
  protected readonly trabajo = signal<Trabajo | null>(null);
  protected readonly noEditable = computed(() => {
    const t = this.trabajo();
    return !!t && !t.acciones.editar;
  });
  protected readonly grupoEditable = computed(() => {
    const t = this.trabajo();
    return !t || t.estado === 'BORRADOR';
  });

  protected readonly cargando = signal(false);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly errorHashtag = signal<string | null>(null);
  protected readonly errorCoautor = signal<string | null>(null);

  protected readonly facultades = signal<Facultad[]>([]);
  protected readonly materias = signal<Materia[]>([]);
  protected readonly semestres = signal<Semestre[]>([]);
  protected readonly grupos = signal<Grupo[]>([]);
  protected readonly tipos = signal<TipoTrabajo[]>([]);

  protected readonly form = this.fb.group({
    titulo: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(MAX_TITULO)]],
    resumen: [
      '',
      [Validators.required, Validators.minLength(MIN_RESUMEN), Validators.maxLength(MAX_RESUMEN)],
    ],
    idFacultad: new FormControl<number | null>(null, Validators.required),
    idMateria: new FormControl<number | null>({ value: null, disabled: true }, Validators.required),
    idSemestre: new FormControl<number | null>(
      { value: null, disabled: true },
      Validators.required,
    ),
    idGrupo: new FormControl<number | null>({ value: null, disabled: true }, Validators.required),
    idTipoTrabajo: new FormControl<number | null>(
      { value: null, disabled: true },
      Validators.required,
    ),
    hashtags: this.fb.control<string[]>([]),
    registrosCoautores: this.fb.control<number[]>([]),
  });

  protected readonly nuevoHashtag = new FormControl('', { nonNullable: true });
  protected readonly nuevoCoautor = new FormControl('', { nonNullable: true });

  private readonly resumen = toSignal(this.form.controls.resumen.valueChanges, {
    initialValue: '',
  });
  protected readonly largoResumen = computed(() => this.resumen().length);

  /** Maximo de autores por trabajo (incluido el autor) segun las reglas de la facultad elegida. */
  protected readonly maxAutores = signal<number | null>(null);
  /** Coautores permitidos: maxAutores - 1 (sin reglas, el tope del contrato). */
  protected readonly maxCoautores = computed(() => {
    const max = this.maxAutores();
    return max === null ? MAX_COAUTORES : Math.min(MAX_COAUTORES, Math.max(0, max - 1));
  });
  /** Registro del autor autenticado en edicion (Autor.esUsuarioActual). */
  private registroPropio: number | null = null;

  /** Nombres de los coautores ya guardados (en edicion), por numero de registro. */
  private readonly nombresCoautores = signal<Map<number, string>>(new Map());

  constructor() {
    const c = this.form.controls;
    c.idFacultad.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((id) => this.facultadElegida(id));
    c.idMateria.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      c.idSemestre.reset(null, { emitEvent: false });
      this.reiniciarGrupo();
      this.habilitar(c.idSemestre, id !== null);
    });
    c.idSemestre.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.cargarGrupos());
  }

  ngOnInit(): void {
    const id = Number(this.id());
    this.cargando.set(true);
    const trabajo$: Observable<Trabajo | null> = this.esEdicion()
      ? this.trabajos.obtener(id)
      : of(null);
    forkJoin({ facultades: this.catalogo.facultades.listar(), trabajo: trabajo$ })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ facultades, trabajo }) => {
          this.facultades.set(facultades);
          if (trabajo) {
            this.cargarEdicion(trabajo);
            return;
          }
          this.cargando.set(false);
          // Con una sola facultad no tiene sentido hacer elegir.
          if (facultades.length === 1) {
            this.form.controls.idFacultad.setValue(facultades[0].idFacultad);
          }
        },
        error: (err: unknown) => {
          this.cargando.set(false);
          this.error.set(mensajeDeError(err, 'No se pudieron cargar los datos del formulario.'));
        },
      });
  }

  // ------------------------------------------------------------------ Hashtags

  protected teclaHashtag(evento: KeyboardEvent): void {
    if (evento.key === 'Enter' || evento.key === ',') {
      evento.preventDefault();
      this.agregarHashtag();
    }
  }

  protected agregarHashtag(): void {
    const tag = normalizarHashtag(this.nuevoHashtag.value);
    const actuales = this.form.controls.hashtags.value;
    this.errorHashtag.set(null);
    if (!tag) {
      return;
    }
    if (!HASHTAG.test(tag)) {
      this.errorHashtag.set('Usa de 2 a 50 letras, números, guion o guion bajo (sin espacios).');
      return;
    }
    if (actuales.includes(tag)) {
      this.errorHashtag.set(`#${tag} ya está agregado.`);
      return;
    }
    if (actuales.length >= MAX_HASHTAGS) {
      this.errorHashtag.set(`Máximo ${MAX_HASHTAGS} hashtags.`);
      return;
    }
    this.form.controls.hashtags.setValue([...actuales, tag]);
    this.nuevoHashtag.setValue('');
  }

  protected quitarHashtag(tag: string): void {
    this.form.controls.hashtags.setValue(
      this.form.controls.hashtags.value.filter((h) => h !== tag),
    );
    this.errorHashtag.set(null);
  }

  // ------------------------------------------------------------------ Coautores

  protected teclaCoautor(evento: KeyboardEvent): void {
    if (evento.key === 'Enter' || evento.key === ',') {
      evento.preventDefault();
      this.agregarCoautor();
    }
  }

  protected agregarCoautor(): void {
    const texto = this.nuevoCoautor.value.trim();
    const actuales = this.form.controls.registrosCoautores.value;
    this.errorCoautor.set(null);
    if (!texto) {
      return;
    }
    const registro = Number(texto);
    if (!REGISTRO.test(texto) || registro > MAX_INT32) {
      this.errorCoautor.set('El número de registro solo lleva dígitos.');
      return;
    }
    if (texto === this.auth.usuario()?.usuario || registro === this.registroPropio) {
      this.errorCoautor.set('Tú ya eres autor del trabajo.');
      return;
    }
    if (actuales.includes(registro)) {
      this.errorCoautor.set(`El registro ${registro} ya está agregado.`);
      return;
    }
    if (actuales.length >= this.maxCoautores()) {
      this.errorCoautor.set(this.mensajeLimiteCoautores());
      return;
    }
    this.form.controls.registrosCoautores.setValue([...actuales, registro]);
    this.nuevoCoautor.setValue('');
  }

  private mensajeLimiteCoautores(): string {
    const max = this.maxAutores();
    const coautores = this.maxCoautores();
    if (max === null) {
      return `Máximo ${coautores} coautores.`;
    }
    if (coautores === 0) {
      return `En esta facultad cada trabajo tiene un solo autor: no se pueden agregar coautores.`;
    }
    return (
      `Un trabajo puede tener como máximo ${max} autores contándote a ti: puedes agregar hasta ` +
      `${coautores} ${coautores === 1 ? 'coautor' : 'coautores'}.`
    );
  }

  protected quitarCoautor(registro: number): void {
    const c = this.form.controls.registrosCoautores;
    c.setValue(c.value.filter((r) => r !== registro));
    this.errorCoautor.set(null);
  }

  protected nombreCoautor(registro: number): string {
    const nombre = this.nombresCoautores().get(registro);
    return nombre ? `${nombre} (${registro})` : `Reg. ${registro}`;
  }

  // ------------------------------------------------------------------ Guardar

  protected guardar(): void {
    // Lo escrito en los campos de chips y no agregado tambien cuenta.
    this.agregarHashtag();
    this.agregarCoautor();
    // Si el limite es menor que los coautores ya cargados (p. ej. se bajo el parametro), avisar.
    if (
      !this.errorCoautor() &&
      this.form.controls.registrosCoautores.value.length > this.maxCoautores()
    ) {
      this.errorCoautor.set(`${this.mensajeLimiteCoautores()} Quita los que sobran.`);
    }
    if (this.form.invalid || this.errorHashtag() || this.errorCoautor()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const body: TrabajoRequest = {
      titulo: v.titulo.trim(),
      resumen: v.resumen.trim(),
      idGrupo: v.idGrupo!,
      idTipoTrabajo: v.idTipoTrabajo!,
      hashtags: v.hashtags,
      registrosCoautores: v.registrosCoautores,
    };
    const actual = this.trabajo();
    const peticion = actual
      ? this.trabajos.actualizar(actual.idTrabajo, body)
      : this.trabajos.crear(body);
    this.guardando.set(true);
    this.error.set(null);
    peticion.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (t) => {
        this.guardando.set(false);
        void this.router.navigate(['/trabajos', t.idTrabajo]);
      },
      error: (err: unknown) => {
        this.guardando.set(false);
        this.error.set(aplicarErroresDelServidor(this.form, err, 'No se pudo guardar el trabajo.'));
      },
    });
  }

  // ------------------------------------------------------------------ Selects dependientes

  private facultadElegida(idFacultad: number | null): void {
    const c = this.form.controls;
    c.idMateria.reset(null, { emitEvent: false });
    c.idSemestre.reset(null, { emitEvent: false });
    c.idTipoTrabajo.reset(null, { emitEvent: false });
    this.reiniciarGrupo();
    this.materias.set([]);
    this.semestres.set([]);
    this.tipos.set([]);
    this.maxAutores.set(null);
    this.habilitar(c.idMateria, false);
    this.habilitar(c.idSemestre, false);
    this.habilitar(c.idTipoTrabajo, false);
    if (idFacultad === null) {
      return;
    }
    this.listasDeFacultad(idFacultad).subscribe({
      next: ({ materias, semestres, tipos, reglas }) => {
        this.materias.set(materias);
        this.semestres.set(semestres);
        this.tipos.set(tipos);
        this.maxAutores.set(reglas?.maxAutores ?? null);
        this.habilitar(c.idMateria, true);
        this.habilitar(c.idTipoTrabajo, true);
      },
      error: (err: unknown) =>
        this.error.set(mensajeDeError(err, 'No se pudieron cargar las materias de la facultad.')),
    });
  }

  private listasDeFacultad(idFacultad: number) {
    return forkJoin({
      materias: this.catalogo.materias.listar({ idFacultad }),
      semestres: this.catalogo.semestres.listar({ idFacultad }),
      tipos: this.catalogo.tiposTrabajo.listar({ idFacultad }),
      // Reglas de la facultad (maxAutores). Si fallan, el formulario sigue con el tope del
      // contrato y el backend valida el limite real.
      reglas: this.trabajos.reglas(idFacultad).pipe(catchError(() => of(null))),
    }).pipe(takeUntilDestroyed(this.destroyRef));
  }

  private reiniciarGrupo(): void {
    this.cargaGrupos?.unsubscribe();
    this.form.controls.idGrupo.reset(null, { emitEvent: false });
    this.grupos.set([]);
    this.habilitar(this.form.controls.idGrupo, false);
  }

  private cargarGrupos(): void {
    this.reiniciarGrupo();
    const { idMateria, idSemestre } = this.form.getRawValue();
    if (idMateria === null || idSemestre === null) {
      return;
    }
    this.cargaGrupos = this.catalogo.grupos
      .listar({ idMateria, idSemestre })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (g) => {
          this.grupos.set(g);
          this.habilitar(this.form.controls.idGrupo, g.length > 0);
        },
        error: (err: unknown) =>
          this.error.set(mensajeDeError(err, 'No se pudieron cargar los grupos.')),
      });
  }

  /** Respeta la regla de que el grupo no se cambia fuera de BORRADOR. */
  private habilitar(control: FormControl<number | null>, habilitado: boolean): void {
    const c = this.form.controls;
    const esDeGrupo =
      control === c.idFacultad ||
      control === c.idMateria ||
      control === c.idSemestre ||
      control === c.idGrupo;
    if (habilitado && (!esDeGrupo || this.grupoEditable())) {
      control.enable({ emitEvent: false });
    } else {
      control.disable({ emitEvent: false });
    }
  }

  // ------------------------------------------------------------------ Edicion

  private cargarEdicion(t: Trabajo): void {
    this.trabajo.set(t);
    this.registroPropio = t.autores.find((a) => a.esUsuarioActual)?.registro ?? null;
    const propios = this.coautoresDe(t.autores);
    this.nombresCoautores.set(
      new Map(propios.map((a) => [a.registro!, `${a.nombre} ${a.apellidos}`])),
    );
    forkJoin({
      listas: this.listasDeFacultad(t.idFacultad),
      grupos: this.catalogo.grupos.listar({ idMateria: t.idMateria, idSemestre: t.idSemestre }),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ listas, grupos }) => {
          this.materias.set(listas.materias);
          this.semestres.set(listas.semestres);
          this.tipos.set(listas.tipos);
          this.maxAutores.set(listas.reglas?.maxAutores ?? null);
          this.grupos.set(grupos);
          this.form.setValue(
            {
              titulo: t.titulo,
              resumen: t.resumen,
              idFacultad: t.idFacultad,
              idMateria: t.idMateria,
              idSemestre: t.idSemestre,
              idGrupo: t.idGrupo,
              idTipoTrabajo: t.idTipoTrabajo,
              hashtags: [...t.hashtags],
              registrosCoautores: propios.map((a) => a.registro!),
            },
            { emitEvent: false },
          );
          // El contador del resumen escucha valueChanges: se avisa a mano.
          this.form.controls.resumen.updateValueAndValidity();
          const c = this.form.controls;
          this.habilitar(c.idFacultad, true);
          this.habilitar(c.idMateria, true);
          this.habilitar(c.idSemestre, true);
          this.habilitar(c.idGrupo, true);
          this.habilitar(c.idTipoTrabajo, true);
          this.cargando.set(false);
        },
        error: (err: unknown) => {
          this.cargando.set(false);
          this.error.set(mensajeDeError(err, 'No se pudieron cargar los datos del formulario.'));
        },
      });
  }

  /**
   * Coautores = autores menos el usuario autenticado, que el backend marca con
   * `esUsuarioActual` (el contrato pide no incluirlo en `registrosCoautores`).
   */
  private coautoresDe(autores: Autor[]): Autor[] {
    return autores.filter((a) => !a.esUsuarioActual && a.registro !== null);
  }
}
