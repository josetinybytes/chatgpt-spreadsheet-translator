
class Semaphore {
    constructor(max) {
        this.max = max;
        this.counter = 0;
        this.waiting = [];
    }

    acquire() {
        if (this.counter < this.max) {
            this.counter++;
            return Promise.resolve();
        } else {
            return new Promise(resolve => this.waiting.push(resolve));
        }
    }

    release() {
        this.counter--;
        if (this.waiting.length > 0 && this.counter < this.max) {
            this.counter++;
            let nextResolve = this.waiting.shift();
            nextResolve();
        }
    }

    purge() {
        let unresolvedPromises = this.waiting.length;
        for (let i = 0; i < unresolvedPromises; i++) {
            this.waiting[i]();
        }
        this.waiting = [];
        this.counter = 0;
    }
}


/**
 * Executes a function with retry logic.
 * If the function fails, it retries a specified number of times with a delay between each attempt.
 * @param {Function} fn - The function to execute.
 * @param {number} [retries=3] - The number of times to retry.
 * @param {number} [delay=1000] - The delay in milliseconds between retries.
 * @returns {Promise<*>} - The promise that resolves to the function's return value.
 * @throws {Error} - Throws an error if all retries fail.
 */
async function withRetry(fn, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (e) {
            console.log(`Attempt ${i + 1} failed. Retrying...`);
            console.log(e);
            if (i < retries - 1) await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw new Error('All retries failed');
}





module.exports = { Semaphore, withRetry };