import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, input, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import type { Analisis, Motor } from '../../api/plagio';
import { mensajeDeError } from '../../core/http/error-message';
import { NivelPlagio, PlagioService, SeguimientoPlagio } from '../../core/services/plagio.service';
import { esEnlaceSeguro } from '../../shared/archivos';
import { fechaAbsoluta, fechaRelativa } from '../../shared/fecha-relativa';

/** Texto de cada nivel del semaforo: el color nunca va solo (accesibilidad). */
const NIVELES: Record<NivelPlagio, { texto: string; color: string }> = {
  OK: { texto: 'Similitud baja', color: 'verde' },
  MEDIO: { texto: 'Similitud media', color: 'amarillo' },
  ALTO: { texto: 'Similitud alta', color: 'rojo' },
};

const MOTORES: Record<Motor, string> = { SIMULADO: 'Simulado', COPYLEAKS: 'Copyleaks' };

const PORCENTAJE = new Intl.NumberFormat('es-BO', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** "34,2 %" (siempre 1 decimal). */
export function porcentajePlagio(valor: number | null | undefined): string {
  return valor === null || valor === undefined ? '—' : `${PORCENTAJE.format(valor)} %`;
}

/**
 * Panel de deteccion de plagio (CU14) dentro del detalle del trabajo. Lo muestra el detalle solo
 * a DOCENTE y ADMIN y fuera de BORRADOR/RECHAZADO; el backend vuelve a validar (docente del grupo
 * o ADMIN). El analisis es asincrono: mientras esta EN_PROCESO se consulta el estado cada 5 s y,
 * si el usuario sale de la pagina, el aviso le llega por la campana (PLAGIO_COMPLETADO).
 */
@Component({
  selector: 'app-panel-plagio',
  imports: [RouterLink],
  template: `
    @if (seguimiento.fase() !== 'sin-permiso') {
      <section class="plagio" aria-labelledby="titulo-plagio">
        <h2 id="titulo-plagio">Detección de plagio</h2>

        @if (errorAccion()) {
          <p class="alert alert-danger" role="alert">{{ errorAccion() }}</p>
        }
        @if (seguimiento.errorCarga(); as e) {
          <div class="alert alert-danger" role="alert">
            {{ e }}
            <button class="btn btn-link btn-sm" type="button" (click)="seguimiento.cargar()">
              Reintentar consulta
            </button>
          </div>
        }

        @switch (seguimiento.fase()) {
          @case ('cargando') {
            <p class="cargando" role="status">Consultando el análisis de plagio…</p>
          }
          @case ('sin-analisis') {
            <p class="plagio-vacio">
              Este trabajo aún no tiene análisis de plagio. Se comparan sus documentos PDF, DOCX y
              ODT con los trabajos del repositorio (y con internet, si la facultad lo tiene
              habilitado).
            </p>
            <button
              class="btn btn-primary"
              type="button"
              [disabled]="iniciando()"
              (click)="analizar()"
            >
              {{ iniciando() ? 'Iniciando…' : 'Analizar plagio' }}
            </button>
          }
          @case ('listo') {
            @if (seguimiento.analisis(); as a) {
              @switch (a.estado) {
                @case ('EN_PROCESO') {
                  <div class="plagio-proceso">
                    <div
                      class="progreso-indeterminado"
                      role="progressbar"
                      aria-label="Análisis de plagio en curso"
                    ></div>
                    <p role="status">
                      Analizando documentos… puede tardar varios minutos; te avisaremos con una
                      notificación. Puedes salir de esta página.
                    </p>
                    <p class="muted texto-chico">
                      Iniciado por {{ a.iniciadoPor }} ·
                      <time [attr.datetime]="a.fechaInicio" [title]="absoluta(a.fechaInicio)">{{
                        relativa(a.fechaInicio)
                      }}</time>
                    </p>
                  </div>
                }
                @case ('ERROR') {
                  <div class="alert alert-danger plagio-error" role="alert">
                    <strong>El análisis no pudo completarse.</strong>
                    {{ a.mensajeError || 'Ocurrió un error durante el análisis.' }}
                  </div>
                }
                @case ('COMPLETADO') {
                  @if (nivel(a); as n) {
                    <div [class]="'semaforo-plagio nivel-' + n.color">
                      <div class="luces" aria-hidden="true">
                        <span class="luz luz-verde" [class.encendida]="a.nivel === 'OK'"></span>
                        <span
                          class="luz luz-amarillo"
                          [class.encendida]="a.nivel === 'MEDIO'"
                        ></span>
                        <span class="luz luz-rojo" [class.encendida]="a.nivel === 'ALTO'"></span>
                      </div>
                      <div>
                        <p class="plagio-porcentaje">{{ porcentaje(a.porcentajeSimilitud) }}</p>
                        <p class="plagio-nivel">{{ n.texto }}</p>
                        <p class="muted texto-chico">
                          Medio desde {{ a.umbralMedio }} %, alto desde {{ a.umbralAlto }} %
                        </p>
                      </div>
                    </div>
                  }

                  <dl class="ficha plagio-datos">
                    <div>
                      <dt>Motor</dt>
                      <dd>
                        @if (a.motor === 'SIMULADO') {
                          <span
                            class="badge badge-warn"
                            title="Resultado de prueba generado por el sistema, no por un proveedor real"
                            >Simulado</span
                          >
                          <span class="muted texto-chico"> resultado de prueba, no real</span>
                        } @else {
                          {{ motor(a.motor) }}
                        }
                      </dd>
                    </div>
                    <div>
                      <dt>Fuentes comparadas</dt>
                      <dd>
                        {{
                          a.comparacionInternet ? 'Repositorio e internet' : 'Solo el repositorio'
                        }}
                      </dd>
                    </div>
                    <div>
                      <dt>Documentos analizados</dt>
                      <dd>{{ a.documentosAnalizados }}</dd>
                    </div>
                    <div>
                      <dt>Fecha</dt>
                      <dd>
                        <time
                          [attr.datetime]="a.fechaFin ?? a.fechaInicio"
                          [title]="absoluta(a.fechaFin ?? a.fechaInicio)"
                          >{{ relativa(a.fechaFin ?? a.fechaInicio) }}</time
                        >
                      </dd>
                    </div>
                    <div>
                      <dt>Iniciado por</dt>
                      <dd>{{ a.iniciadoPor }}</dd>
                    </div>
                  </dl>

                  <h3>Fuentes con coincidencias</h3>
                  @if (a.fuentes.length === 0) {
                    <p class="muted">No se encontraron coincidencias con otras fuentes.</p>
                  } @else {
                    <div class="tabla-desplazable">
                      <table class="table tabla-fuentes">
                        <thead>
                          <tr>
                            <th scope="col">Fuente</th>
                            <th scope="col">Tipo</th>
                            <th scope="col">Similitud</th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (f of a.fuentes; track $index) {
                            <tr>
                              <td>
                                @if (f.tipo === 'INTERNA' && f.idTrabajo) {
                                  <a [routerLink]="['/repositorio', f.idTrabajo]">{{ f.titulo }}</a>
                                } @else if (f.tipo === 'INTERNET' && enlaceSeguro(f.url)) {
                                  <a [href]="f.url" target="_blank" rel="noopener noreferrer"
                                    >{{ f.titulo }}<span class="sr-only"> (nueva pestaña)</span></a
                                  >
                                } @else {
                                  {{ f.titulo }}
                                }
                              </td>
                              <td>{{ f.tipo === 'INTERNA' ? 'Repositorio' : 'Internet' }}</td>
                              <td class="celda-similitud">
                                <span class="barra-fuente" aria-hidden="true"
                                  ><span [style.width.%]="acotar(f.porcentaje)"></span
                                ></span>
                                {{ porcentaje(f.porcentaje) }}
                              </td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  }
                }
              }

              <div class="form-actions">
                @if (a.estado === 'ERROR') {
                  <button
                    class="btn btn-primary"
                    type="button"
                    [disabled]="iniciando()"
                    (click)="analizar()"
                  >
                    {{ iniciando() ? 'Iniciando…' : 'Reintentar' }}
                  </button>
                } @else {
                  <button
                    class="btn btn-outline"
                    type="button"
                    [disabled]="iniciando() || seguimiento.enProceso()"
                    [title]="
                      seguimiento.enProceso() ? 'Espera a que termine el análisis en curso' : ''
                    "
                    (click)="volverAAnalizar()"
                  >
                    {{ iniciando() ? 'Iniciando…' : 'Volver a analizar' }}
                  </button>
                }
                <button
                  class="btn btn-link"
                  type="button"
                  aria-controls="historial-plagio"
                  [attr.aria-expanded]="historialAbierto()"
                  (click)="alternarHistorial()"
                >
                  {{
                    historialAbierto() ? 'Ocultar análisis anteriores' : 'Ver análisis anteriores'
                  }}
                </button>
              </div>

              @if (historialAbierto()) {
                <div id="historial-plagio" class="historial-plagio">
                  @if (cargandoHistorial()) {
                    <p class="cargando" role="status">Cargando análisis anteriores…</p>
                  } @else if (errorHistorial()) {
                    <p class="alert alert-danger" role="alert">{{ errorHistorial() }}</p>
                  } @else if (anteriores().length === 0) {
                    <p class="muted">No hay análisis anteriores.</p>
                  } @else {
                    <div class="tabla-desplazable">
                      <table class="table">
                        <caption class="sr-only">
                          Análisis de plagio anteriores
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col">Fecha</th>
                            <th scope="col">Similitud</th>
                            <th scope="col">Nivel</th>
                            <th scope="col">Motor</th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (h of anteriores(); track h.idAnalisis) {
                            <tr>
                              <td>
                                <time [attr.datetime]="h.fechaInicio">{{
                                  absoluta(h.fechaInicio)
                                }}</time>
                              </td>
                              <td>
                                @if (h.estado === 'COMPLETADO') {
                                  {{ porcentaje(h.porcentajeSimilitud) }}
                                } @else {
                                  {{ h.estado === 'ERROR' ? 'Error' : 'En proceso' }}
                                }
                              </td>
                              <td>
                                @if (nivel(h); as n) {
                                  <span [class]="'nivel-chip nivel-' + n.color">{{ n.texto }}</span>
                                } @else {
                                  —
                                }
                              </td>
                              <td>{{ motor(h.motor) }}</td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  }
                </div>
              }
            }
          }
        }
      </section>
    }
  `,
})
export class PanelPlagioComponent implements OnInit {
  private readonly plagio = inject(PlagioService);
  private readonly destroyRef = inject(DestroyRef);

  readonly idTrabajo = input.required<number>();

  protected seguimiento!: SeguimientoPlagio;
  protected readonly iniciando = signal(false);
  protected readonly errorAccion = signal<string | null>(null);
  protected readonly historialAbierto = signal(false);
  protected readonly cargandoHistorial = signal(false);
  protected readonly errorHistorial = signal<string | null>(null);
  protected readonly anteriores = signal<Analisis[]>([]);

  protected readonly porcentaje = porcentajePlagio;
  protected readonly enlaceSeguro = esEnlaceSeguro;
  protected readonly relativa = (iso: string) => fechaRelativa(iso);
  protected readonly absoluta = (iso: string) => fechaAbsoluta(iso);
  protected readonly motor = (m: Motor) => MOTORES[m] ?? m;
  protected readonly nivel = (a: Pick<Analisis, 'estado' | 'nivel'>) =>
    a.estado === 'COMPLETADO' && a.nivel ? NIVELES[a.nivel] : null;
  protected readonly acotar = (p: number) => Math.max(0, Math.min(100, p));

  ngOnInit(): void {
    this.seguimiento = this.plagio.seguir(this.idTrabajo(), this.destroyRef);
    this.seguimiento.cargar();
  }

  protected volverAAnalizar(): void {
    if (
      !confirm(
        '¿Volver a analizar el trabajo? El resultado actual quedará en los análisis anteriores.',
      )
    ) {
      return;
    }
    this.analizar();
  }

  protected analizar(): void {
    this.iniciando.set(true);
    this.errorAccion.set(null);
    this.historialAbierto.set(false);
    this.seguimiento
      .iniciar()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.iniciando.set(false),
        error: (err: unknown) => {
          this.iniciando.set(false);
          this.errorAccion.set(mensajeDeError(err, 'No se pudo iniciar el análisis de plagio.'));
          // 409: quiza otro docente ya inicio uno; se muestra el que esta en curso.
          if (err instanceof HttpErrorResponse && err.status === 409) {
            this.seguimiento.cargar();
          }
        },
      });
  }

  protected alternarHistorial(): void {
    const abrir = !this.historialAbierto();
    this.historialAbierto.set(abrir);
    if (!abrir) {
      return;
    }
    this.cargandoHistorial.set(true);
    this.errorHistorial.set(null);
    this.plagio
      .historial(this.idTrabajo())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (lista) => {
          this.cargandoHistorial.set(false);
          const actual = this.seguimiento.analisis()?.idAnalisis;
          this.anteriores.set(lista.filter((a) => a.idAnalisis !== actual));
        },
        error: (err: unknown) => {
          this.cargandoHistorial.set(false);
          this.errorHistorial.set(
            mensajeDeError(err, 'No se pudieron cargar los análisis anteriores.'),
          );
        },
      });
  }
}
