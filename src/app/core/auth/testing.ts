import { Component } from '@angular/core';
import { Rol, TokenResponse } from '../models/auth.models';

/** Pagina vacia para que las navegaciones de las pruebas siempre resuelvan. */
@Component({ template: '' })
export class PaginaVacia {}

export function tokensDePrueba(
  rol: Rol = 'ESTUDIANTE',
  cambios: Partial<TokenResponse['usuario']> = {},
  accessToken = 'access-1',
  refreshToken = 'refresh-1',
): TokenResponse {
  return {
    accessToken,
    refreshToken,
    tipoToken: 'Bearer',
    expiraEn: 3600,
    usuario: {
      idUsuario: 1,
      usuario: 'jperez',
      nombre: 'Juan',
      apellidos: 'Perez',
      correo: 'jperez@uagrm.edu.bo',
      rol,
      requiereCambioPassword: false,
      twoFactorEnabled: false,
      ...cambios,
    },
  };
}

export function respuesta<T>(data: T) {
  return { data, message: 'ok', status: 200, timestamp: new Date().toISOString() };
}
