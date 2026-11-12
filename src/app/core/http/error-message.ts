import { HttpErrorResponse } from '@angular/common/http';
import { ProblemDetail } from '../models/auth.models';

/** Convierte un error HTTP del backend en un texto apto para mostrar al usuario. */
export function mensajeDeError(
  error: unknown,
  porDefecto = 'Ocurrió un error inesperado.',
): string {
  if (!(error instanceof HttpErrorResponse)) {
    return porDefecto;
  }
  if (error.status === 0) {
    return 'No se pudo conectar con el servidor. Verifique su conexión.';
  }
  if (error.status === 503) {
    return 'El servicio no está disponible en este momento. Intente más tarde.';
  }
  const problem = error.error as ProblemDetail | null;
  if (problem?.errores) {
    const primero = Object.entries(problem.errores)[0];
    if (primero) {
      return `${primero[0]}: ${primero[1]}`;
    }
  }
  return problem?.detail ?? porDefecto;
}
