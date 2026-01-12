// Random Nickname Generator
const adjectives = [
    'Happy', 'Swift', 'Brave', 'Clever', 'Gentle',
    'Bright', 'Cool', 'Wild', 'Smart', 'Lucky',
    'Mighty', 'Noble', 'Quiet', 'Rapid', 'Sunny'
];

const nouns = [
    'Panda', 'Tiger', 'Eagle', 'Fox', 'Wolf',
    'Bear', 'Lion', 'Hawk', 'Dragon', 'Phoenix',
    'Falcon', 'Raven', 'Otter', 'Lynx', 'Deer'
];

export function generateRandomNickname() {
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(Math.random() * 100);
    return `${adj} ${noun} ${num}`;
}

export function validateNickname(nickname) {
    if (!nickname || nickname.trim().length === 0) {
        return { valid: false, error: 'Nickname cannot be empty' };
    }

    if (nickname.length > 30) {
        return { valid: false, error: 'Nickname must be 30 characters or less' };
    }

    // Allow letters, numbers, spaces, and basic punctuation
    const validPattern = /^[a-zA-Z0-9\s\-_]+$/;
    if (!validPattern.test(nickname)) {
        return { valid: false, error: 'Nickname can only contain letters, numbers, spaces, hyphens, and underscores' };
    }

    return { valid: true };
}
