import type {
  Acciones,
  Documento,
  ReglasDocumentos,
  Trabajo,
  TrabajoPublico,
  TrabajoResumen,
} from '../../api/work';

/** Datos de prueba de work-service (solo para los .spec.ts). */

export const SIN_ACCIONES: Acciones = {
  editar: false,
  enviar: false,
  eliminar: false,
  revisar: false,
  aprobar: false,
  rechazar: false,
};

/** Lo que ve el autor de un BORRADOR. */
export const ACCIONES_AUTOR_BORRADOR: Acciones = {
  ...SIN_ACCIONES,
  editar: true,
  enviar: true,
  eliminar: true,
};

/** Lo que ve un docente del grupo con el trabajo PENDIENTE. */
export const ACCIONES_DOCENTE_PENDIENTE: Acciones = {
  ...SIN_ACCIONES,
  revisar: true,
  aprobar: true,
  rechazar: true,
};

export const DOCUMENTO_PDF: Documento = {
  idDocumento: 41,
  titulo: 'Informe final',
  descripcion: null,
  tipo: 'ARCHIVO',
  categoria: 'DOCUMENTO',
  idFase: 2,
  nombreFase: 'Final',
  nombreArchivo: 'informe-final.pdf',
  extension: 'pdf',
  tamanoBytes: 1_048_576,
  urlExterno: null,
  fechaSubida: '2026-11-16T14:00:00Z',
};

export const ENLACE_GITHUB: Documento = {
  idDocumento: 42,
  titulo: 'Repositorio del proyecto',
  descripcion: null,
  tipo: 'ENLACE',
  categoria: 'CODIGO',
  idFase: 2,
  nombreFase: 'Final',
  nombreArchivo: null,
  extension: null,
  tamanoBytes: null,
  urlExterno: 'https://github.com/usuario/proyecto',
  fechaSubida: '2026-11-16T15:00:00Z',
};

export const FASES = [
  { idFase: 1, nombre: 'Perfil', descripcion: 'Propuesta inicial', idFacultad: 1, estado: 1 },
  { idFase: 2, nombre: 'Final', descripcion: null, idFacultad: 1, estado: 1 },
  { idFase: 3, nombre: 'Antigua', descripcion: null, idFacultad: 1, estado: 0 },
];

export function trabajoDePrueba(cambios: Partial<Trabajo> = {}): Trabajo {
  return {
    idTrabajo: 7,
    titulo: 'Sistema de inventarios',
    resumen: 'El trabajo presenta el análisis y diseño de un sistema de inventarios.',
    estado: 'BORRADOR',
    observaciones: null,
    idGrupo: 3,
    grupo: 'SA',
    idMateria: 10,
    siglaMateria: 'INF412',
    nombreMateria: 'Ingeniería de Software I',
    idSemestre: 5,
    periodo: '2-2026',
    idFacultad: 1,
    idTipoTrabajo: 4,
    tipoTrabajo: 'Proyecto de materia',
    autores: [
      {
        idPersona: 1,
        nombre: 'Juan',
        apellidos: 'Perez',
        registro: 219012345,
        esUsuarioActual: true,
      },
      {
        idPersona: 2,
        nombre: 'Ana',
        apellidos: 'Rojas',
        registro: 219012346,
        esUsuarioActual: false,
      },
    ],
    hashtags: ['springboot'],
    documentos: [],
    historial: [
      {
        estadoAnterior: null,
        estadoNuevo: 'BORRADOR',
        usuario: 'Juan Perez',
        comentario: null,
        fecha: '2026-11-16T13:00:00Z',
      },
    ],
    acciones: ACCIONES_AUTOR_BORRADOR,
    fechaCreacion: '2026-11-16T13:00:00Z',
    fechaActualizacion: '2026-11-16T13:00:00Z',
    fechaEnvio: null,
    ...cambios,
  };
}

export function resumenDePrueba(cambios: Partial<TrabajoResumen> = {}): TrabajoResumen {
  return {
    idTrabajo: 7,
    titulo: 'Sistema de inventarios',
    estado: 'PENDIENTE',
    idGrupo: 3,
    grupo: 'SA',
    idMateria: 10,
    siglaMateria: 'INF412',
    nombreMateria: 'Ingeniería de Software I',
    idSemestre: 5,
    periodo: '2-2026',
    tipoTrabajo: 'Proyecto de materia',
    autores: ['Juan Perez'],
    fechaActualizacion: '2026-11-16T13:00:00Z',
    fechaEnvio: '2026-11-16T14:00:00Z',
    ...cambios,
  };
}

/** Ficha publica de un trabajo EVALUADO (GET /repositorio/{id}). */
export function publicoDePrueba(cambios: Partial<TrabajoPublico> = {}): TrabajoPublico {
  const t = trabajoDePrueba();
  return {
    idTrabajo: t.idTrabajo,
    titulo: t.titulo,
    resumen: t.resumen,
    idGrupo: t.idGrupo,
    grupo: t.grupo,
    idMateria: t.idMateria,
    siglaMateria: t.siglaMateria,
    nombreMateria: t.nombreMateria,
    idSemestre: t.idSemestre,
    periodo: t.periodo,
    idFacultad: t.idFacultad,
    idTipoTrabajo: t.idTipoTrabajo,
    tipoTrabajo: t.tipoTrabajo,
    autores: t.autores,
    hashtags: ['springboot', 'inventarios'],
    documentos: [],
    fechaPublicacion: '2026-11-20T10:00:00Z',
    ...cambios,
  };
}

export const REGLAS: ReglasDocumentos = {
  idFacultad: 1,
  subidasPorMinuto: 10,
  maxAutores: 5,
  formatos: [
    {
      categoria: 'DOCUMENTO',
      extensiones: ['pdf', 'docx', 'odt'],
      permiteEnlace: false,
      hostsEnlace: [],
      tamanoMaxMB: 10,
    },
    {
      categoria: 'PRESENTACION',
      extensiones: ['pptx', 'pdf'],
      permiteEnlace: false,
      hostsEnlace: [],
      tamanoMaxMB: 10,
    },
    {
      categoria: 'CODIGO',
      extensiones: ['zip', 'rar', '7z'],
      permiteEnlace: true,
      hostsEnlace: ['github.com', 'gitlab.com'],
      tamanoMaxMB: 10,
    },
    {
      categoria: 'VIDEO',
      extensiones: ['mp4', 'webm'],
      permiteEnlace: true,
      hostsEnlace: ['youtube.com', 'youtu.be', 'vimeo.com', 'drive.google.com'],
      tamanoMaxMB: 100,
    },
    {
      categoria: 'IMAGEN',
      extensiones: ['png', 'jpg', 'jpeg', 'svg'],
      permiteEnlace: false,
      hostsEnlace: [],
      tamanoMaxMB: 10,
    },
  ],
};

/** File de `megas` MB sin reservar esa memoria (solo se lee `size`). */
export function archivoDePrueba(nombre: string, megas = 0.01, tipo = ''): File {
  const archivo = new File(['x'], nombre, { type: tipo });
  Object.defineProperty(archivo, 'size', { value: Math.round(megas * 1024 * 1024) });
  return archivo;
}
