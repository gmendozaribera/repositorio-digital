import {
  afterNextRender,
  computed,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormGroup } from '@angular/forms';
import { Observable, Subscription } from 'rxjs';
import type { Facultad } from '../../../api/catalog';
import {
  aplicarErroresDelServidor,
  errorDelServidor,
  mensajeDeError,
} from '../../../core/http/error-message';
import { CatalogoService, RecursoCatalogo } from '../../../core/services/catalogo.service';

/** Valor de `estado` en el contrato: 1 = activo, 0 = desactivado. */
export const ACTIVO = 1;
export const INACTIVO = 0;

/**
 * Comportamiento comun de las pantallas de catalogos: listado con filtros, alta/edicion en un
 * panel con formulario reactivo, desactivar (borrado logico) y reactivar.
 *
 * Cada pantalla define el recurso, el formulario y como convertir entre formulario y request.
 */
@Directive()
export abstract class PaginaCatalogo<T extends { estado: number }, R, F> {
  protected readonly catalogo = inject(CatalogoService);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private carga?: Subscription;

  protected abstract readonly recurso: RecursoCatalogo<T, R, F>;
  protected abstract readonly form: FormGroup;
  /** Nombre en singular para los mensajes ("Carrera", "Semestre"...). */
  protected abstract readonly entidad: string;
  /** Para concordar los mensajes: "creada" / "creado". */
  protected abstract readonly femenino: boolean;

  protected abstract idDe(item: T): number;
  protected abstract etiquetaDe(item: T): string;
  /** Filtro del listado a partir de los controles de filtro de la pantalla. */
  protected abstract filtro(): F;
  /** Request a partir del formulario (valores ya validados). */
  protected abstract requestDelFormulario(): R;
  /** Request que reconstruye un registro existente (para reactivarlo sin perder datos). */
  protected abstract requestDe(item: T): R;
  /** Carga un registro en el formulario para editarlo. */
  protected abstract editarEnFormulario(item: T): void;
  /** Deja el formulario listo para un alta (puede usar los filtros como valores por defecto). */
  protected abstract limpiarFormulario(): void;

  protected readonly items = signal<T[]>([]);
  protected readonly cargando = signal(false);
  protected readonly guardando = signal(false);
  protected readonly errorListado = signal<string | null>(null);
  protected readonly errorFormulario = signal<string | null>(null);
  protected readonly mensaje = signal<string | null>(null);
  protected readonly formularioAbierto = signal(false);
  protected readonly enEdicion = signal<T | null>(null);
  protected readonly mostrarInactivos = signal(true);
  protected readonly tituloFormulario = computed(() => {
    const entidad = this.entidad.toLowerCase();
    if (this.enEdicion()) {
      return `Editar ${entidad}`;
    }
    return `${this.femenino ? 'Nueva' : 'Nuevo'} ${entidad}`;
  });

  /** Facultades para selects y para mostrar la sigla en las tablas. */
  protected readonly facultades = signal<Facultad[]>([]);
  protected readonly facultadesActivas = computed(() =>
    this.facultades().filter((f) => f.estado === ACTIVO),
  );

  /** Primer campo del formulario (#primerCampo en la plantilla): recibe el foco al abrirlo. */
  private readonly primerCampo = viewChild<ElementRef<HTMLElement>>('primerCampo');

  protected readonly errorDelServidor = errorDelServidor;
  protected readonly ACTIVO = ACTIVO;

  protected cargar(): void {
    this.carga?.unsubscribe();
    this.cargando.set(true);
    this.errorListado.set(null);
    this.carga = this.recurso
      .listar(this.filtro())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.items.set(items);
          this.cargando.set(false);
        },
        error: (err: unknown) => {
          this.items.set([]);
          this.cargando.set(false);
          this.errorListado.set(mensajeDeError(err, 'No se pudo cargar el listado.'));
        },
      });
  }

  protected cargarFacultades(): void {
    this.catalogo.facultades
      .listar({ incluirInactivos: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (f) => this.facultades.set(f),
        error: (err: unknown) =>
          this.errorListado.set(mensajeDeError(err, 'No se pudieron cargar las facultades.')),
      });
  }

  protected siglaFacultad(idFacultad: number): string {
    return this.facultades().find((f) => f.idFacultad === idFacultad)?.sigla ?? `#${idFacultad}`;
  }

  protected cambiarInactivos(valor: boolean): void {
    this.mostrarInactivos.set(valor);
    this.cargar();
  }

  protected nuevo(): void {
    this.enEdicion.set(null);
    this.form.reset();
    this.limpiarFormulario();
    this.abrirFormulario();
  }

  protected editar(item: T): void {
    this.enEdicion.set(item);
    this.form.reset();
    this.editarEnFormulario(item);
    this.abrirFormulario();
  }

  protected cerrarFormulario(): void {
    this.formularioAbierto.set(false);
    this.enEdicion.set(null);
    this.errorFormulario.set(null);
  }

  protected guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const actual = this.enEdicion();
    const body = this.requestDelFormulario();
    const peticion = actual
      ? this.recurso.actualizar(this.idDe(actual), body)
      : this.recurso.crear(body);

    this.guardando.set(true);
    this.errorFormulario.set(null);
    this.mensaje.set(null);
    peticion.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (item) => {
        this.guardando.set(false);
        this.cerrarFormulario();
        this.mensaje.set(
          `${this.entidad} «${this.etiquetaDe(item)}» ${this.participio(actual ? 'actualizad' : 'cread')}.`,
        );
        this.cargar();
      },
      error: (err: unknown) => {
        this.guardando.set(false);
        this.errorFormulario.set(aplicarErroresDelServidor(this.form, err));
      },
    });
  }

  protected desactivar(item: T): void {
    if (!confirm(`¿Desactivar «${this.etiquetaDe(item)}»? Podrá reactivarlo después.`)) {
      return;
    }
    this.ejecutarAccion(this.recurso.desactivar(this.idDe(item)), 'desactivad');
  }

  protected reactivar(item: T): void {
    const body: R = { ...this.requestDe(item), estado: ACTIVO };
    this.ejecutarAccion(this.recurso.actualizar(this.idDe(item), body), 'reactivad');
  }

  private ejecutarAccion(accion: Observable<T>, raiz: string): void {
    this.mensaje.set(null);
    this.errorListado.set(null);
    accion.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (item) => {
        this.mensaje.set(`${this.entidad} «${this.etiquetaDe(item)}» ${this.participio(raiz)}.`);
        this.cargar();
      },
      error: (err: unknown) =>
        this.errorListado.set(mensajeDeError(err, 'No se pudo completar la acción.')),
    });
  }

  private participio(raiz: string): string {
    return raiz + (this.femenino ? 'a' : 'o');
  }

  private abrirFormulario(): void {
    this.errorFormulario.set(null);
    this.mensaje.set(null);
    this.formularioAbierto.set(true);
    afterNextRender(() => this.primerCampo()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }
}

/** Convierte el valor de un <select> numerico ('' o null = sin seleccionar) en number | undefined. */
export function numeroOpcional(valor: number | string | null | undefined): number | undefined {
  if (valor === null || valor === undefined || valor === '') {
    return undefined;
  }
  const n = Number(valor);
  return Number.isFinite(n) ? n : undefined;
}
