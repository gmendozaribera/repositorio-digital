import { Routes } from '@angular/router';
import { visitanteGuard } from '../../core/auth/auth.guard';
import { ExplorarComponent } from './explorar.component';
import { FUENTE_REPOSITORIO, fuentePublica } from './fuente-repositorio';

/**
 * Repositorio publico (`/explorar`, sin login): el mismo buscador y la misma ficha que
 * `/repositorio`, pero con la fuente publica (endpoints anonimos `/publico/**`). Con sesion,
 * visitanteGuard redirige al equivalente autenticado.
 */
export const routes: Routes = [
  {
    path: '',
    component: ExplorarComponent,
    canActivateChild: [visitanteGuard],
    providers: [{ provide: FUENTE_REPOSITORIO, useFactory: fuentePublica }],
    children: [
      {
        path: '',
        title: 'Explorar el repositorio · Repositorio Digital',
        loadComponent: () => import('./repositorio.component').then((m) => m.RepositorioComponent),
      },
      {
        path: ':id',
        title: 'Trabajo publicado · Repositorio Digital',
        loadComponent: () =>
          import('./ficha-publica.component').then((m) => m.FichaPublicaComponent),
      },
    ],
  },
];
