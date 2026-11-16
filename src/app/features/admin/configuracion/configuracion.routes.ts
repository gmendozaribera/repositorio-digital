import { Routes } from '@angular/router';
import { ConfiguracionComponent } from './configuracion.component';

const titulo = (t: string) => `${t} · Configuración · Repositorio Digital`;

/** /admin/configuracion/* (el roleGuard('ADMIN') ya esta en /admin y en admin.routes.ts). */
export const routes: Routes = [
  {
    path: '',
    component: ConfiguracionComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'facultad' },
      {
        path: 'facultad',
        title: titulo('Facultad'),
        loadComponent: () =>
          import('./config-facultad.component').then((m) => m.ConfigFacultadComponent),
      },
      {
        path: 'correo',
        title: titulo('Correo'),
        loadComponent: () => import('./config-smtp.component').then((m) => m.ConfigSmtpComponent),
      },
    ],
  },
];
