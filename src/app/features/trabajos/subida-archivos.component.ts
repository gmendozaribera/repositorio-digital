import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, input, output, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import type { CategoriaDocumento, ReglasDocumentos } from '../../api/work';
import { mensajeDeError } from '../../core/http/error-message';
import { formatoCuentaRegresiva, segundosDeEspera } from '../../core/http/limite-intentos';
import { TrabajoService } from '../../core/services/trabajo.service';
import {
  categoriaSugerida,
  CATEGORIAS,
  nombreSinExtension,
  tamanoLegible,
  validarArchivo,
} from '../../shared/archivos';

export type EstadoItem = 'pendiente' | 'subiendo' | 'completo' | 'error';

export interface ItemSubida {
  clave: number;
  archivo: File;
  titulo: string;
  categoria: CategoriaDocumento | null;
  estado: EstadoItem;
  progreso: number;
  /** Error del servidor (los de validacion previa se calculan aparte). */
  error: string | null;
}

/** Espera si el 429 no trae Retry-After: el limite es por minuto. */
const ESPERA_POR_DEFECTO_S = 60;
const MAX_TITULO = 200;

/**
 * Carga multiple de archivos a una fase del trabajo:
 * - cada archivo con su categoria (sugerida por la extension) y su titulo;
 * - validacion previa con las reglas de la facultad (`GET /documentos/reglas`): extension y tamano;
 * - subidas una por una, con barra de progreso por archivo;
 * - si el servidor responde 429 (limite de subidas por minuto) la cola se pausa durante
 *   `Retry-After` segundos y continua sola.
 */
@Component({
  selector: 'app-subida-archivos',
  template: `
    <section class="panel subida" [attr.aria-labelledby]="'subida-' + idFase()">
      <h3 [id]="'subida-' + idFase()">Subir archivos a «{{ nombreFase() }}»</h3>
      <label class="field">
        <span>Archivos</span>
        <input
          type="file"
          multiple
          [attr.accept]="aceptados()"
          [disabled]="enCurso()"
          (change)="elegir($any($event.target))"
        />
        <small class="muted">{{ ayudaFormatos() }}</small>
      </label>

      @if (espera() > 0) {
        <p class="alert alert-warn" role="status">
          Alcanzaste el límite de {{ reglas()?.subidasPorMinuto ?? '' }} subidas por minuto. La
          carga continuará sola en {{ cuentaRegresiva() }}.
        </p>
      }
      @if (aviso()) {
        <p class="alert alert-danger" role="alert">{{ aviso() }}</p>
      }

      @if (items().length) {
        <ul class="lista-subida">
          @for (item of items(); track item.clave) {
            <li [class]="'item-subida item-' + item.estado">
              <div class="item-cabecera">
                <strong class="item-nombre">{{ item.archivo.name }}</strong>
                <span class="muted texto-chico">{{ tamano(item.archivo.size) }}</span>
                @if (item.estado !== 'subiendo' && item.estado !== 'completo') {
                  <button
                    class="btn btn-link btn-sm"
                    type="button"
                    [disabled]="enCurso()"
                    (click)="quitar(item)"
                  >
                    Quitar <span class="sr-only">{{ item.archivo.name }}</span>
                  </button>
                }
              </div>
              @if (item.estado === 'pendiente' || item.estado === 'error') {
                <div class="form-grid">
                  <label class="field">
                    <span>Categoría</span>
                    <select
                      [disabled]="enCurso()"
                      (change)="cambiarCategoria(item, $any($event.target).value)"
                    >
                      <option value="" [selected]="!item.categoria" disabled>Seleccione…</option>
                      @for (c of categorias; track c.valor) {
                        <option [value]="c.valor" [selected]="c.valor === item.categoria">
                          {{ c.texto }}
                        </option>
                      }
                    </select>
                  </label>
                  <label class="field">
                    <span>Título</span>
                    <input
                      [value]="item.titulo"
                      [attr.maxlength]="maxTitulo"
                      [disabled]="enCurso()"
                      (input)="cambiarTitulo(item, $any($event.target).value)"
                    />
                  </label>
                </div>
              }
              @if (problema(item); as p) {
                <small class="field-error">{{ p }}</small>
              }
              @if (item.estado === 'subiendo' || item.estado === 'completo') {
                <div class="progreso">
                  <progress
                    max="100"
                    [value]="item.progreso"
                    [attr.aria-label]="'Progreso de ' + item.archivo.name"
                  ></progress>
                  <span class="texto-chico">
                    {{ item.estado === 'completo' ? 'Subido' : item.progreso + ' %' }}
                  </span>
                </div>
              }
            </li>
          }
        </ul>
      }

      <div class="form-actions">
        <button
          class="btn btn-primary"
          type="button"
          [disabled]="enCurso() || porSubir().length === 0"
          (click)="subirTodo()"
        >
          {{
            enCurso()
              ? 'Subiendo…'
              : porSubir().length === 1
                ? 'Subir 1 archivo'
                : 'Subir ' + porSubir().length + ' archivos'
          }}
        </button>
        <button class="btn btn-link" type="button" [disabled]="enCurso()" (click)="cerrar.emit()">
          Cerrar
        </button>
      </div>
    </section>
  `,
})
export class SubidaArchivosComponent {
  private readonly trabajos = inject(TrabajoService);

  readonly idTrabajo = input.required<number>();
  readonly idFase = input.required<number>();
  readonly nombreFase = input.required<string>();
  readonly reglas = input.required<ReglasDocumentos | null>();

  /** Al terminar la cola: cuantos se subieron y cuantos quedaron sin subir. */
  readonly terminado = output<{ subidos: number; pendientes: number }>();
  readonly cerrar = output<void>();

  protected readonly categorias = CATEGORIAS;
  protected readonly maxTitulo = MAX_TITULO;
  protected readonly tamano = tamanoLegible;

  protected readonly items = signal<ItemSubida[]>([]);
  protected readonly enCurso = signal(false);
  protected readonly aviso = signal<string | null>(null);
  protected readonly espera = signal(0);
  protected readonly cuentaRegresiva = computed(() => formatoCuentaRegresiva(this.espera()));
  protected readonly porSubir = computed(() =>
    this.items().filter((i) => i.estado === 'pendiente' || i.estado === 'error'),
  );

  /** `accept` del input: todas las extensiones de la facultad (el navegador filtra el dialogo). */
  protected readonly aceptados = computed(() => {
    const ext = new Set(this.reglas()?.formatos.flatMap((f) => f.extensiones) ?? []);
    return ext.size ? Array.from(ext, (e) => `.${e}`).join(',') : null;
  });

  protected readonly ayudaFormatos = computed(() => {
    const formatos = this.reglas()?.formatos ?? [];
    if (!formatos.length) {
      return 'Cargando formatos permitidos…';
    }
    return formatos
      .map(
        (f) =>
          `${CATEGORIAS.find((c) => c.valor === f.categoria)?.texto ?? f.categoria}: ` +
          `${f.extensiones.join(', ')} (máx. ${f.tamanoMaxMB} MB)`,
      )
      .join(' · ');
  });

  private clave = 0;
  private subida: Subscription | null = null;
  private temporizador: ReturnType<typeof setInterval> | null = null;
  private subidos = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.subida?.unsubscribe();
      this.detenerEspera();
    });
  }

  /** Error de validacion previa o del servidor, o null. */
  protected problema(item: ItemSubida): string | null {
    if (item.estado === 'completo' || item.estado === 'subiendo') {
      return null;
    }
    return this.errorDeValidacion(item) ?? item.error;
  }

  protected elegir(input: HTMLInputElement): void {
    const archivos = Array.from(input.files ?? []);
    input.value = '';
    this.aviso.set(null);
    const nuevos = archivos.map<ItemSubida>((archivo) => ({
      clave: ++this.clave,
      archivo,
      titulo: nombreSinExtension(archivo.name).slice(0, MAX_TITULO),
      categoria: categoriaSugerida(this.reglas(), archivo.name),
      estado: 'pendiente',
      progreso: 0,
      error: null,
    }));
    this.items.update((l) => [...l.filter((i) => i.estado !== 'completo'), ...nuevos]);
  }

  protected quitar(item: ItemSubida): void {
    this.items.update((l) => l.filter((i) => i.clave !== item.clave));
  }

  protected cambiarCategoria(item: ItemSubida, valor: string): void {
    this.actualizar(item.clave, { categoria: valor as CategoriaDocumento, error: null });
  }

  protected cambiarTitulo(item: ItemSubida, titulo: string): void {
    this.actualizar(item.clave, { titulo, error: null });
  }

  protected subirTodo(): void {
    const conProblemas = this.porSubir().filter((i) => this.errorDeValidacion(i));
    if (conProblemas.length) {
      this.aviso.set('Corrige los archivos marcados antes de subirlos.');
      return;
    }
    this.aviso.set(null);
    this.subidos = 0;
    this.items.update((l) =>
      l.map((i) => (i.estado === 'error' ? { ...i, estado: 'pendiente', error: null } : i)),
    );
    this.enCurso.set(true);
    this.siguiente();
  }

  private errorDeValidacion(item: ItemSubida): string | null {
    if (!item.titulo.trim()) {
      return 'Escribe un título para el archivo.';
    }
    return validarArchivo(this.reglas(), item.categoria, item.archivo);
  }

  /** Sube el siguiente pendiente; al no quedar ninguno, avisa al detalle. */
  private siguiente(): void {
    const item = this.items().find((i) => i.estado === 'pendiente');
    if (!item) {
      this.finalizar();
      return;
    }
    this.actualizar(item.clave, { estado: 'subiendo', progreso: 0, error: null });
    this.subida = this.trabajos
      .subir(this.idTrabajo(), {
        archivo: item.archivo,
        titulo: item.titulo,
        categoria: item.categoria!,
        idFase: this.idFase(),
      })
      .subscribe({
        next: (evento) => {
          if (evento.tipo === 'progreso') {
            this.actualizar(item.clave, { progreso: evento.porcentaje });
          } else {
            this.subidos++;
            this.actualizar(item.clave, { estado: 'completo', progreso: 100 });
          }
        },
        complete: () => this.siguiente(),
        error: (err: unknown) => {
          if (err instanceof HttpErrorResponse && err.status === 429) {
            // Vuelve a la cola y se reintenta cuando pase el tiempo que indica el servidor.
            this.actualizar(item.clave, { estado: 'pendiente', progreso: 0 });
            this.esperar(segundosDeEspera(err) ?? ESPERA_POR_DEFECTO_S);
            return;
          }
          this.actualizar(item.clave, {
            estado: 'error',
            progreso: 0,
            error: mensajeDeError(err, 'No se pudo subir el archivo.'),
          });
          this.siguiente();
        },
      });
  }

  private esperar(segundos: number): void {
    this.detenerEspera();
    const fin = Date.now() + segundos * 1000;
    this.espera.set(segundos);
    this.temporizador = setInterval(() => {
      const restante = Math.max(0, Math.ceil((fin - Date.now()) / 1000));
      this.espera.set(restante);
      if (restante === 0) {
        this.detenerEspera();
        this.siguiente();
      }
    }, 1000);
  }

  private detenerEspera(): void {
    if (this.temporizador !== null) {
      clearInterval(this.temporizador);
      this.temporizador = null;
    }
    this.espera.set(0);
  }

  private finalizar(): void {
    this.enCurso.set(false);
    this.subida = null;
    // Los subidos ya se veran en la lista de documentos del trabajo.
    this.items.update((l) => l.filter((i) => i.estado !== 'completo'));
    this.terminado.emit({ subidos: this.subidos, pendientes: this.items().length });
  }

  private actualizar(clave: number, cambios: Partial<ItemSubida>): void {
    this.items.update((l) => l.map((i) => (i.clave === clave ? { ...i, ...cambios } : i)));
  }
}
