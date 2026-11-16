import { Component, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type { DocenteGrupo } from '../../../api/catalog';
import {
  aplicarErroresDelServidor,
  errorDelServidor,
  mensajeDeError,
} from '../../../core/http/error-message';
import { CatalogoService } from '../../../core/services/catalogo.service';

/**
 * Docentes asignados a un grupo (GrupoDocente) y el flag esAdminCurso: el Docente
 * Administrador de Curso gestiona los trabajos y calificaciones de ese grupo.
 */
@Component({
  selector: 'app-docentes-grupo',
  imports: [ReactiveFormsModule],
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
      <form [formGroup]="form" (ngSubmit)="asignar()" class="inline-form" novalidate>
        <label class="field">
          <span>Id de usuario del docente</span>
          <input formControlName="idUsuario" type="number" inputmode="numeric" min="1" />
          @if (form.controls.idUsuario.touched && form.controls.idUsuario.invalid) {
            <small class="field-error">
              {{ errorDelServidor(form.controls.idUsuario) ?? 'Ingrese un id de usuario válido.' }}
            </small>
          }
        </label>
        <label class="check">
          <input type="checkbox" formControlName="esAdminCurso" />
          Administrador de curso
        </label>
        <button class="btn btn-primary" type="submit" [disabled]="ocupado()">Asignar</button>
      </form>
      <p class="muted">
        El usuario debe estar activo y tener rol DOCENTE. La búsqueda de docentes por nombre llegará
        con el módulo de usuarios.
      </p>
    </section>
  `,
})
export class DocentesGrupoComponent {
  private readonly catalogo = inject(CatalogoService);
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

  constructor() {
    effect(() => this.cargar(this.idGrupo()));
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
