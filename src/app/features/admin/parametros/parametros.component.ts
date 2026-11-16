import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type { ActualizarDominioRequest, Dominio } from '../../../api/user';
import {
  aplicarErroresDelServidor,
  errorDelServidor,
  mensajeDeError,
} from '../../../core/http/error-message';
import { DominioService } from '../../../core/services/dominio.service';

/** Patron de `CodigoDominio` en user-api.yaml (grupo y nombre). Se guarda en MAYUSCULAS. */
export const PATRON_CODIGO_DOMINIO = /^[A-Za-z][A-Za-z0-9_]*$/;
/** Al menos un caracter que no sea espacio. */
const NO_EN_BLANCO = /\S/;

const FORMATO_FECHA = new Intl.DateTimeFormat('es-BO', { dateStyle: 'short', timeStyle: 'short' });

/** "16/11/26, 10:00" en la hora local del navegador; si la fecha no se entiende, el texto tal cual. */
export function formatearFechaHora(iso: string): string {
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? iso : FORMATO_FECHA.format(fecha);
}

interface GrupoDeParametros {
  grupo: string;
  parametros: Dominio[];
}

/**
 * Parametros del sistema (tabla de dominio de user-service). Cada parametro es un par
 * grupo + nombre con un valor (p. ej. AUTH_GROUP / LOGIN_INTENTOS = 10). Los usan todos los
 * servicios: los marcados como "Sistema" no se pueden eliminar y su valor se valida en el backend.
 * La lista es chica, asi que se trae completa y el filtro por grupo se aplica en el navegador.
 */
@Component({
  selector: 'app-parametros',
  imports: [ReactiveFormsModule],
  template: `
    <section class="card">
      <header class="page-header">
        <h1>Parámetros del sistema</h1>
        <button class="btn btn-primary" type="button" (click)="nuevo()">Nuevo parámetro</button>
      </header>

      <p class="alert alert-info">
        Estos valores configuran el comportamiento de todo el sistema (por ejemplo, cuántos intentos
        fallidos de inicio de sesión se permiten). Los cambios se aplican en todos los servicios al
        instante: revise el valor antes de guardar.
      </p>

      <div class="filters">
        <label class="field">
          <span>Grupo</span>
          <select [value]="filtroGrupo()" (change)="filtroGrupo.set($any($event.target).value)">
            <option value="">Todos</option>
            @for (g of nombresDeGrupo(); track g) {
              <option [value]="g">{{ g }}</option>
            }
          </select>
        </label>
      </div>

      @if (mensaje()) {
        <p class="alert alert-success" role="status">{{ mensaje() }}</p>
      }
      @if (errorListado()) {
        <p class="alert alert-danger" role="alert">{{ errorListado() }}</p>
      }

      @if (formularioAbierto()) {
        <section class="panel" aria-labelledby="titulo-form-parametro">
          <h2 id="titulo-form-parametro">
            @if (enEdicion(); as d) {
              Editar parámetro {{ d.domainGroup }} / {{ d.domainName }}
            } @else {
              Nuevo parámetro
            }
          </h2>
          @if (enEdicion()?.sistema) {
            <p class="alert alert-warn">
              El sistema usa este parámetro: el servidor valida que el valor tenga el formato
              correcto y no se puede eliminar.
            </p>
          }
          @if (errorFormulario()) {
            <p class="alert alert-danger" role="alert">{{ errorFormulario() }}</p>
          }
          <form [formGroup]="form" (ngSubmit)="guardar()" novalidate>
            <div class="form-grid">
              <label class="field">
                <span>Grupo</span>
                <input
                  #campoGrupo
                  formControlName="domainGroup"
                  maxlength="50"
                  autocomplete="off"
                  spellcheck="false"
                  autocapitalize="characters"
                  list="grupos-existentes"
                  placeholder="AUTH_GROUP"
                  (blur)="aMayusculas('domainGroup')"
                />
                <datalist id="grupos-existentes">
                  @for (g of nombresDeGrupo(); track g) {
                    <option [value]="g"></option>
                  }
                </datalist>
                @if (form.controls.domainGroup.touched && form.controls.domainGroup.invalid) {
                  <small class="field-error">
                    {{ errorDelServidor(form.controls.domainGroup) ?? ayudaCodigo }}
                  </small>
                }
              </label>

              <label class="field">
                <span>Nombre</span>
                <input
                  formControlName="domainName"
                  maxlength="50"
                  autocomplete="off"
                  spellcheck="false"
                  autocapitalize="characters"
                  placeholder="LOGIN_INTENTOS"
                  (blur)="aMayusculas('domainName')"
                />
                @if (form.controls.domainName.touched && form.controls.domainName.invalid) {
                  <small class="field-error">
                    {{ errorDelServidor(form.controls.domainName) ?? ayudaCodigo }}
                  </small>
                }
              </label>

              <label class="field">
                <span>{{ enEdicion()?.secreto ? 'Nuevo valor' : 'Valor' }}</span>
                @if (enEdicion()?.secreto) {
                  <input
                    #campoValor
                    type="password"
                    formControlName="domainValue"
                    maxlength="500"
                    autocomplete="new-password"
                    [placeholder]="
                      enEdicion()?.configurado
                        ? '•••••• (configurado, dejar vacío para no cambiar)'
                        : 'Sin configurar'
                    "
                  />
                } @else {
                  <input
                    #campoValor
                    formControlName="domainValue"
                    maxlength="500"
                    autocomplete="off"
                    spellcheck="false"
                  />
                }
                @if (form.controls.domainValue.touched && form.controls.domainValue.invalid) {
                  <small class="field-error">
                    {{
                      errorDelServidor(form.controls.domainValue) ??
                        'Ingrese el valor (máx. 500 caracteres).'
                    }}
                  </small>
                }
              </label>
            </div>

            @if (enEdicion()?.secreto) {
              <p class="muted texto-chico">
                Valor secreto: se guarda cifrado y nunca se muestra. Escriba uno nuevo solo si
                quiere reemplazarlo.
              </p>
              @if (enEdicion()?.configurado) {
                <label class="check">
                  <input type="checkbox" formControlName="borrarValor" />
                  Borrar el valor guardado
                </label>
              }
            }

            <label class="field">
              <span>Descripción</span>
              <textarea formControlName="description" rows="2" maxlength="255"></textarea>
              @if (form.controls.description.touched && form.controls.description.invalid) {
                <small class="field-error">
                  {{
                    errorDelServidor(form.controls.description) ??
                      'Describa para qué sirve el parámetro (máx. 255 caracteres).'
                  }}
                </small>
              }
            </label>

            @if (enEdicion()) {
              <p class="muted texto-chico">
                El grupo y el nombre no se pueden cambiar: el sistema busca el parámetro por ellos.
              </p>
            } @else {
              <p class="muted texto-chico">
                Grupo y nombre: letras, números y guion bajo, empezando por una letra. Se guardan en
                MAYÚSCULAS.
              </p>
            }

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

      @if (cargando() && dominios().length === 0) {
        <p class="cargando" role="status">Cargando parámetros…</p>
      } @else if (grupos().length === 0) {
        <p class="estado-vacio">No hay parámetros registrados.</p>
      } @else {
        @for (g of grupos(); track g.grupo) {
          <section class="grupo-parametros" [attr.aria-labelledby]="'grupo-' + g.grupo">
            <h2 [id]="'grupo-' + g.grupo">{{ g.grupo }}</h2>
            <table class="table" [attr.aria-busy]="cargando()">
              <caption class="sr-only">
                Parámetros del grupo
                {{
                  g.grupo
                }}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  <th scope="col">Valor</th>
                  <th scope="col">Descripción</th>
                  <th scope="col">Último cambio</th>
                  <th scope="col"><span class="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                @for (d of g.parametros; track d.domainId) {
                  <tr>
                    <td data-label="Nombre">
                      <code>{{ d.domainName }}</code>
                      @if (d.sistema) {
                        <span
                          class="badge badge-purple"
                          title="Lo usa el sistema: su valor se valida y no se puede eliminar."
                          >Sistema</span
                        >
                      }
                      @if (d.secreto) {
                        <span
                          class="badge badge-warn"
                          title="Se guarda cifrado; su valor nunca se muestra."
                          >Secreto</span
                        >
                      }
                    </td>
                    <td data-label="Valor" class="valor-parametro">
                      @if (d.secreto) {
                        @if (d.configurado) {
                          •••••• <span class="muted">(configurado)</span>
                        } @else {
                          <span class="muted">Sin configurar</span>
                        }
                      } @else if (d.domainValue === '') {
                        <span class="muted">(vacío)</span>
                      } @else {
                        {{ d.domainValue }}
                      }
                    </td>
                    <td data-label="Descripción">{{ d.description }}</td>
                    <td data-label="Último cambio">
                      {{ d.lastUser }}
                      <div class="muted texto-chico">
                        <time [attr.datetime]="d.lastTime">{{
                          formatearFechaHora(d.lastTime)
                        }}</time>
                      </div>
                    </td>
                    <td class="acciones">
                      <button class="btn btn-outline btn-sm" type="button" (click)="editar(d)">
                        Editar <span class="sr-only">{{ d.domainGroup }} {{ d.domainName }}</span>
                      </button>
                      @if (!d.sistema) {
                        <button
                          class="btn btn-link btn-sm"
                          type="button"
                          [disabled]="eliminando() === d.domainId"
                          (click)="eliminar(d)"
                        >
                          Eliminar
                          <span class="sr-only">{{ d.domainGroup }} {{ d.domainName }}</span>
                        </button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </section>
        }
      }
    </section>
  `,
})
export class ParametrosComponent implements OnInit {
  private readonly dominiosApi = inject(DominioService);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly errorDelServidor = errorDelServidor;
  protected readonly formatearFechaHora = formatearFechaHora;
  protected readonly ayudaCodigo =
    'Hasta 50 caracteres: letras, números y guion bajo, empezando por una letra.';

  protected readonly dominios = signal<Dominio[]>([]);
  protected readonly cargando = signal(false);
  protected readonly guardando = signal(false);
  /** Id del parametro cuyo DELETE esta en curso. */
  protected readonly eliminando = signal<number | null>(null);
  protected readonly errorListado = signal<string | null>(null);
  protected readonly errorFormulario = signal<string | null>(null);
  protected readonly mensaje = signal<string | null>(null);
  protected readonly formularioAbierto = signal(false);
  protected readonly enEdicion = signal<Dominio | null>(null);
  /** '' = todos los grupos. */
  protected readonly filtroGrupo = signal('');

  protected readonly nombresDeGrupo = computed(() =>
    [...new Set(this.dominios().map((d) => d.domainGroup))].sort(),
  );

  /** Parametros agrupados por `domainGroup` (y filtrados por el grupo elegido). */
  protected readonly grupos = computed<GrupoDeParametros[]>(() => {
    const filtro = this.filtroGrupo();
    const porGrupo = new Map<string, Dominio[]>();
    for (const d of this.dominios()) {
      if (filtro && d.domainGroup !== filtro) {
        continue;
      }
      porGrupo.set(d.domainGroup, [...(porGrupo.get(d.domainGroup) ?? []), d]);
    }
    return [...porGrupo.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([grupo, parametros]) => ({
        grupo,
        parametros: [...parametros].sort((a, b) => a.domainName.localeCompare(b.domainName)),
      }));
  });

  private readonly campoGrupo = viewChild<ElementRef<HTMLElement>>('campoGrupo');
  private readonly campoValor = viewChild<ElementRef<HTMLElement>>('campoValor');

  private readonly codigo = [
    Validators.required,
    Validators.maxLength(50),
    Validators.pattern(PATRON_CODIGO_DOMINIO),
  ];

  protected readonly form = inject(NonNullableFormBuilder).group({
    domainGroup: ['', this.codigo],
    domainName: ['', this.codigo],
    domainValue: [''],
    description: [
      '',
      [Validators.required, Validators.maxLength(255), Validators.pattern(NO_EN_BLANCO)],
    ],
    /** Solo secretos ya configurados: se envia domainValue vacio para borrarlo. */
    borrarValor: [false],
  });

  private readonly validadoresValor = [
    Validators.required,
    Validators.maxLength(500),
    Validators.pattern(NO_EN_BLANCO),
  ];

  constructor() {
    // "Borrar el valor" y escribir uno nuevo son excluyentes.
    this.form.controls.borrarValor.valueChanges.pipe(takeUntilDestroyed()).subscribe((b) => {
      const valor = this.form.controls.domainValue;
      if (b) {
        valor.setValue('');
        valor.disable({ emitEvent: false });
      } else {
        valor.enable({ emitEvent: false });
      }
    });
  }

  ngOnInit(): void {
    this.cargar();
  }

  protected nuevo(): void {
    this.enEdicion.set(null);
    // Si se esta viendo un grupo, se propone ese grupo para el alta.
    this.form.reset({ domainGroup: this.filtroGrupo() });
    this.usarValidadoresDeValor(false);
    this.form.controls.domainGroup.enable();
    this.form.controls.domainName.enable();
    this.abrirFormulario(this.campoGrupo);
  }

  protected editar(d: Dominio): void {
    this.enEdicion.set(d);
    this.form.reset({
      domainGroup: d.domainGroup,
      domainName: d.domainName,
      // Un secreto nunca trae su valor: el campo empieza vacio (= no cambiar).
      domainValue: d.secreto ? '' : d.domainValue,
      description: d.description,
    });
    this.usarValidadoresDeValor(d.secreto);
    // Grupo y nombre son de solo lectura: el backend solo acepta valor y descripcion.
    this.form.controls.domainGroup.disable();
    this.form.controls.domainName.disable();
    this.abrirFormulario(this.campoValor);
  }

  protected cerrarFormulario(): void {
    this.formularioAbierto.set(false);
    this.enEdicion.set(null);
    this.errorFormulario.set(null);
  }

  /** Muestra el codigo como se guardara (sin espacios y en MAYUSCULAS). */
  protected aMayusculas(campo: 'domainGroup' | 'domainName'): void {
    const control = this.form.controls[campo];
    const normalizado = control.value.trim().toUpperCase();
    if (normalizado !== control.value) {
      control.setValue(normalizado);
    }
  }

  protected guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const actual = this.enEdicion();
    const description = v.description.trim();
    const domainValue = v.domainValue.trim();
    const peticion = actual
      ? this.dominiosApi.actualizar(
          actual.domainId,
          actual.secreto ? this.cambioDeSecreto(description) : { domainValue, description },
        )
      : this.dominiosApi.crear({
          domainGroup: v.domainGroup.trim().toUpperCase(),
          domainName: v.domainName.trim().toUpperCase(),
          domainValue,
          description,
        });

    this.guardando.set(true);
    this.errorFormulario.set(null);
    this.mensaje.set(null);
    peticion.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (d) => {
        this.guardando.set(false);
        this.cerrarFormulario();
        this.mensaje.set(
          `Parámetro ${d.domainGroup} / ${d.domainName} ${actual ? 'actualizado' : 'creado'}. ` +
            'El cambio ya rige en todo el sistema.',
        );
        this.cargar();
      },
      error: (err: unknown) => {
        this.guardando.set(false);
        this.errorFormulario.set(aplicarErroresDelServidor(this.form, err));
      },
    });
  }

  protected eliminar(d: Dominio): void {
    if (d.sistema) {
      return;
    }
    if (
      !confirm(
        `¿Eliminar el parámetro ${d.domainGroup} / ${d.domainName}` +
          (d.secreto ? '? ' : ` (valor «${d.domainValue}»)? `) +
          'Se borra definitivamente.',
      )
    ) {
      return;
    }
    this.eliminando.set(d.domainId);
    this.mensaje.set(null);
    this.errorListado.set(null);
    this.dominiosApi
      .eliminar(d.domainId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.eliminando.set(null);
          if (this.enEdicion()?.domainId === d.domainId) {
            this.cerrarFormulario();
          }
          this.mensaje.set(`Parámetro ${d.domainGroup} / ${d.domainName} eliminado.`);
          this.cargar();
        },
        error: (err: unknown) => {
          this.eliminando.set(null);
          this.errorListado.set(mensajeDeError(err, 'No se pudo eliminar el parámetro.'));
        },
      });
  }

  private cargar(): void {
    this.cargando.set(true);
    this.errorListado.set(null);
    this.dominiosApi
      .listar()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (lista) => {
          this.cargando.set(false);
          this.dominios.set(lista);
          // Si el grupo filtrado se quedo sin parametros, volver a "Todos".
          if (this.filtroGrupo() && !lista.some((d) => d.domainGroup === this.filtroGrupo())) {
            this.filtroGrupo.set('');
          }
        },
        error: (err: unknown) => {
          this.cargando.set(false);
          this.errorListado.set(mensajeDeError(err, 'No se pudieron cargar los parámetros.'));
        },
      });
  }

  /**
   * PUT de un secreto: sin `domainValue` el backend CONSERVA el valor actual (asi se puede cambiar
   * solo la descripcion); '' lo borra. Un valor nuevo se envia tal cual (puede tener espacios).
   */
  private cambioDeSecreto(description: string): ActualizarDominioRequest {
    const { domainValue, borrarValor } = this.form.getRawValue();
    if (borrarValor) {
      return { domainValue: '', description };
    }
    return domainValue === '' ? { description } : { domainValue, description };
  }

  /** Los secretos aceptan el valor vacio (= no cambiar); el resto lo exige. */
  private usarValidadoresDeValor(secreto: boolean): void {
    const c = this.form.controls.domainValue;
    c.setValidators(secreto ? [Validators.maxLength(500)] : this.validadoresValor);
    c.enable({ emitEvent: false });
    c.updateValueAndValidity({ emitEvent: false });
  }

  private abrirFormulario(foco: () => ElementRef<HTMLElement> | undefined): void {
    this.errorFormulario.set(null);
    this.mensaje.set(null);
    this.formularioAbierto.set(true);
    afterNextRender(() => foco()?.nativeElement.focus(), { injector: this.injector });
  }
}
