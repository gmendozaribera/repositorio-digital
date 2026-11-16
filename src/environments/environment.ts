// Produccion: el frontend y la API se sirven detras del mismo Nginx (API Gateway),
// por eso la URL es relativa y no hace falta CORS. Nginx reparte /api/v1/* entre los servicios.
export const environment = {
  production: true,
  /** Origen de la API para el cliente generado (las rutas del contrato ya traen /api/v1). */
  apiRoot: '',
  apiUrl: '/api/v1',
};
