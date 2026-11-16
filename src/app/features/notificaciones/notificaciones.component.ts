import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import type { Notificacion, PaginaNotificaciones } from '../../api/user';
import { mensajeDeError } from '../../core/http/error-message';
import { NotificacionService } from '../../core/services/notificacion.service';
import { fechaAbsoluta, fechaRelativa } from '../../shared/fecha-relativa';
import { PaginadorComponent } from '../../shared/paginador.component';
import { esRutaInterna } from '../../shared/ruta-interna';

/** Todas las notificaciones del usuario autenticado (cualquier rol), paginadas. */
@Component({
  selector: 'app-notificaciones',
  imports: [RouterLink, PaginadorComponent],
  template: `
    <section class="card">
      <header class="page-header">
        <h1>Notificaciones</h1>
        <button
          class="btn btn-outline btn-sm"
          type="button"
          [disabled]="marcando() || !hayNoLeidas()"
          (click)="marcarTodas()"
        >
          Marcar todas como leídas
        </button>
      </header>

      <div class="filters">
        <label class="check">
          <input
            type="checkbox"
            [checked]="soloNoLeidas()"
            (change)="filtrar($any($event.target).checked)"
          />
          Solo no leídas
        </label>
      </div>

      @if (mensaje()) {
        <p class="alert alert-success" role="status">{{ mensaje() }}</p>
      }
      @if (error()) {
        <p class="alert alert-danger" role="alert">{{ error() }}</p>
      }

      @if (cargando() && !pagina()) {
        <p class="cargando" role="status">Cargando notificaciones…</p>
      } @else if (pagina(); as p) {
        @if (p.contenido.length === 0) {
          <p class="estado-vacio">
            {{
              soloNoLeidas() ? 'No tienes notificaciones sin leer.' : 'No tienes notificaciones.'
            }}
          </p>
        } @else {
          <ul class="lista-notificaciones lista-completa" [attr.aria-busy]="cargando()">
            @for (n of p.contenido; track n.idNotificacion) {
              <li [class.no-leida]="!n.leida">
                <div class="notificacion-cuerpo">
                  <span class="notificacion-titulo">
                    @if (!n.leida) {
                      <span class="punto-no-leida" aria-hidden="true"></span>
                      <span class="sr-only">No leída:</span>
                    }
                    {{ n.titulo }}
                  </span>
                  <span class="notificacion-mensaje">{{ n.mensaje }}</span>
                  <time
                    class="notificacion-fecha"
                    [attr.datetime]="n.fechaCreacion"
                    [title]="absoluta(n.fechaCreacion)"
                    >{{ relativa(n.fechaCreacion) }}</time
                  >
                </div>
                <div class="acciones">
                  @if (interna(n.enlace)) {
                    <a class="btn btn-outline btn-sm" [routerLink]="n.enlace">Ver</a>
                  }
                  @if (!n.leida) {
                    <button
                      class="btn btn-link btn-sm"
                      type="button"
                      [disabled]="actualizando() === n.idNotificacion"
                      (click)="marcarLeida(n)"
                    >
                      Marcar como leída
                    </button>
                  }
                </div>
              </li>
            }
          </ul>
        }
        <app-paginador
          [pagina]="p.pagina"
          [tamano]="p.tamano"
          [totalElementos]="p.totalElementos"
          [totalPaginas]="p.totalPaginas"
          (cambiarPagina)="irAPagina($event)"
          (cambiarTamano)="cambiarTamano($event)"
        />
      }
    </section>
  `,
})
export class NotificacionesComponent implements OnInit {
  private readonly notificaciones = inject(NotificacionService);
  private readonly destroyRef = inject(DestroyRef);
  private carga?: Subscription;

  protected readonly pagina = signal<PaginaNotificaciones | null>(null);
  protected readonly soloNoLeidas = signal(false);
  private readonly numeroPagina = signal(0);
  private readonly tamano = signal(20);
  protected readonly cargando = signal(false);
  protected readonly marcando = signal(false);
  protected readonly actualizando = signal<number | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly mensaje = signal<string | null>(null);

  protected readonly relativa = (iso: string) => fechaRelativa(iso);
  protected readonly absoluta = (iso: string) => fechaAbsoluta(iso);
  protected readonly interna = esRutaInterna;

  ngOnInit(): void {
    this.cargar();
  }

  protected hayNoLeidas(): boolean {
    return (
      this.notificaciones.pendientes() > 0 ||
      (this.pagina()?.contenido.some((n) => !n.leida) ?? false)
    );
  }

  protected filtrar(soloNoLeidas: boolean): void {
    this.soloNoLeidas.set(soloNoLeidas);
    this.numeroPagina.set(0);
    this.cargar();
  }

  protected irAPagina(pagina: number): void {
    this.numeroPagina.set(pagina);
    this.cargar();
  }

  protected cambiarTamano(tamano: number): void {
    this.tamano.set(tamano);
    this.numeroPagina.set(0);
    this.cargar();
  }

  /** Queda en la lista (marcada como leida) aunque el filtro sea "Solo no leídas": no salta. */
  protected marcarLeida(n: Notificacion): void {
    this.actualizando.set(n.idNotificacion);
    this.error.set(null);
    this.mensaje.set(null);
    this.notificaciones
      .marcarLeida(n)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (actualizada) => {
          this.actualizando.set(null);
          const actual = this.pagina();
          if (actual) {
            this.pagina.set({
              ...actual,
              contenido: actual.contenido.map((x) =>
                x.idNotificacion === actualizada.idNotificacion ? actualizada : x,
              ),
            });
          }
        },
        error: (err: unknown) => {
          this.actualizando.set(null);
          this.error.set(mensajeDeError(err, 'No se pudo marcar la notificación como leída.'));
        },
      });
  }

  protected marcarTodas(): void {
    this.marcando.set(true);
    this.error.set(null);
    this.mensaje.set(null);
    this.notificaciones
      .marcarTodas()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.marcando.set(false);
          this.mensaje.set('Todas tus notificaciones quedaron marcadas como leídas.');
          this.numeroPagina.set(0);
          this.cargar();
        },
        error: (err: unknown) => {
          this.marcando.set(false);
          this.error.set(mensajeDeError(err, 'No se pudieron marcar las notificaciones.'));
        },
      });
  }

  private cargar(): void {
    this.carga?.unsubscribe();
    this.cargando.set(true);
    this.carga = this.notificaciones
      .listar({
        soloNoLeidas: this.soloNoLeidas() || undefined,
        pagina: this.numeroPagina(),
        tamano: this.tamano(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => {
          this.cargando.set(false);
          this.pagina.set(p);
        },
        error: (err: unknown) => {
          this.cargando.set(false);
          this.pagina.set(null);
          this.error.set(mensajeDeError(err, 'No se pudieron cargar las notificaciones.'));
        },
      });
  }
}
