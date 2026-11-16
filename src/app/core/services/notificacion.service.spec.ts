import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideApi } from '../api/api.providers';
import { AuthService } from '../auth/auth.service';
import { PaginaVacia, respuesta, tokensDePrueba } from '../auth/testing';
import { NotificacionService } from './notificacion.service';
import { NOTIFICACION, pagina } from './testing';

const API = '/api/v1';
const PENDIENTES = `${API}/notificaciones/pendientes`;

function ponerVisibilidad(estado: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => estado });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('NotificacionService', () => {
  let http: HttpTestingController;

  function iniciar(sesion: ReturnType<typeof tokensDePrueba> | null = tokensDePrueba()) {
    sessionStorage.clear();
    if (sesion) {
      sessionStorage.setItem('repositorio.sesion', JSON.stringify(sesion));
    }
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApi(),
        provideRouter([{ path: '**', component: PaginaVacia }]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const servicio = TestBed.inject(NotificacionService);
    TestBed.tick();
    return servicio;
  }

  function responderPendientes(cantidad: number, pollingSegundos = 30): void {
    http.expectOne(PENDIENTES).flush(respuesta({ cantidad, pollingSegundos }));
  }

  function sinConsultas(): void {
    http.expectNone(PENDIENTES);
  }

  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
    delete (document as { visibilityState?: unknown }).visibilityState;
  });

  it('no consulta sin sesión iniciada', () => {
    const servicio = iniciar(null);
    vi.advanceTimersByTime(120_000);
    sinConsultas();
    expect(servicio.pendientes()).toBe(0);
  });

  it('no consulta si el usuario debe cambiar su contraseña', () => {
    iniciar(tokensDePrueba('ESTUDIANTE', { requiereCambioPassword: true }));
    vi.advanceTimersByTime(120_000);
    sinConsultas();
  });

  it('consulta al iniciar y repite cada pollingSegundos que devuelve el servidor', () => {
    const servicio = iniciar();
    const primera = http.expectOne(PENDIENTES);
    expect(primera.request.method).toBe('GET');
    primera.flush(respuesta({ cantidad: 3, pollingSegundos: 10 }));
    expect(servicio.pendientes()).toBe(3);

    vi.advanceTimersByTime(9_999);
    sinConsultas();
    vi.advanceTimersByTime(1);
    // El servidor cambia el intervalo: se usa el ultimo valor recibido.
    responderPendientes(7, 60);
    expect(servicio.pendientes()).toBe(7);

    vi.advanceTimersByTime(59_999);
    sinConsultas();
    vi.advanceTimersByTime(1);
    responderPendientes(7, 60);
  });

  it('nunca consulta más seguido que cada 5 segundos', () => {
    iniciar();
    responderPendientes(1, 1);
    vi.advanceTimersByTime(4_999);
    sinConsultas();
    vi.advanceTimersByTime(1);
    responderPendientes(1, 1);
  });

  it('se pausa con la pestaña oculta y consulta enseguida al volver', () => {
    const servicio = iniciar();
    responderPendientes(1, 10);

    ponerVisibilidad('hidden');
    vi.advanceTimersByTime(300_000);
    sinConsultas();

    ponerVisibilidad('visible');
    responderPendientes(4, 10);
    expect(servicio.pendientes()).toBe(4);

    // Sigue el ciclo normal (una sola consulta por intervalo, sin timers duplicados).
    vi.advanceTimersByTime(10_000);
    responderPendientes(4, 10);
  });

  it('al volver a la pestaña no repite si consultó hace menos de 5 segundos', () => {
    iniciar();
    responderPendientes(1, 30);
    ponerVisibilidad('hidden');
    vi.advanceTimersByTime(2_000);
    ponerVisibilidad('visible');
    sinConsultas();
    vi.advanceTimersByTime(3_000);
    responderPendientes(1, 30);
  });

  it('se detiene al cerrar sesión, cancela la petición en vuelo y vacía el badge', () => {
    const servicio = iniciar();
    responderPendientes(9, 10);
    expect(servicio.pendientes()).toBe(9);

    vi.advanceTimersByTime(10_000);
    const enVuelo = http.expectOne(PENDIENTES);
    TestBed.inject(AuthService).cerrarSesionLocal();
    TestBed.tick();

    expect(enVuelo.cancelled).toBe(true);
    expect(servicio.pendientes()).toBe(0);
    vi.advanceTimersByTime(600_000);
    sinConsultas();
  });

  it('si el endpoint falla espera cada vez el doble (backoff) y se recupera', () => {
    const servicio = iniciar();
    responderPendientes(2, 30);
    vi.advanceTimersByTime(30_000);
    http.expectOne(PENDIENTES).flush(null, { status: 503, statusText: 'Service Unavailable' });

    vi.advanceTimersByTime(59_999);
    sinConsultas();
    vi.advanceTimersByTime(1);
    http.expectOne(PENDIENTES).flush(null, { status: 503, statusText: 'Service Unavailable' });

    vi.advanceTimersByTime(119_999);
    sinConsultas();
    vi.advanceTimersByTime(1);
    responderPendientes(6, 30);
    expect(servicio.pendientes()).toBe(6);

    // Recuperado: vuelve al intervalo normal.
    vi.advanceTimersByTime(30_000);
    responderPendientes(6, 30);
  });

  it('marcar una como leída descuenta el badge; marcar todas lo deja en 0', () => {
    const servicio = iniciar();
    responderPendientes(3, 30);

    servicio.marcarLeida(NOTIFICACION).subscribe();
    const patch = http.expectOne(`${API}/notificaciones/5/leida`);
    expect(patch.request.method).toBe('PATCH');
    patch.flush(respuesta({ ...NOTIFICACION, leida: true }));
    expect(servicio.pendientes()).toBe(2);

    // Ya leida: no descuenta de nuevo.
    servicio.marcarLeida({ ...NOTIFICACION, leida: true }).subscribe();
    http.expectOne(`${API}/notificaciones/5/leida`).flush(respuesta(NOTIFICACION));
    expect(servicio.pendientes()).toBe(2);

    servicio.marcarTodas().subscribe();
    const post = http.expectOne(`${API}/notificaciones/leidas`);
    expect(post.request.method).toBe('POST');
    post.flush(respuesta(null));
    expect(servicio.pendientes()).toBe(0);
  });

  it('lista con soloNoLeidas y paginación, y lee/guarda las preferencias', () => {
    const servicio = iniciar(null);
    let total = -1;
    servicio
      .listar({ soloNoLeidas: true, pagina: 1, tamano: 10 })
      .subscribe((p) => (total = p.totalElementos));
    const req = http.expectOne((r) => r.url === `${API}/notificaciones`);
    expect(req.request.params.get('soloNoLeidas')).toBe('true');
    expect(req.request.params.get('pagina')).toBe('1');
    expect(req.request.params.get('tamano')).toBe('10');
    req.flush(respuesta(pagina([NOTIFICACION], 1, 10, 11)));
    expect(total).toBe(11);

    let correo: boolean | undefined;
    servicio.preferencias().subscribe((p) => (correo = p.notificarCorreo));
    http.expectOne(`${API}/perfil/preferencias`).flush(respuesta({ notificarCorreo: false }));
    expect(correo).toBe(false);

    servicio
      .guardarPreferencias({ notificarCorreo: true })
      .subscribe((p) => (correo = p.notificarCorreo));
    const put = http.expectOne(`${API}/perfil/preferencias`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ notificarCorreo: true });
    put.flush(respuesta({ notificarCorreo: true }));
    expect(correo).toBe(true);
  });
});
