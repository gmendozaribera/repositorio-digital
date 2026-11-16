import { Routes } from '@angular/router';
import { CatalogosComponent } from './catalogos.component';

const titulo = (t: string) => `${t} · Catálogos · Repositorio Digital`;

/** /admin/catalogos/* (el roleGuard('ADMIN') ya esta en /admin). */
export const routes: Routes = [
  {
    path: '',
    component: CatalogosComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'facultades' },
      {
        path: 'facultades',
        title: titulo('Facultades'),
        loadComponent: () => import('./facultades.component').then((m) => m.FacultadesComponent),
      },
      {
        path: 'carreras',
        title: titulo('Carreras'),
        loadComponent: () =>
          import('./carreras-materias.component').then((m) => m.CarrerasComponent),
      },
      {
        path: 'materias',
        title: titulo('Materias'),
        loadComponent: () =>
          import('./carreras-materias.component').then((m) => m.MateriasComponent),
      },
      {
        path: 'semestres',
        title: titulo('Semestres'),
        loadComponent: () => import('./semestres.component').then((m) => m.SemestresComponent),
      },
      {
        path: 'grupos',
        title: titulo('Grupos'),
        loadComponent: () => import('./grupos.component').then((m) => m.GruposComponent),
      },
      {
        path: 'fases',
        title: titulo('Fases'),
        loadComponent: () => import('./fases.component').then((m) => m.FasesComponent),
      },
      {
        path: 'tipos-trabajo',
        title: titulo('Tipos de trabajo'),
        loadComponent: () =>
          import('./tipos-trabajo.component').then((m) => m.TiposTrabajoComponent),
      },
    ],
  },
];
