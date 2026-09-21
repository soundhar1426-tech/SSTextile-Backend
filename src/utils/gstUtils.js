export const INDIAN_STATE_GST_CODES = {
  'jammu and kashmir': '01',
  'himachal pradesh': '02',
  'punjab': '03',
  'chandigarh': '04',
  'uttarakhand': '05',
  'haryana': '06',
  'delhi': '07',
  'rajasthan': '08',
  'uttar pradesh': '09',
  'bihar': '10',
  'sikkim': '11',
  'arunachal pradesh': '12',
  'nagaland': '13',
  'manipur': '14',
  'mizoram': '15',
  'tripura': '16',
  'meghalaya': '17',
  'assam': '18',
  'west bengal': '19',
  'jharkhand': '20',
  'odisha': '21',
  'chhattisgarh': '22',
  'madhya pradesh': '23',
  'gujarat': '24',
  'daman and diu': '25',
  'dadra and nagar haveli': '26',
  'maharashtra': '27',
  'andhra pradesh (old)': '28',
  'karnataka': '29',
  'goa': '30',
  'lakshadweep': '31',
  'kerala': '32',
  'tamil nadu': '33',
  'tamilnadu': '33',
  'puducherry': '34',
  'pondicherry': '34',
  'andaman and nicobar islands': '35',
  'telangana': '36',
  'andhra pradesh': '37',
  'ladakh': '38',
  'tn': '33',
  'ka': '29',
  'kl': '32',
  'ap': '37',
  'ts': '36',
  'mh': '27',
  'dl': '07',
  'gj': '24',
  'rj': '08',
  'up': '09',
  'wb': '19',
  'pb': '03',
  'hr': '06',
  'mp': '23',
  'py': '34',
};

/**
 * Helper to reliably resolve 2-digit GST state code
 */
export function resolveGSTStateCode(stateName, gstin) {
  // 1. If GSTIN is provided, first two digits are the official GST code
  if (gstin && String(gstin).trim().length >= 2) {
    const firstTwo = String(gstin).trim().slice(0, 2);
    if (!isNaN(firstTwo) && Number(firstTwo) >= 1 && Number(firstTwo) <= 38) {
      return firstTwo.padStart(2, '0');
    }
  }

  // 2. If stateName is provided
  if (!stateName) return '33';
  const str = String(stateName).trim();

  // 3. If stateName itself contains a 2-digit number (e.g. '33' or '29' or 'Tamil Nadu (33)')
  const digitsMatch = str.match(/\b([0-3][0-9])\b/);
  if (digitsMatch) {
    const num = Number(digitsMatch[1]);
    if (num >= 1 && num <= 38) {
      return digitsMatch[1].padStart(2, '0');
    }
  }

  // 4. Match state name against dictionary
  const clean = str.toLowerCase().replace(/[^a-z]/g, '');
  if (INDIAN_STATE_GST_CODES[clean]) {
    return INDIAN_STATE_GST_CODES[clean];
  }

  for (const [key, code] of Object.entries(INDIAN_STATE_GST_CODES)) {
    const cleanKey = key.replace(/[^a-z]/g, '');
    if (clean.includes(cleanKey) || cleanKey.includes(clean)) {
      return code;
    }
  }

  return '33';
}
