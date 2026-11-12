import { Routes } from '@angular/router';

// Sprint 1: solo el dashboard inicial. Los modulos del rol se agregan aqui en los sprints siguientes.
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('../inicio/inicio.component').then((m) => m.InicioComponent),
  },
];
