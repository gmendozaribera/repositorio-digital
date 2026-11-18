import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { provideApi } from './core/api/api.providers';
import { jwtInterceptor } from './core/auth/jwt.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    // XHR (no fetch): es el unico backend de HttpClient que informa el progreso de SUBIDA, que se
    // usa en la barra de progreso de cada archivo de un trabajo (FetchBackend lanza NG02824).
    provideHttpClient(withXhr(), withInterceptors([jwtInterceptor])),
    provideApi(),
  ],
};
