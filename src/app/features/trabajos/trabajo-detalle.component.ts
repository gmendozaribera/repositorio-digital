import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  input,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Observable, Subscription } from 'rxjs';
import type { Fase } from '../../api/catalog';
import type { CategoriaDocumento, Documento, ReglasDocumentos, Trabajo } from '../../api/work';
import { AuthService } from '../../core/auth/auth.service';
import {
  aplicarErroresDelServidor,
  errorDelServidor,
  mensajeDeError,
} from '../../core/http/error-message';
import { CatalogoService } from '../../core/services/catalogo.service';
import { TrabajoService } from '../../core/services/trabajo.service';
import {
  esEnlaceSeguro,
  guardarBlob,
  tamanoLegible,
  textoCategoria,
  validarEnlace,
} from '../../shared/archivos';
import { EstadoTrabajoComponent, textoEstado } from '../../shared/estado-trabajo';
import { fechaAbsoluta, fechaRelativa } from '../../shared/fecha-relativa';
import { PanelPlagioComponent } from './panel-plagio.component';
import { SubidaArchivosComponent } from './subida-archivos.component';

const ACTIVO = 1;
const MAX_TEXTO = 3000;
const MIN_MOTIVO = 10;

interface GrupoFase {
  idFase: number;
  nombre: string;
  descripcion: string | null;
  /** Fase activa de la facultad: se le pueden agregar documentos. */
  activa: boolean;
  documentos: Documento[];
}

type Dialogo = 'aprobar' | 'rechazar' | 'calificar' | null;

/** La calificacion es un entero (work-api: CalificarRequest.calificacion int32). */
function entero(c: AbstractControl<number | null>): ValidationErrors | null {
  return c.value === null || Number.isInteger(c.value) ? null : { entero: true };
}

/**
 * Detalle de un trabajo (`/trabajos/:id`), compartido por estudiante, docente y admin; es el
 * enlace de las notificaciones. Los botones salen de `acciones` (lo que el usuario autenticado
 * puede hacer ahora segun el backend); el servidor vuelve a validar cada accion.
 */
@Component({
  selector: 'app-trabajo-detalle',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    EstadoTrabajoComponent,
    SubidaArchivosComponent,
    PanelPlagioComponent,
  ],
  template: `
    <section class="card detalle-trabajo">
      <p class="volver">
        <a [routerLink]="volver().ruta">← {{ volver().texto }}</a>
      </p>

      @if (mensaje()) {
        <p class="alert alert-success" role="status">{{ mensaje() }}</p>
      }
      @if (error()) {
        <p class="alert alert-danger" role="alert">{{ error() }}</p>
      }

      @if (cargando() && !trabajo()) {
        <p class="cargando" role="status">Cargando trabajo…</p>
      } @else if (trabajo(); as t) {
        <header class="page-header">
          <h1>{{ t.titulo }}</h1>
          <app-estado-trabajo [estado]="t.estado" />
        </header>

        <dl class="ficha">
          <div>
            <dt>Materia</dt>
            <dd>{{ t.siglaMateria }} — {{ t.nombreMateria }}</dd>
          </div>
          <div>
            <dt>Grupo</dt>
            <dd>{{ t.grupo }}</dd>
          </div>
          <div>
            <dt>Periodo</dt>
            <dd>{{ t.periodo }}</dd>
          </div>
          <div>
            <dt>Tipo</dt>
            <dd>{{ t.tipoTrabajo }}</dd>
          </div>
          <div>
            <dt>{{ t.autores.length === 1 ? 'Autor' : 'Autores' }}</dt>
            <dd>
              @for (a of t.autores; track a.idPersona; let ultimo = $last) {
                {{ a.nombre }} {{ a.apellidos }}
                @if (a.registro) {
                  <span class="muted texto-chico">({{ a.registro }})</span>
                }
                @if (!ultimo) {
                  ·
                }
              }
            </dd>
          </div>
          @if (t.calificacion !== null && t.calificacion !== undefined) {
            <div>
              <dt>Calificación</dt>
              <dd class="calificacion">{{ t.calificacion }} / {{ t.escalaCalifMax }}</dd>
            </div>
          }
          @if (t.fechaEnvio) {
            <div>
              <dt>Enviado</dt>
              <dd>
                <time [attr.datetime]="t.fechaEnvio" [title]="absoluta(t.fechaEnvio)">{{
                  relativa(t.fechaEnvio)
                }}</time>
              </dd>
            </div>
          }
        </dl>

        @if (mostrarObservaciones()) {
          <div
            class="observaciones"
            [class.observaciones-rechazo]="t.estado === 'RECHAZADO'"
            role="note"
          >
            <h2>
              {{ t.estado === 'RECHAZADO' ? 'Motivo del rechazo' : 'Observaciones del docente' }}
            </h2>
            <p class="texto-largo">{{ t.observaciones }}</p>
            @if (t.acciones.enviar) {
              <p class="texto-chico">
                Corrige lo indicado (puedes reemplazar documentos) y vuelve a enviarlo a revisión.
              </p>
            }
          </div>
        }

        <!-- Acciones segun lo que permite el backend -->
        @if (hayAcciones()) {
          <div class="barra-acciones">
            @if (t.acciones.editar) {
              <a
                class="btn btn-outline"
                [routerLink]="['/estudiante/trabajos', t.idTrabajo, 'editar']"
                >Editar datos</a
              >
            }
            @if (t.acciones.enviar) {
              <button
                class="btn btn-primary"
                type="button"
                [disabled]="ocupado() || !tienePdf()"
                aria-describedby="ayuda-enviar"
                (click)="enviar()"
              >
                Enviar a revisión
              </button>
            }
            @if (t.acciones.revisar) {
              <button
                class="btn btn-primary"
                type="button"
                [disabled]="ocupado()"
                (click)="tomar()"
              >
                Tomar en revisión
              </button>
            }
            @if (t.acciones.aprobar) {
              <button
                class="btn btn-success"
                type="button"
                [disabled]="ocupado()"
                (click)="abrirDialogo('aprobar')"
              >
                Aprobar…
              </button>
            }
            @if (t.acciones.calificar) {
              <button
                class="btn btn-primary"
                type="button"
                [disabled]="ocupado()"
                (click)="abrirDialogo('calificar')"
              >
                Calificar y publicar…
              </button>
            }
            @if (t.acciones.rechazar) {
              <button
                class="btn btn-danger"
                type="button"
                [disabled]="ocupado()"
                (click)="abrirDialogo('rechazar')"
              >
                Rechazar…
              </button>
            }
            @if (t.acciones.eliminar) {
              <button
                class="btn btn-link peligro"
                type="button"
                [disabled]="ocupado()"
                (click)="eliminar()"
              >
                Eliminar borrador
              </button>
            }
          </div>
          @if (t.acciones.enviar) {
            <p id="ayuda-enviar" class="muted texto-chico">
              @if (tienePdf()) {
                Al enviarlo, los docentes del grupo recibirán un aviso y ya no podrás editarlo
                mientras esté en revisión.
              } @else {
                Para enviarlo a revisión se requiere al menos un documento PDF. Súbelo en la fase
                que corresponda.
              }
            </p>
          }
        }

        @if (dialogo() === 'aprobar') {
          <section
            class="panel"
            role="dialog"
            aria-modal="false"
            aria-labelledby="titulo-aprobar"
            aria-describedby="ayuda-aprobar"
          >
            <h2 id="titulo-aprobar">Aprobar trabajo</h2>
            <p id="ayuda-aprobar" class="alert alert-info">
              Sin observaciones, el trabajo queda <strong>Aprobado</strong>. Si escribes
              observaciones, queda <strong>Aprobado con observaciones</strong>: el estudiante deberá
              corregir lo indicado, subir una versión corregida y volver a enviarlo.
            </p>
            <form [formGroup]="formAprobar" (ngSubmit)="aprobar()" novalidate>
              <label class="field">
                <span>Observaciones (opcional)</span>
                <textarea
                  #campoDialogo
                  formControlName="observaciones"
                  rows="4"
                  [attr.maxlength]="maxTexto"
                ></textarea>
                <small class="muted">
                  {{ formAprobar.controls.observaciones.value.length }} / {{ maxTexto }}
                </small>
                @if (
                  formAprobar.controls.observaciones.touched &&
                  formAprobar.controls.observaciones.invalid
                ) {
                  <small class="field-error">
                    {{
                      errorDelServidor(formAprobar.controls.observaciones) ??
                        'Máximo ' + maxTexto + ' caracteres.'
                    }}
                  </small>
                }
              </label>
              <div class="form-actions">
                <button class="btn btn-success" type="submit" [disabled]="ocupado()">
                  {{
                    formAprobar.controls.observaciones.value.trim()
                      ? 'Aprobar con observaciones'
                      : 'Aprobar'
                  }}
                </button>
                <button class="btn btn-link" type="button" (click)="cerrarDialogo()">
                  Cancelar
                </button>
              </div>
            </form>
          </section>
        }

        @if (dialogo() === 'rechazar') {
          <section
            class="panel"
            role="dialog"
            aria-modal="false"
            aria-labelledby="titulo-rechazar"
            aria-describedby="ayuda-rechazar"
          >
            <h2 id="titulo-rechazar">Rechazar trabajo</h2>
            <p id="ayuda-rechazar" class="alert alert-info">
              El estudiante verá el motivo y podrá corregir el trabajo y volver a enviarlo.
            </p>
            <form [formGroup]="formRechazar" (ngSubmit)="rechazar()" novalidate>
              <label class="field">
                <span>Motivo del rechazo</span>
                <textarea
                  #campoDialogo
                  formControlName="motivo"
                  rows="4"
                  [attr.maxlength]="maxTexto"
                ></textarea>
                @if (formRechazar.controls.motivo.touched && formRechazar.controls.motivo.invalid) {
                  <small class="field-error">
                    {{
                      errorDelServidor(formRechazar.controls.motivo) ??
                        'Explica el motivo (mínimo ' + minMotivo + ' caracteres).'
                    }}
                  </small>
                }
              </label>
              <div class="form-actions">
                <button class="btn btn-danger" type="submit" [disabled]="ocupado()">
                  Rechazar
                </button>
                <button class="btn btn-link" type="button" (click)="cerrarDialogo()">
                  Cancelar
                </button>
              </div>
            </form>
          </section>
        }

        @if (dialogo() === 'calificar') {
          <section
            class="panel"
            role="dialog"
            aria-modal="false"
            aria-labelledby="titulo-calificar"
            aria-describedby="ayuda-calificar"
          >
            <h2 id="titulo-calificar">Calificar y publicar</h2>
            <p id="ayuda-calificar" class="alert alert-info">
              Al calificarlo, el trabajo pasará a <strong>Evaluado</strong>: quedará publicado y
              visible en el repositorio, y los autores recibirán un aviso. La calificación solo la
              ven los autores y los docentes del grupo; nunca aparece en el repositorio. Esta acción
              no se puede deshacer.
            </p>
            <form [formGroup]="formCalificar" (ngSubmit)="calificar()" novalidate>
              <label class="field">
                <span>Calificación (de 0 a {{ t.escalaCalifMax }})</span>
                <input
                  #campoDialogo
                  type="number"
                  inputmode="numeric"
                  formControlName="calificacion"
                  min="0"
                  [attr.max]="t.escalaCalifMax"
                  step="1"
                />
                @if (
                  formCalificar.controls.calificacion.touched &&
                  formCalificar.controls.calificacion.invalid
                ) {
                  <small class="field-error">
                    {{
                      errorDelServidor(formCalificar.controls.calificacion) ??
                        'Ingresa un número entero entre 0 y ' + t.escalaCalifMax + '.'
                    }}
                  </small>
                }
              </label>
              <div class="form-actions">
                <button class="btn btn-primary" type="submit" [disabled]="ocupado()">
                  Calificar y publicar
                </button>
                <button class="btn btn-link" type="button" (click)="cerrarDialogo()">
                  Cancelar
                </button>
              </div>
            </form>
          </section>
        }

        <h2>Resumen</h2>
        <p class="texto-largo">{{ t.resumen }}</p>
        @if (t.hashtags.length) {
          <ul class="chips" aria-label="Hashtags">
            @for (h of t.hashtags; track h) {
              <li class="chip">#{{ h }}</li>
            }
          </ul>
        }

        <h2>Documentos</h2>
        @if (t.acciones.editar && !reglas()) {
          <p class="muted texto-chico">Cargando formatos permitidos…</p>
        }
        @for (g of fasesConDocumentos(); track g.idFase) {
          <section class="fase" [attr.aria-labelledby]="'fase-' + g.idFase">
            <header class="fase-cabecera">
              <h3 [id]="'fase-' + g.idFase">{{ g.nombre }}</h3>
              @if (puedeAgregar(g)) {
                <span class="fase-acciones">
                  <button
                    class="btn btn-outline btn-sm"
                    type="button"
                    (click)="abrirSubida(g.idFase)"
                  >
                    Subir archivos <span class="sr-only">a {{ g.nombre }}</span>
                  </button>
                  @if (categoriasEnlace().length) {
                    <button
                      class="btn btn-outline btn-sm"
                      type="button"
                      (click)="abrirEnlace(g.idFase)"
                    >
                      Agregar enlace <span class="sr-only">a {{ g.nombre }}</span>
                    </button>
                  }
                </span>
              }
            </header>
            @if (g.descripcion) {
              <p class="muted texto-chico">{{ g.descripcion }}</p>
            }

            @if (subidaEn() === g.idFase) {
              <app-subida-archivos
                [idTrabajo]="t.idTrabajo"
                [idFase]="g.idFase"
                [nombreFase]="g.nombre"
                [reglas]="reglas()"
                (terminado)="subidaTerminada($event)"
                (cerrar)="subidaEn.set(null)"
              />
            }

            @if (enlaceEn() === g.idFase) {
              <section class="panel" [attr.aria-labelledby]="'enlace-' + g.idFase">
                <h3 [id]="'enlace-' + g.idFase">Agregar enlace a «{{ g.nombre }}»</h3>
                <form [formGroup]="formEnlace" (ngSubmit)="agregarEnlace(g.idFase)" novalidate>
                  <div class="form-grid">
                    <label class="field">
                      <span>Tipo de enlace</span>
                      <select formControlName="categoria">
                        @for (c of categoriasEnlace(); track c.categoria) {
                          <option [ngValue]="c.categoria">{{ categoria(c.categoria) }}</option>
                        }
                      </select>
                      <small class="muted">Sitios permitidos: {{ hostsPermitidos() }}</small>
                    </label>
                    <label class="field">
                      <span>Título</span>
                      <input formControlName="titulo" maxlength="200" autocomplete="off" />
                      @if (
                        formEnlace.controls.titulo.touched && formEnlace.controls.titulo.invalid
                      ) {
                        <small class="field-error">
                          {{ errorDelServidor(formEnlace.controls.titulo) ?? 'Escribe un título.' }}
                        </small>
                      }
                    </label>
                  </div>
                  <label class="field">
                    <span>Dirección (https)</span>
                    <input
                      formControlName="url"
                      type="url"
                      maxlength="500"
                      autocomplete="off"
                      placeholder="https://github.com/usuario/proyecto"
                    />
                    @if (errorUrl(); as e) {
                      <small class="field-error">{{ e }}</small>
                    }
                  </label>
                  <div class="form-actions">
                    <button class="btn btn-primary" type="submit" [disabled]="ocupado()">
                      Agregar enlace
                    </button>
                    <button class="btn btn-link" type="button" (click)="enlaceEn.set(null)">
                      Cancelar
                    </button>
                  </div>
                </form>
              </section>
            }

            @if (g.documentos.length === 0) {
              <p class="muted texto-chico">Sin documentos en esta fase.</p>
            } @else {
              <ul class="lista-documentos">
                @for (d of g.documentos; track d.idDocumento) {
                  <li>
                    <div class="documento-datos">
                      <strong>{{ d.titulo }}</strong>
                      <span class="badge badge-muted">{{ categoria(d.categoria) }}</span>
                      <div class="muted texto-chico">
                        @if (d.tipo === 'ARCHIVO') {
                          {{ d.nombreArchivo }} · {{ tamano(d.tamanoBytes) }} ·
                        } @else {
                          Enlace externo ·
                        }
                        <time [attr.datetime]="d.fechaSubida" [title]="absoluta(d.fechaSubida)">{{
                          relativa(d.fechaSubida)
                        }}</time>
                      </div>
                      @if (d.descripcion) {
                        <div class="texto-chico">{{ d.descripcion }}</div>
                      }
                    </div>
                    <div class="acciones">
                      @if (d.tipo === 'ENLACE') {
                        @if (enlaceSeguro(d.urlExterno)) {
                          <a
                            class="btn btn-outline btn-sm"
                            [href]="d.urlExterno"
                            target="_blank"
                            rel="noopener noreferrer"
                            >Abrir enlace
                            <span class="sr-only">{{ d.titulo }} (nueva pestaña)</span></a
                          >
                        }
                      } @else {
                        <button
                          class="btn btn-outline btn-sm"
                          type="button"
                          [disabled]="descargando() === d.idDocumento"
                          (click)="descargar(d)"
                        >
                          {{ descargando() === d.idDocumento ? 'Descargando…' : 'Descargar' }}
                          <span class="sr-only">{{ d.titulo }}</span>
                        </button>
                      }
                      @if (t.acciones.editar) {
                        <button
                          class="btn btn-link btn-sm"
                          type="button"
                          [disabled]="ocupado()"
                          (click)="quitarDocumento(d)"
                        >
                          Quitar <span class="sr-only">{{ d.titulo }}</span>
                        </button>
                      }
                    </div>
                  </li>
                }
              </ul>
            }
          </section>
        } @empty {
          <p class="estado-vacio">La facultad aún no tiene fases configuradas.</p>
        }

        @if (mostrarPlagio()) {
          <app-panel-plagio [idTrabajo]="t.idTrabajo" />
        }

        <h2>Historial</h2>
        <ol class="linea-tiempo">
          @for (c of t.historial; track $index) {
            <li>
              <div class="linea-tiempo-cabecera">
                <app-estado-trabajo [estado]="c.estadoNuevo" />
                <span class="texto-chico">
                  {{ c.estadoAnterior ? 'desde ' + estadoTexto(c.estadoAnterior) : 'Creación' }}
                  · {{ c.usuario }} ·
                  <time [attr.datetime]="c.fecha" [title]="absoluta(c.fecha)">{{
                    relativa(c.fecha)
                  }}</time>
                </span>
              </div>
              @if (c.comentario) {
                <blockquote class="texto-largo">{{ c.comentario }}</blockquote>
              }
            </li>
          }
        </ol>
      }
    </section>
  `,
})
export class TrabajoDetalleComponent implements OnInit {
  private readonly trabajos = inject(TrabajoService);
  private readonly catalogo = inject(CatalogoService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(NonNullableFormBuilder);
  private carga?: Subscription;

  /** `:id` de la ruta (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly maxTexto = MAX_TEXTO;
  protected readonly minMotivo = MIN_MOTIVO;
  protected readonly errorDelServidor = errorDelServidor;
  protected readonly categoria = textoCategoria;
  protected readonly tamano = tamanoLegible;
  protected readonly enlaceSeguro = esEnlaceSeguro;
  protected readonly estadoTexto = textoEstado;
  protected readonly relativa = (iso: string) => fechaRelativa(iso);
  protected readonly absoluta = (iso: string) => fechaAbsoluta(iso);

  protected readonly trabajo = signal<Trabajo | null>(null);
  protected readonly fases = signal<Fase[]>([]);
  protected readonly reglas = signal<ReglasDocumentos | null>(null);
  protected readonly cargando = signal(false);
  protected readonly ocupado = signal(false);
  protected readonly descargando = signal<number | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly mensaje = signal<string | null>(null);
  protected readonly dialogo = signal<Dialogo>(null);
  protected readonly subidaEn = signal<number | null>(null);
  protected readonly enlaceEn = signal<number | null>(null);
  protected readonly errorUrl = signal<string | null>(null);
  private idFacultadCargada: number | null = null;

  private readonly campoDialogo = viewChild<ElementRef<HTMLElement>>('campoDialogo');

  protected readonly formAprobar = this.fb.group({
    observaciones: ['', Validators.maxLength(MAX_TEXTO)],
  });
  protected readonly formRechazar = this.fb.group({
    motivo: [
      '',
      [Validators.required, Validators.minLength(MIN_MOTIVO), Validators.maxLength(MAX_TEXTO)],
    ],
  });
  protected readonly formCalificar = this.fb.group({
    calificacion: new FormControl<number | null>(null),
  });
  protected readonly formEnlace = this.fb.group({
    categoria: new FormControl<CategoriaDocumento | null>(null, Validators.required),
    titulo: ['', [Validators.required, Validators.maxLength(200)]],
    url: ['', [Validators.required, Validators.maxLength(500)]],
  });

  protected readonly volver = computed(() => {
    switch (this.auth.usuario()?.rol) {
      case 'ESTUDIANTE':
        return { ruta: '/estudiante/trabajos', texto: 'Mis trabajos' };
      case 'ADMIN':
        return { ruta: '/admin/revision', texto: 'Bandeja de revisión' };
      default:
        return { ruta: '/docente/revision', texto: 'Bandeja de revisión' };
    }
  });

  protected readonly hayAcciones = computed(() => {
    const a = this.trabajo()?.acciones;
    return !!a && Object.values(a).some(Boolean);
  });

  protected readonly mostrarObservaciones = computed(() => {
    const t = this.trabajo();
    return (
      !!t?.observaciones && (t.estado === 'RECHAZADO' || t.estado === 'APROBADO_CON_OBSERVACIONES')
    );
  });

  /**
   * Panel de plagio (CU14): solo docentes y ADMIN (los estudiantes no ven resultados) y en los
   * estados que el backend permite analizar. El backend vuelve a validar (docente del grupo).
   */
  protected readonly mostrarPlagio = computed(() => {
    const rol = this.auth.usuario()?.rol;
    const estado = this.trabajo()?.estado;
    return (
      (rol === 'DOCENTE' || rol === 'ADMIN') &&
      !!estado &&
      estado !== 'BORRADOR' &&
      estado !== 'RECHAZADO'
    );
  });

  /** El backend exige al menos un PDF para enviar; se avisa antes de intentarlo. */
  protected readonly tienePdf = computed(
    () =>
      this.trabajo()?.documentos.some(
        (d) =>
          d.tipo === 'ARCHIVO' &&
          (d.extension?.toLowerCase() === 'pdf' ||
            !!d.nombreArchivo?.toLowerCase().endsWith('.pdf')),
      ) ?? false,
  );

  /** Categorias que admiten enlaces externos (VIDEO y CODIGO segun las reglas). */
  protected readonly categoriasEnlace = computed(
    () => this.reglas()?.formatos.filter((f) => f.permiteEnlace) ?? [],
  );

  private readonly categoriaEnlace = signal<CategoriaDocumento | null>(null);
  protected readonly hostsPermitidos = computed(
    () =>
      this.categoriasEnlace()
        .find((f) => f.categoria === this.categoriaEnlace())
        ?.hostsEnlace.join(', ') ?? '',
  );

  /**
   * Documentos agrupados por fase, en el orden de las fases de la facultad. Las fases inactivas
   * solo aparecen si tienen documentos; si algun documento es de una fase desconocida (o no se
   * pudieron cargar las fases) se agrupa por el nombre que trae el documento.
   */
  protected readonly fasesConDocumentos = computed<GrupoFase[]>(() => {
    const t = this.trabajo();
    if (!t) {
      return [];
    }
    const grupos = new Map<number, GrupoFase>();
    for (const f of this.fases()) {
      grupos.set(f.idFase, {
        idFase: f.idFase,
        nombre: f.nombre,
        descripcion: f.descripcion,
        activa: f.estado === ACTIVO,
        documentos: [],
      });
    }
    for (const d of t.documentos) {
      let g = grupos.get(d.idFase);
      if (!g) {
        g = {
          idFase: d.idFase,
          nombre: d.nombreFase,
          descripcion: null,
          activa: false,
          documentos: [],
        };
        grupos.set(d.idFase, g);
      }
      g.documentos.push(d);
    }
    return Array.from(grupos.values()).filter((g) => g.activa || g.documentos.length > 0);
  });

  constructor() {
    this.formEnlace.controls.categoria.valueChanges.pipe(takeUntilDestroyed()).subscribe((c) => {
      this.categoriaEnlace.set(c);
      this.errorUrl.set(null);
    });
    this.formEnlace.controls.url.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.errorUrl.set(null));
  }

  ngOnInit(): void {
    this.cargar();
  }

  protected puedeAgregar(g: GrupoFase): boolean {
    return !!this.trabajo()?.acciones.editar && g.activa;
  }

  // ------------------------------------------------------------------ Carga

  private cargar(): void {
    this.carga?.unsubscribe();
    this.cargando.set(true);
    this.carga = this.trabajos
      .obtener(Number(this.id()))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (t) => {
          this.cargando.set(false);
          this.trabajo.set(t);
          this.cargarDatosDeFacultad(t);
        },
        error: (err: unknown) => {
          this.cargando.set(false);
          this.trabajo.set(null);
          this.error.set(
            err instanceof HttpErrorResponse && err.status === 404
              ? 'El trabajo no existe o no tienes permiso para verlo.'
              : mensajeDeError(err, 'No se pudo cargar el trabajo.'),
          );
        },
      });
  }

  /** Fases (para agrupar) y reglas de archivos (solo si puede subir); una vez por facultad. */
  private cargarDatosDeFacultad(t: Trabajo): void {
    if (this.idFacultadCargada !== t.idFacultad) {
      this.idFacultadCargada = t.idFacultad;
      this.reglas.set(null);
      this.catalogo.fases
        .listar({ idFacultad: t.idFacultad, incluirInactivos: true })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (f) => this.fases.set(f),
          // Sin fases igual se ven los documentos (agrupados por el nombre de su fase).
          error: () => this.fases.set([]),
        });
    }
    if (t.acciones.editar && !this.reglas()) {
      this.trabajos
        .reglas(t.idFacultad)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (r) => this.reglas.set(r),
          error: (err: unknown) =>
            this.error.set(
              mensajeDeError(err, 'No se pudieron cargar los formatos de archivo permitidos.'),
            ),
        });
    }
  }

  // ------------------------------------------------------------------ Acciones del trabajo

  protected enviar(): void {
    const t = this.trabajo()!;
    if (
      !confirm(
        `¿Enviar «${t.titulo}» a revisión? Los docentes del grupo recibirán un aviso y no podrás ` +
          'editarlo mientras lo revisan.',
      )
    ) {
      return;
    }
    this.ejecutar(this.trabajos.enviar(t.idTrabajo), 'Trabajo enviado a revisión.');
  }

  protected tomar(): void {
    const t = this.trabajo()!;
    this.ejecutar(
      this.trabajos.tomarRevision(t.idTrabajo),
      'Tomaste el trabajo en revisión. Los autores fueron avisados.',
    );
  }

  protected eliminar(): void {
    const t = this.trabajo()!;
    if (
      !confirm(
        `¿Eliminar el borrador «${t.titulo}»? Se borrarán también sus documentos. Esta acción no ` +
          'se puede deshacer.',
      )
    ) {
      return;
    }
    this.ocupado.set(true);
    this.limpiarAvisos();
    this.trabajos
      .eliminar(t.idTrabajo)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.ocupado.set(false);
          void this.router.navigate(['/estudiante/trabajos']);
        },
        error: (err: unknown) => {
          this.ocupado.set(false);
          this.error.set(mensajeDeError(err, 'No se pudo eliminar el trabajo.'));
        },
      });
  }

  protected abrirDialogo(tipo: Exclude<Dialogo, null>): void {
    this.formAprobar.reset();
    this.formRechazar.reset();
    // El maximo es la escala vigente de la facultad (el backend vuelve a validar el rango).
    const calificacion = this.formCalificar.controls.calificacion;
    calificacion.setValidators([
      Validators.required,
      Validators.min(0),
      Validators.max(this.trabajo()?.escalaCalifMax ?? 0),
      entero,
    ]);
    this.formCalificar.reset();
    this.limpiarAvisos();
    this.dialogo.set(tipo);
    afterNextRender(() => this.campoDialogo()?.nativeElement.focus(), { injector: this.injector });
  }

  protected cerrarDialogo(): void {
    this.dialogo.set(null);
  }

  protected aprobar(): void {
    if (this.formAprobar.invalid) {
      this.formAprobar.markAllAsTouched();
      return;
    }
    const t = this.trabajo()!;
    const observaciones = this.formAprobar.getRawValue().observaciones;
    const conObservaciones = !!observaciones.trim();
    this.ejecutar(
      this.trabajos.aprobar(t.idTrabajo, observaciones),
      conObservaciones
        ? 'Trabajo aprobado con observaciones. Los autores deberán corregirlo y reenviarlo.'
        : 'Trabajo aprobado.',
      this.formAprobar,
    );
  }

  protected rechazar(): void {
    if (this.formRechazar.invalid) {
      this.formRechazar.markAllAsTouched();
      return;
    }
    const t = this.trabajo()!;
    this.ejecutar(
      this.trabajos.rechazar(t.idTrabajo, this.formRechazar.getRawValue().motivo),
      'Trabajo rechazado. Los autores fueron avisados con el motivo.',
      this.formRechazar,
    );
  }

  protected calificar(): void {
    if (this.formCalificar.invalid) {
      this.formCalificar.markAllAsTouched();
      return;
    }
    const t = this.trabajo()!;
    const nota = this.formCalificar.getRawValue().calificacion!;
    if (
      !confirm(
        `¿Calificar «${t.titulo}» con ${nota} / ${t.escalaCalifMax} y publicarlo en el ` +
          'repositorio? Esta acción no se puede deshacer.',
      )
    ) {
      return;
    }
    this.ejecutar(
      this.trabajos.calificar(t.idTrabajo, nota),
      'Trabajo calificado y publicado en el repositorio. Los autores fueron avisados.',
      this.formCalificar,
    );
  }

  /** Ejecuta una accion y, si sale bien, recarga el detalle (estado, historial y acciones). */
  private ejecutar(accion: Observable<unknown>, exito: string, form?: AbstractControl): void {
    this.ocupado.set(true);
    this.limpiarAvisos();
    accion.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.ocupado.set(false);
        this.dialogo.set(null);
        this.mensaje.set(exito);
        this.cargar();
      },
      error: (err: unknown) => {
        this.ocupado.set(false);
        this.error.set(
          form
            ? aplicarErroresDelServidor(form, err, 'No se pudo completar la acción.')
            : mensajeDeError(err, 'No se pudo completar la acción.'),
        );
      },
    });
  }

  // ------------------------------------------------------------------ Documentos

  protected abrirSubida(idFase: number): void {
    this.enlaceEn.set(null);
    this.limpiarAvisos();
    this.subidaEn.set(idFase);
  }

  protected subidaTerminada(r: { subidos: number; pendientes: number }): void {
    if (r.subidos > 0) {
      this.mensaje.set(
        r.subidos === 1 ? 'Se subió 1 archivo.' : `Se subieron ${r.subidos} archivos.`,
      );
      this.cargar();
    }
    if (r.pendientes === 0) {
      this.subidaEn.set(null);
    }
  }

  protected abrirEnlace(idFase: number): void {
    this.subidaEn.set(null);
    this.limpiarAvisos();
    this.formEnlace.reset({ categoria: this.categoriasEnlace()[0]?.categoria ?? null });
    this.categoriaEnlace.set(this.formEnlace.controls.categoria.value);
    this.errorUrl.set(null);
    this.enlaceEn.set(idFase);
  }

  protected agregarEnlace(idFase: number): void {
    const v = this.formEnlace.getRawValue();
    const errorUrl = v.url.trim()
      ? validarEnlace(this.reglas(), v.categoria, v.url)
      : 'Escribe la dirección del enlace.';
    this.errorUrl.set(errorUrl);
    if (this.formEnlace.invalid || errorUrl) {
      this.formEnlace.markAllAsTouched();
      return;
    }
    const t = this.trabajo()!;
    this.ocupado.set(true);
    this.trabajos
      .agregarEnlace(t.idTrabajo, {
        titulo: v.titulo.trim(),
        url: v.url.trim(),
        categoria: v.categoria as 'VIDEO' | 'CODIGO',
        idFase,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.ocupado.set(false);
          this.enlaceEn.set(null);
          this.mensaje.set('Enlace agregado.');
          this.cargar();
        },
        error: (err: unknown) => {
          this.ocupado.set(false);
          const general = aplicarErroresDelServidor(
            this.formEnlace,
            err,
            'No se pudo agregar el enlace.',
          );
          const deUrl = errorDelServidor(this.formEnlace.controls.url);
          if (deUrl) {
            this.errorUrl.set(deUrl);
          }
          this.error.set(general);
        },
      });
  }

  protected quitarDocumento(d: Documento): void {
    if (
      !confirm(
        `¿Quitar «${d.titulo}» del trabajo? ${d.tipo === 'ARCHIVO' ? 'El archivo se borrará.' : ''}`.trim(),
      )
    ) {
      return;
    }
    this.ejecutar(this.trabajos.eliminarDocumento(d.idDocumento), `Se quitó «${d.titulo}».`);
  }

  protected descargar(d: Documento): void {
    this.descargando.set(d.idDocumento);
    this.error.set(null);
    this.trabajos
      .descargar(d)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ blob, nombre }) => {
          this.descargando.set(null);
          guardarBlob(blob, nombre);
        },
        error: (err: unknown) => {
          this.descargando.set(null);
          // El cuerpo del error llega como Blob (se pidio un archivo): se usa un texto por estado.
          this.error.set(
            err instanceof HttpErrorResponse && err.status === 404
              ? 'El archivo ya no existe o no tienes permiso para descargarlo.'
              : mensajeDeError(err, 'No se pudo descargar el archivo.'),
          );
        },
      });
  }

  private limpiarAvisos(): void {
    this.error.set(null);
    this.mensaje.set(null);
  }
}
