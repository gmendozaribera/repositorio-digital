import { Routes } from '@angular/router';
import { roleGuard } from '../../core/auth/role.guard';

// Rutas del rol ADMIN. /admin ya exige authGuard + roleGuard('ADMIN') en app.routes.ts; se repite
// el roleGuard en cada modulo para que siga protegido aunque se mueva de lugar.
// Sprint 2: Catalogos. Usuarios, padron y configuracion llegan despues.
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
];
