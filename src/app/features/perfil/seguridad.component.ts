import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { mensajeDeError } from '../../core/http/error-message';
import { ActivarDosFactoresResponse } from '../../core/models/auth.models';

/**
 * Activacion opcional de 2FA desde el perfil, en dos pasos: /2fa/enable genera el secreto y
 * el QR; /2fa/confirm lo activa solo si el usuario demuestra que su app genera codigos validos.
 */
@Component({
  selector: 'app-seguridad',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="card">
      <h1>Seguridad de la cuenta</h1>

      @if (mensaje()) {
        <p class="alert alert-success" role="status">{{ mensaje() }}</p>
      }
      @if (error()) {
        <p class="alert alert-danger" role="alert">{{ error() }}</p>
      }

      <h2>Contraseña</h2>
      <p><a class="btn btn-outline" routerLink="/change-password">Cambiar contraseña</a></p>

      <h2>Verificación en dos pasos</h2>
      @if (auth.usuario()?.twoFactorEnabled) {
        <p>
          <span class="badge badge-success">Activada</span> Al iniciar sesión se te pedirá un código
          de Google Authenticator.
        </p>
        <form [formGroup]="form" (ngSubmit)="desactivar()" class="inline-form" novalidate>
          <label class="field">
            <span>Código actual para desactivar</span>
            <input
              class="input-codigo"
              formControlName="codigo"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="6"
            />
          </label>
          <button class="btn btn-danger" type="submit" [disabled]="cargando()">Desactivar</button>
        </form>
      } @else if (activacion(); as datos) {
        <ol class="steps">
          <li>Abre Google Authenticator (o una app compatible) y escanea este código QR.</li>
          <li>
            Si no puedes escanearlo, ingresa esta clave manualmente:
            <code class="secreto">{{ datos.secreto }}</code>
          </li>
          <li>Escribe el código de 6 dígitos que muestra la app para confirmar.</li>
        </ol>
        <img class="qr" [src]="datos.qrDataUri" alt="Código QR para Google Authenticator" />
        <form [formGroup]="form" (ngSubmit)="confirmar()" class="inline-form" novalidate>
          <label class="field">
            <span>Código de verificación</span>
            <input
              class="input-codigo"
              formControlName="codigo"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="6"
            />
          </label>
          <button class="btn btn-primary" type="submit" [disabled]="cargando()">Confirmar</button>
          <button class="btn btn-link" type="button" (click)="activacion.set(null)">
            Cancelar
          </button>
        </form>
      } @else {
        <p>
          <span class="badge">Desactivada</span> Agrega una segunda capa de protección: además de la
          contraseña se pedirá un código temporal de tu teléfono.
        </p>
        <button
          class="btn btn-primary"
          type="button"
          (click)="iniciarActivacion()"
          [disabled]="cargando()"
        >
          Activar verificación en dos pasos
        </button>
      }
    </section>
  `,
})
export class SeguridadComponent {
  protected readonly auth = inject(AuthService);

  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly mensaje = signal<string | null>(null);
  protected readonly activacion = signal<ActivarDosFactoresResponse | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    codigo: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });

  protected iniciarActivacion(): void {
    this.empezar();
    this.auth.activarDosFactores().subscribe({
      next: (datos) => {
        this.cargando.set(false);
        this.activacion.set(datos);
      },
      error: (err: unknown) => this.fallar(err),
    });
  }

  protected confirmar(): void {
    if (!this.codigoValido()) {
      return;
    }
    this.empezar();
    this.auth.confirmarDosFactores(this.form.getRawValue().codigo).subscribe({
      next: () => this.terminar('Verificación en dos pasos activada.'),
      error: (err: unknown) => this.fallar(err),
    });
  }

  protected desactivar(): void {
    if (!this.codigoValido()) {
      return;
    }
    this.empezar();
    this.auth.desactivarDosFactores(this.form.getRawValue().codigo).subscribe({
      next: () => this.terminar('Verificación en dos pasos desactivada.'),
      error: (err: unknown) => this.fallar(err),
    });
  }

  private codigoValido(): boolean {
    if (this.form.invalid) {
      this.error.set('El código tiene 6 dígitos.');
      return false;
    }
    return true;
  }

  private empezar(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.mensaje.set(null);
  }

  private terminar(mensaje: string): void {
    this.cargando.set(false);
    this.activacion.set(null);
    this.form.reset();
    this.mensaje.set(mensaje);
  }

  private fallar(err: unknown): void {
    this.cargando.set(false);
    this.form.reset();
    this.error.set(mensajeDeError(err));
  }
}
