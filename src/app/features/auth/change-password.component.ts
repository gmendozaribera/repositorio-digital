import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { mensajeDeError } from '../../core/http/error-message';

/** Misma politica que CambioPasswordRequest del backend. */
export const PATRON_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

function passwordsValidas(grupo: AbstractControl): ValidationErrors | null {
  const { passwordActual, passwordNueva, confirmacion } = grupo.getRawValue() as Record<
    string,
    string
  >;
  const errores: ValidationErrors = {};
  if (confirmacion && passwordNueva !== confirmacion) {
    errores['noCoincide'] = true;
  }
  if (passwordNueva && passwordNueva === passwordActual) {
    errores['igualALaActual'] = true;
  }
  return Object.keys(errores).length ? errores : null;
}

@Component({
  selector: 'app-change-password',
  imports: [ReactiveFormsModule],
  template: `
    <main class="auth-page">
      <section class="card auth-card">
        <header class="auth-header">
          <h1>Cambiar contraseña</h1>
          @if (obligatorio) {
            <p>Por seguridad debes reemplazar tu contraseña temporal antes de continuar.</p>
          }
        </header>

        @if (error()) {
          <p class="alert alert-danger" role="alert">{{ error() }}</p>
        }

        <form [formGroup]="form" (ngSubmit)="guardar()" novalidate>
          <label class="field">
            <span>Contraseña actual</span>
            <input
              formControlName="passwordActual"
              type="password"
              autocomplete="current-password"
            />
            @if (form.controls.passwordActual.touched && form.controls.passwordActual.invalid) {
              <small class="field-error">Ingresa tu contraseña actual.</small>
            }
          </label>

          <label class="field">
            <span>Nueva contraseña</span>
            <input
              formControlName="passwordNueva"
              type="password"
              autocomplete="new-password"
              maxlength="72"
            />
            @if (form.controls.passwordNueva.touched && form.controls.passwordNueva.invalid) {
              <small class="field-error">
                Entre 8 y 72 caracteres, con al menos una mayúscula, una minúscula y un número.
              </small>
            } @else if (form.controls.passwordNueva.touched && form.hasError('igualALaActual')) {
              <small class="field-error">Debe ser distinta de la contraseña actual.</small>
            }
          </label>

          <label class="field">
            <span>Confirmar nueva contraseña</span>
            <input formControlName="confirmacion" type="password" autocomplete="new-password" />
            @if (form.controls.confirmacion.touched && form.hasError('noCoincide')) {
              <small class="field-error">Las contraseñas no coinciden.</small>
            }
          </label>

          <button class="btn btn-primary btn-block" type="submit" [disabled]="cargando()">
            {{ cargando() ? 'Guardando…' : 'Guardar contraseña' }}
          </button>
          <button class="btn btn-link btn-block" type="button" (click)="salir()">
            {{ obligatorio ? 'Cerrar sesión' : 'Cancelar' }}
          </button>
        </form>
      </section>
    </main>
  `,
})
export class ChangePasswordComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly obligatorio = this.auth.usuario()?.requiereCambioPassword ?? false;
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group(
    {
      passwordActual: ['', Validators.required],
      passwordNueva: [
        '',
        [
          Validators.required,
          Validators.minLength(8),
          Validators.maxLength(72),
          Validators.pattern(PATRON_PASSWORD),
        ],
      ],
      confirmacion: ['', Validators.required],
    },
    { validators: passwordsValidas },
  );

  protected guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.cargando.set(true);
    this.error.set(null);

    const { passwordActual, passwordNueva } = this.form.getRawValue();
    this.auth.cambiarPassword({ passwordActual, passwordNueva }).subscribe({
      next: () => void this.router.navigateByUrl(this.auth.rutaInicio()),
      error: (err: unknown) => {
        this.cargando.set(false);
        this.error.set(mensajeDeError(err, 'No se pudo cambiar la contraseña.'));
      },
    });
  }

  protected salir(): void {
    if (this.obligatorio) {
      this.auth.logout();
    } else {
      void this.router.navigateByUrl(this.auth.rutaInicio());
    }
  }
}
