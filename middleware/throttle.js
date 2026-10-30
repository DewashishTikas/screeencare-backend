const throttleObj = {}

export const throttleResponse = (waitTime = 2000) => {
    return (req, res, next) => {
        const now = Date.now()
        const { prevDelay, lastRequestTime } = throttleObj[req.signedCookies.sid || req.ip] || {
            prevDelay: 0,
            lastRequestTime: now - waitTime
        }
        const timePassed = now - lastRequestTime
        const delay = Math.max(0, waitTime + prevDelay - timePassed)
        throttleObj[req.signedCookies.sid || req.ip] = {
            prevDelay: delay,
            lastRequestTime: now
        }
        setTimeout(next, delay)
    }
}