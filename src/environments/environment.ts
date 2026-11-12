// Produccion: el frontend y la API se sirven detras del mismo Nginx (API Gateway),
// por eso la URL es relativa y no hace falta CORS.
export const environment = {
  production: true,
  apiUrl: '/api/v1',
};
