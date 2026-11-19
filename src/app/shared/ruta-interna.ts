/** Una sola "/" inicial (no "//" ni "/\") y ningun caracter de control ni "\" despues. */
const RUTA_INTERNA = /^\/(?![/\\])[^\u0000-\u001f\u007f\\]*$/;

/**
 * Solo acepta rutas internas de la aplicacion ("/algo"). Rechaza URLs absolutas
 * ("https://..."), protocol-relative ("//sitio.com") y su variante con barra invertida ("/\sitio.com"),
 * que el navegador trataria como otro dominio. Tambien rechaza caracteres de control y "\" en
 * cualquier posicion: el parser de URLs del navegador borra tabuladores y saltos de linea, asi
 * "/\t/sitio.com" terminaria siendo "//sitio.com". Evita que un enlace guardado en el backend
 * (p. ej. el de una notificacion) o el returnUrl del login lleven al usuario a un sitio externo.
 */
export function esRutaInterna(ruta: string | null | undefined): ruta is string {
  return !!ruta && RUTA_INTERNA.test(ruta);
}
