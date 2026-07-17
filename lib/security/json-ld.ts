// ============================================================
// Safe JSON-LD serialization — the SINGLE place structured data is turned
// into the string handed to dangerouslySetInnerHTML.
//
// WHY THIS EXISTS
// ---------------
// JSON.stringify escapes `"` and `\`, but NOT `<`, `>` or `&`. The HTML parser
// terminates a <script> element at the first literal `</script>` regardless of
// JavaScript string context, so any user-controlled value inside a JSON-LD block
// could close the script early and inject live markup:
//
//   bio = '</script><script>...</script>'
//   -> <script type="application/ld+json">{"description":"</script><script>...
//                                                         ^ script ends HERE
//
// That was a stored XSS reachable from `full_name` / `bio` (self-editable by any
// registered user, rendered on the public /u/[username] page) and from campaign
// `title` / `description`.
//
// THE FIX
// -------
// Escape the characters that can break out of the element into their JSON
// unicode escapes. `<` is byte-identical to `<` for any JSON parser -- so
// Google and every other consumer read exactly the same structured data -- but
// it cannot terminate a script element.
//
// Escaping at the SINK is what makes this complete: it holds for every field,
// including ones added later, without relying on any caller to remember to
// sanitize its input.
//
// SCOPE NOTE
// ----------
// U+2028 / U+2029 are deliberately NOT handled here. They matter only when JSON
// is inlined into *executable* JavaScript (e.g. `window.__DATA__ = {...}`),
// where they act as line terminators. The contents of an
// `application/ld+json` block are never executed as JS -- consumers parse them
// as JSON, where both characters are legal inside a string. If JSON is ever
// inlined into executable JS elsewhere, that sink needs its own serializer;
// do not widen this one on speculation.
// ============================================================

/**
 * Characters that can terminate or alter the enclosing <script> element,
 * mapped to their JSON unicode escapes -- semantically identical to the
 * original character, inert to the HTML parser.
 */
const ESCAPES: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
};

const UNSAFE = /[<>&]/g;

/**
 * Serialize a JSON-LD object for injection into
 * `<script type="application/ld+json">`.
 *
 * Use this INSTEAD OF JSON.stringify at every JSON-LD site. Never inject
 * structured data with a bare JSON.stringify.
 *
 *   <script
 *     type="application/ld+json"
 *     dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
 *   />
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(UNSAFE, (c) => ESCAPES[c]!);
}
