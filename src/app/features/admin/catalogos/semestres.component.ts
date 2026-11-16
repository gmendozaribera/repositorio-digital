import { Component, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import type { Semestre, SemestreRequest } from '../../../api/catalog';
import { FiltroCatalogo } from '../../../core/services/catalogo.service';
import { PaginaCatalogo } from './pagina-catalogo';

/** "2/2026": formato habitual de la UAGRM para un periodo. */
export function etiquetaSemestre(s: Pick<Semestre, 'semestre' | 'anio'>): string {
  return `${s.semestre}/${s.anio}`;
}

/** Periodos academicos (numero de periodo + anio) de cada facultad. */
@Component({
  selector: 'app-semestres',
  imports: [ReactiveFormsModule],
  template: `
    <header class="page-header">
      <h1>Semestres</h1>
      <button class="btn btn-primary" type="button" (click)="nuevo()">Nuevo semestre</button>
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
      <section class="panel" aria-labelledby="titulo-form-semestre">
        <h2 id="titulo-form-semestre">{{ tituloFormulario() }}</h2>
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
              <span>Periodo</span>
              <select formControlName="semestre">
                <option [ngValue]="1">1 (primer semestre)</option>
                <option [ngValue]="2">2 (segundo semestre)</option>
                <option [ngValue]="3">3 (periodo especial)</option>
                <option [ngValue]="4">4 (periodo especial)</option>
              </select>
              @if (form.controls.semestre.touched && form.controls.semestre.invalid) {
                <small class="field-error">
                  {{ errorDelServidor(form.controls.semestre) ?? 'El periodo va de 1 a 4.' }}
                </small>
              }
            </label>
            <label class="field">
              <span>Año</span>
              <input
                formControlName="anio"
                type="number"
                inputmode="numeric"
                min="2000"
                max="2100"
              />
              @if (form.controls.anio.touched && form.controls.anio.invalid) {
                <small class="field-error">
                  {{ errorDelServidor(form.controls.anio) ?? 'Año entre 2000 y 2100.' }}
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
      <p class="cargando" role="status">Cargando semestres…</p>
    } @else if (items().length === 0) {
      <p class="estado-vacio">No hay semestres para el filtro elegido.</p>
    } @else {
      <table class="table">
        <caption class="sr-only">
          Semestres
        </caption>
        <thead>
          <tr>
            <th scope="col">Semestre</th>
            <th scope="col">Facultad</th>
            <th scope="col">Estado</th>
            <th scope="col"><span class="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          @for (s of items(); track s.idSemestre) {
            <tr [class.inactivo]="s.estado !== ACTIVO">
              <td data-label="Semestre">{{ etiquetaDe(s) }}</td>
              <td data-label="Facultad">{{ siglaFacultad(s.idFacultad) }}</td>
              <td data-label="Estado">
                @if (s.estado === ACTIVO) {
                  <span class="badge badge-success">Activo</span>
                } @else {
                  <span class="badge badge-muted">Desactivado</span>
                }
              </td>
              <td class="acciones">
                <button class="btn btn-outline btn-sm" type="button" (click)="editar(s)">
                  Editar <span class="sr-only">{{ etiquetaDe(s) }}</span>
                </button>
                @if (s.estado === ACTIVO) {
                  <button class="btn btn-link btn-sm" type="button" (click)="desactivar(s)">
                    Desactivar <span class="sr-only">{{ etiquetaDe(s) }}</span>
                  </button>
                } @else {
                  <button class="btn btn-link btn-sm" type="button" (click)="reactivar(s)">
                    Reactivar <span class="sr-only">{{ etiquetaDe(s) }}</span>
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
export class SemestresComponent
  extends PaginaCatalogo<Semestre, SemestreRequest, FiltroCatalogo>
  implements OnInit
{
  protected readonly recurso = this.catalogo.semestres;
  protected readonly entidad = 'Semestre';
  protected readonly femenino = false;

  protected readonly filtroFacultad = new FormControl<number | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    idFacultad: new FormControl<number | null>(null, Validators.required),
    semestre: [1, [Validators.required, Validators.min(1), Validators.max(4)]],
    anio: [
      new Date().getFullYear(),
      [Validators.required, Validators.min(2000), Validators.max(2100)],
    ],
  });

  constructor() {
    super();
    this.filtroFacultad.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.cargar());
  }

  ngOnInit(): void {
    this.cargarFacultades();
    this.cargar();
  }

  protected idDe(s: Semestre): number {
    return s.idSemestre;
  }

  protected etiquetaDe(s: Semestre): string {
    return etiquetaSemestre(s);
  }

  protected filtro(): FiltroCatalogo {
    return {
      idFacultad: this.filtroFacultad.value ?? undefined,
      incluirInactivos: this.mostrarInactivos(),
    };
  }

  protected requestDelFormulario(): SemestreRequest {
    const { idFacultad, semestre, anio } = this.form.getRawValue();
    return { idFacultad: idFacultad as number, semestre: Number(semestre), anio: Number(anio) };
  }

  protected requestDe(s: Semestre): SemestreRequest {
    return { idFacultad: s.idFacultad, semestre: s.semestre, anio: s.anio };
  }

  protected editarEnFormulario(s: Semestre): void {
    this.form.setValue({ idFacultad: s.idFacultad, semestre: s.semestre, anio: s.anio });
  }

  protected limpiarFormulario(): void {
    this.form.controls.idFacultad.setValue(this.filtroFacultad.value);
  }
}
