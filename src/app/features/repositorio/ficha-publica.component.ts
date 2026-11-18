import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, input, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import type { Documento, TrabajoPublico } from '../../api/work';
import { mensajeDeError } from '../../core/http/error-message';
import { TrabajoService } from '../../core/services/trabajo.service';
import { esEnlaceSeguro, guardarBlob, tamanoLegible, textoCategoria } from '../../shared/archivos';
import { fechaAbsoluta } from '../../shared/fecha-relativa';
import { UltimaBusquedaRepositorio } from './filtros-repositorio';

interface GrupoFase {
  idFase: number;
  nombre: string;
  documentos: Documento[];
}

/**
 * Ficha publica de un trabajo evaluado (`/repositorio/:id`). Solo lectura: sin estado editable,
 * calificacion, observaciones ni historial (el backend ni siquiera los envia). Los archivos se
 * descargan con el token (blob); los enlaces externos solo se abren si son https.
 */
@Component({
  selector: 'app-ficha-publica',
  imports: [RouterLink],
  template: `
    <section class="card detalle-trabajo">
      <p class="volver">
        <a routerLink="/repositorio" [queryParams]="volverParams()">← Volver al repositorio</a>
      </p>

      @if (error()) {
        <p class="alert alert-danger" role="alert">{{ error() }}</p>
      }

      @if (cargando() && !trabajo()) {
        <p class="cargando" role="status">Cargando trabajo…</p>
      } @else if (trabajo(); as t) {
        <header class="page-header">
          <h1>{{ t.titulo }}</h1>
        </header>

        <dl class="ficha">
          <div>
            <dt>{{ t.autores.length === 1 ? 'Autor' : 'Autores' }}</dt>
            <dd>{{ nombres(t) }}</dd>
          </div>
          <div>
            <dt>Materia</dt>
            <dd>{{ t.siglaMateria }} — {{ t.nombreMateria }}</dd>
          </div>
          <div>
            <dt>Periodo</dt>
            <dd>{{ t.periodo }} · Grupo {{ t.grupo }}</dd>
          </div>
          <div>
            <dt>Tipo</dt>
            <dd>{{ t.tipoTrabajo }}</dd>
          </div>
          <div>
            <dt>Publicado</dt>
            <dd>
              <time [attr.datetime]="t.fechaPublicacion">{{ fecha(t.fechaPublicacion) }}</time>
            </dd>
          </div>
        </dl>

        <h2>Resumen</h2>
        <p class="texto-largo">{{ t.resumen }}</p>
        @if (t.hashtags.length) {
          <ul class="chips" aria-label="Hashtags">
            @for (h of t.hashtags; track h) {
              <li>
                <a
                  class="chip chip-enlace"
                  routerLink="/repositorio"
                  [queryParams]="{ hashtag: h }"
                  [attr.aria-label]="'Buscar trabajos con el hashtag ' + h"
                  >#{{ h }}</a
                >
              </li>
            }
          </ul>
        }

        <h2>Documentos</h2>
        @for (g of fases(); track g.idFase) {
          <section class="fase" [attr.aria-labelledby]="'fase-' + g.idFase">
            <header class="fase-cabecera">
              <h3 [id]="'fase-' + g.idFase">{{ g.nombre }}</h3>
            </header>
            <ul class="lista-documentos">
              @for (d of g.documentos; track d.idDocumento) {
                <li>
                  <div class="documento-datos">
                    <strong>{{ d.titulo }}</strong>
                    <span class="badge badge-muted">{{ categoria(d.categoria) }}</span>
                    <div class="muted texto-chico">
                      @if (d.tipo === 'ARCHIVO') {
                        {{ d.nombreArchivo }} · {{ tamano(d.tamanoBytes) }}
                      } @else {
                        Enlace externo
                      }
                    </div>
                    @if (d.descripcion) {
                      <div class="texto-chico">{{ d.descripcion }}</div>
                    }
                  </div>
                  <div class="acciones">
                    @if (d.tipo === 'ENLACE') {
                      @if (enlaceSeguro(d.urlExterno)) {
                        <a
                          class="btn btn-outline btn-sm"
                          [href]="d.urlExterno"
                          target="_blank"
                          rel="noopener noreferrer"
                          >Abrir enlace
                          <span class="sr-only">{{ d.titulo }} (nueva pestaña)</span></a
                        >
                      } @else {
                        <span class="muted texto-chico">Enlace no disponible</span>
                      }
                    } @else {
                      <button
                        class="btn btn-outline btn-sm"
                        type="button"
                        [disabled]="descargando() === d.idDocumento"
                        (click)="descargar(d)"
                      >
                        {{ descargando() === d.idDocumento ? 'Descargando…' : 'Descargar' }}
                        <span class="sr-only">{{ d.titulo }}</span>
                      </button>
                    }
                  </div>
                </li>
              }
            </ul>
          </section>
        } @empty {
          <p class="estado-vacio">Este trabajo no tiene documentos publicados.</p>
        }
      }
    </section>
  `,
})
export class FichaPublicaComponent implements OnInit {
  private readonly trabajos = inject(TrabajoService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ultimaBusqueda = inject(UltimaBusquedaRepositorio);

  /** `:id` de la ruta (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly categoria = textoCategoria;
  protected readonly tamano = tamanoLegible;
  protected readonly enlaceSeguro = esEnlaceSeguro;
  protected readonly fecha = (iso: string) => fechaAbsoluta(iso);

  protected readonly trabajo = signal<TrabajoPublico | null>(null);
  protected readonly cargando = signal(false);
  protected readonly descargando = signal<number | null>(null);
  protected readonly error = signal<string | null>(null);
  /** Vuelve a la misma busqueda (filtros y pagina) desde la que se abrio la ficha. */
  protected readonly volverParams = computed(() => this.ultimaBusqueda.params());

  /** Documentos agrupados por fase, en el orden de las fases (id) y luego por fecha de subida. */
  protected readonly fases = computed<GrupoFase[]>(() => {
    const grupos = new Map<number, GrupoFase>();
    for (const d of this.trabajo()?.documentos ?? []) {
      let g = grupos.get(d.idFase);
      if (!g) {
        g = { idFase: d.idFase, nombre: d.nombreFase, documentos: [] };
        grupos.set(d.idFase, g);
      }
      g.documentos.push(d);
    }
    return Array.from(grupos.values()).sort((a, b) => a.idFase - b.idFase);
  });

  /** "Juan Perez, Ana Rojas" (sin registro: no hace falta en la ficha publica). */
  protected nombres(t: TrabajoPublico): string {
    return t.autores.map((a) => `${a.nombre} ${a.apellidos}`).join(', ');
  }

  ngOnInit(): void {
    const id = Number(this.id());
    if (!Number.isInteger(id) || id < 1) {
      this.error.set('El trabajo no existe o no está publicado.');
      return;
    }
    this.cargando.set(true);
    this.trabajos
      .obtenerPublico(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (t) => {
          this.cargando.set(false);
          this.trabajo.set(t);
        },
        error: (err: unknown) => {
          this.cargando.set(false);
          this.error.set(
            err instanceof HttpErrorResponse && (err.status === 404 || err.status === 400)
              ? 'El trabajo no existe o no está publicado.'
              : mensajeDeError(err, 'No se pudo cargar el trabajo.'),
          );
        },
      });
  }

  protected descargar(d: Documento): void {
    this.descargando.set(d.idDocumento);
    this.error.set(null);
    this.trabajos
      .descargar(d)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ blob, nombre }) => {
          this.descargando.set(null);
          guardarBlob(blob, nombre);
        },
        error: (err: unknown) => {
          this.descargando.set(null);
          // El cuerpo del error llega como Blob (se pidio un archivo): se usa un texto por estado.
          this.error.set(
            err instanceof HttpErrorResponse && err.status === 404
              ? 'El archivo ya no está disponible.'
              : mensajeDeError(err, 'No se pudo descargar el archivo.'),
          );
        },
      });
  }
}
