import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AUTH_URL, AuthService } from './auth.service';
import { PaginaVacia, respuesta, tokensDePrueba } from './testing';
import { TokenStorageService } from './token-storage.service';

describe('AuthService', () => {
  let auth: AuthService;
  let http: HttpTestingController;

  function configurar() {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: '**', component: PaginaVacia }]),
      ],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  }

  beforeEach(() => {
    sessionStorage.clear();
    configurar();
  });

  afterEach(() => http.verify());

  it('login sin 2FA guarda la sesion y envia al dashboard del rol', () => {
    auth.login({ usuario: 'admin', password: 'x' }).subscribe();
    http
      .expectOne(`${AUTH_URL}/login`)
      .flush(
        respuesta({
          requiereDosFactores: false,
          tokenTemporal: null,
          tokens: tokensDePrueba('ADMIN'),
        }),
      );

    expect(auth.autenticado()).toBe(true);
    expect(auth.accessToken()).toBe('access-1');
    expect(auth.rutaInicio()).toBe('/admin');
    expect(TestBed.inject(TokenStorageService).leer()?.refreshToken).toBe('refresh-1');
  });

  it('login con 2FA deja pendiente el token temporal y no inicia sesion', () => {
    auth.login({ usuario: 'jperez', password: 'x' }).subscribe();
    http
      .expectOne(`${AUTH_URL}/login`)
      .flush(respuesta({ requiereDosFactores: true, tokenTemporal: 'tmp', tokens: null }));

    expect(auth.autenticado()).toBe(false);
    expect(auth.dosFactoresPendiente()).toEqual({ tokenTemporal: 'tmp', usuario: 'jperez' });

    auth.verificarDosFactores('123456').subscribe();
    const req = http.expectOne(`${AUTH_URL}/2fa/verify`);
    expect(req.request.body).toEqual({ tokenTemporal: 'tmp', codigo: '123456' });
    req.flush(respuesta(tokensDePrueba()));

    expect(auth.autenticado()).toBe(true);
    expect(auth.dosFactoresPendiente()).toBeNull();
  });

  it('con requiereCambioPassword la ruta de inicio es /change-password', () => {
    TestBed.inject(TokenStorageService).guardar(
      tokensDePrueba('DOCENTE', { requiereCambioPassword: true }),
    );
    TestBed.resetTestingModule();
    configurar();

    expect(auth.rutaInicio()).toBe('/change-password');
    expect(auth.destinoTrasLogin('/docente')).toBe('/change-password');
  });

  it('refrescos simultaneos comparten una sola llamada y guardan el refresh rotado', () => {
    TestBed.inject(TokenStorageService).guardar(tokensDePrueba());
    TestBed.resetTestingModule();
    configurar();

    const recibidos: string[] = [];
    auth.refrescar().subscribe((t) => recibidos.push(t.accessToken));
    auth.refrescar().subscribe((t) => recibidos.push(t.accessToken));

    const req = http.expectOne(`${AUTH_URL}/refresh`);
    expect(req.request.body).toEqual({ refreshToken: 'refresh-1' });
    req.flush(respuesta(tokensDePrueba('ESTUDIANTE', {}, 'access-2', 'refresh-2')));

    expect(recibidos).toEqual(['access-2', 'access-2']);
    expect(TestBed.inject(TokenStorageService).leer()?.refreshToken).toBe('refresh-2');
  });

  it('logout revoca en el backend y borra la sesion aunque el backend falle', () => {
    TestBed.inject(TokenStorageService).guardar(tokensDePrueba());
    TestBed.resetTestingModule();
    configurar();

    auth.logout();
    const req = http.expectOne(`${AUTH_URL}/logout`);
    expect(req.request.body).toEqual({ refreshToken: 'refresh-1' });
    req.flush(null, { status: 503, statusText: 'Service Unavailable' });

    expect(auth.autenticado()).toBe(false);
    expect(TestBed.inject(TokenStorageService).leer()).toBeNull();
  });

  it('destinoTrasLogin solo acepta rutas internas', () => {
    TestBed.inject(TokenStorageService).guardar(tokensDePrueba());
    TestBed.resetTestingModule();
    configurar();

    expect(auth.destinoTrasLogin('/perfil/seguridad')).toBe('/perfil/seguridad');
    expect(auth.destinoTrasLogin('//sitio-malicioso.com')).toBe('/estudiante');
    expect(auth.destinoTrasLogin('https://sitio-malicioso.com')).toBe('/estudiante');
    expect(auth.destinoTrasLogin(null)).toBe('/estudiante');
  });
});
