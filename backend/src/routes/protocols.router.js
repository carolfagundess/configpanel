import { Router } from "express";
import { createProtocol, listProtocols, getProtocolById } from "../controllers/protocols.controller.js";

const router = Router();

router.post('/protocols', createProtocol);
router.get('/protocols', listProtocols);
router.get('/protocols/:id', getProtocolById);

export default router;