import { AsyncLocalStorage } from 'node:async_hooks';

// Per-request values that layout() needs but that view functions are not handed:
// the current URL (so a no-JS form can redirect back) and the revision this
// browser last downloaded (so the backup banner can ask whether it saved).
// Filled by an onRequest hook in server.js; empty outside a request.
const store = new AsyncLocalStorage();

export const runInRequest = (values, next) => store.run(values, next);
export const requestValues = () => store.getStore() ?? {};
