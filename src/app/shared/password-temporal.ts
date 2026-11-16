import { Validators } from '@angular/forms';

/**
 * Reglas de `PasswordTemporal` en user-api.yaml: 8 a 72 caracteres, con al menos una mayúscula,
 * una minúscula y un número. El backend vuelve a validar; esto solo adelanta el aviso.
 */
export const VALIDADORES_PASSWORD_TEMPORAL = [
  Validators.required,
  Validators.minLength(8),
  Validators.maxLength(72),
  Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/),
];

// Sin caracteres que se confunden al dictarlos o copiarlos a mano (0/O, 1/l/I).
const MAYUSCULAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MINUSCULAS = 'abcdefghijkmnpqrstuvwxyz';
const NUMEROS = '23456789';
const TODOS = MAYUSCULAS + MINUSCULAS + NUMEROS;

function aleatorio(max: number): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] % max;
}

/**
 * Genera una contraseña temporal que cumple las reglas, con el generador criptográfico del
 * navegador (Math.random no es seguro para contraseñas).
 */
export function generarPasswordTemporal(longitud = 12): string {
  const caracteres = [
    MAYUSCULAS[aleatorio(MAYUSCULAS.length)],
    MINUSCULAS[aleatorio(MINUSCULAS.length)],
    NUMEROS[aleatorio(NUMEROS.length)],
  ];
  while (caracteres.length < longitud) {
    caracteres.push(TODOS[aleatorio(TODOS.length)]);
  }
  // Mezcla (Fisher-Yates) para que los obligatorios no queden siempre al inicio.
  for (let i = caracteres.length - 1; i > 0; i--) {
    const j = aleatorio(i + 1);
    [caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]];
  }
  return caracteres.join('');
}

/** Mensaje para el control con las reglas de la contraseña temporal. */
export const AYUDA_PASSWORD_TEMPORAL =
  'Entre 8 y 72 caracteres, con al menos una mayúscula, una minúscula y un número.';
