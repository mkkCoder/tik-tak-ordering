import { beforeEach, describe, expect, it } from 'vitest';
import {
  ProjectFileError,
  STORAGE_KEY,
  loadStoredProject,
  parseProject,
  parseProjectText,
  projectFileName,
  saveStoredProject,
  serializeProject,
} from './projectFile';
import { demoProject } from '@/model/demo';
import { emptyProject } from '@/model/types';

beforeEach(() => {
  localStorage.clear();
});

describe('round trip', () => {
  it('survives serialise then parse unchanged', () => {
    const project = demoProject();
    expect(parseProjectText(serializeProject(project))).toEqual(project);
  });

  it('stamps the current version on the way out', () => {
    const text = serializeProject({ ...emptyProject(), version: 1 });
    expect(JSON.parse(text).version).toBe(1);
  });
});

describe('rejecting bad files', () => {
  it('rejects invalid JSON without touching anything', () => {
    expect(() => parseProjectText('{ not json')).toThrow(ProjectFileError);
    expect(() => parseProjectText('{ not json')).toThrow(/current plan hasn't been changed/);
  });

  it('rejects a JSON file that is not a project', () => {
    expect(() => parseProjectText('[1,2,3]')).toThrow(ProjectFileError);
    expect(() => parseProjectText('null')).toThrow(/isn't a TIKTAK project/);
    expect(() => parseProjectText('"hello"')).toThrow(ProjectFileError);
  });

  it('names where the damage is', () => {
    const broken = { ...emptyProject(), tables: [{ id: 't', label: 'T' }] };
    expect(() => parseProject(broken)).toThrow(/at tables\.0/);
  });

  it('refuses a file from a newer version rather than mangling it', () => {
    expect(() => parseProject({ ...emptyProject(), version: 99 })).toThrow(
      /newer version of TIKTAK/,
    );
  });

  it('accepts a pre-versioned file by assuming v1', () => {
    const { version: _version, ...unversioned } = emptyProject();
    void _version;
    expect(parseProject(unversioned).version).toBe(1);
  });
});

describe('reconciling references', () => {
  it('drops a seat pointing at a table that no longer exists', () => {
    const project = {
      ...emptyProject(),
      guests: [
        {
          id: 'g1',
          name: 'Ghost',
          partyId: null,
          tags: [],
          notes: '',
          seat: { tableId: 'gone', index: 0 },
          locked: false,
        },
      ],
    };
    expect(parseProject(project).guests[0]?.seat).toBeNull();
  });

  it('drops a seat past the end of its table', () => {
    const project = {
      ...emptyProject(),
      tables: [
        { id: 't1', label: 'T', shape: 'round', seats: 4, x: 0, y: 0, rotation: 0, locked: false },
      ],
      guests: [
        {
          id: 'g1',
          name: 'Overflow',
          partyId: null,
          tags: [],
          notes: '',
          seat: { tableId: 't1', index: 9 },
          locked: false,
        },
      ],
    };
    expect(parseProject(project).guests[0]?.seat).toBeNull();
  });

  it('resolves two guests hand-edited onto the same seat', () => {
    const seat = { tableId: 't1', index: 1 };
    const guest = (id: string) => ({
      id,
      name: id,
      partyId: null,
      tags: [],
      notes: '',
      seat,
      locked: false,
    });
    const project = {
      ...emptyProject(),
      tables: [
        { id: 't1', label: 'T', shape: 'round', seats: 4, x: 0, y: 0, rotation: 0, locked: false },
      ],
      guests: [guest('a'), guest('b')],
    };
    const parsed = parseProject(project);
    expect(parsed.guests[0]?.seat).toEqual(seat);
    expect(parsed.guests[1]?.seat).toBeNull();
  });

  it('drops a party reference with no party, and prunes empty parties', () => {
    const project = {
      ...emptyProject(),
      parties: [{ id: 'p1', label: 'Nobody' }],
      guests: [
        {
          id: 'g1',
          name: 'Loose',
          partyId: 'missing',
          tags: [],
          notes: '',
          seat: null,
          locked: false,
        },
      ],
    };
    const parsed = parseProject(project);
    expect(parsed.guests[0]?.partyId).toBeNull();
    expect(parsed.parties).toHaveLength(0);
  });

  it('drops constraints naming a deleted guest, and self-referencing ones', () => {
    const project = {
      ...emptyProject(),
      guests: [
        { id: 'a', name: 'A', partyId: null, tags: [], notes: '', seat: null, locked: false },
      ],
      constraints: [
        { id: 'c1', kind: 'apart', a: 'a', b: 'gone' },
        { id: 'c2', kind: 'apart', a: 'a', b: 'a' },
      ],
    };
    expect(parseProject(project).constraints).toHaveLength(0);
  });

  it('repairs soft field damage rather than rejecting the whole file', () => {
    const project = {
      ...emptyProject(),
      guests: [
        {
          id: 'g1',
          name: 'Fine',
          partyId: null,
          tags: 'not an array',
          notes: 42,
          seat: 'nonsense',
          locked: 'yes',
        },
      ],
    };
    expect(parseProject(project).guests[0]).toMatchObject({
      name: 'Fine',
      tags: [],
      notes: '',
      seat: null,
      locked: false,
    });
  });
});

describe('localStorage', () => {
  it('saves and reloads', () => {
    const project = demoProject();
    expect(saveStoredProject(project)).toBe('saved');
    expect(loadStoredProject()).toEqual(project);
  });

  it('returns null when nothing is stored', () => {
    expect(loadStoredProject()).toBeNull();
  });

  it('a corrupt autosave is quarantined, not thrown away', () => {
    localStorage.setItem(STORAGE_KEY, '{ broken');
    expect(loadStoredProject()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(`${STORAGE_KEY}:corrupt`)).toBe('{ broken');
  });
});

describe('file names', () => {
  it('slugs the event name', () => {
    expect(projectFileName('Dana & Yoav')).toBe('dana-and-yoav.tiktak.json');
    expect(projectFileName('  Bar Mitzvah — Eli!  ')).toBe('bar-mitzvah-eli.tiktak.json');
  });

  it('falls back when the name is empty or unslugabble', () => {
    expect(projectFileName('')).toBe('untitled-event.tiktak.json');
    expect(projectFileName('!!!')).toBe('untitled-event.tiktak.json');
  });

  it('keeps non-Latin names instead of blanking them', () => {
    expect(projectFileName('חתונה של דנה')).toBe('חתונה-של-דנה.tiktak.json');
  });
});
