import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ApiConfiguration as AuthApiConfiguration } from '../../api/auth/api-configuration';
import { ApiConfiguration as CatalogApiConfiguration } from '../../api/catalog/api-configuration';

/**
 * Configura los clientes generados con ng-openapi-gen (src/app/api/<servicio>).
 * Cada cliente trae por defecto el `servers` del YAML (http://localhost:808x); aqui se reemplaza
 * por environment.apiRoot para que todas las llamadas pasen por el mismo origen (proxy / Nginx) y
 * el jwtInterceptor les agregue el token.
 */
export function provideApi(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: AuthApiConfiguration, useValue: { rootUrl: environment.apiRoot } },
    { provide: CatalogApiConfiguration, useValue: { rootUrl: environment.apiRoot } },
  ]);
}
