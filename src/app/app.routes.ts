import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';
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
      // "/" lleva al dashboard del rol (o al login si no hay sesion).
      { path: '', pathMatch: 'full', redirectTo: () => inject(AuthService).rutaInicio() },
    ],
  },
  { path: '**', redirectTo: () => inject(AuthService).rutaInicio() },
];
