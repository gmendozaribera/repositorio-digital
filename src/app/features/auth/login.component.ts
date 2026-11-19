import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { mensajeDeError } from '../../core/http/error-message';
import { crearEsperaPorIntentos } from '../../core/http/limite-intentos';
import { RepositorioPublicoService } from '../../core/services/repositorio-publico.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
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
        @if (espera.mensaje(); as aviso) {
          <p class="alert alert-warn" role="alert">{{ aviso }}</p>
        } @else if (error()) {
          <p class="alert alert-danger" role="alert" data-cy="login-error">{{ error() }}</p>
        }

        <form [formGroup]="form" (ngSubmit)="ingresar()" novalidate>
          <label class="field">
            <span>Usuario</span>
            <input
              formControlName="usuario"
              data-cy="login-usuario"
              autocomplete="username"
              maxlength="50"
              autofocus
            />
            @if (form.controls.usuario.touched && form.controls.usuario.invalid) {
              <small class="field-error">Ingresa tu usuario.</small>
            }
          </label>

          <label class="field">
            <span>Contraseña</span>
            <input
              formControlName="password"
              data-cy="login-password"
              type="password"
              autocomplete="current-password"
              maxlength="100"
            />
            @if (form.controls.password.touched && form.controls.password.invalid) {
              <small class="field-error">Ingresa tu contraseña.</small>
            }
          </label>

          <button
            class="btn btn-primary btn-block"
            type="submit"
            data-cy="login-submit"
            [disabled]="cargando() || espera.bloqueado()"
          >
            @if (espera.bloqueado()) {
              Reintentar en {{ espera.cuentaRegresiva() }}
            } @else {
              {{ cargando() ? 'Ingresando…' : 'Iniciar sesión' }}
            }
          </button>
        </form>

        <p class="hint">
          ¿Eres estudiante y no tienes cuenta?
          <a routerLink="/registro">Regístrate</a>
        </p>
        @if (explorarHabilitado()) {
          <p class="hint">
            <a routerLink="/explorar">Explorar el repositorio sin iniciar sesión</a>
          </p>
        }
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
  /** 429 por demasiados intentos fallidos desde esta IP: bloquea el boton hasta Retry-After. */
  protected readonly espera = crearEsperaPorIntentos();
  /** El enlace al repositorio publico solo aparece si alguna facultad habilito el acceso externo. */
  protected readonly explorarHabilitado = signal(false);

  constructor() {
    inject(RepositorioPublicoService)
      .estado()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (e) => this.explorarHabilitado.set(e.habilitado),
        // Si no se pudo consultar, simplemente no se ofrece el enlace.
        error: () => this.explorarHabilitado.set(false),
      });
  }

  protected readonly form = inject(NonNullableFormBuilder).group({
    // /registro redirige aqui con ?usuario=<registro> para que el estudiante solo escriba su contraseña.
    usuario: [
      this.route.snapshot.queryParamMap.get('usuario') ?? '',
      [Validators.required, Validators.maxLength(50)],
    ],
    password: ['', [Validators.required, Validators.maxLength(100)]],
  });

  protected ingresar(): void {
    if (this.espera.bloqueado()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.cargando.set(true);
    this.error.set(null);
    this.espera.limpiarAviso();

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
        if (!this.espera.manejar(err)) {
          this.error.set(mensajeDeError(err, 'No se pudo iniciar sesión.'));
        }
      },
    });
  }
}
