import { HttpErrorResponse } from '@angular/common/http';
import { AbstractControl } from '@angular/forms';
import type { ProblemDetail } from '../../api/auth';

function problemDetail(error: unknown): ProblemDetail | null {
  return error instanceof HttpErrorResponse && error.error && typeof error.error === 'object'
    ? (error.error as ProblemDetail)
    : null;
}

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
  const problem = problemDetail(error);
  if (problem?.errores) {
    const primero = Object.entries(problem.errores)[0];
    if (primero) {
      return `${primero[0]}: ${primero[1]}`;
    }
  }
  return problem?.detail ?? porDefecto;
}

/**
 * Lleva el mapa `errores` (campo -> mensaje) de un ProblemDetail de validacion a los controles
 * del formulario: cada control queda con el error `servidor` y su mensaje, que la plantilla
 * muestra debajo del campo. Devuelve el mensaje general para el aviso del formulario.
 *
 * Los campos que el formulario no tiene se agregan al mensaje general para no perderlos.
 */
export function aplicarErroresDelServidor(
  form: AbstractControl,
  error: unknown,
  porDefecto = 'No se pudo guardar.',
): string {
  const problem = problemDetail(error);
  const errores = problem?.errores;
  if (!problem || !errores) {
    return mensajeDeError(error, porDefecto);
  }
  const sinCampo: string[] = [];
  for (const [campo, mensaje] of Object.entries(errores)) {
    const control = form.get(campo);
    if (control) {
      control.setErrors({ ...control.errors, servidor: mensaje });
      control.markAsTouched();
    } else {
      sinCampo.push(`${campo}: ${mensaje}`);
    }
  }
  const general = problem.detail ?? 'Revise los datos ingresados.';
  return sinCampo.length ? `${general} ${sinCampo.join('. ')}` : general;
}

/** Mensaje del error `servidor` de un control, o null. */
export function errorDelServidor(control: AbstractControl | null): string | null {
  const valor: unknown = control?.errors?.['servidor'];
  return typeof valor === 'string' ? valor : null;
}
