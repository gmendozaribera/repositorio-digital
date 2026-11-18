import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { createEnvironmentInjector, DestroyRef, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideApi } from '../api/api.providers';
import { respuesta } from '../auth/testing';
import { PlagioService, SeguimientoPlagio } from './plagio.service';
import { analisisDePrueba, analisisEnProceso, estadoDePrueba, problema } from './testing-plagio';

const BASE = '/api/v1/plagio/trabajos/7';
const ESTADO = `${BASE}/estado`;

function ponerVisibilidad(estado: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => estado });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('PlagioService', () => {
  let http: HttpTestingController;
  let servicio: PlagioService;
  /** Hace las veces del componente: al destruirlo se corta el seguimiento. */
  let componente: EnvironmentInjector;

  function seguir(): SeguimientoPlagio {
    componente = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
    return servicio.seguir(7, componente.get(DestroyRef));
  }

  function sinConsultas(): void {
    http.expectNone(ESTADO);
    http.expectNone(BASE);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApi()],
    });
    http = TestBed.inject(HttpTestingController);
    servicio = TestBed.inject(PlagioService);
  });

  afterEach(() => {
    if (componente && !componente.destroyed) {
      componente.destroy();
    }
    http.verify();
    vi.useRealTimers();
    delete (document as { visibilityState?: unknown }).visibilityState;
  });

  // ------------------------------------------------------------------ Fachada

  it('iniciar, último, estado e historial desenvuelven data', () => {
    let iniciado, ultimo, estado, historial;
    servicio.iniciar(7).subscribe((a) => (iniciado = a));
    const post = http.expectOne(BASE);
    expect(post.request.method).toBe('POST');
    post.flush(respuesta(analisisEnProceso()), { status: 202, statusText: 'Accepted' });
    expect(iniciado).toEqual(analisisEnProceso());

    servicio.ultimo(7).subscribe((a) => (ultimo = a));
    const get = http.expectOne(BASE);
    expect(get.request.method).toBe('GET');
    get.flush(respuesta(analisisDePrueba()));
    expect(ultimo).toEqual(analisisDePrueba());

    servicio.estado(7).subscribe((e) => (estado = e));
    http.expectOne(ESTADO).flush(respuesta(estadoDePrueba('EN_PROCESO')));
    expect(estado).toEqual(estadoDePrueba('EN_PROCESO'));

    servicio.historial(7).subscribe((l) => (historial = l));
    http.expectOne(`${BASE}/historial`).flush(respuesta([analisisDePrueba()]));
    expect(historial).toEqual([analisisDePrueba()]);
  });

  // ------------------------------------------------------------------ Seguimiento

  it('404: el trabajo nunca se analizó; 403: sin permiso; otro error: mensaje', () => {
    const s = seguir();
    s.cargar();
    expect(s.fase()).toBe('cargando');
    http.expectOne(BASE).flush(problema(404, 'No existe'), { status: 404, statusText: 'NF' });
    expect(s.fase()).toBe('sin-analisis');
    expect(s.analisis()).toBeNull();

    s.cargar();
    http.expectOne(BASE).flush(problema(403, 'Prohibido'), { status: 403, statusText: 'F' });
    expect(s.fase()).toBe('sin-permiso');

    s.cargar();
    http.expectOne(BASE).flush(problema(503, 'Caído'), { status: 503, statusText: 'SU' });
    expect(s.fase()).toBe('error');
    expect(s.errorCarga()).toContain('no está disponible');
  });

  it('terminado: no consulta el estado', () => {
    vi.useFakeTimers();
    const s = seguir();
    s.cargar();
    http.expectOne(BASE).flush(respuesta(analisisDePrueba()));
    expect(s.fase()).toBe('listo');
    expect(s.enProceso()).toBe(false);
    vi.advanceTimersByTime(60_000);
    sinConsultas();
  });

  it('EN_PROCESO: consulta /estado cada 5 s, se detiene al completar y carga el análisis completo', () => {
    vi.useFakeTimers();
    const s = seguir();
    s.cargar();
    http.expectOne(BASE).flush(respuesta(analisisEnProceso()));
    expect(s.enProceso()).toBe(true);

    vi.advanceTimersByTime(4_999);
    sinConsultas();
    vi.advanceTimersByTime(1);
    http.expectOne(ESTADO).flush(respuesta(estadoDePrueba('EN_PROCESO')));

    vi.advanceTimersByTime(4_999);
    sinConsultas();
    vi.advanceTimersByTime(1);
    http
      .expectOne(ESTADO)
      .flush(
        respuesta(estadoDePrueba('COMPLETADO', { porcentajeSimilitud: 34.2, nivel: 'MEDIO' })),
      );

    // Enseguida pide el completo (fuentes, umbrales...).
    const completo = http.expectOne(BASE);
    expect(completo.request.method).toBe('GET');
    completo.flush(respuesta(analisisDePrueba({ idAnalisis: 4 })));
    expect(s.analisis()?.estado).toBe('COMPLETADO');
    expect(s.analisis()?.fuentes).toHaveLength(3);
    expect(s.enProceso()).toBe(false);

    vi.advanceTimersByTime(60_000);
    sinConsultas();
  });

  it('ERROR también detiene el seguimiento y trae el motivo', () => {
    vi.useFakeTimers();
    const s = seguir();
    s.cargar();
    http.expectOne(BASE).flush(respuesta(analisisEnProceso()));
    vi.advanceTimersByTime(5_000);
    http.expectOne(ESTADO).flush(respuesta(estadoDePrueba('ERROR')));
    http
      .expectOne(BASE)
      .flush(respuesta(analisisEnProceso({ estado: 'ERROR', mensajeError: 'Sin texto legible.' })));
    expect(s.analisis()?.mensajeError).toBe('Sin texto legible.');
    vi.advanceTimersByTime(60_000);
    sinConsultas();
  });

  it('iniciar muestra el análisis EN_PROCESO y empieza a consultar', () => {
    vi.useFakeTimers();
    const s = seguir();
    s.cargar();
    http.expectOne(BASE).flush(problema(404, 'No'), { status: 404, statusText: 'NF' });

    s.iniciar().subscribe();
    http.expectOne(BASE).flush(respuesta(analisisEnProceso()), { status: 202, statusText: 'A' });
    expect(s.fase()).toBe('listo');
    expect(s.enProceso()).toBe(true);
    vi.advanceTimersByTime(5_000);
    http.expectOne(ESTADO).flush(respuesta(estadoDePrueba('EN_PROCESO')));
  });

  it('se pausa con la pestaña oculta y consulta enseguida al volver', () => {
    vi.useFakeTimers();
    const s = seguir();
    s.cargar();
    http.expectOne(BASE).flush(respuesta(analisisEnProceso()));

    ponerVisibilidad('hidden');
    vi.advanceTimersByTime(120_000);
    sinConsultas();

    ponerVisibilidad('visible');
    http.expectOne(ESTADO).flush(respuesta(estadoDePrueba('EN_PROCESO')));
    // Sigue el ciclo normal, sin timers duplicados.
    vi.advanceTimersByTime(5_000);
    http.expectOne(ESTADO).flush(respuesta(estadoDePrueba('EN_PROCESO')));
    expect(s.enProceso()).toBe(true);
  });

  it('si falla espera cada vez el doble y vuelve a 5 s al recuperarse', () => {
    vi.useFakeTimers();
    const s = seguir();
    s.cargar();
    http.expectOne(BASE).flush(respuesta(analisisEnProceso()));
    vi.advanceTimersByTime(5_000);
    http.expectOne(ESTADO).flush(problema(503, 'Caído'), { status: 503, statusText: 'SU' });

    vi.advanceTimersByTime(9_999);
    sinConsultas();
    vi.advanceTimersByTime(1);
    http.expectOne(ESTADO).flush(problema(503, 'Caído'), { status: 503, statusText: 'SU' });

    vi.advanceTimersByTime(19_999);
    sinConsultas();
    vi.advanceTimersByTime(1);
    http.expectOne(ESTADO).flush(respuesta(estadoDePrueba('EN_PROCESO')));

    vi.advanceTimersByTime(5_000);
    http.expectOne(ESTADO).flush(respuesta(estadoDePrueba('EN_PROCESO')));
    expect(s.enProceso()).toBe(true);
  });

  it('al destruir el componente corta el timer y la petición en vuelo', () => {
    vi.useFakeTimers();
    const s = seguir();
    s.cargar();
    http.expectOne(BASE).flush(respuesta(analisisEnProceso()));
    vi.advanceTimersByTime(5_000);
    const enVuelo = http.expectOne(ESTADO);

    componente.destroy();
    expect(enVuelo.cancelled).toBe(true);
    vi.advanceTimersByTime(60_000);
    sinConsultas();
    ponerVisibilidad('visible');
    sinConsultas();
  });
});
