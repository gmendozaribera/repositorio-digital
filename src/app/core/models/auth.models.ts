// Interfaces espejo de los DTOs de source/dto (paquete dto.auth y dto.common) del backend.

export type Rol = 'ADMIN' | 'DOCENTE' | 'ESTUDIANTE';

/** Envoltorio de toda respuesta exitosa: { data, message, status, timestamp }. */
export interface ApiResponse<T> {
  data: T;
  message: string;
  status: number;
  timestamp: string;
}

/** Error RFC 7807. En validaciones trae ademas el mapa campo -> mensaje. */
export interface ProblemDetail {
  status: number;
  title?: string;
  detail?: string;
  instance?: string;
  timestamp?: string;
  errores?: Record<string, string>;
}

export interface UsuarioSesion {
  idUsuario: number;
  usuario: string;
  nombre: string;
  apellidos: string;
  correo: string;
  rol: Rol;
  requiereCambioPassword: boolean;
  twoFactorEnabled: boolean;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  tipoToken: 'Bearer';
  /** Segundos de vida del access token. */
  expiraEn: number;
  usuario: UsuarioSesion;
}

export interface LoginRequest {
  usuario: string;
  password: string;
}

/** Sin 2FA: tokens viene lleno. Con 2FA: requiereDosFactores = true y llega tokenTemporal. */
export interface LoginResponse {
  requiereDosFactores: boolean;
  tokenTemporal: string | null;
  tokens: TokenResponse | null;
}

export interface VerificarDosFactoresRequest {
  tokenTemporal: string;
  codigo: string;
}

export interface CambioPasswordRequest {
  passwordActual: string;
  passwordNueva: string;
}

export interface ActivarDosFactoresResponse {
  secreto: string;
  otpAuthUri: string;
  /** PNG del QR como data URI, listo para un <img src>. */
  qrDataUri: string;
}
