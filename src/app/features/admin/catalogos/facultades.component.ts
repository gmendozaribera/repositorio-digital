import { Component, inject, OnInit } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type { Facultad, FacultadRequest } from '../../../api/catalog';
import { FiltroCatalogo } from '../../../core/services/catalogo.service';
import { PaginaCatalogo } from './pagina-catalogo';

/** Facultades: raiz de todos los catalogos. */
@Component({
  selector: 'app-facultades',
  imports: [ReactiveFormsModule],
  template: `
    <header class="page-header">
      <h1>Facultades</h1>
      <button class="btn btn-primary" type="button" (click)="nuevo()">Nueva facultad</button>
    </header>

    <label class="check">
      <input
        type="checkbox"
        [checked]="mostrarInactivos()"
        (change)="cambiarInactivos($any($event.target).checked)"
      />
      Mostrar desactivadas
    </label>

    @if (mensaje()) {
      <p class="alert alert-success" role="status">{{ mensaje() }}</p>
    }
    @if (errorListado()) {
      <p class="alert alert-danger" role="alert">{{ errorListado() }}</p>
    }

    @if (formularioAbierto()) {
      <section class="panel" aria-labelledby="titulo-form-facultad">
        <h2 id="titulo-form-facultad">{{ tituloFormulario() }}</h2>
        @if (errorFormulario()) {
          <p class="alert alert-danger" role="alert">{{ errorFormulario() }}</p>
        }
        <form [formGroup]="form" (ngSubmit)="guardar()" novalidate>
          <div class="form-grid">
            <label class="field">
              <span>Sigla</span>
              <input #primerCampo formControlName="sigla" maxlength="20" autocomplete="off" />
              @if (form.controls.sigla.touched && form.controls.sigla.invalid) {
                <small class="field-error">
                  {{ errorDelServidor(form.controls.sigla) ?? 'Ingrese la sigla (máx. 20).' }}
                </small>
              }
            </label>
            <label class="field">
              <span>Nombre</span>
              <input formControlName="nombre" maxlength="150" autocomplete="off" />
              @if (form.controls.nombre.touched && form.controls.nombre.invalid) {
                <small class="field-error">
                  {{ errorDelServidor(form.controls.nombre) ?? 'Ingrese el nombre (máx. 150).' }}
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
      <p class="cargando" role="status">Cargando facultades…</p>
    } @else if (items().length === 0) {
      <p class="estado-vacio">No hay facultades registradas.</p>
    } @else {
      <table class="table">
        <caption class="sr-only">
          Facultades
        </caption>
        <thead>
          <tr>
            <th scope="col">Sigla</th>
            <th scope="col">Nombre</th>
            <th scope="col">Estado</th>
            <th scope="col"><span class="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          @for (f of items(); track f.idFacultad) {
            <tr [class.inactivo]="f.estado !== ACTIVO">
              <td data-label="Sigla">{{ f.sigla }}</td>
              <td data-label="Nombre">{{ f.nombre }}</td>
              <td data-label="Estado">
                @if (f.estado === ACTIVO) {
                  <span class="badge badge-success">Activa</span>
                } @else {
                  <span class="badge badge-muted">Desactivada</span>
                }
              </td>
              <td class="acciones">
                <button class="btn btn-outline btn-sm" type="button" (click)="editar(f)">
                  Editar <span class="sr-only">{{ f.sigla }}</span>
                </button>
                @if (f.estado === ACTIVO) {
                  <button class="btn btn-link btn-sm" type="button" (click)="desactivar(f)">
                    Desactivar <span class="sr-only">{{ f.sigla }}</span>
                  </button>
                } @else {
                  <button class="btn btn-link btn-sm" type="button" (click)="reactivar(f)">
                    Reactivar <span class="sr-only">{{ f.sigla }}</span>
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
export class FacultadesComponent
  extends PaginaCatalogo<Facultad, FacultadRequest, Omit<FiltroCatalogo, 'idFacultad'>>
  implements OnInit
{
  protected readonly recurso = this.catalogo.facultades;
  protected readonly entidad = 'Facultad';
  protected readonly femenino = true;

  protected readonly form = inject(NonNullableFormBuilder).group({
    sigla: ['', [Validators.required, Validators.maxLength(20)]],
    nombre: ['', [Validators.required, Validators.maxLength(150)]],
  });

  ngOnInit(): void {
    this.cargar();
  }

  protected idDe(f: Facultad): number {
    return f.idFacultad;
  }

  protected etiquetaDe(f: Facultad): string {
    return f.sigla;
  }

  protected filtro() {
    return { incluirInactivos: this.mostrarInactivos() };
  }

  protected requestDelFormulario(): FacultadRequest {
    const { sigla, nombre } = this.form.getRawValue();
    return { sigla: sigla.trim(), nombre: nombre.trim() };
  }

  protected requestDe(f: Facultad): FacultadRequest {
    return { sigla: f.sigla, nombre: f.nombre };
  }

  protected editarEnFormulario(f: Facultad): void {
    this.form.setValue({ sigla: f.sigla, nombre: f.nombre });
  }

  protected limpiarFormulario(): void {
    // Sin valores por defecto.
  }
}
