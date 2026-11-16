/**
 * Solo acepta rutas internas de la aplicacion ("/algo"). Rechaza URLs absolutas
 * ("https://..."), protocol-relative ("//sitio.com") y su variante con barra invertida ("/\sitio.com"),
 * que el navegador trataria como otro dominio. Evita que un enlace guardado en el backend
 * (p. ej. el de una notificacion) lleve al usuario a un sitio externo.
 */
export function esRutaInterna(ruta: string | null | undefined): ruta is string {
  return !!ruta && ruta.startsWith('/') && !ruta.startsWith('//') && !ruta.startsWith('/\\');
}
