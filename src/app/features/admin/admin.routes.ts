import { Routes } from '@angular/router';
import { roleGuard } from '../../core/auth/role.guard';

// Rutas del rol ADMIN. /admin ya exige authGuard + roleGuard('ADMIN') en app.routes.ts; se repite
// el roleGuard en cada modulo para que siga protegido aunque se mueva de lugar.
// Sprint 2: Catalogos, Usuarios, Padron estudiantil, Parametros del sistema (tabla de dominio) y
// Configuracion (por facultad y correo SMTP).
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('../inicio/inicio.component').then((m) => m.InicioComponent),
  },
  {
    path: 'catalogos',
    canActivate: [roleGuard('ADMIN')],
    title: 'Catálogos · Repositorio Digital',
    loadChildren: () => import('./catalogos/catalogos.routes').then((m) => m.routes),
  },
  {
    path: 'usuarios',
    canActivate: [roleGuard('ADMIN')],
    title: 'Usuarios · Repositorio Digital',
    loadComponent: () => import('./usuarios/usuarios.component').then((m) => m.UsuariosComponent),
  },
  {
    path: 'padron',
    canActivate: [roleGuard('ADMIN')],
    title: 'Padrón estudiantil · Repositorio Digital',
    loadComponent: () => import('./padron/padron.component').then((m) => m.PadronComponent),
  },
  {
    path: 'parametros',
    canActivate: [roleGuard('ADMIN')],
    title: 'Parámetros · Repositorio Digital',
    loadComponent: () =>
      import('./parametros/parametros.component').then((m) => m.ParametrosComponent),
  },
  {
    path: 'configuracion',
    canActivate: [roleGuard('ADMIN')],
    title: 'Configuración · Repositorio Digital',
    loadChildren: () => import('./configuracion/configuracion.routes').then((m) => m.routes),
  },
];
