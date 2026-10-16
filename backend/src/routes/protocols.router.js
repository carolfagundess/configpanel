import { Router } from "express";
import { createProtocol, listProtocols, getProtocolById, updateProtocol, createProtocolIp, listProtocolIps } from "../controllers/protocols.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = Router();

router.post('/protocols', authMiddleware, createProtocol);
router.get('/protocols', authMiddleware, listProtocols);
router.get('/protocols/:id', authMiddleware, getProtocolById);
router.patch('/protocols/:id', authMiddleware, updateProtocol);
router.post('/protocols/:id/ips', authMiddleware, createProtocolIp);
router.get('/protocols/:id/ips', authMiddleware, listProtocolIps);

export default router;