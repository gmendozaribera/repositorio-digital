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
});
