import { Injectable } from '@angular/core';
import { TokenResponse } from '../models/auth.models';

const CLAVE = 'repositorio.sesion';

/**
 * Persiste la sesion en sessionStorage.
 *
 * Seguridad: sessionStorage se borra al cerrar la pestana, asi un token olvidado en una PC
 * compartida (laboratorio) no queda vivo 7 dias. Cualquier script de la pagina puede leerlo,
 * por eso la defensa real es no tener XSS (Angular escapa todo lo que se interpola).
 */
@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  leer(): TokenResponse | null {
    try {
      const valor = sessionStorage.getItem(CLAVE);
      return valor ? (JSON.parse(valor) as TokenResponse) : null;
    } catch {
      return null;
    }
  }

  guardar(sesion: TokenResponse): void {
    try {
      sessionStorage.setItem(CLAVE, JSON.stringify(sesion));
    } catch {
      // Almacenamiento bloqueado: la sesion sigue viva en memoria hasta recargar.
    }
  }

  borrar(): void {
    try {
      sessionStorage.removeItem(CLAVE);
    } catch {
      // Nada que limpiar.
    }
  }
}
