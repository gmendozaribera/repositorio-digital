import { Component, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import type { TipoTrabajo, TipoTrabajoRequest } from '../../../api/catalog';
import { FiltroCatalogo } from '../../../core/services/catalogo.service';
import { PaginaCatalogo } from './pagina-catalogo';

/** Tipos de trabajo (proyecto, tesis, monografia...) de cada facultad. */
@Component({
  selector: 'app-tipos-trabajo',
  imports: [ReactiveFormsModule],
  template: `
    <header class="page-header">
      <h1>Tipos de trabajo</h1>
      <button class="btn btn-primary" type="button" (click)="nuevo()">Nuevo tipo</button>
    </header>

    <div class="filters">
      <label class="field">
        <span>Facultad</span>
        <select [formControl]="filtroFacultad">
          <option [ngValue]="null">Todas</option>
          @for (f of facultades(); track f.idFacultad) {
            <option [ngValue]="f.idFacultad">{{ f.sigla }} — {{ f.nombre }}</option>
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
      <section class="panel" aria-labelledby="titulo-form-tipo">
        <h2 id="titulo-form-tipo">{{ tituloFormulario() }}</h2>
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
                <small class="field-error">
                  {{ errorDelServidor(form.controls.idFacultad) ?? 'Seleccione la facultad.' }}
                </small>
              }
            </label>
            <label class="field">
              <span>Nombre</span>
              <input formControlName="nombre" maxlength="100" autocomplete="off" />
              @if (form.controls.nombre.touched && form.controls.nombre.invalid) {
                <small class="field-error">
                  {{ errorDelServidor(form.controls.nombre) ?? 'Ingrese el nombre (máx. 100).' }}
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

    @if (cargando()) {
      <p class="cargando" role="status">Cargando tipos de trabajo…</p>
    } @else if (items().length === 0) {
      <p class="estado-vacio">No hay tipos de trabajo para el filtro elegido.</p>
    } @else {
      <table class="table">
        <caption class="sr-only">
          Tipos de trabajo
        </caption>
        <thead>
          <tr>
            <th scope="col">Nombre</th>
            <th scope="col">Facultad</th>
            <th scope="col">Estado</th>
            <th scope="col"><span class="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          @for (t of items(); track t.idTipoTrabajo) {
            <tr [class.inactivo]="t.estado !== ACTIVO">
              <td data-label="Nombre">{{ t.nombre }}</td>
              <td data-label="Facultad">{{ siglaFacultad(t.idFacultad) }}</td>
              <td data-label="Estado">
                @if (t.estado === ACTIVO) {
                  <span class="badge badge-success">Activo</span>
                } @else {
                  <span class="badge badge-muted">Desactivado</span>
                }
              </td>
              <td class="acciones">
                <button class="btn btn-outline btn-sm" type="button" (click)="editar(t)">
                  Editar <span class="sr-only">{{ t.nombre }}</span>
                </button>
                @if (t.estado === ACTIVO) {
                  <button class="btn btn-link btn-sm" type="button" (click)="desactivar(t)">
                    Desactivar <span class="sr-only">{{ t.nombre }}</span>
                  </button>
                } @else {
                  <button class="btn btn-link btn-sm" type="button" (click)="reactivar(t)">
                    Reactivar <span class="sr-only">{{ t.nombre }}</span>
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
export class TiposTrabajoComponent
  extends PaginaCatalogo<TipoTrabajo, TipoTrabajoRequest, FiltroCatalogo>
  implements OnInit
{
  protected readonly recurso = this.catalogo.tiposTrabajo;
  protected readonly entidad = 'Tipo de trabajo';
  protected readonly femenino = false;

  protected readonly filtroFacultad = new FormControl<number | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    idFacultad: new FormControl<number | null>(null, Validators.required),
    nombre: ['', [Validators.required, Validators.maxLength(100)]],
  });

  constructor() {
    super();
    this.filtroFacultad.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.cargar());
  }

  ngOnInit(): void {
    this.cargarFacultades();
    this.cargar();
  }

  protected idDe(t: TipoTrabajo): number {
    return t.idTipoTrabajo;
  }

  protected etiquetaDe(t: TipoTrabajo): string {
    return t.nombre;
  }

  protected filtro(): FiltroCatalogo {
    return {
      idFacultad: this.filtroFacultad.value ?? undefined,
      incluirInactivos: this.mostrarInactivos(),
    };
  }

  protected requestDelFormulario(): TipoTrabajoRequest {
    const { idFacultad, nombre } = this.form.getRawValue();
    return { idFacultad: idFacultad as number, nombre: nombre.trim() };
  }

  protected requestDe(t: TipoTrabajo): TipoTrabajoRequest {
    return { idFacultad: t.idFacultad, nombre: t.nombre };
  }

  protected editarEnFormulario(t: TipoTrabajo): void {
    this.form.setValue({ idFacultad: t.idFacultad, nombre: t.nombre });
  }

  protected limpiarFormulario(): void {
    this.form.controls.idFacultad.setValue(this.filtroFacultad.value);
  }
}
