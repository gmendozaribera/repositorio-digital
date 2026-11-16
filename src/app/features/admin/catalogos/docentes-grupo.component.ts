import { Component, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { catchError, debounceTime, distinctUntilChanged, map, of, switchMap, tap } from 'rxjs';
import type { DocenteGrupo } from '../../../api/catalog';
import type { Usuario } from '../../../api/user';
import {
  aplicarErroresDelServidor,
  errorDelServidor,
  mensajeDeError,
} from '../../../core/http/error-message';
import { CatalogoService } from '../../../core/services/catalogo.service';
import { UsuarioService } from '../../../core/services/usuario.service';

/** Minimo de caracteres para buscar docentes (evita traer media lista con una letra). */
const MIN_BUSQUEDA = 2;

/**
 * Docentes asignados a un grupo (GrupoDocente) y el flag esAdminCurso: el Docente
 * Administrador de Curso gestiona los trabajos y calificaciones de ese grupo.
 */
@Component({
  selector: 'app-docentes-grupo',
  imports: [ReactiveFormsModule],
  styles: `
    .buscador label {
      display: block;
      font-size: 0.85rem;
      font-weight: 600;
      margin-bottom: 0.3rem;
    }
    .docente-elegido {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
      margin: 0;
    }
    .resultados {
      list-style: none;
      margin: 0.4rem 0 0;
      padding: 0;
      max-height: 16rem;
      overflow-y: auto;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
    }
    .resultado {
      display: flex;
      flex-direction: column;
      width: 100%;
      padding: 0.5rem 0.75rem;
      border: 0;
      border-bottom: 1px solid var(--border);
      background: none;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .resultado:hover:not(:disabled),
    .resultado:focus-visible {
      background: var(--accent-lt);
    }
    .resultado:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }
  `,
  template: `
    <section class="panel" aria-labelledby="titulo-docentes">
      <div class="page-header">
        <h2 id="titulo-docentes">Docentes del grupo {{ titulo() }}</h2>
        <button class="btn btn-link btn-sm" type="button" (click)="cerrar.emit()">Cerrar</button>
      </div>

      @if (mensaje()) {
        <p class="alert alert-success" role="status">{{ mensaje() }}</p>
      }
      @if (error()) {
        <p class="alert alert-danger" role="alert">{{ error() }}</p>
      }

      @if (cargando()) {
        <p class="cargando" role="status">Cargando docentes…</p>
      } @else if (docentes().length === 0) {
        <p class="estado-vacio">Este grupo todavía no tiene docentes asignados.</p>
      } @else {
        <table class="table">
          <caption class="sr-only">
            Docentes asignados
          </caption>
          <thead>
            <tr>
              <th scope="col">Docente</th>
              <th scope="col">Usuario</th>
              <th scope="col">Rol en el grupo</th>
              <th scope="col"><span class="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            @for (d of docentes(); track d.idUsuario) {
              <tr>
                <td data-label="Docente">{{ d.apellidos }}, {{ d.nombre }}</td>
                <td data-label="Usuario">{{ d.usuario }}</td>
                <td data-label="Rol en el grupo">
                  @if (d.esAdminCurso) {
                    <span class="badge badge-purple">Administrador de curso</span>
                  } @else {
                    <span class="badge">Docente</span>
                  }
                </td>
                <td class="acciones">
                  <button
                    class="btn btn-outline btn-sm"
                    type="button"
                    [disabled]="ocupado()"
                    (click)="cambiarAdminCurso(d)"
                  >
                    {{ d.esAdminCurso ? 'Quitar admin. de curso' : 'Hacer admin. de curso' }}
                    <span class="sr-only">{{ d.usuario }}</span>
                  </button>
                  <button
                    class="btn btn-link btn-sm"
                    type="button"
                    [disabled]="ocupado()"
                    (click)="quitar(d)"
                  >
                    Quitar <span class="sr-only">{{ d.usuario }}</span>
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      }

      <h2>Asignar docente</h2>
      <form [formGroup]="form" (ngSubmit)="asignar()" novalidate>
        @if (seleccionado(); as s) {
          <div class="field">
            <span>Docente</span>
            <p class="docente-elegido">
              <strong>{{ s.nombre }} {{ s.apellidos }}</strong>
              <span class="muted">({{ s.usuario }})</span>
              <button class="btn btn-link btn-sm" type="button" (click)="cambiarDocente()">
                Cambiar
              </button>
            </p>
          </div>
        } @else {
          <div class="field buscador">
            <label for="buscar-docente">Buscar docente</label>
            <input
              id="buscar-docente"
              [formControl]="busqueda"
              type="search"
              maxlength="100"
              autocomplete="off"
              placeholder="Nombre, apellidos, usuario o CI"
              aria-describedby="ayuda-buscar-docente"
              aria-controls="resultados-docente"
            />
            <small id="ayuda-buscar-docente" class="muted">
              Escriba al menos 2 caracteres. Solo aparecen usuarios activos con rol Docente.
            </small>
            @if (buscando()) {
              <small class="muted" role="status">Buscando…</small>
            } @else if (errorBusqueda()) {
              <small class="field-error" role="alert">{{ errorBusqueda() }}</small>
            } @else if (resultados(); as lista) {
              @if (lista.length === 0) {
                <small class="muted" role="status">No se encontraron docentes.</small>
              } @else {
                <ul id="resultados-docente" class="resultados" aria-label="Docentes encontrados">
                  @for (u of lista; track u.idUsuario) {
                    <li>
                      <button
                        type="button"
                        class="resultado"
                        [disabled]="yaAsignado(u.idUsuario)"
                        (click)="elegir(u)"
                      >
                        <span>{{ u.nombre }} {{ u.apellidos }}</span>
                        <span class="muted">
                          {{ u.usuario }}{{ yaAsignado(u.idUsuario) ? ' · ya asignado' : '' }}
                        </span>
                      </button>
                    </li>
                  }
                </ul>
              }
            }
          </div>
        }
        @if (form.controls.idUsuario.touched && form.controls.idUsuario.invalid) {
          <small class="field-error">
            {{ errorDelServidor(form.controls.idUsuario) ?? 'Busque y elija un docente.' }}
          </small>
        }
        <label class="check">
          <input type="checkbox" formControlName="esAdminCurso" />
          Administrador de curso
        </label>
        <button class="btn btn-primary" type="submit" [disabled]="ocupado()">Asignar</button>
      </form>
    </section>
  `,
})
export class DocentesGrupoComponent {
  private readonly catalogo = inject(CatalogoService);
  private readonly usuarios = inject(UsuarioService);
  private readonly destroyRef = inject(DestroyRef);

  readonly idGrupo = input.required<number>();
  readonly titulo = input('');
  readonly cerrar = output<void>();

  protected readonly docentes = signal<DocenteGrupo[]>([]);
  protected readonly cargando = signal(false);
  protected readonly ocupado = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly mensaje = signal<string | null>(null);
  protected readonly errorDelServidor = errorDelServidor;

  protected readonly form = inject(NonNullableFormBuilder).group({
    idUsuario: [null as number | null, [Validators.required, Validators.min(1)]],
    esAdminCurso: [false],
  });

  /** Buscador de docentes (user-service: GET /usuarios?rol=DOCENTE&q=...). */
  protected readonly busqueda = new FormControl('', { nonNullable: true });
  /** null = todavia no se busco (texto muy corto). */
  protected readonly resultados = signal<Usuario[] | null>(null);
  protected readonly buscando = signal(false);
  protected readonly errorBusqueda = signal<string | null>(null);
  protected readonly seleccionado = signal<Usuario | null>(null);

  constructor() {
    effect(() => this.cargar(this.idGrupo()));

    // Debounce + switchMap: espera a que deje de escribir y descarta respuestas viejas.
    this.busqueda.valueChanges
      .pipe(
        map((q) => q.trim()),
        debounceTime(300),
        distinctUntilChanged(),
        tap((q) => {
          this.errorBusqueda.set(null);
          this.buscando.set(q.length >= MIN_BUSQUEDA);
          if (q.length < MIN_BUSQUEDA) {
            this.resultados.set(null);
          }
        }),
        switchMap((q) =>
          q.length < MIN_BUSQUEDA
            ? of(null)
            : this.usuarios.buscarDocentes(q).pipe(
                catchError((err: unknown) => {
                  this.errorBusqueda.set(mensajeDeError(err, 'No se pudo buscar docentes.'));
                  return of(null);
                }),
              ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((lista) => {
        this.buscando.set(false);
        if (lista) {
          this.resultados.set(lista);
        }
      });
  }

  protected yaAsignado(idUsuario: number): boolean {
    return this.docentes().some((d) => d.idUsuario === idUsuario);
  }

  protected elegir(u: Usuario): void {
    this.seleccionado.set(u);
    this.form.controls.idUsuario.setValue(u.idUsuario);
  }

  protected cambiarDocente(): void {
    this.seleccionado.set(null);
    this.form.controls.idUsuario.setValue(null);
  }

  private limpiarBusqueda(): void {
    this.seleccionado.set(null);
    this.resultados.set(null);
    this.busqueda.setValue('', { emitEvent: false });
  }

  protected asignar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { idUsuario, esAdminCurso } = this.form.getRawValue();
    this.empezar();
    this.catalogo
      .asignarDocente(this.idGrupo(), { idUsuario: Number(idUsuario), esAdminCurso })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (d) => {
          this.form.reset({ idUsuario: null, esAdminCurso: false });
          this.limpiarBusqueda();
          this.terminar(`${d.nombre} ${d.apellidos} asignado al grupo.`);
        },
        error: (err: unknown) => {
          this.ocupado.set(false);
          this.error.set(aplicarErroresDelServidor(this.form, err, 'No se pudo asignar.'));
        },
      });
  }

  protected quitar(d: DocenteGrupo): void {
    if (!confirm(`¿Quitar a ${d.nombre} ${d.apellidos} de este grupo?`)) {
      return;
    }
    this.empezar();
    this.catalogo
      .quitarDocente(this.idGrupo(), d.idUsuario)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.terminar(`${d.nombre} ${d.apellidos} ya no está asignado.`),
        error: (err: unknown) => this.fallar(err),
      });
  }

  /** Invierte esAdminCurso con el PATCH de la asignacion (una sola operacion, sin quitar al docente). */
  protected cambiarAdminCurso(d: DocenteGrupo): void {
    this.empezar();
    this.catalogo
      .actualizarDocente(this.idGrupo(), d.idUsuario, { esAdminCurso: !d.esAdminCurso })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (nuevo) =>
          this.terminar(
            nuevo.esAdminCurso
              ? `${d.nombre} ${d.apellidos} ahora es administrador de curso.`
              : `${d.nombre} ${d.apellidos} ya no es administrador de curso.`,
          ),
        error: (err: unknown) => this.fallar(err),
      });
  }

  private cargar(idGrupo: number): void {
    this.cargando.set(true);
    this.catalogo
      .docentesDeGrupo(idGrupo)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (docentes) => {
          this.docentes.set(docentes);
          this.cargando.set(false);
        },
        error: (err: unknown) => {
          this.docentes.set([]);
          this.cargando.set(false);
          this.error.set(mensajeDeError(err, 'No se pudieron cargar los docentes.'));
        },
      });
  }

  private empezar(): void {
    this.ocupado.set(true);
    this.error.set(null);
    this.mensaje.set(null);
  }

  private terminar(mensaje: string): void {
    this.ocupado.set(false);
    this.mensaje.set(mensaje);
    this.cargar(this.idGrupo());
  }

  private fallar(err: unknown): void {
    this.ocupado.set(false);
    this.error.set(mensajeDeError(err, 'No se pudo completar la acción.'));
    this.cargar(this.idGrupo());
  }
}
