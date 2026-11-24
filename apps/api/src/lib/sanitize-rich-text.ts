import sanitizeHtml from 'sanitize-html'

/**
 * What the quote's rich-text modules (TipTap) may contain — headings, basic formatting, lists,
 * links, rules and pasted images — with anything else (scripts, event handlers, styles other
 * than text alignment) stripped. The printed quote renders this HTML as-is, so it must be safe
 * before it is stored.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'h1', 'h2', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'ul', 'ol', 'li', 'a', 'hr', 'img', 'span'],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt'],
    p: ['style'],
    h1: ['style'],
    h2: ['style'],
  },
  allowedStyles: {
    '*': { 'text-align': [/^(left|right|center|justify)$/] },
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['data', 'https'] },
  // Pasted images are data URLs; only images, never e.g. data:text/html.
  exclusiveFilter: (frame) => frame.tag === 'img' && /^data:/i.test(frame.attribs.src ?? '') && !/^data:image\/(png|jpe?g|gif|webp);/i.test(frame.attribs.src ?? ''),
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
  },
}

export const sanitizeRichText = (html: string): string => sanitizeHtml(html, OPTIONS)
