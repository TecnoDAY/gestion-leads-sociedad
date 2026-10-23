# Mejora del menu para aplicacion movil

## Objetivo
Hacer usable el CRM en Android: navegacion clara, cabecera compacta, lista de leads adaptada al telefono y formularios/modales sin desbordes.

## Problema y por que
La interfaz actual fue pensada para escritorio. En movil hay demasiados botones horizontales, formularios que se cortan, ventanas que pueden quedar fuera de pantalla y la lista de leads sigue siendo una tabla de nueve columnas.

## Alcance
Incluye:
- Barra inferior fija con Inicio, Leads, Citas y Mas.
- Menu Mas con accesos segun permisos.
- Cabecera compacta en movil.
- Lista de leads en formato de tarjetas en movil (escritorio conserva tabla).
- Ficha/formulario de lead a pantalla completa en movil.
- Estados de carga, error y guardado visibles.
- Ajustes de espaciado y tipografia.
- Mantener escritorio sin cambios.

Excluye:
- Nuevas funcionalidades.
- Cambios de backend ni permisos.
- Google Play.
- Notificaciones push (tarea separada).

## Restricciones
- Reutilizar switchTab y handlers existentes.
- No duplicar logica de filtros ni acciones.
- No tapar contenido ni interferir con el teclado.
- Respetar temas claro y oscuro.

## No romper
- Tests de scripts/tests.
- pnpm check:app y pnpm lint.
- Flujo de alta y edicion de leads.
- Vista de escritorio actual.

## TDD
Modo: off
Fuente: default
Runner: pnpm test

## Tareas
- [x] T1: Agregar barra inferior movil.
- [x] T2: Agregar menu Mas.
- [x] T3: Compactar cabecera en movil.
- [ ] T4: Adaptar lista de leads a tarjetas en movil.
- [ ] T5: Adaptar ficha y formulario de lead a pantalla completa en movil.
- [ ] T6: Ajustar estados de carga, error y guardado.
- [ ] T7: Verificar movil y escritorio.

## Criterios de aceptacion
- [ ] Navegacion principal accesible sin desplazamiento horizontal.
- [ ] Lista de leads usable en telefono sin desplazamiento horizontal.
- [ ] Formularios usables en telefono.
- [ ] check:app, lint y test pasan.
- [ ] Escritorio sin regresiones visibles.

## Decisiones aceptadas
- Mantener escritorio intacto.
- Barra inferior mejor que menu hamburguesa para tareas frecuentes.
- Tarjetas para movil; tabla para escritorio.

## Progreso
Estado: en implementacion.
Ultima tarea: T3 completada.
Siguiente paso: T4 - adaptar lista de leads a tarjetas en movil.