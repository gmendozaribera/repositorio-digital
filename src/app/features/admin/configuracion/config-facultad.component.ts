import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { catchError, EMPTY, Subject, switchMap } from 'rxjs';
import type { ConfigFacultad, ConfigFacultadRequest, Facultad } from '../../../api/catalog';
import {
  aplicarErroresDelServidor,
  errorDelServidor,
  mensajeDeError,
} from '../../../core/http/error-message';
import { CatalogoService } from '../../../core/services/catalogo.service';

const ENTERO = /^\d+$/;

/** Validadores de un entero entre `min` y `max` (rangos de ConfigFacultadRequest en catalog-api.yaml). */
const entero = (min: number, max: number) => [
  Validators.required,
  Validators.min(min),
  Validators.max(max),
  Validators.pattern(ENTERO),
];

/** El umbral medio debe ser menor que el alto (error de grupo `umbrales`). */
export function umbralesOrdenados(grupo: AbstractControl): ValidationErrors | null {
  const medio: unknown = grupo.get('umbralPlagioMedio')?.value;
  const alto: unknown = grupo.get('umbralPlagioAlto')?.value;
  if (typeof medio !== 'number' || typeof alto !== 'number') {
    return null; // cada campo ya informa su propio error
  }
  return medio < alto ? null : { umbrales: true };
}

/** Tramo del semaforo de plagio para la vista previa. */
interface Tramo {
  clase: 'verde' | 'amarillo' | 'rojo';
  nombre: string;
  rango: string;
  /** Ancho en % de la barra. */
  ancho: number;
}

/**
 * Configuracion por facultad (catalog-service): limites de archivos, umbrales del semaforo de
 * plagio, escala de calificacion, acceso externo y duracion de la sesion. Mientras la facultad no
 * guarde la suya usa los valores por defecto del sistema (grupo FACULTAD_DEFAULT_GROUP).
 */
@Component({
  selector: 'app-config-facultad',
  imports: [ReactiveFormsModule],
  template: `
    <header class="page-header">
      <h1>Configuración de la facultad</h1>
    </header>

    <p class="alert alert-info">
      Los cambios se aplican al instante en todos los módulos de la facultad. La duración de la
      sesión solo afecta a los inicios de sesión posteriores: quien ya está conectado conserva la
      duración con la que entró.
    </p>

    <div class="filters">
      <label class="field">
        <span>Facultad</span>
        <select
          [value]="idFacultad() ?? ''"
          (change)="elegirFacultad($any($event.target).value)"
          [disabled]="facultades().length === 0"
        >
          <option value="" disabled>Seleccione una facultad</option>
          @for (f of facultades(); track f.idFacultad) {
            <option [value]="f.idFacultad">{{ f.sigla }} — {{ f.nombre }}</option>
          }
        </select>
      </label>
    </div>

    @if (mensaje()) {
      <p class="alert alert-success" role="status">{{ mensaje() }}</p>
    }
    @if (error()) {
      <p class="alert alert-danger" role="alert">{{ error() }}</p>
    }

    @if (cargando()) {
      <p class="cargando" role="status">Cargando configuración…</p>
    } @else if (config(); as c) {
      <p class="estado-config">
        @if (c.personalizada) {
          <span class="badge badge-success">Configuración propia</span>
        } @else {
          <span class="badge badge-warn">Usando valores por defecto</span>
          <span class="muted texto-chico">
            Esta facultad aún no guardó su configuración: rigen los valores por defecto del sistema.
            Al guardar, la facultad pasa a tener la suya.
          </span>
        }
      </p>

      <form [formGroup]="form" (ngSubmit)="guardar()" novalidate>
        <h2>Archivos</h2>
        <div class="form-grid">
          <label class="field">
            <span>Tamaño máximo por archivo (MB)</span>
            <input type="number" formControlName="tamanoMaxArchivoMB" min="1" max="100" step="1" />
            @if (invalido('tamanoMaxArchivoMB')) {
              <small class="field-error">{{ mensajeCampo('tamanoMaxArchivoMB', 1, 100) }}</small>
            }
            <small class="muted texto-chico">
              Los videos subidos directamente tienen un límite fijo de 100 MB.
            </small>
          </label>
        </div>

        <h2>Detección de plagio</h2>
        <div class="form-grid">
          <label class="field">
            <span>Riesgo medio desde (%)</span>
            <input type="number" formControlName="umbralPlagioMedio" min="0" max="100" step="1" />
            @if (invalido('umbralPlagioMedio')) {
              <small class="field-error">{{ mensajeCampo('umbralPlagioMedio', 0, 100) }}</small>
            }
          </label>
          <label class="field">
            <span>Riesgo alto desde (%)</span>
            <input type="number" formControlName="umbralPlagioAlto" min="0" max="100" step="1" />
            @if (invalido('umbralPlagioAlto')) {
              <small class="field-error">{{ mensajeCampo('umbralPlagioAlto', 0, 100) }}</small>
            }
          </label>
        </div>
        @if (errorUmbrales()) {
          <p class="field-error" role="alert" id="error-umbrales">
            El umbral de riesgo medio debe ser menor que el de riesgo alto.
          </p>
        }

        <figure class="semaforo" aria-labelledby="titulo-semaforo">
          <figcaption id="titulo-semaforo" class="muted texto-chico">
            Vista previa del semáforo de plagio (porcentaje de similitud)
          </figcaption>
          @if (tramos(); as t) {
            <div class="semaforo-barra">
              @for (x of t; track x.clase) {
                <div
                  [class]="'semaforo-tramo semaforo-' + x.clase"
                  [style.width.%]="x.ancho"
                  [attr.title]="x.nombre + ': ' + x.rango"
                ></div>
              }
            </div>
            <ul class="semaforo-leyenda">
              @for (x of t; track x.clase) {
                <li [class]="'semaforo-' + x.clase">
                  <strong>{{ x.nombre }}:</strong> {{ x.rango }}
                </li>
              }
            </ul>
          } @else {
            <p class="muted texto-chico">Corrija los umbrales para ver la vista previa.</p>
          }
        </figure>

        <label class="check">
          <input type="checkbox" formControlName="comparacionInternet" />
          Comparar también con fuentes de internet
        </label>

        <h2>Evaluación y acceso</h2>
        <div class="form-grid">
          <label class="field">
            <span>Calificación máxima</span>
            <input type="number" formControlName="escalaCalifMax" min="1" max="1000" step="1" />
            @if (invalido('escalaCalifMax')) {
              <small class="field-error">{{ mensajeCampo('escalaCalifMax', 1, 1000) }}</small>
            } @else {
              <small class="muted texto-chico">
                Las notas irán de 0 a {{ form.controls.escalaCalifMax.value }}.
              </small>
            }
          </label>
          <label class="field">
            <span>Duración de la sesión (horas)</span>
            <input type="number" formControlName="jwtExpiracionHoras" min="1" max="24" step="1" />
            @if (invalido('jwtExpiracionHoras')) {
              <small class="field-error">{{ mensajeCampo('jwtExpiracionHoras', 1, 24) }}</small>
            } @else {
              <small class="muted texto-chico">
                Tiempo que un usuario puede trabajar sin volver a iniciar sesión. Más corto es más
                seguro si alguien deja la sesión abierta en una computadora compartida.
              </small>
            }
          </label>
        </div>
        <label class="check">
          <input type="checkbox" formControlName="accesoExterno" />
          Permitir que visitantes sin cuenta vean los datos de los trabajos evaluados
        </label>

        <div class="form-actions">
          <button class="btn btn-primary" type="submit" [disabled]="guardando()">
            {{ guardando() ? 'Guardando…' : 'Guardar' }}
          </button>
          <button
            class="btn btn-link"
            type="button"
            [disabled]="guardando() || form.pristine"
            (click)="deshacer()"
          >
            Deshacer cambios
          </button>
        </div>
      </form>
    } @else if (facultades().length > 0 && idFacultad() === null) {
      <p class="estado-vacio">Seleccione una facultad para ver su configuración.</p>
    }
  `,
})
export class ConfigFacultadComponent implements OnInit {
  private readonly catalogo = inject(CatalogoService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly facultades = signal<Facultad[]>([]);
  protected readonly idFacultad = signal<number | null>(null);
  protected readonly config = signal<ConfigFacultad | null>(null);
  protected readonly cargando = signal(false);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly mensaje = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group(
    {
      tamanoMaxArchivoMB: [10, entero(1, 100)],
      umbralPlagioMedio: [30, entero(0, 100)],
      umbralPlagioAlto: [50, entero(0, 100)],
      comparacionInternet: [false],
      accesoExterno: [false],
      escalaCalifMax: [100, entero(1, 1000)],
      jwtExpiracionHoras: [1, entero(1, 24)],
    },
    { validators: umbralesOrdenados },
  );

  /** Valores actuales del formulario como signal (para la vista previa del semaforo). */
  private readonly valores = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  /** valueChanges se emite despues de validar: el error de grupo ya esta actualizado. */
  protected readonly errorUmbrales = computed(() => {
    this.valores();
    return this.form.hasError('umbrales');
  });

  /** verde < medio <= amarillo < alto <= rojo. null si los umbrales no son validos. */
  protected readonly tramos = computed<Tramo[] | null>(() => {
    const v = this.valores();
    const medio = v.umbralPlagioMedio;
    const alto = v.umbralPlagioAlto;
    if (
      typeof medio !== 'number' ||
      typeof alto !== 'number' ||
      !Number.isInteger(medio) ||
      !Number.isInteger(alto) ||
      medio < 0 ||
      alto > 100 ||
      medio >= alto
    ) {
      return null;
    }
    return [
      {
        clase: 'verde',
        nombre: 'Verde (bajo)',
        rango: medio === 0 ? 'ninguno (el riesgo medio empieza en 0 %)' : `menos de ${medio} %`,
        ancho: medio,
      },
      {
        clase: 'amarillo',
        nombre: 'Amarillo (medio)',
        rango: `desde ${medio} % hasta menos de ${alto} %`,
        ancho: alto - medio,
      },
      { clase: 'rojo', nombre: 'Rojo (alto)', rango: `desde ${alto} %`, ancho: 100 - alto },
    ];
  });

  private readonly cargarConfig$ = new Subject<number>();

  ngOnInit(): void {
    this.cargarConfig$
      .pipe(
        // switchMap descarta la respuesta de una facultad anterior si se cambia rapido de facultad.
        switchMap((id) =>
          this.catalogo.obtenerConfigFacultad(id).pipe(
            catchError((err: unknown) => {
              this.cargando.set(false);
              this.error.set(mensajeDeError(err, 'No se pudo cargar la configuración.'));
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((c) => this.mostrar(c));

    this.catalogo.facultades
      .listar()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (lista) => {
          this.facultades.set(lista);
          // Con una sola facultad (hoy FICCT) no hay nada que elegir.
          if (lista.length === 1) {
            this.elegirFacultad(String(lista[0].idFacultad));
          }
        },
        error: (err: unknown) =>
          this.error.set(mensajeDeError(err, 'No se pudieron cargar las facultades.')),
      });
  }

  protected elegirFacultad(valor: string): void {
    const id = Number(valor);
    if (!valor || Number.isNaN(id)) {
      return;
    }
    this.idFacultad.set(id);
    this.config.set(null);
    this.error.set(null);
    this.mensaje.set(null);
    this.cargando.set(true);
    this.cargarConfig$.next(id);
  }

  protected invalido(campo: keyof ConfigFacultadRequest): boolean {
    const c = this.form.controls[campo];
    return c.touched && c.invalid;
  }

  protected mensajeCampo(campo: keyof ConfigFacultadRequest, min: number, max: number): string {
    return (
      errorDelServidor(this.form.controls[campo]) ?? `Ingrese un número entero de ${min} a ${max}.`
    );
  }

  protected deshacer(): void {
    const c = this.config();
    if (c) {
      this.cargarEnFormulario(c);
      this.mensaje.set(null);
      this.error.set(null);
    }
  }

  protected guardar(): void {
    const id = this.idFacultad();
    if (id === null) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const body: ConfigFacultadRequest = this.form.getRawValue();
    this.guardando.set(true);
    this.error.set(null);
    this.mensaje.set(null);
    this.catalogo
      .guardarConfigFacultad(id, body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (c) => {
          this.guardando.set(false);
          this.mostrar(c);
          this.mensaje.set('Configuración guardada. Los cambios ya rigen en la facultad.');
        },
        error: (err: unknown) => {
          this.guardando.set(false);
          this.error.set(aplicarErroresDelServidor(this.form, err));
        },
      });
  }

  private mostrar(c: ConfigFacultad): void {
    this.cargando.set(false);
    this.config.set(c);
    this.cargarEnFormulario(c);
  }

  private cargarEnFormulario(c: ConfigFacultad): void {
    this.form.reset({
      tamanoMaxArchivoMB: c.tamanoMaxArchivoMB,
      umbralPlagioMedio: c.umbralPlagioMedio,
      umbralPlagioAlto: c.umbralPlagioAlto,
      comparacionInternet: c.comparacionInternet,
      accesoExterno: c.accesoExterno,
      escalaCalifMax: c.escalaCalifMax,
      jwtExpiracionHoras: c.jwtExpiracionHoras,
    });
  }
}
