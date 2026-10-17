"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportsRouter = void 0;
const express_1 = require("express");
const database_1 = require("../db/database");
const reportJob_1 = require("../services/reportJob");
exports.reportsRouter = (0, express_1.Router)();
/**
 * GET /api/reports/weekly
 * Fetch the latest weekly report, or automatically generate one if no reports exist
 */
exports.reportsRouter.get('/weekly', async (_req, res) => {
    try {
        let latestReport = database_1.dbOperations.getLatestReport();
        if (!latestReport) {
            // Auto-generate initial report if database is empty
            latestReport = await (0, reportJob_1.generateWeeklyReport)();
        }
        res.json(latestReport);
    }
    catch (err) {
        console.error('Error in GET /api/reports/weekly:', err);
        res.status(500).json({ error: 'Failed to retrieve weekly report', details: err?.message });
    }
});
/**
 * POST /api/reports/generate
 * On-demand generation of a weekly report
 */
exports.reportsRouter.post('/generate', async (_req, res) => {
    try {
        const newReport = await (0, reportJob_1.generateWeeklyReport)();
        res.status(201).json(newReport);
    }
    catch (err) {
        console.error('Error in POST /api/reports/generate:', err);
        res.status(500).json({ error: 'Failed to generate report', details: err?.message });
    }
});
