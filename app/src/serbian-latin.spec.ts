import { describe, expect, it } from 'vitest';

import srCyrl from './locales/sr-Cyrl.json';
import { serbianLatinMessage, serbianLatinMessages, serbianLatinText } from './serbian-latin';

describe('serbianLatinText', () => {
  it('writes every Serbian Cyrillic letter in Latin script', () => {
    expect(serbianLatinText('абвгдђежзијклљмнњопрстћуфхцчџш')).toBe('abvgdđežzijklljmnnjoprstćufhcčdžš');
    expect(serbianLatinText('АБВГДЂЕЖЗИЈКЛМНОПРСТЋУФХЦЧШ')).toBe('ABVGDĐEŽZIJKLMNOPRSTĆUFHCČŠ');
  });

  it('capitalises a digraph at the start of a word and writes it in capitals in a word of capitals', () => {
    expect(serbianLatinText('Љубљана, Његош, Џеп')).toBe('Ljubljana, Njegoš, Džep');
    expect(serbianLatinText('ЉУБЉАНА, ЊЕГОШ, ЏЕП')).toBe('LJUBLJANA, NJEGOŠ, DŽEP');
    expect(serbianLatinText('Љ')).toBe('Lj');
  });

  it('leaves Latin letters, digits and punctuation as they are', () => {
    expect(serbianLatinText('Hopwatch, HTTPS-а, 30 секунди…')).toBe('Hopwatch, HTTPS-a, 30 sekundi…');
  });
});

describe('serbianLatinMessage', () => {
  it('keeps placeholders as they are', () => {
    expect(serbianLatinMessage('Поласци са станице {stop}')).toBe('Polasci sa stanice {stop}');
    expect(serbianLatinMessage('{mode} {line} за {headsign}: кашњење {delay}.')).toBe(
      '{mode} {line} za {headsign}: kašnjenje {delay}.',
    );
  });

  it('keeps linked messages as they are', () => {
    expect(serbianLatinMessage('Види @:journey.title и @.lower:map.title')).toBe(
      'Vidi @:journey.title i @.lower:map.title',
    );
    expect(serbianLatinMessage('Види @:(journey.title).')).toBe('Vidi @:(journey.title).');
  });

  it('transliterates the text of a literal and keeps plural choices', () => {
    expect(serbianLatinMessage("{'Шта'} је {count} | Ништа")).toBe("{'Šta'} je {count} | Ništa");
    expect(serbianLatinMessage('Без преседања | {count} преседање | {count} преседања')).toBe(
      'Bez presedanja | {count} presedanje | {count} presedanja',
    );
  });

  it('keeps an unpaired brace or at sign', () => {
    expect(serbianLatinMessage('{ и @ су')).toBe('{ i @ su');
  });
});

describe('serbianLatinMessages', () => {
  it('transliterates every message of a tree and keeps its keys', () => {
    const latin = serbianLatinMessages(srCyrl);

    expect(Object.keys(latin)).toEqual(Object.keys(srCyrl));
    expect(latin.app.settings).toBe('Podešavanja');
    expect(latin.departures.listLabel).toBe('Polasci sa stanice {stop}');
    expect(JSON.stringify(latin)).not.toMatch(/\p{Script=Cyrillic}/u);
  });
});
