import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

test('la tarjeta abre la ficha con ID y origen correctos', () => {
  const opened = [];
  const context = vm.createContext({
    window: {},
    openViewLeadModal: (...args) => opened.push(args),
    openEditLeadModal: (...args) => opened.push(args),
  });
  for (const name of ['crmOpenViewLead', 'crmOpenEditLead']) {
    const line = html.split('\n').find(row => row.includes(`window.${name} =`));
    assert.ok(line, `falta adaptador ${name}`);
    vm.runInContext(line, context);
    context.window[name]('actual', 123);
  }
  assert.deepEqual(opened, [[123, 'actual'], [123, 'actual']]);
});

test('la ficha encuentra leads del mes fuera de la ventana cargada sin confundir historicos', () => {
  const functionText = html.match(/    function findLeadByOrigin\(origin, leadId\) \{[\s\S]*?\n    \}/)?.[0];
  assert.ok(functionText);
  const context = vm.createContext({
    allLeads: [], completeCurrentLoaded: false, allHistorico: [{ id: 123, Nombre: 'Historico' }],
    currentMainTab: 'kanban', currentAccess: { activo: true },
    window: { crmFindKanbanLead: id => id === 123 ? { id: 123, Nombre: 'Actual' } : undefined },
  });
  vm.runInContext(`${functionText}\nthis.find = findLeadByOrigin`, context);
  assert.equal(context.find('actual', 123)?.Nombre, 'Actual');
  assert.equal(context.find('historico', 123)?.Nombre, 'Historico');
  context.currentAccess.activo = false;
  assert.equal(context.find('actual', 123), undefined);
});
