/** Serbian Cyrillic letters and their Latin spelling; the digraphs Љ, Њ and Џ are written as two letters. */
const LETTERS: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  ђ: 'đ',
  е: 'e',
  ж: 'ž',
  з: 'z',
  и: 'i',
  ј: 'j',
  к: 'k',
  л: 'l',
  љ: 'lj',
  м: 'm',
  н: 'n',
  њ: 'nj',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  ћ: 'ć',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'c',
  ч: 'č',
  џ: 'dž',
  ш: 'š',
};

function isUpper(letter: string): boolean {
  return letter !== letter.toLowerCase();
}

/** One word: an upper-case digraph is all capitals (LJ) in a word of capitals, otherwise capitalised (Lj). */
function word(text: string): string {
  const letters = [...text];
  const allCaps = letters.length > 1 && letters.every((letter) => !/\p{Ll}/u.test(letter));
  return letters
    .map((letter) => {
      const latin = LETTERS[letter.toLowerCase()];
      if (latin === undefined) return letter;
      if (!isUpper(letter)) return latin;
      return allCaps ? latin.toUpperCase() : latin[0].toUpperCase() + latin.slice(1);
    })
    .join('');
}

/** Plain text from Serbian Cyrillic to Serbian Latin script; other characters stay as they are. */
export function serbianLatinText(text: string): string {
  return text.replace(/\p{L}+/gu, word);
}

/**
 * A vue-i18n message from Serbian Cyrillic to Serbian Latin script. Placeholders (`{name}`) and linked messages
 * (`@:key`, `@.modifier:key`, `@:(key)`) stay as they are; the text of a literal (`{'text'}`) is transliterated.
 */
export function serbianLatinMessage(message: string): string {
  return message.replace(
    /\{\s*'((?:[^'\\]|\\.)*)'\s*\}|\{[^}]*\}|@(?:\.\w+)?:(?:\([^)]*\)|[\w.\-$]+)|[^{@]+|[{@]/g,
    (part, literal: string | undefined) => {
      if (literal !== undefined) return part.replace(literal, serbianLatinText(literal));
      if (part.startsWith('{') && part.length > 1) return part;
      if (part.startsWith('@') && part.length > 1) return part;
      return serbianLatinText(part);
    },
  );
}

type Messages = { [key: string]: string | Messages };

/** A message tree with every message in Serbian Latin script; the keys stay as they are. */
export function serbianLatinMessages<T extends Messages>(messages: T): T {
  return Object.fromEntries(
    Object.entries(messages).map(([key, value]) => [
      key,
      typeof value === 'string' ? serbianLatinMessage(value) : serbianLatinMessages(value),
    ]),
  ) as T;
}
