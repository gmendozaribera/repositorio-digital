import {
  HttpContextToken,
  HttpErrorResponse,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AUTH_URL, AuthService } from './auth.service';

/** Marca la peticion ya reintentada tras un refresh, para no entrar en bucle. */
const REINTENTADA = new HttpContextToken<boolean>(() => false);

/** Endpoints que no llevan Bearer ni disparan refresh: son los que obtienen tokens. */
const ENDPOINTS_PUBLICOS = ['/login', '/refresh', '/2fa/verify'].map((p) => `${AUTH_URL}${p}`);

function esPublico(url: string): boolean {
  return ENDPOINTS_PUBLICOS.some((p) => url.startsWith(p));
}

function conToken(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

/**
 * Agrega el access token a toda llamada a nuestra API. Si el backend responde 401 (token
 * expirado), pide uno nuevo con el refresh token y repite la peticion una sola vez. Si el
 * refresh tambien falla, la sesion termino: se limpia y se vuelve al login.
 *
 * El token solo se envia a environment.apiUrl, nunca a dominios de terceros.
 */
export const jwtInterceptor: HttpInterceptorFn = (req, next: HttpHandlerFn) => {
  if (!req.url.startsWith(environment.apiUrl) || esPublico(req.url)) {
    return next(req);
  }

  const auth = inject(AuthService);
  const tokenUsado = auth.accessToken();
  const peticion = tokenUsado ? conToken(req, tokenUsado) : req;

  return next(peticion).pipe(
    catchError((error: unknown) => {
      const debeRefrescar =
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        tokenUsado !== null &&
        !req.context.get(REINTENTADA) &&
        !req.url.startsWith(`${AUTH_URL}/logout`);
      if (!debeRefrescar) {
        return throwError(() => error);
      }

      const reintentar = (token: string) =>
        next(conToken(req.clone({ context: req.context.set(REINTENTADA, true) }), token));

      // Otra peticion ya renovo el token mientras esta estaba en vuelo.
      const tokenActual = auth.accessToken();
      if (tokenActual && tokenActual !== tokenUsado) {
        return reintentar(tokenActual);
      }

      return auth.refrescar().pipe(
        catchError(() => {
          auth.cerrarSesionLocal(true);
          return throwError(() => error);
        }),
        switchMap((tokens) => reintentar(tokens.accessToken)),
      );
    }),
  );
};
