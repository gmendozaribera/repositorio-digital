import type { CategoriaDocumento, FormatoCategoria, ReglasDocumentos } from '../api/work';

/** Categorias de documento (work-api.yaml) con su nombre para mostrar. */
export const CATEGORIAS: { valor: CategoriaDocumento; texto: string }[] = [
  { valor: 'DOCUMENTO', texto: 'Documento' },
  { valor: 'PRESENTACION', texto: 'Presentación' },
  { valor: 'CODIGO', texto: 'Código fuente' },
  { valor: 'VIDEO', texto: 'Video' },
  { valor: 'IMAGEN', texto: 'Imagen' },
];

export function textoCategoria(categoria: CategoriaDocumento | string): string {
  return CATEGORIAS.find((c) => c.valor === categoria)?.texto ?? categoria;
}

const MB = 1024 * 1024;

/** "850 KB", "12,4 MB"... */
export function tamanoLegible(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) {
    return '';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < MB) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / MB).toLocaleString('es-BO', { maximumFractionDigits: 1 })} MB`;
}

/** Extension en minusculas sin el punto ("informe.final.PDF" -> "pdf"), o "" si no tiene. */
export function extensionDe(nombre: string): string {
  const punto = nombre.lastIndexOf('.');
  return punto > 0 && punto < nombre.length - 1 ? nombre.slice(punto + 1).toLowerCase() : '';
}

/** Nombre sin la extension, para proponerlo como titulo del documento. */
export function nombreSinExtension(nombre: string): string {
  const punto = nombre.lastIndexOf('.');
  return punto > 0 ? nombre.slice(0, punto) : nombre;
}

/** Formato de una categoria segun las reglas vigentes de la facultad. */
export function formatoDe(
  reglas: ReglasDocumentos | null,
  categoria: CategoriaDocumento | null,
): FormatoCategoria | null {
  return reglas?.formatos.find((f) => f.categoria === categoria) ?? null;
}

/**
 * Primera categoria que acepta la extension del archivo (el orden de las reglas decide: un PDF
 * queda como DOCUMENTO aunque PRESENTACION tambien lo acepte). null si ninguna lo acepta.
 */
export function categoriaSugerida(
  reglas: ReglasDocumentos | null,
  nombreArchivo: string,
): CategoriaDocumento | null {
  const ext = extensionDe(nombreArchivo);
  return reglas?.formatos.find((f) => f.extensiones.includes(ext))?.categoria ?? null;
}

/**
 * Valida un archivo contra las reglas de su categoria ANTES de subirlo (extension y tamano).
 * Devuelve el mensaje de error o null si es valido. El backend vuelve a validar todo, incluido el
 * tipo real del contenido: esto solo evita esperar una subida que seguro sera rechazada.
 */
export function validarArchivo(
  reglas: ReglasDocumentos | null,
  categoria: CategoriaDocumento | null,
  archivo: { name: string; size: number },
): string | null {
  if (!categoria) {
    return 'Elige la categoría del archivo.';
  }
  const formato = formatoDe(reglas, categoria);
  if (!formato) {
    return 'No se pudieron obtener las reglas de esta categoría.';
  }
  const ext = extensionDe(archivo.name);
  if (!formato.extensiones.includes(ext)) {
    return (
      `${textoCategoria(categoria)}: solo se aceptan archivos ` +
      formato.extensiones.map((e) => `.${e}`).join(', ') +
      '.'
    );
  }
  if (archivo.size === 0) {
    return 'El archivo está vacío.';
  }
  if (archivo.size > formato.tamanoMaxMB * MB) {
    return `Supera el tamaño máximo de ${formato.tamanoMaxMB} MB para ${textoCategoria(categoria).toLowerCase()}.`;
  }
  return null;
}

/**
 * Valida la URL de un enlace externo: solo https y un host permitido para la categoria
 * (p. ej. youtube.com o un subdominio como www.youtube.com). Devuelve el error o null.
 */
export function validarEnlace(
  reglas: ReglasDocumentos | null,
  categoria: CategoriaDocumento | null,
  url: string,
): string | null {
  const formato = formatoDe(reglas, categoria);
  if (!formato?.permiteEnlace) {
    return 'Esta categoría no admite enlaces.';
  }
  let destino: URL;
  try {
    destino = new URL(url.trim());
  } catch {
    return 'Ingresa una dirección completa, p. ej. https://github.com/usuario/proyecto.';
  }
  if (destino.protocol !== 'https:') {
    return 'El enlace debe empezar con https://.';
  }
  const host = destino.hostname.toLowerCase();
  const permitido = formato.hostsEnlace.some((h) => {
    const base = h.toLowerCase();
    return host === base || host.endsWith(`.${base}`);
  });
  return permitido ? null : `Solo se aceptan enlaces de ${formato.hostsEnlace.join(', ')}.`;
}

/** Solo se abren enlaces https (nunca javascript:, data:, etc. guardados en el backend). */
export function esEnlaceSeguro(url: string | null | undefined): url is string {
  if (!url) {
    return false;
  }
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Nombre del archivo segun la cabecera `Content-Disposition`. Acepta la forma RFC 5987
 * (`filename*=UTF-8''informe%20final.pdf`, que tiene prioridad) y la clasica
 * (`filename="informe.pdf"`). Se quitan rutas y caracteres no validos en un nombre de archivo.
 */
export function nombreDeContentDisposition(
  cabecera: string | null | undefined,
  porDefecto: string,
): string {
  if (!cabecera) {
    return porDefecto;
  }
  let nombre: string | null = null;
  const extendido = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(cabecera);
  if (extendido) {
    try {
      nombre = decodeURIComponent(extendido[2].trim().replace(/^"|"$/g, ''));
    } catch {
      nombre = null;
    }
  }
  if (!nombre) {
    const clasico = /filename\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^;]+))/i.exec(cabecera);
    nombre = clasico ? (clasico[1] ?? clasico[2]).replace(/\\(.)/g, '$1').trim() : null;
  }
  const limpio = (nombre ?? '')
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f<>:"|?*]/g, '_')
    .trim();
  return limpio || porDefecto;
}

/**
 * Entrega un Blob al navegador como descarga con el nombre indicado. Se usa porque la descarga
 * necesita el token (Bearer), que un enlace directo no enviaria: el archivo se pide con
 * HttpClient y se guarda desde memoria.
 */
export function guardarBlob(blob: Blob, nombre: string, doc: Document = document): void {
  const url = URL.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url;
  a.download = nombre;
  a.rel = 'noopener';
  a.style.display = 'none';
  doc.body.appendChild(a);
  a.click();
  a.remove();
  // Se libera despues: algunos navegadores leen la URL de forma asincrona tras el click.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
