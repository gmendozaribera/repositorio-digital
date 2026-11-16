import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import {
  aplicarErroresDelServidor,
  errorDelServidor,
  mensajeDeError,
} from '../../core/http/error-message';
import { crearEsperaPorIntentos } from '../../core/http/limite-intentos';
import { AYUDA_CI, MAX_CI, normalizarCi, validarCi } from '../../shared/documento-identidad';

/** El registro universitario sigue siendo un entero positivo en el contrato. */
const ENTERO_POSITIVO = /^[1-9]\d{0,9}$/;

/**
 * Auto-registro de estudiantes (CU-REG). El estudiante escribe su CI y su numero de registro; si
 * estan habilitados en el padron que importo el administrador, el backend crea la cuenta con
 * usuario = registro y la contraseña por defecto que entrego la facultad. No inicia sesion: el
 * primer login le pedira cambiar la contraseña (ese flujo ya existe en /change-password).
 */
@Component({
  selector: 'app-registro',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <main class="auth-page">
      <section class="card auth-card">
        <header class="auth-header">
          <h1>Crear cuenta de estudiante</h1>
          <p>Facultad de Ingeniería en Ciencias de la Computación y Telecomunicaciones</p>
        </header>

        @if (usuarioCreado(); as usuario) {
          <p class="alert alert-success" role="status">
            Cuenta creada. Tu usuario es <strong>{{ usuario }}</strong
            >. Inicia sesión con la contraseña entregada por tu facultad; se te pedirá cambiarla.
          </p>
          <a
            class="btn btn-primary btn-block"
            routerLink="/login"
            [queryParams]="{ usuario: usuario }"
            >Ir a iniciar sesión</a
          >
        } @else {
          <p class="muted">
            Ingresa tu carnet de identidad y tu número de registro universitario. Deben figurar en
            el padrón de tu facultad.
          </p>

          @if (espera.mensaje(); as aviso) {
            <p class="alert alert-warn" role="alert">{{ aviso }}</p>
          } @else if (error()) {
            <p class="alert alert-danger" role="alert">{{ error() }}</p>
          }

          <form [formGroup]="form" (ngSubmit)="registrar()" novalidate>
            <label class="field">
              <span>Carnet de identidad (CI)</span>
              <input
                formControlName="ci"
                autocomplete="off"
                autocapitalize="characters"
                spellcheck="false"
                [attr.maxlength]="maxCi"
                placeholder="1234567 o 1234567-1A"
                autofocus
              />
              @if (form.controls.ci.touched && form.controls.ci.invalid) {
                <small class="field-error">
                  {{ errorDelServidor(form.controls.ci) ?? 'Ingresa tu CI. ' + ayudaCi }}
                </small>
              }
            </label>

            <label class="field">
              <span>Número de registro</span>
              <input
                formControlName="registro"
                inputmode="numeric"
                autocomplete="off"
                maxlength="10"
              />
              @if (form.controls.registro.touched && form.controls.registro.invalid) {
                <small class="field-error">
                  {{
                    errorDelServidor(form.controls.registro) ??
                      'Ingresa tu número de registro (solo números).'
                  }}
                </small>
              }
            </label>

            <button
              class="btn btn-primary btn-block"
              type="submit"
              [disabled]="cargando() || espera.bloqueado()"
            >
              @if (espera.bloqueado()) {
                Reintentar en {{ espera.cuentaRegresiva() }}
              } @else {
                {{ cargando() ? 'Verificando…' : 'Crear cuenta' }}
              }
            </button>
          </form>
        }

        <p class="hint">¿Ya tienes cuenta? <a routerLink="/login">Inicia sesión</a></p>
      </section>
    </main>
  `,
})
export class RegistroComponent {
  private readonly auth = inject(AuthService);

  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Usuario de la cuenta creada; mientras es null se muestra el formulario. */
  protected readonly usuarioCreado = signal<string | null>(null);
  protected readonly errorDelServidor = errorDelServidor;
  protected readonly ayudaCi = AYUDA_CI;
  protected readonly maxCi = MAX_CI;
  /** 429 por demasiados intentos fallidos desde esta IP: bloquea el boton hasta Retry-After. */
  protected readonly espera = crearEsperaPorIntentos();

  protected readonly form = inject(NonNullableFormBuilder).group({
    ci: ['', [Validators.required, validarCi]],
    registro: ['', [Validators.required, Validators.pattern(ENTERO_POSITIVO)]],
  });

  protected registrar(): void {
    if (this.espera.bloqueado()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { ci, registro } = this.form.getRawValue();
    this.cargando.set(true);
    this.error.set(null);
    this.espera.limpiarAviso();

    // El CI se envia como lo guarda el backend: sin espacios y en MAYUSCULAS (1234567-1A).
    this.auth.registrar({ ci: normalizarCi(ci), registro: Number(registro) }).subscribe({
      next: (r) => {
        this.cargando.set(false);
        this.usuarioCreado.set(r.usuario);
      },
      error: (err: unknown) => {
        this.cargando.set(false);
        if (!this.espera.manejar(err)) {
          this.error.set(this.mensajeError(err));
        }
      },
    });
  }

  private mensajeError(err: unknown): string {
    if (err instanceof HttpErrorResponse && err.status === 409) {
      return (
        'Ya existe una cuenta para estos datos. Si olvidaste tu contraseña, contacta a tu ' +
        'facultad para que la restablezca.'
      );
    }
    if (err instanceof HttpErrorResponse && err.status === 400) {
      return aplicarErroresDelServidor(this.form, err, 'Revisa los datos ingresados.');
    }
    // 404: el detail del servidor ("No encontrado en el padrón institucional...").
    return mensajeDeError(err, 'No se pudo crear la cuenta.');
  }
}
