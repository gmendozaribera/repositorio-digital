import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import {
  crearEsperaPorIntentos,
  formatoCuentaRegresiva,
  mensajeDeConsultasSeguidas,
  mensajeDeEspera,
  segundosDeEspera,
} from './limite-intentos';

function error429(retryAfter?: string, detail = 'Demasiados intentos.') {
  return new HttpErrorResponse({
    status: 429,
    statusText: 'Too Many Requests',
    headers: retryAfter ? new HttpHeaders({ 'Retry-After': retryAfter }) : new HttpHeaders(),
    error: { status: 429, title: 'Demasiados intentos', detail },
  });
}

describe('limite de intentos (429)', () => {
  afterEach(() => vi.useRealTimers());

  it('lee Retry-After en segundos o como fecha HTTP', () => {
    expect(segundosDeEspera(error429('900'))).toBe(900);
    expect(segundosDeEspera(error429())).toBeNull();
    expect(segundosDeEspera(error429('mañana'))).toBeNull();
    expect(segundosDeEspera(error429('0'))).toBeNull();

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-16T14:00:00Z'));
    expect(segundosDeEspera(error429('Mon, 16 Nov 2026 14:05:00 GMT'))).toBe(300);
  });

  it('repositorio público: cuenta en segundos con singular para 1', () => {
    expect(mensajeDeConsultasSeguidas(30)).toBe(
      'Demasiadas consultas seguidas. Podrás buscar de nuevo en 30 segundos.',
    );
    expect(mensajeDeConsultasSeguidas(0.4)).toContain('en 1 segundo.');
  });

  it('redondea los minutos hacia arriba y usa singular con 1 minuto', () => {
    expect(mensajeDeEspera(900)).toBe(
      'Demasiados intentos fallidos. Podrás intentar de nuevo en 15 minutos.',
    );
    expect(mensajeDeEspera(901)).toContain('en 16 minutos.');
    expect(mensajeDeEspera(5)).toContain('en 1 minuto.');
    expect(formatoCuentaRegresiva(65)).toBe('1:05');
  });

  it('cuenta regresiva: bloquea hasta que vence Retry-After y detiene el temporizador', () => {
    vi.useFakeTimers();
    const espera = TestBed.runInInjectionContext(() => crearEsperaPorIntentos());

    expect(espera.manejar(new HttpErrorResponse({ status: 401 }))).toBe(false);
    expect(espera.bloqueado()).toBe(false);

    expect(espera.manejar(error429('90'))).toBe(true);
    expect(espera.bloqueado()).toBe(true);
    expect(espera.mensaje()).toContain('en 2 minutos.');
    expect(espera.cuentaRegresiva()).toBe('1:30');

    vi.advanceTimersByTime(31_000);
    expect(espera.cuentaRegresiva()).toBe('0:59');
    expect(espera.mensaje()).toContain('en 1 minuto.');

    vi.advanceTimersByTime(60_000);
    expect(espera.bloqueado()).toBe(false);
    expect(espera.mensaje()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('al destruir el componente se cancela el temporizador', () => {
    vi.useFakeTimers();
    const espera = TestBed.runInInjectionContext(() => crearEsperaPorIntentos());
    espera.manejar(error429('600'));
    expect(vi.getTimerCount()).toBe(1);
    TestBed.resetTestingModule();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('sin Retry-After muestra el detail del servidor y no bloquea', () => {
    const espera = TestBed.runInInjectionContext(() => crearEsperaPorIntentos());
    espera.manejar(error429(undefined, 'Intente de nuevo en 15 minutos.'));
    expect(espera.bloqueado()).toBe(false);
    expect(espera.mensaje()).toBe('Intente de nuevo en 15 minutos.');
    espera.limpiarAviso();
    expect(espera.mensaje()).toBeNull();
  });
});
