import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideApi } from '../../../core/api/api.providers';
import { respuesta } from '../../../core/auth/testing';
import { GruposComponent } from './grupos.component';

const API = '/api/v1';
const FACULTADES = [
  { idFacultad: 1, nombre: 'Computación', sigla: 'FICCT', estado: 1 },
  { idFacultad: 2, nombre: 'Tecnología', sigla: 'FCYT', estado: 1 },
];
const MATERIAS = [
  { idMateria: 10, nombre: 'Software I', sigla: 'INF412', idFacultad: 1, estado: 1 },
  { idMateria: 20, nombre: 'Física', sigla: 'FIS100', idFacultad: 2, estado: 1 },
];
const SEMESTRES = [
  { idSemestre: 5, semestre: 2, anio: 2026, idFacultad: 1, estado: 1 },
  { idSemestre: 6, semestre: 2, anio: 2026, idFacultad: 2, estado: 1 },
];
const GRUPO = { idGrupo: 3, nombre: 'SA', idMateria: 10, idSemestre: 5, estado: 1 };

describe('GruposComponent', () => {
  let fixture: ComponentFixture<GruposComponent>;
  let http: HttpTestingController;
  let pagina: HTMLElement;

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function boton(texto: string): HTMLButtonElement {
    const b = Array.from(pagina.querySelectorAll('button')).find((x) =>
      x.textContent?.trim().startsWith(texto),
    );
    if (!b) throw new Error(`No hay botón "${texto}"`);
    return b;
  }

  function opciones(selector: string): string[] {
    return Array.from(pagina.querySelectorAll(`${selector} option`)).map(
      (o) => o.textContent?.trim() ?? '',
    );
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApi()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(GruposComponent);
    pagina = fixture.nativeElement;
    await render();
    http.expectOne((r) => r.url === `${API}/facultades`).flush(respuesta(FACULTADES));
    http.expectOne((r) => r.url === `${API}/materias`).flush(respuesta(MATERIAS));
    http.expectOne((r) => r.url === `${API}/semestres`).flush(respuesta(SEMESTRES));
    http.expectOne((r) => r.url === `${API}/grupos`).flush(respuesta([GRUPO]));
    await render();
  });

  afterEach(() => http.verify());

  it('muestra materia y semestre legibles', () => {
    const fila = pagina.querySelector('tbody tr')!.textContent!;
    expect(fila).toContain('INF412');
    expect(fila).toContain('2/2026');
  });

  it('el formulario solo ofrece materias y semestres de la facultad elegida', async () => {
    boton('Nuevo grupo').click();
    await render();
    const [facultad] = Array.from(pagina.querySelectorAll<HTMLSelectElement>('form select'));
    expect(opciones('form select[formcontrolname=idMateria]')).toEqual([
      'Elija primero la facultad',
    ]);

    facultad.selectedIndex = 2; // FCYT
    facultad.dispatchEvent(new Event('change'));
    await render();

    expect(opciones('form select[formcontrolname=idMateria]')).toEqual([
      'Seleccione…',
      'FIS100 — Física',
    ]);
    expect(opciones('form select[formcontrolname=idSemestre]')).toEqual(['Seleccione…', '2/2026']);
  });

  it('asigna un docente como administrador de curso', async () => {
    boton('Docentes').click();
    await render();
    http.expectOne(`${API}/grupos/3/docentes`).flush(respuesta([]));
    await render();
    expect(pagina.querySelector('app-docentes-grupo .estado-vacio')).not.toBeNull();

    const id = pagina.querySelector<HTMLInputElement>('input[formcontrolname=idUsuario]')!;
    id.value = '12';
    id.dispatchEvent(new Event('input'));
    const admin = pagina.querySelector<HTMLInputElement>('input[formcontrolname=esAdminCurso]')!;
    admin.click();
    boton('Asignar').click();

    const post = http.expectOne(`${API}/grupos/3/docentes`);
    expect(post.request.body).toEqual({ idUsuario: 12, esAdminCurso: true });
    post.flush(
      respuesta({
        idGrupo: 3,
        idUsuario: 12,
        usuario: 'doc.maria',
        nombre: 'María',
        apellidos: 'López',
        esAdminCurso: true,
      }),
    );
    http.expectOne(`${API}/grupos/3/docentes`).flush(
      respuesta([
        {
          idGrupo: 3,
          idUsuario: 12,
          usuario: 'doc.maria',
          nombre: 'María',
          apellidos: 'López',
          esAdminCurso: true,
        },
      ]),
    );
    await render();

    expect(pagina.querySelector('app-docentes-grupo tbody')?.textContent).toContain(
      'Administrador de curso',
    );
  });
});
