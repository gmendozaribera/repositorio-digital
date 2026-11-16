import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup } from '@angular/forms';
import { aplicarErroresDelServidor, errorDelServidor, mensajeDeError } from './error-message';

function problema(status: number, cuerpo: object) {
  return new HttpErrorResponse({ status, error: { status, title: 'x', timestamp: '', ...cuerpo } });
}

describe('mensajes de error del backend', () => {
  it('usa el detail del ProblemDetail', () => {
    expect(
      mensajeDeError(problema(409, { detail: 'Ya existe una carrera con la sigla INF.' })),
    ).toBe('Ya existe una carrera con la sigla INF.');
  });

  it('distingue servidor caido y sin conexion', () => {
    expect(mensajeDeError(new HttpErrorResponse({ status: 0 }))).toContain('conectar');
    expect(mensajeDeError(problema(503, {}))).toContain('no está disponible');
  });

  it('lleva el mapa errores a cada control y deja el resto en el mensaje general', () => {
    const form = new FormGroup({ sigla: new FormControl('x'), nombre: new FormControl('y') });
    const mensaje = aplicarErroresDelServidor(
      form,
      problema(400, {
        detail: 'Uno o mas campos no son validos.',
        errores: { sigla: 'no debe estar vacio', idFacultad: 'no existe' },
      }),
    );

    expect(errorDelServidor(form.controls.sigla)).toBe('no debe estar vacio');
    expect(form.controls.sigla.touched).toBe(true);
    expect(form.controls.nombre.valid).toBe(true);
    expect(mensaje).toBe('Uno o mas campos no son validos. idFacultad: no existe');
  });

  it('sin mapa errores devuelve el mensaje normal', () => {
    const form = new FormGroup({ sigla: new FormControl('x') });
    expect(aplicarErroresDelServidor(form, problema(409, { detail: 'Duplicado.' }))).toBe(
      'Duplicado.',
    );
    expect(form.valid).toBe(true);
  });
});
