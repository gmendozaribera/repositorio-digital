import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideApi } from '../api/api.providers';
import { provideRouter, Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AUTH_URL, AuthService } from './auth.service';
import { jwtInterceptor } from './jwt.interceptor';
import { PaginaVacia, respuesta, tokensDePrueba } from './testing';
import { TokenStorageService } from './token-storage.service';

const RECURSO = `${environment.apiUrl}/trabajos`;

describe('jwtInterceptor', () => {
  let client: HttpClient;
  let http: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem('repositorio.sesion', JSON.stringify(tokensDePrueba()));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([jwtInterceptor])),
        provideHttpClientTesting(),
        provideApi(),
        provideRouter([{ path: '**', component: PaginaVacia }]),
      ],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('agrega el Bearer a las llamadas de la API', () => {
    client.get(RECURSO).subscribe();
    expect(http.expectOne(RECURSO).request.headers.get('Authorization')).toBe('Bearer access-1');
  });

  it('agrega el Bearer a notificaciones y perfil (user-service, cualquier rol)', () => {
    const pendientes = `${environment.apiUrl}/notificaciones/pendientes`;
    const preferencias = `${environment.apiUrl}/perfil/preferencias`;
    client.get(pendientes).subscribe();
    client.put(preferencias, { notificarCorreo: true }).subscribe();

    expect(http.expectOne(pendientes).request.headers.get('Authorization')).toBe('Bearer access-1');
    expect(http.expectOne(preferencias).request.headers.get('Authorization')).toBe(
      'Bearer access-1',
    );
  });

  it('agrega el Bearer a auth-service y a catalog-service (mismo origen /api/v1)', () => {
    const catalogo = `${environment.apiUrl}/facultades`;
    client.get(catalogo).subscribe();
    client.post(`${AUTH_URL}/2fa/enable`, {}).subscribe();

    expect(http.expectOne(catalogo).request.headers.get('Authorization')).toBe('Bearer access-1');
    expect(http.expectOne(`${AUTH_URL}/2fa/enable`).request.headers.get('Authorization')).toBe(
      'Bearer access-1',
    );
  });

  it('no envia el token a dominios externos ni a los endpoints de login', () => {
    client.get('https://api.externa.com/datos').subscribe();
    client.post(`${AUTH_URL}/login`, {}).subscribe();

    expect(
      http.expectOne('https://api.externa.com/datos').request.headers.has('Authorization'),
    ).toBe(false);
    expect(http.expectOne(`${AUTH_URL}/login`).request.headers.has('Authorization')).toBe(false);
  });

  it('el auto-registro va sin token; user-service si lo lleva', () => {
    const usuarios = `${environment.apiUrl}/usuarios`;
    const padron = `${environment.apiUrl}/padron/import`;
    client.post(`${AUTH_URL}/register`, {}).subscribe();
    client.get(usuarios).subscribe();
    client.post(padron, {}).subscribe();

    expect(http.expectOne(`${AUTH_URL}/register`).request.headers.has('Authorization')).toBe(false);
    expect(http.expectOne(usuarios).request.headers.get('Authorization')).toBe('Bearer access-1');
    expect(http.expectOne(padron).request.headers.get('Authorization')).toBe('Bearer access-1');
  });

  it('el repositorio anónimo (/publico/**) nunca lleva Bearer, aunque haya sesión', () => {
    const estado = `${environment.apiUrl}/publico/estado`;
    const buscar = `${environment.apiUrl}/publico/repositorio?q=redes`;
    const ficha = `${environment.apiUrl}/publico/repositorio/7`;
    const parecido = `${environment.apiUrl}/publicos-algo`;
    for (const url of [estado, buscar, ficha, parecido]) {
      client.get(url).subscribe();
    }

    expect(http.expectOne(estado).request.headers.has('Authorization')).toBe(false);
    expect(http.expectOne(buscar).request.headers.has('Authorization')).toBe(false);
    expect(http.expectOne(ficha).request.headers.has('Authorization')).toBe(false);
    // Solo el prefijo exacto /publico es anonimo.
    expect(http.expectOne(parecido).request.headers.get('Authorization')).toBe('Bearer access-1');
  });

  it('sin sesión, los catálogos (lectura anónima, catalog-api 1.3.0) salen sin Bearer y un 401 no refresca', () => {
    // Visitante de /explorar: no hay tokens guardados.
    TestBed.inject(AuthService).cerrarSesionLocal();
    const facultades = `${environment.apiUrl}/facultades`;
    const materias = `${environment.apiUrl}/materias?idFacultad=1&incluirInactivos=true`;
    let status: number | undefined;
    client.get(facultades).subscribe();
    client.get(materias).subscribe({ error: (e) => (status = e.status) });

    expect(http.expectOne(facultades).request.headers.has('Authorization')).toBe(false);
    const req = http.expectOne(materias);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(status).toBe(401);
    http.expectNone(`${AUTH_URL}/refresh`);
  });

  it('un 401 en /publico/** no intenta refrescar ni cierra la sesión', () => {
    const ficha = `${environment.apiUrl}/publico/repositorio/7`;
    let status: number | undefined;
    client.get(ficha).subscribe({ error: (e) => (status = e.status) });
    http.expectOne(ficha).flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(status).toBe(401);
    http.expectNone(`${AUTH_URL}/refresh`);
    expect(TestBed.inject(AuthService).autenticado()).toBe(true);
  });

  it('un 401 del auto-registro no intenta refrescar la sesion', () => {
    let status: number | undefined;
    client.post(`${AUTH_URL}/register`, {}).subscribe({ error: (e) => (status = e.status) });
    http.expectOne(`${AUTH_URL}/register`).flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(status).toBe(401);
    http.expectNone(`${AUTH_URL}/refresh`);
  });

  it('ante un 401 refresca el token y repite la peticion una vez', () => {
    let resultado: unknown;
    client.get(RECURSO).subscribe((r) => (resultado = r));

    http.expectOne(RECURSO).flush(null, { status: 401, statusText: 'Unauthorized' });
    http
      .expectOne(`${AUTH_URL}/refresh`)
      .flush(respuesta(tokensDePrueba('ESTUDIANTE', {}, 'access-2', 'refresh-2')));

    const reintento = http.expectOne(RECURSO);
    expect(reintento.request.headers.get('Authorization')).toBe('Bearer access-2');
    reintento.flush({ ok: true });

    expect(resultado).toEqual({ ok: true });
  });

  it('dos 401 simultaneos disparan un solo refresh', () => {
    client.get(`${RECURSO}/1`).subscribe();
    client.get(`${RECURSO}/2`).subscribe();

    http.expectOne(`${RECURSO}/1`).flush(null, { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${RECURSO}/2`).flush(null, { status: 401, statusText: 'Unauthorized' });
    http
      .expectOne(`${AUTH_URL}/refresh`)
      .flush(respuesta(tokensDePrueba('ESTUDIANTE', {}, 'access-2', 'refresh-2')));

    http.expectOne(`${RECURSO}/1`).flush({});
    http.expectOne(`${RECURSO}/2`).flush({});
  });

  it('si el refresh falla cierra la sesion y lleva al login', async () => {
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate');
    let status: number | undefined;
    client.get(RECURSO).subscribe({ error: (e) => (status = e.status) });

    http.expectOne(RECURSO).flush(null, { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${AUTH_URL}/refresh`).flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(status).toBe(401);
    expect(TestBed.inject(AuthService).autenticado()).toBe(false);
    expect(TestBed.inject(TokenStorageService).leer()).toBeNull();
    expect(navegar).toHaveBeenCalledWith(['/login'], { queryParams: { expirada: 1 } });
  });

  it('un 401 del reintento no vuelve a refrescar', () => {
    let status: number | undefined;
    client.get(RECURSO).subscribe({ error: (e) => (status = e.status) });

    http.expectOne(RECURSO).flush(null, { status: 401, statusText: 'Unauthorized' });
    http
      .expectOne(`${AUTH_URL}/refresh`)
      .flush(respuesta(tokensDePrueba('ESTUDIANTE', {}, 'access-2', 'refresh-2')));
    http.expectOne(RECURSO).flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(status).toBe(401);
    http.expectNone(`${AUTH_URL}/refresh`);
  });

  it('un 429 (demasiados intentos) nunca dispara refresh: llega intacto con su Retry-After', () => {
    const errores: { status: number; retryAfter: string | null }[] = [];
    const guardar = (e: { status: number; headers: { get(n: string): string | null } }) =>
      errores.push({ status: e.status, retryAfter: e.headers.get('Retry-After') });

    client.post(`${AUTH_URL}/login`, {}).subscribe({ error: guardar });
    client.post(`${AUTH_URL}/register`, {}).subscribe({ error: guardar });
    client.get(RECURSO).subscribe({ error: guardar });

    const limite = {
      status: 429,
      statusText: 'Too Many Requests',
      headers: { 'Retry-After': '900' },
    };
    const registro = http.expectOne(`${AUTH_URL}/register`);
    expect(registro.request.headers.has('Authorization')).toBe(false);
    http.expectOne(`${AUTH_URL}/login`).flush(null, limite);
    registro.flush(null, limite);
    http.expectOne(RECURSO).flush(null, limite);

    http.expectNone(`${AUTH_URL}/refresh`);
    expect(errores).toEqual([
      { status: 429, retryAfter: '900' },
      { status: 429, retryAfter: '900' },
      { status: 429, retryAfter: '900' },
    ]);
    expect(TestBed.inject(AuthService).autenticado()).toBe(true);
  });
});
