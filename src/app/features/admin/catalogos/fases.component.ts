import { Component, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import type { Fase, FaseRequest } from '../../../api/catalog';
import { FiltroCatalogo } from '../../../core/services/catalogo.service';
import { PaginaCatalogo } from './pagina-catalogo';

/** Fases de entrega de un trabajo (perfil, avance, final...) de cada facultad. */
@Component({
  selector: 'app-fases',
  imports: [ReactiveFormsModule],
  template: `
    <header class="page-header">
      <h1>Fases</h1>
      <button class="btn btn-primary" type="button" (click)="nuevo()">Nueva fase</button>
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
      Mostrar desactivadas
    </label>

    @if (mensaje()) {
      <p class="alert alert-success" role="status">{{ mensaje() }}</p>
    }
    @if (errorListado()) {
      <p class="alert alert-danger" role="alert">{{ errorListado() }}</p>
    }

    @if (formularioAbierto()) {
      <section class="panel" aria-labelledby="titulo-form-fase">
        <h2 id="titulo-form-fase">{{ tituloFormulario() }}</h2>
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
          <label class="field">
            <span>Descripción (opcional)</span>
            <textarea formControlName="descripcion" rows="2" maxlength="255"></textarea>
            @if (form.controls.descripcion.touched && form.controls.descripcion.invalid) {
              <small class="field-error">
                {{ errorDelServidor(form.controls.descripcion) ?? 'Máximo 255 caracteres.' }}
              </small>
            }
          </label>
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
      <p class="cargando" role="status">Cargando fases…</p>
    } @else if (items().length === 0) {
      <p class="estado-vacio">No hay fases para el filtro elegido.</p>
    } @else {
      <table class="table">
        <caption class="sr-only">
          Fases
        </caption>
        <thead>
          <tr>
            <th scope="col">Nombre</th>
            <th scope="col">Descripción</th>
            <th scope="col">Facultad</th>
            <th scope="col">Estado</th>
            <th scope="col"><span class="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          @for (f of items(); track f.idFase) {
            <tr [class.inactivo]="f.estado !== ACTIVO">
              <td data-label="Nombre">{{ f.nombre }}</td>
              <td data-label="Descripción">{{ f.descripcion || '—' }}</td>
              <td data-label="Facultad">{{ siglaFacultad(f.idFacultad) }}</td>
              <td data-label="Estado">
                @if (f.estado === ACTIVO) {
                  <span class="badge badge-success">Activa</span>
                } @else {
                  <span class="badge badge-muted">Desactivada</span>
                }
              </td>
              <td class="acciones">
                <button class="btn btn-outline btn-sm" type="button" (click)="editar(f)">
                  Editar <span class="sr-only">{{ f.nombre }}</span>
                </button>
                @if (f.estado === ACTIVO) {
                  <button class="btn btn-link btn-sm" type="button" (click)="desactivar(f)">
                    Desactivar <span class="sr-only">{{ f.nombre }}</span>
                  </button>
                } @else {
                  <button class="btn btn-link btn-sm" type="button" (click)="reactivar(f)">
                    Reactivar <span class="sr-only">{{ f.nombre }}</span>
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
export class FasesComponent
  extends PaginaCatalogo<Fase, FaseRequest, FiltroCatalogo>
  implements OnInit
{
  protected readonly recurso = this.catalogo.fases;
  protected readonly entidad = 'Fase';
  protected readonly femenino = true;

  protected readonly filtroFacultad = new FormControl<number | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    idFacultad: new FormControl<number | null>(null, Validators.required),
    nombre: ['', [Validators.required, Validators.maxLength(100)]],
    descripcion: ['', Validators.maxLength(255)],
  });

  constructor() {
    super();
    this.filtroFacultad.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.cargar());
  }

  ngOnInit(): void {
    this.cargarFacultades();
    this.cargar();
  }

  protected idDe(f: Fase): number {
    return f.idFase;
  }

  protected etiquetaDe(f: Fase): string {
    return f.nombre;
  }

  protected filtro(): FiltroCatalogo {
    return {
      idFacultad: this.filtroFacultad.value ?? undefined,
      incluirInactivos: this.mostrarInactivos(),
    };
  }

  protected requestDelFormulario(): FaseRequest {
    const { idFacultad, nombre, descripcion } = this.form.getRawValue();
    return {
      idFacultad: idFacultad as number,
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || null,
    };
  }

  protected requestDe(f: Fase): FaseRequest {
    return { idFacultad: f.idFacultad, nombre: f.nombre, descripcion: f.descripcion };
  }

  protected editarEnFormulario(f: Fase): void {
    this.form.setValue({
      idFacultad: f.idFacultad,
      nombre: f.nombre,
      descripcion: f.descripcion ?? '',
    });
  }

  protected limpiarFormulario(): void {
    this.form.controls.idFacultad.setValue(this.filtroFacultad.value);
  }
}
