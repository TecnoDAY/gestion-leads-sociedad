// Parser minimo de CSV para los tests: campos entre comillas dobles con
// comillas internas duplicadas. Sirve para comprobar que ninguna columna se
// desplaza al anadir una al archivo.
export function csvFields(line) {
  const fields = [];
  let rest = line;
  while (rest.length) {
    const match = /^"((?:[^"]|"")*)"(?:,(.*))?$/.exec(rest);
    if (!match) { fields.push(rest); break; }
    fields.push(match[1].replace(/""/g, '"'));
    rest = match[2] ?? '';
  }
  return fields;
}
