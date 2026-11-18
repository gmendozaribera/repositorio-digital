import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink, RouterOutlet } from '@angular/router';
import { esLimiteDeIntentos, MENSAJE_CONSULTAS_SEGUIDAS } from '../../core/http/limite-intentos';
import { RepositorioPublicoService } from '../../core/services/repositorio-publico.service';

type Acceso = 'cargando' | 'habilitado' | 'restringido' | 'error';

/**
 * Marco del repositorio publico (`/explorar`, sin iniciar sesion). Antes de mostrar nada consulta
 * `/publico/estado`: si ninguna facultad habilito el acceso externo, muestra "Acceso restringido"
 * con un boton al login. El backend igual responde 404/403 en `/publico/**` para lo que no se
 * puede ver; esta pantalla solo evita mostrar un buscador vacio.
 *
 * Quien ya tiene sesion no llega aqui: el visitanteGuard lo manda a `/repositorio`.
 */
@Component({
  selector: 'app-explorar',
  imports: [RouterOutlet, RouterLink],
  template: `
    <header class="topbar">
      <a class="brand" routerLink="/explorar">Repositorio Digital</a>
      <nav class="topbar-nav" aria-label="Principal">
        <a routerLink="/explorar">Explorar</a>
      </nav>
      <div class="topbar-user">
        <a class="btn btn-outline btn-sm" routerLink="/login">Iniciar sesión</a>
      </div>
    </header>
    <main class="content">
      @switch (acceso()) {
        @case ('cargando') {
          <p class="cargando" role="status">Cargando el repositorio…</p>
        }
        @case ('habilitado') {
          <router-outlet />
        }
        @case ('restringido') {
          <section class="card acceso-restringido">
            <h1>Acceso restringido</h1>
            <p>
              El repositorio no está disponible para visitantes. Inicia sesión para consultarlo.
            </p>
            <a class="btn btn-primary" routerLink="/login">Iniciar sesión</a>
          </section>
        }
        @case ('error') {
          <section class="card acceso-restringido">
            <h1>Repositorio no disponible</h1>
            <p class="alert alert-danger" role="alert">{{ mensajeError() }}</p>
            <div class="form-actions">
              <button class="btn btn-outline" type="button" (click)="consultar()">
                Reintentar
              </button>
              <a class="btn btn-primary" routerLink="/login">Iniciar sesión</a>
            </div>
          </section>
        }
      }
    </main>
  `,
})
export class ExplorarComponent {
  private readonly publico = inject(RepositorioPublicoService);
  protected readonly acceso = signal<Acceso>('cargando');
  protected readonly mensajeError = signal('');
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    this.consultar();
  }

  protected consultar(): void {
    this.acceso.set('cargando');
    this.publico
      .estado()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (e) => this.acceso.set(e.habilitado ? 'habilitado' : 'restringido'),
        error: (err: unknown) => {
          this.mensajeError.set(
            esLimiteDeIntentos(err)
              ? MENSAJE_CONSULTAS_SEGUIDAS
              : 'No se pudo consultar el repositorio en este momento. Intenta de nuevo más tarde.',
          );
          this.acceso.set('error');
        },
      });
  }
}
