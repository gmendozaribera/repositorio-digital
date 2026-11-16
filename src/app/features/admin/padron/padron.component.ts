import {
  Component,
  DestroyRef,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, merge, Subscription } from 'rxjs';
import type { Carrera } from '../../../api/catalog';
import type { EstudianteHabilitado, PaginaPadron, ResultadoImportacion } from '../../../api/user';
import { mensajeDeError } from '../../../core/http/error-message';
import { CatalogoService } from '../../../core/services/catalogo.service';
import { UsuarioService } from '../../../core/services/usuario.service';
import { PaginadorComponent } from '../../../shared/paginador.component';

/** Limites del contrato (user-api.yaml, importarPadron). El backend vuelve a validarlos. */
export const EXTENSIONES_PADRON = ['.csv', '.xlsx', '.xls'];
export const MAX_BYTES_PADRON = 5 * 1024 * 1024;

/** Columnas de la cabecera, en el orden de la plantilla (el backend acepta cualquier orden). */
export const COLUMNAS_PADRON = [
  'registro',
  'ci',
  'correo',
  'password_default',
  'nombres',
  'apellidos',
  'sigla_carrera',
] as const;

/** Fila de ejemplo para la plantilla y la ayuda (datos ficticios). */
export const EJEMPLO_PADRON = [
  '219012345',
  '7654321',
  'juan.perez@uagrm.edu.bo',
  'Ficct2026',
  'Juan Carlos',
  'Perez Lopez',
  'INF',
];

/** Valida extension y tamaño antes de subir. Devuelve el mensaje de error o null si es valido. */
export function validarArchivoPadron(archivo: File): string | null {
  const nombre = archivo.name.toLowerCase();
  if (!EXTENSIONES_PADRON.some((ext) => nombre.endsWith(ext))) {
    return 'Formato no permitido. Use un archivo .csv, .xlsx o .xls.';
  }
  if (archivo.size === 0) {
    return 'El archivo está vacío.';
  }
  if (archivo.size > MAX_BYTES_PADRON) {
    return 'El archivo supera el máximo de 5 MB.';
  }
  return null;
}

/** Contenido de la plantilla CSV (UTF-8, separador coma). */
export function plantillaCsvPadron(): string {
  return `${COLUMNAS_PADRON.join(',')}\n${EJEMPLO_PADRON.join(',')}\n`;
}

type TriEstado = 'todos' | 'si' | 'no';

function aBooleano(valor: TriEstado): boolean | undefined {
  return valor === 'todos' ? undefined : valor === 'si';
}

/**
 * Padron estudiantil: importacion desde CSV/Excel y listado con el switch "habilitado".
 * Solo los estudiantes del padron habilitados pueden auto-registrarse en /registro.
 * Las contraseñas por defecto nunca se muestran (el backend las guarda cifradas y no las devuelve).
 */
@Component({
  selector: 'app-padron',
  imports: [ReactiveFormsModule, PaginadorComponent],
  template: `
    <section class="card">
      <header class="page-header">
        <h1>Padrón estudiantil</h1>
      </header>
      <p class="muted">
        Los estudiantes del padrón que estén habilitados pueden crear su cuenta en la página de
        registro con su CI y su número de registro.
      </p>

      <section class="panel" aria-labelledby="titulo-importar">
        <h2 id="titulo-importar">Importar padrón</h2>
        <p>
          Suba un archivo <strong>.csv</strong> (UTF-8, separado por coma o punto y coma),
          <strong>.xlsx</strong> o <strong>.xls</strong> (se lee la primera hoja), de hasta 5 MB y
          10 000 filas. La primera fila debe ser la cabecera con estas columnas, en cualquier orden:
        </p>
        <div class="tabla-desplazable">
          <table class="table tabla-ejemplo">
            <caption class="sr-only">
              Estructura esperada del archivo con una fila de ejemplo
            </caption>
            <thead>
              <tr>
                @for (c of columnas; track c) {
                  <th scope="col">
                    <code>{{ c }}</code>
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              <tr>
                @for (v of ejemplo; track $index) {
                  <td>{{ v }}</td>
                }
              </tr>
            </tbody>
          </table>
        </div>
        <ul class="muted texto-chico">
          <li>
            Si el registro ya está en el padrón, la fila lo actualiza (y lo vuelve a habilitar); si
            no, lo agrega. Las cuentas ya creadas no se modifican.
          </li>
          <li>
            <code>password_default</code> es la contraseña inicial que la facultad entrega al
            estudiante; se guarda cifrada y el estudiante deberá cambiarla al ingresar.
          </li>
          <li><code>sigla_carrera</code> debe ser la sigla de una carrera activa (p. ej. INF).</li>
        </ul>
        <div class="form-actions">
          <button class="btn btn-outline btn-sm" type="button" (click)="descargarPlantilla()">
            Descargar plantilla CSV
          </button>
        </div>

        <div class="importar">
          <label class="field">
            <span>Archivo del padrón</span>
            <input
              #inputArchivo
              type="file"
              accept=".csv,.xlsx,.xls"
              (change)="elegirArchivo($any($event.target).files)"
            />
            @if (errorArchivo()) {
              <small class="field-error" role="alert">{{ errorArchivo() }}</small>
            }
          </label>
          <button
            class="btn btn-primary"
            type="button"
            [disabled]="!archivo() || importando()"
            (click)="importar()"
          >
            {{ importando() ? 'Importando…' : 'Importar' }}
          </button>
        </div>

        @if (errorImportacion()) {
          <p class="alert alert-danger" role="alert">{{ errorImportacion() }}</p>
        }

        @if (resultado(); as r) {
          <div
            class="alert"
            [class.alert-success]="r.conErrores === 0"
            [class.alert-warn]="r.conErrores > 0"
            role="status"
          >
            Importación procesada: {{ r.totalFilas }} filas leídas, {{ r.insertados }} insertadas,
            {{ r.actualizados }} actualizadas y {{ r.conErrores }} con errores.
          </div>
          <dl class="resumen">
            <div>
              <dt>Filas leídas</dt>
              <dd>{{ r.totalFilas }}</dd>
            </div>
            <div>
              <dt>Insertadas</dt>
              <dd>{{ r.insertados }}</dd>
            </div>
            <div>
              <dt>Actualizadas</dt>
              <dd>{{ r.actualizados }}</dd>
            </div>
            <div>
              <dt>Con errores</dt>
              <dd>{{ r.conErrores }}</dd>
            </div>
          </dl>
          @if (r.errores.length > 0) {
            <h3>Filas con errores (no se importaron)</h3>
            <table class="table tabla-errores">
              <caption class="sr-only">
                Errores de la importación
              </caption>
              <thead>
                <tr>
                  <th scope="col">Fila</th>
                  <th scope="col">Columna</th>
                  <th scope="col">Mensaje</th>
                </tr>
              </thead>
              <tbody>
                @for (e of r.errores; track $index) {
                  <tr>
                    <td data-label="Fila">{{ e.fila }}</td>
                    <td data-label="Columna">{{ e.columna ?? 'Toda la fila' }}</td>
                    <td data-label="Mensaje">{{ e.mensaje }}</td>
                  </tr>
                }
              </tbody>
            </table>
          }
        }
      </section>

      <h2>Estudiantes del padrón</h2>
      <div class="filters" [formGroup]="filtros">
        <label class="field">
          <span>Buscar</span>
          <input
            formControlName="q"
            type="search"
            maxlength="100"
            autocomplete="off"
            placeholder="Nombre, correo, CI o registro"
          />
        </label>
        <label class="field">
          <span>Carrera</span>
          <select formControlName="idCarrera">
            <option [ngValue]="null">Todas</option>
            @for (c of carreras(); track c.idCarrera) {
              <option [ngValue]="c.idCarrera">{{ c.sigla }} — {{ c.nombre }}</option>
            }
          </select>
        </label>
        <label class="field">
          <span>Cuenta creada</span>
          <select formControlName="registrado">
            <option value="todos">Todos</option>
            <option value="si">Sí</option>
            <option value="no">No</option>
          </select>
        </label>
        <label class="field">
          <span>Habilitado</span>
          <select formControlName="habilitado">
            <option value="todos">Todos</option>
            <option value="si">Sí</option>
            <option value="no">No</option>
          </select>
        </label>
      </div>

      @if (mensaje()) {
        <p class="alert alert-success" role="status">{{ mensaje() }}</p>
      }
      @if (errorListado()) {
        <p class="alert alert-danger" role="alert">{{ errorListado() }}</p>
      }

      @if (cargando() && !pagina()) {
        <p class="cargando" role="status">Cargando padrón…</p>
      } @else if (pagina(); as p) {
        @if (p.contenido.length === 0) {
          <p class="estado-vacio">No hay estudiantes en el padrón para el filtro elegido.</p>
        } @else {
          <table class="table tabla-padron" [attr.aria-busy]="cargando()">
            <caption class="sr-only">
              Estudiantes del padrón
            </caption>
            <thead>
              <tr>
                <th scope="col">Registro</th>
                <th scope="col">Estudiante</th>
                <th scope="col">Carrera</th>
                <th scope="col">Cuenta</th>
                <th scope="col">Habilitado</th>
              </tr>
            </thead>
            <tbody>
              @for (e of p.contenido; track e.id) {
                <tr [class.inactivo]="!e.habilitado">
                  <td data-label="Registro">
                    {{ e.registro }}
                    <div class="muted texto-chico">CI {{ e.ci }}</div>
                  </td>
                  <td data-label="Estudiante">
                    {{ e.apellidos }}, {{ e.nombres }}
                    <div class="muted texto-chico">{{ e.correo }}</div>
                  </td>
                  <td data-label="Carrera">{{ e.siglaCarrera }}</td>
                  <td data-label="Cuenta">
                    @if (e.registrado) {
                      <span class="badge badge-success">Registrado</span>
                    } @else {
                      <span class="badge badge-muted">Sin cuenta</span>
                    }
                  </td>
                  <td data-label="Habilitado">
                    <label class="switch">
                      <input
                        type="checkbox"
                        role="switch"
                        [checked]="e.habilitado"
                        [disabled]="actualizando() === e.id"
                        [attr.aria-label]="'Habilitar a ' + e.nombres + ' ' + e.apellidos"
                        (change)="cambiarHabilitado(e, $any($event.target).checked)"
                      />
                      <span>{{ e.habilitado ? 'Sí' : 'No' }}</span>
                    </label>
                  </td>
                </tr>
              }
            </tbody>
          </table>
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
export class PadronComponent implements OnInit {
  private readonly usuarios = inject(UsuarioService);
  private readonly catalogo = inject(CatalogoService);
  private readonly destroyRef = inject(DestroyRef);
  private carga?: Subscription;

  protected readonly columnas = COLUMNAS_PADRON;
  protected readonly ejemplo = EJEMPLO_PADRON;

  private readonly inputArchivo = viewChild<ElementRef<HTMLInputElement>>('inputArchivo');
  protected readonly archivo = signal<File | null>(null);
  protected readonly errorArchivo = signal<string | null>(null);
  protected readonly importando = signal(false);
  protected readonly errorImportacion = signal<string | null>(null);
  protected readonly resultado = signal<ResultadoImportacion | null>(null);

  protected readonly pagina = signal<PaginaPadron | null>(null);
  private readonly numeroPagina = signal(0);
  private readonly tamano = signal(20);
  protected readonly cargando = signal(false);
  protected readonly errorListado = signal<string | null>(null);
  protected readonly mensaje = signal<string | null>(null);
  /** Id de la fila cuyo PATCH esta en curso (deshabilita su switch). */
  protected readonly actualizando = signal<number | null>(null);

  protected readonly carreras = signal<Carrera[]>([]);

  protected readonly filtros = inject(NonNullableFormBuilder).group({
    q: [''],
    idCarrera: new FormControl<number | null>(null),
    registrado: ['todos' as TriEstado],
    habilitado: ['todos' as TriEstado],
  });

  constructor() {
    const texto = this.filtros.controls.q.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged(),
    );
    merge(
      texto,
      this.filtros.controls.idCarrera.valueChanges,
      this.filtros.controls.registrado.valueChanges,
      this.filtros.controls.habilitado.valueChanges,
    )
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.numeroPagina.set(0);
        this.cargar();
      });
  }

  ngOnInit(): void {
    this.catalogo.carreras
      .listar({ incluirInactivos: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (c) => this.carreras.set(c),
        error: (err: unknown) =>
          this.errorListado.set(mensajeDeError(err, 'No se pudieron cargar las carreras.')),
      });
    this.cargar();
  }

  protected elegirArchivo(archivos: FileList | null): void {
    const archivo = archivos?.item(0) ?? null;
    this.resultado.set(null);
    this.errorImportacion.set(null);
    if (!archivo) {
      this.archivo.set(null);
      this.errorArchivo.set(null);
      return;
    }
    const error = validarArchivoPadron(archivo);
    this.errorArchivo.set(error);
    this.archivo.set(error ? null : archivo);
  }

  protected importar(): void {
    const archivo = this.archivo();
    if (!archivo) {
      return;
    }
    this.importando.set(true);
    this.errorImportacion.set(null);
    this.resultado.set(null);
    this.usuarios
      .importarPadron(archivo)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.importando.set(false);
          this.resultado.set(r);
          this.archivo.set(null);
          const input = this.inputArchivo()?.nativeElement;
          if (input) {
            input.value = '';
          }
          this.cargar();
        },
        error: (err: unknown) => {
          this.importando.set(false);
          this.errorImportacion.set(mensajeDeError(err, 'No se pudo importar el archivo.'));
        },
      });
  }

  /** Genera la plantilla en el navegador (sin pedirla al servidor) y la descarga. */
  protected descargarPlantilla(): void {
    // BOM para que Excel abra el CSV como UTF-8.
    const blob = new Blob(['﻿', plantillaCsvPadron()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = 'plantilla-padron.csv';
    enlace.click();
    URL.revokeObjectURL(url);
  }

  protected cambiarHabilitado(e: EstudianteHabilitado, habilitado: boolean): void {
    this.actualizando.set(e.id);
    this.mensaje.set(null);
    this.errorListado.set(null);
    this.usuarios
      .cambiarHabilitado(e.id, habilitado)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (nuevo) => {
          this.actualizando.set(null);
          this.reemplazarFila(nuevo);
          this.mensaje.set(
            nuevo.habilitado
              ? `${nuevo.nombres} ${nuevo.apellidos} quedó habilitado para registrarse.`
              : `${nuevo.nombres} ${nuevo.apellidos} quedó inhabilitado: no podrá auto-registrarse.`,
          );
        },
        error: (err: unknown) => {
          this.actualizando.set(null);
          this.errorListado.set(mensajeDeError(err, 'No se pudo cambiar el estado.'));
          // Recarga para que el switch vuelva al valor real.
          this.cargar();
        },
      });
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

  private reemplazarFila(nuevo: EstudianteHabilitado): void {
    const actual = this.pagina();
    if (actual) {
      this.pagina.set({
        ...actual,
        contenido: actual.contenido.map((x) => (x.id === nuevo.id ? nuevo : x)),
      });
    }
  }

  private cargar(): void {
    this.carga?.unsubscribe();
    this.cargando.set(true);
    this.errorListado.set(null);
    const { q, idCarrera, registrado, habilitado } = this.filtros.getRawValue();
    this.carga = this.usuarios
      .listarPadron({
        q,
        idCarrera: idCarrera ?? undefined,
        registrado: aBooleano(registrado),
        habilitado: aBooleano(habilitado),
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
          this.errorListado.set(mensajeDeError(err, 'No se pudo cargar el padrón.'));
        },
      });
  }
}
