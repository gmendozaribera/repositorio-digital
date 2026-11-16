import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, concatMap, from, tap, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import type { Dominio, ProblemDetail } from '../../../api/user';
import { AuthService } from '../../../core/auth/auth.service';
import {
  aplicarErroresDelServidor,
  errorDelServidor,
  mensajeDeError,
} from '../../../core/http/error-message';
import { DominioService, GRUPO_SMTP } from '../../../core/services/dominio.service';

/** Parametros de SMTP_GROUP que edita esta pantalla (domainName en la tabla de dominio). */
export const PARAMETROS_SMTP = ['HOST', 'PUERTO', 'CORREO', 'PASSWORD', 'SEGURIDAD', 'ACTIVO'];
export const SEGURIDADES_SMTP = ['SSL', 'STARTTLS', 'NINGUNA'] as const;
type SeguridadSmtp = (typeof SEGURIDADES_SMTP)[number];

/** Control del formulario -> parametro de SMTP_GROUP (PASSWORD se trata aparte). */
const CAMPO_A_PARAMETRO = {
  host: 'HOST',
  puerto: 'PUERTO',
  correo: 'CORREO',
  seguridad: 'SEGURIDAD',
  activo: 'ACTIVO',
  password: 'PASSWORD',
} as const;
type CampoSmtp = keyof typeof CAMPO_A_PARAMETRO;

/** Puerto -> seguridad que se suele usar con el. */
const SEGURIDAD_TIPICA: Record<number, SeguridadSmtp> = { 465: 'SSL', 587: 'STARTTLS' };

interface Cambio {
  campo: CampoSmtp;
  dominio: Dominio;
  valor: string;
}

/**
 * Correo saliente (SMTP). Los datos viven en la tabla de dominio (grupo SMTP_GROUP, user-service):
 * cada campo es un parametro y al guardar se hace un PUT /dominios/{id} SOLO por cada parametro
 * modificado, conservando su descripcion. La contrasena es un parametro secreto: el servidor nunca
 * la devuelve, asi que el campo empieza vacio y solo se envia si el administrador escribe una
 * nueva (o elige borrarla).
 */
@Component({
  selector: 'app-config-smtp',
  imports: [ReactiveFormsModule],
  template: `
    <header class="page-header">
      <h1>Correo saliente (SMTP)</h1>
    </header>

    <p class="alert alert-info">
      El sistema usa esta cuenta para enviar correos (por ejemplo, avisos a los usuarios). Pida los
      datos al responsable del servidor de correo; con Gmail u Outlook use una «contraseña de
      aplicación», no la contraseña personal de la cuenta.
    </p>

    @if (mensaje()) {
      <p class="alert alert-success" role="status">{{ mensaje() }}</p>
    }
    @if (error()) {
      <p class="alert alert-danger" role="alert">{{ error() }}</p>
    }
    @if (faltantes().length) {
      <p class="alert alert-warn">
        Faltan parámetros en el grupo SMTP_GROUP: {{ faltantes().join(', ') }}. Esos campos no se
        pueden guardar hasta que existan (revise las migraciones del backend).
      </p>
    }

    @if (cargando()) {
      <p class="cargando" role="status">Cargando configuración de correo…</p>
    } @else if (parametros().size > 0) {
      <form [formGroup]="form" (ngSubmit)="guardar()" novalidate>
        <label class="switch campo-activo">
          <input type="checkbox" role="switch" formControlName="activo" />
          <span>
            Envío de correos {{ form.controls.activo.value ? 'activado' : 'desactivado' }}
          </span>
        </label>
        @if (!form.controls.activo.value) {
          <p class="muted texto-chico">
            Mientras esté desactivado el sistema no envía correos (la prueba de abajo sí funciona,
            para poder verificar los datos antes de activarlo).
          </p>
        }

        <div class="form-grid">
          <label class="field">
            <span>Servidor (host)</span>
            <input
              formControlName="host"
              maxlength="500"
              autocomplete="off"
              spellcheck="false"
              placeholder="smtp.gmail.com"
            />
            @if (invalido('host')) {
              <small class="field-error">{{
                errorDelServidor(form.controls.host) ?? 'Ingrese el servidor de correo.'
              }}</small>
            }
          </label>

          <label class="field">
            <span>Puerto</span>
            <input type="number" formControlName="puerto" min="1" max="65535" step="1" />
            @if (invalido('puerto')) {
              <small class="field-error">{{
                errorDelServidor(form.controls.puerto) ?? 'Ingrese un puerto entre 1 y 65535.'
              }}</small>
            }
          </label>

          <label class="field">
            <span>Seguridad</span>
            <select formControlName="seguridad">
              <option value="SSL">SSL</option>
              <option value="STARTTLS">STARTTLS</option>
              <option value="NINGUNA">Ninguna (sin cifrar)</option>
            </select>
            @if (sugerenciaSeguridad(); as s) {
              <small class="field-error">{{ s }}</small>
            } @else {
              <small class="muted texto-chico">
                Lo habitual: puerto 465 → SSL; puerto 587 → STARTTLS.
              </small>
            }
          </label>

          <label class="field">
            <span>Correo remitente</span>
            <input
              type="email"
              formControlName="correo"
              maxlength="150"
              autocomplete="off"
              spellcheck="false"
              placeholder="repositorio@uagrm.edu.bo"
            />
            @if (invalido('correo')) {
              <small class="field-error">{{
                errorDelServidor(form.controls.correo) ?? 'Ingrese un correo válido.'
              }}</small>
            }
          </label>
        </div>

        <label class="field">
          <span>Contraseña de la cuenta de correo</span>
          <input
            type="password"
            formControlName="password"
            maxlength="500"
            autocomplete="new-password"
            [placeholder]="
              passwordConfigurada()
                ? '•••••• (configurada, dejar vacío para no cambiar)'
                : 'Sin configurar'
            "
          />
          @if (errorDelServidor(form.controls.password); as e) {
            <small class="field-error">{{ e }}</small>
          } @else {
            <small class="muted texto-chico">
              Se guarda cifrada y nunca se vuelve a mostrar, ni siquiera al administrador.
            </small>
          }
        </label>
        @if (passwordConfigurada()) {
          <label class="check">
            <input type="checkbox" formControlName="borrarPassword" />
            Borrar contraseña (para servidores que no piden autenticación)
          </label>
        }

        <div class="form-actions">
          <button class="btn btn-primary" type="submit" [disabled]="guardando()">
            {{ guardando() ? 'Guardando…' : 'Guardar' }}
          </button>
          <button
            class="btn btn-link"
            type="button"
            [disabled]="guardando() || form.pristine"
            (click)="deshacer()"
          >
            Deshacer cambios
          </button>
        </div>
      </form>

      <section class="panel" aria-labelledby="titulo-prueba-smtp">
        <h2 id="titulo-prueba-smtp">Enviar correo de prueba</h2>
        <p class="muted texto-chico">
          La prueba usa la configuración <strong>guardada</strong>: guarde los cambios antes de
          probar. Puede tardar hasta 15 segundos.
        </p>
        @if (form.dirty) {
          <p class="alert alert-warn">Tiene cambios sin guardar: la prueba no los usará.</p>
        }
        @if (resultadoPrueba(); as r) {
          <p
            class="alert"
            [class.alert-success]="r.ok"
            [class.alert-danger]="!r.ok"
            [attr.role]="r.ok ? 'status' : 'alert'"
          >
            {{ r.texto }}
          </p>
        }
        <form class="inline-form" [formGroup]="formPrueba" (ngSubmit)="probar()" novalidate>
          <label class="field">
            <span>Destinatario</span>
            <input type="email" formControlName="destinatario" maxlength="150" />
            @if (
              formPrueba.controls.destinatario.touched && formPrueba.controls.destinatario.invalid
            ) {
              <small class="field-error">{{
                errorDelServidor(formPrueba.controls.destinatario) ?? 'Ingrese un correo válido.'
              }}</small>
            }
          </label>
          <button class="btn btn-outline" type="submit" [disabled]="probando()">
            {{ probando() ? 'Enviando…' : 'Enviar correo de prueba' }}
          </button>
        </form>
      </section>
    }
  `,
})
export class ConfigSmtpComponent implements OnInit {
  private readonly dominios = inject(DominioService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly errorDelServidor = errorDelServidor;

  /** domainName -> parametro tal como esta guardado. */
  protected readonly parametros = signal(new Map<string, Dominio>());
  protected readonly cargando = signal(false);
  protected readonly guardando = signal(false);
  protected readonly probando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly mensaje = signal<string | null>(null);
  protected readonly resultadoPrueba = signal<{ ok: boolean; texto: string } | null>(null);

  protected readonly faltantes = computed(() =>
    this.parametros().size ? PARAMETROS_SMTP.filter((n) => !this.parametros().has(n)) : [],
  );
  protected readonly passwordConfigurada = computed(
    () => this.parametros().get('PASSWORD')?.configurado ?? false,
  );

  protected readonly form = this.fb.group({
    activo: [false],
    host: ['', [Validators.maxLength(500)]],
    puerto: this.fb.control<number | null>(null, [
      Validators.min(1),
      Validators.max(65535),
      Validators.pattern(/^\d+$/),
    ]),
    seguridad: this.fb.control<SeguridadSmtp>('STARTTLS'),
    correo: ['', [Validators.email, Validators.maxLength(150)]],
    password: ['', [Validators.maxLength(500)]],
    borrarPassword: [false],
  });

  protected readonly formPrueba = this.fb.group({
    destinatario: [
      this.auth.usuario()?.correo ?? '',
      [Validators.required, Validators.email, Validators.maxLength(150)],
    ],
  });

  private readonly valores = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  /** Aviso si el puerto y la seguridad elegidos no suelen ir juntos (no bloquea el guardado). */
  protected readonly sugerenciaSeguridad = computed(() => {
    const { puerto, seguridad } = this.valores();
    const tipica = puerto ? SEGURIDAD_TIPICA[puerto] : undefined;
    return tipica && tipica !== seguridad
      ? `Con el puerto ${puerto} normalmente se usa ${tipica}.`
      : null;
  });

  constructor() {
    // Con el envio activado, servidor, puerto y remitente son obligatorios.
    const obligatorios = [
      this.form.controls.host,
      this.form.controls.puerto,
      this.form.controls.correo,
    ];
    this.form.controls.activo.valueChanges.pipe(takeUntilDestroyed()).subscribe((activo) => {
      for (const c of obligatorios) {
        if (activo) {
          c.addValidators(Validators.required);
        } else {
          c.removeValidators(Validators.required);
        }
        c.updateValueAndValidity({ emitEvent: false });
      }
    });
    // "Borrar contraseña" y escribir una nueva son excluyentes.
    this.form.controls.borrarPassword.valueChanges.pipe(takeUntilDestroyed()).subscribe((b) => {
      const password = this.form.controls.password;
      if (b) {
        password.setValue('');
        password.disable({ emitEvent: false });
      } else {
        password.enable({ emitEvent: false });
      }
    });
  }

  ngOnInit(): void {
    this.cargar();
  }

  protected invalido(campo: CampoSmtp): boolean {
    const c = this.form.controls[campo];
    return c.touched && c.invalid;
  }

  protected deshacer(): void {
    this.cargarEnFormulario();
    this.mensaje.set(null);
    this.error.set(null);
  }

  protected guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const cambios = this.cambios();
    this.mensaje.set(null);
    this.error.set(null);
    if (cambios.length === 0) {
      this.mensaje.set('No hay cambios para guardar.');
      return;
    }
    this.guardando.set(true);
    // Uno tras otro: si uno falla se sabe cual fue y los anteriores quedan guardados (y marcados
    // como tales), asi el siguiente "Guardar" solo reenvia lo pendiente.
    from(cambios)
      .pipe(
        concatMap((c) =>
          this.dominios
            .actualizar(c.dominio.domainId, {
              domainValue: c.valor,
              description: c.dominio.description,
            })
            .pipe(
              tap((d) => this.registrarGuardado(c.campo, d)),
              catchError((err: unknown) => throwError(() => ({ cambio: c, err }))),
            ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        complete: () => {
          this.guardando.set(false);
          this.cargarEnFormulario();
          this.mensaje.set(
            'Configuración de correo guardada. Ya puede enviar un correo de prueba.',
          );
        },
        error: ({ cambio, err }: { cambio: Cambio; err: unknown }) => {
          this.guardando.set(false);
          this.error.set(this.errorDeCambio(cambio, err));
        },
      });
  }

  protected probar(): void {
    if (this.formPrueba.invalid) {
      this.formPrueba.markAllAsTouched();
      return;
    }
    const destinatario = this.formPrueba.controls.destinatario.value.trim();
    this.probando.set(true);
    this.resultadoPrueba.set(null);
    this.dominios
      .probarSmtp(destinatario)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.probando.set(false);
          this.resultadoPrueba.set({
            ok: true,
            texto: `Correo de prueba enviado a ${destinatario}. Revise la bandeja de entrada (y la carpeta de spam).`,
          });
        },
        error: (err: unknown) => {
          this.probando.set(false);
          // 502: el servidor de correo rechazo la conexion o las credenciales; el motivo viene en detail.
          this.resultadoPrueba.set({
            ok: false,
            texto: aplicarErroresDelServidor(
              this.formPrueba,
              err,
              'No se pudo enviar el correo de prueba.',
            ),
          });
        },
      });
  }

  /** Parametros cuyo valor en el formulario difiere del guardado. */
  private cambios(): Cambio[] {
    const v = this.form.getRawValue();
    const valores: Partial<Record<CampoSmtp, string>> = {
      host: v.host.trim(),
      puerto: v.puerto === null ? '' : String(v.puerto),
      correo: v.correo.trim(),
      seguridad: v.seguridad,
      activo: String(v.activo),
    };
    // La contrasena no se compara (nunca se conoce): se envia solo si se escribio una o se borra.
    if (v.borrarPassword) {
      valores.password = '';
    } else if (v.password !== '') {
      valores.password = v.password;
    }
    const cambios: Cambio[] = [];
    for (const [campo, valor] of Object.entries(valores) as [CampoSmtp, string][]) {
      const dominio = this.parametros().get(CAMPO_A_PARAMETRO[campo]);
      if (dominio && (campo === 'password' || dominio.domainValue !== valor)) {
        cambios.push({ campo, dominio, valor });
      }
    }
    return cambios;
  }

  private registrarGuardado(campo: CampoSmtp, d: Dominio): void {
    const mapa = new Map(this.parametros());
    mapa.set(d.domainName, d);
    this.parametros.set(mapa);
    if (campo === 'password') {
      this.form.controls.borrarPassword.setValue(false);
      this.form.controls.password.reset('');
    } else {
      this.form.controls[campo].markAsPristine();
    }
  }

  private errorDeCambio(cambio: Cambio, err: unknown): string {
    // El 400 de la tabla de dominio informa el error en `domainValue`: se lleva al campo.
    const problema = err instanceof HttpErrorResponse ? (err.error as ProblemDetail | null) : null;
    const enValor = problema?.errores?.['domainValue'];
    if (enValor) {
      const control = this.form.controls[cambio.campo];
      control.setErrors({ ...control.errors, servidor: enValor });
      control.markAsTouched();
    }
    return `No se pudo guardar ${cambio.dominio.domainName}: ${enValor ?? mensajeDeError(err, 'error inesperado.')}`;
  }

  private cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.dominios
      .listar(GRUPO_SMTP)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (lista) => {
          this.cargando.set(false);
          this.parametros.set(new Map(lista.map((d) => [d.domainName, d])));
          if (lista.length === 0) {
            this.error.set(
              'No hay parámetros en el grupo SMTP_GROUP. Revise las migraciones del backend.',
            );
          }
          this.cargarEnFormulario();
        },
        error: (err: unknown) => {
          this.cargando.set(false);
          this.error.set(mensajeDeError(err, 'No se pudo cargar la configuración de correo.'));
        },
      });
  }

  private cargarEnFormulario(): void {
    const valor = (n: string) => this.parametros().get(n)?.domainValue ?? '';
    const puerto = Number.parseInt(valor('PUERTO'), 10);
    const seguridad = valor('SEGURIDAD') as SeguridadSmtp;
    this.form.reset({
      activo: valor('ACTIVO').toLowerCase() === 'true',
      host: valor('HOST'),
      puerto: Number.isNaN(puerto) ? null : puerto,
      seguridad: SEGURIDADES_SMTP.includes(seguridad) ? seguridad : 'STARTTLS',
      correo: valor('CORREO'),
      password: '',
      borrarPassword: false,
    });
    // Un parametro inexistente no se puede guardar: su campo queda deshabilitado.
    for (const [campo, nombre] of Object.entries(CAMPO_A_PARAMETRO) as [CampoSmtp, string][]) {
      const c = this.form.controls[campo];
      if (this.parametros().has(nombre)) {
        c.enable({ emitEvent: false });
      } else {
        c.disable({ emitEvent: false });
      }
    }
  }
}
