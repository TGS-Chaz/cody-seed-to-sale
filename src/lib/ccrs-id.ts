/**
 * CCRS external IDs are 17 numeric characters:
 *   - First 4 chars:  location code (default '0001')
 *   - Next  8 chars:  timestamp-derived (sortable)
 *   - Last  5 chars:  random sequence
 *
 * Required by Washington State Cannabis Compliance Reporting System (CCRS)
 * for every Strain, Area, Product, and Plant record.
 */
export function generateExternalId(locationCode: string = "0001"): string {
  const timestamp = Date.now().toString().slice(-8).padStart(8, "0");
  const sequence = Math.floor(Math.random() * 99999).toString().padStart(5, "0");
  return `${locationCode}${timestamp}${sequence}`;
}

export function parseExternalId(externalId: string): {
  locationCode: string;
  timestamp: string;
  sequence: string;
} {
  return {
    locationCode: externalId.slice(0, 4),
    timestamp: externalId.slice(4, 12),
    sequence: externalId.slice(12, 17),
  };
}
