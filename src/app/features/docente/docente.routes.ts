import { Routes } from '@angular/router';

// Rutas del rol DOCENTE (/docente ya exige authGuard + roleGuard('DOCENTE')).
// Sprint 3: bandeja de revision. El detalle /trabajos/:id es compartido (app.routes.ts).
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('../inicio/inicio.component').then((m) => m.InicioComponent),
  },
  {
    path: 'revision',
    title: 'Bandeja de revisión · Repositorio Digital',
    loadComponent: () =>
      import('../revision/bandeja-revision.component').then((m) => m.BandejaRevisionComponent),
  },
];
