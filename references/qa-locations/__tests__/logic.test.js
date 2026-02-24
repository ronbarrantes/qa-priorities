const {
  parseLines,
  parseGroupValues,
  normalizeConfig,
  groupLocations,
  groupByTitle,
  buildOutputMatrix,
  buildPrioritySet,
  parseCSVRows,
  extractLocationsFromCSVText,
  extractPrioritiesFromXlsxRows,
} = require('../qa-locations-ext/logic');

describe('logic helpers', () => {
  test('parseLines trims and removes blanks', () => {
    expect(parseLines('A\n\n  B  \n')).toEqual(['A', 'B']);
  });

  test('parseLines filters known pasted headers', () => {
    expect(
      parseLines('Location\nSS4:AA100\nContainer Tag\nCurrent Location\nSS4:BB200'),
    ).toEqual(['SS4:AA100', 'SS4:BB200']);
  });

  test('parseGroupValues supports commas and spaces', () => {
    expect(parseGroupValues('A, B C')).toEqual(['A', 'B', 'C']);
  });

  test('parseCSVRows handles quoted commas and escaped quotes', () => {
    expect(parseCSVRows('Location,Note\n"SS4:AA100","A, B"\n"SS4:BB200","He said ""ok"""'))
      .toEqual([
        ['Location', 'Note'],
        ['SS4:AA100', 'A, B'],
        ['SS4:BB200', 'He said "ok"'],
      ]);
  });

  test('extractLocationsFromCSVText reads Location column and sorts unique values', () => {
    const csv = [
      'Location,Container',
      'SS4:HV253.A,1',
      'SS4:AB100.A,2',
      'SS4:HV253.A,3',
      ',4',
    ].join('\n');

    expect(extractLocationsFromCSVText(csv)).toEqual({
      values: ['SS4:AB100.A', 'SS4:HV253.A'],
      rowCount: 4,
    });
  });

  test('extractPrioritiesFromXlsxRows filters QA_HOLD_PICKING and extracts Current Location', () => {
    const rows = [
      ['Container Id', 'Current Location', 'Container Tag'],
      ['C1', 'SS4:MEZ111.A', 'QA_HOLD_PICKING'],
      ['C2', 'SS4:TR333.A', 'OTHER'],
      ['C3', '', 'QA_HOLD_PICKING'],
      ['C4', 'SS4:AB100.A', 'QA_HOLD_PICKING'],
      ['C5', 'SS4:MEZ111.A', 'QA_HOLD_PICKING'],
    ];

    expect(extractPrioritiesFromXlsxRows(rows)).toEqual({
      values: ['SS4:AB100.A', 'SS4:MEZ111.A'],
      rowCount: 5,
    });
  });
});

describe('grouping rules', () => {
  const config = normalizeConfig({
    groups: [
      { title: 'pallets', values: ['a', 'b', 'c'] },
      { title: 'mnst', values: ['m', 'n', 's', 't', 'mez'] },
    ],
    maxRows: 2,
    columnGap: 1,
  });

  test('groupLocations matches exact 3+ letter prefixes or first letter', () => {
    const locations = ['SS4:MEZ111.A', 'SS4:TR333.A', 'SS4:AB123.A'];
    const grouped = groupLocations(locations, config);

    expect(grouped.mez).toEqual(['SS4:MEZ111.A']);
    expect(grouped.t).toEqual(['SS4:TR333.A']);
    expect(grouped.unassigned).toEqual(['SS4:AB123.A']);
  });

  test('groupByTitle maps grouped values to titles', () => {
    const locations = ['SS4:MEZ111.A', 'SS4:TR333.A'];
    const grouped = groupLocations(locations, config);
    const titleGrouped = groupByTitle(grouped, config);

    expect(titleGrouped.mnst).toEqual(['SS4:MEZ111.A', 'SS4:TR333.A']);
  });
});

describe('output layout', () => {
  test('buildOutputMatrix handles spillover columns', () => {
    const matrix = buildOutputMatrix(
      ['pallets'],
      { pallets: ['L1', 'L2', 'L3', 'L4', 'L5'], unassigned: [] },
      2,
      0,
    );

    expect(matrix.headers).toEqual(['pallets', 'pallets', 'pallets']);
    expect(matrix.rows).toEqual([
      ['L1', 'L3', 'L5'],
      ['L2', 'L4', ''],
    ]);
  });

  test('buildPrioritySet only keeps matches', () => {
    const set = buildPrioritySet(['A', 'B'], ['B', 'C']);
    expect(Array.from(set)).toEqual(['B']);
  });
});
