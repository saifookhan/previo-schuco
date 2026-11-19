/** Euro amounts the Italian way ("1.365,70 €"), as the quotes and their PDF show them. */
export const EUR = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })

/** A figure with two decimals and Italian separators ("1.365,70"), for calculations shown next to each other. */
export const DECIMAL = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
