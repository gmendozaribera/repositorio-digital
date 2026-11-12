import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { TokenResponse } from '../models/auth.models';
import { authGuard, guestGuard } from './auth.guard';
import { roleGuard } from './role.guard';
import { PaginaVacia, tokensDePrueba } from './testing';

function preparar(sesion: TokenResponse | null) {
  sessionStorage.clear();
  if (sesion) {
    sessionStorage.setItem('repositorio.sesion', JSON.stringify(sesion));
  }
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideRouter([{ path: '**', component: PaginaVacia }])],
  });
}

function ejecutar(guard: typeof authGuard, url: string): string | true {
  const resultado = TestBed.runInInjectionContext(() =>
    guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
  );
  return resultado instanceof UrlTree
    ? TestBed.inject(Router).serializeUrl(resultado)
    : (resultado as true);
}

describe('authGuard', () => {
  it('sin sesion manda al login recordando la ruta', () => {
    preparar(null);
    expect(ejecutar(authGuard, '/docente')).toBe('/login?returnUrl=%2Fdocente');
  });

  it('con sesion deja pasar', () => {
    preparar(tokensDePrueba());
    expect(ejecutar(authGuard, '/estudiante')).toBe(true);
  });

  it('si debe cambiar la contrasena solo permite /change-password', () => {
    preparar(tokensDePrueba('ESTUDIANTE', { requiereCambioPassword: true }));
    expect(ejecutar(authGuard, '/estudiante')).toBe('/change-password');
    expect(ejecutar(authGuard, '/change-password')).toBe(true);
  });
});

describe('guestGuard', () => {
  it('sin sesion deja ver el login', () => {
    preparar(null);
    expect(ejecutar(guestGuard, '/login')).toBe(true);
  });

  it('con sesion manda al dashboard del rol', () => {
    preparar(tokensDePrueba('DOCENTE'));
    expect(ejecutar(guestGuard, '/login')).toBe('/docente');
  });
});

describe('roleGuard', () => {
  it('permite el rol indicado', () => {
    preparar(tokensDePrueba('ADMIN'));
    expect(ejecutar(roleGuard('ADMIN'), '/admin')).toBe(true);
  });

  it('otro rol vuelve a su propio dashboard', () => {
    preparar(tokensDePrueba('ESTUDIANTE'));
    expect(ejecutar(roleGuard('ADMIN', 'DOCENTE'), '/admin')).toBe('/estudiante');
  });

  it('sin sesion manda al login', () => {
    preparar(null);
    expect(ejecutar(roleGuard('ADMIN'), '/admin')).toBe('/login');
  });
});
