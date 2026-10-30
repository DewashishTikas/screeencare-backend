import express from 'express'
import {  googleCallbackLoginController, googleImplicitLoginController, googleLoginController, loginController, logoutAllController, logoutController, registerContoller, userDetailController } from '../controllers/authController.js';
import { validateUser } from '../middleware/validateUser.js';
import { limiter } from '../middleware/rateLimiting.js';
import { throttleResponse } from '../middleware/throttle.js';

const router = express.Router()

router.get('/', limiter.getUser, throttleResponse(500), validateUser, userDetailController)
router.post('/register', limiter.register, throttleResponse(), registerContoller)
router.post('/login', limiter.login, throttleResponse(), loginController)
router.post("/logout", limiter.login, throttleResponse(), validateUser, logoutController)
router.post("/logout-all", limiter.login, throttleResponse(), validateUser, logoutAllController)
// Google
router.post('/googleImplicit', limiter.login, throttleResponse(), googleImplicitLoginController)
router.get('/google', googleLoginController)
router.get('/google/callback', googleCallbackLoginController)

export default router; 