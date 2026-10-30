import { ipKeyGenerator, rateLimit } from 'express-rate-limit'
export const limiter = {
    register: rateLimit({
        windowMs: 30 * 60 * 1000,
        limit: 3,
        keyGenerator: (req) => {
            return req.signedCookies.sid || ipKeyGenerator(req.ip)
        },
    }),
    login: rateLimit({
        windowMs: 30 * 60 * 1000,
        limit: 20,
        keyGenerator: (req) => {
            return req.signedCookies.sid || ipKeyGenerator(req.ip)
        },
    }),
    getUser: rateLimit({
        windowMs: 5 * 1000,
        limit: 5,
        keyGenerator: (req) => {
            return req.signedCookies.sid
        },
    }),

}