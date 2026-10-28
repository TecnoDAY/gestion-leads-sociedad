import { parseFechaLead } from '../legacy/reportes.js';

export function mesActualMiami(now = new Date()) {
  const [year, month] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now).split('-').map(Number);
  const end = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return [`${year}-${String(month).padStart(2, '0')}-01`, `${year}-${String(month).padStart(2, '0')}-${end}`];
}

function fechaValida(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  return year >= 2000 && year <= 2100 && month >= 1 && month <= 12
    && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function validarRangoIngreso(desde, hasta) {
  if (!desde && !hasta) return;
  if (!desde || !hasta) throw new Error('Completa Desde y Hasta para aplicar el rango.');
  if (!fechaValida(desde) || !fechaValida(hasta) || desde > hasta) {
    throw new Error('El rango de fechas de ingreso no es válido.');
  }
}

export function filtrarIngreso(leads, desde, hasta) {
  validarRangoIngreso(desde, hasta);
  const inicio = desde ? Date.parse(`${desde}T00:00:00Z`) : null;
  const fin = hasta ? Date.parse(`${hasta}T00:00:00Z`) : null;
  return leads.filter(lead => {
    if (lead.archived_at) return false;
    if (inicio === null) return true;
    const fecha = parseFechaLead(lead);
    return fecha !== null && fecha >= inicio && fecha <= fin;
  });
}
