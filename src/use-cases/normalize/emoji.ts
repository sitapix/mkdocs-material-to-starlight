/**
 * Translate the most common Twemoji `:shortcode:` patterns into actual
 * emoji glyphs.
 *
 * Material's `pymdownx.emoji` extension can resolve hundreds of shortcodes
 * at build time. The Astro/Markdown pipeline has no equivalent, so the
 * shortcode renders as literal text. This normalizer covers the top ~100
 * shortcodes the docs typically use, mapped to their canonical Unicode
 * codepoint.
 *
 * Shortcodes prefixed with `material-`, `fontawesome-`, `octicons-`,
 * `simple-`, `lucide-` are explicitly preserved — they're icon directives
 * handled elsewhere by the icons transform.
 *
 * Pure: text → text. Skips fenced code blocks and inline code spans so
 * documentation about the shortcodes themselves doesn't get rewritten.
 */

const FENCED_CODE_PATTERN = /(```[\s\S]*?```)/g;
const INLINE_CODE_PATTERN = /(`[^`\n]*`)/g;
const SHORTCODE_PATTERN = /:([a-z0-9_+\-]+):/g;
const ICON_PREFIX_PATTERN = /^(material|fontawesome|octicons|simple|lucide|fa)-/;

const EMOJI_TABLE: ReadonlyMap<string, string> = new Map(
  Object.entries({
    smile: '😄',
    smiley: '😃',
    grin: '😁',
    laughing: '😆',
    sweat_smile: '😅',
    joy: '😂',
    rofl: '🤣',
    blush: '😊',
    wink: '😉',
    heart_eyes: '😍',
    sob: '😭',
    cry: '😢',
    thinking: '🤔',
    sunglasses: '😎',
    sleepy: '😴',
    nerd: '🤓',
    hugs: '🤗',
    raised_eyebrow: '🤨',
    skull: '💀',
    ghost: '👻',
    alien: '👽',
    robot: '🤖',
    poop: '💩',
    fire: '🔥',
    sparkles: '✨',
    star: '⭐',
    boom: '💥',
    rocket: '🚀',
    tada: '🎉',
    confetti_ball: '🎊',
    balloon: '🎈',
    gift: '🎁',
    medal: '🏅',
    trophy: '🏆',
    crown: '👑',
    rainbow: '🌈',
    sun: '☀️',
    cloud: '☁️',
    umbrella: '☂️',
    snowflake: '❄️',
    snowman: '⛄',
    zap: '⚡',
    bug: '🐛',
    ant: '🐜',
    bee: '🐝',
    spider: '🕷️',
    snake: '🐍',
    panda_face: '🐼',
    cat: '🐱',
    dog: '🐶',
    fox_face: '🦊',
    unicorn: '🦄',
    apple: '🍎',
    banana: '🍌',
    cherries: '🍒',
    grapes: '🍇',
    coffee: '☕',
    tea: '🍵',
    beer: '🍺',
    wine_glass: '🍷',
    pizza: '🍕',
    cookie: '🍪',
    cake: '🍰',
    earth_americas: '🌎',
    earth_africa: '🌍',
    earth_asia: '🌏',
    moon: '🌙',
    new_moon: '🌑',
    full_moon: '🌕',
    house: '🏠',
    school: '🏫',
    office: '🏢',
    hospital: '🏥',
    car: '🚗',
    bus: '🚌',
    plane: '✈️',
    book: '📖',
    books: '📚',
    pencil: '✏️',
    memo: '📝',
    page_facing_up: '📄',
    pushpin: '📌',
    paperclip: '📎',
    scissors: '✂️',
    lock: '🔒',
    unlock: '🔓',
    key: '🔑',
    bell: '🔔',
    no_entry: '⛔',
    warning: '⚠️',
    no_entry_sign: '🚫',
    construction: '🚧',
    white_check_mark: '✅',
    heavy_check_mark: '✔️',
    x: '❌',
    heavy_multiplication_x: '✖️',
    question: '❓',
    grey_question: '❔',
    exclamation: '❗',
    grey_exclamation: '❕',
    heart: '❤️',
    yellow_heart: '💛',
    green_heart: '💚',
    blue_heart: '💙',
    purple_heart: '💜',
    broken_heart: '💔',
    thumbsup: '👍',
    thumbsdown: '👎',
    '+1': '👍',
    '-1': '👎',
    ok_hand: '👌',
    raised_hands: '🙌',
    clap: '👏',
    pray: '🙏',
    muscle: '💪',
    eyes: '👀',
    speech_balloon: '💬',
    bulb: '💡',
    hammer_and_wrench: '🛠️',
    wrench: '🔧',
    hammer: '🔨',
    gear: '⚙️',
    package: '📦',
    truck: '🚚',
  }),
);

export function normalizeStandardEmoji(source: string): string {
  return splitPreserving(source, FENCED_CODE_PATTERN)
    .map((part) => {
      if (FENCED_CODE_PATTERN.test(part)) return part;
      return splitPreserving(part, INLINE_CODE_PATTERN)
        .map((p) => (INLINE_CODE_PATTERN.test(p) ? p : replaceInPart(p)))
        .join('');
    })
    .join('');
}

function replaceInPart(part: string): string {
  return part.replace(SHORTCODE_PATTERN, (match, name: string) => {
    if (ICON_PREFIX_PATTERN.test(name)) return match;
    const glyph = EMOJI_TABLE.get(name);
    return glyph ?? match;
  });
}

function splitPreserving(source: string, pattern: RegExp): string[] {
  const parts: string[] = [];
  let cursor = 0;
  const local = new RegExp(pattern.source, pattern.flags);
  let m: RegExpExecArray | null = local.exec(source);
  while (m !== null) {
    if (m.index > cursor) parts.push(source.slice(cursor, m.index));
    parts.push(m[0]);
    cursor = m.index + m[0].length;
    m = local.exec(source);
  }
  if (cursor < source.length) parts.push(source.slice(cursor));
  return parts;
}
