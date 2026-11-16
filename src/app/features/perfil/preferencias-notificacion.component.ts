import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { mensajeDeError } from '../../core/http/error-message';
import { NotificacionService } from '../../core/services/notificacion.service';

/** Preferencia "Recibir también por correo" (GET/PUT /perfil/preferencias). */
@Component({
  selector: 'app-preferencias-notificacion',
  template: `
    <section class="card" aria-labelledby="titulo-pref-notif">
      <h2 id="titulo-pref-notif">Notificaciones</h2>
      <p class="muted">
        Siempre verás tus notificaciones en la campana de la barra superior. Además puedes
        recibirlas en tu correo.
      </p>

      @if (cargando()) {
        <p class="cargando" role="status">Cargando preferencias…</p>
      } @else if (notificarCorreo() !== null) {
        <label class="switch">
          <input
            type="checkbox"
            role="switch"
            [checked]="notificarCorreo()"
            [disabled]="guardando()"
            (change)="cambiar($any($event.target).checked)"
          />
          <span>Recibir también por correo</span>
        </label>
        <p class="muted texto-chico">
          Los correos solo se envían si el administrador activó el correo saliente del sistema.
        </p>
      }

      @if (mensaje()) {
        <p class="alert alert-success" role="status">{{ mensaje() }}</p>
      }
      @if (error()) {
        <p class="alert alert-danger" role="alert">{{ error() }}</p>
      }
    </section>
  `,
})
export class PreferenciasNotificacionComponent implements OnInit {
  private readonly notificaciones = inject(NotificacionService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly notificarCorreo = signal<boolean | null>(null);
  protected readonly cargando = signal(false);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly mensaje = signal<string | null>(null);

  ngOnInit(): void {
    this.cargando.set(true);
    this.notificaciones
      .preferencias()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => {
          this.cargando.set(false);
          this.notificarCorreo.set(p.notificarCorreo);
        },
        error: (err: unknown) => {
          this.cargando.set(false);
          this.error.set(mensajeDeError(err, 'No se pudieron cargar tus preferencias.'));
        },
      });
  }

  protected cambiar(valor: boolean): void {
    const anterior = this.notificarCorreo();
    this.notificarCorreo.set(valor);
    this.guardando.set(true);
    this.error.set(null);
    this.mensaje.set(null);
    this.notificaciones
      .guardarPreferencias({ notificarCorreo: valor })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => {
          this.guardando.set(false);
          this.notificarCorreo.set(p.notificarCorreo);
          this.mensaje.set(
            p.notificarCorreo
              ? 'Listo: también recibirás tus notificaciones por correo.'
              : 'Listo: ya no recibirás tus notificaciones por correo.',
          );
        },
        error: (err: unknown) => {
          this.guardando.set(false);
          this.notificarCorreo.set(anterior);
          this.error.set(mensajeDeError(err, 'No se pudo guardar tu preferencia.'));
        },
      });
  }
}
