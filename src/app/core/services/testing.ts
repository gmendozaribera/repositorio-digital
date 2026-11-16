import type { Usuario } from '../../api/user';

/** Datos de prueba de user-service (solo para los .spec.ts). */
export const USUARIO_DOCENTE: Usuario = {
  idUsuario: 12,
  usuario: 'doc.maria',
  rol: 'DOCENTE',
  estado: 1,
  requiereCambioPassword: false,
  twoFactorEnabled: false,
  idPersona: 30,
  nombre: 'María',
  apellidos: 'López',
  ci: 7654321,
  correo: 'maria.lopez@uagrm.edu.bo',
  celular: null,
  fechaNac: null,
  registro: null,
  idCarrera: null,
  siglaCarrera: null,
};

/** Envuelve una lista en la forma de PaginaUsuarios / PaginaPadron. */
export function pagina<T>(contenido: T[], numero = 0, tamano = 20, totalElementos?: number) {
  const total = totalElementos ?? contenido.length;
  return {
    contenido,
    pagina: numero,
    tamano,
    totalElementos: total,
    totalPaginas: Math.ceil(total / tamano),
  };
}
