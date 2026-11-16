import {
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import type { Notificacion } from '../api/user';
import { mensajeDeError } from '../core/http/error-message';
import { NotificacionService } from '../core/services/notificacion.service';
import { fechaAbsoluta, fechaRelativa } from '../shared/fecha-relativa';
import { esRutaInterna } from '../shared/ruta-interna';

/** Cuantas notificaciones muestra el panel desplegable. */
export const ULTIMAS_NOTIFICACIONES = 10;

/** Texto del badge: vacio si no hay pendientes, "99+" a partir de 100. */
export function textoBadge(cantidad: number): string {
  if (cantidad <= 0) {
    return '';
  }
  return cantidad > 99 ? '99+' : String(cantidad);
}

/**
 * Campana de la barra superior: badge con las notificaciones sin leer y panel con las ultimas.
 * El contador lo mantiene NotificacionService (polling); el panel pide la lista al abrirse.
 */
@Component({
  selector: 'app-campana',
  imports: [RouterLink],
  host: {
    class: 'campana',
    '(document:click)': 'clicEnDocumento($event)',
    '(document:keydown.escape)': 'cerrarConEscape()',
  },
  template: `
    <button
      #boton
      class="campana-boton"
      type="button"
      aria-haspopup="true"
      aria-controls="panel-notificaciones"
      [attr.aria-expanded]="abierto()"
      [attr.aria-label]="etiqueta()"
      (click)="alternar()"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" focusable="false">
        <path
          fill="currentColor"
          d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z"
        />
      </svg>
      @if (badge()) {
        <span class="campana-badge" aria-hidden="true">{{ badge() }}</span>
      }
    </button>
    <span class="sr-only" aria-live="polite">{{ anuncio() }}</span>

    @if (abierto()) {
      <div
        id="panel-notificaciones"
        class="campana-panel"
        role="region"
        aria-label="Notificaciones recientes"
      >
        <div class="campana-cabecera">
          <strong>Notificaciones</strong>
          <button
            class="btn btn-link btn-sm"
            type="button"
            [disabled]="marcando() || !hayNoLeidas()"
            (click)="marcarTodas()"
          >
            Marcar todas como leídas
          </button>
        </div>

        @if (error()) {
          <p class="alert alert-danger" role="alert">{{ error() }}</p>
        }

        @if (cargando()) {
          <p class="cargando" role="status">Cargando…</p>
        } @else if (lista().length === 0) {
          <p class="campana-vacio">No tienes notificaciones.</p>
        } @else {
          <ul class="lista-notificaciones">
            @for (n of lista(); track n.idNotificacion) {
              <li [class.no-leida]="!n.leida">
                <button class="notificacion-item" type="button" (click)="abrir(n)">
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
                </button>
              </li>
            }
          </ul>
        }

        <div class="campana-pie">
          <a routerLink="/notificaciones" (click)="cerrar()">Ver todas</a>
        </div>
      </div>
    }
  `,
})
export class CampanaComponent {
  private readonly notificaciones = inject(NotificacionService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly boton = viewChild.required<ElementRef<HTMLButtonElement>>('boton');

  protected readonly abierto = signal(false);
  protected readonly cargando = signal(false);
  protected readonly marcando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly lista = signal<Notificacion[]>([]);

  protected readonly badge = computed(() => textoBadge(this.notificaciones.pendientes()));
  protected readonly hayNoLeidas = computed(
    () => this.notificaciones.pendientes() > 0 || this.lista().some((n) => !n.leida),
  );
  protected readonly etiqueta = computed(() => {
    const n = this.notificaciones.pendientes();
    if (n === 0) {
      return 'Notificaciones: ninguna sin leer';
    }
    return n === 1 ? 'Notificaciones: 1 sin leer' : `Notificaciones: ${n} sin leer`;
  });
  /** Solo se anuncia cuando hay pendientes (aria-live lee cada cambio del texto). */
  protected readonly anuncio = computed(() => {
    const n = this.notificaciones.pendientes();
    if (n === 0) {
      return '';
    }
    return n === 1 ? 'Tienes 1 notificación sin leer' : `Tienes ${n} notificaciones sin leer`;
  });

  protected readonly relativa = (iso: string) => fechaRelativa(iso);
  protected readonly absoluta = (iso: string) => fechaAbsoluta(iso);

  protected alternar(): void {
    if (this.abierto()) {
      this.cerrar();
    } else {
      this.abierto.set(true);
      this.cargar();
    }
  }

  cerrar(): void {
    this.abierto.set(false);
  }

  protected cerrarConEscape(): void {
    if (this.abierto()) {
      this.cerrar();
      this.boton().nativeElement.focus();
    }
  }

  protected clicEnDocumento(evento: MouseEvent): void {
    if (this.abierto() && !this.host.nativeElement.contains(evento.target as Node | null)) {
      this.cerrar();
    }
  }

  protected abrir(n: Notificacion): void {
    if (!n.leida) {
      this.notificaciones
        .marcarLeida(n)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (actualizada) =>
            this.lista.update((l) =>
              l.map((x) => (x.idNotificacion === actualizada.idNotificacion ? actualizada : x)),
            ),
          error: (err: unknown) =>
            this.error.set(mensajeDeError(err, 'No se pudo marcar la notificación como leída.')),
        });
    }
    if (esRutaInterna(n.enlace)) {
      this.cerrar();
      void this.router.navigateByUrl(n.enlace);
    }
  }

  protected marcarTodas(): void {
    this.marcando.set(true);
    this.error.set(null);
    this.notificaciones
      .marcarTodas()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.marcando.set(false);
          this.lista.update((l) => l.map((n) => ({ ...n, leida: true })));
        },
        error: (err: unknown) => {
          this.marcando.set(false);
          this.error.set(mensajeDeError(err, 'No se pudieron marcar las notificaciones.'));
        },
      });
  }

  private cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.notificaciones
      .listar({ tamano: ULTIMAS_NOTIFICACIONES })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => {
          this.cargando.set(false);
          this.lista.set(p.contenido);
        },
        error: (err: unknown) => {
          this.cargando.set(false);
          this.error.set(mensajeDeError(err, 'No se pudieron cargar las notificaciones.'));
        },
      });
  }
}
