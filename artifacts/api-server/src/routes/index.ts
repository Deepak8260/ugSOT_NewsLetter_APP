import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storageRouter from "./storage";
import authRouter from "./auth";
import employeesRouter from "./employees";
import newslettersRouter from "./newsletters";
import emailLogsRouter from "./emailLogs";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(authRouter);
router.use(employeesRouter);
router.use(newslettersRouter);
router.use(emailLogsRouter);
router.use(dashboardRouter);

export default router;
