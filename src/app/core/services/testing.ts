import type { Dominio, Notificacion, Usuario } from '../../api/user';

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
  ci: '7654321',
  correo: 'maria.lopez@uagrm.edu.bo',
  celular: null,
  fechaNac: null,
  registro: null,
  idCarrera: null,
  siglaCarrera: null,
};

/** Parametro del sistema (no se puede eliminar). */
export const DOMINIO_LOGIN_INTENTOS: Dominio = {
  domainId: 1,
  domainGroup: 'AUTH_GROUP',
  domainName: 'LOGIN_INTENTOS',
  domainValue: '10',
  description: 'Intentos fallidos permitidos por IP antes de bloquear el login.',
  lastUser: 'sistema',
  lastTime: '2026-11-16T14:00:00Z',
  sistema: true,
  secreto: false,
  configurado: true,
};

/** Parametros del grupo SMTP_GROUP tal como los devuelve GET /dominios?domainGroup=SMTP_GROUP. */
export function dominiosSmtp(cambios: Partial<Record<string, Partial<Dominio>>> = {}): Dominio[] {
  const base: [number, string, string, string][] = [
    [20, 'ACTIVO', 'false', 'Si el sistema envia correos.'],
    [21, 'CORREO', 'repositorio@uagrm.edu.bo', 'Correo remitente.'],
    [22, 'HOST', 'smtp.gmail.com', 'Servidor SMTP.'],
    [23, 'PASSWORD', '', 'Contraseña de la cuenta de correo.'],
    [24, 'PUERTO', '587', 'Puerto del servidor SMTP.'],
    [25, 'SEGURIDAD', 'STARTTLS', 'SSL, STARTTLS o NINGUNA.'],
  ];
  return base.map(([domainId, domainName, domainValue, description]) => ({
    domainId,
    domainGroup: 'SMTP_GROUP',
    domainName,
    domainValue,
    description,
    lastUser: 'sistema',
    lastTime: '2026-11-16T14:00:00Z',
    sistema: true,
    secreto: domainName === 'PASSWORD',
    configurado: domainName === 'PASSWORD' ? true : domainValue !== '',
    ...cambios[domainName],
  }));
}

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

/** Notificacion sin leer con enlace interno. */
export const NOTIFICACION: Notificacion = {
  idNotificacion: 5,
  tipo: 'BIENVENIDA',
  titulo: 'Bienvenido al Repositorio Digital',
  mensaje: 'Tu cuenta fue creada.',
  enlace: '/perfil/seguridad',
  leida: false,
  fechaCreacion: '2026-11-16T14:00:00Z',
  fechaLectura: null,
};
