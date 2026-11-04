/**
 * Formats a number as EUR currency matching the demo locale style.
 */
export const formatCurrency = (amount: number, locale: string): string => {
  return new Intl.NumberFormat(locale === 'de' ? 'de-DE' : locale === 'en' ? 'en-GB' : 'it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}
