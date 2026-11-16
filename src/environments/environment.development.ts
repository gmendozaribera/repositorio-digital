// Desarrollo (ng serve): misma URL relativa que en produccion. proxy.conf.json reenvia
// /api/v1/auth -> auth-service :8081 y el resto de /api/v1 -> catalog-service :8082,
// asi el navegador ve un solo origen (sin CORS) y el Bearer llega a todos los servicios.
export const environment = {
  production: false,
  /** Origen de la API para el cliente generado (las rutas del contrato ya traen /api/v1). */
  apiRoot: '',
  apiUrl: '/api/v1',
};
