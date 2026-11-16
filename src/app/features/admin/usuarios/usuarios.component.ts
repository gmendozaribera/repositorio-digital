import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { debounceTime, distinctUntilChanged, merge, Subscription } from 'rxjs';
import type { Carrera } from '../../../api/catalog';
import type {
  ActualizarUsuarioRequest,
  CrearUsuarioRequest,
  PaginaUsuarios,
  Rol,
  Usuario,
} from '../../../api/user';
import { AuthService } from '../../../core/auth/auth.service';
import {
  aplicarErroresDelServidor,
  errorDelServidor,
  mensajeDeError,
} from '../../../core/http/error-message';
import { CatalogoService } from '../../../core/services/catalogo.service';
import { UsuarioService } from '../../../core/services/usuario.service';
import { PaginadorComponent } from '../../../shared/paginador.component';
import {
  AYUDA_PASSWORD_TEMPORAL,
  generarPasswordTemporal,
  VALIDADORES_PASSWORD_TEMPORAL,
} from '../../../shared/password-temporal';

const ACTIVO = 1;
const ENTERO_POSITIVO = /^[1-9]\d{0,9}$/;

/** Roles del contrato con su nombre para mostrar. */
export const ROLES: { valor: Rol; texto: string }[] = [
  { valor: 'ADMIN', texto: 'Administrador' },
  { valor: 'DOCENTE', texto: 'Docente' },
  { valor: 'ESTUDIANTE', texto: 'Estudiante' },
];

/** '' / null -> null; texto numerico -> number (los inputs numericos son de texto). */
function enteroONull(valor: string | number | null | undefined): number | null {
  if (valor === null || valor === undefined || valor === '') {
    return null;
  }
  return Number(valor);
}

/**
 * Administracion de usuarios (personas + cuentas): listado paginado con filtros, alta, edicion,
 * desactivar/reactivar y restablecer contraseña. Todo el modulo es solo ADMIN.
 */
@Component({
  selector: 'app-usuarios',
  imports: [ReactiveFormsModule, PaginadorComponent],
  template: `
    <section class="card">
      <header class="page-header">
        <h1>Usuarios</h1>
        <button class="btn btn-primary" type="button" (click)="nuevo()">Nuevo usuario</button>
      </header>

      <div class="filters" [formGroup]="filtros">
        <label class="field">
          <span>Buscar</span>
          <input
            formControlName="q"
            type="search"
            maxlength="100"
            autocomplete="off"
            placeholder="Usuario, nombre, correo, CI o registro"
          />
        </label>
        <label class="field">
          <span>Rol</span>
          <select formControlName="rol">
            <option [ngValue]="null">Todos</option>
            @for (r of roles; track r.valor) {
              <option [ngValue]="r.valor">{{ r.texto }}</option>
            }
          </select>
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
      </div>
      <label class="check">
        <input type="checkbox" [formControl]="filtros.controls.incluirInactivos" />
        Incluir desactivados
      </label>

      @if (mensaje()) {
        <p class="alert alert-success" role="status">{{ mensaje() }}</p>
      }
      @if (errorListado()) {
        <p class="alert alert-danger" role="alert">{{ errorListado() }}</p>
      }

      @if (formularioAbierto()) {
        <section class="panel" aria-labelledby="titulo-form-usuario">
          <h2 id="titulo-form-usuario">
            {{ enEdicion() ? 'Editar usuario «' + enEdicion()!.usuario + '»' : 'Nuevo usuario' }}
          </h2>
          @if (errorFormulario()) {
            <p class="alert alert-danger" role="alert">{{ errorFormulario() }}</p>
          }
          <form [formGroup]="form" (ngSubmit)="guardar()" novalidate>
            <div class="form-grid">
              <label class="field">
                <span>Usuario (login)</span>
                <input
                  #primerCampo
                  formControlName="usuario"
                  maxlength="50"
                  autocomplete="off"
                  spellcheck="false"
                />
                @if (enEdicion()) {
                  <small class="muted">El nombre de usuario no se puede cambiar.</small>
                }
                @if (form.controls.usuario.touched && form.controls.usuario.invalid) {
                  <small class="field-error">
                    {{
                      errorDelServidor(form.controls.usuario) ??
                        'De 3 a 50 caracteres: letras, números, punto, guion y guion bajo.'
                    }}
                  </small>
                }
              </label>

              @if (!enEdicion()) {
                <label class="field">
                  <span>Contraseña inicial</span>
                  <span class="input-con-boton">
                    <input
                      formControlName="passwordInicial"
                      type="text"
                      maxlength="72"
                      autocomplete="off"
                      spellcheck="false"
                    />
                    <button class="btn btn-outline btn-sm" type="button" (click)="generarInicial()">
                      Generar
                    </button>
                  </span>
                  <small class="muted">Deberá cambiarla en su primer inicio de sesión.</small>
                  @if (
                    form.controls.passwordInicial.touched && form.controls.passwordInicial.invalid
                  ) {
                    <small class="field-error">
                      {{ errorDelServidor(form.controls.passwordInicial) ?? ayudaPassword }}
                    </small>
                  }
                </label>
              }

              <label class="field">
                <span>Rol</span>
                <select formControlName="rol">
                  <option [ngValue]="null" disabled>Seleccione…</option>
                  @for (r of roles; track r.valor) {
                    <option [ngValue]="r.valor">{{ r.texto }}</option>
                  }
                </select>
                @if (form.controls.rol.touched && form.controls.rol.invalid) {
                  <small class="field-error">
                    {{ errorDelServidor(form.controls.rol) ?? 'Seleccione el rol.' }}
                  </small>
                }
              </label>

              <label class="field">
                <span>Nombre</span>
                <input formControlName="nombre" maxlength="100" autocomplete="off" />
                @if (form.controls.nombre.touched && form.controls.nombre.invalid) {
                  <small class="field-error">
                    {{ errorDelServidor(form.controls.nombre) ?? 'Ingrese el nombre (máx. 100).' }}
                  </small>
                }
              </label>

              <label class="field">
                <span>Apellidos</span>
                <input formControlName="apellidos" maxlength="100" autocomplete="off" />
                @if (form.controls.apellidos.touched && form.controls.apellidos.invalid) {
                  <small class="field-error">
                    {{
                      errorDelServidor(form.controls.apellidos) ??
                        'Ingrese los apellidos (máx. 100).'
                    }}
                  </small>
                }
              </label>

              <label class="field">
                <span>CI</span>
                <input formControlName="ci" inputmode="numeric" maxlength="10" autocomplete="off" />
                @if (form.controls.ci.touched && form.controls.ci.invalid) {
                  <small class="field-error">
                    {{ errorDelServidor(form.controls.ci) ?? 'Ingrese el CI (solo números).' }}
                  </small>
                }
              </label>

              <label class="field">
                <span>Correo</span>
                <input formControlName="correo" type="email" maxlength="150" autocomplete="off" />
                @if (form.controls.correo.touched && form.controls.correo.invalid) {
                  <small class="field-error">
                    {{ errorDelServidor(form.controls.correo) ?? 'Ingrese un correo válido.' }}
                  </small>
                }
              </label>

              <label class="field">
                <span>Celular (opcional)</span>
                <input
                  formControlName="celular"
                  inputmode="numeric"
                  maxlength="10"
                  autocomplete="off"
                />
                @if (form.controls.celular.touched && form.controls.celular.invalid) {
                  <small class="field-error">
                    {{ errorDelServidor(form.controls.celular) ?? 'Solo números.' }}
                  </small>
                }
              </label>

              <label class="field">
                <span>Fecha de nacimiento (opcional)</span>
                <input formControlName="fechaNac" type="date" />
                @if (form.controls.fechaNac.touched && form.controls.fechaNac.invalid) {
                  <small class="field-error">
                    {{ errorDelServidor(form.controls.fechaNac) ?? 'Fecha no válida.' }}
                  </small>
                }
              </label>

              @if (esEstudiante()) {
                <label class="field">
                  <span>Número de registro</span>
                  <input
                    formControlName="registro"
                    inputmode="numeric"
                    maxlength="10"
                    autocomplete="off"
                  />
                  @if (form.controls.registro.touched && form.controls.registro.invalid) {
                    <small class="field-error">
                      {{
                        errorDelServidor(form.controls.registro) ??
                          'Ingrese el registro (solo números).'
                      }}
                    </small>
                  }
                </label>

                <label class="field">
                  <span>Carrera</span>
                  <select formControlName="idCarrera">
                    <option [ngValue]="null" disabled>Seleccione…</option>
                    @for (c of carrerasActivas(); track c.idCarrera) {
                      <option [ngValue]="c.idCarrera">{{ c.sigla }} — {{ c.nombre }}</option>
                    }
                  </select>
                  @if (form.controls.idCarrera.touched && form.controls.idCarrera.invalid) {
                    <small class="field-error">
                      {{ errorDelServidor(form.controls.idCarrera) ?? 'Seleccione la carrera.' }}
                    </small>
                  }
                </label>
              }
            </div>
            @if (enEdicion()) {
              <p class="muted">Cambiar el rol cierra todas las sesiones abiertas del usuario.</p>
            }
            <div class="form-actions">
              <button class="btn btn-primary" type="submit" [disabled]="guardando()">
                {{ guardando() ? 'Guardando…' : 'Guardar' }}
              </button>
              <button class="btn btn-link" type="button" (click)="cerrarFormulario()">
                Cancelar
              </button>
            </div>
          </form>
        </section>
      }

      @if (reseteando(); as u) {
        <section
          class="panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="titulo-reset"
          aria-describedby="detalle-reset"
        >
          <h2 id="titulo-reset">Restablecer contraseña de «{{ u.usuario }}»</h2>
          <p id="detalle-reset" class="alert alert-info">
            Se asignará esta contraseña temporal a {{ u.nombre }} {{ u.apellidos }}. Al ingresar se
            le pedirá cambiarla y, por seguridad, se cerrarán todas sus sesiones abiertas.
            Entréguesela por un medio seguro.
          </p>
          @if (errorReset()) {
            <p class="alert alert-danger" role="alert">{{ errorReset() }}</p>
          }
          <form
            [formGroup]="formReset"
            (ngSubmit)="confirmarReset()"
            class="inline-form"
            novalidate
          >
            <label class="field">
              <span>Nueva contraseña temporal</span>
              <input
                #campoReset
                formControlName="passwordNueva"
                type="text"
                maxlength="72"
                autocomplete="off"
                spellcheck="false"
              />
              @if (
                formReset.controls.passwordNueva.touched && formReset.controls.passwordNueva.invalid
              ) {
                <small class="field-error">
                  {{ errorDelServidor(formReset.controls.passwordNueva) ?? ayudaPassword }}
                </small>
              }
            </label>
            <button class="btn btn-outline" type="button" (click)="generarReset()">Generar</button>
          </form>
          <div class="form-actions">
            <button
              class="btn btn-danger"
              type="button"
              [disabled]="guardando()"
              (click)="confirmarReset()"
            >
              {{ guardando() ? 'Restableciendo…' : 'Restablecer contraseña' }}
            </button>
            <button class="btn btn-link" type="button" (click)="reseteando.set(null)">
              Cancelar
            </button>
          </div>
        </section>
      }

      @if (cargando() && !pagina()) {
        <p class="cargando" role="status">Cargando usuarios…</p>
      } @else if (pagina(); as p) {
        @if (p.contenido.length === 0) {
          <p class="estado-vacio">No hay usuarios para el filtro elegido.</p>
        } @else {
          <table class="table" [attr.aria-busy]="cargando()">
            <caption class="sr-only">
              Usuarios
            </caption>
            <thead>
              <tr>
                <th scope="col">Usuario</th>
                <th scope="col">Nombre</th>
                <th scope="col">Rol</th>
                <th scope="col">Carrera</th>
                <th scope="col">Estado</th>
                <th scope="col"><span class="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              @for (u of p.contenido; track u.idUsuario) {
                <tr [class.inactivo]="u.estado !== ACTIVO">
                  <td data-label="Usuario">
                    {{ u.usuario }}
                    <div class="muted texto-chico">{{ u.correo }}</div>
                  </td>
                  <td data-label="Nombre">
                    {{ u.apellidos }}, {{ u.nombre }}
                    <div class="muted texto-chico">
                      CI {{ u.ci }}
                      @if (u.registro) {
                        · Reg. {{ u.registro }}
                      }
                    </div>
                  </td>
                  <td data-label="Rol">
                    <span [class]="claseRol(u.rol)">{{ textoRol(u.rol) }}</span>
                  </td>
                  <td data-label="Carrera">{{ u.siglaCarrera ?? '—' }}</td>
                  <td data-label="Estado">
                    <span class="badges">
                      @if (u.estado === ACTIVO) {
                        <span class="badge badge-success">Activo</span>
                      } @else {
                        <span class="badge badge-muted">Desactivado</span>
                      }
                      @if (u.twoFactorEnabled) {
                        <span class="badge" title="Verificación en dos pasos activa">2FA</span>
                      }
                      @if (u.requiereCambioPassword) {
                        <span class="badge badge-warn">Debe cambiar contraseña</span>
                      }
                    </span>
                  </td>
                  <td class="acciones">
                    <button class="btn btn-outline btn-sm" type="button" (click)="editar(u)">
                      Editar <span class="sr-only">{{ u.usuario }}</span>
                    </button>
                    <button class="btn btn-link btn-sm" type="button" (click)="abrirReset(u)">
                      Restablecer contraseña <span class="sr-only">{{ u.usuario }}</span>
                    </button>
                    @if (u.idUsuario !== idPropio()) {
                      @if (u.estado === ACTIVO) {
                        <button class="btn btn-link btn-sm" type="button" (click)="desactivar(u)">
                          Desactivar <span class="sr-only">{{ u.usuario }}</span>
                        </button>
                      } @else {
                        <button class="btn btn-link btn-sm" type="button" (click)="reactivar(u)">
                          Reactivar <span class="sr-only">{{ u.usuario }}</span>
                        </button>
                      }
                    }
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
export class UsuariosComponent implements OnInit {
  private readonly usuarios = inject(UsuarioService);
  private readonly catalogo = inject(CatalogoService);
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(NonNullableFormBuilder);
  private carga?: Subscription;

  protected readonly roles = ROLES;
  protected readonly ACTIVO = ACTIVO;
  protected readonly ayudaPassword = AYUDA_PASSWORD_TEMPORAL;
  protected readonly errorDelServidor = errorDelServidor;
  protected readonly idPropio = computed(() => this.auth.usuario()?.idUsuario ?? null);

  protected readonly pagina = signal<PaginaUsuarios | null>(null);
  private readonly numeroPagina = signal(0);
  private readonly tamano = signal(20);
  protected readonly cargando = signal(false);
  protected readonly guardando = signal(false);
  protected readonly errorListado = signal<string | null>(null);
  protected readonly errorFormulario = signal<string | null>(null);
  protected readonly errorReset = signal<string | null>(null);
  protected readonly mensaje = signal<string | null>(null);
  protected readonly formularioAbierto = signal(false);
  protected readonly enEdicion = signal<Usuario | null>(null);
  protected readonly reseteando = signal<Usuario | null>(null);

  protected readonly carreras = signal<Carrera[]>([]);
  protected readonly carrerasActivas = computed(() =>
    this.carreras().filter((c) => c.estado === ACTIVO),
  );

  private readonly primerCampo = viewChild<ElementRef<HTMLElement>>('primerCampo');
  private readonly campoReset = viewChild<ElementRef<HTMLElement>>('campoReset');

  protected readonly filtros = this.fb.group({
    q: [''],
    rol: new FormControl<Rol | null>(null),
    idCarrera: new FormControl<number | null>(null),
    incluirInactivos: [false],
  });

  protected readonly form = this.fb.group({
    usuario: [
      '',
      [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(50),
        Validators.pattern(/^[A-Za-z0-9._-]+$/),
      ],
    ],
    passwordInicial: ['', VALIDADORES_PASSWORD_TEMPORAL],
    rol: new FormControl<Rol | null>(null, Validators.required),
    nombre: ['', [Validators.required, Validators.maxLength(100)]],
    apellidos: ['', [Validators.required, Validators.maxLength(100)]],
    ci: ['', [Validators.required, Validators.pattern(ENTERO_POSITIVO)]],
    correo: ['', [Validators.required, Validators.email, Validators.maxLength(150)]],
    celular: ['', Validators.pattern(ENTERO_POSITIVO)],
    fechaNac: [''],
    registro: ['', Validators.pattern(ENTERO_POSITIVO)],
    idCarrera: new FormControl<number | null>(null),
  });

  protected readonly formReset = this.fb.group({
    passwordNueva: ['', VALIDADORES_PASSWORD_TEMPORAL],
  });

  private readonly rolDelFormulario = signal<Rol | null>(null);
  protected readonly esEstudiante = computed(() => this.rolDelFormulario() === 'ESTUDIANTE');

  constructor() {
    // El texto se busca con debounce para no consultar en cada tecla; los selects, al instante.
    const texto = this.filtros.controls.q.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged(),
    );
    const resto = merge(
      this.filtros.controls.rol.valueChanges,
      this.filtros.controls.idCarrera.valueChanges,
      this.filtros.controls.incluirInactivos.valueChanges,
    );
    merge(texto, resto)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.numeroPagina.set(0);
        this.cargar();
      });

    // Registro y carrera son obligatorios solo para ESTUDIANTE.
    this.form.controls.rol.valueChanges.pipe(takeUntilDestroyed()).subscribe((rol) => {
      this.rolDelFormulario.set(rol);
      this.ajustarCamposEstudiante(rol);
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

  protected textoRol(rol: Rol): string {
    return ROLES.find((r) => r.valor === rol)?.texto ?? rol;
  }

  protected claseRol(rol: Rol): string {
    return rol === 'ADMIN'
      ? 'badge badge-purple'
      : rol === 'DOCENTE'
        ? 'badge'
        : 'badge badge-info';
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

  protected nuevo(): void {
    this.enEdicion.set(null);
    this.reseteando.set(null);
    this.form.reset();
    this.form.controls.usuario.enable();
    this.form.controls.passwordInicial.enable();
    this.rolDelFormulario.set(null);
    this.ajustarCamposEstudiante(null);
    this.abrirFormulario();
  }

  protected editar(u: Usuario): void {
    this.enEdicion.set(u);
    this.reseteando.set(null);
    this.form.reset();
    this.form.patchValue({
      usuario: u.usuario,
      rol: u.rol,
      nombre: u.nombre,
      apellidos: u.apellidos,
      ci: String(u.ci),
      correo: u.correo,
      celular: u.celular === null ? '' : String(u.celular),
      fechaNac: u.fechaNac ?? '',
      registro: u.registro === null ? '' : String(u.registro),
      idCarrera: u.idCarrera,
    });
    // El login no se edita y la contraseña se cambia con "Restablecer contraseña".
    this.form.controls.usuario.disable();
    this.form.controls.passwordInicial.disable();
    this.abrirFormulario();
  }

  protected cerrarFormulario(): void {
    this.formularioAbierto.set(false);
    this.enEdicion.set(null);
    this.errorFormulario.set(null);
  }

  protected generarInicial(): void {
    this.form.controls.passwordInicial.setValue(generarPasswordTemporal());
    this.form.controls.passwordInicial.markAsTouched();
  }

  protected guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const actual = this.enEdicion();
    const peticion = actual
      ? this.usuarios.actualizar(actual.idUsuario, this.requestActualizar(actual))
      : this.usuarios.crear(this.requestCrear());

    this.guardando.set(true);
    this.errorFormulario.set(null);
    this.mensaje.set(null);
    peticion.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (u) => {
        this.guardando.set(false);
        this.cerrarFormulario();
        this.mensaje.set(
          actual
            ? `Usuario «${u.usuario}» actualizado.`
            : `Usuario «${u.usuario}» creado. Deberá cambiar la contraseña en su primer inicio de sesión.`,
        );
        this.cargar();
      },
      error: (err: unknown) => {
        this.guardando.set(false);
        this.errorFormulario.set(aplicarErroresDelServidor(this.form, err));
      },
    });
  }

  protected desactivar(u: Usuario): void {
    if (
      !confirm(
        `¿Desactivar a «${u.usuario}» (${u.nombre} ${u.apellidos})? No podrá iniciar sesión y se ` +
          'cerrarán sus sesiones abiertas. Podrá reactivarlo después.',
      )
    ) {
      return;
    }
    this.ejecutarAccion(this.usuarios.desactivar(u.idUsuario), 'desactivado');
  }

  protected reactivar(u: Usuario): void {
    if (!confirm(`¿Reactivar a «${u.usuario}» (${u.nombre} ${u.apellidos})?`)) {
      return;
    }
    const body: ActualizarUsuarioRequest = { ...this.requestDe(u), estado: ACTIVO };
    this.ejecutarAccion(this.usuarios.actualizar(u.idUsuario, body), 'reactivado');
  }

  protected abrirReset(u: Usuario): void {
    this.cerrarFormulario();
    this.formReset.reset({ passwordNueva: generarPasswordTemporal() });
    this.errorReset.set(null);
    this.mensaje.set(null);
    this.reseteando.set(u);
    afterNextRender(() => this.campoReset()?.nativeElement.focus(), { injector: this.injector });
  }

  protected generarReset(): void {
    this.formReset.controls.passwordNueva.setValue(generarPasswordTemporal());
  }

  protected confirmarReset(): void {
    const u = this.reseteando();
    if (!u) {
      return;
    }
    if (this.formReset.invalid) {
      this.formReset.markAllAsTouched();
      return;
    }
    this.guardando.set(true);
    this.errorReset.set(null);
    this.usuarios
      .restablecerPassword(u.idUsuario, this.formReset.getRawValue().passwordNueva)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.guardando.set(false);
          this.reseteando.set(null);
          this.formReset.reset();
          this.mensaje.set(
            `Contraseña de «${u.usuario}» restablecida. Deberá cambiarla al ingresar; sus sesiones ` +
              'abiertas se cerraron.',
          );
          this.cargar();
        },
        error: (err: unknown) => {
          this.guardando.set(false);
          this.errorReset.set(
            aplicarErroresDelServidor(this.formReset, err, 'No se pudo restablecer la contraseña.'),
          );
        },
      });
  }

  private cargar(): void {
    this.carga?.unsubscribe();
    this.cargando.set(true);
    this.errorListado.set(null);
    const { q, rol, idCarrera, incluirInactivos } = this.filtros.getRawValue();
    this.carga = this.usuarios
      .listar({
        q,
        rol: rol ?? undefined,
        idCarrera: idCarrera ?? undefined,
        incluirInactivos,
        pagina: this.numeroPagina(),
        tamano: this.tamano(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => {
          this.cargando.set(false);
          // Si se borro/desactivo el ultimo de la pagina, volver a la anterior.
          if (p.contenido.length === 0 && p.pagina > 0 && p.pagina >= p.totalPaginas) {
            this.irAPagina(Math.max(p.totalPaginas - 1, 0));
            return;
          }
          this.pagina.set(p);
        },
        error: (err: unknown) => {
          this.cargando.set(false);
          this.pagina.set(null);
          this.errorListado.set(mensajeDeError(err, 'No se pudo cargar el listado de usuarios.'));
        },
      });
  }

  private ajustarCamposEstudiante(rol: Rol | null): void {
    const { registro, idCarrera } = this.form.controls;
    if (rol === 'ESTUDIANTE') {
      registro.setValidators([Validators.required, Validators.pattern(ENTERO_POSITIVO)]);
      idCarrera.setValidators(Validators.required);
    } else {
      registro.setValidators(Validators.pattern(ENTERO_POSITIVO));
      idCarrera.clearValidators();
    }
    registro.updateValueAndValidity({ emitEvent: false });
    idCarrera.updateValueAndValidity({ emitEvent: false });
  }

  /** Campos comunes de alta y edicion a partir del formulario. */
  private datosPersona(anterior: Usuario | null) {
    const v = this.form.getRawValue();
    const estudiante = v.rol === 'ESTUDIANTE';
    return {
      rol: v.rol as Rol,
      nombre: v.nombre.trim(),
      apellidos: v.apellidos.trim(),
      ci: Number(v.ci),
      correo: v.correo.trim(),
      celular: enteroONull(v.celular),
      fechaNac: v.fechaNac || null,
      // Registro y carrera solo se editan para ESTUDIANTE; en otros roles se conserva lo que haya.
      registro: estudiante ? enteroONull(v.registro) : (anterior?.registro ?? null),
      idCarrera: estudiante ? v.idCarrera : (anterior?.idCarrera ?? null),
    };
  }

  private requestCrear(): CrearUsuarioRequest {
    const v = this.form.getRawValue();
    return {
      usuario: v.usuario.trim(),
      passwordInicial: v.passwordInicial,
      ...this.datosPersona(null),
    };
  }

  /** Sin `estado`: el backend conserva el actual. */
  private requestActualizar(anterior: Usuario): ActualizarUsuarioRequest {
    return this.datosPersona(anterior);
  }

  /** Request que reconstruye un usuario existente (para reactivarlo sin perder datos). */
  private requestDe(u: Usuario): ActualizarUsuarioRequest {
    return {
      rol: u.rol,
      nombre: u.nombre,
      apellidos: u.apellidos,
      ci: u.ci,
      correo: u.correo,
      celular: u.celular,
      fechaNac: u.fechaNac,
      registro: u.registro,
      idCarrera: u.idCarrera,
    };
  }

  private ejecutarAccion(accion: ReturnType<UsuarioService['desactivar']>, verbo: string): void {
    this.mensaje.set(null);
    this.errorListado.set(null);
    accion.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (u) => {
        this.mensaje.set(`Usuario «${u.usuario}» ${verbo}.`);
        this.cargar();
      },
      error: (err: unknown) =>
        this.errorListado.set(mensajeDeError(err, 'No se pudo completar la acción.')),
    });
  }

  private abrirFormulario(): void {
    this.errorFormulario.set(null);
    this.mensaje.set(null);
    this.formularioAbierto.set(true);
    afterNextRender(() => this.primerCampo()?.nativeElement.focus(), { injector: this.injector });
  }
}
