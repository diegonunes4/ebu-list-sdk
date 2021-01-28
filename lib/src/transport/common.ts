import FormData from 'form-data';
import http from 'http';
import https from 'https';
import { StringDecoder } from 'string_decoder';
import { URL } from './detail/url';
import logger from '../logger';

// ////////////////////////////////////////////////////////////////////////////

export type TokenGetter = () => string;

export interface ITransportError extends Error {
    readonly code: number;
}

export class TransportError implements ITransportError {
    public readonly code: number;

    public readonly message: string;

    public readonly name = 'TransportError';

    public constructor(res: http.IncomingMessage) {
        this.code = res.statusCode || 0;
        this.message = res.statusMessage || '';
    }
}

declare type resolver = (value?: any | PromiseLike<any>) => void;
declare type rejector = (reason?: any) => void;
declare type promiseExecutor = (
    resolve: (value?: object | PromiseLike<object>) => void,
    reject: (reason?: any) => void
) => void;

interface IRequestOptionsExt extends http.RequestOptions {
    rejectUnauthorized?: boolean;
}

const makeRequest = (
    u: string,
    options: http.RequestOptions,
    callback: (res: http.IncomingMessage) => void
): http.ClientRequest => {
    const url = new URL(u);

    const o = { ...options };
    o.protocol = url.protocol;
    o.hostname = url.hostname;
    o.port = url.port;
    o.path = url.pathname;

    if (o.protocol === 'https:') {
        return https.request(o, callback);
    }

    return http.request(o, callback);
};

const checkStatusCode = (code: number | undefined): boolean => {
    if (code === undefined) {
        return false;
    }

    return code >= 200 && code < 400;
};

const handleHttpResponse = (res: http.IncomingMessage, resolve: resolver, reject: rejector): void => {
    if (!checkStatusCode(res.statusCode)) {
        reject(new TransportError(res));
    }

    let body = '';
    const decoder: StringDecoder = new StringDecoder('utf8');
    res.on('data', (data: Buffer) => {
        body += decoder.write(data);
    });
    res.on('end', () => {
        if (body === '') {
            resolve({});
        } else {
            try {
                resolve(JSON.parse(body));
            } catch (err) {
                reject(err);
            }
        }
    });
    res.on('error', reject);
};

export async function post(baseUrl: string, authToken: string | null, endpoint: string, data: object): Promise<any> {
    const payload: string = JSON.stringify(data);

    const headers: http.OutgoingHttpHeaders = {
        'Content-Length': Buffer.byteLength(payload),
        'Content-Type': 'application/json;charset=UTF-8',
    };

    if (authToken !== null) {
        headers.Authorization = `Bearer ${authToken}`;
    }

    const options: IRequestOptionsExt = {
        headers,
        method: 'POST',
        rejectUnauthorized: false,
    };

    return new Promise((resolve, reject): void => {
        const callback = (res: http.IncomingMessage): void => handleHttpResponse(res, resolve, reject);
        const req: http.ClientRequest = makeRequest(`${baseUrl}${endpoint}`, options, callback);
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

export async function get(baseUrl: string, authToken: string, endpoint: string): Promise<any> {
    const headers: http.OutgoingHttpHeaders = {
        Authorization: `Bearer ${authToken}`,
    };

    const options = {
        headers,
        method: 'GET',
        rejectUnauthorized: false,
    };

    return new Promise((resolve, reject): void => {
        const callback = (res: http.IncomingMessage): void => handleHttpResponse(res, resolve, reject);
        const req: http.ClientRequest = makeRequest(`${baseUrl}${endpoint}`, options, callback);
        req.on('error', reject);
        req.end();
    });
}

export interface IPutEntry {
    name: string;
    value: string | any; // fs.ReadStream;
}

export async function putForm(
    baseUrl: string,
    authToken: string | null,
    endpoint: string,
    entries: IPutEntry[]
): Promise<any> {
    return new Promise((resolve, reject): void => {
        const form = new FormData();

        entries.forEach(entry => form.append(entry.name, entry.value));

        const headers: http.OutgoingHttpHeaders = {
            ...form.getHeaders(),
        };

        if (authToken !== null) {
            headers.Authorization = `Bearer ${authToken}`;
        }

        const options: IRequestOptionsExt = {
            headers,
            method: 'PUT',
            rejectUnauthorized: false,
        };

        const callback = (res: http.IncomingMessage): void => handleHttpResponse(res, resolve, reject);
        const req: http.ClientRequest = makeRequest(`${baseUrl}${endpoint}`, options, callback);
        form.pipe(req);
        req.on('error', err => {
            logger.error(`req.on('error') ${JSON.stringify(err)}`);
            reject(err);
        });
        req.on('response', res => handleHttpResponse(res, resolve, reject));
    });
}

export async function del(baseUrl: string, authToken: string, endpoint: string): Promise<void> {
    const headers: http.OutgoingHttpHeaders = {
        Authorization: `Bearer ${authToken}`,
    };

    const options = {
        headers,
        method: 'DELETE',
        rejectUnauthorized: false,
    };

    return new Promise((resolve, reject): void => {
        const callback = (res: http.IncomingMessage): void => handleHttpResponse(res, resolve, reject);
        const req: http.ClientRequest = makeRequest(`${baseUrl}${endpoint}`, options, callback);
        req.on('error', reject);
        req.end();
    });
}

declare interface IResponseBase {
    result: number;
    success: boolean;
}

function isResponse(object: any): object is IResponseBase {
    return 'result' in object || 'success' in object;
}

export const validateResponseCode = (res: any): void => {
    if (!res) {
        throw new Error(`Failed: ${JSON.stringify(res)}`);
    }

    if (!isResponse(res)) {
        throw new Error(`Failed: ${JSON.stringify(res)}`);
    }

    const r: IResponseBase = res as IResponseBase;

    if (r.result !== 0 && r.success !== true) {
        throw new Error(`Failed: ${JSON.stringify(res)}`);
    }
};

export interface IWSMessage {
    event: string;
    data: any;
}
