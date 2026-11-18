import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { merge, Subscription } from 'rxjs';
import type { EstadoTrabajo, PaginaTrabajos, TrabajoResumen } from '../../api/work';
import { AuthService } from '../../core/auth/auth.service';
import { mensajeDeError } from '../../core/http/error-message';
import { TrabajoService } from '../../core/services/trabajo.service';
import { ESTADOS_TRABAJO } from '../../shared/estado-trabajo';
import { PaginadorComponent } from '../../shared/paginador.component';
import { TablaTrabajosComponent } from '../../shared/tabla-trabajos.component';

interface OpcionGrupo {
  idGrupo: number;
  texto: string;
}

/**
 * Bandeja de revision (CU10). DOCENTE: trabajos de los grupos donde esta asignado; ADMIN: todos.
 * Por defecto (sin estado) el backend devuelve lo que falta revisar (PENDIENTE y EN_REVISION),
 * los mas antiguos primero. Nunca incluye BORRADOR.
 *
 * "Por calificar" es un atajo al filtro estado = APROBADO: los trabajos que el Administrador de
 * Curso del grupo debe calificar y publicar (el boton aparece en el detalle segun `acciones`).
 *
 * El contrato no tiene un endpoint de "mis grupos": las opciones del filtro de grupo se arman con
 * los grupos que van apareciendo en los resultados.
 */
@Component({
  selector: 'app-bandeja-revision',
  imports: [ReactiveFormsModule, PaginadorComponent, TablaTrabajosComponent],
  template: `
    <section class="card">
      <header class="page-header">
        <h1>Bandeja de revisión</h1>
      </header>
      <p class="muted">
        {{
          esAdmin()
            ? 'Trabajos enviados de todos los grupos.'
            : 'Trabajos enviados por los estudiantes de tus grupos.'
        }}
        Por defecto se muestran los pendientes y en revisión, los más antiguos primero.
      </p>

      <div class="filtros-activos" role="group" aria-label="Accesos rápidos">
        <button
          class="chip chip-enlace"
          type="button"
          [attr.aria-pressed]="!estadoElegido()"
          (click)="elegirEstado(null)"
        >
          Por revisar
        </button>
        <button
          class="chip chip-enlace"
          type="button"
          [attr.aria-pressed]="porCalificar()"
          (click)="elegirEstado('APROBADO')"
        >
          Por calificar
        </button>
      </div>

      <div class="filters" [formGroup]="filtros">
        <label class="field">
          <span>Estado</span>
          <select formControlName="estado">
            <option [ngValue]="null">Por revisar (pendientes y en revisión)</option>
            @for (e of estados; track e.valor) {
              <option [ngValue]="e.valor">{{ e.texto }}</option>
            }
          </select>
        </label>
        <label class="field">
          <span>Grupo</span>
          <select formControlName="idGrupo">
            <option [ngValue]="null">Todos los grupos</option>
            @for (g of grupos(); track g.idGrupo) {
              <option [ngValue]="g.idGrupo">{{ g.texto }}</option>
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
            @if (porCalificar() && filtros.controls.idGrupo.value === null) {
              No hay trabajos aprobados pendientes de calificación.
            } @else {
              {{
                sinFiltros()
                  ? 'Sin trabajos pendientes.'
                  : 'No hay trabajos para el filtro elegido.'
              }}
            }
          </p>
        } @else {
          <app-tabla-trabajos
            [titulo]="porCalificar() ? 'Trabajos por calificar' : 'Trabajos por revisar'"
            [trabajos]="p.contenido"
            [mostrarAutores]="true"
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
export class BandejaRevisionComponent implements OnInit {
  private readonly trabajos = inject(TrabajoService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private carga?: Subscription;

  /** La bandeja nunca incluye borradores. APROBADO es lo que falta calificar. */
  protected readonly estados = ESTADOS_TRABAJO.filter((e) => e.valor !== 'BORRADOR').map((e) =>
    e.valor === 'APROBADO' ? { ...e, texto: 'Aprobado (por calificar)' } : e,
  );
  protected readonly esAdmin = computed(() => this.auth.usuario()?.rol === 'ADMIN');

  protected readonly filtros = inject(NonNullableFormBuilder).group({
    estado: new FormControl<EstadoTrabajo | null>(null),
    idGrupo: new FormControl<number | null>(null),
  });

  protected readonly pagina = signal<PaginaTrabajos | null>(null);
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly numeroPagina = signal(0);
  private readonly tamano = signal(20);
  private readonly conFiltros = signal(false);
  protected readonly sinFiltros = computed(() => !this.conFiltros());
  protected readonly estadoElegido = signal<EstadoTrabajo | null>(null);
  protected readonly porCalificar = computed(() => this.estadoElegido() === 'APROBADO');

  /** Grupos vistos en los resultados (se acumulan para que el filtro no pierda opciones). */
  private readonly gruposVistos = signal<Map<number, string>>(new Map());
  protected readonly grupos = computed<OpcionGrupo[]>(() =>
    Array.from(this.gruposVistos(), ([idGrupo, texto]) => ({ idGrupo, texto })).sort((a, b) =>
      a.texto.localeCompare(b.texto, 'es'),
    ),
  );

  constructor() {
    merge(this.filtros.controls.estado.valueChanges, this.filtros.controls.idGrupo.valueChanges)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.numeroPagina.set(0);
        this.cargar();
      });
  }

  ngOnInit(): void {
    this.cargar();
  }

  /** Accesos rapidos: cambia el filtro de estado (el cambio dispara la recarga). */
  protected elegirEstado(estado: EstadoTrabajo | null): void {
    this.filtros.controls.estado.setValue(estado);
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

  private recordarGrupos(trabajos: TrabajoResumen[]): void {
    const nuevos = trabajos.filter((t) => !this.gruposVistos().has(t.idGrupo));
    if (nuevos.length === 0) {
      return;
    }
    const mapa = new Map(this.gruposVistos());
    for (const t of nuevos) {
      mapa.set(t.idGrupo, `${t.siglaMateria} · Grupo ${t.grupo} · ${t.periodo}`);
    }
    this.gruposVistos.set(mapa);
  }

  private cargar(): void {
    this.carga?.unsubscribe();
    this.cargando.set(true);
    this.error.set(null);
    const { estado, idGrupo } = this.filtros.getRawValue();
    this.estadoElegido.set(estado);
    this.conFiltros.set(estado !== null || idGrupo !== null);
    this.carga = this.trabajos
      .bandeja({
        estado: estado ?? undefined,
        idGrupo: idGrupo ?? undefined,
        pagina: this.numeroPagina(),
        tamano: this.tamano(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => {
          this.cargando.set(false);
          this.recordarGrupos(p.contenido);
          this.pagina.set(p);
        },
        error: (err: unknown) => {
          this.cargando.set(false);
          this.pagina.set(null);
          this.error.set(mensajeDeError(err, 'No se pudo cargar la bandeja de revisión.'));
        },
      });
  }
}
