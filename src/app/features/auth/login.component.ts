import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { mensajeDeError } from '../../core/http/error-message';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  template: `
    <main class="auth-page">
      <section class="card auth-card">
        <header class="auth-header">
          <h1>Repositorio Digital</h1>
          <p>Facultad de Ingeniería en Ciencias de la Computación y Telecomunicaciones</p>
        </header>

        @if (sesionExpirada) {
          <p class="alert alert-warn" role="status">Tu sesión expiró. Inicia sesión nuevamente.</p>
        }
        @if (error()) {
          <p class="alert alert-danger" role="alert">{{ error() }}</p>
        }

        <form [formGroup]="form" (ngSubmit)="ingresar()" novalidate>
          <label class="field">
            <span>Usuario</span>
            <input formControlName="usuario" autocomplete="username" maxlength="50" autofocus />
            @if (form.controls.usuario.touched && form.controls.usuario.invalid) {
              <small class="field-error">Ingresa tu usuario.</small>
            }
          </label>

          <label class="field">
            <span>Contraseña</span>
            <input
              formControlName="password"
              type="password"
              autocomplete="current-password"
              maxlength="100"
            />
            @if (form.controls.password.touched && form.controls.password.invalid) {
              <small class="field-error">Ingresa tu contraseña.</small>
            }
          </label>

          <button class="btn btn-primary btn-block" type="submit" [disabled]="cargando()">
            {{ cargando() ? 'Ingresando…' : 'Iniciar sesión' }}
          </button>
        </form>
      </section>
    </main>
  `,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly sesionExpirada = this.route.snapshot.queryParamMap.has('expirada');

  protected readonly form = inject(NonNullableFormBuilder).group({
    usuario: ['', [Validators.required, Validators.maxLength(50)]],
    password: ['', [Validators.required, Validators.maxLength(100)]],
  });

  protected ingresar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.cargando.set(true);
    this.error.set(null);

    this.auth.login(this.form.getRawValue()).subscribe({
      next: (respuesta) => {
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        if (respuesta.requiereDosFactores) {
          void this.router.navigate(['/2fa'], { queryParams: returnUrl ? { returnUrl } : {} });
        } else {
          void this.router.navigateByUrl(this.auth.destinoTrasLogin(returnUrl));
        }
      },
      error: (err: unknown) => {
        this.cargando.set(false);
        this.form.controls.password.reset();
        this.error.set(mensajeDeError(err, 'No se pudo iniciar sesión.'));
      },
    });
  }
}
