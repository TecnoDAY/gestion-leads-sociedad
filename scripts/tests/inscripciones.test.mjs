import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Reglas puras de las inscripciones por programa y nivel (capa 2).
const mod = await import('../../src/legacy/inscripciones.js');
const { PROGRAMAS_INSCRIPCION, esInscritoGestion, nivelesDePrograma, normalizaFechaInscripcion,
  inscripcionPayload, inscripcionDesdeFilas, inscripcionTienePendientes,
  programaEtiqueta, validateInscripcionesReport, inscripcionesCsvLines } = mod;

describe('inscripciones - programas y niveles', () => {
  test('dos programas con sus niveles', () => {
    assert.equal(PROGRAMAS_INSCRIPCION.length, 2);
    assert.deepEqual(nivelesDePrograma('TEATRO_MUSICAL'), ['MT Piojitos', 'MT Teens', 'MT Advance']);
    assert.deepEqual(nivelesDePrograma('ACTUACION'), ['Acting Piojitos', 'Acting Teens', 'Acting 101 (Teens)', 'Acting Advance']);
  });

  test('nivelesDePrograma es case-insensitive y no muta la constante', () => {
    assert.equal(nivelesDePrograma('teatro_musical').length, 3);
    assert.equal(nivelesDePrograma('INEXISTENTE').length, 0);
    const copia = PROGRAMAS_INSCRIPCION[0].niveles;
    nivelesDePrograma('TEATRO_MUSICAL').push('X');
    assert.deepEqual(PROGRAMAS_INSCRIPCION[0].niveles, copia);
  });
});

describe('inscripciones - esInscritoGestion', () => {
  test('INSCRITO e INSCRITO DATADURA cuentan como inscrito', () => {
    assert.equal(esInscritoGestion('INSCRITO'), true);
    assert.equal(esInscritoGestion('INSCRITO DATADURA'), true);
    assert.equal(esInscritoGestion('inscrito datadura'), true);
    assert.equal(esInscritoGestion('  Inscrito  '), true);
  });

  test('los demas estados no son inscripcion', () => {
    for (const estado of ['Agendado', 'No Contesta', 'Información', 'Interesado', '', null, undefined]) {
      assert.equal(esInscritoGestion(estado), false, String(estado));
    }
  });
});

describe('inscripciones - normalizaFechaInscripcion', () => {
  test('vacio queda pendiente (null) sin inventar fecha', () => {
    assert.deepEqual(normalizaFechaInscripcion(''), { ok: true, fecha: null });
    assert.deepEqual(normalizaFechaInscripcion('   '), { ok: true, fecha: null });
    assert.deepEqual(normalizaFechaInscripcion(null), { ok: true, fecha: null });
  });

  test('fecha valida se conserva', () => {
    assert.deepEqual(normalizaFechaInscripcion('2026-09-15'), { ok: true, fecha: '2026-09-15' });
  });

  test('fechas invalidas se rechazan', () => {
    assert.equal(normalizaFechaInscripcion('15/09/2026').ok, false);
    assert.equal(normalizaFechaInscripcion('2026-13-01').ok, false);
    assert.equal(normalizaFechaInscripcion('2026-02-30').ok, false);
    assert.equal(normalizaFechaInscripcion('ayer').ok, false);
  });
});

describe('inscripciones - inscripcionPayload', () => {
  test('un programa con nivel y fecha', () => {
    const out = inscripcionPayload([{ programa: 'TEATRO_MUSICAL', nivel: 'MT Teens', fecha_inscripcion: '2026-09-15' }]);
    assert.equal(out.ok, true);
    assert.deepEqual(out.payload, [{ programa: 'TEATRO_MUSICAL', nivel: 'MT Teens', fecha_inscripcion: '2026-09-15' }]);
  });

  test('los dos programas a la vez', () => {
    const out = inscripcionPayload([
      { programa: 'TEATRO_MUSICAL', nivel: 'MT Advance', fecha_inscripcion: '' },
      { programa: 'ACTUACION', nivel: 'Acting Teens', fecha_inscripcion: '2026-10-01' },
    ]);
    assert.equal(out.ok, true);
    assert.equal(out.payload.length, 2);
    assert.equal(out.payload[0].fecha_inscripcion, null);
  });

  test('sin fecha declarada queda pendiente, no con fecha inventada', () => {
    const out = inscripcionPayload([{ programa: 'ACTUACION', nivel: 'Acting Piojitos' }]);
    assert.equal(out.ok, true);
    assert.equal(out.payload[0].fecha_inscripcion, null);
  });

  test('programa repetido se rechaza', () => {
    const out = inscripcionPayload([
      { programa: 'ACTUACION', nivel: 'Acting Teens' },
      { programa: 'ACTUACION', nivel: 'Acting Advance' },
    ]);
    assert.equal(out.ok, false);
    assert.equal(out.error, 'programa_duplicado');
  });

  test('nivel que no corresponde al programa se rechaza', () => {
    assert.equal(inscripcionPayload([{ programa: 'ACTUACION', nivel: 'MT Teens' }]).error, 'nivel_invalido');
    assert.equal(inscripcionPayload([{ programa: 'TEATRO_MUSICAL', nivel: 'Acting Teens' }]).error, 'nivel_invalido');
    assert.equal(inscripcionPayload([{ programa: 'TEATRO_MUSICAL', nivel: '' }]).error, 'nivel_invalido');
  });

  test('programa desconocido se rechaza', () => {
    assert.equal(inscripcionPayload([{ programa: 'DANZA', nivel: 'Ballet' }]).error, 'programa_invalido');
  });

  test('fecha invalida se rechaza antes de enviar', () => {
    assert.equal(inscripcionPayload([{ programa: 'ACTUACION', nivel: 'Acting Teens', fecha_inscripcion: '2026-02-30' }]).error, 'fecha_invalida');
  });

  test('seleccion vacia produce payload vacio (sin error)', () => {
    const out = inscripcionPayload([]);
    assert.equal(out.ok, true);
    assert.deepEqual(out.payload, []);
  });
});

describe('inscripciones - lectura de filas', () => {
  const filas = [
    { programa: 'TEATRO_MUSICAL', nivel: 'MT Teens', fecha_inscripcion: '2026-09-15', activa: true },
    { programa: 'ACTUACION', nivel: 'Acting Teens', fecha_inscripcion: null, activa: true },
    { programa: 'ACTUACION', nivel: 'Acting Advance', fecha_inscripcion: '2026-01-10', activa: false },
  ];

  test('solo las filas activas alimentan el formulario', () => {
    const sel = inscripcionDesdeFilas(filas);
    assert.equal(sel.length, 2);
    assert.deepEqual(sel.map(s => s.programa).sort(), ['ACTUACION', 'TEATRO_MUSICAL']);
  });

  test('la fecha ausente se representa como cadena vacia (pendiente)', () => {
    const sel = inscripcionDesdeFilas(filas);
    const actuacion = sel.find(s => s.programa === 'ACTUACION');
    assert.equal(actuacion.fecha_inscripcion, '');
  });

  test('se detectan las inscripciones pendientes de fecha', () => {
    assert.equal(inscripcionTienePendientes(filas), true);
    assert.equal(inscripcionTienePendientes([{ programa: 'ACTUACION', nivel: 'Acting Teens', fecha_inscripcion: '2026-09-15', activa: true }]), false);
  });
});

describe('inscripciones - etiqueta de programa', () => {
  test('traduce el id a la etiqueta visible', () => {
    assert.equal(programaEtiqueta('TEATRO_MUSICAL'), 'Teatro Musical');
    assert.equal(programaEtiqueta('ACTUACION'), 'Actuación');
    assert.equal(programaEtiqueta('OTRO'), 'OTRO');
  });
});

describe('inscripciones - validateInscripcionesReport', () => {
  const base = {
    desde: '2026-09-01', hasta: '2026-09-30',
    personas_inscritas: 5, inscripciones: 6, pendientes_fecha: 1,
    altas_periodo: 3, bajas_periodo: 1, cambios_nivel_periodo: 0,
    por_programa_nivel: [{ programa: 'TEATRO_MUSICAL', nivel: 'MT Teens', personas: 4 }],
    por_mes: [{ mes: '2026-09', personas: 3, inscripciones: 4 }],
  };

  test('acepta un reporte coherente', () => {
    assert.equal(validateInscripcionesReport(base, '2026-09-01', '2026-09-30'), base);
  });

  test('rechaza rango distinto, conteos negativos y forma invalida', () => {
    assert.throws(() => validateInscripcionesReport(base, '2026-09-02', '2026-09-30'));
    assert.throws(() => validateInscripcionesReport({ ...base, personas_inscritas: -1 }, '2026-09-01', '2026-09-30'));
    assert.throws(() => validateInscripcionesReport({ ...base, por_mes: 'x' }, '2026-09-01', '2026-09-30'));
  });

  test('rechaza mas inscripciones que personas', () => {
    assert.throws(() => validateInscripcionesReport({ ...base, personas_inscritas: 9, inscripciones: 6 }, '2026-09-01', '2026-09-30'));
  });
});

describe('inscripciones - CSV', () => {
  test('una fila por inscripcion, con telefono como texto y estado de la fecha', () => {
    const filas = [
      { nombre: 'Ana', telefono: '17865551234', programa: 'TEATRO_MUSICAL', nivel: 'MT Teens', fecha_inscripcion: '2026-09-15', registrado_por: 'Loli' },
      { nombre: 'Luis', telefono: '17865550000', programa: 'ACTUACION', nivel: 'Acting Piojitos', fecha_inscripcion: null, registrado_por: 'Jessica' },
    ];
    const lines = inscripcionesCsvLines(filas, '2026-09-30');
    assert.equal(lines[0], '"Inscripciones por programa y nivel"');
    assert.equal(lines[1], '"Generado (Miami)","2026-09-30"');
    assert.equal(lines[3], '"Nombre","Teléfono","Programa","Nivel","Fecha de inscripción","Estado de la fecha","Registrado por"');
    assert.match(lines[4], /"Ana","'17865551234","Teatro Musical","MT Teens","2026-09-15","En periodo","Loli"/);
    assert.match(lines[5], /"Luis","'17865550000","Actuación","Acting Piojitos","","Pendiente de completar","Jessica"/);
  });

  test('sin filas solo deja la cabecera', () => {
    const lines = inscripcionesCsvLines([], '2026-09-30');
    assert.equal(lines.length, 4);
  });
});
