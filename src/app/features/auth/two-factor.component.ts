import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { mensajeDeError } from '../../core/http/error-message';

@Component({
  selector: 'app-two-factor',
  imports: [ReactiveFormsModule],
  template: `
    <main class="auth-page">
      <section class="card auth-card">
        <header class="auth-header">
          <h1>Verificación en dos pasos</h1>
          <p>
            Ingresa el código de 6 dígitos que muestra Google Authenticator para
            <strong>{{ auth.dosFactoresPendiente()?.usuario }}</strong
            >.
          </p>
        </header>

        @if (error()) {
          <p class="alert alert-danger" role="alert">{{ error() }}</p>
        }

        <form [formGroup]="form" (ngSubmit)="verificar()" novalidate>
          <label class="field">
            <span>Código de verificación</span>
            <input
              class="input-codigo"
              formControlName="codigo"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="6"
              placeholder="000000"
              autofocus
            />
            @if (form.controls.codigo.touched && form.controls.codigo.invalid) {
              <small class="field-error">El código tiene 6 dígitos.</small>
            }
          </label>

          <button class="btn btn-primary btn-block" type="submit" [disabled]="cargando()">
            {{ cargando() ? 'Verificando…' : 'Verificar' }}
          </button>
          <button class="btn btn-link btn-block" type="button" (click)="volver()">
            Volver al inicio de sesión
          </button>
        </form>
        <p class="hint">El código cambia cada 30 segundos. Tienes 5 minutos y 5 intentos.</p>
      </section>
    </main>
  `,
})
export class TwoFactorComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    codigo: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });

  ngOnInit(): void {
    // El token temporal vive solo en memoria: tras recargar la pagina hay que empezar de nuevo.
    if (!this.auth.dosFactoresPendiente()) {
      void this.router.navigate(['/login']);
    }
  }

  protected verificar(): void {
    if (!this.auth.dosFactoresPendiente()) {
      this.volver();
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.cargando.set(true);
    this.error.set(null);

    this.auth.verificarDosFactores(this.form.getRawValue().codigo).subscribe({
      next: () => {
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        void this.router.navigateByUrl(this.auth.destinoTrasLogin(returnUrl));
      },
      error: (err: unknown) => {
        this.cargando.set(false);
        this.form.reset();
        if (err instanceof HttpErrorResponse && err.status === 429) {
          // Demasiados intentos: el backend anulo el token temporal.
          this.auth.cancelarDosFactores();
          this.form.disable();
          this.error.set('Demasiados intentos fallidos. Vuelve a iniciar sesión.');
          return;
        }
        this.error.set(mensajeDeError(err, 'Código incorrecto.'));
      },
    });
  }

  protected volver(): void {
    this.auth.cancelarDosFactores();
    void this.router.navigate(['/login']);
  }
}
