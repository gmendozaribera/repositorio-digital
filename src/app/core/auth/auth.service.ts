import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { finalize, map, Observable, shareReplay, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ActivarDosFactoresResponse,
  ApiResponse,
  CambioPasswordRequest,
  LoginRequest,
  LoginResponse,
  TokenResponse,
  UsuarioSesion,
} from '../models/auth.models';
import { RUTA_INICIO_POR_ROL } from './role-home';
import { TokenStorageService } from './token-storage.service';

export const AUTH_URL = `${environment.apiUrl}/auth`;

/** Paso intermedio del login cuando el usuario tiene 2FA. Solo vive en memoria. */
export interface DosFactoresPendiente {
  tokenTemporal: string;
  usuario: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly storage = inject(TokenStorageService);

  private readonly sesion = signal<TokenResponse | null>(this.storage.leer());
  private readonly pendiente = signal<DosFactoresPendiente | null>(null);
  private refrescoEnCurso: Observable<TokenResponse> | null = null;

  readonly usuario = computed<UsuarioSesion | null>(() => this.sesion()?.usuario ?? null);
  readonly autenticado = computed(() => this.sesion() !== null);
  readonly dosFactoresPendiente = this.pendiente.asReadonly();

  accessToken(): string | null {
    return this.sesion()?.accessToken ?? null;
  }

  /** Paso 1 del login. Si la cuenta tiene 2FA, deja el token temporal pendiente. */
  login(request: LoginRequest): Observable<LoginResponse> {
    return this.http.post<ApiResponse<LoginResponse>>(`${AUTH_URL}/login`, request).pipe(
      map((r) => r.data),
      tap((data) => {
        if (data.requiereDosFactores && data.tokenTemporal) {
          this.pendiente.set({ tokenTemporal: data.tokenTemporal, usuario: request.usuario });
        } else if (data.tokens) {
          this.iniciarSesion(data.tokens);
        }
      }),
    );
  }

  /** Paso 2 del login: codigo de Google Authenticator. */
  verificarDosFactores(codigo: string): Observable<TokenResponse> {
    const pendiente = this.pendiente();
    if (!pendiente) {
      return throwError(() => new Error('No hay un inicio de sesión pendiente de verificación.'));
    }
    return this.http
      .post<ApiResponse<TokenResponse>>(`${AUTH_URL}/2fa/verify`, {
        tokenTemporal: pendiente.tokenTemporal,
        codigo,
      })
      .pipe(
        map((r) => r.data),
        tap((tokens) => this.iniciarSesion(tokens)),
      );
  }

  cancelarDosFactores(): void {
    this.pendiente.set(null);
  }

  /**
   * Renueva el access token con el refresh token. Si varias peticiones reciben 401 a la vez,
   * todas comparten la misma llamada: el backend rota el refresh token y un segundo uso del
   * mismo seria rechazado.
   */
  refrescar(): Observable<TokenResponse> {
    const refreshToken = this.sesion()?.refreshToken;
    if (!refreshToken) {
      return throwError(() => new Error('No hay refresh token.'));
    }
    if (!this.refrescoEnCurso) {
      this.refrescoEnCurso = this.http
        .post<ApiResponse<TokenResponse>>(`${AUTH_URL}/refresh`, { refreshToken })
        .pipe(
          map((r) => r.data),
          tap((tokens) => this.guardarSesion(tokens)),
          finalize(() => (this.refrescoEnCurso = null)),
          shareReplay(1),
        );
    }
    return this.refrescoEnCurso;
  }

  /** El backend devuelve tokens nuevos: los anteriores quedan revocados. */
  cambiarPassword(request: CambioPasswordRequest): Observable<TokenResponse> {
    return this.http.post<ApiResponse<TokenResponse>>(`${AUTH_URL}/password/change`, request).pipe(
      map((r) => r.data),
      tap((tokens) => this.guardarSesion(tokens)),
    );
  }

  activarDosFactores(): Observable<ActivarDosFactoresResponse> {
    return this.http
      .post<ApiResponse<ActivarDosFactoresResponse>>(`${AUTH_URL}/2fa/enable`, {})
      .pipe(map((r) => r.data));
  }

  confirmarDosFactores(codigo: string): Observable<void> {
    return this.http
      .post<ApiResponse<unknown>>(`${AUTH_URL}/2fa/confirm`, { codigo })
      .pipe(map(() => this.actualizarUsuario({ twoFactorEnabled: true })));
  }

  desactivarDosFactores(codigo: string): Observable<void> {
    return this.http
      .post<ApiResponse<unknown>>(`${AUTH_URL}/2fa/disable`, { codigo })
      .pipe(map(() => this.actualizarUsuario({ twoFactorEnabled: false })));
  }

  /**
   * Cierra la sesion en el backend (blacklist del access y del refresh) y localmente.
   * Aunque el backend falle, la sesion local se borra igual.
   */
  logout(): void {
    const refreshToken = this.sesion()?.refreshToken;
    if (!this.accessToken()) {
      this.cerrarSesionLocal();
      return;
    }
    this.http
      .post(`${AUTH_URL}/logout`, { refreshToken })
      .pipe(finalize(() => this.cerrarSesionLocal()))
      .subscribe({ error: () => undefined });
  }

  /** Borra la sesion del navegador y lleva al login. */
  cerrarSesionLocal(sesionExpirada = false): void {
    this.sesion.set(null);
    this.pendiente.set(null);
    this.storage.borrar();
    void this.router.navigate(['/login'], {
      queryParams: sesionExpirada ? { expirada: 1 } : {},
    });
  }

  /** Ruta a la que debe ir el usuario actual: login, cambio de contrasena o su dashboard. */
  rutaInicio(): string {
    const usuario = this.usuario();
    if (!usuario) {
      return '/login';
    }
    if (usuario.requiereCambioPassword) {
      return '/change-password';
    }
    return RUTA_INICIO_POR_ROL[usuario.rol] ?? '/login';
  }

  /**
   * Tras el login vuelve a la pagina que el usuario queria ver, salvo que deba cambiar la
   * contrasena. Solo se aceptan rutas internas ("/algo") para no redirigir a sitios externos.
   */
  destinoTrasLogin(returnUrl: string | null): string {
    const inicio = this.rutaInicio();
    if (inicio === '/change-password' || !returnUrl) {
      return inicio;
    }
    return returnUrl.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : inicio;
  }

  private iniciarSesion(tokens: TokenResponse): void {
    this.pendiente.set(null);
    this.guardarSesion(tokens);
  }

  private guardarSesion(tokens: TokenResponse): void {
    this.sesion.set(tokens);
    this.storage.guardar(tokens);
  }

  private actualizarUsuario(cambios: Partial<UsuarioSesion>): void {
    const actual = this.sesion();
    if (actual) {
      this.guardarSesion({ ...actual, usuario: { ...actual.usuario, ...cambios } });
    }
  }
}
