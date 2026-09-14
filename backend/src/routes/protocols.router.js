import { Router } from "express";
import { createProtocol, listProtocols, getProtocolById, updateProtocol } from "../controllers/protocols.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = Router();

router.post('/protocols', authMiddleware, createProtocol);
router.get('/protocols', authMiddleware, listProtocols);
router.get('/protocols/:id', authMiddleware, getProtocolById);
router.patch('/protocols/:id', authMiddleware, updateProtocol);

export default router;