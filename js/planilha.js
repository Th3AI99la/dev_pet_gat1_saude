import { byId as $, escapeHtml as escape } from './ui.js';

const PAGE_SIZE = 18;
const normalize = value => String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR');
const count = value => new Intl.NumberFormat('pt-BR').format(value);

function columnName(number) {
  let name = '';
  for (let n = number; n; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name;
  return name;
}

function cellMarkup(cell) {
  if (!cell) return '<span class="source-empty" aria-label="Célula vazia">—</span>';
  const value = escape(cell.value ?? '');
  const notes = ['note', 'formula', 'link'].flatMap(key => {
    if (!cell[key]) return [];
    const label = { note: 'Nota', formula: 'Fórmula', link: 'Link' }[key];
    const content = typeof cell[key] === 'object' ? cell[key].text ?? cell[key].target ?? JSON.stringify(cell[key]) : cell[key];
    return [`<details><summary>${label}</summary><div>${escape(content)}</div></details>`];
  });
  return `<span>${value}</span>${notes.join('')}`;
}

export async function mountWorkbook(expectedHash) {
  const response = await fetch('assets/planilha.json');
  if (!response.ok) throw new Error('A exportação integral da planilha está indisponível.');
  const workbook = await response.json();
  if (!workbook.sheets.length || workbook.workbookSha256 !== expectedHash) throw new Error('As duas exportações precisam ser atualizadas a partir do mesmo XLSX.');

  const sheets = workbook.sheets.map(sheet => ({
    ...sheet,
    dataRows: sheet.rows.filter(row => row.number !== 1).map(row => ({
      ...row, search: normalize(row.cells.map(cell => [cell.value, cell.note?.text ?? cell.note, cell.formula].join(' ')).join(' ')),
    })),
  }));
  const selector = $('sourceSheet');
  const search = $('sourceSearch');
  const grid = $('sourceGrid');
  let index = 0;
  let page = 0;
  let highlight = null;
  selector.innerHTML = sheets.map((sheet, i) => `<option value="${i}">${escape(sheet.name.trim())}</option>`).join('');
  $('sourceIntro').textContent = `${sheets.length} abas · ${count(sheets.reduce((sum, sheet) => sum + sheet.valueCount, 0))} células preenchidas. As linhas e colunas seguem o XLSX recebido.`;

  function render() {
    const sheet = sheets[index];
    const term = normalize(search.value.trim());
    const matches = term ? sheet.dataRows.filter(row => row.search.includes(term)) : sheet.dataRows;
    const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
    page = Math.min(page, pages - 1);
    selector.value = index;
    const from = page * PAGE_SIZE;
    const shown = matches.slice(from, from + PAGE_SIZE);
    const headings = new Map(sheet.rows.find(row => row.number === 1)?.cells.map(cell => [cell.column, cell.value]));
    const columns = Array.from({ length: sheet.columnCount }, (_, offset) => offset + 1);
    const rows = shown.map(row => {
      const fields = new Map(row.cells.map(cell => [cell.column, cell]));
      return `<tr id="source-row-${row.number}"${row.number === highlight ? ' class="source-highlight"' : ''}><th scope="row" tabindex="-1">${row.number}</th>${columns.map(column => `<td>${cellMarkup(fields.get(column))}</td>`).join('')}</tr>`;
    });

    $('sourceCounts').textContent = `${count(matches.length)} de ${count(sheet.dataRows.length)} linhas de dados · ${sheet.columnCount} colunas`;
    $('sourcePrev').disabled = page === 0;
    $('sourceNext').disabled = page + 1 >= pages;
    $('sourcePage').textContent = `Página ${page + 1} de ${pages}`;
    grid.innerHTML = rows.length ? `<table><caption class="sr-only">${escape(sheet.name.trim())}</caption><thead><tr><th scope="col">Linha</th>${columns.map(column => `<th scope="col"><small>${columnName(column)}</small>${escape(headings.get(column) ?? '')}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>` : '<p class="empty-series">A busca não encontrou linhas nesta aba.</p>';
    grid.scrollTop = 0;
  }

  selector.addEventListener('change', () => { index = Number(selector.value); search.value = ''; page = 0; highlight = null; render(); });
  search.addEventListener('input', () => { page = 0; highlight = null; render(); });
  $('sourcePrev').addEventListener('click', () => { page -= 1; render(); });
  $('sourceNext').addEventListener('click', () => { page += 1; render(); });
  render();

  return (sheetName, rowNumber) => {
    index = Math.max(0, sheets.findIndex(sheet => sheet.name.trim() === sheetName.trim()));
    search.value = '';
    const offset = sheets[index].dataRows.findIndex(row => row.number === rowNumber);
    page = Math.floor(Math.max(0, offset) / PAGE_SIZE);
    highlight = offset < 0 ? null : rowNumber;
    render();
    if (highlight) {
      const target = document.querySelector(`#source-row-${highlight} th`);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    $('planilha').scrollIntoView({ block: 'start' });
  };
}
