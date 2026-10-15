// Builds data/results/<profile>.csv rows from insurers/<insurer>/capture/<profile>-results.json
// Usage: node scripts/build-csv.js <insurer> <profileId> <poistovnaDisplayName>
const fs = require('fs');

const DATE = '2026-10-15';

const PROFILE_META = {
  'byt-bratislava': {
    kind: 'byt', typ: 'Byt', col3: 7, col4: 'nie', mesto: 'Bratislava', ulica: 'Lietavská', cislo: '3095/9, 851 06',
    plocha: 65, loggia: 4, rok: 1985, material: 'Panel', ucel: 'bývanie', suma_nehnutelnost: 200000, suma_domacnost: 25000,
  },
  'byt-kosice': {
    kind: 'byt', typ: 'Byt', col3: 4, col4: 'nie', mesto: 'Košice', ulica: 'Ostravská', cislo: '1014/12',
    plocha: 39, loggia: 0, rok: 1979, material: 'Panel', ucel: 'bývanie', suma_nehnutelnost: 150000, suma_domacnost: 20000,
  },
  'dom-male-dvorniky': {
    kind: 'dom', typ: 'Dom', col3: 'šikmá', col4: 2, mesto: 'Malé Dvorníky', ulica: 'Krátka', cislo: '389/10, 929 01',
    plocha: 95, loggia: 65, rok: 2023, material: 'Tehla', ucel: 'bývanie', suma_nehnutelnost: 200000, suma_domacnost: 25000,
  },
  'dom-vlckovce': {
    kind: 'dom', typ: 'Dom', col3: 'rovná', col4: 2, mesto: 'Vlčkovce', ulica: 'Vlčkovce', cislo: '447, 919 23',
    plocha: 110, loggia: 20, rok: 2023, material: 'Tehla', ucel: 'bývanie', suma_nehnutelnost: 300000, suma_domacnost: 30000,
  },
};

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function header(kind) {
  const col3name = kind === 'byt' ? 'Poschodie' : 'Typ strechy';
  const col4name = kind === 'byt' ? 'Prízemie alebo vrchné poschodie' : 'Počet podlaží';
  return [
    'Dátum zberu cien', 'Typ nehnuteľnosti', col3name, col4name, 'Mesto', 'Ulica', 'Číslo/PSČ',
    'Podlahová plocha v m2', 'Loggia, balkón, terasa v m2', 'Rok kolaudácie', 'Materiál', 'Účel využitia',
    'Poistná suma nehnuteľnosť', 'Poistná suma domácnosť', 'Odporúčaná poistná suma nehnuteľnosť',
    'Poisťovňa', 'Balík', 'Rozsah krytia balíkov', 'Cena', 'Tolerancia podpoistenia', 'Spoluúčasť',
    'Zodpovednosť z vlastníctva nehnuteľnosti', 'Zodpovednosť z občianskeho života', 'Doplnkové poistenia',
    'Uplatnená zľava', 'Možné zľavy a bonusy', 'Doplňujúce info',
  ];
}

function run(insurer, profileId, poistovnaName, extraInfo) {
  const meta = PROFILE_META[profileId];
  const resultsPath = `/home/user/Monitoring/insurers/${insurer}/capture/${profileId}-results.json`;
  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

  const outPath = `/home/user/Monitoring/data/results/${profileId}.csv`;
  let lines = [];
  if (!fs.existsSync(outPath)) {
    lines.push(header(meta.kind).map(csvEscape).join(','));
  }

  for (const r of results) {
    const row = [
      DATE, meta.typ, meta.col3, meta.col4, meta.mesto, meta.ulica, meta.cislo,
      meta.plocha, meta.loggia, meta.rok, meta.material, meta.ucel,
      meta.suma_nehnutelnost, meta.suma_domacnost, r.odporucana_suma_nehnutelnost,
      poistovnaName, r.balik, (r.coverage || []).join('\n'), r.cena ? r.cena + ' €' : '',
      r.tolerancia || 'neuvedené', r.spoluucast,
      r.limit, r.limit, // zodpovednosť z vlastníctva / z občianskeho života (single shared "limit" control)
      r.doplnkove || '', r.uplatnena_zlava || '-', r.mozne_zlavy || '-', extraInfo || '',
    ];
    lines.push(row.map(csvEscape).join(','));
  }

  fs.appendFileSync(outPath, lines.join('\n') + '\n');
  console.log(`Wrote ${results.length} rows for ${insurer}/${profileId} -> ${outPath}`);
}

const [,, insurer, profileId, poistovnaName, extraInfo] = process.argv;
run(insurer, profileId, poistovnaName, extraInfo);
