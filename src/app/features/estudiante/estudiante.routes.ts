import { Routes } from '@angular/router';

// Rutas del rol ESTUDIANTE (/estudiante ya exige authGuard + roleGuard('ESTUDIANTE')).
// Sprint 3: Mis trabajos y su formulario. El detalle /trabajos/:id es compartido con docente y
// admin (app.routes.ts).
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('../inicio/inicio.component').then((m) => m.InicioComponent),
  },
  {
    path: 'trabajos',
    title: 'Mis trabajos · Repositorio Digital',
    loadComponent: () =>
      import('./trabajos/mis-trabajos.component').then((m) => m.MisTrabajosComponent),
  },
  {
    path: 'trabajos/nuevo',
    title: 'Nuevo trabajo · Repositorio Digital',
    loadComponent: () =>
      import('./trabajos/trabajo-form.component').then((m) => m.TrabajoFormComponent),
  },
  {
    path: 'trabajos/:id/editar',
    title: 'Editar trabajo · Repositorio Digital',
    loadComponent: () =>
      import('./trabajos/trabajo-form.component').then((m) => m.TrabajoFormComponent),
  },
];
