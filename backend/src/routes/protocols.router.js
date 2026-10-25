import { Router } from "express";
import { createProtocol, listProtocols, getProtocolById, updateProtocol, createProtocolIp, listProtocolIps, listProtocolEquipment, createProtocolEquipment, createProtocolCommunication, listProtocolCommunications, listProtocolChecklist, createProtocolChecklistItem, updateProtocolChecklistItem } from "../controllers/protocols.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = Router();

router.post('/protocols', authMiddleware, createProtocol);
router.get('/protocols', authMiddleware, listProtocols);
router.get('/protocols/:id', authMiddleware, getProtocolById);
router.patch('/protocols/:id', authMiddleware, updateProtocol);
router.post('/protocols/:id/ips', authMiddleware, createProtocolIp);
router.get('/protocols/:id/ips', authMiddleware, listProtocolIps);
router.get('/protocols/:id/equipamentos', authMiddleware, listProtocolEquipment);
router.post('/protocols/:id/equipamentos', authMiddleware, createProtocolEquipment);
router.post('/protocols/:id/comunicacoes', authMiddleware, createProtocolCommunication);
router.get('/protocols/:id/comunicacoes', authMiddleware, listProtocolCommunications);
router.get('/protocols/:id/checklist', authMiddleware, listProtocolChecklist);
router.post('/protocols/:id/checklist', authMiddleware, createProtocolChecklistItem);
router.patch('/protocols/:id/checklist/:itemId', authMiddleware, updateProtocolChecklistItem);

export default router;