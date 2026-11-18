import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import type { EstadoTrabajo, PaginaTrabajos } from '../../../api/work';
import { mensajeDeError } from '../../../core/http/error-message';
import { TrabajoService } from '../../../core/services/trabajo.service';
import { ESTADOS_TRABAJO } from '../../../shared/estado-trabajo';
import { PaginadorComponent } from '../../../shared/paginador.component';
import { TablaTrabajosComponent } from '../../../shared/tabla-trabajos.component';

/** "Mis trabajos" del estudiante (autor o coautor): listado paginado con filtro por estado. */
@Component({
  selector: 'app-mis-trabajos',
  imports: [ReactiveFormsModule, RouterLink, PaginadorComponent, TablaTrabajosComponent],
  template: `
    <section class="card">
      <header class="page-header">
        <h1>Mis trabajos</h1>
        <a class="btn btn-primary" routerLink="/estudiante/trabajos/nuevo">Nuevo trabajo</a>
      </header>

      <div class="filters">
        <label class="field">
          <span>Estado</span>
          <select [formControl]="estado">
            <option [ngValue]="null">Todos</option>
            @for (e of estados; track e.valor) {
              <option [ngValue]="e.valor">{{ e.texto }}</option>
            }
          </select>
        </label>
      </div>

      @if (error()) {
        <p class="alert alert-danger" role="alert">{{ error() }}</p>
      }

      @if (cargando() && !pagina()) {
        <p class="cargando" role="status">Cargando trabajos…</p>
      } @else if (pagina(); as p) {
        @if (p.contenido.length === 0) {
          <p class="estado-vacio">
            @if (estado.value) {
              No tienes trabajos en este estado.
            } @else {
              Aún no tienes trabajos. Crea el primero con «Nuevo trabajo».
            }
          </p>
        } @else {
          <app-tabla-trabajos
            titulo="Mis trabajos"
            [trabajos]="p.contenido"
            [ocupada]="cargando()"
          />
        }
        <app-paginador
          [pagina]="p.pagina"
          [tamano]="p.tamano"
          [totalElementos]="p.totalElementos"
          [totalPaginas]="p.totalPaginas"
          (cambiarPagina)="irAPagina($event)"
          (cambiarTamano)="cambiarTamano($event)"
        />
      }
    </section>
  `,
})
export class MisTrabajosComponent implements OnInit {
  private readonly trabajos = inject(TrabajoService);
  private readonly destroyRef = inject(DestroyRef);
  private carga?: Subscription;

  protected readonly estados = ESTADOS_TRABAJO;
  protected readonly estado = new FormControl<EstadoTrabajo | null>(null);
  protected readonly pagina = signal<PaginaTrabajos | null>(null);
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly numeroPagina = signal(0);
  private readonly tamano = signal(20);

  constructor() {
    this.estado.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.numeroPagina.set(0);
      this.cargar();
    });
  }

  ngOnInit(): void {
    this.cargar();
  }

  protected irAPagina(pagina: number): void {
    this.numeroPagina.set(pagina);
    this.cargar();
  }

  protected cambiarTamano(tamano: number): void {
    this.tamano.set(tamano);
    this.numeroPagina.set(0);
    this.cargar();
  }

  private cargar(): void {
    this.carga?.unsubscribe();
    this.cargando.set(true);
    this.error.set(null);
    this.carga = this.trabajos
      .misTrabajos({
        estado: this.estado.value ?? undefined,
        pagina: this.numeroPagina(),
        tamano: this.tamano(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => {
          this.cargando.set(false);
          this.pagina.set(p);
        },
        error: (err: unknown) => {
          this.cargando.set(false);
          this.pagina.set(null);
          this.error.set(mensajeDeError(err, 'No se pudieron cargar tus trabajos.'));
        },
      });
  }
}
