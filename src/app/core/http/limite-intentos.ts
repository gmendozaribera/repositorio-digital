import { HttpErrorResponse } from '@angular/common/http';
import { computed, DestroyRef, inject, signal } from '@angular/core';
import { mensajeDeError } from './error-message';

/**
 * 429 de /auth/login y /auth/register (auth-api 1.2.0): tras demasiados intentos fallidos desde la
 * misma IP, el backend bloquea por un tiempo y lo informa en la cabecera `Retry-After` (segundos).
 *
 * Por que existe: frena a quien prueba contraseñas o CI al azar ("fuerza bruta"). Es como el
 * cajero que retiene la tarjeta tras varios PIN incorrectos, pero solo por unos minutos.
 */
export function esLimiteDeIntentos(error: unknown): error is HttpErrorResponse {
  return error instanceof HttpErrorResponse && error.status === 429;
}

/**
 * Segundos de espera segun `Retry-After`, o null si la cabecera no llego o no se entiende.
 * El estandar admite segundos ("900") o una fecha HTTP; se aceptan ambas.
 */
export function segundosDeEspera(error: HttpErrorResponse): number | null {
  const cabecera = error.headers?.get('Retry-After')?.trim();
  if (!cabecera) {
    return null;
  }
  if (/^\d+$/.test(cabecera)) {
    const segundos = Number(cabecera);
    return segundos > 0 ? segundos : null;
  }
  const fecha = Date.parse(cabecera);
  if (Number.isNaN(fecha)) {
    return null;
  }
  const segundos = Math.ceil((fecha - Date.now()) / 1000);
  return segundos > 0 ? segundos : null;
}

/** "Demasiados intentos fallidos. Podrás intentar de nuevo en N minutos." (N redondeado hacia arriba). */
export function mensajeDeEspera(segundos: number): string {
  const minutos = Math.max(1, Math.ceil(segundos / 60));
  return (
    'Demasiados intentos fallidos. Podrás intentar de nuevo en ' +
    `${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}.`
  );
}

/** "14:05" para la cuenta regresiva del boton. */
export function formatoCuentaRegresiva(segundos: number): string {
  const s = Math.max(0, Math.ceil(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Estado del bloqueo por intentos para un formulario publico (login, registro). Se crea en el
 * contexto de inyeccion del componente: el temporizador se limpia solo al destruirlo.
 *
 * - `manejar(error)`: si es un 429 arranca la espera y devuelve true.
 * - `bloqueado()`: el boton de enviar debe quedar deshabilitado.
 * - `mensaje()`: texto a mostrar (se actualiza con la cuenta regresiva).
 */
export function crearEsperaPorIntentos() {
  const restante = signal(0);
  /** Mensaje cuando el 429 no trae Retry-After: se muestra el detail del servidor sin bloquear. */
  const sinCabecera = signal<string | null>(null);
  let fin = 0;
  let temporizador: ReturnType<typeof setInterval> | null = null;

  const detener = () => {
    if (temporizador !== null) {
      clearInterval(temporizador);
      temporizador = null;
    }
  };
  inject(DestroyRef).onDestroy(detener);

  const actualizar = () => {
    // Se calcula contra el reloj (no restando 1 por tick) para no desfasarse si la pestaña duerme.
    const segundos = Math.max(0, Math.ceil((fin - Date.now()) / 1000));
    restante.set(segundos);
    if (segundos === 0) {
      detener();
    }
  };

  return {
    restante: restante.asReadonly(),
    bloqueado: computed(() => restante() > 0),
    mensaje: computed(() => (restante() > 0 ? mensajeDeEspera(restante()) : sinCabecera())),
    cuentaRegresiva: computed(() => formatoCuentaRegresiva(restante())),

    manejar(error: unknown): boolean {
      if (!esLimiteDeIntentos(error)) {
        return false;
      }
      detener();
      const segundos = segundosDeEspera(error);
      if (segundos === null) {
        restante.set(0);
        sinCabecera.set(
          mensajeDeError(error, 'Demasiados intentos fallidos. Intenta de nuevo más tarde.'),
        );
        return true;
      }
      sinCabecera.set(null);
      fin = Date.now() + segundos * 1000;
      restante.set(segundos);
      temporizador = setInterval(actualizar, 1000);
      return true;
    },

    /** Al reintentar se borra el aviso sin cabecera (el bloqueo con tiempo sigue hasta vencer). */
    limpiarAviso(): void {
      sinCabecera.set(null);
    },
  };
}

export type EsperaPorIntentos = ReturnType<typeof crearEsperaPorIntentos>;
