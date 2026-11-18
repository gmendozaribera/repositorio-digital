import { HttpErrorResponse } from '@angular/common/http';
import { computed, DestroyRef, DOCUMENT, inject, Injectable, signal } from '@angular/core';
import { map, Observable, Subscription, tap } from 'rxjs';
import type { Analisis, EstadoAnalisisResumen } from '../../api/plagio';
import { PlagioService as PlagioApi } from '../../api/plagio/services/plagio.service';
import { mensajeDeError } from '../http/error-message';

/** Cada cuanto se consulta `GET .../estado` mientras el analisis esta EN_PROCESO (contrato: 5 s). */
export const PLAGIO_POLLING_MS = 5_000;
/** Tope del backoff cuando la consulta falla (servicio caido o sin red). */
export const PLAGIO_BACKOFF_MAXIMO_MS = 2 * 60_000;

export type NivelPlagio = NonNullable<Analisis['nivel']>;

/**
 * - `cargando`: primera consulta del ultimo analisis.
 * - `sin-analisis`: el trabajo nunca se analizo (404).
 * - `sin-permiso`: el backend respondio 403 (p. ej. un estudiante): no se muestra nada.
 * - `listo`: hay un analisis (en curso o terminado) en `analisis()`.
 * - `error`: no se pudo consultar (red, 503...); `errorCarga()` trae el motivo.
 */
export type FaseSeguimiento = 'cargando' | 'sin-analisis' | 'sin-permiso' | 'listo' | 'error';

const data = <T>(r: { data: T }) => r.data;

/**
 * Fachada sobre el cliente generado de plagiarism-service (src/app/api/plagio): desenvuelve
 * `{ data, message, status, timestamp }`.
 *
 * Iniciar y ver resultados: docentes del grupo del trabajo y ADMIN. Los estudiantes no ven los
 * resultados (403/404); quien no puede ver el trabajo recibe 404.
 */
@Injectable({ providedIn: 'root' })
export class PlagioService {
  private readonly api = inject(PlagioApi);
  private readonly document = inject(DOCUMENT);

  /**
   * 202 con el analisis EN_PROCESO. 409 si ya hay uno en curso o el estado del trabajo no lo
   * permite (BORRADOR/RECHAZADO); 400 si no tiene archivos PDF, DOCX u ODT.
   */
  iniciar(idTrabajo: number): Observable<Analisis> {
    return this.api.iniciarAnalisisPlagio({ id: idTrabajo }).pipe(map(data));
  }

  /** El mas reciente (en curso o terminado). 404 si el trabajo nunca se analizo. */
  ultimo(idTrabajo: number): Observable<Analisis> {
    return this.api.obtenerUltimoAnalisisPlagio({ id: idTrabajo }).pipe(map(data));
  }

  /** Liviano (desde cache en el backend): pensado para consultarse cada 5 s. */
  estado(idTrabajo: number): Observable<EstadoAnalisisResumen> {
    return this.api.obtenerEstadoAnalisisPlagio({ id: idTrabajo }).pipe(map(data));
  }

  /** Todos los analisis del trabajo, del mas reciente al mas antiguo. */
  historial(idTrabajo: number): Observable<Analisis[]> {
    return this.api.listarAnalisisPlagio({ id: idTrabajo }).pipe(map(data));
  }

  /**
   * Seguimiento del analisis de un trabajo con signals. Se detiene solo cuando `destroyRef` se
   * destruye (normalmente el del componente que lo muestra).
   */
  seguir(idTrabajo: number, destroyRef: DestroyRef): SeguimientoPlagio {
    return new SeguimientoPlagio(this, idTrabajo, this.document, destroyRef);
  }
}

/**
 * Estado del analisis de plagio de un trabajo, al dia:
 * - `cargar()` trae el ultimo analisis; si esta EN_PROCESO empieza a consultar `/estado`.
 * - `iniciar()` lanza uno nuevo y empieza a consultar `/estado`.
 * - Mientras esta EN_PROCESO consulta `/estado` cada 5 s; en pausa con la pestaña oculta (al
 *   volver consulta enseguida); si falla espera cada vez el doble (hasta 2 min).
 * - Al pasar a COMPLETADO o ERROR deja de consultar y pide el analisis completo (fuentes, motivo).
 * - Al destruirse el componente corta el timer y la peticion en vuelo.
 *
 * Usa setTimeout (no zone.js): al actualizar una signal, Angular zoneless repinta solo.
 */
export class SeguimientoPlagio {
  private readonly _analisis = signal<Analisis | null>(null);
  private readonly _fase = signal<FaseSeguimiento>('cargando');
  private readonly _errorCarga = signal<string | null>(null);

  readonly analisis = this._analisis.asReadonly();
  readonly fase = this._fase.asReadonly();
  readonly errorCarga = this._errorCarga.asReadonly();
  /** Hay un analisis en curso: no se puede iniciar otro. */
  readonly enProceso = computed(() => this._analisis()?.estado === 'EN_PROCESO');

  private carga: Subscription | null = null;
  private activo = false;
  private destruido = false;
  /** El estado ya dijo COMPLETADO/ERROR: falta traer el analisis completo. */
  private faltaCompleto = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private peticion: Subscription | null = null;
  private fallos = 0;
  private ultimaConsulta = 0;
  private readonly alCambiarVisibilidad = () => this.visibilidadCambiada();

  constructor(
    private readonly plagio: PlagioService,
    readonly idTrabajo: number,
    private readonly document: Document,
    destroyRef: DestroyRef,
  ) {
    this.document.addEventListener('visibilitychange', this.alCambiarVisibilidad);
    destroyRef.onDestroy(() => this.destruir());
  }

  /** Trae el ultimo analisis (404 = nunca se analizo). Si esta en curso, empieza el seguimiento. */
  cargar(): void {
    if (this.destruido) {
      return;
    }
    this.detenerPolling();
    this.carga?.unsubscribe();
    this._errorCarga.set(null);
    if (!this._analisis()) {
      this._fase.set('cargando');
    }
    this.carga = this.plagio.ultimo(this.idTrabajo).subscribe({
      next: (a) => {
        this.carga = null;
        this.mostrar(a);
      },
      error: (err: unknown) => {
        this.carga = null;
        const status = err instanceof HttpErrorResponse ? err.status : null;
        if (status === 404) {
          this._analisis.set(null);
          this._fase.set('sin-analisis');
        } else if (status === 403) {
          this._analisis.set(null);
          this._fase.set('sin-permiso');
        } else {
          this._fase.set(this._analisis() ? 'listo' : 'error');
          this._errorCarga.set(mensajeDeError(err, 'No se pudo consultar el análisis de plagio.'));
        }
      },
    });
  }

  /**
   * Inicia un analisis nuevo. Al responder 202 muestra el analisis EN_PROCESO y empieza a
   * consultar su estado. Los errores (409, 400...) los maneja quien se suscribe.
   */
  iniciar(): Observable<Analisis> {
    return this.plagio.iniciar(this.idTrabajo).pipe(tap((a) => this.mostrar(a)));
  }

  private mostrar(a: Analisis): void {
    this.detenerPolling();
    this._analisis.set(a);
    this._fase.set('listo');
    this._errorCarga.set(null);
    if (a.estado === 'EN_PROCESO') {
      this.arrancarPolling();
    }
  }

  // ------------------------------------------------------------------ Polling

  private arrancarPolling(): void {
    this.activo = true;
    this.fallos = 0;
    this.faltaCompleto = false;
    // Lo que hay en pantalla es de este instante: la primera consulta, dentro de 5 s.
    this.ultimaConsulta = Date.now();
    this.programar(PLAGIO_POLLING_MS);
  }

  private detenerPolling(): void {
    this.activo = false;
    this.faltaCompleto = false;
    this.cancelarTimer();
    this.peticion?.unsubscribe();
    this.peticion = null;
    this.fallos = 0;
  }

  private consultar(): void {
    this.cancelarTimer();
    this.peticion?.unsubscribe();
    this.ultimaConsulta = Date.now();
    if (this.faltaCompleto) {
      this.peticion = this.plagio.ultimo(this.idTrabajo).subscribe({
        next: (a) => {
          this.peticion = null;
          this.mostrar(a);
        },
        error: () => this.fallo(),
      });
      return;
    }
    this.peticion = this.plagio.estado(this.idTrabajo).subscribe({
      next: (e) => {
        this.peticion = null;
        this.fallos = 0;
        if (e.estado === 'EN_PROCESO') {
          this.programar(PLAGIO_POLLING_MS);
        } else {
          // Termino: el resumen no trae fuentes ni motivo; se pide el analisis completo ya.
          this.faltaCompleto = true;
          this.consultar();
        }
      },
      error: () => this.fallo(),
    });
  }

  private fallo(): void {
    this.peticion = null;
    this.fallos++;
    this.programar(this.backoff());
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

  /** Oculta: se pausa. Visible: consulta ya (respetando los 5 s y el backoff si venia fallando). */
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
    const espera = this.ultimaConsulta + PLAGIO_POLLING_MS - Date.now();
    if (espera > 0) {
      this.programar(espera);
    } else {
      this.consultar();
    }
  }

  private backoff(): number {
    return Math.min(PLAGIO_BACKOFF_MAXIMO_MS, PLAGIO_POLLING_MS * 2 ** this.fallos);
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

  private destruir(): void {
    this.destruido = true;
    this.detenerPolling();
    this.carga?.unsubscribe();
    this.carga = null;
    this.document.removeEventListener('visibilitychange', this.alCambiarVisibilidad);
  }
}
