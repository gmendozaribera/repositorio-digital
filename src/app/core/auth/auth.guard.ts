import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Exige sesion iniciada. Si el usuario debe cambiar su contrasena (primer login con
 * password_default), solo puede estar en /change-password: el backend igual rechazaria
 * cualquier otra llamada con 403.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const usuario = auth.usuario();

  if (!usuario) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
  if (usuario.requiereCambioPassword && !state.url.startsWith('/change-password')) {
    return router.createUrlTree(['/change-password']);
  }
  return true;
};

/** Para /login y /2fa: si ya hay sesion, manda al dashboard del rol. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.autenticado() ? inject(Router).parseUrl(auth.rutaInicio()) : true;
};

/**
 * Para el repositorio publico (`/explorar/**`): quien ya tiene sesion va al equivalente autenticado
 * (`/explorar/7?q=x` -> `/repositorio/7?q=x`), que tiene filtros de catalogo y descargas.
 */
export const visitanteGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  if (!auth.autenticado()) {
    return true;
  }
  return inject(Router).parseUrl(state.url.replace(/^\/explorar(?=[/?#]|$)/, '/repositorio'));
};
