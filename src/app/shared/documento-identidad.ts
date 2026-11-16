import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * CI y celular son texto en los contratos (user-api 1.1.0 / auth-api 1.2.0): el CI puede traer
 * complemento (p. ej. 1234567-1A) y el celular un prefijo internacional (+591...).
 * Mismos patrones que el YAML; el backend los vuelve a validar.
 */
export const PATRON_CI = /^[0-9]{4,12}(-?[0-9A-Za-z]{1,3})?$/;
export const PATRON_CELULAR = /^\+?[0-9]{7,15}$/;

/** maxLength del contrato para ambos campos. */
export const MAX_CI = 20;
export const MAX_CELULAR = 20;

export const AYUDA_CI =
  'De 4 a 12 dígitos, con complemento opcional (p. ej. 1234567 o 1234567-1A).';
export const AYUDA_CELULAR = 'De 7 a 15 dígitos, con prefijo «+» opcional (p. ej. 70012345).';

/** Quita espacios (incluso los del medio) y pasa a MAYUSCULAS, como lo guarda el backend. */
export function normalizarCi(valor: string | null | undefined): string {
  return (valor ?? '').replace(/\s+/g, '').toUpperCase();
}

/** Quita espacios; vacio -> null (el celular es opcional). */
export function normalizarCelular(valor: string | null | undefined): string | null {
  const limpio = (valor ?? '').replace(/\s+/g, '');
  return limpio === '' ? null : limpio;
}

/**
 * Valida el CI ya normalizado: "1234567 1a" se acepta porque se enviara como "12345671A".
 * Un valor vacio lo deja pasar (para eso esta Validators.required).
 */
export const validarCi: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const valor = normalizarCi(control.value as string | null);
  return valor === '' || PATRON_CI.test(valor) ? null : { ci: true };
};

/** Valida el celular normalizado; vacio es valido (campo opcional). */
export const validarCelular: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const valor = normalizarCelular(control.value as string | null);
  return valor === null || PATRON_CELULAR.test(valor) ? null : { celular: true };
};
