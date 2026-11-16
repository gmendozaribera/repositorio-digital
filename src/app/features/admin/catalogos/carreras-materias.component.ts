import { Component, Directive, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import type { Carrera, CarreraRequest, Materia, MateriaRequest } from '../../../api/catalog';
import { FiltroCatalogo } from '../../../core/services/catalogo.service';
import { PaginaCatalogo } from './pagina-catalogo';

type ItemSiglaNombre = { nombre: string; sigla: string; idFacultad: number; estado: 0 | 1 };
type RequestSiglaNombre = { nombre: string; sigla: string; idFacultad: number; estado?: 0 | 1 };

/**
 * Carreras y materias tienen la misma forma (sigla, nombre, facultad): comparten plantilla y logica,
 * con un filtro por facultad que tambien es el valor por defecto del formulario.
 */
@Directive()
abstract class PaginaSiglaNombre<T extends ItemSiglaNombre, R extends RequestSiglaNombre>
  extends PaginaCatalogo<T, R, FiltroCatalogo>
  implements OnInit
{
  /** Plural para titulos y mensajes ("Carreras"). */
  protected abstract readonly plural: string;

  protected readonly filtroFacultad = new FormControl<number | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    idFacultad: this.fbNumero(),
    sigla: ['', [Validators.required, Validators.maxLength(20)]],
    nombre: ['', [Validators.required, Validators.maxLength(150)]],
  });

  constructor() {
    super();
    this.filtroFacultad.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.cargar());
  }

  ngOnInit(): void {
    this.cargarFacultades();
    this.cargar();
  }

  protected etiquetaDe(item: T): string {
    return item.sigla;
  }

  protected filtro(): FiltroCatalogo {
    return {
      idFacultad: this.filtroFacultad.value ?? undefined,
      incluirInactivos: this.mostrarInactivos(),
    };
  }

  protected requestDelFormulario(): R {
    const { idFacultad, sigla, nombre } = this.form.getRawValue();
    return { idFacultad: idFacultad as number, sigla: sigla.trim(), nombre: nombre.trim() } as R;
  }

  protected requestDe(item: T): R {
    return { idFacultad: item.idFacultad, sigla: item.sigla, nombre: item.nombre } as R;
  }

  protected editarEnFormulario(item: T): void {
    this.form.setValue({ idFacultad: item.idFacultad, sigla: item.sigla, nombre: item.nombre });
  }

  protected limpiarFormulario(): void {
    this.form.controls.idFacultad.setValue(this.filtroFacultad.value);
  }

  private fbNumero() {
    return new FormControl<number | null>(null, Validators.required);
  }
}

const PLANTILLA = `
  <header class="page-header">
    <h1>{{ plural }}</h1>
    <button class="btn btn-primary" type="button" (click)="nuevo()">{{ tituloNuevo }}</button>
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
    <section class="panel" aria-labelledby="titulo-form">
      <h2 id="titulo-form">{{ tituloFormulario() }}</h2>
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
            <span>Sigla</span>
            <input formControlName="sigla" maxlength="20" autocomplete="off" />
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
          <button class="btn btn-link" type="button" (click)="cerrarFormulario()">Cancelar</button>
        </div>
      </form>
    </section>
  }

  @if (cargando()) {
    <p class="cargando" role="status">Cargando {{ plural.toLowerCase() }}…</p>
  } @else if (items().length === 0) {
    <p class="estado-vacio">No hay {{ plural.toLowerCase() }} para el filtro elegido.</p>
  } @else {
    <table class="table">
      <caption class="sr-only">{{ plural }}</caption>
      <thead>
        <tr>
          <th scope="col">Sigla</th>
          <th scope="col">Nombre</th>
          <th scope="col">Facultad</th>
          <th scope="col">Estado</th>
          <th scope="col"><span class="sr-only">Acciones</span></th>
        </tr>
      </thead>
      <tbody>
        @for (item of items(); track idDe(item)) {
          <tr [class.inactivo]="item.estado !== ACTIVO">
            <td data-label="Sigla">{{ item.sigla }}</td>
            <td data-label="Nombre">{{ item.nombre }}</td>
            <td data-label="Facultad">{{ siglaFacultad(item.idFacultad) }}</td>
            <td data-label="Estado">
              @if (item.estado === ACTIVO) {
                <span class="badge badge-success">Activa</span>
              } @else {
                <span class="badge badge-muted">Desactivada</span>
              }
            </td>
            <td class="acciones">
              <button class="btn btn-outline btn-sm" type="button" (click)="editar(item)">
                Editar <span class="sr-only">{{ item.sigla }}</span>
              </button>
              @if (item.estado === ACTIVO) {
                <button class="btn btn-link btn-sm" type="button" (click)="desactivar(item)">
                  Desactivar <span class="sr-only">{{ item.sigla }}</span>
                </button>
              } @else {
                <button class="btn btn-link btn-sm" type="button" (click)="reactivar(item)">
                  Reactivar <span class="sr-only">{{ item.sigla }}</span>
                </button>
              }
            </td>
          </tr>
        }
      </tbody>
    </table>
  }
`;

@Component({
  selector: 'app-carreras',
  imports: [ReactiveFormsModule],
  template: PLANTILLA,
})
export class CarrerasComponent extends PaginaSiglaNombre<Carrera, CarreraRequest> {
  protected readonly recurso = this.catalogo.carreras;
  protected readonly entidad = 'Carrera';
  protected readonly plural = 'Carreras';
  protected readonly tituloNuevo = 'Nueva carrera';
  protected readonly femenino = true;

  protected idDe(c: Carrera): number {
    return c.idCarrera;
  }
}

@Component({
  selector: 'app-materias',
  imports: [ReactiveFormsModule],
  template: PLANTILLA,
})
export class MateriasComponent extends PaginaSiglaNombre<Materia, MateriaRequest> {
  protected readonly recurso = this.catalogo.materias;
  protected readonly entidad = 'Materia';
  protected readonly plural = 'Materias';
  protected readonly tituloNuevo = 'Nueva materia';
  protected readonly femenino = true;

  protected idDe(m: Materia): number {
    return m.idMateria;
  }
}
