import { Router } from "express";
import { createProtocol  } from "../controllers/protocols.controller.js";

const router = Router();

router.post('/protocols', createProtocol);

export default router;


