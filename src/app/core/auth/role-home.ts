import { Rol } from '../models/auth.models';

/** Ruta de inicio (dashboard) de cada rol. */
export const RUTA_INICIO_POR_ROL: Record<Rol, string> = {
  ADMIN: '/admin',
  DOCENTE: '/docente',
  ESTUDIANTE: '/estudiante',
};
