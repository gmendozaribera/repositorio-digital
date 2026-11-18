import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { authGuard, guestGuard, visitanteGuard } from './core/auth/auth.guard';
import { AuthService } from './core/auth/auth.service';
import { roleGuard } from './core/auth/role.guard';
import { ShellComponent } from './layout/shell.component';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'Iniciar sesión · Repositorio Digital',
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'registro',
    canActivate: [guestGuard],
    title: 'Crear cuenta de estudiante · Repositorio Digital',
    loadComponent: () =>
      import('./features/auth/registro.component').then((m) => m.RegistroComponent),
  },
  {
    path: '2fa',
    canActivate: [guestGuard],
    title: 'Verificación en dos pasos · Repositorio Digital',
    loadComponent: () =>
      import('./features/auth/two-factor.component').then((m) => m.TwoFactorComponent),
  },
  {
    path: 'change-password',
    canActivate: [authGuard],
    title: 'Cambiar contraseña · Repositorio Digital',
    loadComponent: () =>
      import('./features/auth/change-password.component').then((m) => m.ChangePasswordComponent),
  },
  {
    // Repositorio publico sin login (/explorar, /explorar/:id). Con sesion redirige a /repositorio.
    path: 'explorar',
    canActivate: [visitanteGuard],
    loadChildren: () => import('./features/repositorio/explorar.routes').then((m) => m.routes),
  },
  {
    path: '',
    component: ShellComponent,
    canActivateChild: [authGuard],
    children: [
      {
        path: 'admin',
        canActivate: [roleGuard('ADMIN')],
        title: 'Administración · Repositorio Digital',
        loadChildren: () => import('./features/admin/admin.routes').then((m) => m.routes),
      },
      {
        path: 'docente',
        canActivate: [roleGuard('DOCENTE')],
        title: 'Docente · Repositorio Digital',
        loadChildren: () => import('./features/docente/docente.routes').then((m) => m.routes),
      },
      {
        path: 'estudiante',
        canActivate: [roleGuard('ESTUDIANTE')],
        title: 'Estudiante · Repositorio Digital',
        loadChildren: () => import('./features/estudiante/estudiante.routes').then((m) => m.routes),
      },
      {
        path: 'perfil/seguridad',
        title: 'Seguridad · Repositorio Digital',
        loadComponent: () =>
          import('./features/perfil/seguridad.component').then((m) => m.SeguridadComponent),
      },
      {
        // Detalle de un trabajo: estudiante (autor), docente del grupo o admin. Es el enlace de
        // las notificaciones de trabajos. Quien no puede verlo recibe 404 del backend.
        path: 'trabajos/:id',
        title: 'Trabajo · Repositorio Digital',
        loadComponent: () =>
          import('./features/trabajos/trabajo-detalle.component').then(
            (m) => m.TrabajoDetalleComponent,
          ),
      },
      {
        // Repositorio de trabajos evaluados (CU11 basico): cualquier rol autenticado.
        path: 'repositorio',
        title: 'Repositorio de trabajos · Repositorio Digital',
        loadComponent: () =>
          import('./features/repositorio/repositorio.component').then(
            (m) => m.RepositorioComponent,
          ),
      },
      {
        // Ficha publica (solo EVALUADO; 404 en otro caso).
        path: 'repositorio/:id',
        title: 'Trabajo publicado · Repositorio Digital',
        loadComponent: () =>
          import('./features/repositorio/ficha-publica.component').then(
            (m) => m.FichaPublicaComponent,
          ),
      },
      {
        path: 'notificaciones',
        title: 'Notificaciones · Repositorio Digital',
        loadComponent: () =>
          import('./features/notificaciones/notificaciones.component').then(
            (m) => m.NotificacionesComponent,
          ),
      },
      // "/" lleva al dashboard del rol (o al login si no hay sesion).
      { path: '', pathMatch: 'full', redirectTo: () => inject(AuthService).rutaInicio() },
    ],
  },
  { path: '**', redirectTo: () => inject(AuthService).rutaInicio() },
];
