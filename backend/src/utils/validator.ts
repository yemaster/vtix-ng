const defaultBlacklist = new Set(["admin", "administrator", "root", "system", "test"]);

export function validateUsername(username: string, blacklist: Set<string> = defaultBlacklist) {
    if (!username) {
        throw new Error('Missing username');
    }

    if (username.length < 4 || username.length > 10) {
        throw new Error('Invalid username length');
    }

    // Username can only be alphanumeric and must start with a letter
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(username)) {
        throw new Error('Invalid username format');
    }

    // Case-insensitive blacklist check
    if (blacklist.has(username.toLowerCase())) {
        throw new Error('Invalid username format');
    }
}

export function validatePassword(password: string) {
    if (!password) {
        throw new Error('Missing password');
    }

    if (password.length < 6 || password.length > 30) {
        throw new Error('Invalid password length');
    }

    //密码只能是字母和数字和特殊字符
    if (!/^[a-zA-Z0-9!@#$%^&*()_+-=]*$/.test(password)) {
        throw new Error('Invalid password format');
    }
}