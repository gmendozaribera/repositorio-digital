/**
 * Datos sembrados por el perfil `demo` del backend (db/demo). Si el seed cambia, solo se toca aqui.
 * La contrasena comun de los usuarios demo sale de la config (expose PASSWORD_DEMO en cypress.config.ts).
 */
export const DEMO = {
  facultad: 'FICCT',
  materia: 'INF412',
  semestre: '2-2026',
  /** Nombre del grupo INF412-SA tal como aparece en el <select> ("Grupo SA"). */
  grupo: /SA\s*$/,
  tipoTrabajo: 'Proyecto de materia',
  usuarios: {
    /** DOCENTE, Admin de Curso de INF412-SA e INF312-SA: puede calificar. */
    maria: 'doc.maria',
    /** DOCENTE de INF412-SA sin rol de Admin de Curso: revisa pero no califica. */
    jose: 'doc.jose',
    /** ESTUDIANTE Juan Perez Lopez. */
    juan: '219000001',
    /** ESTUDIANTE Ana Gutierrez Rios. */
    ana: '219000002',
  },
  /** Fila del padron SIN cuenta: dato consumible del auto-registro (CU-REG). */
  padronSinCuenta: { registro: '219000003', ci: '7000003', passwordDefault: 'Uagrm2026' },
} as const;

export function passwordDemo(): string {
  return Cypress.expose('PASSWORD_DEMO') as string;
}

export function admin(): { usuario: string; password: string } {
  return {
    usuario: Cypress.expose('ADMIN_USUARIO') as string,
    password: Cypress.expose('ADMIN_PASSWORD') as string,
  };
}
