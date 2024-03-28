export type ReqStatus =
    | { type: 'working' }
    | { type: 'idle' }
    | { type: 'error'; message: string };
