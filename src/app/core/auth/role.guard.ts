import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Rol } from '../models/auth.models';
import { AuthService } from './auth.service';

/**
 * RoleGuard('ADMIN' | 'DOCENTE' | 'ESTUDIANTE'). Usar junto a authGuard.
 * Un usuario sin el rol vuelve a su propio dashboard.
 *
 * Esto solo oculta pantallas: quien decide de verdad es el backend, que valida el rol del JWT
 * en cada endpoint.
 */
export function roleGuard(...roles: Rol[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const usuario = auth.usuario();

    if (!usuario) {
      return router.createUrlTree(['/login']);
    }
    return roles.includes(usuario.rol) ? true : router.parseUrl(auth.rutaInicio());
  };
}
