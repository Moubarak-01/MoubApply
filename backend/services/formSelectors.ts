/**
 * Common regex patterns and selectors for job application forms.
 */

export const FIELD_PATTERNS = {
    // Contact Info
    firstName: /first\s*name|given\s*name/i,
    lastName: /last\s*name|family\s*name|surname/i,
    email: /email|e-mail/i,
    phone: /phone|mobile|cell/i,
    address: /address|street/i,
    city: /city|town/i,
    state: /state|province/i,
    zip: /zip|postal\s*code/i,
    linkedin: /linkedin/i,
    website: /website|portfolio|url/i,

    // Education / Experience
    school: /school|university|college|institution/i,
    degree: /degree|qualification/i,
    discipline: /major|discipline|field\s*of\s*study/i,
    gpa: /gpa|grade\s*point/i,
    startDate: /start\s*date/i,
    endDate: /end\s*date/i,

    // Questions
    workAuth: /authorized\s*to\s*work|legal\s*right\s*to\s*work|eligibility/i,
    sponsorship: /sponsorship|assistance\s*with\s*work\s*authorization|visa\s*sponsorship/i,
    salary: /salary|compensation|pay|rate|expectations/i,
    remote: /remote|work\s*from\s*home|location\s*preference/i,

    // Education / Student Status
    isStudent: /currently\s*enrolled|are\s*you\s*a\s*student/i,
    degreeLevel: /pursuing\s*a\s*degree|degree\s*level|highest\s*education/i,
    gradDate: /graduation\s*date|expected\s*graduation/i,

    // Demographics
    gender: /gender|sex/i,
    race: /race|ethnicity|origin/i,
    veteran: /veteran/i,
    disability: /disability/i,

    // Buttons
    submit: /submit|apply|send\s*application/i,
    next: /next|continue|proceed/i,
    review: /review/i
};

export const COMMON_SELECTORS = {
    textInput: 'input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input:not([type])',
    fileInput: 'input[type="file"]',
    submitBtn: 'button[type="submit"], input[type="submit"]',
    dropdown: 'select',
    radio: 'input[type="radio"]',
    checkbox: 'input[type="checkbox"]'
};

/**
 * Calculates Levenshtein distance between two strings.
 * Used for fuzzy matching dropdown options.
 */
const levenshtein = (a: string, b: string): number => {
    const matrix = [];

    // Increment along the first column of each row
    let i;
    for (i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    // Increment each column in the first row
    let j;
    for (j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    // Fill in the rest of the matrix
    for (i = 1; i <= b.length; i++) {
        for (j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) == a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, // substitution
                    Math.min(matrix[i][j - 1] + 1, // insertion
                        matrix[i - 1][j] + 1)); // deletion
            }
        }
    }

    return matrix[b.length][a.length];
};

/**
 * Finds the best match for a user's value in a list of dropdown options.
 * @param options List of option text strings
 * @param userValue The value we want to select
 * @param threshold Max edit distance allowed (default 3)
 */
export const fuzzyMatchOption = (options: string[], userValue: string, threshold: number = 4): string | null => {
    if (!userValue || !options.length) return null;

    const userLower = userValue.toLowerCase();

    // 1. Exact Match (Case Insensitive)
    const exact = options.find(o => o.toLowerCase().trim() === userLower.trim());
    if (exact) return exact;

    // 2. Contains Match
    const contains = options.find(o => o.toLowerCase().includes(userLower) || userLower.includes(o.toLowerCase()));
    if (contains) return contains;

    // 3. Levenshtein Distance
    let bestMatch: string | null = null;
    let minDist = Infinity;

    for (const opt of options) {
        const dist = levenshtein(userLower, opt.toLowerCase());
        if (dist < minDist && dist <= threshold) {
            minDist = dist;
            bestMatch = opt;
        }
    }

    return bestMatch;
};
