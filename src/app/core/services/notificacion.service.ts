import {
  computed,
  DestroyRef,
  DOCUMENT,
  effect,
  inject,
  Injectable,
  signal,
  untracked,
} from '@angular/core';
import { map, Observable, Subscription, tap } from 'rxjs';
import type { Notificacion, PaginaNotificaciones, Preferencias } from '../../api/user';
import { NotificacionesService } from '../../api/user/services/notificaciones.service';
import { PerfilService } from '../../api/user/services/perfil.service';
import { AuthService } from '../auth/auth.service';

/** Piso del intervalo de consulta, aunque el servidor pida menos (no saturar al backend). */
export const POLLING_MINIMO_MS = 5_000;
/** Intervalo hasta que el servidor diga otro (NOTIF_GROUP.POLLING_SEGUNDOS). */
export const POLLING_INICIAL_MS = 30_000;
/** Tope del backoff cuando el endpoint falla. */
export const BACKOFF_MAXIMO_MS = 5 * 60_000;

export interface FiltroNotificaciones {
  soloNoLeidas?: boolean;
  pagina?: number;
  tamano?: number;
}

const data = <T>(r: { data: T }) => r.data;

/**
 * Notificaciones in-app del usuario autenticado (user-service, cualquier rol).
 *
 * Mantiene el contador de la campana consultando `GET /notificaciones/pendientes`:
 * - solo con sesion iniciada y sin cambio de contraseña pendiente (el backend responderia 403);
 * - cada `pollingSegundos` que devuelve el propio endpoint (minimo 5 s);
 * - en pausa mientras la pestaña esta oculta; al volver consulta enseguida;
 * - si falla, espera cada vez el doble (hasta 5 min) para no insistir contra un servicio caido.
 *
 * Usa setTimeout (no zone.js): al actualizar una signal, Angular zoneless repinta solo.
 */
@Injectable({ providedIn: 'root' })
export class NotificacionService {
  private readonly api = inject(NotificacionesService);
  private readonly perfilApi = inject(PerfilService);
  private readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);

  private readonly cantidad = signal(0);
  /** Cantidad de notificaciones sin leer (para el badge de la campana). */
  readonly pendientes = this.cantidad.asReadonly();

  /** Debe consultarse solo con sesion "completa" (el usuario ya cambio su contraseña temporal). */
  private readonly debeConsultar = computed(() => {
    const usuario = this.auth.usuario();
    return !!usuario && !usuario.requiereCambioPassword;
  });

  private activo = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private peticion: Subscription | null = null;
  private intervaloMs = POLLING_INICIAL_MS;
  private fallos = 0;
  private ultimaConsulta = 0;

  constructor() {
    effect(() => {
      const consultar = this.debeConsultar();
      untracked(() => (consultar ? this.arrancar() : this.detener()));
    });

    const alCambiarVisibilidad = () => this.visibilidadCambiada();
    this.document.addEventListener('visibilitychange', alCambiarVisibilidad);
    inject(DestroyRef).onDestroy(() => {
      this.document.removeEventListener('visibilitychange', alCambiarVisibilidad);
      this.detener();
    });
  }

  // ------------------------------------------------------------------ Consultas

  listar(filtro: FiltroNotificaciones = {}): Observable<PaginaNotificaciones> {
    const params = Object.fromEntries(
      Object.entries(filtro).filter(([, v]) => v !== undefined),
    ) as FiltroNotificaciones;
    return this.api.listarNotificaciones(params).pipe(map(data));
  }

  /** Marca una notificacion como leida y descuenta el badge sin esperar al siguiente polling. */
  marcarLeida(notificacion: Notificacion): Observable<Notificacion> {
    return this.api.marcarNotificacionLeida({ id: notificacion.idNotificacion }).pipe(
      map(data),
      tap(() => {
        if (!notificacion.leida) {
          this.cantidad.update((n) => Math.max(0, n - 1));
        }
      }),
    );
  }

  marcarTodas(): Observable<void> {
    return this.api.marcarTodasNotificacionesLeidas().pipe(
      map(() => undefined),
      tap(() => this.cantidad.set(0)),
    );
  }

  preferencias(): Observable<Preferencias> {
    return this.perfilApi.obtenerPreferencias().pipe(map(data));
  }

  guardarPreferencias(body: Preferencias): Observable<Preferencias> {
    return this.perfilApi.actualizarPreferencias({ body }).pipe(map(data));
  }

  // ------------------------------------------------------------------ Polling

  private arrancar(): void {
    if (this.activo) {
      return;
    }
    this.activo = true;
    this.fallos = 0;
    if (this.visible()) {
      this.consultar();
    }
  }

  /** Al cerrar sesion: corta el timer y la peticion en vuelo, y vacia el badge. */
  private detener(): void {
    this.activo = false;
    this.cancelarTimer();
    this.peticion?.unsubscribe();
    this.peticion = null;
    this.fallos = 0;
    this.ultimaConsulta = 0;
    this.intervaloMs = POLLING_INICIAL_MS;
    this.cantidad.set(0);
  }

  private consultar(): void {
    this.cancelarTimer();
    this.peticion?.unsubscribe();
    this.ultimaConsulta = Date.now();
    this.peticion = this.api
      .contarNotificacionesPendientes()
      .pipe(map(data))
      .subscribe({
        next: ({ cantidad, pollingSegundos }) => {
          this.peticion = null;
          this.fallos = 0;
          this.cantidad.set(cantidad);
          this.intervaloMs = Math.max(POLLING_MINIMO_MS, pollingSegundos * 1000);
          this.programar(this.intervaloMs);
        },
        error: () => {
          this.peticion = null;
          this.fallos++;
          this.programar(this.backoff());
        },
      });
  }

  private programar(ms: number): void {
    this.cancelarTimer();
    if (!this.activo || !this.visible()) {
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.consultar();
    }, ms);
  }

  /** Oculta: se pausa. Visible: consulta ya (respetando el minimo y el backoff si venia fallando). */
  private visibilidadCambiada(): void {
    if (!this.activo) {
      return;
    }
    if (!this.visible()) {
      this.cancelarTimer();
      return;
    }
    if (this.timer || this.peticion) {
      return;
    }
    if (this.fallos > 0) {
      this.programar(this.backoff());
      return;
    }
    const espera = this.ultimaConsulta + POLLING_MINIMO_MS - Date.now();
    if (espera > 0) {
      this.programar(espera);
    } else {
      this.consultar();
    }
  }

  private backoff(): number {
    return Math.min(BACKOFF_MAXIMO_MS, this.intervaloMs * 2 ** this.fallos);
  }

  private cancelarTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private visible(): boolean {
    return this.document.visibilityState !== 'hidden';
  }
}
