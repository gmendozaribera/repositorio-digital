import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideApi } from '../../../core/api/api.providers';
import { PaginaVacia, respuesta, tokensDePrueba } from '../../../core/auth/testing';
import { REGLAS, SIN_ACCIONES, trabajoDePrueba } from '../../../core/services/testing-trabajos';
import { TrabajoFormComponent } from './trabajo-form.component';

const API = '/api/v1';
const FACULTADES = [
  { idFacultad: 1, nombre: 'Computación', sigla: 'FICCT', estado: 1 },
  { idFacultad: 2, nombre: 'Tecnología', sigla: 'FCYT', estado: 1 },
];
const MATERIAS = [
  { idMateria: 10, nombre: 'Software I', sigla: 'INF412', idFacultad: 1, estado: 1 },
];
const SEMESTRES = [{ idSemestre: 5, semestre: 2, anio: 2026, idFacultad: 1, estado: 1 }];
const TIPOS = [{ idTipoTrabajo: 4, nombre: 'Proyecto de materia', idFacultad: 1, estado: 1 }];
const GRUPOS = [{ idGrupo: 3, nombre: 'SA', idMateria: 10, idSemestre: 5, estado: 1 }];

describe('TrabajoFormComponent', () => {
  let fixture: ComponentFixture<TrabajoFormComponent>;
  let http: HttpTestingController;
  let vista: HTMLElement;

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function boton(texto: string): HTMLButtonElement {
    const b = Array.from(vista.querySelectorAll('button')).find((x) =>
      x.textContent?.trim().startsWith(texto),
    );
    if (!b) throw new Error(`No hay botón "${texto}"`);
    return b;
  }

  function select(nombre: string): HTMLSelectElement {
    return vista.querySelector<HTMLSelectElement>(`select[formcontrolname=${nombre}]`)!;
  }

  async function elegir(nombre: string, indice: number): Promise<void> {
    const s = select(nombre);
    s.selectedIndex = indice;
    s.dispatchEvent(new Event('change'));
    await render();
  }

  function escribir(selector: string, valor: string): void {
    const input = vista.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
    input.value = valor;
    input.dispatchEvent(new Event('input'));
  }

  async function agregarChip(id: string, valor: string): Promise<void> {
    escribir(`#${id}`, valor);
    vista.querySelector(`#${id}`)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await render();
  }

  function chips(): string[] {
    return Array.from(vista.querySelectorAll('.chip')).map((c) =>
      c
        .textContent!.replace(/Quitar.*$/, '')
        .replace('×', '')
        .trim(),
    );
  }

  function errores(): string[] {
    return Array.from(vista.querySelectorAll('.field-error')).map((e) => e.textContent!.trim());
  }

  function listasDeFacultad(id = 1, maxAutores = 5): void {
    const conFacultad =
      (url: string) => (r: { url: string; params: { get(k: string): string | null } }) =>
        r.url === url && r.params.get('idFacultad') === String(id);
    http.expectOne(conFacultad(`${API}/materias`)).flush(respuesta(MATERIAS));
    http.expectOne(conFacultad(`${API}/semestres`)).flush(respuesta(SEMESTRES));
    http.expectOne(conFacultad(`${API}/tipos-trabajo`)).flush(respuesta(TIPOS));
    http
      .expectOne(conFacultad(`${API}/documentos/reglas`))
      .flush(respuesta({ ...REGLAS, maxAutores }));
  }

  async function crear(id?: string): Promise<void> {
    fixture = TestBed.createComponent(TrabajoFormComponent);
    vista = fixture.nativeElement;
    if (id) {
      fixture.componentRef.setInput('id', id);
    }
    await render();
  }

  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem(
      'repositorio.sesion',
      JSON.stringify(tokensDePrueba('ESTUDIANTE', { usuario: '219012345' })),
    );
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApi(),
        provideRouter([{ path: '**', component: PaginaVacia }]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  describe('alta', () => {
    beforeEach(async () => {
      await crear();
      http.expectOne(`${API}/facultades`).flush(respuesta(FACULTADES));
      await render();
    });

    it('selects dependientes: facultad -> materia -> semestre -> grupo', async () => {
      expect(select('idMateria').disabled).toBe(true);
      expect(select('idSemestre').disabled).toBe(true);
      expect(select('idGrupo').disabled).toBe(true);

      await elegir('idFacultad', 1);
      listasDeFacultad(1);
      await render();
      expect(select('idMateria').disabled).toBe(false);
      expect(select('idTipoTrabajo').disabled).toBe(false);
      expect(select('idSemestre').disabled).toBe(true);

      await elegir('idMateria', 1);
      expect(select('idSemestre').disabled).toBe(false);
      expect(select('idGrupo').disabled).toBe(true);

      await elegir('idSemestre', 1);
      const grupos = http.expectOne((r) => r.url === `${API}/grupos`);
      expect(grupos.request.params.get('idMateria')).toBe('10');
      expect(grupos.request.params.get('idSemestre')).toBe('5');
      grupos.flush(respuesta(GRUPOS));
      await render();
      expect(select('idGrupo').disabled).toBe(false);
      expect(Array.from(select('idGrupo').options).map((o) => o.textContent!.trim())).toEqual([
        'Seleccione…',
        'Grupo SA',
      ]);

      // Cambiar de facultad limpia y bloquea todo lo que depende de ella.
      await elegir('idFacultad', 2);
      listasDeFacultad(2);
      await render();
      expect(select('idMateria').selectedIndex).toBe(0);
      expect(select('idSemestre').disabled).toBe(true);
      expect(select('idGrupo').disabled).toBe(true);
    });

    it('hashtags y coautores como chips con sus validaciones', async () => {
      await agregarChip('nuevo-hashtag', '#SpringBoot');
      expect(chips()).toEqual(['#springboot']);
      await agregarChip('nuevo-hashtag', 'springboot');
      expect(errores()).toContain('#springboot ya está agregado.');
      await agregarChip('nuevo-hashtag', 'con espacio');
      expect(errores()[0]).toContain('sin espacios');

      // El propio registro (login del estudiante) no se agrega como coautor.
      await agregarChip('nuevo-coautor', '219012345');
      expect(errores()).toContain('Tú ya eres autor del trabajo.');
      await agregarChip('nuevo-coautor', '12ab');
      expect(errores()).toContain('El número de registro solo lleva dígitos.');
      await agregarChip('nuevo-coautor', '219012346');
      expect(chips()).toEqual(['#springboot', 'Reg. 219012346']);

      boton('×').click();
      await render();
      expect(chips()).toEqual(['Reg. 219012346']);
    });

    it('limita los coautores a maxAutores - 1 según las reglas de la facultad', async () => {
      await elegir('idFacultad', 1);
      listasDeFacultad(1, 2);
      await render();
      expect(vista.textContent).toContain(
        'Máximo 2 autores por trabajo contándote a ti (hasta 1 coautor)',
      );
      await agregarChip('nuevo-coautor', '219012346');
      await agregarChip('nuevo-coautor', '219012347');
      expect(chips()).toEqual(['Reg. 219012346']);
      expect(errores()).toContain(
        'Un trabajo puede tener como máximo 2 autores contándote a ti: puedes agregar hasta 1 coautor.',
      );

      // Otra facultad con un solo autor por trabajo.
      await elegir('idFacultad', 2);
      listasDeFacultad(2, 1);
      await render();
      boton('×').click();
      await render();
      await agregarChip('nuevo-coautor', '219012346');
      expect(errores()[0]).toContain('no se pueden agregar coautores');
    });

    it('valida antes de enviar y al crear navega al detalle del borrador', async () => {
      const navegar = vi.spyOn(TestBed.inject(Router), 'navigate');
      boton('Crear borrador').click();
      await render();
      http.expectNone(`${API}/trabajos`);
      expect(errores()).toContain('Entre 5 y 200 caracteres.');
      expect(errores()).toContain('Seleccione la facultad.');

      escribir('input[formcontrolname=titulo]', 'Sistema de inventarios');
      escribir('textarea[formcontrolname=resumen]', 'Corto');
      await render();
      expect(vista.querySelector('.contador')?.textContent).toContain('5 / 3000');
      expect(vista.querySelector('.contador')?.textContent).toContain('mínimo 20');
      escribir(
        'textarea[formcontrolname=resumen]',
        'Un resumen suficientemente largo del trabajo.',
      );

      await elegir('idFacultad', 1);
      listasDeFacultad(1);
      await render();
      await elegir('idMateria', 1);
      await elegir('idSemestre', 1);
      http.expectOne((r) => r.url === `${API}/grupos`).flush(respuesta(GRUPOS));
      await render();
      await elegir('idGrupo', 1);
      await elegir('idTipoTrabajo', 1);
      await agregarChip('nuevo-hashtag', 'inventarios');
      // Lo escrito en el campo de coautor y no agregado tambien se envia.
      escribir('#nuevo-coautor', '219012346');

      boton('Crear borrador').click();
      await render();
      const post = http.expectOne(`${API}/trabajos`);
      expect(post.request.body).toEqual({
        titulo: 'Sistema de inventarios',
        resumen: 'Un resumen suficientemente largo del trabajo.',
        idGrupo: 3,
        idTipoTrabajo: 4,
        hashtags: ['inventarios'],
        registrosCoautores: [219012346],
      });
      post.flush(respuesta(trabajoDePrueba()), { status: 201, statusText: 'Created' });
      expect(navegar).toHaveBeenCalledWith(['/trabajos', 7]);
    });

    it('muestra los errores del servidor junto a cada campo', async () => {
      const form = fixture.componentInstance['form'];
      form.patchValue({ titulo: 'Sistema de inventarios', resumen: 'x'.repeat(30) });
      form.controls.idFacultad.setValue(1, { emitEvent: false });
      for (const c of [form.controls.idMateria, form.controls.idSemestre, form.controls.idGrupo]) {
        c.enable();
      }
      form.controls.idTipoTrabajo.enable();
      form.patchValue(
        { idMateria: 10, idSemestre: 5, idGrupo: 3, idTipoTrabajo: 4 },
        { emitEvent: false },
      );
      await render();

      boton('Crear borrador').click();
      await render();
      http.expectOne(`${API}/trabajos`).flush(
        {
          status: 400,
          title: 'Datos invalidos',
          detail: 'Revise los datos.',
          timestamp: '2026-11-17T14:00:00Z',
          errores: { registrosCoautores: 'el registro 999 no es de un estudiante activo' },
        },
        { status: 400, statusText: 'Bad Request' },
      );
      await render();
      expect(errores()).toContain('el registro 999 no es de un estudiante activo');
      expect(vista.querySelector('.alert-danger')?.textContent).toContain('Revise los datos.');
    });
  });

  describe('edición', () => {
    async function cargarEdicion(cambios = {}) {
      await crear('7');
      http.expectOne(`${API}/facultades`).flush(respuesta(FACULTADES));
      http.expectOne(`${API}/trabajos/7`).flush(respuesta(trabajoDePrueba(cambios)));
      listasDeFacultad(1);
      http.expectOne((r) => r.url === `${API}/grupos`).flush(respuesta(GRUPOS));
      await render();
    }

    it('carga los datos y no incluye al usuario autenticado entre los coautores', async () => {
      await cargarEdicion();
      expect(vista.querySelector('h1')?.textContent).toContain('Editar trabajo');
      expect(vista.querySelector<HTMLInputElement>('input[formcontrolname=titulo]')!.value).toBe(
        'Sistema de inventarios',
      );
      expect(select('idGrupo').disabled).toBe(false);
      expect(chips()).toEqual(['#springboot', 'Ana Rojas (219012346)']);

      boton('Guardar cambios').click();
      await render();
      const put = http.expectOne(`${API}/trabajos/7`);
      expect(put.request.method).toBe('PUT');
      expect(put.request.body.registrosCoautores).toEqual([219012346]);
      expect(put.request.body.idGrupo).toBe(3);
      put.flush(respuesta(trabajoDePrueba()));
    });

    it('excluye al autor marcado con esUsuarioActual (no por login ni nombre)', async () => {
      await cargarEdicion({
        autores: [
          {
            idPersona: 1,
            nombre: 'Juan',
            apellidos: 'Perez',
            registro: 219012345,
            esUsuarioActual: false,
          },
          {
            idPersona: 2,
            nombre: 'Ana',
            apellidos: 'Rojas',
            registro: 219012346,
            esUsuarioActual: true,
          },
        ],
      });
      expect(chips()).toEqual(['#springboot', 'Juan Perez (219012345)']);
      // Su propio registro tampoco se puede volver a agregar.
      await agregarChip('nuevo-coautor', '219012346');
      expect(errores()).toContain('Tú ya eres autor del trabajo.');
    });

    it('fuera de BORRADOR el grupo no se puede cambiar', async () => {
      await cargarEdicion({ estado: 'RECHAZADO' });
      expect(select('idFacultad').disabled).toBe(true);
      expect(select('idGrupo').disabled).toBe(true);
      expect(select('idTipoTrabajo').disabled).toBe(false);
      expect(vista.textContent).toContain(
        'El grupo solo puede cambiarse mientras el trabajo está en borrador.',
      );
    });

    it('si el backend ya no permite editar, lo avisa', async () => {
      await cargarEdicion({ estado: 'PENDIENTE', acciones: SIN_ACCIONES });
      expect(vista.querySelector('form')).toBeNull();
      expect(vista.textContent).toContain('ya no se puede editar');
    });
  });

  it('un error al cargar se muestra como aviso', async () => {
    await crear();
    http
      .expectOne(`${API}/facultades`)
      .flush(null, { status: 503, statusText: 'Service Unavailable' });
    await render();
    expect(vista.querySelector('.alert-danger')?.textContent).toContain('no está disponible');
  });
});
